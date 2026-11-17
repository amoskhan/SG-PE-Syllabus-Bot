import { describe, expect, it } from 'vitest';
import { nextPairNumber, pairChangeWarning, pairCountFor, pairsOf } from './pairForming';

const slot = (pairNumber: number, performer: 'apple' | 'banana', studentId: string, lessonId = 'L') =>
  ({ lessonId, pairNumber, performer, studentId });

describe('pairsOf', () => {
  it('gives one lesson’s pairs in order, with a missing partner left empty', () => {
    const slots = [slot(3, 'banana', 'dev'), slot(1, 'apple', 'amos'), slot(1, 'banana', 'joseph'), slot(3, 'apple', 'chen'),
      slot(2, 'apple', 'zara'), slot(1, 'apple', 'other', 'M')];
    expect(pairsOf(slots, 'L')).toEqual([
      { pairNumber: 1, apple: 'amos', banana: 'joseph' },
      { pairNumber: 2, apple: 'zara' },
      { pairNumber: 3, apple: 'chen', banana: 'dev' },
    ]);
  });
});

describe('nextPairNumber', () => {
  it('takes the lowest free number, so pairs already checked in keep theirs', () => {
    expect(nextPairNumber([])).toBe(1);
    expect(nextPairNumber([{ pairNumber: 1 }, { pairNumber: 2 }])).toBe(3);
    expect(nextPairNumber([{ pairNumber: 1 }, { pairNumber: 3 }])).toBe(2);
  });
});

describe('pairCountFor', () => {
  it('is the highest pair number in use, and at least 1', () => {
    expect(pairCountFor([])).toBe(1);
    expect(pairCountFor([{ pairNumber: 1 }, { pairNumber: 4 }])).toBe(4);
  });
});

describe('pairChangeWarning', () => {
  const pair = { pairNumber: 5, apple: 'Amos', banana: 'Joseph' };

  it('says nothing when the pair has sent no work', () => {
    expect(pairChangeWarning(pair, false, { kind: 'split' })).toBeNull();
    expect(pairChangeWarning(pair, false, { kind: 'swap' })).toBeNull();
  });

  it('warns that splitting takes the work off both records', () => {
    expect(pairChangeWarning(pair, true, { kind: 'split' })).toBe(
      'Pair 5 has already sent work. Splitting them takes it off Amos’s and Joseph’s records until you name Pair 5 again.');
  });

  it('warns that swapping files each video under the other pupil', () => {
    expect(pairChangeWarning(pair, true, { kind: 'swap' })).toBe(
      'Pair 5 has already sent work. Swapping files Amos’s work under Joseph, and Joseph’s under Amos.');
  });

  it('warns whose records the work goes to when a place is filled', () => {
    expect(pairChangeWarning({ pairNumber: 5, apple: 'Amos' }, true, { kind: 'fill', performer: 'banana', name: 'Dev' })).toBe(
      'Pair 5 has already sent work. Banana’s work will be filed under Dev.');
  });

  it('warns when a new pair takes the number of a pair that sent work', () => {
    expect(pairChangeWarning({ pairNumber: 2 }, true, { kind: 'new', apple: 'Chen', banana: 'Dev' })).toBe(
      'Pair 2 has already sent work. It will be filed under Chen and Dev.');
  });
});
