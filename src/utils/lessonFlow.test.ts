import { describe, it, expect } from 'vitest';
import {
    LessonStep, canUseAiAnalysis, defaultSteps, legacySteps, nextScreen, progressFor,
    runsAiPeerFeedback, stepsOrLegacy, validateLesson, followMainSkill, cuePlanFor, lastCuePlan, glowGrowFor,
    changeStepSkill, copyLastCuePlan, followedAssessStep,
} from './lessonFlow';

const step = (id: string, over: Partial<LessonStep> = {}): LessonStep =>
    ({ id, kind: 'practise', skillName: 'Overhand Throw', practise: { films: false }, ...over });
const peer = (id: string, skillName = 'Overhand Throw'): LessonStep =>
    ({ id, kind: 'assess', skillName, assess: { method: 'peer_assessment' } });
const ai = (id: string, skillName = 'Overhand Throw'): LessonStep =>
    ({ id, kind: 'assess', skillName, assess: { method: 'ai_analysis' } });

describe('validateLesson', () => {
    const lesson = (steps: LessonStep[], over = {}) =>
        ({ mainSkill: 'Overhand Throw', skillArea: 'FMS' as const, steps, ...over });

    it('accepts the default lesson', () => {
        expect(validateLesson(lesson(defaultSteps('Overhand Throw')))).toEqual([]);
    });

    it('refuses an empty lesson', () => {
        expect(validateLesson(lesson([])).map(p => p.code)).toEqual(['no_steps']);
    });

    it('needs a main skill', () => {
        expect(validateLesson(lesson([step('a')], { mainSkill: '' })).map(p => p.code)).toEqual(['no_main_skill']);
    });

    it('refuses AI analysis of a partner skill, and says why', () => {
        const problems = validateLesson(lesson([ai('a', 'Partner Counterbalance')], { mainSkill: 'Partner Counterbalance', skillArea: 'Gymnastics' }));
        expect(problems.map(p => [p.code, p.stepIndex])).toEqual([['ai_not_allowed', 0]]);
        expect(problems[0].message).toMatch(/partner/i);
    });

    it('allows peer assessment of a partner skill', () => {
        expect(validateLesson(lesson([peer('a', 'Partner Counter-tension')], { mainSkill: 'Partner Counter-tension', skillArea: 'Gymnastics' }))).toEqual([]);
    });

    it('allows AI analysis of an FMS skill and of a one-pupil gymnastics skill', () => {
        expect(canUseAiAnalysis('Kick')).toEqual({ ok: true });
        expect(canUseAiAnalysis('Forward Roll')).toEqual({ ok: true });
    });

    it('needs each step to use a skill from the lesson\'s learning area', () => {
        expect(validateLesson(lesson([step('a', { skillName: 'Forward Roll' })])).map(p => p.code)).toEqual(['unknown_skill']);
    });

    it('needs a Teach step to show something', () => {
        const teach = (showCues: boolean, showReferenceImage: boolean): LessonStep =>
            ({ id: 't', kind: 'teach', skillName: 'Kick', teach: { media: [], showCues, showReferenceImage } });
        expect(validateLesson(lesson([teach(false, false)])).map(p => p.code)).toEqual(['teach_empty']);
        expect(validateLesson(lesson([teach(true, false)]))).toEqual([]);
        // Forward Roll has no reference picture, so ticking only that shows nothing
        expect(validateLesson(lesson([{ ...teach(false, true), skillName: 'Forward Roll' }], { mainSkill: 'Forward Roll', skillArea: 'Gymnastics' }))
            .map(p => p.code)).toEqual(['teach_empty']);
    });

    it('needs an assess step to say how it is assessed', () => {
        expect(validateLesson(lesson([{ id: 'a', kind: 'assess', skillName: 'Kick' }])).map(p => p.code)).toEqual(['no_method']);
    });
});

