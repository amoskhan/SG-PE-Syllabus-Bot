// Forming a lesson's pairs on the Classroom Board (#187): the teacher taps two
// names and they become the next pair. Pure, so the numbering rules are
// tested (pairForming.test.ts).

export interface FormedPair {
  pairNumber: number;
  apple?: string; // student id
  banana?: string;
}

/** One lesson's pairs, in pair order. A pair with one name keeps the other empty. */
export const pairsOf = (
  slots: { lessonId: string; pairNumber: number; performer: 'apple' | 'banana'; studentId: string }[],
  lessonId: string,
): FormedPair[] => {
  const byNumber = new Map<number, FormedPair>();
  for (const s of slots) {
    if (s.lessonId !== lessonId) continue;
    const pair = byNumber.get(s.pairNumber) ?? { pairNumber: s.pairNumber };
    pair[s.performer] = s.studentId;
    byNumber.set(s.pairNumber, pair);
  }
  return [...byNumber.values()].sort((a, b) => a.pairNumber - b.pairNumber);
};

/**
 * The number a new pair takes: the lowest one free. Pairs are never
 * renumbered, so a pair that has checked in or sent work keeps its number.
 */
export const nextPairNumber = (pairs: { pairNumber: number }[]): number => {
  const used = new Set(pairs.map(p => p.pairNumber));
  let n = 1;
  while (used.has(n)) n++;
  return n;
};

/** The lesson's pair count: the highest pair number in use (a lesson has at least one). */
export const pairCountFor = (pairs: { pairNumber: number }[]): number =>
  Math.max(1, ...pairs.map(p => p.pairNumber));

// ── Changing pairs mid-lesson (#185) ────────────────────────────────────────

/** A change to one pair, with the names (as the teacher sees them) it involves. */
export type PairChange =
  | { kind: 'split' }
  | { kind: 'swap' }
  | { kind: 'fill'; performer: 'apple' | 'banana'; name: string }
  | { kind: 'new'; apple: string; banana: string };

/**
 * What to tell the teacher before changing a pair that has already sent work,
 * or null if it hasn't. The database files a pair's work under whoever is
 * named in it (sync_practice_analysis), so the change moves the work.
 * `pair` gives the names now in the pair.
 */
export const pairChangeWarning = (
  pair: { pairNumber: number; apple?: string; banana?: string },
  hasWork: boolean,
  change: PairChange,
): string | null => {
  if (!hasWork) return null;
  const sent = `Pair ${pair.pairNumber} has already sent work.`;
  const both = [pair.apple, pair.banana].filter(Boolean).map(n => `${n}’s`).join(' and ');
  switch (change.kind) {
    case 'split':
      return `${sent} Splitting them takes it off ${both || 'their'} records until you name Pair ${pair.pairNumber} again.`;
    case 'swap':
      return pair.apple && pair.banana
        ? `${sent} Swapping files ${pair.apple}’s work under ${pair.banana}, and ${pair.banana}’s under ${pair.apple}.`
        : `${sent} Swapping changes whose record it is filed under.`;
    case 'fill':
      return `${sent} ${change.performer === 'apple' ? 'Apple' : 'Banana'}’s work will be filed under ${change.name}.`;
    case 'new':
      return `${sent} It will be filed under ${change.apple} and ${change.banana}.`;
  }
};
