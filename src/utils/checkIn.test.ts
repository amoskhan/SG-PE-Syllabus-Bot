import { describe, expect, it } from 'vitest';
import { PARTNER_ABSENT, checkInScreen, type PlannedStudent } from './checkIn';

const amos: PlannedStudent = { studentId: 'amos', shortName: 'Amos', pairNumber: 1, performer: 'apple', taken: false };
const joseph: PlannedStudent = { studentId: 'joseph', shortName: 'Joseph', pairNumber: 1, performer: 'banana', taken: false };
const chen: PlannedStudent = { studentId: 'chen', shortName: 'Chen', pairNumber: 2, performer: 'apple', taken: false };
const dev: PlannedStudent = { studentId: 'dev', shortName: 'Dev', pairNumber: 2, performer: 'banana', taken: false };
const plan = [dev, joseph, chen, amos];
const pair1 = { pairNumber: 1, appleId: 'amos', bananaId: 'joseph' };

describe('checkInScreen', () => {
  it('lists the planned pairs in order, each as its two names, with taken pairs marked', () => {
    expect(checkInScreen([amos, joseph, { ...chen, taken: true }, { ...dev, taken: true }], null)).toEqual({
      kind: 'pairs',
      pairs: [
        { pairNumber: 1, label: 'Amos & Joseph', appleId: 'amos', bananaId: 'joseph', taken: false },
        { pairNumber: 2, label: 'Chen & Dev', appleId: 'chen', bananaId: 'dev', taken: true },
      ],
    });
  });

  it('is ready for the photo when a pair taps their names, with roles from the plan', () => {
    expect(checkInScreen(plan, pair1)).toEqual({ kind: 'ready', pairNumber: 1, apple: amos, banana: joseph });
  });

  it('sends a pair with one name missing to the teacher', () => {
    const screen = checkInScreen([amos, chen, dev], null);
    expect(screen).toMatchObject({ kind: 'pairs', pairs: [{ pairNumber: 1, label: 'Amos', appleId: 'amos' }, { label: 'Chen & Dev' }] });
    expect(checkInScreen([amos, chen, dev], { pairNumber: 1, appleId: 'amos' })).toEqual({ kind: 'ask_teacher', reason: 'no_partner' });
  });

  it('sends a pupil whose partner is absent to the teacher', () => {
    expect(checkInScreen(plan, PARTNER_ABSENT)).toEqual({ kind: 'ask_teacher', reason: 'partner_absent' });
  });

  it('refuses a pair taken on another iPad after they tapped', () => {
    expect(checkInScreen([{ ...amos, taken: true }, joseph, chen, dev], pair1)).toMatchObject({ kind: 'taken', pairNumber: 1 });
  });

  it('sends everyone to the teacher when the lesson has no Pair Assignment', () => {
    expect(checkInScreen([], null)).toEqual({ kind: 'ask_teacher', reason: 'no_plan' });
  });

  it('goes back to the pairs, saying so, when the teacher changes the pair while they wait', () => {
    const moved = [amos, { ...chen, pairNumber: 1, performer: 'banana' as const }, { ...joseph, pairNumber: 2, performer: 'apple' as const }, dev];
    expect(checkInScreen(moved, pair1)).toMatchObject({ kind: 'pairs', changed: true, pairs: [{ label: 'Amos & Chen' }, { label: 'Joseph & Dev' }] });
  });

  it('never shows a blank name: a missing Short Name shows its pair and role', () => {
    // The database sends the first word of the full name when there's no
    // Short Name (supabase_check_in_by_name.sql); this is the last resort.
    expect(checkInScreen([{ ...amos, shortName: ' ' }, joseph], null))
      .toMatchObject({ kind: 'pairs', pairs: [{ label: 'Pair 1 🍎 & Joseph' }] });
  });
});
