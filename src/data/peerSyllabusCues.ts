/**
 * Official MOE PE Syllabus FMS Peer-Coaching Cues.
 * Directly grounded in the 2024 MOE PE Fundamental Movement Skills checklist.
 */

import { getSkillChecklist } from './fundamentalMovementSkillsData';
import { getGymnasticsChecklist } from './gymnasticsSkillsData';

export interface PeerSyllabusCue {
  id: string;
  itemNumber: number;
  icon: string;
  syllabusCriterion: string; // Exact MOE Syllabus criteria line
  kidFriendlyText: string;   // Clear actionable cue for primary students
  keyPhase: 'setup' | 'execution' | 'followThrough';
  // Shown under the cue in place of the "MOE Standard" line. Set for gymnastics,
  // whose criteria are the app's own and not yet checked against the syllabus.
  detail?: string;
  extra?: boolean;           // The teacher's own addition: tied to no criterion (#136)
}

export const OFFICIAL_FMS_PEER_CUES: Record<string, PeerSyllabusCue[]> = {
  'Overhand Throw': [
    {
      id: 'ot-1',
      itemNumber: 1,
      icon: '🎯',
      syllabusCriterion: 'Face Target',
      kidFriendlyText: 'Did partner start facing the target?',
      keyPhase: 'setup',
    },
    {
      id: 'ot-2',
      itemNumber: 2,
      icon: '👣',
      syllabusCriterion: 'Place feet shoulder width apart',
      kidFriendlyText: 'Were feet shoulder-width apart?',
      keyPhase: 'setup',
    },
    {
      id: 'ot-3',
      itemNumber: 3,
      icon: '🦵',
      syllabusCriterion: 'Keep knees slightly bent',
      kidFriendlyText: 'Were knees slightly bent for balance?',
      keyPhase: 'setup',
    },
    {
      id: 'ot-4',
      itemNumber: 4,
      icon: '⚾',
      syllabusCriterion: 'Hold ball with dominant hand in front of body',
      kidFriendlyText: 'Was the ball held ready in front of the body?',
      keyPhase: 'setup',
    },
    {
      id: 'ot-5',
      itemNumber: 5,
      icon: '📐',
      syllabusCriterion: 'Turn body as the feet pivots in place until non-dominant side faces the target',
      kidFriendlyText: 'Did partner turn sideways with side to target?',
      keyPhase: 'setup',
    },
    {
      id: 'ot-6',
      itemNumber: 6,
      icon: '💪',
      syllabusCriterion: 'Move dominant arm in downward circular motion until elbow is at shoulder height or higher',
      kidFriendlyText: 'Did throwing elbow come up to shoulder height or higher?',
      keyPhase: 'setup',
    },
    {
      id: 'ot-7',
      itemNumber: 7,
      icon: '👉',
      syllabusCriterion: 'Raise non-dominant arm and points toward target',
      kidFriendlyText: 'Did the non-throwing arm point toward the target?',
      keyPhase: 'setup',
    },
    {
      id: 'ot-8',
      itemNumber: 8,
      icon: '👣',
      syllabusCriterion: 'Step with non-dominant foot toward target',
      kidFriendlyText: 'Did partner step forward with the opposite foot?',
      keyPhase: 'execution',
    },
    {
      id: 'ot-9',
      itemNumber: 9,
      icon: '🔄',
      syllabusCriterion: 'Rotate hips and shoulders until front of body faces target',
      kidFriendlyText: 'Did hips and chest turn to face the target on throw?',
      keyPhase: 'execution',
    },
    {
      id: 'ot-10',
      itemNumber: 10,
      icon: '🚀',
      syllabusCriterion: 'Move dominant arm forward and past the head',
      kidFriendlyText: 'Did throwing arm come forward past the head?',
      keyPhase: 'execution',
    },
    {
      id: 'ot-11',
      itemNumber: 11,
      icon: '↘️',
      syllabusCriterion: 'After release, throwing arm continues down diagonally across body',
      kidFriendlyText: 'Did throwing arm follow through down across the body?',
      keyPhase: 'followThrough',
    },
  ],

  'Kick': [
    {
      id: 'k-1',
      itemNumber: 1,
      icon: '📍',
      syllabusCriterion: 'Stand behind the ball',
      kidFriendlyText: 'Did partner start directly behind the ball?',
      keyPhase: 'setup',
    },
    {
      id: 'k-2',
      itemNumber: 2,
      icon: '👀',
      syllabusCriterion: 'Keep eyes on the ball',
      kidFriendlyText: 'Did partner keep their eyes locked on the ball?',
      keyPhase: 'setup',
    },
    {
      id: 'k-3',
      itemNumber: 3,
      icon: '🏃',
      syllabusCriterion: 'Step and leap with dominant foot toward the ball',
      kidFriendlyText: 'Did partner take an energetic step/approach toward the ball?',
      keyPhase: 'execution',
    },
    {
      id: 'k-4',
      itemNumber: 4,
      icon: '🦶',
      syllabusCriterion: 'Place non-dominant foot beside the ball',
      kidFriendlyText: 'Did planting foot land right beside the ball?',
      keyPhase: 'execution',
    },
    {
      id: 'k-5',
      itemNumber: 5,
      icon: '🦵',
      syllabusCriterion: 'Swing dominant leg and non-dominant arm forward',
      kidFriendlyText: 'Did kicking leg and opposite arm swing smoothly?',
      keyPhase: 'execution',
    },
    {
      id: 'k-6',
      itemNumber: 6,
      icon: '👟',
      syllabusCriterion: 'Contact ball with instep (shoelaces)',
      kidFriendlyText: 'Did partner kick with the shoelaces (instep)?',
      keyPhase: 'execution',
    },
    {
      id: 'k-7',
      itemNumber: 7,
      icon: '↗️',
      syllabusCriterion: 'After contact, dominant leg continues in the direction of the kick',
      kidFriendlyText: 'Did the kicking leg follow through forward?',
      keyPhase: 'followThrough',
    },
  ],

  'Underhand Throw': [
    {
      id: 'ut-1',
      itemNumber: 1,
      icon: '🎯',
      syllabusCriterion: 'Face Target',
      kidFriendlyText: 'Did partner start facing the target?',
      keyPhase: 'setup',
    },
    {
      id: 'ut-2',
      itemNumber: 2,
      icon: '👣',
      syllabusCriterion: 'Place feet shoulder width apart',
      kidFriendlyText: 'Were feet shoulder-width apart?',
      keyPhase: 'setup',
    },
    {
      id: 'ut-3',
      itemNumber: 3,
      icon: '🦵',
      syllabusCriterion: 'Keep knees slightly bent',
      kidFriendlyText: 'Were knees slightly bent for balance?',
      keyPhase: 'setup',
    },
    {
      id: 'ut-4',
      itemNumber: 4,
      icon: '⚾',
      syllabusCriterion: 'Hold ball with dominant hand in front of body',
      kidFriendlyText: 'Was ball held in dominant hand in front of body?',
      keyPhase: 'setup',
    },
    {
      id: 'ut-5',
      itemNumber: 5,
      icon: '🔄',
      syllabusCriterion: 'Swing dominant hand back at least to waist level',
      kidFriendlyText: 'Did throwing hand swing back to waist level?',
      keyPhase: 'setup',
    },
    {
      id: 'ut-6',
      itemNumber: 6,
      icon: '👣',
      syllabusCriterion: 'Step with non-dominant foot toward target',
      kidFriendlyText: 'Did partner step with the opposite foot toward target?',
      keyPhase: 'execution',
    },
    {
      id: 'ut-7',
      itemNumber: 7,
      icon: '🎯',
      syllabusCriterion: 'Swing dominant hand forward and release ball between the knee and waist level',
      kidFriendlyText: 'Did partner release ball between knee and waist height?',
      keyPhase: 'execution',
    },
    {
      id: 'ut-8',
      itemNumber: 8,
      icon: '↗️',
      syllabusCriterion: 'After release, dominant hand continues toward target and above the waist',
      kidFriendlyText: 'Did hand follow through toward target above the waist?',
      keyPhase: 'followThrough',
    },
  ],

  'Underhand Roll': [
    {
      id: 'ur-1',
      itemNumber: 1,
      icon: '🎯',
      syllabusCriterion: 'Face Target',
      kidFriendlyText: 'Did partner face the target?',
      keyPhase: 'setup',
    },
    {
      id: 'ur-2',
      itemNumber: 2,
      icon: '👣',
      syllabusCriterion: 'Place feet shoulder width apart',
      kidFriendlyText: 'Were feet shoulder-width apart?',
      keyPhase: 'setup',
    },
    {
      id: 'ur-3',
      itemNumber: 3,
      icon: '🦵',
      syllabusCriterion: 'Keep knees slightly bent',
      kidFriendlyText: 'Were knees slightly bent?',
      keyPhase: 'setup',
    },
    {
      id: 'ur-4',
      itemNumber: 4,
      icon: '⚾',
      syllabusCriterion: 'Hold ball with dominant hand in front of body',
      kidFriendlyText: 'Was ball held in dominant hand in front of body?',
      keyPhase: 'setup',
    },
    {
      id: 'ur-5',
      itemNumber: 5,
      icon: '🔄',
      syllabusCriterion: 'Swing dominant hand back at least to waist level',
      kidFriendlyText: 'Did hand swing back to waist level?',
      keyPhase: 'setup',
    },
    {
      id: 'ur-6',
      itemNumber: 6,
      icon: '👣',
      syllabusCriterion: 'Step with non-dominant foot toward target',
      kidFriendlyText: 'Did partner step with the opposite foot?',
      keyPhase: 'execution',
    },
    {
      id: 'ur-7',
      itemNumber: 7,
      icon: '🦵',
      syllabusCriterion: 'Lower body by bending at knees and waist',
      kidFriendlyText: 'Did partner lower body smoothly by bending knees?',
      keyPhase: 'execution',
    },
    {
      id: 'ur-8',
      itemNumber: 8,
      icon: '🎳',
      syllabusCriterion: 'Swing dominant hand forward and release ball on the ground',
      kidFriendlyText: 'Did ball release smoothly along the ground?',
      keyPhase: 'execution',
    },
    {
      id: 'ur-9',
      itemNumber: 9,
      icon: '↗️',
      syllabusCriterion: 'After release, dominant hand continues toward target and above the waist',
      kidFriendlyText: 'Did hand follow through smoothly toward target?',
      keyPhase: 'followThrough',
    },
  ],

  'Chest Pass': [
    {
      id: 'cp-1',
      itemNumber: 1,
      icon: '🎯',
      syllabusCriterion: 'Face Target',
      kidFriendlyText: 'Did partner face the target?',
      keyPhase: 'setup',
    },
    {
      id: 'cp-2',
      itemNumber: 2,
      icon: '👣',
      syllabusCriterion: 'Place feet shoulder width apart',
      kidFriendlyText: 'Were feet shoulder-width apart?',
      keyPhase: 'setup',
    },
    {
      id: 'cp-3',
      itemNumber: 3,
      icon: '🦵',
      syllabusCriterion: 'Keep knees slightly bent',
      kidFriendlyText: 'Were knees slightly bent for balance?',
      keyPhase: 'setup',
    },
    {
      id: 'cp-4',
      itemNumber: 4,
      icon: '🏀',
      syllabusCriterion: 'Keep hands in front of body',
      kidFriendlyText: 'Were hands held ready in front of chest?',
      keyPhase: 'setup',
    },
    {
      id: 'cp-5',
      itemNumber: 5,
      icon: '👐',
      syllabusCriterion: 'Ball held with thumbs together on back of ball and fingers on sides',
      kidFriendlyText: 'Were thumbs pointing together behind the ball?',
      keyPhase: 'setup',
    },
    {
      id: 'cp-6',
      itemNumber: 6,
      icon: '👣',
      syllabusCriterion: 'Step forward with one foot',
      kidFriendlyText: 'Did partner step forward with one foot on pass?',
      keyPhase: 'execution',
    },
    {
      id: 'cp-7',
      itemNumber: 7,
      icon: '🚀',
      syllabusCriterion: 'Extend arms and release ball toward target',
      kidFriendlyText: 'Did arms extend cleanly toward target?',
      keyPhase: 'execution',
    },
    {
      id: 'cp-8',
      itemNumber: 8,
      icon: '🔄',
      syllabusCriterion: 'After release, hands are turned, palms face away from each other and thumbs point downwards',
      kidFriendlyText: 'Did palms finish facing out with thumbs pointing down?',
      keyPhase: 'followThrough',
    },
    {
      id: 'cp-9',
      itemNumber: 9,
      icon: '👉',
      syllabusCriterion: 'Extend arms for follow through',
      kidFriendlyText: 'Were arms fully extended on follow-through?',
      keyPhase: 'followThrough',
    },
  ],

  'Catch above waist': [
    {
      id: 'caw-1',
      itemNumber: 1,
      icon: '🎯',
      syllabusCriterion: 'Face Target',
      kidFriendlyText: 'Did partner face the incoming ball?',
      keyPhase: 'setup',
    },
    {
      id: 'caw-2',
      itemNumber: 2,
      icon: '👣',
      syllabusCriterion: 'Place feet shoulder width apart',
      kidFriendlyText: 'Were feet shoulder-width apart in ready stance?',
      keyPhase: 'setup',
    },
    {
      id: 'caw-3',
      itemNumber: 3,
      icon: '🦵',
      syllabusCriterion: 'Keep knees slightly bent',
      kidFriendlyText: 'Were knees slightly bent for balance?',
      keyPhase: 'setup',
    },
    {
      id: 'caw-4',
      itemNumber: 4,
      icon: '🤲',
      syllabusCriterion: 'Keep hands in front of the body',
      kidFriendlyText: 'Were hands held ready in front of chest?',
      keyPhase: 'setup',
    },
    {
      id: 'caw-5',
      itemNumber: 5,
      icon: '👀',
      syllabusCriterion: 'Keep eyes on object',
      kidFriendlyText: 'Did partner track the ball with their eyes all the way in?',
      keyPhase: 'execution',
    },
    {
      id: 'caw-6',
      itemNumber: 6,
      icon: '👣',
      syllabusCriterion: 'Step towards the object',
      kidFriendlyText: 'Did partner step toward the flight of the ball?',
      keyPhase: 'execution',
    },
    {
      id: 'caw-7',
      itemNumber: 7,
      icon: '🦋',
      syllabusCriterion: 'Thumbs pointing together (butterfly window)',
      kidFriendlyText: 'Were thumbs pointing together to form a butterfly window?',
      keyPhase: 'execution',
    },
    {
      id: 'caw-8',
      itemNumber: 8,
      icon: '🧲',
      syllabusCriterion: 'Catch with hands only, pull object towards body to absorb force',
      kidFriendlyText: 'Did hands catch softly and pull in to absorb the force?',
      keyPhase: 'followThrough',
    },
  ],

  'Dribble with hands': [
    {
      id: 'dh-1',
      itemNumber: 1,
      icon: '🦵',
      syllabusCriterion: 'Keep knees slightly bent',
      kidFriendlyText: 'Were knees kept slightly bent in a balanced stance?',
      keyPhase: 'setup',
    },
    {
      id: 'dh-2',
      itemNumber: 2,
      icon: '👣',
      syllabusCriterion: 'The foot opposite the dribbling hand is forward',
      kidFriendlyText: 'Was the foot opposite the dribbling hand placed forward?',
      keyPhase: 'setup',
    },
    {
      id: 'dh-3',
      itemNumber: 3,
      icon: '🏀',
      syllabusCriterion: 'Hold ball with both hands in front of body',
      kidFriendlyText: 'Did partner start with two hands holding the ball?',
      keyPhase: 'setup',
    },
    {
      id: 'dh-4',
      itemNumber: 4,
      icon: '🖐️',
      syllabusCriterion: 'One hand contacts the ball at waist level or below and pushes downward on top of the ball',
      kidFriendlyText: 'Did hand push downward from waist level or below?',
      keyPhase: 'execution',
    },
    {
      id: 'dh-5',
      itemNumber: 5,
      icon: '⚡',
      syllabusCriterion: 'The wrist flexes and elbow extends in direction of travel as ball is pushed',
      kidFriendlyText: 'Did wrist flex and elbow extend smoothly?',
      keyPhase: 'execution',
    },
    {
      id: 'dh-6',
      itemNumber: 6,
      icon: '✋',
      syllabusCriterion: 'Use the pads of all four fingers and the thumb for contact',
      kidFriendlyText: 'Did partner use finger pads instead of slapping the ball?',
      keyPhase: 'execution',
    },
    {
      id: 'dh-7',
      itemNumber: 7,
      icon: '👀',
      syllabusCriterion: 'As ball is contacted, eyes are focused looking over, not down at the ball',
      kidFriendlyText: 'Were eyes looking up and forward rather than down at feet?',
      keyPhase: 'execution',
    },
    {
      id: 'dh-8',
      itemNumber: 8,
      icon: '🏃',
      syllabusCriterion: 'When moving, contact is slightly behind the ball and to side/away from feet',
      kidFriendlyText: 'Did the ball stay safely to the side and ahead when moving?',
      keyPhase: 'followThrough',
    },
  ],

  'Dribble with feet': [
    {
      id: 'df-1',
      itemNumber: 1,
      icon: '⚽',
      syllabusCriterion: 'Ball is on the ground directly below the head',
      kidFriendlyText: 'Was the ball kept close under the body/head?',
      keyPhase: 'setup',
    },
    {
      id: 'df-2',
      itemNumber: 2,
      icon: '👣',
      syllabusCriterion: 'Feet are shoulder-width apart',
      kidFriendlyText: 'Were feet shoulder-width apart?',
      keyPhase: 'setup',
    },
    {
      id: 'df-3',
      itemNumber: 3,
      icon: '🦵',
      syllabusCriterion: 'Keep knees slightly bent',
      kidFriendlyText: 'Were knees slightly bent for balance?',
      keyPhase: 'setup',
    },
    {
      id: 'df-4',
      itemNumber: 4,
      icon: '👟',
      syllabusCriterion: 'Perform a short series of taps with the inside of the foot',
      kidFriendlyText: 'Did partner use gentle taps with the inside of the foot?',
      keyPhase: 'execution',
    },
    {
      id: 'df-5',
      itemNumber: 5,
      icon: '📍',
      syllabusCriterion: 'The ball should be on the ground directly below the head as it is contacted',
      kidFriendlyText: 'Was ball contacted directly under personal space?',
      keyPhase: 'execution',
    },
    {
      id: 'df-6',
      itemNumber: 6,
      icon: '👀',
      syllabusCriterion: 'Eyes looking forward',
      kidFriendlyText: 'Were eyes looking up while dribbling?',
      keyPhase: 'execution',
    },
    {
      id: 'df-7',
      itemNumber: 7,
      icon: '🛡️',
      syllabusCriterion: 'Keep the ball within personal space while dribbling',
      kidFriendlyText: 'Did the ball stay within personal control?',
      keyPhase: 'execution',
    },
    {
      id: 'df-8',
      itemNumber: 8,
      icon: '⚡',
      syllabusCriterion: 'This movement should be performed at a speed faster than a walk',
      kidFriendlyText: 'Was movement performed smoothly faster than a walk?',
      keyPhase: 'followThrough',
    },
  ],
};

