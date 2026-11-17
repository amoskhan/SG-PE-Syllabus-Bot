import { describe, expect, it } from 'vitest';
import { PARTNER_ABSENT, checkInScreen, type PlannedStudent } from './checkIn';

const aisha: PlannedStudent = { studentId: 'aisha', shortName: 'Aisha', pairNumber: 5, performer: 'apple', taken: false };
const bala: PlannedStudent = { studentId: 'bala', shortName: 'Bala', pairNumber: 5, performer: 'banana', taken: false };
const chen: PlannedStudent = { studentId: 'chen', shortName: 'Chen', pairNumber: 6, performer: 'apple', taken: false };
const dev: PlannedStudent = { studentId: 'dev', shortName: 'Dev', pairNumber: 6, performer: 'banana', taken: false };
const plan = [dev, bala, chen, aisha];

describe('checkInScreen', () => {
  it('lists only the planned names, in order, with taken ones marked', () => {
    const screen = checkInScreen([...plan.filter(p => p !== dev), { ...dev, taken: true }], []);
    expect(screen).toEqual({
      kind: 'names',
      names: [
        { studentId: 'aisha', label: 'Aisha', taken: false },
        { studentId: 'bala', label: 'Bala', taken: false },
        { studentId: 'chen', label: 'Chen', taken: false },
        { studentId: 'dev', label: 'Dev', taken: true },
      ],
    });
  });

  it('shows the planned pair and roles after the first tap, whoever taps first', () => {
    const screen = checkInScreen(plan, ['bala']);
    expect(screen).toMatchObject({ kind: 'partner', pairNumber: 5, apple: aisha, banana: bala, waitingFor: aisha });
  });

  it('is ready for the photo when the partner taps their own name', () => {
    expect(checkInScreen(plan, ['aisha', 'bala'])).toEqual({ kind: 'ready', pairNumber: 5, apple: aisha, banana: bala });
  });

  it('says wrong partner when the partner taps someone else, and lets them try again', () => {
    expect(checkInScreen(plan, ['aisha', 'chen'])).toEqual({ kind: 'wrong_partner', expected: bala, tapped: chen });
  });

  it('says wrong partner when both tap the same name', () => {
    expect(checkInScreen(plan, ['aisha', 'aisha'])).toEqual({ kind: 'wrong_partner', expected: bala, tapped: aisha });
  });

  it('sends a pupil whose partner is absent to the teacher', () => {
    expect(checkInScreen(plan, ['aisha', PARTNER_ABSENT])).toEqual({ kind: 'ask_teacher', reason: 'partner_absent' });
  });

  it('sends a pupil with no planned partner to the teacher', () => {
    expect(checkInScreen([aisha, chen, dev], ['aisha'])).toEqual({ kind: 'ask_teacher', reason: 'no_partner' });
  });

  it('sends an unplanned name to the teacher', () => {
    expect(checkInScreen(plan, ['zara'])).toEqual({ kind: 'ask_teacher', reason: 'not_planned' });
  });

  it('refuses a taken name, first or second', () => {
    expect(checkInScreen([{ ...aisha, taken: true }, bala], ['aisha'])).toEqual({ kind: 'taken', student: { ...aisha, taken: true } });
    expect(checkInScreen([aisha, { ...bala, taken: true }], ['aisha', 'bala'])).toEqual({ kind: 'taken', student: { ...bala, taken: true } });
  });

  it('sends everyone to the teacher when the lesson has no Pair Assignment', () => {
    expect(checkInScreen([], [])).toEqual({ kind: 'ask_teacher', reason: 'no_plan' });
  });

  it('follows the plan when the teacher changes it while the pair waits', () => {
    const moved = [aisha, { ...chen, pairNumber: 5, performer: 'banana' as const }, { ...bala, pairNumber: 6, performer: 'apple' as const }, dev];
    expect(checkInScreen(moved, ['aisha'])).toMatchObject({ kind: 'partner', waitingFor: { studentId: 'chen' } });
    expect(checkInScreen(moved, ['aisha', 'bala'])).toMatchObject({ kind: 'wrong_partner', expected: { studentId: 'chen' } });
    expect(checkInScreen(plan.filter(p => p !== aisha), ['aisha'])).toEqual({ kind: 'ask_teacher', reason: 'not_planned' });
  });

  it('never shows a blank button: a missing Short Name shows its pair and role', () => {
    // The database sends the first word of the full name when there's no
    // Short Name (supabase_check_in_by_name.sql); this is the last resort.
    const screen = checkInScreen([{ ...aisha, shortName: ' ' }, bala], []);
    expect(screen).toMatchObject({ kind: 'names', names: [{ studentId: 'bala', label: 'Bala' }, { studentId: 'aisha', label: 'Pair 5 🍎' }] });
  });

  it('tells two pupils with the same Short Name apart by pair', () => {
    const screen = checkInScreen([aisha, bala, { ...chen, shortName: 'Aisha' }, dev], []);
    expect(screen).toMatchObject({ kind: 'names', names: [{ label: 'Aisha · Pair 5' }, { label: 'Aisha · Pair 6' }, { label: 'Bala' }, { label: 'Dev' }] });
  });
});
