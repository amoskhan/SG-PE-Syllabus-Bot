import type { PeerSyllabusCue } from '../data/peerSyllabusCues';
import type { Performer } from './pairWork';

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

/**
 * A finished glow and grow, as it is saved with the performer's ticks for the
 * teacher (#156). The teacher's starters are not saved with it.
 */
export interface SavedGlowGrow {
  glow: GlowGrowPick;
  grow: GlowGrowPick;
}

/** A pair's saved glow and grow, by the performer each was said TO. */
export interface PairGlowGrow {
  apple?: SavedGlowGrow;
  banana?: SavedGlowGrow;
}

const savedPick = (pick: unknown): GlowGrowPick | undefined => {
  const { source, text } = (pick ?? {}) as Partial<GlowGrowPick>;
  if (typeof text !== 'string' || !text.trim() || !source) return undefined;
  if (source.kind === 'cue') {
    return typeof source.itemNumber === 'number' ? { source: { kind: 'cue', itemNumber: source.itemNumber }, text: text.trim() } : undefined;
  }
  return source.kind === 'fixed' || source.kind === 'own' ? { source: { kind: source.kind }, text: text.trim() } : undefined;
};

/**
 * One performer's glow and grow from saved data (the teacher's copy, or this
 * device's). Anything that isn't a whole glow and grow reads as none.
 */
export const readGlowGrow = (value: unknown): SavedGlowGrow | undefined => {
  const { glow, grow } = (value ?? {}) as { glow?: unknown; grow?: unknown };
  const saved = { glow: savedPick(glow), grow: savedPick(grow) };
  return saved.glow && saved.grow ? { glow: saved.glow, grow: saved.grow } : undefined;
};

/** The picks in the form that is saved. Nothing is saved until both are chosen. */
export const savedGlowGrow = (picks?: GlowGrowPicks): SavedGlowGrow | undefined => readGlowGrow(picks);

/** A pair's saved glow and grow (the `glow_grow` column), or none. */
export const readPairGlowGrow = (value: unknown): PairGlowGrow | undefined => {
  const { apple, banana } = (value ?? {}) as { apple?: unknown; banana?: unknown };
  const pair: PairGlowGrow = {};
  const a = readGlowGrow(apple);
  const b = readGlowGrow(banana);
  if (a) pair.apple = a;
  if (b) pair.banana = b;
  return a || b ? pair : undefined;
};

/**
 * What a device sends as `glow_grow`, per performer: their glow and grow, or
 * null to clear the one the teacher's copy holds. A performer left out is left
 * alone (supabase_glow_grow.sql).
 */
export type PairGlowGrowToSend = { apple?: SavedGlowGrow | null; banana?: SavedGlowGrow | null };

/**
 * A glow and grow goes with the performer's peer ticks: for each performer
 * whose ticks are being sent, their glow and grow for that attempt, or an
 * explicit clear when it has none (the option was switched off since), so an
 * earlier attempt's never stays under newer ticks. `ticks` is each performer's
 * ticks as sent; none sent (the early auto-save of a clip) sends nothing.
 */
export const glowGrowToSend = (
  glowGrow: unknown,
  ticks: { apple?: unknown[]; banana?: unknown[] },
): PairGlowGrowToSend | undefined => {
  const pair = (glowGrow ?? {}) as { apple?: unknown; banana?: unknown };
  const out: PairGlowGrowToSend = {};
  for (const k of ['apple', 'banana'] as const) {
    if (ticks[k]?.length) out[k] = readGlowGrow(pair[k]) ?? null;
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * This device's record once `sent` has gone to the teacher, merged as the
 * teacher's copy merges it: a performer's entry replaces the one before, a
 * clear removes it, and a performer who wasn't sent keeps theirs.
 */
export const glowGrowAfterSend = (previous: unknown, sent: PairGlowGrowToSend | undefined): PairGlowGrow | undefined => {
  const kept = { ...readPairGlowGrow(previous) };
  for (const k of ['apple', 'banana'] as const) {
    const entry = sent?.[k];
    if (entry) kept[k] = entry;
    else if (entry === null) delete kept[k];
  }
  return readPairGlowGrow(kept);
};

export interface GlowGrowLine {
  label: 'Glow' | 'Grow';
  text: string;
  own: boolean; // the assessor's own idea, in their own words
}

/**
 * The two lines a saved glow and grow is shown as, on the Review Tray and Our
 * progress. The teacher's starters aren't saved, so the lines are labelled
 * "Glow" and "Grow". None for anything that isn't a whole glow and grow.
 */
export const glowGrowLines = (value: unknown): GlowGrowLine[] => {
  const said = readGlowGrow(value);
  if (!said) return [];
  return [
    { label: 'Glow', text: said.glow.text, own: said.glow.source.kind === 'own' },
    { label: 'Grow', text: said.grow.text, own: said.grow.source.kind === 'own' },
  ];
};

/** What a pair's tick screen saves: each performer's finished card, or nothing for one that isn't. */
export const pairGlowGrow = (cards: Record<Performer, GlowGrowCard | null>): PairGlowGrow | undefined =>
  readPairGlowGrow({
    apple: cards.Apple?.complete ? cards.Apple.picks : undefined,
    banana: cards.Banana?.complete ? cards.Banana.picks : undefined,
  });

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

// The card puts its own "…" after a starter and the sentence its own ":", so
// punctuation the teacher typed at the end ("You did well at:") is left off
const shown = (starter: string | undefined) => starter?.replace(/[\s:;,.!?…–—-]+$/, '').trim();

/** The starters pupils see: the teacher's, or the default for one left blank. */
export const glowGrowStarters = (setting?: Partial<GlowGrowSetting>): GlowGrowSetting => ({
  glowStarter: shown(setting?.glowStarter) || DEFAULT_GLOW_STARTER,
  growStarter: shown(setting?.growStarter) || DEFAULT_GROW_STARTER,
});

const sameSource = (a: GlowGrowSource, b: GlowGrowSource) =>
  a.kind === 'cue' ? b.kind === 'cue' && a.itemNumber === b.itemNumber : a.kind === b.kind;

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

export const isPicked = (choice: GlowGrowChoice, pick?: GlowGrowPick) => !!pick && sameSource(choice.source, pick.source);

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
  performer: Performer;
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
