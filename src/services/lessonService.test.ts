import { describe, it, expect, vi } from 'vitest';

vi.mock('./db/supabaseClient', () => ({ supabase: {} }));

import { LessonRow, fromRow, toRow } from './lessonService';
import { LessonStep, legacySteps } from '../utils/lessonFlow';

const row = (over: Partial<LessonRow> = {}): LessonRow => ({
    id: '2026-10-03-4b-kick-ab12',
    lesson_date: '2026-10-03',
    class_name: '4B',
    level: 'P4',
    objective: 'Kick with the instep',
    skill_area: 'FMS',
    skill_name: 'Kick',
    pair_count: 15,
    pupil_pass: 'secret',
    created_at: '2026-10-01T00:00:00Z',
    ...over,
});

const steps: LessonStep[] = [
    { id: 'step-1', kind: 'teach', skillName: 'Kick', instruction: 'Watch the video', teach: { media: [{ type: 'video', path: 't/l/kick.mp4' }], showCues: true, showReferenceImage: false } },
    { id: 'step-2', kind: 'practise', skillName: 'Kick', practise: { films: true } },
    { id: 'step-3', kind: 'assess', skillName: 'Kick', assess: { method: 'teacher_alone' } },
];

describe('lessonService row mapping', () => {
    it('reads a lesson planned before steps existed as the legacy flow', () => {
        expect(fromRow(row()).steps).toEqual(legacySteps('Kick'));
        expect(fromRow(row({ steps: null })).steps).toEqual(legacySteps('Kick'));
    });

    it('gives back a lesson with steps exactly as it was saved', () => {
        const lesson = fromRow(row({ steps }));
        const saved = toRow(lesson);
        expect(saved.steps).toEqual(steps);
        expect(fromRow({ ...row(), ...saved }).steps).toEqual(steps);
        expect(fromRow({ ...row(), ...saved })).toEqual(lesson);
    });

    it('stores no steps for a lesson made without them, so it stays legacy', () => {
        const { steps: _none, ...draft } = fromRow(row());
        expect(toRow(draft).steps).toBeNull();
    });

    it('keeps the main skill and the rest of the lesson', () => {
        expect(fromRow(row())).toMatchObject({ skillName: 'Kick', skillArea: 'FMS', className: '4B', level: 'P4', pupilPass: 'secret' });
    });
});
