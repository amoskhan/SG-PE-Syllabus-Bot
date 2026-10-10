import { describe, it, expect } from 'vitest';
import { DEFAULT_PEER_CUES, OFFICIAL_FMS_PEER_CUES, focusCriteria, getAllCuesForSkill, getLessonCues, getSkillCues } from './peerSyllabusCues';
import { ALL_FMS_SKILLS, getSkillChecklist } from './fundamentalMovementSkillsData';
import { ALL_GYMNASTICS_SKILLS, getGymnasticsChecklist } from './gymnasticsSkillsData';

describe('getAllCuesForSkill', () => {
    it('keeps the hand-written cues of an FMS skill that has them', () => {
        expect(getAllCuesForSkill('Overhand Throw')).toBe(OFFICIAL_FMS_PEER_CUES['Overhand Throw']);
    });

    it('gives Shoulder Stand its four short cues, each tied to its criterion', () => {
        const cues = getAllCuesForSkill('Shoulder Stand');
        expect(cues.map(c => c.kidFriendlyText)).toEqual([
            'Hands hold the lower back, elbows on the mat',
            'Hips and legs up above the head',
            'Legs together and pointing straight up',
            'Hold still for 3 seconds',
        ]);
        expect(cues.map(c => c.itemNumber)).toEqual([1, 2, 3, 4]);
        expect(cues[0].syllabusCriterion).toMatch(/^Base of Support: Body weight is supported/);
    });

    it('turns a gymnastics checklist into cues: the name to tick, the description under it', () => {
        const cues = getAllCuesForSkill('Forward Roll');
        expect(cues).toHaveLength(getGymnasticsChecklist('Forward Roll').length);
        expect(cues[1]).toMatchObject({ itemNumber: 2, kidFriendlyText: 'Tuck and Push', detail: expect.stringMatching(/chin is tucked/) });
        expect(cues[1].syllabusCriterion).toMatch(/^Tuck and Push: /);
    });

    it('uses the MOE checklist for an FMS skill with no hand-written cues', () => {
        const cues = getAllCuesForSkill('Bounce');
        expect(cues).toHaveLength(getSkillChecklist('Bounce').length);
        expect(cues[0]).toMatchObject({ itemNumber: 1, kidFriendlyText: 'Place non-dominant foot forward', syllabusCriterion: 'Place non-dominant foot forward' });
    });

    it('never gives a skill the app knows the generic cues', () => {
        for (const skill of [...ALL_FMS_SKILLS, ...ALL_GYMNASTICS_SKILLS]) {
            const cues = getAllCuesForSkill(skill);
            expect(cues, skill).not.toBe(DEFAULT_PEER_CUES);
            expect(cues.length, skill).toBeGreaterThanOrEqual(3);
            expect(new Set(cues.map(c => c.id)).size, skill).toBe(cues.length);
        }
    });

    it('never gives a gymnastics skill an FMS skill\'s cues', () => {
        const fmsCueSets = Object.values(OFFICIAL_FMS_PEER_CUES);
        for (const skill of ALL_GYMNASTICS_SKILLS) {
            expect(fmsCueSets, skill).not.toContain(getAllCuesForSkill(skill));
        }
    });

    it('falls back to the generic cues only for a skill with no checklist', () => {
        expect(getAllCuesForSkill('Underwater Hockey')).toBe(DEFAULT_PEER_CUES);
    });
});

describe('getSkillCues', () => {
    it('is empty for a skill with no checklist, so nothing generic reaches the AI', () => {
        expect(getSkillCues('Underwater Hockey')).toEqual([]);
    });
});

describe('getLessonCues', () => {
    it('gives only the cues the teacher picked, in checklist order', () => {
        expect(getLessonCues('Shoulder Stand', { focusCues: [4, 1, 2] }).map(c => c.itemNumber)).toEqual([1, 2, 4]);
    });

    it('gives every cue, untouched, when the teacher planned nothing', () => {
        expect(getLessonCues('Underhand Roll')).toBe(getAllCuesForSkill('Underhand Roll'));
        expect(getLessonCues('Shoulder Stand', { focusCues: [] })).toHaveLength(4);
    });

    it('gives every cue when the pick matches nothing, such as one left from another skill', () => {
        expect(getLessonCues('Shoulder Stand', { focusCues: [9] })).toHaveLength(4);
    });

    it("shows the teacher's own wording, still tied to its criterion", () => {
        const cues = getLessonCues('Shoulder Stand', { cueText: { 4: '  Freeze like a statue: 1, 2, 3  ' } });
        expect(cues[3]).toMatchObject({ itemNumber: 4, kidFriendlyText: 'Freeze like a statue: 1, 2, 3' });
        expect(cues[3].syllabusCriterion).toMatch(/^Control: /);
        expect(cues[0].kidFriendlyText).toBe('Hands hold the lower back, elbows on the mat');
    });

    it('ignores wording that is blank', () => {
        expect(getLessonCues('Shoulder Stand', { cueText: { 1: '   ' } })).toBe(getAllCuesForSkill('Shoulder Stand'));
    });

    it("adds the teacher's extra cues after the picked ones, numbered clear of the checklist", () => {
        const cues = getLessonCues('Shoulder Stand', { focusCues: [1, 3, 4], extraCues: ['Chin tucked to the chest', '  '] });
        expect(cues.map(c => c.itemNumber)).toEqual([1, 3, 4, 101]);
        expect(cues[3]).toMatchObject({ id: 'extra-1', extra: true, kidFriendlyText: 'Chin tucked to the chest', detail: '' });
    });

    it('never gives the AI an extra cue', () => {
        expect(getSkillCues('Shoulder Stand').some(c => c.extra)).toBe(false);
    });
});

describe('focusCriteria', () => {
    it('names the criteria the lesson focuses on', () => {
        expect(focusCriteria('Shoulder Stand', { focusCues: [1, 3, 4] })).toEqual(['Base of Support', 'Body Shape', 'Control']);
        expect(focusCriteria('Overhand Throw', { focusCues: [1] })).toEqual(['Face Target']);
    });

    it('is empty when pupils tick every cue', () => {
        expect(focusCriteria('Shoulder Stand')).toEqual([]);
        expect(focusCriteria('Shoulder Stand', { focusCues: [1, 2, 3, 4] })).toEqual([]);
        expect(focusCriteria('Shoulder Stand', { extraCues: ['Chin tucked'] })).toEqual([]);
    });
});
