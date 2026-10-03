import { describe, it, expect } from 'vitest';
import { referenceImageFor, teachCues, teachPages } from './teachPages';
import type { LessonStep } from './lessonFlow';

const teach = (skillName: string, showCues = true, showReferenceImage = true): LessonStep =>
    ({ id: 't', kind: 'teach', skillName, teach: { media: [], showCues, showReferenceImage } });

describe('teachCues', () => {
    it('uses the official peer cues, with their icons, for an FMS skill that has them', () => {
        const cues = teachCues('Overhand Throw');
        expect(cues[0]).toEqual({ icon: '🎯', text: 'Face Target' });
    });

    it('uses the syllabus checklist for an FMS skill without peer cues', () => {
        expect(teachCues('Bounce')[0]).toEqual({ icon: '✅', text: 'Place non-dominant foot forward' });
    });

    it('splits a gymnastics cue into its name and what it means', () => {
        expect(teachCues('Forward Roll')[1]).toMatchObject({ text: 'Tuck and Push', detail: expect.stringMatching(/chin is tucked/) });
    });
});

describe('teachPages', () => {
    it('shows the reference picture, then the cues', () => {
        expect(teachPages(teach('Kick')).map(p => p.kind)).toEqual(['reference', 'cues']);
    });

    it('shows only what the teacher ticked', () => {
        expect(teachPages(teach('Kick', true, false)).map(p => p.kind)).toEqual(['cues']);
        expect(teachPages(teach('Kick', false, true)).map(p => p.kind)).toEqual(['reference']);
    });

    it('skips the picture for a skill the app has none for', () => {
        expect(referenceImageFor('Forward Roll')).toBeUndefined();
        expect(teachPages(teach('Forward Roll')).map(p => p.kind)).toEqual(['cues']);
    });

    it("puts the teacher's own videos and pictures first, in their order", () => {
        const step = teach('Kick');
        step.teach!.media = [
            { type: 'video', path: 't/l/p/demo.mp4', caption: 'Watch my plant foot' },
            { type: 'image', path: 't/l/p/rubric.jpg' },
        ];
        expect(teachPages(step).map(p => p.kind === 'media' ? p.path : p.kind))
            .toEqual(['t/l/p/demo.mp4', 't/l/p/rubric.jpg', 'reference', 'cues']);
        expect(teachPages(step)[0]).toMatchObject({ type: 'video', caption: 'Watch my plant foot' });
    });

    it('has no pages for other kinds of step', () => {
        expect(teachPages({ id: 'p', kind: 'practise', skillName: 'Kick' })).toEqual([]);
    });
});