export const DEFAULT_PEER_CUES: PeerSyllabusCue[] = [
  {
    id: 'gen-1',
    itemNumber: 1,
    icon: '🧘',
    syllabusCriterion: 'Maintain balanced ready position with knees slightly bent',
    kidFriendlyText: 'Did partner start in a balanced ready position?',
    keyPhase: 'setup',
  },
  {
    id: 'gen-2',
    itemNumber: 2,
    icon: '👣',
    syllabusCriterion: 'Step toward target with proper footwork and body coordination',
    kidFriendlyText: 'Did partner step toward the target with good balance?',
    keyPhase: 'execution',
  },
  {
    id: 'gen-3',
    itemNumber: 3,
    icon: '🎯',
    syllabusCriterion: 'Follow through smoothly in direction of movement',
    kidFriendlyText: 'Did partner complete a smooth follow-through?',
    keyPhase: 'followThrough',
  },
];

/**
 * Hand-written cues for gymnastics skills, short enough for a young assessor.
 * Kept apart from the FMS cues so the Learn page still shows the full criteria.
 */
const GYMNASTICS_PEER_CUE_TEXT: Record<string, { icon: string; text: string }[]> = {
  'Shoulder Stand': [
    { icon: '🤲', text: 'Hands hold the lower back, elbows on the mat' },
    { icon: '⬆️', text: 'Hips and legs up above the head' },
    { icon: '📏', text: 'Legs together and pointing straight up' },
    { icon: '⏱️', text: 'Hold still for 3 seconds' },
  ],
};

