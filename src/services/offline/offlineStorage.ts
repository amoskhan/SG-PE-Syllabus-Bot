import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { PairProgress } from '../../utils/lessonFlow';
import { decodeBlobs, encodeBlobs, stripBlobs } from './storedBlobs';

export interface PeerCueResult {
  cueIndex: number;
  criterionText: string;
  cueText?: string; // the wording the pupil saw, when the lesson gave one (#136)
  isObserved: boolean;
}

/** The lesson step a piece of evidence came from (#92), as it was when made. */
export interface StepRef {
  id: string;
  number: number;    // 1-based position in the lesson then
  label: string;     // e.g. "Peer assessment + Coach Bot" (lessonFlow.stepLabel)
  skillName: string; // the skill that step assessed
}

export interface AiChatAnalysisEntry {
  analysisText: string;   // verbatim AI response the student sent
  skillName: string;
  studentLabel: 'Apple' | 'Banana';
  modelUsed: string;      // 'gemini' | 'claude' | ...
  submittedAt: string;
  // The clip the AI analysed, when the performer filmed again afterwards: the
  // teacher sees this first attempt as well as the final one (#94).
  analysedClip?: { videoUrl?: string; cues: PeerCueResult[] };
  // Set when the performer filmed again after a redo request (#93). The
  // analysis above stays: it was about the earlier attempt.
  redo?: RedoSubmission;
  // Sent without an AI analysis because Coach Bot couldn't analyse it:
  // analysisText is a checklist for the teacher to grade
  teacherGrades?: boolean;
  step?: StepRef; // the step this analysis was made in (#92)
}

/** A performer's re-do, sent with their final submission (#93). */
export interface RedoSubmission {
  requestedAt: string;    // the teacher's redo request this answers
  submittedAt: string;
  checklistText: string;  // the checklist for the teacher to grade (no AI on a re-do)
  firstClip?: { videoUrl?: string; cues: PeerCueResult[] }; // when they used the re-do's one re-film
}

export interface RedoFilms {
  requestedAt: string;
  count: number;
  firstClip?: { videoUrl?: string; cues: PeerCueResult[] };
}

/** One recorded attempt by a performer, kept on this device. */
export interface AttemptSnapshot {
  videoBlob?: Blob;
  videoUrl?: string;
  cues: PeerCueResult[];
}

export interface PairSubmissionRecord {
  id: string;
  lessonId: string;
  pairNumber: number;
  skillName: string;
  pairPhoto: string; // Base64 image
  appleRole: {
    studentPerformer: 'Banana';
    evaluator: 'Apple';
    videoBlob?: Blob;
    videoUrl?: string;
    cues: PeerCueResult[];
    poseMetrics?: {
      stepDetected?: boolean;
      armPeaked?: boolean;
      kneeAngle?: number;
    };
  };
  bananaRole: {
    studentPerformer: 'Apple';
    evaluator: 'Banana';
    videoBlob?: Blob;
    videoUrl?: string;
    cues: PeerCueResult[];
    poseMetrics?: {
      stepDetected?: boolean;
      armPeaked?: boolean;
      kneeAngle?: number;
    };
  };
  aiStudentFeedback?: {
    bananaFeedback: string;
    appleFeedback: string;
    generatedAt: string;
    modelUsed: string;
  };
  aiTeacherReport?: {
    bananaAnalysis: string;
    appleAnalysis: string;
    bananaProficiency: 'Beginning' | 'Developing' | 'Competent' | 'Accomplished' | 'Excellent'; // 'Excellent': saved before the rename
    appleProficiency: 'Beginning' | 'Developing' | 'Competent' | 'Accomplished' | 'Excellent'; // 'Excellent': saved before the rename
    teacherRecommendations: string;
    discrepancies: Array<{
      criterion: string;
      performer: 'Apple' | 'Banana';
      peerSaid: boolean;
      aiSaid: boolean;
    }>;
    generatedAt: string;
    modelUsed: string;
  };
  // Full AI rubric analysis the student ran in the Practice Station and sent to the
  // teacher — one slot per performer so Apple's and Banana's don't overwrite each other.
  aiChatAnalysis?: {
    apple?: AiChatAnalysisEntry;
    banana?: AiChatAnalysisEntry;
  };
  // Kept on this device until the performer's final submission (#94): the AI
  // analysis made in the Practice Station, and the first attempt once they've
  // used their one re-film.
  pendingAnalysis?: {
    apple?: AiChatAnalysisEntry;
    banana?: AiChatAnalysisEntry;
  };
  firstAttempt?: {
    apple?: AttemptSnapshot;
    banana?: AttemptSnapshot;
  };
  // Films made on this device since the teacher's redo request (#93): the
  // first replaces the sent attempt, the second is the re-do's one re-film
  redoFilms?: {
    apple?: RedoFilms;
    banana?: RedoFilms;
  };
  // The step each performer's current peer ticks came from (#92)
  peerSteps?: {
    apple?: StepRef;
    banana?: StepRef;
  };
  // Coach Bot couldn't analyse this performer (AI down, no internet): they
  // can still submit, and the teacher grades it
  analysisFailed?: {
    apple?: boolean;
    banana?: boolean;
  };
  status: 'pending_sync' | 'synced' | 'approved' | 'needs_redo' | 'resubmitted';
  teacherFeedback?: string;
  teacherStar?: boolean;
  createdAt: string;
  syncedAt?: string;
  claimToken?: string; // identifies the group that owns this pair (see getOrCreatePairClaimToken)
  // supabase_submission_lock.sql: when each performer's work was sent, and
  // when the teacher last asked for a redo (see utils/submissionLock.ts)
  appleSentAt?: string;
  bananaSentAt?: string;
  redoRequestedAt?: string;
}

