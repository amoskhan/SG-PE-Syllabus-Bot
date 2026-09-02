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
  PairCheckInRow,
} from '../services/cloudSyncService';
import { ALL_FMS_SKILLS } from '../data/fundamentalMovementSkillsData';


interface TeacherClassroomBoardProps {
  onOpenChat: () => void;
  onOpenStudentSession: () => void;
  teacherId?: string; // Signed-in teacher's Supabase UUID — embedded in QR so students upload to their bucket
}

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
      setUrl(videoUrl);
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

export const TeacherClassroomBoard: React.FC<TeacherClassroomBoardProps> = ({
  onOpenChat,
  onOpenStudentSession,
  teacherId,
}) => {
  const [viewMode, setViewMode] = useState<'PROJECTOR' | 'REVIEW_TRAY'>('PROJECTOR');
  const [lessonId, setLessonId] = useState('pe-lesson-today');
  const [selectedSkill, setSelectedSkill] = useState('Overhand Throw');
  const [cartPin, setCartPin] = useState('1234');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [submissions, setSubmissions] = useState<PairSubmissionRecord[]>([]);
  const [activeReviewSub, setActiveReviewSub] = useState<PairSubmissionRecord | null>(null);
  const [teacherFeedbackText, setTeacherFeedbackText] = useState('');
  // Track IDs optimistically deleted so the 3s polling loop doesn't re-add them
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Live pair check-ins, synced from Supabase (students check in on a different device)
  const [checkIns, setCheckIns] = useState<PairCheckInRow[]>([]);

  // Generate QR code whenever lessonId, selectedSkill, or teacherId changes
  useEffect(() => {
    const payload = JSON.stringify({
      lessonId,
      title: `${selectedSkill} Practice`,
      skillName: selectedSkill,
      teacherId: teacherId ?? null, // ← Seesaw-style: student device uses this to upload to teacher's bucket
    });

    QRCode.toDataURL(payload, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrCodeUrl)
      .catch(console.error);
  }, [lessonId, selectedSkill, teacherId]);

  // Load submissions from Supabase Cloud (multi-device) + local IndexedDB
  useEffect(() => {
    loadSubmissions();
    const interval = setInterval(loadSubmissions, 3000);
    return () => clearInterval(interval);
  }, [teacherId]);

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

    // Live pair check-ins for the Projector grid
    const rows = await fetchPairCheckIns(teacherId);
    setCheckIns(rows);
  };


  const [feedbackSent, setFeedbackSent] = useState(false);

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

  const unapprovedCount = submissions.filter((s) => s.status === 'pending_sync').length;

  const handleDelete = async (sub: PairSubmissionRecord) => {
    if (!confirm(`Delete Pair #${sub.pairNumber} — ${sub.skillName}? This cannot be undone.`)) return;

    // 1. Register ID immediately so the 3s polling loop skips it going forward
    deletedIdsRef.current.add(sub.id);

    // 2. Optimistically remove from UI state right away — don't wait for async
    setSubmissions((prev) => prev.filter((s) => s.id !== sub.id));
    setActiveReviewSub(null);

    // 3. Delete from local IndexedDB
    await deleteSubmission(sub.id);

    // 4. Delete from Supabase cloud — removes video files from Storage AND the DB row
    // Requires DELETE RLS policy — see supabase_add_delete_policy.sql
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
            <p className="text-xs text-slate-400">Class 4B · PE Partner Learning Station</p>
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
            onClick={onOpenStudentSession}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 cursor-pointer"
          >
            <span>📱 Test iPad Flow</span>
          </button>
          <button
            onClick={onOpenChat}
            className="px-3 py-2 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Back to Bot
          </button>
        </div>
      </header>


      {/* VIEW 1: WHITEBOARD PROJECTOR (FOR CLASSROOM SETUP) */}
      {viewMode === 'PROJECTOR' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full flex flex-col gap-6">
          
          {/* Top Banner: Locked iPad Passcode Reminder */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800/80 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔒</span>
              <div>
                <p className="text-xs uppercase font-extrabold text-amber-800 dark:text-amber-300 tracking-wider">
                  iPad Cart Passcode Reminder (Look Here If iPad Is Locked)
                </p>
                <p className="text-2xl font-black font-mono tracking-widest text-amber-950 dark:text-amber-200">
                  CART PIN: {cartPin}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-500">Edit PIN:</label>
              <input
                type="text"
                maxLength={4}
                value={cartPin}
                onChange={(e) => setCartPin(e.target.value)}
                className="w-20 px-2 py-1 text-center font-mono font-bold border rounded-lg text-sm bg-white dark:bg-zinc-900"
              />
            </div>
          </div>

          {/* Center Split: QR Code + Live Pair Check-in Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left: Giant QR Code Card (To be projected on whiteboard) */}
            <div className="lg:col-span-5 bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-zinc-800 flex flex-col items-center text-center">
              
              <div className="mb-4">
                <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-bold">
                  Class 4B Briefing QR
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

              {/* Lesson Skill Selector */}
              <div className="w-full mt-5 pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col gap-1.5 text-left">
                <label className="text-xs font-bold text-slate-500">Today's Syllabus Skill:</label>
                <select
                  value={selectedSkill}
                  onChange={(e) => setSelectedSkill(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-white"
                >
                  {ALL_FMS_SKILLS.map((skill) => (
                    <option key={skill} value={skill}>
                      {skill}
                    </option>
                  ))}
                </select>
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
                  {checkIns.length} / 15 Checked In
                </span>
              </div>

              {/* 15-Pair Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => {
                  const ci = checkIns.find((c) => c.pair_number === num);
                  const isChecked = !!ci;
                  const needsHelp = ci?.needs_help;
                  const hasPractised = submissions.some((s) => s.pairNumber === num);

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

      {/* VIEW 2: SEESAW-STYLE TEACHER REVIEW TRAY */}
      {viewMode === 'REVIEW_TRAY' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">
                Unapproved Submissions Queue
              </h2>
              <p className="text-xs text-slate-500">
                Review peer ratings and AI motion analysis before publishing to class portfolio
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadSubmissions}
                className="px-3 py-1.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
              <span className="px-3.5 py-1.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full font-black text-xs">
                {submissions.length} Total Submissions
              </span>
            </div>
          </div>

          {submissions.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 p-8 shadow-xs">
              <span className="text-5xl block mb-3">📭</span>
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">No submissions pending review</h3>
              <p className="text-xs text-slate-400 mt-1">
                When students finish their peer-coaching turns and reconnect to Wi-Fi, their attempts will appear here!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {submissions.map((sub) => (
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
                        </h4>
                        <span className="text-[10px] text-slate-400">{sub.skillName}</span>
                        {sub.aiChatAnalysis && (
                          <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            🤖 AI analysis
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      sub.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {sub.status === 'approved' ? '✓ Approved' : '⏳ Pending'}
                    </span>
                  </div>

                  <div className="p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>🍌 Banana Performed:</span>
                      <span className="font-bold text-indigo-600">
                        {sub.appleRole.cues.filter((c) => c.isObserved).length} / {sub.appleRole.cues.length} Cues Met
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>🍎 Apple Performed:</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
              
              {/* Turn 1: Banana Performed */}
              <div className="p-4 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl border border-slate-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-600">Turn 1: Banana Performing</span>
                  <span className="text-[10px] text-slate-400">Evaluator: Apple</span>
                </div>
                <VideoBlobPlayer
                  blob={activeReviewSub.appleRole.videoBlob}
                  videoUrl={activeReviewSub.appleRole.videoUrl}
                  performer="Banana"
                />
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
                  <span className="text-xs font-bold text-red-600">Turn 2: Apple Performing</span>
                  <span className="text-[10px] text-slate-400">Evaluator: Banana</span>
                </div>
                <VideoBlobPlayer
                  blob={activeReviewSub.bananaRole.videoBlob}
                  videoUrl={activeReviewSub.bananaRole.videoUrl}
                  performer="Apple"
                />
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
                      activeReviewSub.aiTeacherReport.bananaProficiency === 'Excellent' ? 'bg-emerald-500/30 text-emerald-300' :
                      activeReviewSub.aiTeacherReport.bananaProficiency === 'Competent' ? 'bg-blue-500/30 text-blue-300' :
                      activeReviewSub.aiTeacherReport.bananaProficiency === 'Developing' ? 'bg-amber-500/30 text-amber-300' :
                      'bg-red-500/30 text-red-300'
                    }`}>
                      {activeReviewSub.aiTeacherReport.bananaProficiency}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 rounded-xl p-3">
                    <p className="text-xs font-bold text-red-400 mb-2">🍎 Apple — Proficiency</p>
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${
                      activeReviewSub.aiTeacherReport.appleProficiency === 'Excellent' ? 'bg-emerald-500/30 text-emerald-300' :
                      activeReviewSub.aiTeacherReport.appleProficiency === 'Competent' ? 'bg-blue-500/30 text-blue-300' :
                      activeReviewSub.aiTeacherReport.appleProficiency === 'Developing' ? 'bg-amber-500/30 text-amber-300' :
                      'bg-red-500/30 text-red-300'
                    }`}>
                      {activeReviewSub.aiTeacherReport.appleProficiency}
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

            {/* AI Chat Analysis submitted by the student from the Practice Station */}
            {activeReviewSub.aiChatAnalysis && (
              <div className="mt-4 border border-emerald-500/40 rounded-2xl overflow-hidden">
                <div className="bg-emerald-950/80 dark:bg-emerald-950 px-4 py-2.5 flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  <span className="font-black text-white text-sm">AI Chat Analysis (from Student)</span>
                  <span className="ml-auto text-[10px] text-emerald-300">
                    {new Date(activeReviewSub.aiChatAnalysis.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-zinc-900/60">
                  <p className="text-[11px] font-bold text-slate-400 mb-1.5">
                    {activeReviewSub.aiChatAnalysis.studentLabel} · {activeReviewSub.aiChatAnalysis.skillName}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto">
                    {activeReviewSub.aiChatAnalysis.analysisText}
                  </p>
                </div>
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
