// Whether a lesson's pairs are planned (#182). Once pupils check in by name
// (#180), a lesson with no Pair Assignment can't be checked into, so the Lesson
// Planner and the Classroom Board warn before the QR goes up. Pure, so the
// rule is tested (pairPlan.test.ts).

import { classKey } from './classGroups';

/** As much of a lesson as the rule needs. */
export interface PlannedLesson {
  id: string;
  className: string;
  lessonDate: string; // YYYY-MM-DD
  pairCount: number;
}

/** One named place (Apple or Banana) in a pair of a lesson. */
export interface NamedPlace {
  lessonId: string;
  pairNumber: number;
}

export interface PairPlan<L extends PlannedLesson = PlannedLesson> {
  /** none: no place named; partial: some named; planned: every place named. */
  kind: 'none' | 'partial' | 'planned';
  /** Places (two per pair) with no pupil named. */
  unnamed: number;
  /** The latest earlier lesson of the same class with pairs, to copy them from. */
  copyFrom?: L;
}

/**
 * How far a lesson's pairs are planned, and the lesson to copy pairs from:
 * the latest earlier lesson (by date) of the same class that has any pairs.
 * Names in pairs the lesson no longer has (it was cut from 12 pairs to 10,
 * say) don't count.
 */
export const pairPlanOf = <L extends PlannedLesson>(lesson: L, lessons: L[], places: NamedPlace[]): PairPlan<L> => {
  const named = places.filter(p => p.lessonId === lesson.id && p.pairNumber <= lesson.pairCount).length;
  const unnamed = Math.max(0, lesson.pairCount * 2 - named);
  const kind = named === 0 ? 'none' : unnamed > 0 ? 'partial' : 'planned';

  const withPairs = new Set(places.map(p => p.lessonId));
  const copyFrom = lessons
    .filter(l => l.id !== lesson.id && l.lessonDate <= lesson.lessonDate
      && classKey(l.className) === classKey(lesson.className) && withPairs.has(l.id))
    .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate))[0];

  return { kind, unnamed, ...(copyFrom && { copyFrom }) };
};