describe('nextScreen', () => {
    const steps = [step('a'), peer('b'), ai('c')];

    it('starts at the first step', () => {
        expect(nextScreen(steps, null)).toMatchObject({ kind: 'step', index: 0, number: 1, total: 3 });
    });

    it('moves on one step at a time', () => {
        expect(nextScreen(steps, { stepId: 'a', index: 0 }, 'next')).toMatchObject({ kind: 'step', step: { id: 'b' }, number: 2 });
    });

    it('goes back a step, and stays on the first', () => {
        expect(nextScreen(steps, { stepId: 'c', index: 2 }, 'back')).toMatchObject({ step: { id: 'b' } });
        expect(nextScreen(steps, { stepId: 'a', index: 0 }, 'back')).toMatchObject({ step: { id: 'a' }, number: 1 });
    });

    it('finishes after the last step', () => {
        expect(nextScreen(steps, { stepId: 'c', index: 2 }, 'next')).toEqual({ kind: 'complete' });
    });

    it('handles repeated step kinds', () => {
        const twice = [step('p1'), peer('a1'), step('p2'), peer('a2')];
        expect(nextScreen(twice, { stepId: 'a1', index: 1 }, 'next')).toMatchObject({ step: { id: 'p2' }, number: 3, total: 4 });
    });

    it('keeps a pair on its step when the teacher adds one before it', () => {
        const edited = [step('new'), ...steps];
        expect(nextScreen(edited, { stepId: 'b', index: 1 })).toMatchObject({ step: { id: 'b' }, number: 3, total: 4 });
    });

    it("falls back to the pair's position when their step was removed", () => {
        expect(nextScreen([step('a'), ai('c')], { stepId: 'b', index: 1 })).toMatchObject({ step: { id: 'c' } });
        expect(nextScreen([step('a')], { stepId: 'gone', index: 5 })).toMatchObject({ step: { id: 'a' } });
    });

    it('round-trips through the stored progress', () => {
        const screen = nextScreen(steps, null, 'next');
        expect(nextScreen(steps, progressFor(screen, steps))).toEqual(screen);
    });
});

describe('defaults', () => {
    it('a new lesson is Practise → AI analysis (which includes the peer assessment), on the main skill', () => {
        expect(defaultSteps('Kick').map(s => [s.kind, s.assess?.method, s.skillName])).toEqual([
            ['practise', undefined, 'Kick'],
            ['assess', 'ai_analysis', 'Kick'],
        ]);
    });

    it('a lesson with no stored steps runs as today: peer assessment, then the Practice Station', () => {
        expect(stepsOrLegacy(null, 'Kick')).toEqual(legacySteps('Kick'));
        expect(stepsOrLegacy([], 'Kick').map(s => s.assess?.method)).toEqual(['peer_assessment', 'ai_analysis']);
    });

    it('keeps stored steps as they are', () => {
        const stored = [peer('x')];
        expect(stepsOrLegacy(stored, 'Kick')).toBe(stored);
    });
});

describe('runsAiPeerFeedback', () => {
    it('runs in a lesson with an AI analysis step', () => {
        expect(runsAiPeerFeedback([peer('a'), ai('b')])).toBe(true);
        expect(runsAiPeerFeedback(legacySteps('Kick'))).toBe(true);
    });

    it('never runs in a lesson without one', () => {
        expect(runsAiPeerFeedback([step('a'), peer('b')])).toBe(false);
    });
});

describe('followMainSkill', () => {
    const fms = ['Kick', 'Overhand Throw', 'Chest Pass'];

    it('moves steps on the old main skill to the new one, and keeps a warm-up on its own skill', () => {
        const steps = [step('a', { skillName: 'Chest Pass' }), peer('b', 'Kick'), ai('c', 'Kick')];
        expect(followMainSkill(steps, 'Kick', 'Overhand Throw', fms).map(s => s.skillName))
            .toEqual(['Chest Pass', 'Overhand Throw', 'Overhand Throw']);
    });

    it('moves a step whose skill is not in the new learning area', () => {
        expect(followMainSkill([peer('a', 'Kick')], 'Overhand Throw', 'Forward Roll', ['Forward Roll', 'Cartwheel'])[0].skillName)
            .toBe('Forward Roll');
    });
});

