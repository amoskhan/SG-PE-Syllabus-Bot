import { ALL_FMS_SKILLS } from '../data/fundamentalMovementSkillsData';
import { ALL_GYMNASTICS_SKILLS, isPartnerSkill } from '../data/gymnasticsSkillsData';
import { teachPages } from './teachPages';

// The rules of a lesson's steps (GLOSSARY.md: Lesson, Lesson Step; ADR 0002).
// A teacher builds each lesson as an ordered list of Teach, Practise and Assess
// steps; a pair's device walks them in order. No UI or database here: the
// Lesson Planner, the pupil step runner and the Classroom Board all ask this
// module.

export type StepKind = 'teach' | 'practise' | 'assess';
// AI analysis always includes a peer assessment first (GLOSSARY.md). A
// "teacher alone" method was tried and dropped (#90).
export type AssessmentMethod = 'ai_analysis' | 'peer_assessment';
export type LearningArea = 'FMS' | 'Gymnastics';

/** A picture or video the teacher attached to a Teach step (private Storage path). */
export interface TeachMedia {
  type: 'video' | 'image';
  path: string;
  caption?: string;
}

export interface LessonStep {
  id: string;                  // stable within the lesson: a pair's progress points at it
  kind: StepKind;
  skillName: string;
  instruction?: string;        // what pupils are told to do at this step
  teach?: { media: TeachMedia[]; showCues: boolean; showReferenceImage: boolean };
  practise?: { films: boolean };
  assess?: { method: AssessmentMethod };
}

// ── Defaults ────────────────────────────────────────────────────────────────

/**
 * A new lesson starts as Practise → Assess by AI analysis. An AI analysis
 * step includes the peer assessment (film, assessor ticks, swap) before the
 * Practice Station, unless the pair already filmed in an earlier step.
 */
export const defaultSteps = (mainSkill: string): LessonStep[] => [
  { id: 'step-1', kind: 'practise', skillName: mainSkill, practise: { films: false } },
  { id: 'step-2', kind: 'assess', skillName: mainSkill, assess: { method: 'ai_analysis' } },
];

/**
 * A lesson planned before steps existed has none stored. It runs as it always
 * has: peer assessment, then the Practice Station. (No Practise step: that
 * would add a screen these lessons never had.)
 */
export const legacySteps = (mainSkill: string): LessonStep[] => [
  { id: 'legacy-peer', kind: 'assess', skillName: mainSkill, assess: { method: 'peer_assessment' } },
  { id: 'legacy-ai', kind: 'assess', skillName: mainSkill, assess: { method: 'ai_analysis' } },
];

/** A lesson's steps as stored, or the legacy flow when it has none. */
export const stepsOrLegacy = (steps: LessonStep[] | null | undefined, mainSkill: string) =>
  Array.isArray(steps) && steps.length > 0 ? steps : legacySteps(mainSkill);

// ── Validation ──────────────────────────────────────────────────────────────

const KNOWN_SKILLS: Record<LearningArea, readonly string[]> = {
  FMS: ALL_FMS_SKILLS,
  Gymnastics: ALL_GYMNASTICS_SKILLS,
};

/** AI analysis judges one performer from video: single-performer FMS or gymnastics skills only. */
export const canUseAiAnalysis = (skillName: string): { ok: boolean; reason?: string } => {
  if (isPartnerSkill(skillName)) {
    return { ok: false, reason: `${skillName} is done with a partner. The AI can only analyse one pupil at a time.` };
  }
  if (!ALL_FMS_SKILLS.includes(skillName) && !ALL_GYMNASTICS_SKILLS.includes(skillName)) {
    return { ok: false, reason: `The AI can't analyse ${skillName || 'this skill'}.` };
  }
  return { ok: true };
};

export type LessonProblemCode = 'no_steps' | 'no_main_skill' | 'unknown_skill' | 'no_method' | 'ai_not_allowed' | 'teach_empty';

export interface LessonProblem {
  code: LessonProblemCode;
  stepIndex?: number;
  message: string;
}

