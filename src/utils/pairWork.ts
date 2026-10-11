import type { PairSubmissionRecord, PeerCueResult, StepRef } from '../services/offline/offlineStorage';
import { PairGlowGrow, SavedGlowGrow, readGlowGrow, readPairGlowGrow } from './glowGrow';
import { PerformerLock } from './submissionLock';

// Where one performer is on the way to their final submission (GLOSSARY.md:
// Final Submission), and what they may do next:
//
//   record → peer assessment → AI analysis → re-film once (optional) → final submission
//
// If PE AI Buddy can't analyse (AI down, no internet), the performer can still
// submit, and the teacher grades it.
//
// After a redo request each performer first chooses (#93): Keep what was sent,
// or Film again: record → peer assessment → re-film once (optional) → final
// submission, with no new AI analysis. The teacher grades the re-do.

export interface PerformerWork {
  hasClip: boolean;     // a clip of this performer is saved on the device
  ticked: boolean;      // the assessor has ticked the cues for the current clip
  refilmed: boolean;    // the one re-film has been used
  hasAnalysis: boolean; // the AI analysis has been done
  lock: PerformerLock;  // from the teacher's copy (submissionLock.ts)
  redoFilms: number;    // films made since the current redo request
  analysisFailed?: boolean; // PE AI Buddy couldn't analyse: they can submit without it
  aiInLesson?: boolean;     // false: the lesson has no AI analysis step (#87), so none is needed
}

export type Stage = 'not_started' | 'redo_choice' | 'needs_ticks' | 'needs_analysis' | 'ready' | 'submitted';

export interface PerformerStage {
  stage: Stage;
  canKeep: boolean;
  canFilmAgain: boolean;
  canSubmitFinal: boolean;
}

const NOTHING = { canKeep: false, canFilmAgain: false, canSubmitFinal: false };

export const performerStage = (w: PerformerWork): PerformerStage => {
  if (w.lock === 'locked') return { stage: 'submitted', ...NOTHING };

  if (w.lock === 'redo_requested') {
    if (w.redoFilms === 0) return { stage: 'redo_choice', canKeep: true, canFilmAgain: true, canSubmitFinal: false };
    const canFilmAgain = w.redoFilms < 2;
    if (!w.ticked) return { stage: 'needs_ticks', ...NOTHING, canFilmAgain };
    return { stage: 'ready', ...NOTHING, canFilmAgain, canSubmitFinal: true };
  }

  const canFilmAgain = w.hasClip && !w.refilmed;
  if (!w.hasClip) return { stage: 'not_started', ...NOTHING };
  if (!w.ticked) return { stage: 'needs_ticks', ...NOTHING, canFilmAgain };
  if (!w.hasAnalysis && !w.analysisFailed && w.aiInLesson !== false) return { stage: 'needs_analysis', ...NOTHING, canFilmAgain };
  return { stage: 'ready', ...NOTHING, canFilmAgain, canSubmitFinal: true };
};

// ── Reading a pair's record ─────────────────────────────────────────────────

export type Performer = 'Apple' | 'Banana';
export const performerKey = (p: Performer) => (p === 'Apple' ? 'apple' : 'banana') as 'apple' | 'banana';

/**
 * A performer's current attempt. The record is laid out by assessor: appleRole
 * is Apple assessing, so it holds Banana's clip and ticks, and bananaRole holds
 * Apple's.
 */
export const currentAttempt = (r: PairSubmissionRecord, p: Performer) => (p === 'Apple' ? r.bananaRole : r.appleRole);

/** Films this performer has made for the current redo request (0 for an older one). */
export const redoFilmCount = (r: PairSubmissionRecord | null | undefined, p: Performer, redoRequestedAt?: string) => {
  const films = r?.redoFilms?.[performerKey(p)];
  return films && redoRequestedAt && films.requestedAt === redoRequestedAt ? films.count : 0;
};

