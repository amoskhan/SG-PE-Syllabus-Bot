import { SKILL_REFERENCE_IMAGES, getSkillChecklist } from '../data/fundamentalMovementSkillsData';
import { GYMNASTICS_REFERENCE_IMAGES, getGymnasticsChecklist } from '../data/gymnasticsSkillsData';
import { OFFICIAL_FMS_PEER_CUES } from '../data/peerSyllabusCues';
import type { LessonStep } from './lessonFlow';

// What a Teach step shows pupils (#88), as pages they swipe through: the
// skill's reference picture and its cues. The teacher's own pictures and
// videos join as more pages (#89).

export interface TeachCue {
  icon: string;
  text: string;     // short, what to do
  detail?: string;  // more for gymnastics, where each cue has a name and a description
}

export type TeachPage =
  | { kind: 'reference'; src: string; skillName: string }
  | { kind: 'cues'; skillName: string; cues: TeachCue[] };

/** The app's own picture of the skill, if it has one. */
export const referenceImageFor = (skillName: string): string | undefined =>
  SKILL_REFERENCE_IMAGES[skillName] ?? GYMNASTICS_REFERENCE_IMAGES[skillName];

const stripNumber = (line: string) => line.replace(/^\d+\.\s*/, '').trim();

/**
 * The skill's cues, worded for pupils. FMS skills with official peer cues use
 * those (with their icons); other FMS skills use the syllabus checklist;
 * gymnastics cues are "Name: description" and are split into the two.
 */
export const teachCues = (skillName: string): TeachCue[] => {
  const official = OFFICIAL_FMS_PEER_CUES[skillName];
  if (official?.length) return official.map(c => ({ icon: c.icon, text: c.syllabusCriterion }));

  const fms = getSkillChecklist(skillName);
  if (fms.length) return fms.map(line => ({ icon: '✅', text: stripNumber(line) }));

  return getGymnasticsChecklist(skillName).map(line => {
    const body = stripNumber(line);
    const at = body.indexOf(':');
    return at > 0 && at < 40
      ? { icon: '✅', text: body.slice(0, at).trim(), detail: body.slice(at + 1).trim() }
      : { icon: '✅', text: body };
  });
};

/** The pages of a Teach step, in order. Empty for any other step. */
export const teachPages = (step: LessonStep): TeachPage[] => {
  if (step.kind !== 'teach' || !step.teach) return [];
  const pages: TeachPage[] = [];
  const src = step.teach.showReferenceImage ? referenceImageFor(step.skillName) : undefined;
  if (src) pages.push({ kind: 'reference', src, skillName: step.skillName });
  const cues = step.teach.showCues ? teachCues(step.skillName) : [];
  if (cues.length) pages.push({ kind: 'cues', skillName: step.skillName, cues });
  return pages;
};