export interface PairSessionData {
  pairNumber: number;
  lessonId: string;
  pairPhoto: string;
  checkedInAt: string;
  needsHelp: boolean;
  teacherId?: string; // Embedded from QR so student device can upload without auth
  skillName?: string; // Cached for upload path
}

interface PeCoachDB extends DBSchema {
  pair_session: {
    key: string;
    value: PairSessionData;
  };
  submissions: {
    key: string;
    value: PairSubmissionRecord;
    indexes: { 'by_status': string; 'by_lesson': string };
  };
  lesson_cache: {
    key: string;
    value: { lessonId: string; title: string; skillName: string; teacherPin: string; updatedAt: string };
  };
}

const DB_NAME = 'sg_pe_partner_coach_db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<PeCoachDB>> | null = null;

export const getDB = async (): Promise<IDBPDatabase<PeCoachDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<PeCoachDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('pair_session')) {
            db.createObjectStore('pair_session');
          }
          if (!db.objectStoreNames.contains('submissions')) {
            const subStore = db.createObjectStore('submissions', { keyPath: 'id' });
            subStore.createIndex('by_status', 'status');
            subStore.createIndex('by_lesson', 'lessonId');
          }
          if (!db.objectStoreNames.contains('lesson_cache')) {
            db.createObjectStore('lesson_cache');
          }
        }
        if (oldVersion < 2) {
          // Added optional aiStudentFeedback and aiTeacherReport to PairSubmissionRecord.
          // IndexedDB object store schema unchanged — no migration needed.
        }
      },
    });
  }
  return dbPromise;
};

// ─── Pair Session Management ──────────────────────────────────────────────────

export const saveActivePairSession = async (session: PairSessionData): Promise<void> => {
  const db = await getDB();
  await db.put('pair_session', session, 'current_session');
};

export const getActivePairSession = async (): Promise<PairSessionData | null> => {
  const db = await getDB();
  const session = await db.get('pair_session', 'current_session');
  return session || null;
};

export const clearActivePairSession = async (): Promise<void> => {
  const db = await getDB();
  await db.delete('pair_session', 'current_session');
};

// ─── Pair Claim Token ────────────────────────────────────────────────────────
// A random id this device generates once per lesson and keeps in localStorage.
// It marks "this group" so the same group can resume its own pair after a reload,
// while a different group is blocked from writing to a pair number already taken.

// ─── Lesson Pass ─────────────────────────────────────────────────────────────
// The secret each class QR carries (lessons.pupil_pass). The database accepts a
// pupil's check-in, uploads and submissions only with the pass of a lesson that
// is on today. Kept per lesson in localStorage so a reload doesn't lose it.

const lessonPassKey = (lessonId: string) => `pe_lesson_pass_${lessonId}`;

export const saveLessonPass = (lessonId: string, pass: string): void => {
  try {
    localStorage.setItem(lessonPassKey(lessonId), pass);
  } catch {
    // Storage blocked — writes for this lesson will be refused after a reload
  }
};

