import { supabase } from '../db/supabaseClient';
import { getLessonPass } from '../offline/offlineStorage';

// /api/claude only answers a signed-in teacher or a pupil with today's lesson
// pass (see api/claude.ts). This builds the headers that prove which one.
//
// The pupil's Practice Station chat reaches Claude through the shared chat
// pipeline (App.handleSendMessage → claudeService), whose functions take a long
// fixed argument list, so App sets the pupil context here just before a pupil's
// request instead of threading it through every call.

export type PupilAiPurpose = 'peer_feedback' | 'analysis' | 'question';

export interface PupilAiRequest {
  lessonId: string;
  pairNumber: number;
  performer: 'apple' | 'banana' | 'pair';
  purpose: PupilAiPurpose;
}

let currentPupilRequest: PupilAiRequest | null = null;

/** App sets this for a pupil's Practice Station request, and clears it (null) afterwards. */
export const setPupilAiRequest = (request: PupilAiRequest | null) => {
  currentPupilRequest = request;
};

/**
 * Headers for a /api/claude call: the teacher's sign-in if there is one, else
 * the pupil's lesson pass (from `pupil`, or the context App set). Empty when
 * neither applies — the server then asks the user to sign in.
 */
export async function claudeAccessHeaders(pupil?: PupilAiRequest): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };

  const request = pupil ?? currentPupilRequest;
  const pass = request && getLessonPass(request.lessonId);
  if (!request || !pass) return {};
  return {
    'X-Lesson-Id': request.lessonId,
    'X-Lesson-Pass': pass,
    'X-Pair-Number': String(request.pairNumber),
    'X-Performer': request.performer,
    'X-Ai-Purpose': request.purpose,
  };
}

/** The server's own message for a refused call (sign-in, lesson, budget), if it sent one. */
export const serverErrorMessage = (errorData: unknown): string | null => {
  const e = (errorData as { error?: unknown } | null)?.error;
  return typeof e === 'string' && e.trim() ? e : null;
};

// ── Practice Station limits (#95): what the server last said ────────────────
// Each pupil gets 1 analysis and 5 questions per lesson. The server is the
// judge (pupil_ai_use); these reports only let the Practice Station show
// what's left. claudeService reports after each pupil call.

export interface PupilUsageReport {
  performer: 'apple' | 'banana';
  questionsLeft?: number;   // after a question was answered
  analysisUsed?: boolean;   // after an analysis, or when the server refused one
}

type UsageListener = (report: PupilUsageReport) => void;
const usageListeners = new Set<UsageListener>();

export const onPupilUsage = (listener: UsageListener) => {
  usageListeners.add(listener);
  return () => { usageListeners.delete(listener); };
};

/** Called with the server's answer for the current pupil request. */
export const reportPupilUsage = (outcome: { ok: boolean; status?: number; questionsLeft?: number; message?: string }) => {
  const req = currentPupilRequest;
  if (!req || req.performer === 'pair') return;
  let report: PupilUsageReport | null = null;
  if (req.purpose === 'question' && outcome.ok && typeof outcome.questionsLeft === 'number') {
    report = { performer: req.performer, questionsLeft: outcome.questionsLeft };
  } else if (req.purpose === 'question' && outcome.status === 429) {
    report = { performer: req.performer, questionsLeft: 0 };
  } else if (req.purpose === 'analysis' && (outcome.ok || outcome.status === 429)) {
    report = { performer: req.performer, analysisUsed: true };
  }
  if (report) usageListeners.forEach(l => l(report!));
};
