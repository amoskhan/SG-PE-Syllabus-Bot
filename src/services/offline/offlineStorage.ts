import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { decodeBlobs, encodeBlobs, stripBlobs } from './storedBlobs';

export interface PeerCueResult {
  cueIndex: number;
  criterionText: string;
  isObserved: boolean;
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

export const clearPairClaimToken = (lessonId: string): void => {
  try {
    localStorage.removeItem(claimTokenKey(lessonId));
  } catch {
    /* ignore */
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

export const getPendingSubmissions = async (): Promise<PairSubmissionRecord[]> => {
  const db = await getDB();
  const index = db.transaction('submissions').store.index('by_status');
  return Promise.all((await index.getAll('pending_sync')).map(r => decodeBlobs(r)));
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

export const cacheLessonConfig = async (config: {
  lessonId: string;
  title: string;
  skillName: string;
  teacherPin: string;
}): Promise<void> => {
  const db = await getDB();
  await db.put('lesson_cache', { ...config, updatedAt: new Date().toISOString() }, 'active_lesson');
};

export const getCachedLessonConfig = async () => {
  const db = await getDB();
  return db.get('lesson_cache', 'active_lesson');
};

export const deleteSubmission = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('submissions', id);
};
