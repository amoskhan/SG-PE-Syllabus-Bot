// Check-in by name (#183, ADR 0004): what a pupil's iPad shows after scanning
// the class QR. Pupils tap their own names; the pair number and who is Apple
// or Banana come from the teacher's Pair Assignment, not from who taps first.
// Pure, so every outcome is tested (checkIn.test.ts). The Check-in screen only
// renders what this returns.

export type Performer = 'apple' | 'banana';

/** One student in today's Pair Assignment, as a pupil device may see them. */
export interface PlannedStudent {
  studentId: string;
  /** The only name a pupil device shows (GLOSSARY: Short Name). */
  shortName: string;
  pairNumber: number;
  performer: Performer;
  /** Already checked in this lesson, on any iPad. */
  taken: boolean;
}

export interface NameButton {
  studentId: string;
  label: string;
  taken: boolean;
}

/** What the partner taps when their partner isn't in class. */
export const PARTNER_ABSENT = 'partner-absent';

export type CheckInScreen =
  | { kind: 'names'; names: NameButton[] }
  | { kind: 'partner'; pairNumber: number; apple: PlannedStudent; banana: PlannedStudent; waitingFor: PlannedStudent; names: NameButton[] }
  | { kind: 'ready'; pairNumber: number; apple: PlannedStudent; banana: PlannedStudent }
  | { kind: 'taken'; student: PlannedStudent }
  | { kind: 'wrong_partner'; expected: PlannedStudent; tapped: PlannedStudent }
  | { kind: 'ask_teacher'; reason: 'no_plan' | 'not_planned' | 'no_partner' | 'partner_absent' };

const ICON: Record<Performer, string> = { apple: '🍎', banana: '🍌' };

/** One pupil's name on the iPad: their Short Name, or their pair and role if it's missing. */
export const nameOf = (p: PlannedStudent) => p.shortName.trim() || `Pair ${p.pairNumber} ${ICON[p.performer]}`;

/** The name buttons: Short Names in order, told apart by pair when two match. */
const namesOf = (planned: PlannedStudent[]): NameButton[] => {
  const base = (p: PlannedStudent) => p.shortName.trim();
  const count = new Map<string, number>();
  for (const p of planned) if (base(p)) count.set(base(p).toLowerCase(), (count.get(base(p).toLowerCase()) ?? 0) + 1);
  const label = (p: PlannedStudent) =>
    !base(p) ? `Pair ${p.pairNumber} ${ICON[p.performer]}`
    : (count.get(base(p).toLowerCase()) ?? 0) > 1 ? `${base(p)} · Pair ${p.pairNumber}`
    : base(p);
  return planned
    .map(p => ({ studentId: p.studentId, label: label(p), taken: p.taken }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
};

/**
 * What the iPad shows, given today's plan and the names tapped so far (first
 * pupil, then partner). Called again whenever the plan is fetched, so a name
 * taken on another iPad, or a pair the teacher changes, shows at once.
 */
export const checkInScreen = (planned: PlannedStudent[], picks: string[]): CheckInScreen => {
  if (!planned.length) return { kind: 'ask_teacher', reason: 'no_plan' };
  const names = namesOf(planned);
  if (!picks.length) return { kind: 'names', names };

  const first = planned.find(p => p.studentId === picks[0]);
  if (!first) return { kind: 'ask_teacher', reason: 'not_planned' };
  if (first.taken) return { kind: 'taken', student: first };
  const partner = planned.find(p => p.pairNumber === first.pairNumber && p.performer !== first.performer);
  if (!partner) return { kind: 'ask_teacher', reason: 'no_partner' };
  const apple = first.performer === 'apple' ? first : partner;
  const banana = first.performer === 'apple' ? partner : first;

  if (picks.length < 2) return { kind: 'partner', pairNumber: first.pairNumber, apple, banana, waitingFor: partner, names };
  if (picks[1] === PARTNER_ABSENT) return { kind: 'ask_teacher', reason: 'partner_absent' };
  const tapped = planned.find(p => p.studentId === picks[1]);
  if (!tapped) return { kind: 'ask_teacher', reason: 'not_planned' };
  if (tapped.studentId !== partner.studentId) return { kind: 'wrong_partner', expected: partner, tapped };
  if (partner.taken) return { kind: 'taken', student: partner };
  return { kind: 'ready', pairNumber: first.pairNumber, apple, banana };
};
