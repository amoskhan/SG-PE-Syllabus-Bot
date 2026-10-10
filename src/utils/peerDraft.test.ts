import { describe, it, expect } from 'vitest';
import { draftHasWork, draftIsFresh, draftSummary, peerDraftId, resumeStep } from './peerDraft';

const clip = new Blob(['clip'], { type: 'video/mp4' });

describe('resumeStep', () => {
    it('starts again when nothing was filmed', () => {
        expect(resumeStep({ step: 'APPLE_RECORDING' })).toBe('APPLE_INTRO');
    });

    it("goes back to Banana's replay when only Banana was filmed", () => {
        expect(resumeStep({ step: 'APPLE_REVIEW', bananaVideoBlob: clip })).toBe('APPLE_REVIEW');
    });

    it('goes to the swap screen once the pair had moved on to Apple', () => {
        expect(resumeStep({ step: 'SWAP_PROMPT', bananaVideoBlob: clip })).toBe('SWAP_PROMPT');
        expect(resumeStep({ step: 'BANANA_RECORDING', bananaVideoBlob: clip })).toBe('SWAP_PROMPT');
    });

    it("goes back to Apple's replay when Apple was filmed", () => {
        expect(resumeStep({ step: 'BANANA_REVIEW', bananaVideoBlob: clip, appleVideoBlob: clip })).toBe('BANANA_REVIEW');
    });

    it("re-films Apple when the device could not keep Apple's clip", () => {
        expect(resumeStep({ step: 'BANANA_REVIEW', bananaVideoBlob: clip })).toBe('SWAP_PROMPT');
    });
});

describe('draft helpers', () => {
    it('counts a clip or a tick as work, and nothing as nothing', () => {
        expect(draftHasWork({ bananaCues: {}, appleCues: {} })).toBe(false);
        expect(draftHasWork({ bananaCues: { 'ss-1': false }, appleCues: {} })).toBe(true);
        expect(draftHasWork({ bananaVideoBlob: clip, bananaCues: {}, appleCues: {} })).toBe(true);
    });

    it('ignores a draft from another day', () => {
        const now = Date.parse('2026-10-11T12:00:00Z');
        expect(draftIsFresh({ savedAt: '2026-10-11T08:00:00Z' }, now)).toBe(true);
        expect(draftIsFresh({ savedAt: '2026-10-10T08:00:00Z' }, now)).toBe(false);
    });

    it('keys a draft by lesson, pair and skill', () => {
        expect(peerDraftId('L1', 2, 'Shoulder Stand')).toBe('draft-L1-p2-shoulder_stand');
    });

    it('says who has been filmed', () => {
        expect(draftSummary({ bananaVideoBlob: clip })).toBe("Banana's video is recorded · Apple is next");
        expect(draftSummary({ bananaVideoBlob: clip, appleVideoBlob: clip })).toBe('Both videos recorded · finish your ticks');
    });
});
