import { SkillAnalysis } from '../types';

// Reading a saved grading, with the teacher's corrections applied on top of
// the AI's verdict. Everything that shows a result uses these helpers, so a
// teacher's review wins everywhere at once.

export const LEVELS = ['Beginning', 'Developing', 'Competent', 'Excellent'] as const;
export type Level = typeof LEVELS[number];

export const levelIndex = (level?: string) =>
  LEVELS.findIndex(l => l.toLowerCase() === level?.toLowerCase());

export type CriterionResult = 'met' | 'missed' | 'unsure';
export interface Criterion {
  name: string;
  result: CriterionResult;
  ai: CriterionResult;      // what the AI said, before any teacher change
  teacherSet: boolean;      // true when the teacher decided this one
}

/**
 * Pulls the checklist out of a Phase 2 grading. The grader writes a table
 * `| # | Criterion | Result | Note |` with ✅/❌/⚠️ in the Result column; the
 * criterion is the cell just before the mark.
 */
export const parseAiCriteria = (text: string): { name: string; result: CriterionResult }[] => {
  const criteria: { name: string; result: CriterionResult }[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    const markAt = cells.findIndex(c => /^(✅|❌|⚠)/.test(c));
    if (markAt < 1) continue;
    const mark = cells[markAt];
    criteria.push({
      name: cells[markAt - 1].replace(/\*\*/g, ''),
      result: mark.startsWith('✅') ? 'met' : mark.startsWith('❌') ? 'missed' : 'unsure',
    });
  }
  return criteria;
};

/** The checklist as it stands: the AI's marks, overridden by the teacher's. */
export const effectiveCriteria = (a: SkillAnalysis): Criterion[] =>
  parseAiCriteria(a.analysisText).map(c => {
    const t = a.teacherCriteria?.[c.name];
    return { name: c.name, ai: c.result, result: t ?? c.result, teacherSet: !!t };
  });

/** Teacher's level if reviewed, else the AI's. */
export const effectiveLevel = (a: SkillAnalysis): string | undefined => a.teacherLevel ?? a.proficiencyLevel;

/** [met, total], or null if the grading has no checklist to count. */
export const effectiveScore = (a: SkillAnalysis): [number, number] | null => {
  const criteria = effectiveCriteria(a);
  if (a.teacherCriteria && criteria.length) {
    return [criteria.filter(c => c.result === 'met').length, criteria.length];
  }
  const m = a.analysisText.match(/(\d+)\s*\/\s*(\d+)\s*criteria/i);
  if (m) return [Number(m[1]), Number(m[2])];
  if (criteria.length) return [criteria.filter(c => c.result === 'met').length, criteria.length];
  return null;
};

/**
 * The FMS rubric the grader uses: all cues → Competent; fewer than half →
 * Beginning; anything in between → Developing. An unresolved ⚠️ counts as not
 * met. Excellent is a quality judgement on top of Competent, so it's kept only
 * when every cue is met and the level was already Excellent.
 */
export const levelFromCriteria = (results: CriterionResult[], currentLevel?: string): Level => {
  const met = results.filter(r => r === 'met').length;
  if (met === results.length) return levelIndex(currentLevel) === 3 ? 'Excellent' : 'Competent';
  if (met / results.length < 0.5) return 'Beginning';
  return 'Developing';
};
