import { describe, it, expect } from 'vitest';
import { performerStage, performerWork, PerformerWork } from './pairWork';
import type { PairSubmissionRecord } from '../services/offline/offlineStorage';

const work = (w: Partial<PerformerWork> = {}): PerformerWork => ({
    hasClip: false,
    ticked: false,
    refilmed: false,
    hasAnalysis: false,
    lock: 'open',
    ...w,
});

describe('performerStage', () => {
    it('has not started before a clip is recorded', () => {
        expect(performerStage(work())).toEqual({ stage: 'not_started', canFilmAgain: false, canSubmitFinal: false });
    });

    it('needs the assessor to tick before anything else', () => {
        expect(performerStage(work({ hasClip: true }))).toEqual({ stage: 'needs_ticks', canFilmAgain: true, canSubmitFinal: false });
    });

    it('waits for the AI analysis before the final submission', () => {
        expect(performerStage(work({ hasClip: true, ticked: true }))).toEqual({ stage: 'needs_analysis', canFilmAgain: true, canSubmitFinal: false });
    });

    it('is ready to submit once clip, ticks and analysis are there', () => {
        expect(performerStage(work({ hasClip: true, ticked: true, hasAnalysis: true })))
            .toEqual({ stage: 'ready', canFilmAgain: true, canSubmitFinal: true });
    });

    it('allows only one re-film before the final submission', () => {
        expect(performerStage(work({ hasClip: true, ticked: true, hasAnalysis: true, refilmed: true })))
            .toEqual({ stage: 'ready', canFilmAgain: false, canSubmitFinal: true });
    });

    it('needs ticks again after a re-film', () => {
        expect(performerStage(work({ hasClip: true, ticked: false, hasAnalysis: true, refilmed: true })))
            .toEqual({ stage: 'needs_ticks', canFilmAgain: false, canSubmitFinal: false });
    });

    it('allows nothing once the final submission is made', () => {
        expect(performerStage(work({ hasClip: true, ticked: true, hasAnalysis: true, lock: 'locked' })))
            .toEqual({ stage: 'submitted', canFilmAgain: false, canSubmitFinal: false });
    });

    it('after a redo request, needs no new analysis to submit', () => {
        expect(performerStage(work({ hasClip: true, ticked: true, hasAnalysis: false, lock: 'redo_requested' })))
            .toEqual({ stage: 'ready', canFilmAgain: true, canSubmitFinal: true });
    });
});

describe('performerWork', () => {
    const cue = { cueIndex: 1, criterionText: 'Face target', isObserved: true };
    const record = (over: Partial<PairSubmissionRecord> = {}): PairSubmissionRecord => ({
        id: 'sub-l-p1-kick', lessonId: 'l', pairNumber: 1, skillName: 'Kick', pairPhoto: '',
        // appleRole = Apple assessing Banana, so it holds Banana's clip
        appleRole: { studentPerformer: 'Banana', evaluator: 'Apple', videoUrl: 'banana.mp4', cues: [cue] },
        bananaRole: { studentPerformer: 'Apple', evaluator: 'Banana', cues: [] },
        status: 'pending_sync', createdAt: '2026-10-03T00:00:00Z',
        ...over,
    });

    it("reads each performer's own clip and ticks", () => {
        expect(performerWork(record(), 'Banana', 'open')).toMatchObject({ hasClip: true, ticked: true });
        expect(performerWork(record(), 'Apple', 'open')).toMatchObject({ hasClip: false, ticked: false });
    });

    it('sees a re-film and an analysis kept on the device', () => {
        const r = record({
            firstAttempt: { banana: { videoUrl: 'first.mp4', cues: [cue] } },
            pendingAnalysis: { banana: { analysisText: 'x', skillName: 'Kick', studentLabel: 'Banana', modelUsed: 'claude', submittedAt: '' } },
        });
        expect(performerWork(r, 'Banana', 'open')).toMatchObject({ refilmed: true, hasAnalysis: true });
        expect(performerWork(r, 'Apple', 'open')).toMatchObject({ refilmed: false, hasAnalysis: false });
    });

    it('treats a missing record as nothing done', () => {
        expect(performerWork(undefined, 'Apple', 'open')).toEqual({ hasClip: false, ticked: false, refilmed: false, hasAnalysis: false, lock: 'open' });
    });
});