describe('cuePlanFor', () => {
    const assess = (id: string, skillName: string, focusCues?: number[]): LessonStep =>
        ({ id, kind: 'assess', skillName, assess: { method: 'peer_assessment', focusCues } });

    it('reads the plan from the first assess step for the skill', () => {
        const steps = [assess('a', 'Shoulder Stand', [1, 2, 4]), assess('b', 'Shoulder Stand', [3])];
        expect(cuePlanFor(steps, 'Shoulder Stand')?.focusCues).toEqual([1, 2, 4]);
    });

    it('has no plan for a skill the lesson does not assess', () => {
        expect(cuePlanFor([assess('a', 'Shoulder Stand')], 'Kick')).toBeUndefined();
    });
});

describe('followMainSkill and picked cues', () => {
    it('drops the picked cues when the step moves to a new skill', () => {
        const steps: LessonStep[] = [{ id: 'a', kind: 'assess', skillName: 'Kick', assess: { method: 'ai_analysis', focusCues: [1, 2], cueText: { 1: 'Mine' }, extraCues: ['Extra'] } }];
        expect(followMainSkill(steps, 'Kick', 'Bounce', ['Kick', 'Bounce'])[0])
            .toEqual({ id: 'a', kind: 'assess', skillName: 'Bounce', assess: { method: 'ai_analysis' } });
    });
});

describe('lastCuePlan', () => {
    const lesson = (id: string, lessonDate: string, skillName: string, plan: object) => ({
        id, lessonDate, createdAt: `${lessonDate}T00:00:00Z`,
        steps: [{ id: 's', kind: 'assess', skillName, assess: { method: 'peer_assessment', ...plan } } as LessonStep],
    });

    it("gives the plan from the most recent other lesson on the skill, without the step's method", () => {
        const lessons = [
            lesson('a', '2026-09-01', 'Shoulder Stand', { focusCues: [1, 2] }),
            lesson('b', '2026-10-01', 'Shoulder Stand', { focusCues: [1, 3, 4], cueText: { 4: 'Freeze' }, extraCues: ['Chin tucked'] }),
            lesson('c', '2026-10-05', 'Kick', { focusCues: [1] }),
        ];
        expect(lastCuePlan(lessons, 'Shoulder Stand')).toEqual({ focusCues: [1, 3, 4], cueText: { 4: 'Freeze' }, extraCues: ['Chin tucked'] });
    });

    it('skips the lesson being edited and lessons where nothing was set', () => {
        const lessons = [
            lesson('a', '2026-09-01', 'Shoulder Stand', { focusCues: [1, 2] }),
            lesson('b', '2026-10-01', 'Shoulder Stand', {}),
            lesson('c', '2026-10-05', 'Shoulder Stand', { extraCues: ['  '] }),
        ];
        expect(lastCuePlan(lessons, 'Shoulder Stand')?.focusCues).toEqual([1, 2]);
        expect(lastCuePlan(lessons, 'Shoulder Stand', 'a')).toBeUndefined();
        expect(lastCuePlan(lessons, 'Kick')).toBeUndefined();
    });
});

describe('glowGrowFor', () => {
    const assess = (id: string, skillName: string, glowGrow?: { glowStarter: string; growStarter: string }): LessonStep =>
        ({ id, kind: 'assess', skillName, assess: { method: 'peer_assessment', ...(glowGrow ? { glowGrow } : {}) } });
    const mine = { glowStarter: 'I liked how you', growStarter: '' };

    it('reads the setting from the first assess step for the skill', () => {
        const steps = [assess('a', 'Kick'), assess('b', 'Shoulder Stand', mine), assess('c', 'Shoulder Stand')];
        expect(glowGrowFor(steps, 'Shoulder Stand')).toEqual(mine);
        // A later step on the skill follows the first, even when only the later one has it
        expect(glowGrowFor([assess('a', 'Kick'), assess('b', 'Kick', mine)], 'Kick')).toBeUndefined();
    });

    it('is off in a lesson without the setting', () => {
        expect(glowGrowFor(defaultSteps('Kick'), 'Kick')).toBeUndefined();
        expect(glowGrowFor(legacySteps('Kick'), 'Kick')).toBeUndefined();
        expect(glowGrowFor([assess('a', 'Shoulder Stand', mine)], 'Kick')).toBeUndefined();
    });
});

