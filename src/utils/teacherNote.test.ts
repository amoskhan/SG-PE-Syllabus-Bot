import { describe, expect, it } from 'vitest';
import { noteStatus, sendLabel } from './teacherNote';

// 06:41 UTC = 2:41 pm in Singapore
const SENT = '2026-11-17T06:41:00Z';
const SEEN = '2026-11-17T06:43:00Z';

describe('sendLabel', () => {
  it('shows the button is working, and that a failed send can be tried again', () => {
    expect(sendLabel('idle')).toBe('💬 Send');
    expect(sendLabel('sending')).toBe('Sending…');
    expect(sendLabel('failed')).toBe('Couldn’t send – tap to try again');
  });
});

describe('noteStatus', () => {
  it('says nothing when there is no Teacher Note', () => {
    expect(noteStatus({})).toBeNull();
  });

  it('gives the Singapore time it was sent, and that the pair hasn’t seen it yet', () => {
    expect(noteStatus({ teacherFeedback: 'Bend your knees', teacherFeedbackSentAt: SENT })).toBe(
      '✓ Sent 2:41 pm · not seen yet');
  });

  it('gives the time the pair’s iPad showed it', () => {
    expect(noteStatus({ teacherFeedback: 'Bend your knees', teacherFeedbackSentAt: SENT, teacherFeedbackSeenAt: SEEN })).toBe(
      '✓ Sent 2:41 pm · 👀 Seen 2:43 pm');
  });

  it('just says Sent when the times aren’t known (before the SQL file is run)', () => {
    expect(noteStatus({ teacherFeedback: 'Bend your knees' })).toBe('✓ Sent');
  });
});