const stripNumber = (line: string) => line.replace(/^\d+\.\s*/, '').trim();
const slug = (skillName: string) => skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const phaseOf = (i: number, count: number): PeerSyllabusCue['keyPhase'] =>
  i === 0 ? 'setup' : i === count - 1 ? 'followThrough' : 'execution';

/** A skill's own checklist as cues, for a skill with no hand-written FMS cues. */
const cuesFromChecklist = (skillName: string): PeerSyllabusCue[] => {
  const fms = getSkillChecklist(skillName).map(stripNumber);
  if (fms.length) {
    // MOE's own wording, so the cue is the criterion itself
    return fms.map((criterion, i) => ({
      id: `${slug(skillName)}-${i + 1}`,
      itemNumber: i + 1,
      icon: '✅',
      syllabusCriterion: criterion,
      kidFriendlyText: criterion,
      keyPhase: phaseOf(i, fms.length),
      detail: '',
    }));
  }

  // Gymnastics criteria are "Name: description". Pupils tick every one.
  const gym = getGymnasticsChecklist(skillName).map(stripNumber);
  const short = GYMNASTICS_PEER_CUE_TEXT[skillName];
  return gym.map((criterion, i) => {
    const at = criterion.indexOf(':');
    const named = at > 0 && at < 40;
    return {
      id: `${slug(skillName)}-${i + 1}`,
      itemNumber: i + 1,
      icon: short?.[i]?.icon ?? '✅',
      syllabusCriterion: criterion,
      kidFriendlyText: short?.[i]?.text ?? (named ? criterion.slice(0, at).trim() : criterion),
      keyPhase: phaseOf(i, gym.length),
      detail: short?.[i] || !named ? criterion : criterion.slice(at + 1).trim(),
    };
  });
};