describe('Glow and Grow carries between steps and lessons', () => {
    const mine = { glowStarter: 'I liked how you', growStarter: 'Even better if you' };
    const planned: LessonStep = {
        id: 'a', kind: 'assess', skillName: 'Kick',
        assess: { method: 'ai_analysis', focusCues: [1, 2], cueText: { 1: 'Mine' }, extraCues: ['Extra'], glowGrow: mine },
    };

    it("keeps the setting and clears the cue plan when a step's skill changes", () => {
        expect(changeStepSkill([planned], 0, 'Bounce'))
            .toEqual([{ id: 'a', kind: 'assess', skillName: 'Bounce', assess: { method: 'ai_analysis', glowGrow: mine } }]);
        // Off stays off, and a step that is not an assess step only changes skill
        expect(changeStepSkill([peer('b', 'Kick')], 0, 'Bounce')[0].assess).toEqual({ method: 'peer_assessment' });
        expect(changeStepSkill([step('c')], 0, 'Bounce')).toEqual([step('c', { skillName: 'Bounce' })]);
    });

    const on = (id: string, skillName: string, glowGrow = mine): LessonStep =>
        ({ id, kind: 'assess', skillName, assess: { method: 'peer_assessment', glowGrow } });
    const other = { glowStarter: 'Great', growStarter: 'Now' };

    it('takes the setting a step was following to a skill no earlier step assesses', () => {
        const moved = changeStepSkill([on('a', 'Kick'), ai('b', 'Kick')], 1, 'Bounce');
        expect(glowGrowFor(moved, 'Bounce')).toEqual(mine);
        expect(glowGrowFor(moved, 'Kick')).toEqual(mine);
        // Following a step with it off: it stays off, whatever the step itself once stored
        expect(glowGrowFor(changeStepSkill([peer('a', 'Kick'), on('b', 'Kick')], 1, 'Bounce'), 'Bounce')).toBeUndefined();
    });

    it("leaves the old skill's setting with its next assess step when the step that set it moves away", () => {
        const moved = changeStepSkill([on('a', 'Kick'), ai('b', 'Kick'), ai('c', 'Kick')], 0, 'Bounce');
        expect(glowGrowFor(moved, 'Kick')).toEqual(mine);
        expect(glowGrowFor(moved, 'Bounce')).toEqual(mine);
        expect(moved[2].assess).toEqual({ method: 'ai_analysis' });
        // Off stays off for the steps left behind
        expect(glowGrowFor(changeStepSkill([peer('a', 'Kick'), on('b', 'Kick')], 0, 'Bounce'), 'Kick')).toBeUndefined();
    });

    it('follows an earlier assess step on the new skill, and stores no setting of its own', () => {
        const moved = changeStepSkill([peer('a', 'Bounce'), on('b', 'Kick'), ai('c', 'Kick')], 1, 'Bounce');
        expect(moved[1].assess).toEqual({ method: 'peer_assessment' });
        expect(glowGrowFor(moved, 'Bounce')).toBeUndefined();
        expect(glowGrowFor(moved, 'Kick')).toEqual(mine);
        // So removing the earlier step later does not switch Glow and Grow on
        expect(glowGrowFor(moved.slice(1), 'Bounce')).toBeUndefined();
        // An earlier step with it on is followed as it is
        expect(glowGrowFor(changeStepSkill([on('a', 'Bounce', other), on('b', 'Kick')], 1, 'Bounce'), 'Bounce')).toEqual(other);
    });

    it('does nothing when the skill is the one the step already has', () => {
        const steps = [planned];
        expect(changeStepSkill(steps, 0, 'Kick')).toBe(steps);
    });

    it('keeps each setting when a new main skill moves several steps', () => {
        const fms = ['Kick', 'Bounce', 'Chest Pass'];
        // A step already on the new main skill comes first: the moved steps follow it
        const behind = followMainSkill([on('a', 'Bounce', other), on('b', 'Kick'), ai('c', 'Kick')], 'Kick', 'Bounce', fms);
        expect(behind.map(s => s.assess?.glowGrow)).toEqual([other, undefined, undefined]);
        // A warm-up assess step that stays on its skill keeps its own setting
        const warmUp = followMainSkill([on('a', 'Chest Pass', other), peer('b', 'Kick'), on('c', 'Kick')], 'Kick', 'Bounce', fms);
        expect(glowGrowFor(warmUp, 'Chest Pass')).toEqual(other);
        expect(glowGrowFor(warmUp, 'Bounce')).toBeUndefined();
        expect(warmUp[2].assess).toEqual({ method: 'peer_assessment' });
    });

    it('keeps the setting on the steps that follow a new main skill', () => {
        const steps = [step('p', { skillName: 'Chest Pass' }), planned, ai('c', 'Kick')];
        const moved = followMainSkill(steps, 'Kick', 'Bounce', ['Kick', 'Bounce', 'Chest Pass']);
        expect(moved[1].assess).toEqual({ method: 'ai_analysis', glowGrow: mine });
        expect(glowGrowFor(moved, 'Bounce')).toEqual(mine);
        expect(cuePlanFor(moved, 'Bounce')?.focusCues).toBeUndefined();
    });

    const lesson = (id: string, lessonDate: string, plan: object) => ({
        id, lessonDate, createdAt: `${lessonDate}T00:00:00Z`,
        steps: [{ id: 's', kind: 'assess', skillName: 'Kick', assess: { method: 'peer_assessment', ...plan } } as LessonStep],
    });

    it("copies the setting with the last lesson's cue plan", () => {
        const lessons = [lesson('a', '2026-09-01', { focusCues: [1] }), lesson('b', '2026-10-01', { focusCues: [1, 3], glowGrow: mine })];
        expect(lastCuePlan(lessons, 'Kick')).toEqual({ focusCues: [1, 3], glowGrow: mine });
    });

    it('counts a last lesson that set only Glow and Grow as something to copy', () => {
        const lessons = [lesson('a', '2026-09-01', { focusCues: [1] }), lesson('b', '2026-10-01', { glowGrow: mine })];
        expect(lastCuePlan(lessons, 'Kick')).toEqual({ glowGrow: mine });
    });

    it("applies only the setting when the last lesson set no cue plan, keeping the step's own cues", () => {
        const copied = lastCuePlan([lesson('b', '2026-10-01', { glowGrow: mine })], 'Kick')!;
        const mineNow: LessonStep = { id: 'x', kind: 'assess', skillName: 'Kick', assess: { method: 'ai_analysis', focusCues: [2, 3], cueText: { 2: 'Eyes on it' }, extraCues: ['Arms out'] } };
        expect(copyLastCuePlan(mineNow, copied).assess)
            .toEqual({ method: 'ai_analysis', focusCues: [2, 3], cueText: { 2: 'Eyes on it' }, extraCues: ['Arms out'], glowGrow: mine });
    });

    it("replaces the step's cue plan when the last lesson set one, and keeps the step's setting when that lesson had none", () => {
        const copied = lastCuePlan([lesson('b', '2026-10-01', { focusCues: [1] })], 'Kick')!;
        expect(copyLastCuePlan(planned, copied).assess).toEqual({ method: 'ai_analysis', focusCues: [1], glowGrow: mine });
        const both = lastCuePlan([lesson('b', '2026-10-01', { extraCues: ['Lean in'], glowGrow: { glowStarter: 'Great', growStarter: 'Now' } })], 'Kick')!;
        expect(copyLastCuePlan(planned, both).assess)
            .toEqual({ method: 'ai_analysis', extraCues: ['Lean in'], glowGrow: { glowStarter: 'Great', growStarter: 'Now' } });
    });

    it('brings no setting from a last lesson without one, so the step keeps its own', () => {
        expect(lastCuePlan([lesson('a', '2026-09-01', { focusCues: [1] })], 'Kick')).not.toHaveProperty('glowGrow');
    });

    it('tells a later assess step on the same skill which step it follows', () => {
        const steps = [step('p'), peer('a', 'Kick'), peer('b', 'Chest Pass'), ai('c', 'Kick')];
        expect(followedAssessStep(steps, 3)).toBe(1);
        // The first assess step for a skill sets its own cues and Glow and Grow
        expect(followedAssessStep(steps, 1)).toBeUndefined();
        expect(followedAssessStep(steps, 2)).toBeUndefined();
        expect(followedAssessStep(steps, 0)).toBeUndefined();
    });
});
