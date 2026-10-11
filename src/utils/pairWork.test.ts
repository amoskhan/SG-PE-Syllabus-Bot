import { describe, it, expect } from 'vitest';
import { firstAttemptsToSend, mapRowToSubmission, noAnalysisChecklistText, performerStage, performerWork, PerformerWork, redoChecklistText, withRefilm } from './pairWork';
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

    it("lets them submit without an analysis when PE AI Buddy couldn't do one", () => {
        expect(performerStage(work({ hasClip: true, ticked: true, analysisFailed: true })))
            .toEqual({ stage: 'ready', canKeep: false, canFilmAgain: true, canSubmitFinal: true });
    });

    it('needs no analysis in a lesson without an AI analysis step', () => {
        expect(performerStage(work({ hasClip: true, ticked: true, aiInLesson: false })))
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

describe('a row from the database', () => {
    const said = {
        glow: { source: { kind: 'cue', itemNumber: 1 }, text: 'Eyes on the ball' },
        grow: { source: { kind: 'own' }, text: 'Swing your leg faster' },
    };
    const fixed = {
        glow: { source: { kind: 'fixed' }, text: 'You gave it a go' },
        grow: { source: { kind: 'cue', itemNumber: 3 }, text: 'Step beside the ball' },
    };
    const row = (over: Record<string, unknown> = {}) => ({ id: 'sub-l-p1-kick', lesson_id: 'l', pair_number: 1, skill_name: 'Kick', ...over });

    it("gives each performer's glow and grow", () => {
        expect(mapRowToSubmission(row({ glow_grow: { apple: said, banana: fixed } })).glowGrow).toEqual({ apple: said, banana: fixed });
        expect(mapRowToSubmission(row({ glow_grow: { banana: fixed } })).glowGrow).toEqual({ banana: fixed });
    });

    it('reads a row without one as none (the option was off, older work, or the database not yet changed)', () => {
        expect(mapRowToSubmission(row()).glowGrow).toBeUndefined();
        expect(mapRowToSubmission(row({ glow_grow: null })).glowGrow).toBeUndefined();
    });

    it('reads a malformed one as none', () => {
        for (const glow_grow of ['Well done', 7, [], {}, { apple: 'Well done' }, { apple: { glow: said.glow } }]) {
            expect(mapRowToSubmission(row({ glow_grow })).glowGrow).toBeUndefined();
        }
    });
});

describe('filming again', () => {
    const tick = (isObserved: boolean) => ({ cueIndex: 1, criterionText: 'Eyes on the ball', isObserved });
    const first = {
        glow: { source: { kind: 'fixed' as const }, text: 'You gave it a go' },
        grow: { source: { kind: 'cue' as const, itemNumber: 1 }, text: 'Eyes on the ball' },
    };
    const second = {
        glow: { source: { kind: 'cue' as const, itemNumber: 1 }, text: 'Eyes on the ball' },
        grow: { source: { kind: 'own' as const }, text: 'Swing your leg faster' },
    };
    const forApple = { glow: first.glow, grow: { source: { kind: 'own' as const }, text: 'Lean back less' } };
    const record = (over: Partial<PairSubmissionRecord> = {}): PairSubmissionRecord => ({
        id: 'sub-l-p1-kick', lessonId: 'l', pairNumber: 1, skillName: 'Kick', pairPhoto: '',
        appleRole: { studentPerformer: 'Banana', evaluator: 'Apple', videoUrl: 'banana-1.mp4', cues: [tick(false)] },
        bananaRole: { studentPerformer: 'Apple', evaluator: 'Banana', videoUrl: 'apple-1.mp4', cues: [tick(true)] },
        glowGrow: { banana: first, apple: forApple },
        status: 'pending_sync', createdAt: '2026-10-03T00:00:00Z',
        ...over,
    });
    const clip = new Blob(['new']);

    it("moves the earlier attempt's glow and grow to the first attempt, and the new ones become current", () => {
        const r = withRefilm(record(), 'Banana', { videoBlob: clip, cues: [tick(true)], glowGrow: second }, { earlierUrl: 'banana-1.mp4' });
        expect(r.firstAttempt?.banana).toEqual({ videoBlob: undefined, videoUrl: 'banana-1.mp4', cues: [tick(false)], glowGrow: first });
        expect(r.appleRole).toMatchObject({ videoBlob: clip, videoUrl: undefined, cues: [tick(true)] });
        expect(r.glowGrow).toEqual({ banana: second, apple: forApple });
        // Apple's work is untouched
        expect(r.bananaRole).toEqual(record().bananaRole);
        expect(r.firstAttempt?.apple).toBeUndefined();
    });

    it('sends the first attempt to the teacher with its glow and grow', () => {
        const r = withRefilm(record(), 'Banana', { videoBlob: clip, cues: [tick(true)], glowGrow: second }, { earlierUrl: 'banana-1.mp4' });
        expect(firstAttemptsToSend(r)).toEqual({ banana: { videoUrl: 'banana-1.mp4', cues: [tick(false)], glowGrow: first } });
    });

    it('looks as it does today in a lesson without Glow and Grow', () => {
        const r = withRefilm(record({ glowGrow: undefined }), 'Apple', { videoBlob: clip, cues: [tick(false)] }, { earlierUrl: 'apple-1.mp4' });
        expect(r.firstAttempt?.apple).toEqual({ videoBlob: undefined, videoUrl: 'apple-1.mp4', cues: [tick(true)] });
        expect(firstAttemptsToSend(r)).toEqual({ apple: { videoUrl: 'apple-1.mp4', cues: [tick(true)] } });
        expect(r.glowGrow).toBeUndefined();
    });

    it("keeps the AI analysis with the clip it was about, without the glow and grow", () => {
        const pending = { analysisText: 'x', skillName: 'Kick', studentLabel: 'Banana' as const, modelUsed: 'claude', submittedAt: '' };
        const r = withRefilm(record({ pendingAnalysis: { banana: pending } }), 'Banana', { videoBlob: clip, cues: [tick(true)], glowGrow: second }, { earlierUrl: 'banana-1.mp4' });
        expect(r.pendingAnalysis?.banana?.analysedClip).toEqual({ videoUrl: 'banana-1.mp4', cues: [tick(false)] });
    });

    describe('after a redo request', () => {
        const redoAt = '2026-10-03T02:00:00Z';

        it("replaces the sent attempt's glow and grow with the new attempt's", () => {
            const r = withRefilm(record(), 'Banana', { videoBlob: clip, cues: [tick(true)], glowGrow: second }, { redoAt });
            expect(r.glowGrow).toEqual({ banana: second, apple: forApple });
            expect(r.redoFilms?.banana).toEqual({ requestedAt: redoAt, count: 1, firstClip: undefined });
            expect(r.firstAttempt).toBeUndefined();
        });

        it("keeps the try before the re-do's one re-film for the teacher", () => {
            const once = withRefilm(record(), 'Banana', { videoBlob: clip, cues: [tick(false)], glowGrow: first }, { redoAt });
            const twice = withRefilm(once, 'Banana', { videoBlob: clip, cues: [tick(true)], glowGrow: second }, { redoAt, earlierUrl: 'banana-redo-1.mp4' });
            expect(twice.redoFilms?.banana).toEqual({ requestedAt: redoAt, count: 2, firstClip: { videoUrl: 'banana-redo-1.mp4', cues: [tick(false)] } });
            expect(twice.glowGrow?.banana).toEqual(second);
        });
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

    it('reads the same way when PE AI Buddy could not analyse', () => {
        expect(parseAiCriteria(noAnalysisChecklistText(['Face the target']))).toEqual([{ name: 'Face the target', result: 'unsure' }]);
    });
});
