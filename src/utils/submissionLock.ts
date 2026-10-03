// Whether a performer in a pair can still send (or resend) their work. Mirrors
// performer_locked() in supabase_submission_lock.sql, which is what actually
// enforces it; this copy is for showing the state to teachers and pupils.
//
// Each performer's work locks as soon as it is sent (GLOSSARY.md: Submission).
// A redo request from the teacher opens it again; sending after that locks it
// again.

export type PerformerLock = 'open' | 'locked' | 'redo_requested';

const time = (t?: string | Date) => (t ? new Date(t).getTime() : -Infinity);

export const performerLock = (
  sentAt: string | Date | undefined,
  redoRequestedAt: string | Date | undefined,
): PerformerLock => {
  const sent = time(sentAt);
  const redo = time(redoRequestedAt);
  if (redo > -Infinity && redo > sent) return 'redo_requested';
  return sent > -Infinity ? 'locked' : 'open';
};

/** Lessons run on Singapore dates (sg_today() in the database). */
const singaporeDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

/** True when `at` falls on the same Singapore date as `now`. */
export const isSameSingaporeDay = (at: string | undefined, now: Date): boolean => {
  const d = at ? new Date(at) : null;
  return !!d && !Number.isNaN(d.getTime()) && singaporeDate(d) === singaporeDate(now);
};

/** What pupils see when they try to send work that's already sent. */
export const LOCKED_MESSAGE =
  "This has already been sent to your teacher, so it can't be sent again. If you'd like another try, ask your teacher.";

/** What pupils see when the teacher has asked them to try again. */
export const REDO_MESSAGE = 'Your teacher asked you to try again. Record it again and send it to your teacher.';
