// The Teacher Note (#179): the comment a teacher sends a pair from the Review
// Tray. Pure, so the wording is tested (teacherNote.test.ts).

/** Where the Send button is: ready, waiting for the save, or the save failed. */
export type NoteSend = 'idle' | 'sending' | 'failed';

export const sendLabel = (state: NoteSend): string =>
  state === 'sending' ? 'Sending…' : state === 'failed' ? 'Couldn’t send – tap to try again' : '💬 Send';

/** A time of day in Singapore, e.g. "2:41 pm". */
const clock = (iso: string) =>
  new Date(iso)
    .toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })
    .replace(/\s*(am|pm)$/i, (_, m: string) => ` ${m.toLowerCase()}`);

/**
 * The line under a sent Teacher Note: when it was sent and whether the pair's
 * iPad has shown it. The times come from supabase_teacher_note_seen.sql; before
 * it is run they're absent and the line just says Sent.
 */
export const noteStatus = (r: {
  teacherFeedback?: string;
  teacherFeedbackSentAt?: string;
  teacherFeedbackSeenAt?: string;
}): string | null => {
  if (!r.teacherFeedback) return null;
  if (!r.teacherFeedbackSentAt) return '✓ Sent';
  const sent = `✓ Sent ${clock(r.teacherFeedbackSentAt)}`;
  return r.teacherFeedbackSeenAt ? `${sent} · 👀 Seen ${clock(r.teacherFeedbackSeenAt)}` : `${sent} · not seen yet`;
};
