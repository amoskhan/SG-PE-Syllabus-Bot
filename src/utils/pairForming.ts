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
