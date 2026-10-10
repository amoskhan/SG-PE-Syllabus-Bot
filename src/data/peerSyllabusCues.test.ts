import { describe, it, expect } from 'vitest';
import { DEFAULT_PEER_CUES, OFFICIAL_FMS_PEER_CUES, getAllCuesForSkill, getFocusCues, getSkillCues } from './peerSyllabusCues';
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

describe('getFocusCues', () => {
    it('gives only the cues the teacher picked, in checklist order', () => {
        expect(getFocusCues('Shoulder Stand', [4, 1, 2]).map(c => c.itemNumber)).toEqual([1, 2, 4]);
    });

    it('gives every cue when the teacher picked none', () => {
        expect(getFocusCues('Underhand Roll')).toBe(getAllCuesForSkill('Underhand Roll'));
        expect(getFocusCues('Shoulder Stand', [])).toHaveLength(4);
    });

    it('gives every cue when the pick matches nothing, such as one left from another skill', () => {
        expect(getFocusCues('Shoulder Stand', [9])).toHaveLength(4);
    });
});
