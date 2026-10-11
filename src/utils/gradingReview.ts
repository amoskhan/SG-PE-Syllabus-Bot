import { SkillAnalysis } from '../types';
import { getSkillCues } from '../data/peerSyllabusCues';

// Reading a saved grading, with the teacher's corrections applied on top of
// the AI's verdict. Everything that shows a result uses these helpers, so a
// teacher's review wins everywhere at once.

export const LEVELS = ['Beginning', 'Developing', 'Competent', 'Accomplished'] as const;
export type Level = typeof LEVELS[number];

/**
 * A level as written anywhere (any case) → its name in LEVELS. Gradings saved
 * before the top level was renamed say "Excellent"; they read as Accomplished.
 */
export const normaliseLevel = (level?: string): Level | undefined => {
  const name = level?.trim().toLowerCase() === 'excellent' ? 'accomplished' : level?.trim().toLowerCase();
  return LEVELS.find(l => l.toLowerCase() === name);
};

export const levelIndex = (level?: string) => {
  const name = normaliseLevel(level);
  return name ? LEVELS.indexOf(name) : -1;
};

export type CriterionResult = 'met' | 'missed' | 'unsure';
export interface Criterion {
  name: string;
  result: CriterionResult;
  ai: CriterionResult;      // what the AI said, before any teacher change
  teacherSet: boolean;      // true when the teacher decided this one
}

const toResult = (mark: string): CriterionResult =>
  mark.startsWith('✅') ? 'met' : mark.startsWith('❌') ? 'missed' : 'unsure';

/**
 * Pulls the checklist out of a Phase 2 grading. Claude writes a table
 * `| # | Criterion | Result | Note |` with ✅/❌/⚠️ in the Result column (the
 * criterion is the cell just before the mark). Gemini often writes bullets
 * instead: `* ✅ **Face Target:** Observed…`.
 */
export const parseAiCriteria = (text: string): { name: string; result: CriterionResult }[] => {
  const criteria: { name: string; result: CriterionResult }[] = [];
  const add = (name: string, mark: string) => {
    const clean = name.replace(/\*\*/g, '').trim();
    if (clean && !criteria.some(c => c.name === clean)) criteria.push({ name: clean, result: toResult(mark) });
  };
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      const markAt = cells.findIndex(c => /^(✅|❌|⚠)/.test(c));
      if (markAt >= 1) add(cells[markAt - 1], cells[markAt]);
      continue;
    }
    const bullet = line.match(/^\s*(?:[*\-•]|\d+\.)\s+(✅|❌|⚠️?)\s*\*{0,2}([^:*\n]+?)\*{0,2}\s*:/);
    if (bullet) add(bullet[2], bullet[1]);
  }
  return criteria;
};

/** A skill's own criteria by name: "Face Target", or "Base of Support" for gymnastics. */
export const checklistNames = (skillName: string): string[] =>
  getSkillCues(skillName).map(c => (c.detail ? c.syllabusCriterion.split(':')[0].trim() : c.syllabusCriterion));

const norm = (s: string) =>
  s.toLowerCase().replace(/^[\s\d.#)-]+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Whether a name the AI wrote is this criterion: the same, or the criterion followed by more. */
const sameCriterion = (written: string, criterion: string) => {
  const w = norm(written), c = norm(criterion);
  return !!c && (w === c || w.startsWith(`${c} `));
};

/**
 * The AI's mark for each of the skill's criteria, and nothing else (#149). The
 * AI also marks its frame-by-frame notes and may summarise the criteria twice;
 * those lines are not criteria. A criterion it marked differently in two places,
 * or didn't mark, is ⚠️ for the teacher to decide. When the AI's list doesn't
 * match the skill's (it graded a teacher's own rubric), its list is kept.
 */
export const checklistResults = (text: string, names: string[]): { name: string; result: CriterionResult }[] => {
  const written = parseAiCriteria(text);
  if (!names.length) return written;
  const found = names.map(name => ({ name, marks: written.filter(w => sameCriterion(w.name, name)).map(w => w.result) }));
  if (found.filter(f => f.marks.length).length < Math.ceil(names.length / 2)) return written;
  return found.map(({ name, marks }) => ({
    name,
    result: marks.length && marks.every(m => m === marks[0]) ? marks[0] : 'unsure',
  }));
};

/**
 * An analysis graded on the teacher's cues for a gymnastics lesson (#150)
 * starts with this line, so the review shows those cues and no others.
 */
const LESSON_CUES = 'Lesson cues: ';
export const lessonCuesLine = (names: string[]) => `${LESSON_CUES}${names.join(' · ')}`;
export const lessonCueNames = (text: string): string[] | undefined => {
  const line = text.split('\n').find(l => l.startsWith(LESSON_CUES));
  const names = line?.slice(LESSON_CUES.length).split(' · ').map(n => n.trim()).filter(Boolean);
  return names?.length ? names : undefined;
};

/** The checklist as it stands: the AI's marks, overridden by the teacher's. */
export const effectiveCriteria = (a: SkillAnalysis): Criterion[] =>
  checklistResults(a.analysisText, lessonCueNames(a.analysisText) ?? checklistNames(a.skillName)).map(c => {
    // A review saved before #149 keyed a criterion by the AI's longer wording
    const key = a.teacherCriteria && (c.name in a.teacherCriteria
      ? c.name
      : Object.keys(a.teacherCriteria).find(k => sameCriterion(k, c.name)));
    const t = key ? a.teacherCriteria?.[key] : undefined;
    return { name: c.name, ai: c.result, result: t ?? c.result, teacherSet: !!t };
  });

/** Teacher's level if reviewed, else the AI's. */
export const effectiveLevel = (a: SkillAnalysis): string | undefined => {
  const level = a.teacherLevel ?? a.proficiencyLevel;
  return normaliseLevel(level) ?? level;
};

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
 * met. Accomplished is a quality judgement on top of Competent, so it's kept
 * only when every cue is met and the level was already Accomplished.
 */
export const levelFromCriteria = (results: CriterionResult[], currentLevel?: string): Level => {
  const met = results.filter(r => r === 'met').length;
  if (met === results.length) return levelIndex(currentLevel) === 3 ? 'Accomplished' : 'Competent';
  if (met / results.length < 0.5) return 'Beginning';
  return 'Developing';
};