export const performerWork = (
  r: PairSubmissionRecord | null | undefined,
  p: Performer,
  lock: PerformerLock,
  redoRequestedAt?: string,
): PerformerWork => {
  const attempt = r ? currentAttempt(r, p) : undefined;
  const k = performerKey(p);
  return {
    hasClip: !!(attempt?.videoBlob?.size || attempt?.videoUrl),
    ticked: (attempt?.cues?.length ?? 0) > 0,
    refilmed: !!r?.firstAttempt?.[k],
    hasAnalysis: !!(r?.pendingAnalysis?.[k] || r?.aiChatAnalysis?.[k]),
    lock,
    redoFilms: lock === 'redo_requested' ? redoFilmCount(r, p, redoRequestedAt) : 0,
    analysisFailed: !!r?.analysisFailed?.[k],
  };
};

/** A row of pair_submissions (the teacher's read, or pupil_get_submission) as a pair's record. */
export function mapRowToSubmission(row: any): PairSubmissionRecord {
  return {
    id: row.id,
    lessonId: row.lesson_id || 'pe-lesson-today',
    pairNumber: row.pair_number || 1,
    skillName: row.skill_name || 'Overhand Throw',
    pairPhoto: row.pair_photo || '',
    appleRole: {
      studentPerformer: 'Banana',
      evaluator: 'Apple',
      videoUrl: row.banana_video_url || undefined,
      cues: Array.isArray(row.banana_cues) ? row.banana_cues : [],
    },
    bananaRole: {
      studentPerformer: 'Apple',
      evaluator: 'Banana',
      videoUrl: row.apple_video_url || undefined,
      cues: Array.isArray(row.apple_cues) ? row.apple_cues : [],
    },
    aiStudentFeedback: row.ai_student_feedback || undefined,
    aiTeacherReport: row.ai_teacher_report || undefined,
    aiChatAnalysis: row.ai_chat_analysis || undefined,
    firstAttempt: row.first_attempts || undefined,
    peerSteps: row.peer_steps || undefined,
    // Absent on older work, with the option off, or before supabase_glow_grow.sql is run
    glowGrow: readPairGlowGrow(row.glow_grow),
    status: row.status || 'pending_sync',
    teacherFeedback: row.teacher_feedback || undefined,
    teacherStar: row.teacher_star || false,
    createdAt: row.created_at || new Date().toISOString(),
    claimToken: row.claim_token || undefined,
    appleSentAt: row.apple_sent_at || undefined,
    bananaSentAt: row.banana_sent_at || undefined,
    redoRequestedAt: row.redo_requested_at || undefined,
  };
}

/**
 * What the Practice Station takes up of a pair's saved work: who the pair is
 * and each performer's peer ticks, by cue id, for the cues the lesson shows.
 * Built field by field: a glow or grow on the record is never carried toward
 * the AI (ADR 0001).
 */
export const practiceSessionFrom = (
  pair: { pairNumber: number; lessonId: string; pairPhoto?: string },
  sub: PairSubmissionRecord | null | undefined,
  skillName: string,
  assessSkillName: string,
  cues: { id: string; itemNumber: number }[],
) => {
  const ticks = (list?: { cueIndex: number; isObserved: boolean }[]): Record<string, boolean> =>
    Object.fromEntries(cues.map(c => [c.id, !!list?.find(r => r.cueIndex === c.itemNumber)?.isObserved]));
  return {
    pairNumber: pair.pairNumber,
    lessonId: pair.lessonId,
    skillName,
    assessSkillName,
    pairPhoto: pair.pairPhoto || sub?.pairPhoto || '',
    applePoseFrames: [] as string[],
    bananaPoseFrames: [] as string[],
    appleCues: ticks(sub?.bananaRole?.cues),
    bananaCues: ticks(sub?.appleRole?.cues),
  };
};

// ── Filming again ───────────────────────────────────────────────────────────

/**
 * The pair's record once a performer has filmed again and been ticked.
 *
 * The one re-film (#94): the attempt before it becomes the first attempt, with
 * its ticks and its glow and grow (#156), so the teacher sees both.
 *
 * After a redo request (#93, `redoAt`): the first film replaces the attempt
 * that was sent, and the second is the re-do's one re-film, which keeps the
 * try before it. Either way the new attempt's glow and grow replace the old.
 *
 * `earlierUrl` is where the attempt before this one is stored, when it is kept.
 */
