
import React, { useState, useRef, useEffect } from 'react';
import { Analytics } from "@vercel/analytics/react";
import SessionSidebar from './components/layout/SessionSidebar';
import ChatInput from './components/chat/ChatInput';
import ChatMessage from './components/chat/ChatMessage';
import { Message, Sender, PE_TOPICS, MediaAttachment, ChatSession, Student, SkillMode } from './types';
import { MediaData } from './services/ai/geminiService';
import { getAIService } from './services/ai/aiServiceRegistry';
import { getOrCreateStudent, saveAnalysis, lookupByVideoHash, uploadVideoToStorage } from './services/studentService';
import { computeVideoHash } from './services/videoAnalysisCache';

import { poseDetectionService, type PoseData } from './services/vision/poseDetectionService';
import { parseDocument } from './services/documentService';
import PdfUploaderModal from './components/admin/PdfUploaderModal';
import RubricBuilderModal from './components/admin/RubricBuilderModal';
import { ALL_FMS_SKILLS } from './data/fundamentalMovementSkillsData';
import { useAuth } from './hooks/useAuth';
import { supabase } from './services/db/supabaseClient';
import Dashboard from './pages/Dashboard';
import { TeacherClassroomBoard } from './pages/TeacherClassroomBoard';
import { ClassQrScannerModal } from './components/classroom/ClassQrScannerModal';
import { PairCheckInModal } from './components/classroom/PairCheckInModal';
import { PeerCoachingSession, CompletedPeerSession } from './components/peer/PeerCoachingSession';
import { TeacherHelpBeacon } from './components/classroom/TeacherHelpBeacon';
import { getActivePairSession, clearActivePairSession, PairSessionData, PairSubmissionRecord, PeerCueResult, AiChatAnalysisEntry, queuePairSubmission, getDB, getOrCreatePairClaimToken } from './services/offline/offlineStorage';
import { backupSubmissionToSupabase, upsertPairCheckIn, fetchClaimedPairNumbers } from './services/cloudSyncService';
import { runPeerCoachingAnalysis } from './services/ai/peerCoachingAI';
import { getAllCuesForSkill } from './data/peerSyllabusCues';

type ModelId = 'gemini' | 'claude' | 'openrouter' | 'deepseek';

const MODEL_OPTIONS: { id: ModelId; name: string; icon: string; desc: string }[] = [
  { id: 'gemini', name: 'Gemini 3 Flash', icon: 'gemini.png', desc: 'Recommended · best for video' },
  { id: 'claude', name: 'Claude Sonnet', icon: 'claude.png', desc: 'Most detailed skill feedback' },
  { id: 'deepseek', name: 'DeepSeek V4 Flash', icon: 'deepseek.png', desc: 'Free · text chat only' },
  { id: 'openrouter', name: 'OpenRouter (Free)', icon: 'qwen.png', desc: 'Free · may rate-limit' },
];
const MODEL_LABEL: Record<ModelId, string> = {
  gemini: 'Gemini 3 Flash', claude: 'Claude Sonnet', deepseek: 'DeepSeek V4 Flash', openrouter: 'OpenRouter (Free)',
};
const modelIconFile = (m: ModelId) => (m === 'deepseek' ? 'deepseek' : m === 'openrouter' ? 'qwen' : m);

