import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../offline/offlineStorage', () => ({ getLessonPass: () => 'pass' }));

import { onPupilUsage, reportPupilUsage, setPupilAiRequest, PupilUsageReport } from './aiAccess';

const pupil = (purpose: 'analysis' | 'question' | 'peer_feedback', performer: 'apple' | 'banana' | 'pair' = 'apple') =>
    setPupilAiRequest({ lessonId: 'l', pairNumber: 1, performer, purpose });

describe('reportPupilUsage', () => {
    let reports: PupilUsageReport[];
    beforeEach(() => {
        reports = [];
        onPupilUsage(r => reports.push(r));
        setPupilAiRequest(null);
    });

    it('passes on how many questions are left after a question', () => {
        pupil('question', 'banana');
        reportPupilUsage({ ok: true, questionsLeft: 3 });
        expect(reports.at(-1)).toEqual({ performer: 'banana', questionsLeft: 3 });
    });

    it('treats a refused question as none left', () => {
        pupil('question');
        reportPupilUsage({ ok: false, status: 429 });
        expect(reports.at(-1)).toEqual({ performer: 'apple', questionsLeft: 0 });
    });

    it('marks the analysis as used once done, or when the server refuses another', () => {
        pupil('analysis');
        reportPupilUsage({ ok: true });
        expect(reports.at(-1)).toEqual({ performer: 'apple', analysisUsed: true });
        pupil('analysis', 'banana');
        reportPupilUsage({ ok: false, status: 429 });
        expect(reports.at(-1)).toEqual({ performer: 'banana', analysisUsed: true });
    });

    it('says nothing for teachers, peer feedback, or other failures', () => {
        reportPupilUsage({ ok: true, questionsLeft: 2 });            // no pupil request (teacher)
        pupil('peer_feedback', 'pair');
        reportPupilUsage({ ok: true });
        pupil('analysis');
        reportPupilUsage({ ok: false, status: 502 });               // outage: refunded, not used
        expect(reports).toEqual([]);
    });
});
