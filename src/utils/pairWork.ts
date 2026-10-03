import type { PairSubmissionRecord } from '../services/offline/offlineStorage';
import { PerformerLock } from './submissionLock';

// Where one performer is on the way to their final submission (GLOSSARY.md:
// Final Submission), and what they may do next:
//
//   record → peer assessment → AI analysis → re-film once (optional) → final submission
//
// After a redo request there is no new AI analysis: the teacher grades it.

export interface PerformerWork {
  hasClip: boolean;     // a clip of this performer is saved on the device
  ticked: boolean;      // the assessor has ticked the cues for the current clip
  refilmed: boolean;    // the one re-film has been used
  hasAnalysis: boolean; // the AI analysis has been done
  lock: PerformerLock;  // from the teacher's copy (submissionLock.ts)
}

export type Stage = 'not_started' | 'needs_ticks' | 'needs_analysis' | 'ready' | 'submitted';

export interface PerformerStage {
  stage: Stage;
  canFilmAgain: boolean;
  canSubmitFinal: boolean;
}

export const performerStage = (w: PerformerWork): PerformerStage => {
  if (w.lock === 'locked') return { stage: 'submitted', canFilmAgain: false, canSubmitFinal: false };

  const redo = w.lock === 'redo_requested';
  const canFilmAgain = w.hasClip && (redo || !w.refilmed);
  if (!w.hasClip) return { stage: 'not_started', canFilmAgain: false, canSubmitFinal: false };
  if (!w.ticked) return { stage: 'needs_ticks', canFilmAgain, canSubmitFinal: false };
  if (!w.hasAnalysis && !redo) return { stage: 'needs_analysis', canFilmAgain, canSubmitFinal: false };
  return { stage: 'ready', canFilmAgain, canSubmitFinal: true };
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

export const performerWork = (
  r: PairSubmissionRecord | null | undefined,
  p: Performer,
  lock: PerformerLock,
): PerformerWork => {
  const attempt = r ? currentAttempt(r, p) : undefined;
  const k = performerKey(p);
  return {
    hasClip: !!(attempt?.videoBlob?.size || attempt?.videoUrl),
    ticked: (attempt?.cues?.length ?? 0) > 0,
    refilmed: !!r?.firstAttempt?.[k],
    hasAnalysis: !!(r?.pendingAnalysis?.[k] || r?.aiChatAnalysis?.[k]),
    lock,
  };
};
