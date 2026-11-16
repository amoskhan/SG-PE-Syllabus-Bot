import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../offline/offlineStorage', () => ({ getLessonPass: () => 'pass' }));

import { runPeerCoachingAnalysis } from './peerCoachingAI';
import { practiceSessionFrom } from '../../utils/pairWork';
import { focusCriteria, getLessonCues, lessonGradingCues } from '../../data/peerSyllabusCues';
import type { PairSubmissionRecord } from '../offline/offlineStorage';

// ADR 0001: the AI judges from the video alone. A pair's record can hold each
// performer's glow and grow (#156); none of it may be in what the AI is sent.

const SKILL = 'Shoulder Stand';
// The teacher's plan for the assess step: own wording, an extra cue, and Glow and Grow on
const plan = {
    focusCues: [1, 2, 4],
    cueText: { 1: 'Hands under your hips' },
    extraCues: ['Chin tucked to the chest'],
    glowGrow: { glowStarter: 'Brilliant work on', growStarter: 'Have another go at' },
};
const SAID = ['Point your toes to the ceiling', 'Keep your elbows tucked in', 'You gave it a go', 'Brilliant work on', 'Have another go at'];

const tick = (cueIndex: number, isObserved: boolean) => ({ cueIndex, criterionText: `criterion ${cueIndex}`, isObserved });
const record: PairSubmissionRecord = {
    id: 'sub-l-p1-shoulder_stand', lessonId: 'l', pairNumber: 1, skillName: SKILL, pairPhoto: '',
    appleRole: { studentPerformer: 'Banana', evaluator: 'Apple', videoBlob: new Blob(['banana']), cues: [tick(1, true), tick(2, false), tick(4, true)] },
    bananaRole: { studentPerformer: 'Apple', evaluator: 'Banana', videoBlob: new Blob(['apple']), cues: [tick(1, false), tick(2, false), tick(4, false)] },
    glowGrow: {
        banana: { glow: { source: { kind: 'cue', itemNumber: 1 }, text: 'Hands under your hips' }, grow: { source: { kind: 'own' }, text: SAID[0] } },
        apple: { glow: { source: { kind: 'fixed' }, text: SAID[2] }, grow: { source: { kind: 'own' }, text: SAID[1] } },
    },
    firstAttempt: {
        banana: { videoUrl: 'first.mp4', cues: [tick(1, false)], glowGrow: { glow: { source: { kind: 'fixed' }, text: SAID[2] }, grow: { source: { kind: 'own' }, text: SAID[1] } } },
    },
    status: 'pending_sync', createdAt: '2026-10-03T00:00:00Z',
};

// A video that "plays" in the test: every seek lands at once, every frame is the same picture
const fakeVideo = () => {
    const video: any = { videoWidth: 640, videoHeight: 480, duration: 4, setAttribute() {} };
    Object.defineProperty(video, 'onloadedmetadata', { set(fn: () => void) { queueMicrotask(fn); } });
    Object.defineProperty(video, 'currentTime', { set() { queueMicrotask(() => video.onseeked?.()); } });
    return video;
};
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,AAAA' });

describe('what the AI is sent about a pair with a glow and grow', () => {
    let sent: string[];

    beforeEach(() => {
        sent = [];
        vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'video' ? fakeVideo() : fakeCanvas()) });
        vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
            sent.push(init.body);
            return { ok: true, json: async () => ({ text: '{"criteriaScores":[],"proficiency":"Developing","teacherNotes":"Keep going"}' }) };
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('takes only the ticks and who the pair is into the Practice Station', () => {
        const session = practiceSessionFrom({ pairNumber: 1, lessonId: 'l' }, record, SKILL, SKILL, getLessonCues(SKILL, plan));
        expect(session.bananaCues).toEqual({ 'shoulder-stand-1': true, 'shoulder-stand-2': false, 'shoulder-stand-4': true, 'extra-1': false });
        expect(Object.keys(session).sort()).toEqual(
            ['appleCues', 'applePoseFrames', 'assessSkillName', 'bananaCues', 'bananaPoseFrames', 'lessonId', 'pairNumber', 'pairPhoto', 'skillName']);
        for (const text of SAID) expect(JSON.stringify(session)).not.toContain(text);
    });

    it('asks for the automatic AI feedback with no glow or grow in any request', async () => {
        const session = practiceSessionFrom({ pairNumber: 1, lessonId: 'l' }, record, SKILL, SKILL, getLessonCues(SKILL, plan));
        await runPeerCoachingAnalysis(
            SKILL,
            record.appleRole.videoBlob ?? null,
            record.bananaRole.videoBlob ?? null,
            session.bananaCues,
            session.appleCues,
            undefined,
            { lessonId: 'l', pairNumber: 1 },
            focusCriteria(SKILL, plan),
            lessonGradingCues(SKILL, plan)?.map(c => c.text),
        );

        // One request per performer (the AI Peer Check is for the teacher only, #177),
        // each with their frames and the criteria
        expect(sent).toHaveLength(2);
        expect(sent.join('\n')).toContain('Chin tucked to the chest');
        for (const body of sent) {
            for (const text of SAID) expect(body).not.toContain(text);
            expect(body).not.toMatch(/glow|grow/i);
        }
    });

    it('grades on the lesson\'s cues, which carry no starter', () => {
        const inputs = JSON.stringify([focusCriteria(SKILL, plan), lessonGradingCues(SKILL, plan)]);
        expect(inputs).toContain('Chin tucked to the chest');
        for (const text of SAID) expect(inputs).not.toContain(text);
    });
});

describe('the AI Peer Check (#177)', () => {
    let reply: (body: string) => { ok: boolean; text?: string };

    beforeEach(() => {
        vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'video' ? fakeVideo() : fakeCanvas()) });
        vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
            const r = reply(init.body);
            return { ok: r.ok, json: async () => (r.ok ? { text: r.text ?? '' } : { error: 'invalid x-api-key' }) };
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    const check = () => runPeerCoachingAnalysis(SKILL, new Blob(['banana']), new Blob(['apple']), {}, {}, undefined, { lessonId: 'l', pairNumber: 1 });

    it('gives nothing, never an invented level, when the AI is unavailable', async () => {
        reply = () => ({ ok: false });
        await expect(check()).resolves.toBeNull();
        reply = () => ({ ok: true, text: '' });
        await expect(check()).resolves.toBeNull();
    });

    it("gives a level only where the AI named one", async () => {
        reply = (body) => body.includes('Performer: Banana')
            ? { ok: true, text: '{"criteriaScores":[],"proficiency":"Competent","teacherNotes":"Bend the knees more"}' }
            : { ok: true, text: 'Sorry, I could not see the performer clearly.' };
        const result = await check();
        expect(result?.teacherReport.bananaProficiency).toBe('Competent');
        expect(result?.teacherReport.appleProficiency).toBeUndefined();
        expect(result?.teacherReport.teacherRecommendations).toContain('🍌 Banana: Bend the knees more');
        expect(result?.teacherReport.teacherRecommendations).not.toContain('??');
    });

    it('writes no feedback for pupils', async () => {
        reply = () => ({ ok: true, text: '{"criteriaScores":[],"proficiency":"Developing","teacherNotes":"Keep going"}' });
        expect(await check()).not.toHaveProperty('studentFeedback');
    });
});
