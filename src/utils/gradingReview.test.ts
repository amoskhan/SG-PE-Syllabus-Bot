import { describe, it, expect } from 'vitest';
import { parseAiCriteria, normaliseLevel, levelFromCriteria } from './gradingReview';

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