export const withRefilm = (
  record: PairSubmissionRecord,
  performer: Performer,
  next: { videoBlob: Blob; cues: PeerCueResult[]; glowGrow?: SavedGlowGrow },
  opts: { earlierUrl?: string; redoAt?: string; stepRef?: StepRef } = {},
): PairSubmissionRecord => {
  const r: PairSubmissionRecord = { ...record };
  const k = performerKey(performer);
  const old = currentAttempt(r, performer);
  const said = r.glowGrow?.[k];

  if (opts.redoAt) {
    const films = redoFilmCount(r, performer, opts.redoAt);
    const firstClip = films === 1 ? { videoUrl: opts.earlierUrl, cues: old.cues }
      : films > 0 ? r.redoFilms?.[k]?.firstClip : undefined;
    r.redoFilms = { ...r.redoFilms, [k]: { requestedAt: opts.redoAt, count: films + 1, firstClip } };
  } else {
    r.firstAttempt = {
      ...r.firstAttempt,
      [k]: { videoBlob: old.videoBlob, videoUrl: opts.earlierUrl, cues: old.cues, ...(said ? { glowGrow: said } : {}) },
    };
    // The analysis was about the earlier clip. It never carries a glow or grow (ADR 0001).
    const pending = r.pendingAnalysis?.[k];
    if (pending) {
      r.pendingAnalysis = { ...r.pendingAnalysis, [k]: { ...pending, analysedClip: { videoUrl: opts.earlierUrl, cues: old.cues } } };
    }
  }

  // No videoUrl yet: sending the record adds it
  const current = { videoBlob: next.videoBlob, videoUrl: undefined, cues: next.cues };
  if (performer === 'Apple') r.bananaRole = { ...r.bananaRole, ...current };
  else r.appleRole = { ...r.appleRole, ...current };

  const { [k]: _earlier, ...others } = r.glowGrow ?? {};
  const glowGrow: PairGlowGrow = { ...others, ...(next.glowGrow ? { [k]: next.glowGrow } : {}) };
  r.glowGrow = Object.keys(glowGrow).length ? glowGrow : undefined;

  if (opts.stepRef) r.peerSteps = { ...r.peerSteps, [k]: opts.stepRef };
  return r;
};

/**
 * Each performer's earlier attempt (once they filmed again) that has been
 * uploaded, as it goes to the teacher: its link, its ticks, and its glow and
 * grow when it had one.
 */
export const firstAttemptsToSend = (s: PairSubmissionRecord) => {
  const out: Record<string, { videoUrl: string; cues: unknown[]; glowGrow?: SavedGlowGrow }> = {};
  for (const k of ['apple', 'banana'] as const) {
    const a = s.firstAttempt?.[k];
    const said = readGlowGrow(a?.glowGrow);
    if (a?.videoUrl) out[k] = { videoUrl: a.videoUrl, cues: a.cues ?? [], ...(said ? { glowGrow: said } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * The checklist sent for the teacher to grade when there's no AI analysis: a
 * re-do (#93), or work PE AI Buddy couldn't analyse. Every criterion is marked ⚠️
 * for the teacher to decide, in the same table the AI uses, so the teacher's
 * review reads it the same way (gradingReview.ts). It never carries the peer
 * ticks (ADR 0001: they don't reach the AI, and the nightly summary is AI).
 */
const teacherChecklistText = (intro: string, criteria: string[]) => [
  intro,
  '',
  '| # | Criterion | Result |',
  '|---|---|---|',
  ...criteria.map((c, i) => `| ${i + 1} | ${c.replace(/\|/g, '/')} | ⚠️ |`),
].join('\n');

export const redoChecklistText = (criteria: string[]) => teacherChecklistText(
  '**Re-do** after the teacher asked for another try. There is no AI analysis on a re-do: the teacher grades it.', criteria);

export const noAnalysisChecklistText = (criteria: string[], why: 'failed' | 'no_ai_in_lesson' = 'failed') => teacherChecklistText(
  why === 'failed'
    ? "**No AI analysis:** The AI couldn't analyse this attempt, so the teacher grades it."
    : '**No AI analysis:** this lesson has no AI analysis step, so the teacher grades it.', criteria);
