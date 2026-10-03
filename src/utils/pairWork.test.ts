import { describe, it, expect } from 'vitest';
import { noAnalysisChecklistText, performerStage, performerWork, PerformerWork, redoChecklistText } from './pairWork';
import { parseAiCriteria } from './gradingReview';
import type { PairSubmissionRecord } from '../services/offline/offlineStorage';

const work = (w: Partial<PerformerWork> = {}): PerformerWork => ({
    hasClip: false,
    ticked: false,
    refilmed: false,
    hasAnalysis: false,
    lock: 'open',
    redoFilms: 0,
    ...w,
});

describe('performerStage', () => {
    it('has not started before a clip is recorded', () => {
        expect(performerStage(work())).toEqual({ canKeep: false, stage: 'not_started', canFilmAgain: false, canSubmitFinal: false });
    });

    it('needs the assessor to tick before anything else', () => {
        expect(performerStage(work({ hasClip: true }))).toEqual({ canKeep: false, stage: 'needs_ticks', canFilmAgain: true, canSubmitFinal: false });
    });

    it('waits for the AI analysis before the final submission', () => {
        expect(performerStage(work({ hasClip: true, ticked: true }))).toEqual({ canKeep: false, stage: 'needs_analysis', canFilmAgain: true, canSubmitFinal: false });
    });

    it('is ready to submit once clip, ticks and analysis are there', () => {
        expect(performerStage(work({ hasClip: true, ticked: true, hasAnalysis: true })))
            .toEqual({ canKeep: false, stage: 'ready', canFilmAgain: true, canSubmitFinal: true });
    });

    it("lets them submit without an analysis when Coach Bot couldn't do one", () => {
        expect(performerStage(work({ hasClip: true, ticked: true, analysisFailed: true })))
            .toEqual({ stage: 'ready', canKeep: false, canFilmAgain: true, canSubmitFinal: true });
    });

    it('allows only one re-film before the final submission', () => {
        expect(performerStage(work({ hasClip: true, ticked: true, hasAnalysis: true, refilmed: true })))
            .toEqual({ canKeep: false, stage: 'ready', canFilmAgain: false, canSubmitFinal: true });
    });

    it('needs ticks again after a re-film', () => {
        expect(performerStage(work({ hasClip: true, ticked: false, hasAnalysis: true, refilmed: true })))
            .toEqual({ canKeep: false, stage: 'needs_ticks', canFilmAgain: false, canSubmitFinal: false });
    });

    it('allows nothing once the final submission is made', () => {
        expect(performerStage(work({ hasClip: true, ticked: true, hasAnalysis: true, lock: 'locked' })))
            .toEqual({ canKeep: false, stage: 'submitted', canFilmAgain: false, canSubmitFinal: false });
    });

    describe('after a redo request (#93)', () => {
        const redo = (w: Partial<PerformerWork>) => work({ hasClip: true, ticked: true, hasAnalysis: true, refilmed: true, lock: 'redo_requested', ...w });

        it('first asks the pair to Keep or Film again', () => {
            expect(performerStage(redo({}))).toEqual({ stage: 'redo_choice', canKeep: true, canFilmAgain: true, canSubmitFinal: false });
        });

        it('needs the assessor ticks for the new film', () => {
            expect(performerStage(redo({ redoFilms: 1, ticked: false })))
                .toEqual({ stage: 'needs_ticks', canKeep: false, canFilmAgain: true, canSubmitFinal: false });
        });

        it('needs no new analysis to submit, and still allows one re-film', () => {
            expect(performerStage(redo({ redoFilms: 1, hasAnalysis: false })))
                .toEqual({ stage: 'ready', canKeep: false, canFilmAgain: true, canSubmitFinal: true });
        });

        it('allows only one re-film in the re-do', () => {
            expect(performerStage(redo({ redoFilms: 2 })))
                .toEqual({ stage: 'ready', canKeep: false, canFilmAgain: false, canSubmitFinal: true });
        });
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
        expect(performerWork(undefined, 'Apple', 'open')).toEqual({ hasClip: false, ticked: false, refilmed: false, hasAnalysis: false, lock: 'open', redoFilms: 0, analysisFailed: false });
    });

    it('counts re-do films only for the current redo request', () => {
        const r = record({ redoFilms: { banana: { requestedAt: '2026-10-03T02:00:00Z', count: 1 } } });
        expect(performerWork(r, 'Banana', 'redo_requested', '2026-10-03T02:00:00Z').redoFilms).toBe(1);
        expect(performerWork(r, 'Banana', 'redo_requested', '2026-10-03T05:00:00Z').redoFilms).toBe(0);
        expect(performerWork(r, 'Apple', 'redo_requested', '2026-10-03T02:00:00Z').redoFilms).toBe(0);
    });
});

describe('redoChecklistText', () => {
    it("reads as a checklist the teacher decides, cue by cue", () => {
        const text = redoChecklistText(['Face the target', 'Step with the opposite foot']);
        expect(parseAiCriteria(text)).toEqual([
            { name: 'Face the target', result: 'unsure' },
            { name: 'Step with the opposite foot', result: 'unsure' },
        ]);
    });

    it("names no level, so the level is the teacher's", () => {
        expect(redoChecklistText(['Face the target'])).not.toMatch(/beginning|developing|competent|accomplished/i);
        expect(noAnalysisChecklistText(['Face the target'])).not.toMatch(/beginning|developing|competent|accomplished/i);
    });

    it('reads the same way when Coach Bot could not analyse', () => {
        expect(parseAiCriteria(noAnalysisChecklistText(['Face the target']))).toEqual([{ name: 'Face the target', result: 'unsure' }]);
    });
});
