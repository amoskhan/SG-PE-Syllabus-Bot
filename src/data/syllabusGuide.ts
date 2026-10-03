import { PE_SYLLABUS_TEXT } from './syllabusData';
import { ALL_FMS_SKILLS } from './fundamentalMovementSkillsData';
import { ALL_GYMNASTICS_SKILLS } from './gymnasticsSkillsData';

// The syllabus guide (#112): asks up to 4 chip questions (level, area, focus,
// need), then turns the teacher's question into ONE section of the 2024
// syllabus, so the AI is sent that section instead of the whole document, and
// the chat can show the section's own words and a link to its PDF page.
// Pure and deterministic: no AI call decides where a question goes.

const TEXT = PE_SYLLABUS_TEXT.replace(/\r\n/g, '\n');

/** The hosted copy of the official PDF; its pages run 5 ahead of the printed numbers. */
export const SYLLABUS_PDF_URL = '/syllabus/pe-syllabus-2024.pdf';
const PDF_PAGE_OFFSET = 5;

export interface SyllabusSection {
  id: string;
  title: string;
  printedPage: number;
  pdfPage: number;
  /** The section in the syllabus's own words, page footers and stamps removed */
  text: string;
}

// ── Page footers ────────────────────────────────────────────────────────────
// Each printed page ends with its number alone on a line (from p. 14; the
// front pages have none). Stray numbers (table item numbers) also sit alone on
// lines, so a footer is only a number one more than the last footer, and the
// first footer is the first number followed by the next one.
const FOOTERS: { index: number; end: number; page: number }[] = (() => {
  const lone: { index: number; end: number; page: number }[] = [];
  const re = /\n(\d{1,3})(?=\n)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(TEXT))) lone.push({ index: m.index, end: m.index + m[0].length, page: Number(m[1]) });
  const found: typeof lone = [];
  lone.forEach((n, i) => {
    const last = found.at(-1);
    if (last ? n.page === last.page + 1 : lone[i + 1]?.page === n.page + 1) found.push(n);
  });
  return found;
})();

/** The printed page a position in the text falls on: one after the last footer before it. */
const printedPageAt = (index: number): number => {
  let page = 1;
  for (const f of FOOTERS) {
    if (f.index >= index) break;
    page = f.page + 1;
  }
  return page;
};