export const getLessonPass = (lessonId: string): string | null => {
  try {
    return localStorage.getItem(lessonPassKey(lessonId));
  } catch {
    return null;
  }
};

// ─── Pair Step Progress ──────────────────────────────────────────────────────
// Which lesson step a pair is on (lessonFlow.ts), kept per lesson and pair so a
// reload or the device sleeping brings them back to the same step.

const pairStepKey = (lessonId: string, pairNumber: number) => `pe_pair_step_${lessonId}_p${pairNumber}`;

export const getPairProgress = (lessonId: string, pairNumber: number): PairProgress | null => {
  try {
    const raw = localStorage.getItem(pairStepKey(lessonId, pairNumber));
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p.index === 'number' ? { stepId: typeof p.stepId === 'string' ? p.stepId : undefined, index: p.index } : null;
  } catch {
    return null;
  }
};

// The lesson's steps as last fetched (#87), so a reload or a dropped
// connection keeps the teacher's plan instead of falling back to the default
export interface CachedLessonSteps {
  skillName: string;
  steps: import('../../utils/lessonFlow').LessonStep[] | null;
}

const lessonStepsKey = (lessonId: string) => `pe_lesson_steps_${lessonId}`;

export const getCachedLessonSteps = (lessonId: string): CachedLessonSteps | null => {
  try {
    const raw = localStorage.getItem(lessonStepsKey(lessonId));
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.skillName === 'string' ? { skillName: v.skillName, steps: Array.isArray(v.steps) ? v.steps : null } : null;
  } catch {
    return null;
  }
};

export const saveCachedLessonSteps = (lessonId: string, value: CachedLessonSteps): void => {
  try {
    localStorage.setItem(lessonStepsKey(lessonId), JSON.stringify(value));
  } catch {
    // Storage blocked — the steps are fetched again next time
  }
};

export const savePairProgress = (lessonId: string, pairNumber: number, progress: PairProgress): void => {
  try {
    localStorage.setItem(pairStepKey(lessonId, pairNumber), JSON.stringify(progress));
  } catch {
    // Storage blocked — the pair starts from their first step after a reload
  }
};

const claimTokenKey = (lessonId: string) => `pe_pair_claim_${lessonId}`;

export const getOrCreatePairClaimToken = (lessonId: string): string => {
  const key = claimTokenKey(lessonId);
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const token =
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `tok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, token);
    return token;
  } catch {
    // localStorage unavailable (private mode etc.) — fall back to an ephemeral token
    return `tok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

// ─── Offline Queue Submissions ────────────────────────────────────────────────

// Always read and write submissions through these: clips are stored as raw
// bytes because some phones refuse to store videos as Blobs (storedBlobs.ts).

export const getSubmission = async (id: string): Promise<PairSubmissionRecord | undefined> => {
  const db = await getDB();
  const raw = await db.get('submissions', id);
  return raw ? decodeBlobs(raw) : undefined;
};

/**
 * Save a pair's record on this device. If the device won't hold the clips at
 * all (e.g. it's full), the record is saved without them so the ticks,
 * analyses and cloud links are kept. Returns whether the clips were kept.
 */
export const putSubmission = async (submission: PairSubmissionRecord): Promise<{ videosKept: boolean }> => {
  const db = await getDB();
  try {
    await db.put('submissions', await encodeBlobs(submission));
    return { videosKept: true };
  } catch (e) {
    console.warn('[Offline] Could not store the clips on this device; saving the rest:', e);
    await db.put('submissions', stripBlobs(submission));
    return { videosKept: false };
  }
};

export const queuePairSubmission = putSubmission;

export const getAllSubmissions = async (): Promise<PairSubmissionRecord[]> => {
  const db = await getDB();
  return Promise.all((await db.getAll('submissions')).map(r => decodeBlobs(r)));
};

export const updateSubmissionStatus = async (
  id: string,
  status: PairSubmissionRecord['status'],
  feedback?: string,
  star?: boolean
): Promise<void> => {
  const record = await getSubmission(id);
  if (record) {
    record.status = status;
    if (feedback !== undefined) record.teacherFeedback = feedback;
    if (star !== undefined) record.teacherStar = star;
    if (status === 'synced') record.syncedAt = new Date().toISOString();
    await putSubmission(record);
  }
};

// ─── Lesson Cache ─────────────────────────────────────────────────────────────

export const deleteSubmission = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('submissions', id);
};
