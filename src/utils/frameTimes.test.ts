import { describe, it, expect } from 'vitest';
import { frameTimesNote } from './frameTimes';

describe('frameTimesNote', () => {
    it('lists each frame with its time and the span they cover', () => {
        const note = frameTimesNote([0.25, 0.75, 1.25, 3.75]);
        expect(note).toContain('1: 0.3s, 2: 0.8s, 3: 1.3s, 4: 3.8s');
        expect(note).toContain('The 4 performance frames');
        expect(note).toContain('They span 3.5s');
    });

    it('tells the AI to mark a timed criterion unclear when the frames cannot show it', () => {
        expect(frameTimesNote([0, 1])).toMatch(/mark that criterion ⚠️/);
    });

    it('says nothing when a time is missing or there is nothing to compare', () => {
        expect(frameTimesNote(undefined)).toBe('');
        expect(frameTimesNote([])).toBe('');
        expect(frameTimesNote([1.2])).toBe('');
        expect(frameTimesNote([0.5, undefined, 1.5])).toBe('');
        expect(frameTimesNote([0.5, NaN])).toBe('');
    });
});
