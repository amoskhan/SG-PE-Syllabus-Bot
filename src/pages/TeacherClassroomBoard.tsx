import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  getAllSubmissions,
  PairSubmissionRecord,
  updateSubmissionStatus,
  deleteSubmission,
} from '../services/offline/offlineStorage';
import {
  fetchTeacherSubmissions,
  updateCloudSubmissionStatus,
  updateCloudSubmissionFeedback,
  deleteCloudSubmission,
  backupSubmissionToSupabase,
  fetchPairCheckIns,
  deletePairCheckIn,
  PairCheckInRow,
  getPlayableVideoUrl,
} from '../services/cloudSyncService';
import {
  Lesson,
  LessonDraft,
  LessonKeys,
  fetchLessons,
  createLesson,
  updateLesson,
  deleteLesson,
  lessonTitle,
  getCurrentLessonId,
  setCurrentLessonId,
  getLocalLessonNames,
} from '../services/lessonService';
import { LessonPlanForm, LessonList } from '../components/classroom/LessonPlanner';
import { mediaPaths, removeTeachMedia } from '../services/teachMediaService';
import { PairAssignment } from '../components/classroom/PairAssignment';
import TeacherReviewPanel from '../components/dashboard/TeacherReviewPanel';
import { effectiveLevel, normaliseLevel } from '../utils/gradingReview';
import { LessonStep, currentIndex, stepLabel } from '../utils/lessonFlow';
import type { StepRef } from '../services/offline/offlineStorage';
import { performerLock } from '../utils/submissionLock';
import { Student, SkillAnalysis } from '../types';
import { getStudents } from '../services/studentService';
import {
  PairSlot,
  Performer,
  fetchPairSlots,
  fetchSubmissionGradings,
  sameClass,
  setPairSlot,
  slotKey,
} from '../services/pairService';

/** What a pupil's phone needs to join a lesson — the same data the class QR carries. */
export interface BoardLessonLink {
  lessonId: string;
  title: string;
  skillName: string;
  pairCount: number;
  pass: string; // lesson pass — pupils' writes are refused without it
}

interface TeacherClassroomBoardProps {
  onOpenChat: () => void;
  teacherId?: string; // Signed-in teacher's Supabase UUID — embedded in QR so students upload to their bucket
}

// Submissions made before lessons existed all share this id
const LEGACY_LESSON_ID = 'pe-lesson-today';

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });

const VideoBlobPlayer: React.FC<{ blob?: Blob; videoUrl?: string; performer: string }> = ({
  blob,
  videoUrl,
  performer,
}) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    } else if (videoUrl) {
      // Uploaded clips are private — swap the stored address for a 1-hour signed link
      let cancelled = false;
      setUrl(null);
      getPlayableVideoUrl(videoUrl).then((playable) => {
        if (!cancelled) setUrl(playable);
      });
      return () => {
        cancelled = true;
      };
    } else {
      setUrl(null);
    }
  }, [blob, videoUrl]);

  if (!url) {
    return (
      <div className="w-full aspect-video bg-slate-900/40 dark:bg-zinc-900/60 rounded-xl flex flex-col items-center justify-center text-slate-400 my-2 border border-dashed border-slate-300 dark:border-zinc-700 p-3 text-center">
        <span className="text-xl mb-1">📹</span>
        <span className="text-[11px]">No video recorded for {performer}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden my-2 border border-slate-700 shadow-md">
      <video
        src={url}
        controls
        playsInline
        className="w-full h-full object-contain"
      />
    </div>
  );
};

const STEP_ICON = (s: LessonStep) =>
  s.kind === 'teach' ? '👀' : s.kind === 'practise' ? '🏃' : s.assess?.method === 'ai_analysis' ? '🤖' : '📋';

/** Where a pair is in the lesson (#91): a step index, 'finished', or null before it reports. */
const pairStepAt = (steps: LessonStep[], ci?: PairCheckInRow): number | 'finished' | null => {
  if (!ci) return null;
  if (ci.step_finished) return 'finished';
  if (!ci.step_id && ci.step_index == null) return null;
  return currentIndex(steps, { stepId: ci.step_id ?? undefined, index: ci.step_index ?? 0 });
};