const cleanText = (from: number, to: number): string => {
  let out = '';
  let cursor = from;
  for (const f of FOOTERS) {
    if (f.index < from || f.index >= to) continue;
    out += TEXT.slice(cursor, f.index);
    cursor = f.end;
  }
  out += TEXT.slice(cursor, to);
  return out
    .replace(/^OFFICIAL \(CLOSED\) \/ NON-SENSITIVE$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// ── The Primary sections ────────────────────────────────────────────────────
const DASH = String.raw`\s*[–—\-?�]\s*`;

type Area = 'athletics' | 'dance' | 'games' | 'gymnastics' | 'swimming' | 'outdoor' | 'phs' | 'cce';
type Focus = 'net-barrier' | 'striking-fielding' | 'territorial-invasion';

const AREA_NAMES: Record<Area, string> = {
  athletics: 'Athletics',
  dance: 'Dance',
  games: 'Games and Sports',
  gymnastics: 'Gymnastics',
  swimming: 'Swimming',
  outdoor: 'Outdoor Education',
  phs: 'Physical Health and Safety',
  cce: 'Character and Citizenship Education',
};

const FOCUS_NAMES: Record<Focus, string> = {
  'net-barrier': 'Net-barrier games',
  'striking-fielding': 'Striking-fielding games',
  'territorial-invasion': 'Territorial-invasion games',
};

/** Headings as they appear in the text, each on a line of its own. */
const LEVEL_HEADINGS: Partial<Record<Area, string>> = {
  athletics: 'ATHLETICS',
  dance: 'DANCE',
  games: 'GAMES AND SPORTS',
  gymnastics: 'GYMNASTICS',
  outdoor: 'OUTDOOR EDUCATION',
  phs: 'PHYSICAL HEALTH AND SAFETY',
};
const FOCUS_HEADINGS: Record<Focus, string> = {
  'net-barrier': 'NET-BARRIER',
  'striking-fielding': 'STRIKING-FIELDING',
  'territorial-invasion': 'TERRITORIAL-INVASION',
};

const lineIndex = (pattern: string, from = 0): number => {
  const m = new RegExp(`\\n${pattern}\\n`).exec(TEXT.slice(from));
  return m ? from + m.index + 1 : -1;
};

const PRIMARY_START = TEXT.indexOf('2. PRIMARY LEVEL SYLLABUS CONTENT\n2.1 Overview');
const SECONDARY_START = TEXT.indexOf('3. SECONDARY LEVEL SYLLABUS CONTENT\n3.1 Overview');

/**
 * Where each Primary section starts. A section runs to the next of these (or of
 * the area-introduction markers below), so cut points come from the headings
 * themselves and nothing is measured by hand.
 */
const STARTS: { id: string; index: number; title: string }[] = [];
const levelId = (area: Area, level: number) => `p${level}-${area}`;
const focusId = (focus: Focus) => `p5-6-${focus}`;

for (const [area, heading] of Object.entries(LEVEL_HEADINGS) as [Area, string][]) {
  for (let level = 1; level <= 6; level++) {
    const index = lineIndex(`PRIMARY ${level}${DASH}${heading}`, PRIMARY_START);
    if (index !== -1 && index < SECONDARY_START) {
      STARTS.push({ id: levelId(area, level), index, title: `Primary ${level} – ${AREA_NAMES[area]}: learning outcomes` });
    }
  }
}
for (const [focus, heading] of Object.entries(FOCUS_HEADINGS) as [Focus, string][]) {
  const index = lineIndex(`PRIMARY 5 AND 6: LEARNING OUTCOMES - ${heading} CATEGORY`, PRIMARY_START);
  if (index !== -1) STARTS.push({ id: focusId(focus), index, title: `Primary 5 and 6 – ${FOCUS_NAMES[focus]}: learning outcomes` });
}
{
  const swim = lineIndex(`BY END OF PRIMARY 6${DASH}SWIMMING`, PRIMARY_START);
  if (swim !== -1) STARTS.push({ id: 'primary-swimming', index: swim, title: 'Swimming: learning outcomes by the end of Primary 6' });
  const games = TEXT.indexOf('\nGames and Sports\nGames and Sports ', PRIMARY_START);
  if (games !== -1) STARTS.push({ id: 'primary-games-overview', index: games + 1, title: 'Games and Sports (Primary): overview, progression and games concepts' });
  const cce = TEXT.indexOf('2.3 Character and Citizenship Education', PRIMARY_START);
  if (cce !== -1) STARTS.push({ id: 'primary-cce', index: cce, title: 'Character and Citizenship Education: developmental milestones (Primary)' });
}

/**
 * Each area opens with its name as a heading, then a sentence starting with
 * that name ("Dance\nDance develops…"). These end the last level section
 * before them.
 */
const AREA_INTROS = ['Dance', 'Games and Sports', 'Gymnastics', 'Swimming', 'Outdoor Education', 'Physical Health and Safety']
  .map((name) => TEXT.indexOf(`\n${name}\n${name} `, PRIMARY_START))
  .filter((index) => index !== -1)
  .map((index) => index + 1);

const CUTS = [...STARTS.map((s) => s.index), ...AREA_INTROS, SECONDARY_START].sort((a, b) => a - b);

const SECTIONS = new Map<string, SyllabusSection>(
  STARTS.map(({ id, index, title }) => {
    const end = CUTS.find((c) => c > index) ?? SECONDARY_START;
    const printedPage = printedPageAt(index);
    return [id, { id, title, printedPage, pdfPage: printedPage + PDF_PAGE_OFFSET, text: cleanText(index, end) }];
  }),
);

export const getSyllabusSection = (id: string): SyllabusSection | undefined => SECTIONS.get(id);

// ── Reading the question ────────────────────────────────────────────────────
const AREA_WORDS: [Area, RegExp][] = [
  ['athletics', /\bathletics?\b|\btrack (and|&) field\b/i],
  ['dance', /\bdanc(e|es|ing)\b/i],
  ['games', /\bgames?\b|\bsports?\b/i],
  ['gymnastics', /\bgym(nastics?)?\b/i],
  ['swimming', /\bswim(ming)?\b|\baquatics?\b/i],
  ['outdoor', /\boutdoor\b|\bOE\b|\borienteering\b|\bcamping\b/],
  ['phs', /\bphysical health\b|\bPHS\b|\bhealth and safety\b|\bnutrition\b|\bhygiene\b/i],
  ['cce', /\bCCE\b|\bcharacter\b|\bcitizenship\b|\bvalues\b|\bsocial[- ]emotional\b/i],
];

const FOCUS_WORDS: [Focus, RegExp][] = [
  ['net-barrier', /\bnet[- ]?barrier\b|\bbadminton\b|\btennis\b|\bvolleyball\b|\bsepak\b/i],
  ['striking-fielding', /\bstriking[- ]fielding\b|\bsoftball\b|\bcricket\b|\brounders\b|\bkickball\b|\bt-?ball\b|\bbaseball\b/i],
  ['territorial-invasion', /\bterritorial\b|\binvasion\b|\bfootball\b|\bsoccer\b|\bbasketball\b|\bnetball\b|\bhockey\b|\bfloorball\b|\bhandball\b|\bfrisbee\b|\bultimate\b/i],
];

/**
 * P1–4 Games has no fixed sub-sections (each level groups its outcomes its own
 * way), so these narrow what the AI focuses on, not the text it is sent.
 */
const SKILL_GROUPS: [string, RegExp][] = [
  ['Throwing and catching', /\bthrow(s|ing)?\b|\bcatch(es|ing)?\b|\broll(s|ing)?\b|\btoss(ing)?\b/i],
  ['Kicking and trapping', /\bkick(s|ing)?\b|\btrap(s|ping)?\b/i],
  ['Striking', /\bstrik(e|es|ing)\b(?![- ]fielding)|\bvolley(s|ing)?\b|\bhit(s|ting)?\b|\bracket\b|\bbat\b/i],
  ['Dribbling', /\bdribbl(e|es|ing)\b/i],
];

export const NEEDS = ['Outcomes', 'Lesson ideas', 'Teaching cues', 'Assessment', 'Differentiation'] as const;
export type Need = (typeof NEEDS)[number];
const NEED_WORDS: [Need, RegExp][] = [
  ['Outcomes', /\boutcomes?\b|\bLOs?\b|\blearning objectives?\b|\bwhat (do|should) (pupils|students|they) learn\b/i],
  ['Lesson ideas', /\blesson\b|\bactivit(y|ies)\b|\bideas?\b|\bdrills?\b|\bplan(s|ning)?\b/i],
  ['Teaching cues', /\bcues?\b|\bteaching points?\b|\bcoaching\b/i],
  ['Assessment', /\bassess(ing|ment)?\b|\brubrics?\b|\bgrad(e|ing)\b|\bchecklist\b/i],
  ['Differentiation', /\bdifferentiat\w*|\bweaker\b|\bstronger\b|\bSEN\b|\bscaffold\w*|\bmodif(y|ication)\b|\badapt\w*/i],
];

/** What each need asks of the AI's summary */
const NEED_GUIDANCE: Record<Need, string> = {
  Outcomes: 'List the learning outcomes, numbered, in the syllabus’s own words.',
  'Lesson ideas': 'Give 3–4 practical activity ideas that teach these outcomes, each linked to the outcome it builds.',
  'Teaching cues': 'Give short cues a teacher can say to pupils (3–5 words each), linked to the outcomes.',
  Assessment: 'Say what to look for when checking these outcomes, and 2–3 simple ways to check them in a lesson.',
  Differentiation: 'Give ways to make the activities easier and harder for these outcomes (space, equipment, speed, numbers).',
};

const NOT_PRIMARY = /\bsec(ondary)?\b|\bjc\b|\bjunior college\b|\bpre-?u(niversity)?\b|\bs[1-5]\b/i;

/** Words that make a message a syllabus question even without a level or area */
const SYLLABUS_INTENT = /\bsyllabus\b|\bcurriculum\b|\blearning areas?\b|\bscheme of work\b|\bwhat (should|do|can) (i|we|my \w+|pupils|students|they) (teach|learn|cover)\b/i;

/** FMS and gymnastics skill names: questions about these go to the skill checklists, not the guide */
const SKILL_NAMES = new RegExp(`\\b(${[...ALL_FMS_SKILLS, ...ALL_GYMNASTICS_SKILLS]
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

const levelOf = (q: string): number | undefined => {
  const m = q.match(/\b(?:p|pri|primary)\s*([1-6])\b/i);
  return m ? Number(m[1]) : undefined;
};

interface Parsed {
  level?: number;
  areas: Area[];
  categories: Focus[];
  group?: string;
  need?: Need;
}

const parse = (q: string): Parsed => {
  const categories = FOCUS_WORDS.filter(([, re]) => re.test(q)).map(([f]) => f);
  const areas = new Set(AREA_WORDS.filter(([, re]) => re.test(q)).map(([a]) => a));
  if (categories.length) areas.add('games');
  return {
    level: levelOf(q),
    areas: [...areas],
    categories,
    group: SKILL_GROUPS.find(([, re]) => re.test(q))?.[0],
    need: NEED_WORDS.find(([, re]) => re.test(q))?.[0],
  };
};

// ── The guide's steps ───────────────────────────────────────────────────────
export const JUST_ANSWER = 'Just answer';
export const MAX_QUESTIONS = 4;

export type GuideStepName = 'level' | 'area' | 'focus' | 'need';

/** What the guide knows, kept on each guide message so the next reply carries on from it */
export interface GuideState {
  level?: number;
  area?: Area;
  /** A P5/6 Games category, or a P1–4 Games skill group */
  focus?: string;
  need?: Need;
  /** Questions asked so far for this topic */
  asked: number;
  /** The question this message asked; unset on an answer */
  step?: GuideStepName;
  /** The section answered from; set on an answer */
  sectionId?: string;
}

/** A section with what the teacher wants from it, for the AI */
export interface SyllabusRequest {
  section: SyllabusSection;
  need?: Need;
  focus?: string;
}

export type GuideStep =
  | { kind: 'ask'; step: GuideStepName; prompt: string; choices: string[]; state: GuideState }
  | { kind: 'section'; request: SyllabusRequest; state: GuideState }
  /** The question names something that isn't taught at that level; the chips are real sections */
  | { kind: 'mismatch'; message: string; choices: string[] }
  /** Not a question the guide can place: the caller keeps the whole-syllabus answer */
  | { kind: 'unplaced' };

const UNPLACED: GuideStep = { kind: 'unplaced' };

const label = (id: string): string => {
  const [, level, rest] = id.match(/^p(\d)-(.+)$/) ?? [];
  if (id.startsWith('p5-6-')) return `P5/6 ${FOCUS_NAMES[id.slice(5) as Focus]}`;
  if (level) return `P${level} ${AREA_NAMES[rest as Area]}`;
  return id;
};

const isCategory = (focus?: string): focus is Focus => !!focus && focus in FOCUS_NAMES;

/** Areas taught at a level (Athletics starts at P4) */
const areasAt = (level?: number): Area[] =>
  (Object.keys(AREA_NAMES) as Area[]).filter((a) => a !== 'athletics' || level === undefined || level >= 4);

/** Levels at which an area's answer differs (one section for all of them needs no question) */
const levelsFor = (area?: Area, focus?: string): number[] => {
  if (area === 'swimming' || area === 'cce' || isCategory(focus)) return [];
  if (area === 'athletics') return [4, 5, 6];
  return [1, 2, 3, 4, 5, 6];
};

/** The section for what is known, or none yet */
const sectionIdFor = (s: GuideState): string | undefined => {
  if (s.area === 'swimming') return 'primary-swimming';
  if (s.area === 'cce') return 'primary-cce';
  if (isCategory(s.focus)) return focusId(s.focus);
  if (!s.area || s.level === undefined) return undefined;
  if (s.area === 'games' && s.level >= 5) return 'primary-games-overview';
  return levelId(s.area, s.level);
};

const mismatchFor = (s: GuideState): GuideStep | undefined => {
  if (s.level === undefined) return undefined;
  if (isCategory(s.focus) && s.level < 5) {
    return {
      kind: 'mismatch',
      message: `${FOCUS_NAMES[s.focus]} are taught from Primary 5 in the syllabus. At P${s.level}, Games and Sports covers the basic skills of sending and receiving.`,
      choices: [label(focusId(s.focus)), label(levelId('games', s.level))],
    };
  }
  if (s.area === 'athletics' && s.level < 4) {
    return {
      kind: 'mismatch',
      message: `Athletics is taught from Primary 4 in the syllabus. At P${s.level}, running, jumping and throwing are learnt through Dance, Games and Sports, and Gymnastics.`,
      choices: [label(levelId('athletics', 4)), label(levelId('games', s.level))],
    };
  }
  return undefined;
};

const answer = (s: GuideState): GuideStep => {
  const id = sectionIdFor(s);
  const section = id ? SECTIONS.get(id) : undefined;
  if (!section) return UNPLACED;
  const focus = s.focus && !isCategory(s.focus) ? s.focus : undefined;
  return {
    kind: 'section',
    request: { section, need: s.need, focus },
    state: { level: s.level, area: s.area, focus: s.focus, need: s.need, asked: s.asked, sectionId: section.id },
  };
};

const ask = (s: GuideState, step: GuideStepName, prompt: string, choices: string[]): GuideStep => ({
  kind: 'ask',
  step,
  prompt,
  choices: [...choices, JUST_ANSWER],
  state: { level: s.level, area: s.area, focus: s.focus, need: s.need, asked: s.asked + 1, step },
});

/** The next question, or the answer once nothing left would narrow it */
const next = (s: GuideState): GuideStep => {
  const mismatch = mismatchFor(s);
  if (mismatch) return mismatch;
  if (s.asked >= MAX_QUESTIONS) return answer(s);

  const levels = levelsFor(s.area, s.focus);
  if (s.level === undefined && levels.length > 1) {
    return ask(s, 'level', 'Which level are you planning for?', levels.map((l) => `P${l}`));
  }
  if (!s.area) {
    return ask(s, 'area', 'Which learning area?', areasAt(s.level).map((a) => AREA_NAMES[a]));
  }
  if (s.area === 'games' && !s.focus && s.level !== undefined) {
    return s.level >= 5
      ? ask(s, 'focus', 'Which games category?', Object.values(FOCUS_NAMES))
      : ask(s, 'focus', 'Which skills?', SKILL_GROUPS.map(([g]) => g));
  }
  if (!s.need) return ask(s, 'need', 'What do you need?', [...NEEDS]);
  return answer(s);
};

/** Fill what the message says into what is known; a new level or area starts a new topic */
const merge = (s: GuideState, p: Parsed): GuideState => {
  const area = p.areas.length === 1 ? p.areas[0] : s.area;
  const changedTopic = (p.level !== undefined && p.level !== s.level) || area !== s.area;
  const keptFocus = area === s.area ? s.focus : undefined;
  const focus = p.categories.length === 1 ? p.categories[0] : area === 'games' && p.group ? p.group : keptFocus;
  return {
    level: p.level ?? s.level,
    area,
    focus,
    need: p.need ?? s.need,
    asked: changedTopic && s.sectionId ? 0 : s.asked,
  };
};

const says = (p: Parsed) => p.level !== undefined || p.areas.length > 0 || !!p.need || !!p.group;

/**
 * One step of the guide for a teacher's message. `previous` is the guide state
 * on the last bot message, if it was a guide question or a guide answer.
 */
export const guideStep = (text: string, previous?: GuideState): GuideStep => {
  if (NOT_PRIMARY.test(text)) return UNPLACED;
  const p = parse(text);
  if (p.categories.length > 1 || p.areas.length > 1) return previous?.step ? next(previous) : UNPLACED;
  // A question about an FMS or gymnastics skill belongs to the skill checklists
  const isSkillQuestion = SKILL_NAMES.test(text) && p.level === undefined && p.areas.length === 0;

  // Replying to a guide question
  if (previous?.step) {
    if (text.trim().toLowerCase() === JUST_ANSWER.toLowerCase()) return answer(previous);
    if (says(p) && !isSkillQuestion) return next(merge(previous, p));
    // Didn't answer the question: treat it as a new message
    return guideStep(text);
  }

  // A follow-up to a guide answer stays on that section unless it names a new level or area
  if (previous?.sectionId) {
    if (isSkillQuestion) return UNPLACED;
    if (p.level === undefined && p.areas.length === 0) {
      return answer({ ...previous, need: p.need ?? previous.need, focus: p.group && previous.area === 'games' ? p.group : previous.focus });
    }
    return next(merge(previous, p));
  }

  // A new message
  if (p.level === undefined && p.areas.length === 0 && (isSkillQuestion || !(p.need || SYLLABUS_INTENT.test(text)))) {
    return UNPLACED;
  }
  return next(merge({ asked: 0 }, p));
};

// ── What the AI is sent ─────────────────────────────────────────────────────
/** Messages of the conversation sent with a section */
export const SECTION_HISTORY_LENGTH = 6;
export const recentHistory = <T>(history: T[]): T[] => history.slice(-SECTION_HISTORY_LENGTH);

export const SECTION_SYSTEM_INSTRUCTION = `You are the Singapore PE Syllabus Assistant for MOE Singapore's 2024 PE Syllabus.
The teacher's question is about ONE section of the syllabus, given to you in full. Answer from that section only.
- Shape the answer to what the teacher needs (given with the section).
- Be brief: teachers read on a phone. Use at most 5 bullet points or 4 sentences, except when listing outcomes; then give every outcome in the section, numbered, in the syllabus's own words.
- The section's full text and a link to its PDF page are shown under your answer, so do not paste the whole section unless asked.
- Answer directly. Do not offer menus or choices, and do not use [[SKILL_CHOICES]].
- If the section does not answer the question, say so in one sentence, then end with [[NOT_IN_SYLLABUS]] on its own line.
- Tone: direct, professional, Singapore PE context. No filler phrases.`;

/**
 * The AI ends an answer with this tag when the syllabus doesn't cover the
 * question; the chat then offers a web search instead of searching by default.
 */
export const NOT_IN_SYLLABUS_TAG = '[[NOT_IN_SYLLABUS]]';

export const takeNotInSyllabus = (text: string): { text: string; notInSyllabus: boolean } => ({
  text: text.split(NOT_IN_SYLLABUS_TAG).join('').trim(),
  notInSyllabus: text.includes(NOT_IN_SYLLABUS_TAG),
});

/** The instruction for a teacher's "Search the web" request */
export const WEB_SEARCH_INSTRUCTION = `You are the Singapore PE Syllabus Assistant, helping a Singapore PE teacher.
The teacher asked you to search the web because MOE's 2024 PE Syllabus does not cover this question.
- Use Google Search, and answer briefly: at most 5 bullet points or 4 sentences.
- Begin with: "From the web (not the MOE syllabus):"
- Prefer official and Singapore sources (MOE, SportSG, national sports associations).
- Tone: direct, professional. No filler phrases.`;

export const sectionContextMessage = ({ section, need, focus }: SyllabusRequest): string =>
  [
    `SINGAPORE MOE PE SYLLABUS 2024 — ${section.title} (syllabus p. ${section.printedPage})`,
    need ? `The teacher needs: ${need}. ${NEED_GUIDANCE[need]}` : '',
    focus ? `Focus on: ${focus}.` : '',
    section.text,
  ]
    .filter(Boolean)
    .join('\n\n');

export const sectionPdfLink = (s: Pick<SyllabusSection, 'pdfPage'>): string => `${SYLLABUS_PDF_URL}#page=${s.pdfPage}`;