/** Everything that stops a lesson being run; empty when it's ready. */
export const validateLesson = (lesson: {
  mainSkill: string;
  skillArea: LearningArea;
  steps: LessonStep[];
}): LessonProblem[] => {
  const problems: LessonProblem[] = [];
  if (!lesson.mainSkill) problems.push({ code: 'no_main_skill', message: 'Choose the main skill for this lesson.' });
  if (lesson.steps.length === 0) problems.push({ code: 'no_steps', message: 'Add at least one step, so pupils have something to do.' });

  lesson.steps.forEach((step, i) => {
    const n = i + 1;
    if (!KNOWN_SKILLS[lesson.skillArea].includes(step.skillName)) {
      problems.push({ code: 'unknown_skill', stepIndex: i, message: `Step ${n}: choose a ${lesson.skillArea} skill.` });
    }
    if (step.kind === 'teach' && teachPages(step).length === 0 && !step.teach?.media?.length) {
      problems.push({ code: 'teach_empty', stepIndex: i, message: `Step ${n}: choose something to show pupils, such as the cues.` });
    }
    if (step.kind === 'assess' && !step.assess?.method) {
      problems.push({ code: 'no_method', stepIndex: i, message: `Step ${n}: choose how it is assessed.` });
    }
    if (step.kind === 'assess' && step.assess?.method === 'ai_analysis') {
      const ai = canUseAiAnalysis(step.skillName);
      if (!ai.ok) problems.push({ code: 'ai_not_allowed', stepIndex: i, message: `Step ${n}: ${ai.reason}` });
    }
  });
  return problems;
};

// ── The AI feedback gate ────────────────────────────────────────────────────

/** Automatic AI peer feedback runs only in a lesson that has an AI analysis step. */
export const runsAiPeerFeedback = (steps: LessonStep[]) =>
  steps.some(s => s.kind === 'assess' && s.assess?.method === 'ai_analysis');

// ── Moving through the steps ────────────────────────────────────────────────

/** Where a pair is: the step it's on, and its position as a fallback. */
export interface PairProgress {
  stepId?: string;
  index: number;
}

export type Screen =
  | { kind: 'step'; index: number; step: LessonStep; number: number; total: number }
  | { kind: 'complete' };

/**
 * The step a pair is on. By id, so a step the teacher inserted or moved
 * mid-lesson doesn't shift the pair; by position when their step was removed.
 */
export const currentIndex = (steps: LessonStep[], progress: PairProgress | null | undefined): number => {
  if (steps.length === 0) return 0;
  const byId = progress?.stepId ? steps.findIndex(s => s.id === progress.stepId) : -1;
  if (byId >= 0) return byId;
  return Math.min(Math.max(progress?.index ?? 0, 0), steps.length - 1);
};

/** What the pair's device shows after staying put, moving on, or going back one step. */
export const nextScreen = (
  steps: LessonStep[],
  progress: PairProgress | null | undefined,
  move: 'stay' | 'next' | 'back' = 'stay',
): Screen => {
  if (steps.length === 0) return { kind: 'complete' };
  const at = currentIndex(steps, progress);
  const index = move === 'next' ? at + 1 : move === 'back' ? Math.max(at - 1, 0) : at;
  if (index >= steps.length) return { kind: 'complete' };
  return { kind: 'step', index, step: steps[index], number: index + 1, total: steps.length };
};

/** The progress to store for a screen. */
export const progressFor = (screen: Screen, steps: LessonStep[]): PairProgress =>
  screen.kind === 'step' ? { stepId: screen.step.id, index: screen.index } : { index: steps.length };

/** The first step of this kind (and method), for jumping straight to it. */
export const findLessonStep = (steps: LessonStep[], kind: StepKind, method?: AssessmentMethod) =>
  steps.findIndex(s => s.kind === kind && (!method || s.assess?.method === method));

/** A short name for a step, for "Step 2 of 3 · Peer assessment". */
export const stepLabel = (step: LessonStep): string => {
  if (step.kind === 'teach') return 'Learn';
  if (step.kind === 'practise') return 'Practise';
  switch (step.assess?.method) {
    case 'ai_analysis': return 'Peer assessment + Coach Bot';
    case 'peer_assessment': return 'Peer assessment';
    default: return 'Assess';
  }
};

// ── Editing steps ───────────────────────────────────────────────────────────

/** A fresh id for a step the teacher adds (unique within the lesson). */
export const newStepId = () => `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * The teacher changed the lesson's main skill: steps that were on the old
 * main skill move with it; a step deliberately on another skill (a warm-up)
 * keeps it, unless that skill isn't in the lesson's learning area any more.
 */
export const followMainSkill = (steps: LessonStep[], oldMain: string, newMain: string, areaSkills: readonly string[]) =>
  steps.map(s => (s.skillName === oldMain || !areaSkills.includes(s.skillName) ? { ...s, skillName: newMain } : s));

/** Whether the lesson has a Practice Station: without one it makes no AI calls at all. */
export const hasAiAnalysis = (steps: LessonStep[]) => runsAiPeerFeedback(steps);