const ModelPicker: React.FC<{
  selectedModel: ModelId;
  onSelect: (m: ModelId) => void;
  align?: 'left' | 'right';
  variant?: 'light' | 'dark';
}> = ({ selectedModel, onSelect, align = 'right', variant = 'light' }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-2 rounded-xl border text-xs font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer ${
          variant === 'dark'
            ? 'border-white/15 bg-white/10 text-slate-100 hover:bg-white/20'
            : 'border-slate-200/50 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-zinc-800'
        }`}
      >
        <img src={`/assets/model-icons/${modelIconFile(selectedModel)}.png`} alt={selectedModel} className="w-4 h-4 object-contain" />
        <span className="hidden sm:inline">{MODEL_LABEL[selectedModel]}</span>
        <svg className={`w-3 h-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} mt-2.5 w-52 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-zinc-800/80 overflow-hidden z-20 flex flex-col p-1.5 animate-scale-in`}>
            {MODEL_OPTIONS.map((model) => (
              <button
                key={model.id}
                onClick={() => { onSelect(model.id); setOpen(false); }}
                className={`w-full px-3 py-2 rounded-xl text-left transition-colors flex items-center gap-3 cursor-pointer ${
                  selectedModel === model.id
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                <img src={`/assets/model-icons/${model.icon}`} alt={model.name} className="w-5 h-5 object-contain" />
                <div className="flex flex-col">
                  <span className="text-xs leading-tight font-medium">{model.name}</span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal">{model.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/** Canonical id for a pair's submission row — must match studentService.uploadPeerSessionToTeacher. */
const canonicalSubmissionId = (lessonId: string, pairNumber: number, skillName: string) =>
  `sub-${lessonId}-p${pairNumber}-${skillName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

const base64ToFile = (base64String: string, filename: string): File => {
  const arr = base64String.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

const App: React.FC = () => {
  const { user, teacherProfile, signInWithGoogle, signOut, updateTeacherProfile } = useAuth();

  const handleSignOut = async () => {
    await clearActivePairSession();
    setActivePairSession(null);
    setActivePeerSessionData(null);
    setShowDashboard(false);
    setAppMode('home_screen');
    await signOut();
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const STORAGE_KEY = 'sg_pe_syllabus_bot_history_v2'; // Changed key for new schema

  // Maps temp numeric IDs -> real Supabase UUIDs, so pending syncs can be flushed
  const tempToRealIdRef = React.useRef<Record<string, string>>({});
  // Queue of sessions that need to be synced once their real UUID is known
  const pendingSyncRef = React.useRef<ChatSession[]>([]);
  // Permanent in-memory cache: attachmentId -> base64 video data.
  // Supabase always strips media data to '' on sync. This ref is the authoritative
  // source of video data for the entire page session, immune to cloud overwrites.
  const videoDataCacheRef = React.useRef<Map<string, string>>(new Map());
  // Persists the student + videoHash + videoFile resolved during Phase 1 so Phase 2 (chip click)
  // can still access them — chip clicks don't carry metadata.
  const activeStudentContextRef = React.useRef<{ studentId: string; student: Student; videoHash?: string; videoFile?: File } | null>(null);
  const pendingGymnasticsRef = React.useRef<{
    files: File[];
    metadata: { startTime?: number; endTime?: number; skillName?: string; studentIndexNumber?: string; studentName?: string };
  } | null>(null);

  // DEFAULT WELCOME MESSAGE
  const getWelcomeMessage = (): Message => ({
    id: 'welcome-' + Date.now(),
    text: "Hello! I am your **Singapore PE Syllabus Bot**. \n\nI can help you with:\n1. **Syllabus Questions**: Ask about the 2024 PE Syllabus, learning outcomes, or goals.\n2. **AI Movement Analysis**: Upload a video or use your camera to record a skill (e.g., Overhand Throw). I will analyze your form frame-by-frame! 🏃‍♂️📹\n\nTry asking a question or uploading a video!",
    sender: Sender.BOT,
    timestamp: new Date(),
  });

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error('Stored sessions is not an array');
        return parsed.map((s: any) => {
          const createdAt = new Date(s.createdAt);
          const updatedAt = new Date(s.updatedAt);
          return {
            ...s,
            createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
            updatedAt: isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
            messages: Array.isArray(s.messages)
              ? s.messages.map((m: any) => {
                  const ts = new Date(m.timestamp);
                  return {
                    ...m,
                    timestamp: isNaN(ts.getTime()) ? new Date() : ts,
                    // Restore video data from sessionStorage cache (survives same-tab refresh)
                    media: Array.isArray(m.media)
                      ? m.media.map((med: any) => {
                          if (med.type === 'video' && !med.data) {
                            const cached = sessionStorage.getItem(`video_cache_${med.id}`);
                            if (cached) return { ...med, data: cached };
                          }
                          return med;
                        })
                      : m.media
                  };
                })
              : []
          };
        });
      }
    } catch (e) {
      console.error("Failed to load local sessions:", e);
    }
    const initialId = Date.now().toString();
    return [{
      id: initialId,
      title: 'New Chat',
      messages: [getWelcomeMessage()],
      createdAt: new Date(),
      updatedAt: new Date()
    }];
  });

  // Track the most recent sessions state to allow synchronous reading inside helpers
  const sessionsRef = React.useRef<ChatSession[]>(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);


  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    if (sessions.length > 0) return sessions[0].id;
    return '';
  });

  // 2. Fetch from Supabase on Login and handle Migration
  useEffect(() => {
    if (!user) return;

    const fetchSessions = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (error) {
           console.error("Error fetching sessions from Supabase", error);
           return;
        }

        if (data && data.length > 0) {
          const cloudSessions: ChatSession[] = data.map(s => ({
            id: s.id,
            title: s.title,
            messages: (s.messages as any[]).map(m => ({
               ...m,
               timestamp: new Date(m.timestamp)
            })),
            createdAt: new Date(s.created_at),
            updatedAt: new Date(s.updated_at)
          }));

          // Merge: keep any local sessions that are NOT yet in the cloud (temp IDs).
          // Re-hydrate media data from videoDataCacheRef — Supabase always strips data:''
          // but the cache holds the authoritative base64 for the full page session.
          setSessions(prev => {
            const cloudIds = new Set(cloudSessions.map(s => s.id));

            // Restore media data into cloud sessions using the permanent video cache
            const hydratedCloud = cloudSessions.map(cs => ({
              ...cs,
              messages: cs.messages.map(m => ({
                ...m,
                media: m.media?.map((med: any) => {
                  if (!med.data && videoDataCacheRef.current.has(med.id)) {
                    return { ...med, data: videoDataCacheRef.current.get(med.id) };
                  }
                  return med;
                })
              }))
            }));

            // Local sessions without a cloud counterpart (still have temp numeric IDs)
            const unseenLocal = prev.filter(s => !cloudIds.has(s.id) && !s.id.includes('-'));
            return [...unseenLocal, ...hydratedCloud];
          });
        } else {
          // No cloud data – migrate from localStorage
          const localSaved = localStorage.getItem(STORAGE_KEY);
          if (localSaved) {
            try {
              const parsed: any[] = JSON.parse(localSaved);
              if (parsed.length > 0) {
                console.log("Migrating local history to Supabase...");
                for (const sess of parsed) {
                  await supabase.from('chat_sessions').insert({
                    user_id: user.id,
                    title: sess.title,
                    messages: sess.messages,
                    created_at: sess.createdAt,
                    updated_at: sess.updatedAt
                  });
                }
                fetchSessions();
              }
            } catch (e) {
              console.error("Migration failed", e);
            }
          }
        }
      } catch (err) {
        console.error("Unexpected error in fetchSessions", err);
      }
    };

    fetchSessions();
  }, [user?.id]); // Use user.id (stable string) not user object — token refreshes create new object refs and would re-fetch, wiping video data from state

  // Derived State: Current Messages
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession ? currentSession.messages : [];

  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelId>('gemini');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isSkillSelectorOpen, setIsSkillSelectorOpen] = useState(false);
  const [isRubricBuilderOpen, setIsRubricBuilderOpen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [skillMode, setSkillMode] = useState<SkillMode>('fms');

  // Seesaw-Style Classroom & Peer-Coaching States
  const [appMode, setAppMode] = useState<'home_screen' | 'chat' | 'teacher_board' | 'peer_coaching'>('home_screen');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isPairCheckInOpen, setIsPairCheckInOpen] = useState(false);
  const [scannedLessonData, setScannedLessonData] = useState<{ lessonId: string; title: string; skillName: string; teacherId?: string }>({
    lessonId: 'pe-lesson-today',
    title: 'Overhand Throw Practice',
    skillName: 'Overhand Throw',
  });
  const [activePairSession, setActivePairSession] = useState<PairSessionData | null>(null);
  const [activePeerSessionData, setActivePeerSessionData] = useState<CompletedPeerSession | null>(null);
  const [claimedPairNumbers, setClaimedPairNumbers] = useState<Set<number>>(new Set());
  const [checkInModalKey, setCheckInModalKey] = useState(0);
  const [teacherFeedbackBanner, setTeacherFeedbackBanner] = useState<string | null>(null);
  const lastSeenTeacherFeedbackRef = useRef<string | null>(null);
  // Set once we confirm the active pair has already submitted a recording — enables the
  // "back to AI Coach chat" path on the home screen so the student can see teacher feedback.
  const [activePairSubmission, setActivePairSubmission] = useState<PairSubmissionRecord | null>(null);

  const handlePeerSessionToChat = async (data: CompletedPeerSession) => {
    setActivePeerSessionData(data);
    setAppMode('chat');

    const bananaMet = Object.values(data.bananaCues).filter(Boolean).length;
    const bananaTotal = Object.keys(data.bananaCues).length;
    const appleMet = Object.values(data.appleCues).filter(Boolean).length;
    const appleTotal = Object.keys(data.appleCues).length;

    const newSessionId = `peer-coach-p${data.pairNumber}-${Date.now()}`;
    const loadingMsgId = `msg-loading-${Date.now()}`;

    // Show loading card immediately
    const loadingMsg: Message = {
      id: loadingMsgId,
      sender: Sender.BOT,
      timestamp: new Date(),
      text: `## 🤖 Coach Bot is watching your videos...\n\n**Pair #${data.pairNumber} — ${data.skillName}**\n\n⏳ Extracting video frames...\n\n*This takes about 10–15 seconds. Hold tight!* 🎬`,
      hasMedia: false,
    };

    const newSession: ChatSession = {
      id: newSessionId,
      title: `🍎🍌 Pair #${data.pairNumber} - ${data.skillName}`,
      messages: [loadingMsg],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSessionId);
    currentSessionIdRef.current = newSessionId;

    // Update a specific message's text in the loading session
    const updateLoadingMsg = (progressText: string) => {
      setSessions((prev) => prev.map(s =>
        s.id === newSessionId
          ? {
              ...s,
              messages: s.messages.map(m =>
                m.id === loadingMsgId
                  ? { ...m, text: `## 🤖 Coach Bot is watching your videos...\n\n**Pair #${data.pairNumber} — ${data.skillName}**\n\n✅ ${progressText}\n\n*Almost done! 🎬*` }
                  : m
              )
            }
          : s
      ));
    };

    try {
      const result = await runPeerCoachingAnalysis(
        data.skillName,
        data.bananaVideoBlob || null,
        data.appleVideoBlob || null,
        data.bananaCues,
        data.appleCues,
        updateLoadingMsg
      );

      const discrepancyNote = result.teacherReport.discrepancies.length > 0
        ? `\n\n> ⚠️ **${result.teacherReport.discrepancies.length} peer vs AI disagreement${result.teacherReport.discrepancies.length > 1 ? 's' : ''} detected** — check Teacher Review Tray for details`
        : '';

      const coachingCard: Message = {
        id: `msg-coaching-${Date.now()}`,
        sender: Sender.BOT,
        timestamp: new Date(),
        text: `## 🏆 AI Coach Feedback — Pair #${data.pairNumber}\n\n**Peer Scores:** 🍌 Banana ${bananaMet}/${bananaTotal} | 🍎 Apple ${appleMet}/${appleTotal}\n\n---\n\n🍌 **Banana:** ${result.studentFeedback.bananaFeedback}\n\n🍎 **Apple:** ${result.studentFeedback.appleFeedback}${discrepancyNote}\n\n---\n*Detailed analysis sent to your teacher's review tray! 🏫*`,
        hasMedia: true,
        analysisFrames: [...data.bananaPoseFrames.slice(0, 2), ...data.applePoseFrames.slice(0, 2)],
      };

      // Swap loading card out for the real coaching card
      setSessions((prev) => prev.map(s =>
        s.id === newSessionId
          ? { ...s, messages: [coachingCard], updatedAt: new Date() }
          : s
      ));

      // Save AI results to IndexedDB on the pair's submission record
      const submissionId = canonicalSubmissionId(data.lessonId, data.pairNumber, data.skillName);
      try {
        const db = await getDB();
        const existing = await db.get('submissions', submissionId);
        if (existing) {
          existing.aiStudentFeedback = {
            bananaFeedback: result.studentFeedback.bananaFeedback,
            appleFeedback: result.studentFeedback.appleFeedback,
            generatedAt: new Date().toISOString(),
            modelUsed: 'gemini-2.5-flash',
          };
          existing.aiTeacherReport = {
            bananaAnalysis: result.teacherReport.bananaAnalysis,
            appleAnalysis: result.teacherReport.appleAnalysis,
            bananaProficiency: result.teacherReport.bananaProficiency,
            appleProficiency: result.teacherReport.appleProficiency,
            teacherRecommendations: result.teacherReport.teacherRecommendations,
            discrepancies: result.teacherReport.discrepancies,
            generatedAt: new Date().toISOString(),
            modelUsed: 'gemini-2.5-flash',
          };
          await db.put('submissions', existing);
          // Push the enriched record to Supabase so the teacher's board (another device) sees the AI report
          backupSubmissionToSupabase(existing, activePairSession?.teacherId, getOrCreatePairClaimToken(data.lessonId)).catch(console.warn);
        }
      } catch (e) {
        console.warn('Could not save AI report to submission:', e);
      }

    } catch (e) {
      console.warn('AI coaching analysis failed:', e);
      // Fallback — replace loading with a simple peer-score card (no AI)
      const fallbackCard: Message = {
        id: `msg-fallback-${Date.now()}`,
        sender: Sender.BOT,
        timestamp: new Date(),
        text: `## 🏆 Pair #${data.pairNumber} — ${data.skillName}\n\n**Peer Scores:** 🍌 Banana ${bananaMet}/${bananaTotal} | 🍎 Apple ${appleMet}/${appleTotal}\n\nGreat teamwork! Your evaluation has been sent to the teacher. 🏫\n\n*AI analysis was unavailable — ask your teacher for detailed feedback!*`,
        hasMedia: false,
      };
      setSessions((prev) => prev.map(s =>
        s.id === newSessionId
          ? { ...s, messages: [fallbackCard], updatedAt: new Date() }
          : s
      ));
    }
  };

  // "🤝 Peer Assessment Checklist" bot card shown just before the AI grading.
  const buildPeerChecklistMessage = (performer: 'Apple' | 'Banana', skillName: string): Message => {
    // Same lookup the recording screen used — falls back to the default cues for skills
    // (Bounce, Bounce pass) that aren't in OFFICIAL_FMS_PEER_CUES, so the card can't read 0/0.
    const cues = getAllCuesForSkill(skillName);
    const rated = (performer === 'Apple' ? activePeerSessionData?.appleCues : activePeerSessionData?.bananaCues) || {};
    const lines = cues.length > 0
      ? cues.map(c => `- ${rated[c.id] ? '✅' : '❌'} ${c.itemNumber}. ${c.syllabusCriterion}`).join('\n')
      : '_No peer cues were recorded for this skill._';
    const met = cues.filter(c => rated[c.id]).length;
    return {
      id: `peer-checklist-${performer}-${Date.now()}`,
      sender: Sender.BOT,
      timestamp: new Date(),
      text: `## 🤝 Peer Assessment Checklist — ${performer}\n\n**Partner scored ${met}/${cues.length} cues**\n\n${lines}\n\n---\n*Below: 🤖 **AI Assessment Checklist** — graded against the full 2024 MOE PE Syllabus rubric.*`,
      hasMedia: false,
    };
  };

  // Full performer clip: in-memory if fresh, otherwise re-downloaded from the clip the
  // pair uploaded to Supabase on Submit (memory is wiped on a page refresh).
  const fetchPerformerVideoBlob = async (performer: 'Apple' | 'Banana'): Promise<Blob | null> => {
    const inMemory = performer === 'Apple' ? activePeerSessionData?.appleVideoBlob : activePeerSessionData?.bananaVideoBlob;
    if (inMemory && inMemory.size > 0) return inMemory;

    const pair = activePairSession;
    if (!pair) return null;
    const skillName = activePeerSessionData?.skillName || pair.skillName || scannedLessonData.skillName || 'Overhand Throw';
    const subId = canonicalSubmissionId(pair.lessonId, pair.pairNumber, skillName);
    const col = performer === 'Apple' ? 'apple_video_url' : 'banana_video_url';
    try {
      const { data } = await supabase.from('pair_submissions').select(col).eq('id', subId).maybeSingle();
      const url = (data as Record<string, string> | null)?.[col];
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  };

  const handleAnalyzePeerPerformer = async (performer: 'Banana' | 'Apple') => {
    if (!activePeerSessionData) return;
    const skillName = activePeerSessionData.skillName;

    // 1. Peer assessment checklist card
    const peerMsg = buildPeerChecklistMessage(performer, skillName);
    updateSessionAndSync(currentSessionIdRef.current, session => ({
      ...session,
      messages: [...session.messages, peerMsg],
      updatedAt: new Date(),
    }));

    // 2. Full recorded clip → 12-frame extraction + rubric grading (same pipeline as the
    //    main chatbot video flow). Falls back to the 3 tracked pose frames if the clip is gone.
    const blob = await fetchPerformerVideoBlob(performer);
    let files: File[] | undefined;
    if (blob && blob.size > 0) {
      files = [new File([blob], `${performer.toLowerCase()}_attempt.mp4`, { type: 'video/mp4' })];
      console.log(`[PeerAnalyze] ${performer}: using full video clip (${Math.round(blob.size / 1024)} KB) → 12-frame grading`);
    } else {
      const frames = performer === 'Banana' ? activePeerSessionData.bananaPoseFrames : activePeerSessionData.applePoseFrames;
      if (frames && frames.length > 0) {
        files = frames.map((frame, idx) => base64ToFile(frame, `${performer.toLowerCase()}_frame_${idx + 1}.jpg`));
      }
      console.warn(`[PeerAnalyze] ${performer}: no video clip available (memory wiped + cloud fetch failed) — falling back to ${files?.length ?? 0} pose frames`);
    }

    if (!files || files.length === 0) {
      updateSessionAndSync(currentSessionIdRef.current, session => ({
        ...session,
        messages: [...session.messages, {
          id: `no-media-${Date.now()}`,
          sender: Sender.BOT,
          timestamp: new Date(),
          text: `⚠️ I couldn't load ${performer}'s recording for analysis. Tap **📹 Record again** to capture a fresh attempt, then try analysing.`,
          isError: true,
        }],
        updatedAt: new Date(),
      }));
      return;
    }

    // Peer flow has no individual student context — don't let a stale ref mis-save the analysis
    activeStudentContextRef.current = null;

    const text = `Coach, grade ${performer}'s ${skillName} against the full 2024 MOE PE Syllabus checklist. Assess every performance criterion with frame evidence, then state the proficiency level.`;
    await handleSendMessage(text, files, { skillName, isVerified: true });
  };

  // Student sends a full AI rubric analysis from the Practice Station to the teacher's
  // board — one slot per performer so Apple's and Banana's don't overwrite each other.
  const handleSubmitChecklistToTeacher = async (message: Message) => {
    // Identifiers come from the active pair session, or fall back to the completed
    // peer-session data (which carries pairNumber/lessonId/skill but no teacherId).
    const ctx = activePairSession
      ? {
          lessonId: activePairSession.lessonId,
          pairNumber: activePairSession.pairNumber,
          skillName: activePairSession.skillName || activePeerSessionData?.skillName || scannedLessonData.skillName || 'Overhand Throw',
          pairPhoto: activePairSession.pairPhoto || activePeerSessionData?.pairPhoto || '',
          teacherId: activePairSession.teacherId,
        }
      : activePeerSessionData
        ? {
            lessonId: activePeerSessionData.lessonId,
            pairNumber: activePeerSessionData.pairNumber,
            skillName: activePeerSessionData.skillName,
            pairPhoto: activePeerSessionData.pairPhoto || '',
            teacherId: scannedLessonData.teacherId as string | undefined,
          }
        : null;
    if (!ctx) {
      setTeacherFeedbackBanner('Join a pair station (scan the class QR) before sending work to your teacher.');
      return;
    }
    const skillName = ctx.skillName;
    const subId = canonicalSubmissionId(ctx.lessonId, ctx.pairNumber, skillName);

    // Which performer is this analysis about? Read the user prompt just above it.
    let performer: 'Apple' | 'Banana' = 'Apple';
    const sess = sessionsRef.current.find(s => s.id === currentSessionIdRef.current);
    if (sess) {
      const idx = sess.messages.findIndex(m => m.id === message.id);
      const priorUser = [...sess.messages.slice(0, idx < 0 ? sess.messages.length : idx)]
        .reverse()
        .find(m => m.sender === Sender.USER);
      if (priorUser && /\bbanana\b/i.test(priorUser.text)) performer = 'Banana';
    }

    // Peer ratings still held in the live session. The per-clip "Save to Teacher" button
    // (uploadGuestVideo) creates the submission row without cues, so if the pair never
    // tapped the final "Submit to Teacher" the checklist would otherwise never reach the
    // teacher's board. Carry it here so this path is self-sufficient.
    const ratedToCueResults = (rated?: Record<string, boolean>): PeerCueResult[] => {
      if (!rated || Object.keys(rated).length === 0) return [];
      return getAllCuesForSkill(skillName).map(c => ({
        cueIndex: c.itemNumber,
        criterionText: c.syllabusCriterion,
        isObserved: !!rated[c.id],
      }));
    };
    // appleRole = Apple evaluating Banana, so it carries the ratings ABOUT Banana.
    const bananaPerformerCues = ratedToCueResults(activePeerSessionData?.bananaCues);
    const applePerformerCues = ratedToCueResults(activePeerSessionData?.appleCues);

    const db = await getDB();
    let record = await db.get('submissions', subId) as PairSubmissionRecord | undefined;
    if (!record) {
      record = {
        id: subId,
        lessonId: ctx.lessonId,
        pairNumber: ctx.pairNumber,
        skillName,
        pairPhoto: ctx.pairPhoto,
        appleRole: { studentPerformer: 'Banana', evaluator: 'Apple', cues: bananaPerformerCues },
        bananaRole: { studentPerformer: 'Apple', evaluator: 'Banana', cues: applePerformerCues },
        status: 'pending_sync',
        createdAt: new Date().toISOString(),
      };
    } else {
      // Existing record but the peer checklist never made it (clip-by-clip save path)
      if (!record.appleRole.cues?.length && bananaPerformerCues.length) {
        record.appleRole = { ...record.appleRole, cues: bananaPerformerCues };
      }
      if (!record.bananaRole.cues?.length && applePerformerCues.length) {
        record.bananaRole = { ...record.bananaRole, cues: applePerformerCues };
      }
    }
    const entry: AiChatAnalysisEntry = {
      analysisText: message.text,
      skillName,
      studentLabel: performer,
      modelUsed: selectedModel,
      submittedAt: new Date().toISOString(),
    };
    record.aiChatAnalysis = {
      ...(record.aiChatAnalysis || {}),
      [performer === 'Apple' ? 'apple' : 'banana']: entry,
    };
    await queuePairSubmission(record);
    await backupSubmissionToSupabase(record, ctx.teacherId, getOrCreatePairClaimToken(ctx.lessonId));
    setTeacherFeedbackBanner(null);
    lastSeenTeacherFeedbackRef.current = null; // so the teacher's reply re-triggers the banner
  };

  // While in a Practice Station, poll the pair's submission row for a teacher comment.
  useEffect(() => {
    const src = activePairSession ?? (activePeerSessionData
      ? { lessonId: activePeerSessionData.lessonId, pairNumber: activePeerSessionData.pairNumber, skillName: activePeerSessionData.skillName }
      : null);
    if (!src) return;
    const skillName = src.skillName || scannedLessonData.skillName || 'Overhand Throw';
    const subId = canonicalSubmissionId(src.lessonId, src.pairNumber, skillName);

    const poll = async () => {
      const { data } = await supabase
        .from('pair_submissions')
        .select('teacher_feedback')
        .eq('id', subId)
        .maybeSingle();
      const fb = data?.teacher_feedback?.trim();
      if (fb && fb !== lastSeenTeacherFeedbackRef.current) {
        lastSeenTeacherFeedbackRef.current = fb;
        setTeacherFeedbackBanner(fb);
      }
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePairSession?.pairNumber, activePairSession?.lessonId, activePeerSessionData, appMode]);

  // When the check-in modal opens, load which pair numbers are already taken so the
  // student can't pick one another group is using.
  useEffect(() => {
    if (!isPairCheckInOpen) return;
    let cancelled = false;
    fetchClaimedPairNumbers(scannedLessonData.teacherId, scannedLessonData.lessonId)
      .then((nums) => { if (!cancelled) setClaimedPairNumbers(nums); })
      .catch(() => { /* non-fatal — modal just won't grey out taken numbers */ });
    return () => { cancelled = true; };
  }, [isPairCheckInOpen, scannedLessonData.teacherId, scannedLessonData.lessonId]);

  // Check whether the active (restored) pair already submitted a recording — so the home
  // screen can offer "back to AI Coach chat" instead of only "record again".
  useEffect(() => {
    const pair = activePairSession;
    if (!pair) { setActivePairSubmission(null); return; }
    const skillName = pair.skillName || scannedLessonData.skillName || 'Overhand Throw';
    const subId = canonicalSubmissionId(pair.lessonId, pair.pairNumber, skillName);
    let cancelled = false;
    (async () => {
      let sub: PairSubmissionRecord | null = null;
      try { sub = (await (await getDB()).get('submissions', subId)) as PairSubmissionRecord ?? null; } catch { /* ignore */ }
      if (!sub) {
        try {
          const { data } = await supabase.from('pair_submissions').select('*').eq('id', subId).maybeSingle();
          if (data) sub = data as unknown as PairSubmissionRecord;
        } catch { /* ignore */ }
      }
      if (!cancelled) setActivePairSubmission(sub);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePairSession?.pairNumber, activePairSession?.lessonId, appMode]);

  const peerCuesToMap = (skillName: string, list?: { cueIndex: number; isObserved: boolean }[]): Record<string, boolean> => {
    const cues = getAllCuesForSkill(skillName);
    return Object.fromEntries(
      cues.map(c => [c.id, !!list?.find(r => r.cueIndex === c.itemNumber)?.isObserved])
    );
  };

  // Restore the Practice Station chat (AI coach + teacher feedback) for a pair that has
  // already recorded. Video clips are re-fetched from Supabase on demand.
  const handleResumePracticeChat = async () => {
    const pair = activePairSession;
    if (!pair) return;
    const skillName = pair.skillName || activePairSubmission?.skillName || scannedLessonData.skillName || 'Overhand Throw';
    const sub = activePairSubmission;

    setActivePeerSessionData({
      pairNumber: pair.pairNumber,
      lessonId: pair.lessonId,
      skillName,
      pairPhoto: pair.pairPhoto || sub?.pairPhoto || '',
      applePoseFrames: [],
      bananaPoseFrames: [],
      appleCues: peerCuesToMap(skillName, sub?.bananaRole?.cues),
      bananaCues: peerCuesToMap(skillName, sub?.appleRole?.cues),
    });

    // Reuse the pair's existing chat if it's still in the list, else start a fresh one
    const existing = sessions.find(
      s => s.id.startsWith(`peer-coach-p${pair.pairNumber}-`) || (s.title || '').includes(`Pair #${pair.pairNumber}`)
    );
    if (existing) {
      setCurrentSessionId(existing.id);
      currentSessionIdRef.current = existing.id;
    } else {
      const id = `peer-coach-p${pair.pairNumber}-${Date.now()}`;
      const welcome: Message = {
        id: `resume-${Date.now()}`,
        sender: Sender.BOT,
        timestamp: new Date(),
        text: `## 🍎🍌 Practice Station — Pair #${pair.pairNumber}\n\nWelcome back! Tap **🍌 Analyze Banana's Form** or **🍎 Analyze Apple's Form** for a full AI grading, then **📤 Send to Teacher for Grading**. Your teacher's feedback shows up here.`,
        hasMedia: false,
      };
      setSessions(prev => [
        { id, title: `🍎🍌 Pair #${pair.pairNumber} - ${skillName}`, messages: [welcome], createdAt: new Date(), updatedAt: new Date() },
        ...prev,
      ]);
      setCurrentSessionId(id);
      currentSessionIdRef.current = id;
    }
    setAppMode('chat');
  };

  // Shared handler for both PairCheckInModal instances — merges QR context, then
  // syncs the check-in to Supabase so the teacher's board (another device) shows it live.
  const handleCompleteCheckIn = async (pairData: PairSessionData) => {
    const merged: PairSessionData = {
      ...pairData,
      teacherId: pairData.teacherId ?? scannedLessonData.teacherId,
      skillName: pairData.skillName ?? scannedLessonData.skillName,
    };
    const claimToken = getOrCreatePairClaimToken(merged.lessonId);

    const { blocked } = await upsertPairCheckIn({
      lessonId: merged.lessonId,
      pairNumber: merged.pairNumber,
      skillName: merged.skillName,
      teacherId: merged.teacherId,
      pairPhoto: merged.pairPhoto,
      needsHelp: merged.needsHelp,
      claimToken,
    }).catch((e) => { console.warn(e); return { blocked: false }; });

    if (blocked) {
      // Another group already owns this pair number — bounce back to pick another.
      await clearActivePairSession().catch(() => { /* ignore */ });
      try { window.alert(`Pair ${merged.pairNumber} is already in use by another group. Please choose a different pair number.`); } catch { /* ignore */ }
      const nums = await fetchClaimedPairNumbers(merged.teacherId, merged.lessonId).catch(() => new Set<number>());
      setClaimedPairNumbers(nums);
      setCheckInModalKey((k) => k + 1); // remount the modal → back to SELECT_PAIR
      return;
    }

    setActivePairSession(merged);
    setIsPairCheckInOpen(false);
    setAppMode('peer_coaching');
  };

  const handleSignalPairNeedsHelp = () => {
    const pair = activePairSession;
    if (!pair) return;
    upsertPairCheckIn({
      lessonId: pair.lessonId,
      pairNumber: pair.pairNumber,
      skillName: pair.skillName,
      teacherId: pair.teacherId,
      pairPhoto: pair.pairPhoto,
      needsHelp: true,
      claimToken: getOrCreatePairClaimToken(pair.lessonId),
    }).catch(console.warn);
  };

  // Restore active pair session from IndexedDB if iPad reloads
  useEffect(() => {
    getActivePairSession().then((session) => {
      if (session) {
        setActivePairSession(session);
      }
    });
  }, []);

  // Persist skillMode into the current session whenever it changes
  useEffect(() => {
    if (!currentSessionId) return;
    updateSessionAndSync(currentSessionId, session => ({
      ...session,
      skillMode,
      updatedAt: new Date(),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillMode, currentSessionId]);

  // Restore skillMode when switching sessions
  useEffect(() => {
    const session = sessions.find(s => s.id === currentSessionId);
    setSkillMode(session?.skillMode ?? 'fms');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  // Ref to always have the latest currentSessionId in async callbacks
  const currentSessionIdRef = React.useRef(currentSessionId);
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Sync Current Session ID if sessions change
  useEffect(() => {
    if (!sessions.find(s => s.id === currentSessionId) && sessions.length > 0) {
      setCurrentSessionId(sessions[0].id);
    } else if (sessions.length === 0) {
      handleNewSession();
    }
  }, [sessions, currentSessionId]);

  // Persistence to LocalStorage (Instant Feedback)
  useEffect(() => {
    // Keep only the 10 most recent sessions to avoid quota exhaustion.
    // Strip all media binary data — videos live in sessionStorage / Supabase Storage.
    const recentSessions = [...sessions]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);

    const safeSessions = recentSessions.map(s => ({
      ...s,
      messages: s.messages.map(m => ({
        ...m,
        media: m.media?.map(media => {
          // Cache video base64 in sessionStorage so it survives same-tab refresh
          if (media.type === 'video' && media.data && media.data.startsWith('data:')) {
            try {
              sessionStorage.setItem(`video_cache_${media.id}`, media.data);
            } catch (_) { /* sessionStorage quota exceeded – skip */ }
          }
          return {
            ...media,
            data: '',           // Strip video/image base64
            thumbnailData: undefined, // Strip thumbnails — accumulated across sessions they exceed quota
          };
        }),
        analysisFrames: [] // STRIP DATA
      }))
    }));

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSessions));
    } catch (e) {
      console.warn("LocalStorage Quota Exceeded.", e);
    }
  }, [sessions]);


  // Session Management Actions
  const handleNewSession = async () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Chat',
      messages: [getWelcomeMessage()],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    // Sync to Supabase and swap temp ID for real UUID
    if (user) {
      const { data, error } = await supabase.from('chat_sessions').insert({
        user_id: user.id,
        title: newSession.title,
        messages: newSession.messages
      }).select().single();

      if (!error && data) {
        const realId = data.id;
        // Record the mapping so pending syncs can use the real ID
        tempToRealIdRef.current[newId] = realId;

        // Swap temp ID for real UUID in state and ref
        setSessions(prev => prev.map(s => s.id === newId ? { ...s, id: realId } : s));
        if (currentSessionIdRef.current === newId) {
          currentSessionIdRef.current = realId;
          setCurrentSessionId(realId);
        }

        // Flush any messages that were queued while waiting for the real UUID
        const queued = pendingSyncRef.current.filter(s => s.id === newId);
        pendingSyncRef.current = pendingSyncRef.current.filter(s => s.id !== newId);
        for (const pending of queued) {
          const cloudMessages = pending.messages.map(m => ({
            ...m,
            media: m.media?.map(med => ({ ...med, data: '', thumbnailData: undefined })),
            analysisFrames: []
          }));
          await supabase.from('chat_sessions').update({
            title: pending.title,
            messages: cloudMessages,
            updated_at: new Date().toISOString()
          }).eq('id', realId);
        }
      }
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      setSessions(remaining);
      
      if (user && sessionId.includes('-')) { // UUIDs have hyphens, local IDs are numeric Date.now()
         await supabase.from('chat_sessions').delete().eq('id', sessionId);
      }
    }
  };

  const syncSessionToSupabase = async (session: ChatSession) => {
    if (!user) return;

    // Resolve temp IDs to real UUIDs if the mapping is known
    const resolvedId = tempToRealIdRef.current[session.id] || session.id;

    if (!resolvedId.includes('-')) {
      // Real UUID not yet available – queue this sync to flush after Supabase responds
      console.log(`⏳ Queuing sync for temp session ${session.id} until real UUID is assigned`);
      // Replace any existing queued entry for this session with the latest state
      pendingSyncRef.current = [
        ...pendingSyncRef.current.filter(s => s.id !== session.id),
        session
      ];
      return;
    }

    // Strip heavy data for cloud storage
    const cloudMessages = session.messages.map(m => ({
      ...m,
      media: m.media?.map(med => ({ ...med, data: '', thumbnailData: undefined })),
      analysisFrames: []
    }));

    const { error } = await supabase.from('chat_sessions').update({
       title: session.title,
       messages: cloudMessages,
       updated_at: new Date().toISOString()
    }).eq('id', resolvedId);

    if (error) {
      console.error("Failed to sync session to Supabase:", error);
    }
  };

  // A clean utility to safely update a session's state and trigger its associated sync side-effect 
  // without coupling it to React's internal asynchronous rendering lifecycle.
  const updateSessionAndSync = (
    targetSessionId: string,
    updater: (session: ChatSession) => ChatSession
  ) => {
    // 1. Resolve to permanent UUID if a mapping exists (to handle temp -> real ID transitions)
    const resolvedId = tempToRealIdRef.current[targetSessionId] || targetSessionId;

    // 2. Read synchronously from the latest stored ref (bypassing stale closures)
    const currentSessions = sessionsRef.current;
    const sessionToUpdate = currentSessions.find(s => s.id === resolvedId);
    
    if (!sessionToUpdate) return;
    
    // 3. Compute the new state strictly once
    const updatedSession = updater(sessionToUpdate);
    
    // 4. Update the React UI
    setSessions(prev => prev.map(s => s.id === resolvedId ? updatedSession : s));
    
    // 5. Fire external side-effect cleanly (isolated from React's state setter internals)
    syncSessionToSupabase(updatedSession);
  };

  const handleUpdateCurrentSession = (updatedMessages: Message[], newTitle?: string) => {
    updateSessionAndSync(currentSessionIdRef.current, session => ({
      ...session,
      messages: updatedMessages,
      title: newTitle || session.title,
      updatedAt: new Date()
    }));
  };


  // -------------------------------------------------------------------------------- //
  //  Existing Logic Adapted for Multi-Session
  // -------------------------------------------------------------------------------- //

  // Toggle Dark Mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading, isProcessing]);

  // Load Image Helper
  const loadImageFromUrl = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  // File to Base64 Helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processMediaFiles = async (
    files: File[],
    metadata?: { startTime?: number; endTime?: number }
  ): Promise<{ attachments: MediaAttachment[], poseData: PoseData[], analysisFrames: MediaData[], debugFrames: string[] }> => {
    const attachments: MediaAttachment[] = [];
    const processedImages: { img: HTMLImageElement, pose: any, ball: any, timestamp: number }[] = [];

    // Phase 1: Fast Path (Attachments only for UI)
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file);
        attachments.push({
          id: Date.now().toString() + Math.random(),
          type: 'image',
          mimeType: file.type,
          data: base64,
          fileName: file.name
        });
      } else if (file.type.startsWith('video/')) {
        // Store as base64 so the video survives page refreshes and session restores.
        // Blob URLs are ephemeral and become invalid after the page unloads.
        const videoBase64 = await fileToBase64(file);
        // Fast thumbnail (first frame only)
        const thumbnails = await extractVideoFrames(file, 1);
        const videoId = Date.now().toString() + Math.random();
        // Cache in the permanent in-memory ref so Supabase re-fetch can re-hydrate
        videoDataCacheRef.current.set(videoId, videoBase64);
        attachments.push({
          id: videoId,
          type: 'video',
          mimeType: file.type,
          data: videoBase64,
          fileName: file.name,
          thumbnailData: thumbnails[0]
        });
      } else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const text = await parseDocument(file);
        attachments.push({
          id: Date.now().toString() + Math.random(),
          type: 'document',
          mimeType: file.type,
          data: '',
          fileName: file.name,
          textContent: text
        });
      }
    }

    return { attachments, poseData: [], analysisFrames: [], debugFrames: [] };
  };

  const runBackgroundAnalysis = async (
    originatingSessionId: string,
    messageId: string,
    files: File[],
    metadata?: { startTime?: number; endTime?: number }
  ): Promise<{ poseData: PoseData[], analysisFrames: MediaData[] }> => {
    setIsProcessing(true);
    try {
      const processedImages: { img: HTMLImageElement, pose: any, ball: any, timestamp: number }[] = [];
      const debugFrames: string[] = [];
      const analysisFrames: MediaData[] = [];
      let rawVideoFrames: string[] = []; // fallback if no pose detected

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const base64 = await fileToBase64(file);
          const img = await loadImageFromUrl(base64);
          const pose = await poseDetectionService.detectPoseFromImage(img);
          const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);
          if (pose) processedImages.push({ img, pose, ball: ball || undefined, timestamp: 0 });

        } else if (file.type.startsWith('video/')) {
          const frameCount = 12;
          const frames = await extractVideoFrames(file, frameCount, metadata?.startTime, metadata?.endTime);
          rawVideoFrames = frames; // keep for fallback
          for (let i = 0; i < frames.length; i++) {
            const img = await loadImageFromUrl(frames[i]);
            try {
              const pose = await poseDetectionService.detectPoseFromImage(img);
              const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);
              if (pose) {
                processedImages.push({ img, pose, ball: ball || undefined, timestamp: i });
              } else {
                console.warn(`⚠️ No pose detected in frame ${i}`);
              }
            } catch (frameError) {
              console.error(`❌ Error processing frame ${i}:`, frameError);
            }
          }
        }
      }

      const poseData = processedImages.map(p => ({ ...p.pose, timestamp: p.timestamp, ball: p.ball }));

      for (let i = 0; i < processedImages.length; i++) {
        const data = processedImages[i];
        const filteredPose = poseData[i];
        const debugFrame = await poseDetectionService.drawPoseToImage(data.img, filteredPose, filteredPose.ball);
        if (debugFrame) {
          debugFrames.push(debugFrame);
          analysisFrames.push({ mimeType: 'image/jpeg', data: debugFrame });
        }
      }

      // If MediaPipe couldn't detect any pose, fall back to raw frames so
      // Gemini still receives visual context instead of returning an empty response.
      if (analysisFrames.length === 0 && rawVideoFrames.length > 0) {
        console.warn('⚠️ No poses detected — sending raw frames to Gemini as fallback');
        for (const frame of rawVideoFrames.slice(0, 6)) {
          analysisFrames.push({ mimeType: 'image/jpeg', data: frame });
        }
      }


      // Final Update to the Session Message (Visuals)
      updateSessionAndSync(originatingSessionId, session => ({
        ...session,
        messages: session.messages.map(m => 
          m.id === messageId ? { ...m, poseData: poseData, analysisFrames: debugFrames } : m
        )
      }));


      return { poseData, analysisFrames };

    } catch (e) {
      console.error("Background analysis failed", e);
      return { poseData: [], analysisFrames: [] };
    } finally {
      setIsProcessing(false);
    }
  };

  const extractVideoFrames = (
    file: File,
    numFrames: number = 12,
    startTime?: number,
    endTime?: number
  ): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const frames: string[] = [];

      video.preload = 'metadata';
      video.src = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        const MAX_DIMENSION = 640;
        let width = video.videoWidth;
        let height = video.videoHeight;
        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        canvas.width = width;
        canvas.height = height;

        const start = startTime !== undefined ? startTime : 0;
        const end = endTime !== undefined ? endTime : video.duration;
        const duration = Math.max(0, end - start);
        const interval = duration / (numFrames + 1);
        let currentFrame = 0;

        const captureFrame = () => {
          if (currentFrame >= numFrames) {
            URL.revokeObjectURL(video.src);
            resolve(frames);
            return;
          }
          const time = start + (interval * (currentFrame + 0.5));
          video.currentTime = Math.min(time, end);
        };

        video.onseeked = () => {
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL('image/jpeg', 0.8));
          }
          currentFrame++;
          captureFrame();
        };

        video.onerror = () => reject(new Error('Failed to load video'));
        captureFrame();
      };
    });
  };

  const handleSendMessage = async (
    text: string,
    files?: File[],
    metadata?: { startTime?: number; endTime?: number; skillName?: string; isVerified?: boolean; studentIndexNumber?: string; studentName?: string; gymnasticsModeConfirmed?: boolean }
  ) => {
    // LOCK TARGET SESSION ID context to heavily prevent "chat-swapping" side effects
    const originatingSessionId = currentSessionIdRef.current;
    
    let isVerifying = metadata?.isVerified;
    let skillContext = metadata?.skillName;

    // --- Student context (Phase 1 only — new video upload) ---
    let studentId: string | undefined;
    let student: Student | null = null;
    let videoHash: string | undefined;
    let videoFile: File | undefined;

    const incomingVideoFile = files?.find(f => f.type.startsWith('video/'));
    if (incomingVideoFile && !isVerifying) {
      // New video being uploaded — resolve student and store context for Phase 2
      console.log('[Student] Phase 1 — metadata:', metadata?.studentIndexNumber, metadata?.studentName, 'user:', !!user);
      if (metadata?.studentIndexNumber && metadata?.studentName && user) {
        try {
          student = await getOrCreateStudent(user.id, {
            indexNumber: metadata.studentIndexNumber,
            name: metadata.studentName,
          });
          studentId = student?.id;
          console.log('[Student] Resolved student:', student?.name, studentId);
        } catch (e) {
          console.warn('[Student] Resolution failed:', e);
        }
      }

      videoFile = incomingVideoFile;
      try {
        videoHash = await computeVideoHash(videoFile);
      } catch (e) {
        console.warn('Video hash failed (non-fatal):', e);
      }

      // Store for Phase 2 (chip click / "yes" / auto-verify all arrive without metadata)
      if (student && studentId) {
        activeStudentContextRef.current = { studentId, student, videoHash, videoFile };
        console.log('[Student] Ref stored:', studentId);
      } else {
        activeStudentContextRef.current = null;
        console.log('[Student] Ref cleared — no student selected or resolution failed');
      }
    }

    // Get fresh messages from state (not from closure)
    const currentSessionNow = sessionsRef.current.find(s => s.id === originatingSessionId);
    const currentMessages = currentSessionNow?.messages || [];

    // Logic for Auto-Verification / Skill Correction
    if (!isVerifying && text) {
      const lowerText = text.toLowerCase().trim();
      const confirmationWords = ['yes', 'correct', 'yup', 'yeah', 'sure', 'confirm'];
      const isConfirmation = confirmationWords.some(w => lowerText === w || lowerText.startsWith(w + ' '));
      const fmsKnownSkills = [
        'underhand throw', 'underhand roll', 'overhand throw', 'kick',
        'dribble with feet', 'dribble with hands', 'chest pass', 'bounce pass', 'bounce', 'above the waist catch',
      ];
      const gymnasticKnownSkills = [
        'hopping', 'galloping', 'sliding', 'running', 'skipping',
        'jumping (vertical)', 'jumping (horizontal)', 'leaping',
      ];
      const knownSkills = skillMode === 'gymnastics' ? gymnasticKnownSkills : fmsKnownSkills;
      const matchedSkill = knownSkills.sort((a, b) => b.length - a.length).find(skill => lowerText.includes(skill));
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg && lastMsg.sender === Sender.BOT && (lastMsg.text.includes("[[SKILL_CHOICES:") || lastMsg.text.includes("[[MULTI_SKILL_CHOICES:"))) {
        if (isConfirmation) {
          isVerifying = true;
          const skillMatch = lastMsg.text.match(/\*\*(.*?)\*\*/);
          if (skillMatch && !skillContext) skillContext = skillMatch[1];
        } else if (matchedSkill) {
          isVerifying = true;
          skillContext = matchedSkill;
        } else if (lastMsg.text.includes("[[MULTI_SKILL_CHOICES:")) {
          // User typed free text after multi-skill chips — treat the identified skills as confirmed
          const multiMatch = lastMsg.text.match(/\[\[MULTI_SKILL_CHOICES:\s*([^\]]+)\]\]/);
          if (multiMatch) {
            isVerifying = true;
            skillContext = multiMatch[1].trim();
          }
        }
      }
    }

    // --- Recover student context for Phase 2 (runs after auto-verify may have flipped isVerifying) ---
    if (isVerifying) {
      console.log('[Student] Phase 2 — ref:', activeStudentContextRef.current?.studentId, 'skillContext:', skillContext);
      if (activeStudentContextRef.current) {
        student = activeStudentContextRef.current.student;
        studentId = activeStudentContextRef.current.studentId;
        videoHash = activeStudentContextRef.current.videoHash;
        videoFile = activeStudentContextRef.current.videoFile;
      }
    }

    let mediaAttachments: MediaAttachment[] | undefined;

    if (files && files.length > 0) {
      const processed = await processMediaFiles(files, metadata);
      mediaAttachments = processed.attachments;
    }

    const newMessageId = Date.now().toString();
    const newMessage: Message = {
      id: newMessageId,
      text: text || (mediaAttachments ? 'Analyze this movement' : ''),
      sender: Sender.USER,
      timestamp: new Date(),
      media: mediaAttachments,
      hasMedia: !!(mediaAttachments && mediaAttachments.length > 0) || currentMessages.some(m => m.media && m.media.length > 0)
    };

    // UPDATE STATE: Optimistic Update (Immediate)
    const optimisticMessages = [...currentMessages, newMessage];

    // Auto-Title Logic on First Message
    let newTitle: string | undefined = undefined;
    if (currentMessages.length <= 1) { // 1 because "Welcome" message is already there
      if (text && text.trim().length > 0) {
        newTitle = text.substring(0, 30) + (text.length > 30 ? '...' : '');
      } else if (skillContext) {
        newTitle = `Analysis: ${skillContext}`;
      } else if (mediaAttachments && mediaAttachments.length > 0) {
        newTitle = 'Media Analysis';
      } else {
        newTitle = 'New Conversation';
      }
    }

    updateSessionAndSync(originatingSessionId, session => ({
      ...session,
      messages: optimisticMessages,
      title: newTitle || session.title,
      updatedAt: new Date()
    }));

    // GYMNASTICS: Ask teacher to confirm individual skill vs sequence before running AI
    if (incomingVideoFile && !isVerifying && skillMode === 'gymnastics' && !metadata?.gymnasticsModeConfirmed) {
      const confirmMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: `Before I analyze, is this an **individual locomotor skill** (e.g. hopping, galloping) or a **gymnastics sequence** (multiple skills linked together)?\n[[SKILL_CHOICES: Individual Skill, Sequence]]`,
        sender: Sender.BOT,
        timestamp: new Date(),
        hasMedia: true,
      };
      pendingGymnasticsRef.current = { files: files!, metadata: metadata ?? {} };
      updateSessionAndSync(originatingSessionId, session => ({
        ...session,
        messages: [...session.messages, confirmMsg],
        updatedAt: new Date(),
      }));
      return;
    }

    setIsLoading(true);

    try {
      let response;
      let contextPoseData: PoseData[] | undefined;
      let contextAnalysisFrames: MediaData[] | undefined;

      // BACKGROUND: Run slow pose detection (Await here so AI waits, but UI is already updated)
      if (files && files.length > 0) {
        const result = await runBackgroundAnalysis(originatingSessionId, newMessageId, files, metadata);
        contextPoseData = result.poseData;
        contextAnalysisFrames = result.analysisFrames;
      }

      if (!contextPoseData || !contextAnalysisFrames) {
        for (let i = currentMessages.length - 1; i >= 0; i--) {
          if (!contextPoseData && currentMessages[i].poseData && currentMessages[i].poseData!.length > 0) {
            contextPoseData = currentMessages[i].poseData;
          }
          if (!contextAnalysisFrames) {
            if (currentMessages[i].analysisFrames && currentMessages[i].analysisFrames!.length > 0) {
              contextAnalysisFrames = currentMessages[i].analysisFrames!.map(f => ({
                mimeType: f.match(/^data:([^;]+);/)?.[1] || 'image/jpeg',
                data: f
              }));
            }
            else if (currentMessages[i].media && currentMessages[i].media!.length > 0) {
              const images = currentMessages[i].media!.filter(m => m.type === 'image');
              if (images.length > 0) {
                contextAnalysisFrames = images.map(img => ({
                  mimeType: img.mimeType,
                  data: img.data
                }));
              }
            }
          }
          if (contextPoseData && contextAnalysisFrames) break;
        }
      }

      const standardHistory = currentMessages.map(m => {
        let content = m.text;
        // Append document content to history if present
        if (m.media) {
          const docs = m.media.filter(a => a.type === 'document' && a.textContent);
          if (docs.length > 0) {
            const docContext = docs.map(d => `\n\n[Document Context: ${d.fileName}]\n${d.textContent}`).join('\n');
            content += docContext;
          }
        }
        return {
          role: m.sender === Sender.USER ? 'user' : 'assistant',
          content: content
        };
      });

      // Prepare current message context
      let promptText = newMessage.text;
      if (newMessage.media) {
        const docs = newMessage.media.filter(a => a.type === 'document' && a.textContent);
        if (docs.length > 0) {
          const docContext = docs.map(d => `\n\n[Document Context: ${d.fileName}]\n${d.textContent}`).join('\n');
          promptText += docContext;
        }
      }

      // --- Phase 2 cache hit: skip LLM if same video+skill already analysed for this student ---
      let isCachedResponse = false;
      if (isVerifying && studentId && videoHash && skillContext) {
        try {
          const cached = await lookupByVideoHash(videoHash, studentId, skillContext);
          if (cached) {
            response = { text: cached.analysisText, groundingChunks: undefined, referenceImageURI: undefined, tokenUsage: 0 };
            isCachedResponse = true;
          }
        } catch (e) {
          console.warn('Cache lookup failed (non-fatal):', e);
        }
      }

      // --- Student memory: inject prior progress summary into Phase 2 ---
      let studentMemory: string | undefined;
      if (isVerifying && student && skillContext && student.progressSummary?.[skillContext]) {
        studentMemory = student.progressSummary[skillContext];
      }

      if (!isCachedResponse) {
        const aiService = getAIService(selectedModel);
        response = await aiService(
          standardHistory,
          promptText,
          contextPoseData,
          contextAnalysisFrames,
          skillContext,
          isVerifying,
          currentSessionIdRef.current,
          teacherProfile,
          studentMemory,
          user?.id,  // Tier 3: pass authenticated teacher's Supabase UUID for memory injection
          skillMode
        );
      }

      // --- Auto-save Phase 2 analysis to Supabase (fire-and-forget) ---
      // Use proficiency level detection — not isVerifying — as the Phase 2 signal.
      // isVerifying is false when Target Skill is pre-filled (AI runs Phase 2 directly
      // without a chip click), so relying on it causes saves to be silently skipped.
      const proficiencyMatch = response.text.match(/\b(Beginning|Developing|Competent|Excellent)\b/i);
      const proficiencyLevel = proficiencyMatch ? proficiencyMatch[1] : undefined;
      if (studentId && skillContext && proficiencyLevel && !isCachedResponse) {
        console.log('[Save] Saving analysis for', studentId, skillContext, proficiencyLevel);
        (async () => {
          let videoStoragePath: string | undefined;
          if (videoFile) {
            try {
              videoStoragePath = await uploadVideoToStorage(videoFile, user!.id, studentId!, skillContext!) ?? undefined;
            } catch (e) {
              console.warn('Video upload failed (non-fatal):', e);
            }
          }
          saveAnalysis({
            studentId: studentId!,
            teacherId: user!.id,
            skillName: skillContext!,
            videoHash,
            videoUrl: videoStoragePath,
            proficiencyLevel,
            analysisText: response!.text,
            sessionId: currentSessionIdRef.current,
            modelId: selectedModel,
            tokenUsage: response!.tokenUsage,
          }).catch(e => console.error('[Save] saveAnalysis failed:', e));
        })();
        // Clear context — analysis saved
        activeStudentContextRef.current = null;
      } else if (studentId && skillContext && !proficiencyLevel) {
        console.log('[Save] Skipped — no proficiency level in response (Phase 1 response, not grading)');
        activeStudentContextRef.current = null;
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: Sender.BOT,
        timestamp: new Date(),
        groundingChunks: selectedModel === 'gemini' ? response.groundingChunks : undefined,
        referenceImageURI: response.referenceImageURI,
        tokenUsage: isCachedResponse ? 0 : response.tokenUsage,
        modelId: selectedModel,
        isCached: isCachedResponse,
        studentId,
        // hasMedia is true if: user uploaded media OR we have pose data/analysis frames
        hasMedia: newMessage.hasMedia || !!(contextPoseData && contextPoseData.length > 0)
      };

      const skillMatch = response.text.match(/(?:I believe this is a|this looks like a|I have detected a|Performance Analysis for) (?:\*\*|)?([^*:\n]+)(?:\*\*|:)?/i);
      const detectedSkill = skillMatch ? skillMatch[1].trim() : undefined;

      // UPDATE STATE: Bot Response
      updateSessionAndSync(originatingSessionId, session => {
        const userMsgIndex = session.messages.findIndex(m => m.id === newMessageId);
        let finalMessages = session.messages;

        if (userMsgIndex !== -1 && detectedSkill) {
          finalMessages = session.messages.map((m, idx) =>
            idx === userMsgIndex ? { ...m, predictedSkill: detectedSkill } : m
          );
        }

        return {
          ...session,
          messages: [...finalMessages, botMessage],
          updatedAt: new Date()
        };
      });


    } catch (error) {
      console.error("Error generating response:", error);
      const rawError = error instanceof Error ? error.message : String(error);
      let errorText: string;

      const lower = rawError.toLowerCase();
      if (lower.includes('429') || lower.includes('rate') && lower.includes('limit')) {
        errorText = "⚠️ You're sending messages too fast. Please wait a moment and try again.";
      } else if (lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('402')) {
        errorText = "⚠️ The AI service has reached its daily usage limit. Please try again later or switch to a different model.";
      } else if (lower.includes('safety') || lower.includes('blocked') || lower.includes('recitation')) {
        errorText = "⚠️ The AI couldn't respond to that — it may have been flagged by safety filters. Try rephrasing your question.";
      } else if (lower.includes('empty') || lower.includes('no response') || lower.includes('no candidates')) {
        errorText = "⚠️ The AI returned an empty response. This can happen with very complex questions — please try rephrasing or breaking it into smaller parts.";
      } else if (lower.includes('api key') || lower.includes('unauthorized') || lower.includes('401')) {
        errorText = "⚠️ API authentication failed. Check the server configuration.";
      } else {
        errorText = `⚠️ Something went wrong: ${rawError}`;
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: errorText,
        sender: Sender.BOT,
        timestamp: new Date(),
        isError: true
      };
      
      updateSessionAndSync(originatingSessionId, session => ({
        ...session,
        messages: [...session.messages, errorMessage],
        updatedAt: new Date()
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (topic: string) => {
    handleSendMessage(`Tell me about ${topic}`);
  };

  const handleSelectMultipleSkills = (skills: string[]) => {
    const skillText = skills.join(', ');
    handleSendMessage(`Analyze ${skillText}`, undefined, { skillName: skillText, isVerified: true });
  };

  const handleAnalyzeConfirm = (message: Message) => {
    const skillName = message.predictedSkill || "Movement";
    handleSendMessage("Analyze Now", undefined, { skillName: skillName, isVerified: true });
  };

  const handleSelectSkill = (skillName: string) => {
    // Handle gymnastics pre-Phase-1 confirmation chips
    if ((skillName === 'Individual Skill' || skillName === 'Sequence') && pendingGymnasticsRef.current) {
      const { files, metadata } = pendingGymnasticsRef.current;
      pendingGymnasticsRef.current = null;
      const text = skillName === 'Sequence'
        ? 'Analyze this gymnastics sequence'
        : 'Analyze this gymnastics locomotor skill';
      handleSendMessage(text, files, { ...metadata, gymnasticsModeConfirmed: true });
      return;
    }

    // Use ref for freshness; only enter Phase 2 if the last bot message was a Phase 1 skill-ID response
    const currentSession = sessionsRef.current.find(s => s.id === currentSessionId);
    const lastBotMsg = currentSession?.messages.filter(m => m.sender === Sender.BOT).at(-1);
    const isInAnalysisFlow = !!(lastBotMsg?.hasMedia && lastBotMsg?.text.includes('[[SKILL_CHOICES:'));

    if (isInAnalysisFlow) {
      handleSendMessage(`Analyze ${skillName}`, undefined, { skillName: skillName, isVerified: true });
    } else {
      handleSendMessage(skillName);
    }
  };

  if (showDashboard) {
    return <Dashboard onOpenChat={() => setShowDashboard(false)} />;
  }

  if (appMode === 'home_screen') {
    return (
      <div className="relative flex flex-col h-screen w-screen bg-slate-950 overflow-hidden">
        {/* Background gradient blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-6 pt-8 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/40">
                <span className="text-white text-xl font-black">PE</span>
              </div>
              <div>
                <p className="text-white font-black text-base leading-tight">SG PE Coach</p>
                <p className="text-slate-400 text-[11px]">2024 MOE Syllabus · AI-Powered</p>
              </div>
            </div>
          </div>

          {/* Hero */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 gap-6 overflow-y-auto">
            <div className="text-center">
              <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-3">Who are you today?</p>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
                Choose your role 👇
              </h1>
            </div>

            {/* Role Cards */}
            <div className="w-full max-w-md flex flex-col gap-4">

              {/* Resume banner — only shown if there's a saved pair session */}
              {activePairSession && (
                <div className="w-full bg-emerald-600/90 rounded-2xl px-4 py-3.5 shadow-lg shadow-emerald-900/30 border border-emerald-400/30 flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🍎🍌</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-black text-sm leading-tight">Pair #{activePairSession.pairNumber} — active session</p>
                      <p className="text-emerald-100/90 text-xs font-medium truncate">
                        {activePairSubmission ? 'Recording submitted · see your AI coach & teacher feedback' : 'Continue where you left off'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await clearActivePairSession();
                        setActivePairSession(null);
                        setActivePeerSessionData(null);
                      }}
                      className="text-emerald-200 hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                    >
                      Clear ✕
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {activePairSubmission && (
                      <button
                        type="button"
                        onClick={handleResumePracticeChat}
                        className="flex-[1.3] px-3 py-2.5 bg-white text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span>💬</span><span>AI Coach &amp; Feedback</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAppMode('peer_coaching')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                        activePairSubmission
                          ? 'flex-1 bg-emerald-500/40 hover:bg-emerald-500/60 text-white border border-emerald-300/40'
                          : 'flex-1 bg-white text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      <span>📹</span><span>{activePairSubmission ? 'Record again' : 'Continue recording'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Student Card — always opens QR scanner for a fresh start */}
              <button
                type="button"
                onClick={() => setIsQrScannerOpen(true)}
                className="group relative w-full text-left bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 hover:scale-[1.02] active:scale-[0.97] rounded-3xl p-6 shadow-2xl shadow-orange-500/30 transition-all duration-200 cursor-pointer overflow-hidden"
              >
                <div className="absolute right-4 top-4 text-5xl opacity-20 group-hover:opacity-30 transition-opacity select-none">🍎🍌</div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🍎🍌</span>
                  <span className="text-xl font-black text-white">I'm a Student</span>
                  <svg className="ml-auto w-5 h-5 text-white/60 shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
                <p className="text-orange-100 text-sm font-semibold leading-relaxed">
                  Scan your teacher's QR code, record your PE moves, and get instant AI + teacher feedback.
                </p>
                <div className="mt-4 flex items-center gap-2 text-white/80 text-xs font-bold flex-wrap">
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">📷 Scan Class QR</span>
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">🎬 Record & Analyse</span>
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">🤖 AI Coach</span>
                </div>
              </button>

              {/* Teacher Card */}
              <button
                type="button"
                onClick={() => {
                  if (user) {
                    setAppMode('teacher_board');
                  } else {
                    signInWithGoogle();
                  }
                }}
                className="group relative w-full text-left bg-gradient-to-br from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 hover:scale-[1.02] active:scale-[0.97] rounded-3xl p-6 shadow-2xl shadow-indigo-600/30 transition-all duration-200 cursor-pointer overflow-hidden"
              >
                <div className="absolute right-4 top-4 text-5xl opacity-20 group-hover:opacity-30 transition-opacity select-none">🏫</div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🏫</span>
                  <span className="text-xl font-black text-white">I'm a Teacher</span>
                  {!user && (
                    <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 font-black text-[10px] rounded-full uppercase tracking-wider">
                      Sign In
                    </span>
                  )}
                  {user && (
                    <span className="px-2.5 py-0.5 bg-emerald-400/30 text-emerald-200 font-bold text-[10px] rounded-full border border-emerald-400/40">
                      Logged In
                    </span>
                  )}
                  <svg className="ml-auto w-5 h-5 text-white/60 shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
                <p className="text-indigo-100 text-sm font-semibold leading-relaxed">
                  {user ? "Run your lesson, review student video submissions live, and query the AI syllabus coach." : "Sign in with Google to project your class QR code and review student video submissions."}
                </p>
                <div className="mt-4 flex items-center gap-2 text-white/80 text-xs font-bold flex-wrap">
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">📺 Project QR</span>
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">📥 Review Tray</span>
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">📊 Class Progress</span>
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">🤖 Syllabus Chat</span>
                </div>
              </button>


              {/* Syllabus & Analysis Chatbot Card */}
              <button
                type="button"
                onClick={() => setAppMode('chat')}
                className="group relative w-full text-left bg-gradient-to-br from-teal-700/80 to-cyan-800/80 hover:from-teal-600/90 hover:to-cyan-700/90 hover:scale-[1.02] active:scale-[0.97] rounded-3xl p-6 shadow-2xl shadow-teal-900/40 border border-teal-600/30 transition-all duration-200 cursor-pointer overflow-hidden"
              >
                <div className="absolute right-4 top-4 text-5xl opacity-20 group-hover:opacity-30 transition-opacity select-none">🤖</div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🤖</span>
                  <span className="text-xl font-black text-white">Syllabus &amp; Analysis</span>
                  <svg className="ml-auto w-5 h-5 text-white/60 shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
                <p className="text-teal-100 text-sm font-semibold leading-relaxed">
                  Ask PE syllabus questions or upload a video for AI movement analysis.
                </p>
                <div className="mt-4 flex items-center gap-2 text-white/80 text-xs font-bold flex-wrap">
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">💬 Ask Syllabus</span>
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">📹 Upload Video</span>
                  <span className="px-2.5 py-1 bg-white/20 rounded-full">🏃 Movement AI</span>
                </div>
              </button>

            </div>
          </div>
        </div>

        {/* Existing Modals */}
        <ClassQrScannerModal
          isOpen={isQrScannerOpen}
          onClose={() => setIsQrScannerOpen(false)}
          onScanSuccess={(data) => {
            // data.teacherId comes from the QR payload embedded by the teacher's board
            setScannedLessonData(data);
            setIsQrScannerOpen(false);
            setIsPairCheckInOpen(true);
          }}
        />
        <PairCheckInModal
          key={checkInModalKey}
          isOpen={isPairCheckInOpen}
          lessonId={scannedLessonData.lessonId}
          lessonTitle={scannedLessonData.title}
          skillName={scannedLessonData.skillName || 'Overhand Throw'}
          claimedPairNumbers={claimedPairNumbers}
          onCompleteCheckIn={handleCompleteCheckIn}
          onCancel={() => setIsPairCheckInOpen(false)}
        />
      </div>
    );
  }

  if (appMode === 'teacher_board') {
    return (
      <TeacherClassroomBoard
        onOpenChat={() => setAppMode('home_screen')}
        teacherId={user?.id}
        onOpenStudentSession={() => {
          setScannedLessonData({
            lessonId: 'pe-lesson-today',
            title: 'Overhand Throw Practice',
            skillName: 'Overhand Throw',
            teacherId: user?.id,
          });
          setIsPairCheckInOpen(true);
        }}
      />
    );
  }

  if (appMode === 'peer_coaching' && activePairSession) {
    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-900">
        <PeerCoachingSession
          pairNumber={activePairSession.pairNumber}
          lessonId={activePairSession.lessonId}
          skillName={activePairSession.skillName || scannedLessonData.skillName || 'Overhand Throw'}
          pairPhoto={activePairSession.pairPhoto}
          teacherId={activePairSession.teacherId}
          onSessionComplete={() => {
            clearActivePairSession();
            setActivePairSession(null);
            setAppMode('home_screen');
          }}
          onSendToCoachBot={handlePeerSessionToChat}
          onExit={() => {
            setAppMode('home_screen');
          }}
        />
        <TeacherHelpBeacon pairNumber={activePairSession.pairNumber} onSignalHelp={handleSignalPairNeedsHelp} />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-indigo-200/35 blur-3xl dark:bg-indigo-500/10" />
        <div className="absolute top-28 -right-28 h-96 w-96 rounded-full bg-sky-200/30 blur-3xl dark:bg-cyan-500/10" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/30 blur-3xl dark:bg-amber-400/10" />
      </div>

      <SessionSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitchSession={setCurrentSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={(id, title) => {
          const session = sessions.find(s => s.id === id);
          if (session) {
            handleUpdateCurrentSession(session.messages, title);
          }
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={user}
        teacherProfile={teacherProfile}
        signInWithGoogle={signInWithGoogle}
        signOut={handleSignOut}
        onOpenSettings={() => setIsRubricBuilderOpen(true)}
      />

      <div className="relative flex-1 flex flex-col h-full bg-white/75 dark:bg-slate-950/80 backdrop-blur-xl border-l border-white/60 dark:border-white/5 shadow-[0_0_80px_rgba(15,23,42,0.08)]">
        
        {/* Dedicated Student Station Header when in Pair Practice Mode */}
        {activePeerSessionData && (() => {
          const appleCues = activePeerSessionData.appleCues || {};
          const bananaCues = activePeerSessionData.bananaCues || {};
          const appleMet = Object.values(appleCues).filter(Boolean).length;
          const appleTotal = Object.keys(appleCues).length;
          const bananaMet = Object.values(bananaCues).filter(Boolean).length;
          const bananaTotal = Object.keys(bananaCues).length;
          return (
          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-500/40 px-3 md:px-5 py-3 shrink-0 z-40 shadow-lg">
            <div className="max-w-5xl mx-auto flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              {/* Left: identity + AI pill + peer cue scores */}
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="text-xl shrink-0">🍎🍌</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-200 font-black text-[11px] rounded-full border border-indigo-400/40">
                      Pair #{activePeerSessionData.pairNumber}
                    </span>
                    <p className="text-sm font-black text-white">
                      {activePeerSessionData.skillName} · Practice Station
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      AI Coach active
                    </span>
                    {appleTotal > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-200 text-[10px] font-bold">
                        🍎 {appleMet}/{appleTotal}
                      </span>
                    )}
                    {bananaTotal > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-200 text-[10px] font-bold">
                        🍌 {bananaMet}/{bananaTotal}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: model choice for AI analysis + primary actions */}
              <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                <ModelPicker selectedModel={selectedModel} onSelect={setSelectedModel} align="right" variant="dark" />
                <button
                  type="button"
                  onClick={() => setAppMode('peer_coaching')}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <span className="lg:hidden">🎥 Record</span>
                  <span className="hidden lg:inline">🎥 Record New Attempt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAppMode('teacher_board')}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  <span className="lg:hidden">🏫 Board</span>
                  <span className="hidden lg:inline">🏫 Teacher Board</span>
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Teacher feedback banner (student sees the teacher's comment on their submitted analysis) */}
        {teacherFeedbackBanner && (
          <div className="shrink-0 z-40 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-300 dark:border-amber-800/70 px-4 py-2.5">
            <div className="max-w-5xl mx-auto flex items-start gap-3">
              <span className="text-lg shrink-0">📩</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase font-extrabold tracking-wider text-amber-700 dark:text-amber-300">Teacher Feedback</p>
                <p className="text-sm text-amber-900 dark:text-amber-100 leading-snug">{teacherFeedbackBanner}</p>
              </div>
              <button
                type="button"
                onClick={() => setTeacherFeedbackBanner(null)}
                className="shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold text-xs cursor-pointer"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Minimalist Floating Top Bar */}
        <div className={`absolute top-0 left-0 right-0 z-30 p-3 md:p-4 flex items-center justify-between gap-2 pointer-events-none ${activePeerSessionData ? 'hidden' : ''}`}>
          {/* Left: Mobile Sidebar Toggle + Home Back */}
          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-2.5 text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-zinc-900/80 backdrop-blur-md rounded-xl border border-slate-200/40 dark:border-zinc-800/80 shadow-md transition-all hover:scale-105 active:scale-95"
              aria-label="Toggle Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <button
              onClick={() => setAppMode('home_screen')}
              className="p-2.5 text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-zinc-900/80 backdrop-blur-md rounded-xl border border-slate-200/40 dark:border-zinc-800/80 shadow-md transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 text-xs font-bold pr-3"
              title="Back to Home"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              <span className="hidden sm:inline">Home</span>
            </button>
          </div>

          {/* Right: Actions Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto min-w-0">
            {/* Class Partner Mode (Apple & Banana) */}
            <button
              onClick={() => {
                if (activePairSession) {
                  setAppMode('peer_coaching');
                } else {
                  setIsQrScannerOpen(true);
                }
              }}
              className="px-2.5 sm:px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs font-black flex items-center gap-1.5 hover:bg-amber-100 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xs cursor-pointer shrink-0"
              title="Classroom Partner Coaching (Apple & Banana)"
            >
              <span>🍎🍌</span>
              <span className="hidden sm:inline">Partner Mode</span>
            </button>

            {/* Teacher Board & Review Tray */}
            <button
              onClick={() => {
                if (user) {
                  setAppMode('teacher_board');
                } else {
                  signInWithGoogle();
                }
              }}
              className="px-2.5 sm:px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-100 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xs cursor-pointer shrink-0"
              title={user ? "Teacher Whiteboard QR & Review Tray" : "Sign In to Open Teacher Board"}
            >
              <span>🏫</span>
              <span className="hidden sm:inline">Teacher Board</span>
            </button>

            {user && (
              <button
                onClick={() => setShowDashboard(true)}
                className="hidden sm:flex px-3.5 py-2 rounded-xl border border-slate-200/50 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md text-slate-700 dark:text-slate-300 text-xs font-semibold items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm cursor-pointer"
                title="Student Dashboard"
              >
                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Dashboard</span>
              </button>
            )}
            <button
              onClick={() => setIsPdfModalOpen(true)}
              className="hidden sm:flex px-3.5 py-2 rounded-xl border border-slate-200/50 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md text-slate-700 dark:text-slate-300 text-xs font-semibold items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm cursor-pointer"
              title="Add Syllabus PDF"
            >
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add PDF</span>
            </button>

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="hidden sm:block p-2 rounded-xl border border-slate-200/50 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md hover:bg-slate-50 dark:hover:bg-zinc-800 hover:scale-[1.02] active:scale-[0.98] transition-all text-slate-700 dark:text-slate-300 shadow-sm cursor-pointer text-xs"
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>

            <div className="shrink-0">
              <ModelPicker selectedModel={selectedModel} onSelect={setSelectedModel} align="right" />
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 scroll-smooth pt-16 md:pt-6">
          <div className="max-w-5xl mx-auto min-h-full flex flex-col justify-end">

            {/* Spacer for empty chat to push welcome down? No, standard flow */}

            {messages.length < 2 && !activePeerSessionData && (
              <div className="mb-8 animate-fade-in">
                <div className="mb-4 overflow-hidden rounded-3xl border border-slate-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/75 backdrop-blur-xl shadow-lg shadow-slate-900/5">
                  <div className="p-6 border-b border-slate-100 dark:border-zinc-800/70">
                    <div className="mb-4.5">
                      <h2 className="text-xl md:text-2xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
                        Start with a syllabus question or a movement clip
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                        Analyze movement execution or query MOE Physical Education syllabus standards instantly.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        { label: 'OpenRouter', desc: 'fast general PE chat', icon: 'qwen.png', color: 'border-cyan-100 bg-cyan-50/50 text-cyan-700 dark:border-cyan-900/30 dark:bg-cyan-950/20 dark:text-cyan-400' },
                        { label: 'DeepSeek', desc: 'accurate syllabus search', icon: 'deepseek.png', color: 'border-sky-100 bg-sky-50/50 text-sky-700 dark:border-sky-900/30 dark:bg-sky-950/20 dark:text-sky-400' },
                        { label: 'Gemini', desc: 'grounded video grading', icon: 'gemini.png', color: 'border-indigo-100 bg-indigo-50/50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-400' },
                        { label: 'Claude', desc: 'detailed movement feedback', icon: 'claude.png', color: 'border-violet-100 bg-violet-50/50 text-violet-700 dark:border-violet-900/30 dark:bg-violet-950/20 dark:text-violet-400' }
                      ].map((item) => (
                        <span key={item.label} className={`inline-flex items-center rounded-2xl border px-3 py-1.5 text-xs font-semibold ${item.color} shadow-3xs`}>
                          <img
                            src={`/assets/model-icons/${item.icon}`}
                            alt={item.label}
                            className="w-4 h-4 object-contain mr-2 shrink-0 select-none opacity-95"
                          />
                          <strong className="mr-1">{item.label}:</strong>
                          <span className="font-normal opacity-90">{item.desc}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-6">
                    <h2 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                      </svg>
                      Explore the MOE Syllabus
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {PE_TOPICS.map((topic, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleChipClick(topic)}
                          className="group px-5 py-3.5 bg-slate-50/50 dark:bg-zinc-950/40 border border-slate-200/60 dark:border-zinc-800/80 rounded-2xl text-sm text-slate-700 dark:text-slate-200 hover:border-indigo-500/60 dark:hover:border-indigo-500/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-200 shadow-xs text-left cursor-pointer hover:scale-[1.01] hover:shadow-md"
                        >
                          <div className="flex items-center justify-between gap-3 h-full">
                            <span className="font-semibold leading-normal">{topic}</span>
                            <div className="w-6 h-6 rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center shadow-xs border border-slate-100 dark:border-zinc-800/50 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-200 group-hover:translate-x-0.5 shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onUpdateMessage={(updatedMsg) => {
                  updateSessionAndSync(currentSessionIdRef.current, session => ({
                    ...session,
                    messages: session.messages.map(m => m.id === updatedMsg.id ? updatedMsg : m),
                    updatedAt: new Date()
                  }));
                }}
                onAnalyze={handleAnalyzeConfirm}
                onSelectSkill={handleSelectSkill}
                onSelectMultipleSkills={handleSelectMultipleSkills}
                onShowAllSkills={() => setIsSkillSelectorOpen(true)}
                onSubmitChecklistToTeacher={(activePairSession || activePeerSessionData) ? handleSubmitChecklistToTeacher : undefined}
                disabled={isLoading || isProcessing}
                skillMode={skillMode}
              />
            ))}

            {isProcessing && (
              <div className="flex justify-start mb-6 animate-pulse">
                <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl border border-amber-100 dark:border-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Processing video frames...
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-start mb-6 animate-pulse">
                <div className="flex flex-row items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"></div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm text-slate-500 dark:text-slate-400 text-sm">
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        </main>

        {/* Footer Input */}
        <div className="p-4 bg-transparent shrink-0 z-10">
          <div className="max-w-5xl mx-auto">
            {/* AI Coach Action Chips for Apple & Banana */}
            {activePeerSessionData && (
              <div className="flex gap-2 overflow-x-auto pb-2.5 mb-1 scrollbar-thin px-1">
                <button
                  type="button"
                  disabled={isLoading || isProcessing}
                  onClick={() => handleAnalyzePeerPerformer('Banana')}
                  className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <span>🍌 Analyze Banana's Form (AI Vision)</span>
                </button>
                <button
                  type="button"
                  disabled={isLoading || isProcessing}
                  onClick={() => handleAnalyzePeerPerformer('Apple')}
                  className="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 active:scale-95 border border-red-500/40 text-red-300 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <span>🍎 Analyze Apple's Form (AI Vision)</span>
                </button>
                <button
                  type="button"
                  disabled={isLoading || isProcessing}
                  onClick={() => handleSendMessage(`Coach, how can we get more distance and power on our ${activePeerSessionData.skillName}?`)}
                  className="px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 active:scale-95 border border-indigo-500/40 text-indigo-300 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>⚡ How to get more power?</span>
                </button>
                <button
                  type="button"
                  disabled={isLoading || isProcessing}
                  onClick={() => handleSendMessage(`Give us a fun 2-minute partner challenge drill for ${activePeerSessionData.skillName}!`)}
                  className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>🎮 Fun Partner Drill</span>
                </button>
              </div>
            )}

            <ChatInput
              onSendMessage={handleSendMessage}
              isLoading={isLoading || isProcessing}
              selectedModel={selectedModel}
              skillMode={skillMode}
              onSkillModeChange={setSkillMode}
            />
          </div>
        </div>
      </div>

      <PdfUploaderModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
      />

      <RubricBuilderModal
        isOpen={isRubricBuilderOpen}
        onClose={() => setIsRubricBuilderOpen(false)}
        profile={teacherProfile}
        onSave={(updatedProfile) => updateTeacherProfile(updatedProfile)}
      />

      {/* Manual Skill Selector Modal */}
      {isSkillSelectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh] animate-scale-in">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span className="text-2xl">🔍</span>
                Select Fundamental Skill
              </h3>
              <button
                onClick={() => setIsSkillSelectorOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 overflow-y-auto grid grid-cols-1 gap-2">
              <p className="text-xs text-slate-500 mb-2 px-2 uppercase tracking-widest font-bold">Supported FMS Skills</p>
              {ALL_FMS_SKILLS.map((skill) => (
                <button
                  key={skill}
                  onClick={() => {
                    handleSelectSkill(skill);
                    setIsSkillSelectorOpen(false);
                  }}
                  className="w-full text-left px-5 py-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-700 dark:text-slate-200 font-medium transition-all flex items-center justify-between group"
                >
                  <span>{skill}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              ))}
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                Tip: If your skill isn't here, it may not be part of the current MOE PE Syllabus.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Classroom Modals */}
      <ClassQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScanSuccess={(lesson) => {
          setIsQrScannerOpen(false);
          setScannedLessonData(lesson);
          setIsPairCheckInOpen(true);
        }}
      />

      <PairCheckInModal
        key={checkInModalKey}
        isOpen={isPairCheckInOpen}
        lessonId={scannedLessonData.lessonId}
        lessonTitle={scannedLessonData.title}
        skillName={scannedLessonData.skillName}
        claimedPairNumbers={claimedPairNumbers}
        onCompleteCheckIn={handleCompleteCheckIn}
        onCancel={() => setIsPairCheckInOpen(false)}
      />

      <Analytics />
    </div>
  );
};

export default App;