const checklistCueCache = new Map<string, PeerSyllabusCue[]>();

/**
 * The cues for a skill the app knows: its hand-written FMS cues, else its own
 * checklist. Empty for a skill with no checklist.
 */
export const getSkillCues = (skillName: string): PeerSyllabusCue[] => {
  const match = Object.keys(OFFICIAL_FMS_PEER_CUES).find(
    k => k.toLowerCase() === skillName.toLowerCase() || skillName.toLowerCase().includes(k.toLowerCase())
  );
  if (match) return OFFICIAL_FMS_PEER_CUES[match];
  if (!checklistCueCache.has(skillName)) checklistCueCache.set(skillName, cuesFromChecklist(skillName));
  return checklistCueCache.get(skillName)!;
};

/** What an assessor ticks. The generic cues are only for a skill with no checklist. */
export const getAllCuesForSkill = (skillName: string): PeerSyllabusCue[] => {
  const cues = getSkillCues(skillName);
  return cues.length ? cues : DEFAULT_PEER_CUES;
};

/**
 * What the teacher chose, at the planning stage, for the cues of one skill in
 * one lesson (#136). Kept on the lesson's assess step.
 */
export interface CuePlan {
  focusCues?: number[];              // item numbers pupils tick; none means all
  cueText?: Record<number, string>;  // the teacher's own wording, by item number
  extraCues?: string[];              // things to look out for that are in no criterion
}

