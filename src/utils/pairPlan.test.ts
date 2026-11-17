import { describe, expect, it } from 'vitest';
import { pairPlanOf, type PlannedLesson } from './pairPlan';

const lesson = (id: string, lessonDate: string, className = '4P', pairCount = 2): PlannedLesson =>
  ({ id, lessonDate, className, pairCount });
const slot = (lessonId: string, pairNumber: number, performer: 'apple' | 'banana') =>
  ({ lessonId, pairNumber, performer, studentId: `${lessonId}-${pairNumber}-${performer}` });

describe('pairPlanOf', () => {
  const today = lesson('today', '2026-11-17');

  it('says no pairs are planned when no place is named', () => {
    expect(pairPlanOf(today, [today], [])).toEqual({ kind: 'none', unnamed: 4 });
  });

  it('counts the places still unnamed when some are named', () => {
    expect(pairPlanOf(today, [today], [slot('today', 1, 'apple'), slot('today', 2, 'banana')]))
      .toEqual({ kind: 'partial', unnamed: 2 });
  });

  it('is planned when every place is named', () => {
    const slots = [1, 2].flatMap(n => [slot('today', n, 'apple'), slot('today', n, 'banana')]);
    expect(pairPlanOf(today, [today], slots)).toEqual({ kind: 'planned', unnamed: 0 });
  });

  it('ignores names in pairs the lesson no longer has', () => {
    expect(pairPlanOf(today, [today], [slot('today', 3, 'apple')])).toEqual({ kind: 'none', unnamed: 4 });
  });

  it('offers to copy from the latest earlier lesson of the same class that has pairs', () => {
    const older = lesson('older', '2026-11-03');
    const last = lesson('last', '2026-11-10', '4 p');
    const unplanned = lesson('unplanned', '2026-11-12');
    const otherClass = lesson('other', '2026-11-14', '4Q');
    const later = lesson('later', '2026-11-24');
    const slots = ['older', 'last', 'other', 'later'].map(id => slot(id, 1, 'apple'));
    expect(pairPlanOf(today, [today, older, last, unplanned, otherClass, later], slots))
      .toEqual({ kind: 'none', unnamed: 4, copyFrom: last });
  });

  it('offers nothing to copy when no earlier lesson of the class has pairs', () => {
    const later = lesson('later', '2026-11-24');
    expect(pairPlanOf(today, [today, later], [slot('later', 1, 'apple')]).copyFrom).toBeUndefined();
  });
});
