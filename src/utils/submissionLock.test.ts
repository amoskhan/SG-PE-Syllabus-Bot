import { describe, it, expect } from 'vitest';
import { performerLock, isSameSingaporeDay } from './submissionLock';

describe('performerLock', () => {
    it("is open until the performer's work is sent", () => {
        expect(performerLock(undefined, undefined)).toBe('open');
    });

    it('locks as soon as the work is sent', () => {
        expect(performerLock('2026-10-03T09:00:00Z', undefined)).toBe('locked');
    });

    it('reopens when the teacher makes a redo request after it was sent', () => {
        expect(performerLock('2026-10-03T09:00:00Z', '2026-10-03T09:05:00Z')).toBe('redo_requested');
    });

    it('locks again when the work is sent after the redo request', () => {
        expect(performerLock('2026-10-03T09:10:00Z', '2026-10-03T09:05:00Z')).toBe('locked');
    });

    it('shows a redo request even if this performer had not sent anything yet', () => {
        expect(performerLock(undefined, '2026-10-03T09:05:00Z')).toBe('redo_requested');
    });

    it('treats sending at the same moment as the redo request as sent after it', () => {
        expect(performerLock('2026-10-03T09:05:00Z', '2026-10-03T09:05:00Z')).toBe('locked');
    });
});

describe('isSameSingaporeDay', () => {
    it('is true later the same day in Singapore', () => {
        // 08:00 and 22:00 Singapore time (UTC+8)
        expect(isSameSingaporeDay('2026-10-03T00:00:00Z', new Date('2026-10-03T14:00:00Z'))).toBe(true);
    });

    it('is false once the Singapore date has changed, even if the UTC date has not', () => {
        // 23:00 on the 3rd, then 00:30 on the 4th, Singapore time
        expect(isSameSingaporeDay('2026-10-03T15:00:00Z', new Date('2026-10-03T16:30:00Z'))).toBe(false);
    });

    it('is false for a missing or invalid time', () => {
        expect(isSameSingaporeDay(undefined, new Date())).toBe(false);
        expect(isSameSingaporeDay('not a date', new Date())).toBe(false);
    });
});
