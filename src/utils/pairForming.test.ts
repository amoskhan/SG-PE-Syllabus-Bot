import { describe, expect, it } from 'vitest';
import { nextPairNumber, pairCountFor, pairsOf } from './pairForming';

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
