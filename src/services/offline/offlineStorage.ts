import { openDB, DBSchema, IDBPDatabase } from 'idb';

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
    bananaProficiency: 'Beginning' | 'Developing' | 'Competent' | 'Excellent';
    appleProficiency: 'Beginning' | 'Developing' | 'Competent' | 'Excellent';
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
  status: 'pending_sync' | 'synced' | 'approved' | 'needs_redo' | 'resubmitted';
  teacherFeedback?: string;
  teacherStar?: boolean;
  createdAt: string;
  syncedAt?: string;
  claimToken?: string; // identifies the group that owns this pair (see getOrCreatePairClaimToken)
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

export const queuePairSubmission = async (submission: PairSubmissionRecord): Promise<void> => {
  const db = await getDB();
  await db.put('submissions', submission);
};

export const getAllSubmissions = async (): Promise<PairSubmissionRecord[]> => {
  const db = await getDB();
  return db.getAll('submissions');
};

export const getPendingSubmissions = async (): Promise<PairSubmissionRecord[]> => {
  const db = await getDB();
  const index = db.transaction('submissions').store.index('by_status');
  return index.getAll('pending_sync');
};

export const updateSubmissionStatus = async (
  id: string,
  status: PairSubmissionRecord['status'],
  feedback?: string,
  star?: boolean
): Promise<void> => {
  const db = await getDB();
  const record = await db.get('submissions', id);
  if (record) {
    record.status = status;
    if (feedback !== undefined) record.teacherFeedback = feedback;
    if (star !== undefined) record.teacherStar = star;
    if (status === 'synced') record.syncedAt = new Date().toISOString();
    await db.put('submissions', record);
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
