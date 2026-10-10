// A pair's peer assessment, part-way through (the recordings and ticks so
// far), kept on the device so leaving the page or refreshing doesn't lose it.
// It is deleted when the pair's work is saved, and ignored after a day.

export interface PeerDraft {
  id: string;
  lessonId: string;
  pairNumber: number;
  skillName: string;         // the skill being assessed
  step: string;              // the screen the pair was on
  bananaVideoBlob?: Blob;    // Banana performing (filmed in Apple's turn)
  bananaCues: Record<string, boolean>;
  bananaPoseFrames: string[];
  appleVideoBlob?: Blob;     // Apple performing (filmed in Banana's turn)
  appleCues: Record<string, boolean>;
  applePoseFrames: string[];
  // Where each clip already is in the teacher's storage, so it isn't sent twice
  savedUrls?: { banana?: string; apple?: string };
  savedAt: string;
}

export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const peerDraftId = (lessonId: string, pairNumber: number, skillName: string) =>
  `draft-${lessonId}-p${pairNumber}-${skillName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

/** Whether there is anything worth keeping: a clip or a tick. */
export const draftHasWork = (d: Pick<PeerDraft, 'bananaVideoBlob' | 'appleVideoBlob' | 'bananaCues' | 'appleCues'>) =>
  !!d.bananaVideoBlob || !!d.appleVideoBlob || Object.keys(d.bananaCues).length > 0 || Object.keys(d.appleCues).length > 0;

export const draftIsFresh = (d: Pick<PeerDraft, 'savedAt'>, now = Date.now()) =>
  now - new Date(d.savedAt).getTime() < DRAFT_MAX_AGE_MS;

/**
 * The screen to reopen on. A recording can't be resumed mid-way, so the pair
 * lands on the review of the last clip they finished, or on the swap screen
 * once they had moved past Banana's review.
 */
export const resumeStep = (
  d: Pick<PeerDraft, 'step' | 'bananaVideoBlob' | 'appleVideoBlob'>,
): 'APPLE_INTRO' | 'APPLE_REVIEW' | 'SWAP_PROMPT' | 'BANANA_REVIEW' => {
  if (d.appleVideoBlob) return 'BANANA_REVIEW';
  if (!d.bananaVideoBlob) return 'APPLE_INTRO';
  return ['SWAP_PROMPT', 'BANANA_RECORDING', 'BANANA_REVIEW'].includes(d.step) ? 'SWAP_PROMPT' : 'APPLE_REVIEW';
};

/** What the home screen says about a draft: who has been filmed so far. */
export const draftSummary = (d: Pick<PeerDraft, 'bananaVideoBlob' | 'appleVideoBlob'>): string =>
  d.bananaVideoBlob && d.appleVideoBlob ? 'Both videos recorded · finish your ticks'
    : d.bananaVideoBlob ? "Banana's video is recorded · Apple is next"
    : d.appleVideoBlob ? "Apple's video is recorded"
    : 'Recording started';
