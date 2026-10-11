import type { PeerSyllabusCue } from '../data/peerSyllabusCues';

// The rules of Glow and Grow (GLOSSARY.md; #151): after ticking every cue, the
// assessor tells the performer one thing done well (a glow) and one thing to
// try (a grow). No UI, storage or network here, and nothing here ever goes to
// the AI (ADR 0001): the tick screen asks this module what its card shows.

/** The teacher's setting on an assess step. Absent on the step means off. */
export interface GlowGrowSetting {
  glowStarter: string;
  growStarter: string;
}

export const DEFAULT_GLOW_STARTER = 'You did well at';
export const DEFAULT_GROW_STARTER = 'Next, try';
/** The one glow on offer when no cue was ticked 👍. */
export const GAVE_IT_A_GO = 'You gave it a go';
export const OWN_IDEA_LABEL = 'My own idea';
/** The longest a starter or an own idea can be. */
export const GLOW_GROW_MAX_LENGTH = 80;

/** Where a choice comes from: a ticked cue, the fixed glow, or the assessor's own idea. */
export type GlowGrowSource =
  | { kind: 'cue'; itemNumber: number }
  | { kind: 'fixed' }
  | { kind: 'own' };

/** A button on the card. For the own idea, `text` is the button's label. */
export interface GlowGrowChoice {
  source: GlowGrowSource;
  text: string;
  icon: string;
}

/**
 * What the assessor chose. It carries the wording they saw, so a later change
 * to a skill's cues never changes how an old pick reads.
 */
export interface GlowGrowPick {
  source: GlowGrowSource;
  text: string;
}

export interface GlowGrowPicks {
  glow?: GlowGrowPick;
  grow?: GlowGrowPick;
}

export interface GlowGrowCard {
  allTicked: boolean;        // every displayed cue is ticked: only then is the card shown
  tickedCount: number;
  glowStarter: string;
  growStarter: string;
  glowChoices: GlowGrowChoice[];
  growChoices: GlowGrowChoice[];
  picks: GlowGrowPicks;      // the picks that still fit the ticks
  complete: boolean;         // both picks made: the next button unlocks
  sentence?: string;         // once complete
}

/** The starters pupils see: the teacher's, or the default for one left blank. */
export const glowGrowStarters = (setting?: Partial<GlowGrowSetting>): GlowGrowSetting => ({
  glowStarter: setting?.glowStarter?.trim() || DEFAULT_GLOW_STARTER,
  growStarter: setting?.growStarter?.trim() || DEFAULT_GROW_STARTER,
});

const sameSource = (a: GlowGrowSource, b: GlowGrowSource) =>
  a.kind === b.kind && (a.kind !== 'cue' || a.itemNumber === (b as { itemNumber: number }).itemNumber);

/** The pick a tapped choice makes. An own idea starts empty, for the assessor to type. */
export const pickChoice = (choice: GlowGrowChoice): GlowGrowPick =>
  ({ source: choice.source, text: choice.source.kind === 'own' ? '' : choice.text });

/**
 * The own-idea box after the microphone hears something: what was in the box
 * when listening began, then the words heard, cut to the box's limit.
 */
export const addHeard = (before: string, heard: string): string => {
  const said = heard.trim();
  if (!said) return before;
  return [before.trim(), said].filter(Boolean).join(' ').slice(0, GLOW_GROW_MAX_LENGTH);
};

export const isPicked =(choice: GlowGrowChoice, pick?: GlowGrowPick) => !!pick && sameSource(choice.source, pick.source);

// A cue written as a question already ends its part of the sentence
const part = (starter: string, text: string) => `${starter}: ${text}${/[.!?]$/.test(text) ? '' : '.'}`;

/**
 * Everything the "Tell <performer>" card shows, from the lesson's cues for the
 * skill (already in the teacher's wording: getLessonCues), the assessor's
 * ticks (by cue id) and their picks so far.
 */
export const glowGrowCard = (input: {
  cues: PeerSyllabusCue[];
  ticks: Record<string, boolean>;
  performer: string;
  setting?: Partial<GlowGrowSetting>;
  picks?: GlowGrowPicks;
}): GlowGrowCard => {
  const { cues, ticks, performer, picks = {} } = input;
  const { glowStarter, growStarter } = glowGrowStarters(input.setting);

  const choice = (c: PeerSyllabusCue): GlowGrowChoice =>
    ({ source: { kind: 'cue', itemNumber: c.itemNumber }, text: c.kidFriendlyText, icon: c.icon });
  const up = cues.filter(c => ticks[c.id] === true).map(choice);
  const down = cues.filter(c => ticks[c.id] === false).map(choice);

  const glowChoices: GlowGrowChoice[] = up.length ? up : [{ source: { kind: 'fixed' }, text: GAVE_IT_A_GO, icon: '💪' }];
  const growChoices: GlowGrowChoice[] = [...down, { source: { kind: 'own' }, text: OWN_IDEA_LABEL, icon: '💡' }];

  // A pick whose cue is no longer on that side is dropped
  const still = (pick: GlowGrowPick | undefined, choices: GlowGrowChoice[]) =>
    pick && choices.some(c => isPicked(c, pick)) ? pick : undefined;
  const glow = still(picks.glow, glowChoices);
  const grow = still(picks.grow, growChoices);

  const tickedCount = up.length + down.length;
  const allTicked = cues.length > 0 && tickedCount === cues.length;
  const glowText = glow?.text.trim();
  const growText = grow?.text.trim();
  const complete = allTicked && !!glowText && !!growText;

  return {
    allTicked,
    tickedCount,
    glowStarter,
    growStarter,
    glowChoices,
    growChoices,
    picks: { ...(glow ? { glow } : {}), ...(grow ? { grow } : {}) },
    complete,
    ...(complete ? { sentence: `${performer}, ${part(glowStarter, glowText!)} ${part(growStarter, growText!)}` } : {}),
  };
};
