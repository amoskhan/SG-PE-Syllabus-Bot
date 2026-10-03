import type { PairSubmissionRecord } from '../services/offline/offlineStorage';
import { PerformerLock } from './submissionLock';

// Where one performer is on the way to their final submission (GLOSSARY.md:
// Final Submission), and what they may do next:
//
//   record → peer assessment → AI analysis → re-film once (optional) → final submission
//
// If Coach Bot can't analyse (AI down, no internet), the performer can still
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
  analysisFailed?: boolean; // Coach Bot couldn't analyse: they can submit without it
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
  if (!w.hasAnalysis && !w.analysisFailed) return { stage: 'needs_analysis', ...NOTHING, canFilmAgain };
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

/**
 * The checklist sent for the teacher to grade when there's no AI analysis: a
 * re-do (#93), or work Coach Bot couldn't analyse. Every criterion is marked ⚠️
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

export const noAnalysisChecklistText = (criteria: string[]) => teacherChecklistText(
  "**No AI analysis:** Coach Bot couldn't analyse this attempt, so the teacher grades it.", criteria);
