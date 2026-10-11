import { describe, it, expect } from 'vitest';
import { parseAiCriteria, normaliseLevel, levelFromCriteria, checklistNames, checklistResults, effectiveCriteria } from './gradingReview';
import type { SkillAnalysis } from '../types';

describe('parseAiCriteria', () => {
    it('reads a table checklist', () => {
        const text = '| # | Criterion | Result | Note |\n|---|---|---|---|\n| 1 | Face Target | ✅ | |\n| 5 | **Swing dominant hand back** | ❌ | Fr.7 |';
        expect(parseAiCriteria(text)).toEqual([
            { name: 'Face Target', result: 'met' },
            { name: 'Swing dominant hand back', result: 'missed' },
        ]);
    });

    it('reads a bullet checklist (Gemini)', () => {
        const text = [
            '**Checklist Assessment:**',
            '* ✅ **Face Target:** Observed. The body faces screen-right.',
            '* ❌ **Swing dominant hand back at least to waist level:** NOT Observed.',
            '* ⚠️ **Lower body by bending at knees and waist:** Unclear.',
            '* This line has no mark: ignored.',
        ].join('\n');
        expect(parseAiCriteria(text)).toEqual([
            { name: 'Face Target', result: 'met' },
            { name: 'Swing dominant hand back at least to waist level', result: 'missed' },
            { name: 'Lower body by bending at knees and waist', result: 'unsure' },
        ]);
    });
});

describe('normaliseLevel', () => {
    it('reads gradings saved before the rename as Accomplished', () => {
        expect(normaliseLevel('Excellent')).toBe('Accomplished');
        expect(normaliseLevel('excellent')).toBe('Accomplished');
    });

    it('returns the canonical name for any case', () => {
        expect(normaliseLevel('competent')).toBe('Competent');
        expect(normaliseLevel('Accomplished')).toBe('Accomplished');
    });

    it('returns undefined for anything else', () => {
        expect(normaliseLevel('Proficient')).toBeUndefined();
        expect(normaliseLevel(undefined)).toBeUndefined();
    });
});

describe('levelFromCriteria', () => {
    it('keeps Accomplished, including an old Excellent, when every cue is met', () => {
        expect(levelFromCriteria(['met', 'met'], 'Excellent')).toBe('Accomplished');
        expect(levelFromCriteria(['met', 'met'], 'Accomplished')).toBe('Accomplished');
        expect(levelFromCriteria(['met', 'met'], 'Developing')).toBe('Competent');
    });
});

// A Shoulder Stand analysis like the one in #149: the criteria, the AI's
// frame-by-frame notes (also marked), then the criteria again, disagreeing.
const SHOULDER_STAND_REPLY = `
| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Base of Support: Weight on upper back/shoulder blades; elbows on mat | ❌ | Fr.4 |
| 2 | Inverted Position: Hips and legs raised above head | ❌ | Fr.5 |
| 3 | Body Shape: Legs together and stretched upward | ❌ | Fr.5 |
| 4 | Control: Balance held still for 3 seconds | ⚠️ | unclear |

* ✅ **Student seated on mat, legs extended — appropriate starting position:** Fr.1
* ⚠️ **Momentum-driven roll backward initiated:** Fr.3→4
* ❌ **Legs swing upward but arms never establish a support base:** Fr.5

| Criterion | Result |
|---|---|
| Base of Support | ❌ |
| Inverted Position | ✅ |
| Body Shape | ✅ |
| Control | ✅ |
`;

describe('checklistResults', () => {
    it("keeps only the skill's own criteria, with the AI's mark for each", () => {
        const results = checklistResults(SHOULDER_STAND_REPLY, checklistNames('Shoulder Stand'));
        expect(results.map(r => r.name)).toEqual(['Base of Support', 'Inverted Position', 'Body Shape', 'Control']);
        expect(results[0].result).toBe('missed');
    });

    it('leaves a criterion the AI marked two different ways for the teacher to decide', () => {
        const results = checklistResults(SHOULDER_STAND_REPLY, checklistNames('Shoulder Stand'));
        expect(results.slice(1).map(r => r.result)).toEqual(['unsure', 'unsure', 'unsure']);
    });

    it("matches an FMS skill's criteria by name", () => {
        const names = checklistNames('Overhand Throw');
        // The AI marks every criterion but the last, the first one with its number
        const reply = names.slice(0, -1).map((n, i) => `| ${i + 1} | ${i === 0 ? `1. ${n}` : n} | ${i === 1 ? '❌' : '✅'} | |`).join('\n');
        const results = checklistResults(reply, names);
        expect(results.map(r => r.name)).toEqual(names);
        expect(results[0]).toEqual({ name: 'Face Target', result: 'met' });
        expect(results[1].result).toBe('missed');
        expect(results.at(-1)?.result).toBe('unsure');
    });

    it("keeps the AI's own list when it graded something else, such as a teacher's own rubric", () => {
        const reply = '| 1 | Smiles at the end | ✅ | |\n| 2 | Bows to the class | ❌ | |';
        expect(checklistResults(reply, checklistNames('Shoulder Stand')).map(r => r.name)).toEqual(['Smiles at the end', 'Bows to the class']);
    });
});

describe('effectiveCriteria', () => {
    const analysis = (over: Partial<SkillAnalysis> = {}): SkillAnalysis => ({
        id: 'a', studentId: 's', skillName: 'Shoulder Stand', analysisText: SHOULDER_STAND_REPLY,
        summarised: false, createdAt: new Date(), source: 'practice_station', ...over,
    });

    it('lists four criteria for a Shoulder Stand', () => {
        expect(effectiveCriteria(analysis())).toHaveLength(4);
    });

    it("still applies a teacher's review saved under the AI's longer wording", () => {
        const reviewed = analysis({ teacherCriteria: { 'Control: Balance held still for 3 seconds': 'met' } });
        expect(effectiveCriteria(reviewed)[3]).toMatchObject({ name: 'Control', result: 'met', teacherSet: true });
    });
});