/** Whether a performer's video in the tray is their final one (#86, Submit final is the pupil's choice). */
const AttemptStatus: React.FC<{ sentAt?: string; redoRequestedAt?: string; hasVideo: boolean }> = ({ sentAt, redoRequestedAt, hasVideo }) => {
  const lock = performerLock(sentAt, redoRequestedAt);
  const [text, tone] = lock === 'locked'
    ? ['✅ Final', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300']
    : lock === 'redo_requested'
      ? ['🔄 Re-do: not final yet', 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300']
      : hasVideo
        ? ['👀 Peer-assessed, not final yet', 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300']
        : ['Not filmed yet', 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400'];
  return <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${tone}`}>{text}</span>;
};

/** "Step 2 · Peer assessment + Coach Bot", plus the step's skill when it isn't the main skill (#92). */
const StepTag: React.FC<{ step?: StepRef; mainSkill: string }> = ({ step, mainSkill }) =>
  step ? (
    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
      Step {step.number} · {step.label}{step.skillName && step.skillName !== mainSkill ? ` · ${step.skillName}` : ''}
    </span>
  ) : null;

/** Compares what the tray shows of a submission, so a refresh that changed nothing doesn't reset its videos. */
const reviewSignature = (s: PairSubmissionRecord) => JSON.stringify([
  s.appleRole.videoUrl, s.bananaRole.videoUrl, s.appleRole.cues, s.bananaRole.cues,
  s.aiChatAnalysis, s.firstAttempt && { apple: s.firstAttempt.apple?.videoUrl, banana: s.firstAttempt.banana?.videoUrl }, s.peerSteps,
  s.aiTeacherReport?.generatedAt, s.appleSentAt, s.bananaSentAt, s.redoRequestedAt, s.status, s.teacherFeedback, s.teacherStar,
]);

export const TeacherClassroomBoard: React.FC<TeacherClassroomBoardProps> = ({
  onOpenChat,
  teacherId,
}) => {
  const [viewMode, setViewMode] = useState<'PROJECTOR' | 'REVIEW_TRAY' | 'LESSONS' | 'PLAN_LESSON' | 'PAIRS'>('PROJECTOR');

  // Planned lessons (Supabase) and the one on this device's projector
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [currentLessonId, setCurrentLessonIdState] = useState<string | null>(() => getCurrentLessonId(teacherId));
  const lesson = lessons.find((l) => l.id === currentLessonId) ?? null;
  const lessonId = lesson?.id ?? null;
  const localLessonNames = getLocalLessonNames(teacherId);

  const loadLessons = async () => {
    setLessonsLoading(true);
    try {
      setLessons(await fetchLessons());
      setLessonsError(null);
    } catch (e) {
      setLessonsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLessonsLoading(false);
    }
  };

  // Named pairs: who is Apple and Banana in each pair of each lesson
  const [students, setStudents] = useState<Student[]>([]);
  const [pairSlots, setPairSlots] = useState<PairSlot[]>([]);
  const [pairsLessonId, setPairsLessonId] = useState<string | null>(null);
  const pairsLesson = lessons.find((l) => l.id === pairsLessonId) ?? null;

  const loadPairSlots = async () => setPairSlots(await fetchPairSlots());

  // Sign-in can finish after the board mounts — load that teacher's lessons
  useEffect(() => {
    setCurrentLessonIdState(getCurrentLessonId(teacherId));
    if (teacherId) {
      loadLessons();
      getStudents(teacherId).then(setStudents);
      loadPairSlots();
    } else setLessonsLoading(false);
  }, [teacherId]);

  const studentById = new Map<string, Student>(students.map((s) => [s.id, s]));
  const slotStudent = (lessonId: string, pairNumber: number, performer: Performer) => {
    const slot = pairSlots.find(
      (p) => p.lessonId === lessonId && p.pairNumber === pairNumber && p.performer === performer
    );
    return slot ? studentById.get(slot.studentId) : undefined;
  };
  const namedCounts = pairSlots.reduce<Record<string, number>>((acc, p) => {
    acc[p.lessonId] = (acc[p.lessonId] ?? 0) + 1;
    return acc;
  }, {});

  // Review Tray shows every lesson by default so older work can still be marked
  const [reviewLessonFilter, setReviewLessonFilter] = useState<string>('ALL');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [submissions, setSubmissions] = useState<PairSubmissionRecord[]>([]);
  const [activeReviewSub, setActiveReviewSub] = useState<PairSubmissionRecord | null>(null);
  const [teacherFeedbackText, setTeacherFeedbackText] = useState('');
  // Track IDs optimistically deleted so the 3s polling loop doesn't re-add them
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Live pair check-ins, synced from Supabase (students check in on a different device)
  const [checkIns, setCheckIns] = useState<PairCheckInRow[]>([]);
  // Pair numbers the teacher cleared — keyed to checked_in_at so a genuine re-check-in reappears
  const dismissedCheckInsRef = useRef<Map<number, string>>(new Map());

  const lessonLink: BoardLessonLink | null = lesson && {
    lessonId: lesson.id,
    title: `${lessonTitle(lesson)} · ${lesson.skillName}`,
    skillName: lesson.skillName,
    pairCount: lesson.pairCount,
    pass: lesson.pupilPass,
  };

  // Regenerate the class QR whenever the lesson on the projector changes
  useEffect(() => {
    if (!lessonLink) {
      setQrCodeUrl('');
      return;
    }
    const payload = JSON.stringify({
      ...lessonLink,
      teacherId: teacherId ?? null, // ← Seesaw-style: student device uses this to upload to teacher's bucket
    });

    QRCode.toDataURL(payload, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrCodeUrl)
      .catch(console.error);
  }, [lessonId, lessonLink?.title, lessonLink?.pairCount, lessonLink?.pass, teacherId]);

  const showLessonOnProjector = (id: string) => {
    setCurrentLessonId(teacherId, id);
    setCurrentLessonIdState(id);
    setCheckIns([]);
    dismissedCheckInsRef.current.clear();
    setViewMode('PROJECTOR');
  };

  // The lesson being edited in the planner; null = planning a new one
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

  const handleSaveLesson = async (draft: LessonDraft, showNow: boolean, keys?: LessonKeys) => {
    const editing = editingLesson;
    const saved = editing ? await updateLesson(editing.id, draft) : await createLesson(draft, keys);
    setLessons((prev) => (editing ? prev.map((l) => (l.id === saved.id ? saved : l)) : [saved, ...prev]));
    setEditingLesson(null);
    if (showNow) showLessonOnProjector(saved.id);
    else setViewMode('LESSONS');
  };

  const handleDeleteLesson = async (l: Lesson) => {
    const hasWork = submissions.some((s) => s.lessonId === l.id);
    const warning = hasWork
      ? `Delete ${lessonTitle(l)}? Its pupils' submissions stay in the Review Tray, but they will no longer show the lesson name.`
      : `Delete ${lessonTitle(l)}?`;
    if (!confirm(warning)) return;
    try {
      await deleteLesson(l.id);
      removeTeachMedia(mediaPaths(l.steps)); // its Teach step videos and pictures
      setLessons((prev) => prev.filter((x) => x.id !== l.id));
      if (l.id === currentLessonId) {
        setCurrentLessonId(teacherId, null);
        setCurrentLessonIdState(null);
      }
    } catch (e) {
      alert(`Could not delete the lesson: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Load submissions from Supabase Cloud (multi-device) + local IndexedDB
  useEffect(() => {
    loadSubmissions();
    const interval = setInterval(loadSubmissions, 3000);
    return () => clearInterval(interval);
  }, [teacherId, lessonId]);

  const loadSubmissions = async () => {
    const deleted = deletedIdsRef.current;

    const cloudSubs = await fetchTeacherSubmissions(teacherId);
    const localSubs = await getAllSubmissions();

    // Auto-sync any existing local submissions to Supabase cloud if teacher is logged in
    // Skip deleted ones so they don't get re-uploaded
    if (teacherId && localSubs.length > 0) {
      for (const localSub of localSubs) {
        if (!deleted.has(localSub.id) && !cloudSubs.some((c) => c.id === localSub.id)) {
          backupSubmissionToSupabase(localSub, teacherId).catch(console.warn);
        }
      }
    }

    // Merge cloud and local submissions by id (cloud takes precedence for cross-device sync)
    // Exclude any optimistically deleted IDs
    const subMap = new Map<string, PairSubmissionRecord>();
    for (const sub of localSubs) {
      if (!deleted.has(sub.id)) subMap.set(sub.id, sub);
    }
    for (const sub of cloudSubs) {
      if (!deleted.has(sub.id)) subMap.set(sub.id, sub);
    }
    const merged = Array.from(subMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setSubmissions(merged);

    // Live pair check-ins for the Projector grid.
    // Drop any the teacher just cleared — unless a genuinely newer check-in arrived
    // for that pair number (different checked_in_at), in which case the pair is back.
    // Only this lesson's pairs — earlier lessons' check-ins would hold their numbers
    const rows = lessonId ? await fetchPairCheckIns(teacherId, lessonId) : [];
    const dismissed = dismissedCheckInsRef.current;
    const visibleRows = rows.filter((r) => {
      const clearedAt = dismissed.get(r.pair_number);
      if (clearedAt === undefined) return true;
      if (r.checked_in_at !== clearedAt) {
        dismissed.delete(r.pair_number); // a new check-in — stop hiding it
        return true;
      }
      return false;
    });
    setCheckIns(visibleRows);
  };

  const handleClearCheckIn = async (row: PairCheckInRow) => {
    if (!confirm(`Clear Pair #${row.pair_number}'s check-in? They can check in again if needed.`)) return;
    dismissedCheckInsRef.current.set(row.pair_number, row.checked_in_at);
    setCheckIns((prev) => prev.filter((c) => c.pair_number !== row.pair_number));
    await deletePairCheckIn(row.lesson_id || lessonId, row.pair_number);
  };


  const [feedbackSent, setFeedbackSent] = useState(false);

  // The open review follows the 3-second refresh, so new work shows without
  // closing it. The feedback box is separate state, so typing isn't lost.
  useEffect(() => {
    setActiveReviewSub(prev => {
      if (!prev) return prev;
      const fresh = submissions.find(x => x.id === prev.id);
      return fresh && reviewSignature(fresh) !== reviewSignature(prev) ? fresh : prev;
    });
  }, [submissions]);

  // The copies of the open submission's analyses in the pupils' own records:
  // per performer, oldest first (the last is a re-do's, once one is sent, #93)
  const [subGradings, setSubGradings] = useState<Partial<Record<Performer, SkillAnalysis[]>>>({});
  const redoSentKey = `${activeReviewSub?.aiChatAnalysis?.apple?.redo?.submittedAt}|${activeReviewSub?.aiChatAnalysis?.banana?.redo?.submittedAt}`;
  useEffect(() => {
    setSubGradings({});
    if (activeReviewSub && teacherId) fetchSubmissionGradings(activeReviewSub.id).then(setSubGradings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReviewSub?.id, teacherId, redoSentKey]);

  // Name (or re-name) a pupil straight from the tray; the database then files
  // this pair's analysis under them, so re-read the gradings afterwards.
  const assignFromTray = async (sub: PairSubmissionRecord, performer: Performer, studentId: string | null) => {
    await setPairSlot(sub.lessonId, sub.pairNumber, performer, studentId);
    await loadPairSlots();
    setSubGradings(await fetchSubmissionGradings(sub.id));
  };

  const pupilPicker = (sub: PairSubmissionRecord, performer: Performer) => {
    const planned = lessons.find((l) => l.id === sub.lessonId);
    if (!planned) return null; // older submissions have no lesson to attach pairs to
    const current = slotStudent(sub.lessonId, sub.pairNumber, performer);
    const inClass = students.filter((st) => sameClass(st.class, planned.className));
    const rest = students.filter((st) => !sameClass(st.class, planned.className));
    const opt = (st: Student) => (
      <option key={st.id} value={st.id}>
        #{st.indexNumber} {st.name}
      </option>
    );
    return (
      <label className="flex items-center gap-2 mb-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="shrink-0 font-bold">Pupil:</span>
        <select
          value={current?.id ?? ''}
          onChange={(e) => assignFromTray(sub, performer, e.target.value || null)}
          className={`flex-1 min-w-0 px-2 py-1 rounded-lg border text-xs font-semibold bg-white dark:bg-zinc-900 ${
            current
              ? 'border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-200'
              : 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
          }`}
        >
          <option value="">Not named — pick who this is</option>
          {inClass.length > 0 && <optgroup label={`Class ${planned.className}`}>{inClass.map(opt)}</optgroup>}
          {rest.length > 0 && <optgroup label="Other classes">{rest.map(opt)}</optgroup>}
        </select>
      </label>
    );
  };

  // Send just the teacher's comment back to the pair — no status change, no modal close.
  const handleSendFeedback = async (sub: PairSubmissionRecord) => {
    const text = teacherFeedbackText.trim();
    if (!text) return;
    await updateSubmissionStatus(sub.id, sub.status, text);
    if (teacherId) await updateCloudSubmissionFeedback(sub.id, text);
    setFeedbackSent(true);
    setActiveReviewSub({ ...sub, teacherFeedback: text });
    setTimeout(() => setFeedbackSent(false), 2500);
    loadSubmissions();
  };

  const handleApprove = async (sub: PairSubmissionRecord, star: boolean = true) => {
    await updateSubmissionStatus(sub.id, 'approved', teacherFeedbackText || 'Well done pair!', star);
    if (teacherId) {
      await updateCloudSubmissionStatus(sub.id, 'approved', teacherFeedbackText || 'Well done pair!', star);
    }
    setTeacherFeedbackText('');
    setActiveReviewSub(null);
    loadSubmissions();
  };

  const handleRequestRedo = async (sub: PairSubmissionRecord) => {
    await updateSubmissionStatus(sub.id, 'needs_redo', teacherFeedbackText || 'Please try again with partner.');
    if (teacherId) {
      await updateCloudSubmissionStatus(sub.id, 'needs_redo', teacherFeedbackText || 'Please try again with partner.');
    }
    setTeacherFeedbackText('');
    setActiveReviewSub(null);
    loadSubmissions();
  };

  const unapprovedCount = submissions.filter((s) => s.status === 'pending_sync' || s.status === 'resubmitted').length;

  // "4B · Fri 27 Sep" for planned lessons; older ids fall back to what we know
  const lessonLabel = (id: string) => {
    if (id === LEGACY_LESSON_ID) return 'Older submissions';
    const planned = lessons.find((l) => l.id === id);
    if (planned) return lessonTitle(planned);
    return localLessonNames[id] ?? id;
  };

  const currentLessonSubmissions = lessonId ? submissions.filter((s) => s.lessonId === lessonId) : [];
  // Current lesson first, then every lesson that has work in it, newest first
  const reviewLessonIds: string[] = Array.from(
    new Set<string>([...(lessonId ? [lessonId] : []), ...submissions.map((s) => s.lessonId)])
  );
  const reviewSubmissions =
    reviewLessonFilter === 'ALL' ? submissions : submissions.filter((s) => s.lessonId === reviewLessonFilter);

  const handleDelete = async (sub: PairSubmissionRecord) => {
    if (!confirm(
      `Delete Pair #${sub.pairNumber} — ${sub.skillName}? This cannot be undone.\n\n` +
      `Any grading already filed under a pupil's student record stays there, but its video will be gone.`
    )) return;

    // 1. Register ID immediately so the 3s polling loop skips it going forward
    deletedIdsRef.current.add(sub.id);

    // 2. Optimistically remove from UI state right away — don't wait for async
    setSubmissions((prev) => prev.filter((s) => s.id !== sub.id));
    setActiveReviewSub(null);

    // 3. Delete from local IndexedDB
    await deleteSubmission(sub.id);

    // 4. Delete from Supabase cloud — removes video files from Storage AND the DB row
    // Requires the teacher DELETE policies in supabase_protect_pupil_data.sql
    if (teacherId) {
      await deleteCloudSubmission(sub.id, sub);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      
      {/* Teacher Top Navigation */}
      <header className="min-h-16 h-auto py-2.5 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-4 md:px-6 flex flex-wrap md:flex-nowrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏫</span>
          <div>
            <h1 className="font-extrabold text-base md:text-lg text-slate-800 dark:text-white">
              Teacher Command Board
            </h1>
            <p className="text-xs text-slate-400">
              {lesson ? `${lessonTitle(lesson)} · ${lesson.skillName}` : 'No lesson on the projector'}
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('PROJECTOR')}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'PROJECTOR'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            📽️ Projector
          </button>
          <button
            onClick={() => setViewMode('LESSONS')}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'LESSONS' || viewMode === 'PLAN_LESSON' || viewMode === 'PAIRS'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            📋 Lessons
          </button>
          <button
            onClick={() => setViewMode('REVIEW_TRAY')}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'REVIEW_TRAY'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <span>📥 Review Tray</span>
            {unapprovedCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-black animate-pulse">
                {unapprovedCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick Launch Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenChat}
            className="px-3 py-2 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Back to Bot
          </button>
        </div>
      </header>


      {/* VIEW 1a: NO LESSON ON THE PROJECTOR YET */}
      {viewMode === 'PROJECTOR' && !lesson && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full">
          <div className="text-center py-16 px-6 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xl">
            {lessonsLoading && currentLessonId ? (
              <p className="text-sm text-slate-400">Loading lesson…</p>
            ) : (
              <>
                <span className="text-5xl block mb-3">📋</span>
                <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">No lesson on the projector</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">
                  Plan a lesson to get its class QR code, or pick one you planned earlier.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode('PLAN_LESSON')}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold cursor-pointer"
                  >
                    ＋ Plan a lesson
                  </button>
                  {lessons.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setViewMode('LESSONS')}
                      className="px-4 py-2.5 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Choose from your lessons
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* VIEW 1b: WHITEBOARD PROJECTOR (FOR CLASSROOM SETUP) */}
      {viewMode === 'PROJECTOR' && lesson && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full flex flex-col gap-6">
          
          {lesson.objective && (
            <div className="bg-white dark:bg-zinc-900 border-2 border-indigo-200 dark:border-indigo-900 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <span className="text-3xl">🎯</span>
              <div>
                <p className="text-xs uppercase font-extrabold text-indigo-700 dark:text-indigo-300 tracking-wider">
                  Today's objective
                </p>
                <p className="text-lg font-bold text-slate-800 dark:text-white">{lesson.objective}</p>
              </div>
            </div>
          )}

          {/* Center Split: QR Code + Live Pair Check-in Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left: Giant QR Code Card (To be projected on whiteboard) */}
            <div className="lg:col-span-5 bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-zinc-800 flex flex-col items-center text-center">
              
              {/* The lesson on the projector */}
              <div className="w-full mb-4 pb-4 border-b border-slate-100 dark:border-zinc-800 text-left flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Current lesson</p>
                  <p className="text-sm font-black text-slate-800 dark:text-white truncate">
                    {lessonTitle(lesson)}
                    {lesson.level && <span className="ml-1.5 text-xs font-bold text-slate-400">{lesson.level}</span>}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{lesson.skillName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('LESSONS')}
                  className="shrink-0 px-3 py-2 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Change lesson
                </button>
              </div>

              <div className="mb-4">
                <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-bold">
                  {lesson.className} Class QR
                </span>
                <h2 className="text-xl font-black text-slate-800 dark:text-white mt-2">
                  1. Apple: Grab iPad & Scan!
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Point iPad camera at the code below to join station
                </p>
              </div>

              {/* QR Image */}
              <div className="p-3 bg-white rounded-3xl shadow-inner border-4 border-indigo-600/20">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="Class QR" className="w-64 h-64 object-contain" />
                ) : (
                  <div className="w-64 h-64 bg-slate-100 flex items-center justify-center text-slate-400">
                    Generating QR…
                  </div>
                )}
              </div>

            </div>

            {/* Right: Live Pair Check-in Monitor */}
            <div className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-zinc-800">
              
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div>
                  <h3 className="font-extrabold text-base text-slate-800 dark:text-white flex items-center gap-2">
                    <span>👥 Live Pair Check-In Grid</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Verify all pairs take their selfie before lining up
                  </p>
                </div>
                <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold rounded-full text-xs">
                  {checkIns.length} / {lesson.pairCount} Checked In
                </span>
              </div>

              {/* The lesson's steps, and how many pairs are on each (#91) */}
              {lesson.steps.length > 0 && (
                <ol className="mb-4 flex flex-wrap gap-2">
                  {lesson.steps.map((s, i) => {
                    const here = checkIns.filter((c) => pairStepAt(lesson.steps, c) === i).length;
                    return (
                      <li key={s.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold ${
                        here ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                             : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-slate-300'}`}>
                        <span className="w-5 h-5 rounded-full bg-white dark:bg-zinc-900 border border-current/20 text-[10px] font-black flex items-center justify-center">{i + 1}</span>
                        <span>{STEP_ICON(s)} {stepLabel(s)}</span>
                        {s.skillName !== lesson.skillName && <span className="font-semibold opacity-70">· {s.skillName}</span>}
                        <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${here ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-zinc-700 dark:text-slate-400'}`}>
                          {here}
                        </span>
                      </li>
                    );
                  })}
                  {checkIns.some((c) => c.step_finished) && (
                    <li className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 text-xs font-bold">
                      🏁 Finished <span className="px-1.5 rounded-full text-[10px] bg-emerald-600 text-white">{checkIns.filter((c) => c.step_finished).length}</span>
                    </li>
                  )}
                </ol>
              )}

              {/* One tile per pair in this lesson */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {Array.from({ length: lesson.pairCount }, (_, i) => i + 1).map((num) => {
                  const ci = checkIns.find((c) => c.pair_number === num);
                  const isChecked = !!ci;
                  const needsHelp = ci?.needs_help;
                  const hasPractised = currentLessonSubmissions.some((s) => s.pairNumber === num);

                  return (
                    <div
                      key={num}
                      className={`relative p-3 rounded-2xl border-2 flex flex-col items-center text-center transition-all ${
                        needsHelp
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 animate-pulse'
                          : isChecked
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/40 opacity-60'
                      }`}
                    >
                      {hasPractised && (
                        <span
                          className="absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-indigo-600 text-white"
                          title="Practice video submitted"
                        >
                          ✓ sent
                        </span>
                      )}
                      {isChecked && ci && (
                        <button
                          type="button"
                          onClick={() => handleClearCheckIn(ci)}
                          title={`Clear Pair ${num}'s check-in`}
                          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-slate-300 dark:border-zinc-600 text-slate-500 hover:text-red-600 hover:border-red-400 text-xs font-black leading-none flex items-center justify-center shadow-xs cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                      {/* Pair Badge / Photo */}
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-200 dark:bg-zinc-700 flex items-center justify-center mb-1.5 shadow-inner">
                        {ci?.pair_photo ? (
                          <img src={ci.pair_photo} alt={`Pair ${num}`} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg">{needsHelp ? '🆘' : isChecked ? '📸' : '⏳'}</span>
                        )}
                      </div>

                      <span className="font-black text-xs text-slate-800 dark:text-white">
                        Pair {num}
                      </span>

                      <span className={`text-[10px] font-bold mt-0.5 ${
                        needsHelp
                          ? 'text-amber-700 dark:text-amber-300'
                          : isChecked
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-400'
                      }`}>
                        {needsHelp ? 'Needs Help!' : isChecked ? 'Ready! 🚶‍♂️' : 'Waiting…'}
                      </span>
                      {/* Where this pair is in the lesson (#91) */}
                      {(() => {
                        const at = pairStepAt(lesson.steps, ci);
                        if (at === null) return null;
                        return (
                          <span className={`mt-1 max-w-full truncate px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                            at === 'finished' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}
                            title={at === 'finished' ? 'Finished the lesson' : `Step ${at + 1}: ${stepLabel(lesson.steps[at])}`}>
                            {at === 'finished' ? '🏁 Done' : `${STEP_ICON(lesson.steps[at])} Step ${at + 1}`}
                          </span>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>

              {/* Line-up prompt */}
              <div className="mt-5 p-3.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-150 dark:border-indigo-900/30 flex items-center gap-3">
                <span className="text-2xl">🚪</span>
                <p className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                  <strong>Door Inspection Checklist:</strong> When students show the green "Ready to Line Up" screen with their pair selfie, verify both Apple and Banana are present before heading down to the venue!
                </p>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* VIEW: YOUR LESSONS */}
      {viewMode === 'LESSONS' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-4xl mx-auto w-full">
          {teacherId ? (
            <LessonList
              lessons={lessons}
              currentLessonId={currentLessonId}
              loading={lessonsLoading}
              error={lessonsError}
              onPlan={() => { setEditingLesson(null); setViewMode('PLAN_LESSON'); }}
              onEdit={(l) => { setEditingLesson(l); setViewMode('PLAN_LESSON'); }}
              onShow={(l) => showLessonOnProjector(l.id)}
              onDelete={handleDeleteLesson}
              onPairs={(l) => {
                setPairsLessonId(l.id);
                setViewMode('PAIRS');
              }}
              namedCounts={namedCounts}
            />
          ) : (
            <p className="text-sm text-slate-500">Sign in to plan and save lessons.</p>
          )}
        </div>
      )}

      {/* VIEW: NAME THE PUPILS IN EACH PAIR */}
      {viewMode === 'PAIRS' && pairsLesson && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full">
          <PairAssignment
            lesson={pairsLesson}
            lessons={lessons}
            students={students}
            slots={pairSlots}
            teacherId={teacherId}
            onSlotsChanged={loadPairSlots}
            onStudentAdded={(s) => setStudents((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s]))}
            onBack={() => setViewMode('LESSONS')}
          />
        </div>
      )}

      {/* VIEW: PLAN A LESSON */}
      {viewMode === 'PLAN_LESSON' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full">
          <LessonPlanForm
            key={editingLesson?.id ?? 'new'}
            lesson={editingLesson ?? undefined}
            teacherId={teacherId}
            onSave={handleSaveLesson}
            onCancel={() => { setEditingLesson(null); setViewMode('LESSONS'); }}
          />
        </div>
      )}

      {/* VIEW 2: SEESAW-STYLE TEACHER REVIEW TRAY */}
      {viewMode === 'REVIEW_TRAY' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">
                Pair Submissions
              </h2>
              <p className="text-xs text-slate-500">
                Review peer ratings and AI motion analysis before publishing to class portfolio
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={reviewLessonFilter}
                onChange={(e) => setReviewLessonFilter(e.target.value)}
                aria-label="Filter by lesson"
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-slate-200 max-w-[14rem]"
              >
                <option value="ALL">All lessons</option>
                {reviewLessonIds.map((id) => (
                  <option key={id} value={id}>
                    {lessonLabel(id)}
                    {id === lessonId ? ' (current)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={loadSubmissions}
                className="px-3 py-1.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
              <span className="px-3.5 py-1.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full font-black text-xs">
                {reviewSubmissions.length} {reviewLessonFilter === 'ALL' ? 'Total' : 'in Lesson'}
              </span>
            </div>
          </div>

          {reviewSubmissions.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 p-8 shadow-xs">
              <span className="text-5xl block mb-3">📭</span>
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">No submissions pending review</h3>
              <p className="text-xs text-slate-400 mt-1">
                When students finish their peer-coaching turns and reconnect to Wi-Fi, their attempts will appear here!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reviewSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-xs hover:shadow-md transition-shadow"
                >
                  <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 shadow-xs border">
                        {sub.pairPhoto ? (
                          <img src={sub.pairPhoto} alt="Pair" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs">📸</span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-800 dark:text-white">
                          Pair #{sub.pairNumber}
                          {(slotStudent(sub.lessonId, sub.pairNumber, 'apple') || slotStudent(sub.lessonId, sub.pairNumber, 'banana')) && (
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              {' · '}
                              {[slotStudent(sub.lessonId, sub.pairNumber, 'apple')?.name ?? 'Apple',
                                slotStudent(sub.lessonId, sub.pairNumber, 'banana')?.name ?? 'Banana'].join(' & ')}
                            </span>
                          )}
                        </h4>
                        <span className="text-[10px] text-slate-400">{sub.skillName}</span>
                        <span className="block text-[10px] text-slate-400 truncate">
                          {sub.lessonId === LEGACY_LESSON_ID ? '' : `${lessonLabel(sub.lessonId)} · `}
                          Sent {formatShortDate(sub.createdAt)}
                        </span>
                        {(sub.aiChatAnalysis?.apple || sub.aiChatAnalysis?.banana) && (
                          <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            🤖 AI analysis
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      sub.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : sub.status === 'resubmitted'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {sub.status === 'approved'
                        ? '✓ Approved'
                        : sub.status === 'resubmitted'
                        ? '🔁 Resubmitted'
                        : '⏳ Pending'}
                    </span>
                  </div>

                  <div className="p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>🍌 {slotStudent(sub.lessonId, sub.pairNumber, 'banana')?.name ?? 'Banana'} performed:</span>
                      <span className="font-bold text-indigo-600">
                        {sub.appleRole.cues.filter((c) => c.isObserved).length} / {sub.appleRole.cues.length} Cues Met
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>🍎 {slotStudent(sub.lessonId, sub.pairNumber, 'apple')?.name ?? 'Apple'} performed:</span>
                      <span className="font-bold text-indigo-600">
                        {sub.bananaRole.cues.filter((c) => c.isObserved).length} / {sub.bananaRole.cues.length} Cues Met
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>🎬 Recorded Videos:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {[sub.appleRole.videoBlob || sub.appleRole.videoUrl, sub.bananaRole.videoBlob || sub.bananaRole.videoUrl].filter(Boolean).length} / 2 Clips Saved
                      </span>
                    </div>

                    {sub.teacherFeedback && (
                      <p className="p-2 bg-slate-50 dark:bg-zinc-800 rounded-lg text-[11px] italic text-slate-600 dark:text-slate-300">
                        Teacher: "{sub.teacherFeedback}"
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-100 dark:border-zinc-800 flex gap-2">
                    <button
                      onClick={() => setActiveReviewSub(sub)}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Inspect & Review 🔍
                    </button>
                    {sub.status !== 'approved' && (
                      <button
                        onClick={() => handleApprove(sub, true)}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        ⭐ Quick Approve
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(sub)}
                      className="px-2.5 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-950 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      title="Delete submission"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INSPECTION MODAL (SEESAW DUAL-VIEW REVIEW) */}
      {activeReviewSub && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col max-h-[90vh] overflow-y-auto animate-scale-in">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden border">
                  {activeReviewSub.pairPhoto && (
                    <img src={activeReviewSub.pairPhoto} alt="Pair" className="w-full h-full object-cover" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-slate-800 dark:text-white">
                    Review Pair #{activeReviewSub.pairNumber} Practice
                  </h3>
                  <p className="text-xs text-slate-400">{activeReviewSub.skillName} · MOE Syllabus Standards</p>
                </div>
              </div>
              <button
                onClick={() => setActiveReviewSub(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Dual Turn Breakdown */}
            <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-2 mb-1">🤝 Peer Assessment Checklist</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">

              {/* Turn 1: Banana Performed */}
              <div className="p-4 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl border border-slate-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-600">
                    Turn 1: 🍌 {slotStudent(activeReviewSub.lessonId, activeReviewSub.pairNumber, 'banana')?.name ?? 'Banana'} performing
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Evaluator: {slotStudent(activeReviewSub.lessonId, activeReviewSub.pairNumber, 'apple')?.name ?? 'Apple'}
                  </span>
                </div>
                {pupilPicker(activeReviewSub, 'banana')}
                <div className="flex flex-wrap gap-1.5">
                  <AttemptStatus
                    sentAt={activeReviewSub.bananaSentAt}
                    redoRequestedAt={activeReviewSub.redoRequestedAt}
                    hasVideo={!!(activeReviewSub.appleRole.videoBlob || activeReviewSub.appleRole.videoUrl)}
                  />
                  <StepTag step={activeReviewSub.peerSteps?.banana} mainSkill={activeReviewSub.skillName} />
                </div>
                <VideoBlobPlayer
                  blob={activeReviewSub.appleRole.videoBlob}
                  videoUrl={activeReviewSub.appleRole.videoUrl}
                  performer="Banana"
                />
                {/* Filmed again: the earlier attempt, unless the AI card below already shows it */}
                {activeReviewSub.firstAttempt?.banana?.videoUrl && !activeReviewSub.aiChatAnalysis?.banana?.analysedClip && (
                  <details className="mt-2 rounded-xl border border-slate-200 dark:border-zinc-700 px-3 py-2">
                    <summary className="text-[11px] font-bold text-slate-500 dark:text-slate-400 cursor-pointer">🎬 First attempt (before filming again)</summary>
                    <VideoBlobPlayer videoUrl={activeReviewSub.firstAttempt.banana.videoUrl} performer="Banana" />
                    <p className="text-[11px] text-slate-500">
                      Peer ticks: {activeReviewSub.firstAttempt.banana.cues.filter(c => c.isObserved).length}/{activeReviewSub.firstAttempt.banana.cues.length}
                    </p>
                  </details>
                )}
                <div className="space-y-1.5 mt-3">
                  {activeReviewSub.appleRole.cues.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-1.5 bg-white dark:bg-zinc-900 rounded-lg">
                      <span className="text-slate-600 dark:text-slate-300">{c.criterionText}</span>
                      <span className={c.isObserved ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
                        {c.isObserved ? '✓ Passed' : '✗ Missed'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Turn 2: Apple Performed */}
              <div className="p-4 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl border border-slate-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-red-600">
                    Turn 2: 🍎 {slotStudent(activeReviewSub.lessonId, activeReviewSub.pairNumber, 'apple')?.name ?? 'Apple'} performing
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Evaluator: {slotStudent(activeReviewSub.lessonId, activeReviewSub.pairNumber, 'banana')?.name ?? 'Banana'}
                  </span>
                </div>
                {pupilPicker(activeReviewSub, 'apple')}
                <div className="flex flex-wrap gap-1.5">
                  <AttemptStatus
                    sentAt={activeReviewSub.appleSentAt}
                    redoRequestedAt={activeReviewSub.redoRequestedAt}
                    hasVideo={!!(activeReviewSub.bananaRole.videoBlob || activeReviewSub.bananaRole.videoUrl)}
                  />
                  <StepTag step={activeReviewSub.peerSteps?.apple} mainSkill={activeReviewSub.skillName} />
                </div>
                <VideoBlobPlayer
                  blob={activeReviewSub.bananaRole.videoBlob}
                  videoUrl={activeReviewSub.bananaRole.videoUrl}
                  performer="Apple"
                />
                {/* Filmed again: the earlier attempt, unless the AI card below already shows it */}
                {activeReviewSub.firstAttempt?.apple?.videoUrl && !activeReviewSub.aiChatAnalysis?.apple?.analysedClip && (
                  <details className="mt-2 rounded-xl border border-slate-200 dark:border-zinc-700 px-3 py-2">
                    <summary className="text-[11px] font-bold text-slate-500 dark:text-slate-400 cursor-pointer">🎬 First attempt (before filming again)</summary>
                    <VideoBlobPlayer videoUrl={activeReviewSub.firstAttempt.apple.videoUrl} performer="Apple" />
                    <p className="text-[11px] text-slate-500">
                      Peer ticks: {activeReviewSub.firstAttempt.apple.cues.filter(c => c.isObserved).length}/{activeReviewSub.firstAttempt.apple.cues.length}
                    </p>
                  </details>
                )}
                <div className="space-y-1.5 mt-3">
                  {activeReviewSub.bananaRole.cues.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-1.5 bg-white dark:bg-zinc-900 rounded-lg">
                      <span className="text-slate-600 dark:text-slate-300">{c.criterionText}</span>
                      <span className={c.isObserved ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
                        {c.isObserved ? '✓ Passed' : '✗ Missed'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* AI Assessment Panel */}
            {activeReviewSub.aiTeacherReport ? (
              <div className="mt-4 border border-indigo-500/40 rounded-2xl overflow-hidden">
                <div className="bg-indigo-950/80 dark:bg-indigo-950 px-4 py-2.5 flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  <span className="font-black text-white text-sm">AI Assessment (Gemini 2.5 Flash)</span>
                  <span className="ml-auto text-[10px] text-indigo-300">
                    {new Date(activeReviewSub.aiTeacherReport.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Proficiency Badges */}
                <div className="p-4 bg-slate-800/40 dark:bg-zinc-900/60 grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/60 rounded-xl p-3">
                    <p className="text-xs font-bold text-amber-400 mb-2">🍌 Banana — Proficiency</p>
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${
                      normaliseLevel(activeReviewSub.aiTeacherReport.bananaProficiency) === 'Accomplished' ? 'bg-emerald-500/30 text-emerald-300' :
                      activeReviewSub.aiTeacherReport.bananaProficiency === 'Competent' ? 'bg-blue-500/30 text-blue-300' :
                      activeReviewSub.aiTeacherReport.bananaProficiency === 'Developing' ? 'bg-amber-500/30 text-amber-300' :
                      'bg-red-500/30 text-red-300'
                    }`}>
                      {normaliseLevel(activeReviewSub.aiTeacherReport.bananaProficiency) ?? activeReviewSub.aiTeacherReport.bananaProficiency}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 rounded-xl p-3">
                    <p className="text-xs font-bold text-red-400 mb-2">🍎 Apple — Proficiency</p>
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${
                      normaliseLevel(activeReviewSub.aiTeacherReport.appleProficiency) === 'Accomplished' ? 'bg-emerald-500/30 text-emerald-300' :
                      activeReviewSub.aiTeacherReport.appleProficiency === 'Competent' ? 'bg-blue-500/30 text-blue-300' :
                      activeReviewSub.aiTeacherReport.appleProficiency === 'Developing' ? 'bg-amber-500/30 text-amber-300' :
                      'bg-red-500/30 text-red-300'
                    }`}>
                      {normaliseLevel(activeReviewSub.aiTeacherReport.appleProficiency) ?? activeReviewSub.aiTeacherReport.appleProficiency}
                    </span>
                  </div>
                </div>

                {/* Peer vs AI Discrepancies */}
                {activeReviewSub.aiTeacherReport.discrepancies.length > 0 && (
                  <div className="px-4 pb-3 pt-1 bg-slate-900/40 dark:bg-zinc-900/40">
                    <p className="text-xs font-black text-amber-400 mb-2">
                      ⚠️ {activeReviewSub.aiTeacherReport.discrepancies.length} Peer vs AI Disagreement{activeReviewSub.aiTeacherReport.discrepancies.length > 1 ? 's' : ''} — You Make the Final Call
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {activeReviewSub.aiTeacherReport.discrepancies.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 bg-amber-950/40 border border-amber-500/30 rounded-xl px-3 py-2">
                          <span className="text-xs font-bold text-white shrink-0">{d.performer === 'Banana' ? '🍌' : '🍎'} {d.criterion}</span>
                          <span className="ml-auto flex items-center gap-1.5 text-[11px] shrink-0">
                            <span className={`px-2 py-0.5 rounded-full font-bold ${d.peerSaid ? 'bg-emerald-500/30 text-emerald-300' : 'bg-red-500/30 text-red-300'}`}>
                              Peer: {d.peerSaid ? '✅' : '❌'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full font-bold ${d.aiSaid ? 'bg-emerald-500/30 text-emerald-300' : 'bg-red-500/30 text-red-300'}`}>
                              AI: {d.aiSaid ? '✅' : '❌'}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Teacher Recommendations */}
                <div className="px-4 py-3 bg-slate-900/30 dark:bg-zinc-900/30 border-t border-slate-700/30">
                  <p className="text-xs font-black text-slate-300 mb-2">📋 Teaching Recommendations</p>
                  <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">{activeReviewSub.aiTeacherReport.teacherRecommendations}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 bg-slate-800/30 rounded-2xl border border-dashed border-slate-600/40 flex items-center gap-3">
                <span className="text-lg">🤖</span>
                <p className="text-xs text-slate-400 italic">AI analysis not yet available. Students need to tap "Ask AI Coach" on their iPad to trigger it.</p>
              </div>
            )}

            {/* AI Assessment Checklists the students sent from the Practice Station */}
            {(activeReviewSub.aiChatAnalysis?.apple || activeReviewSub.aiChatAnalysis?.banana) && (
              <div className="mt-4 space-y-3">
                {(['apple', 'banana'] as const).map((who) => {
                  const entry = activeReviewSub.aiChatAnalysis?.[who];
                  if (!entry) return null;
                  const gradings = subGradings[who] ?? [];
                  const current = gradings.at(-1);
                  const earlier = gradings.slice(0, -1);
                  return (
                    <div key={who} className="border border-emerald-500/40 rounded-2xl overflow-hidden">
                      <div className="bg-emerald-950/80 dark:bg-emerald-950 px-4 py-2.5 flex items-center gap-2">
                        <span className="text-lg">{who === 'apple' ? '🍎' : '🍌'}</span>
                        <span className="font-black text-white text-sm">
                          {entry.teacherGrades ? 'Checklist to grade' : 'AI Assessment Checklist'} — {slotStudent(activeReviewSub.lessonId, activeReviewSub.pairNumber, who)?.name ?? entry.studentLabel}
                        </span>
                        <span className="ml-auto text-[10px] text-emerald-300">
                          {entry.modelUsed} · {new Date(entry.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-zinc-900/60">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <p className="text-[11px] font-bold text-slate-400">{entry.skillName}</p>
                          <StepTag step={entry.step} mainSkill={activeReviewSub.skillName} />
                        </div>
                        {entry.skillName && entry.skillName !== activeReviewSub.skillName && (
                          <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                            Graded as {entry.skillName}. Filed under {activeReviewSub.skillName}, the lesson's main skill, on the pupil's record.
                          </p>
                        )}
                        {/* The pupil filmed again after this analysis: show the attempt it was about (#94) */}
                        {entry.analysedClip && (
                          <div className="mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900">
                            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                              First attempt: the AI analysed this one. The video above is their final attempt.
                            </p>
                            <VideoBlobPlayer videoUrl={entry.analysedClip.videoUrl} performer={entry.studentLabel} />
                            {entry.analysedClip.cues.length > 0 && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                Peer ticks for the first attempt: {entry.analysedClip.cues.filter(c => c.isObserved).length}/{entry.analysedClip.cues.length}
                              </p>
                            )}
                          </div>
                        )}
                        {entry.teacherGrades && (
                          <p className="mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                            No AI analysis for this attempt ({/no ai analysis step/i.test(entry.analysisText) ? 'this lesson has no AI step' : "Coach Bot couldn't analyse it"}). Grade it below.
                          </p>
                        )}
                        {/* Re-filmed after a redo request (#93): the AI analysis below is of the earlier attempt */}
                        {entry.redo && (
                          <div className="mb-3 p-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-900">
                            <p className="text-[11px] font-bold text-sky-800 dark:text-sky-300">
                              🔄 Re-do sent {new Date(entry.redo.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. The video above is the re-do. No AI analysis on a re-do: grade it below.
                            </p>
                            {entry.redo.firstClip && (
                              <>
                                <p className="mt-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">Their first try in this re-do:</p>
                                <VideoBlobPlayer videoUrl={entry.redo.firstClip.videoUrl} performer={entry.studentLabel} />
                              </>
                            )}
                          </div>
                        )}
                        {entry.redo && <p className="text-[11px] font-bold text-slate-400 mb-1">AI analysis of the earlier attempt</p>}
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto">
                          {entry.analysisText}
                        </p>
                        {/* Earlier grades stay on the pupil's record as their progress */}
                        {earlier.length > 0 && (
                          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                            Earlier: {earlier.map(g => `${effectiveLevel(g) ?? 'not graded'} (${g.createdAt.toLocaleDateString([], { day: 'numeric', month: 'short' })})`).join(' → ')}
                          </p>
                        )}
                        {/* Same review as the Student Dashboard: it is the same record */}
                        {current ? (
                          <TeacherReviewPanel
                            key={current.id}
                            analysis={current}
                            onSaved={(updated) => setSubGradings((prev) => ({ ...prev, [who]: [...(prev[who] ?? []).slice(0, -1), updated] }))}
                          />
                        ) : (
                          <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
                            Name this pupil above to add this analysis to their student record and review it.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Teacher Feedback Note */}
            <div className="my-4">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 block">
                Teacher Cue / Praise (Sent to Pair iPad):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={teacherFeedbackText}
                  onChange={(e) => setTeacherFeedbackText(e.target.value)}
                  placeholder="e.g. Great follow through Apple! Banana, remember to keep your knees bent."
                  className="flex-1 px-4 py-2.5 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleSendFeedback(activeReviewSub)}
                  disabled={!teacherFeedbackText.trim()}
                  className="shrink-0 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {feedbackSent ? '✓ Sent' : '💬 Send Feedback'}
                </button>
              </div>
            </div>

            {/* Whether each performer can still send (supabase_submission_lock.sql) */}
            {(() => {
              const rows = ([
                ['🍎 Apple', performerLock(activeReviewSub.appleSentAt, activeReviewSub.redoRequestedAt)],
                ['🍌 Banana', performerLock(activeReviewSub.bananaSentAt, activeReviewSub.redoRequestedAt)],
              ] as const).filter(([, lock]) => lock !== 'open');
              if (!rows.length) return null;
              return (
                <div className="mb-3 px-3 py-2 rounded-xl text-[11px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 space-y-0.5">
                  {rows.map(([who, lock]) => (
                    <p key={who}>
                      {who}:{' '}
                      {lock === 'locked'
                        ? "🔒 sent, so the pair can't change it. Send it back for a re-do to reopen it."
                        : '🔄 re-do requested: the pair can send again.'}
                    </p>
                  ))}
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <button
                onClick={() => handleRequestRedo(activeReviewSub)}
                className="flex-1 py-3 border border-red-200 dark:border-red-900 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50"
              >
                Send Back for Re-Do 🔄
              </button>
              <button
                onClick={() => handleApprove(activeReviewSub, true)}
                className="flex-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-600/20"
              >
                Approve & Award Star ⭐
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
