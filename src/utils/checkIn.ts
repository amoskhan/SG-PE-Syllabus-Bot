// Check-in by name (#183, ADR 0004): what a pupil's iPad shows after scanning
// the class QR. The iPad lists today's pairs by their names ("Amos & Joseph")
// and the pair taps theirs. The pair number and who is Apple or Banana come
// from the teacher's Pair Assignment. Pure, so every outcome is tested
// (checkIn.test.ts). The Check-in screen only renders what this returns.

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

/** One pair's button, and what tapping it chooses. */
export interface PairButton {
  pairNumber: number;
  label: string;
  appleId?: string;
  bananaId?: string;
  taken: boolean;
}

/** The pair a pupil tapped: its number and the students it had then. */
export type PairChoice = Pick<PairButton, 'pairNumber' | 'appleId' | 'bananaId'>;

/** Tapped when a pupil's partner isn't in class. */
export const PARTNER_ABSENT = 'partner-absent';

export type CheckInScreen =
  | { kind: 'pairs'; pairs: PairButton[]; changed?: boolean }
  | { kind: 'ready'; pairNumber: number; apple: PlannedStudent; banana: PlannedStudent }
  | { kind: 'taken'; pairNumber: number; label: string }
  | { kind: 'ask_teacher'; reason: 'no_plan' | 'no_partner' | 'partner_absent' };

const ICON: Record<Performer, string> = { apple: '🍎', banana: '🍌' };

/** One pupil's name on the iPad: their Short Name, or their pair and role if it's missing. */
export const nameOf = (p: PlannedStudent) => p.shortName.trim() || `Pair ${p.pairNumber} ${ICON[p.performer]}`;

/** The pairs as buttons, in pair order: Apple's name, then Banana's. */
const pairsOf = (planned: PlannedStudent[]): PairButton[] => {
  const numbers = [...new Set(planned.map(p => p.pairNumber))].sort((a, b) => a - b);
  return numbers.map(pairNumber => {
    const apple = planned.find(p => p.pairNumber === pairNumber && p.performer === 'apple');
    const banana = planned.find(p => p.pairNumber === pairNumber && p.performer === 'banana');
    return {
      pairNumber,
      label: [apple, banana].filter((p): p is PlannedStudent => !!p).map(nameOf).join(' & '),
      ...(apple && { appleId: apple.studentId }),
      ...(banana && { bananaId: banana.studentId }),
      taken: !!(apple?.taken || banana?.taken),
    };
  });
};

/**
 * What the iPad shows, given today's plan and the pair tapped (if any).
 * Called again whenever the plan is fetched, so a pair taken on another iPad,
 * or a pair the teacher changes, shows at once.
 */
export const checkInScreen = (planned: PlannedStudent[], choice: PairChoice | typeof PARTNER_ABSENT | null): CheckInScreen => {
  if (!planned.length) return { kind: 'ask_teacher', reason: 'no_plan' };
  if (choice === PARTNER_ABSENT) return { kind: 'ask_teacher', reason: 'partner_absent' };
  const pairs = pairsOf(planned);
  if (!choice) return { kind: 'pairs', pairs };

  const now = pairs.find(p => p.pairNumber === choice.pairNumber);
  if (!now || now.appleId !== choice.appleId || now.bananaId !== choice.bananaId) return { kind: 'pairs', pairs, changed: true };
  const apple = planned.find(p => p.studentId === now.appleId);
  const banana = planned.find(p => p.studentId === now.bananaId);
  if (!apple || !banana) return { kind: 'ask_teacher', reason: 'no_partner' };
  if (now.taken) return { kind: 'taken', pairNumber: now.pairNumber, label: now.label };
  return { kind: 'ready', pairNumber: now.pairNumber, apple, banana };
};