/** Extra cues are numbered from here up, clear of any checklist's item numbers. */
export const EXTRA_CUE_BASE = 100;

/**
 * The cues pupils tick in a lesson: the picked ones (all, when none are
 * picked) in the teacher's wording where they gave one, then their extra cues.
 */
export const getLessonCues = (skillName: string, plan?: CuePlan): PeerSyllabusCue[] => {
  const all = getAllCuesForSkill(skillName);
  const picked = plan?.focusCues;
  const focus = picked?.length ? all.filter(c => picked.includes(c.itemNumber)) : [];
  const chosen = focus.length ? focus : all;

  const ownText = (c: PeerSyllabusCue) => plan?.cueText?.[c.itemNumber]?.trim();
  const worded = chosen.some(ownText)
    ? chosen.map(c => (ownText(c) ? { ...c, kidFriendlyText: ownText(c)! } : c))
    : chosen;

  const extras: PeerSyllabusCue[] = (plan?.extraCues ?? [])
    .map((text, i) => ({ text: text.trim(), n: i + 1 }))
    .filter(e => e.text)
    .map(e => ({
      id: `extra-${e.n}`,
      itemNumber: EXTRA_CUE_BASE + e.n,
      icon: '👀',
      syllabusCriterion: e.text,
      kidFriendlyText: e.text,
      keyPhase: 'execution',
      detail: '',
      extra: true,
    }));
  return extras.length ? [...worded, ...extras] : worded;
};

/**
 * The criteria a lesson focuses on, by name, when the teacher picked only some
 * of them. Empty when pupils tick every cue. For the AI: it still grades the
 * whole skill, and leads its feedback with these.
 */
export const focusCriteria = (skillName: string, plan?: CuePlan): string[] => {
  const all = getSkillCues(skillName);
  const picked = plan?.focusCues;
  const focus = picked?.length ? all.filter(c => picked.includes(c.itemNumber)) : [];
  if (!focus.length || focus.length === all.length) return [];
  // A gymnastics criterion is "Name: description", and its name is enough
  return focus.map(c => (c.detail ? c.syllabusCriterion.split(':')[0].trim() : c.syllabusCriterion));
};
