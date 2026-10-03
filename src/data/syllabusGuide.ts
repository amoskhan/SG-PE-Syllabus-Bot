import { PE_SYLLABUS_TEXT } from './syllabusData';

// The syllabus guide (#112): turns a teacher's question into ONE section of the
// 2024 syllabus, so the AI is sent that section instead of the whole document,
// and the chat can show the section's own words and a link to its PDF page.
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

export type GuideResult =
  | { kind: 'section'; section: SyllabusSection }
  /** The question names something that isn't taught at that level; the chips are real sections */
  | { kind: 'mismatch'; message: string; choices: string[] }
  /** Not a question the guide can place yet: the caller keeps the whole-syllabus answer */
  | { kind: 'unplaced' };

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

const NOT_PRIMARY = /\bsec(ondary)?\b|\bjc\b|\bjunior college\b|\bpre-?u(niversity)?\b|\bs[1-5]\b/i;

const levelOf = (q: string): number | null => {
  const m = q.match(/\b(?:p|pri|primary)\s*([1-6])\b/i);
  return m ? Number(m[1]) : null;
};

const label = (id: string): string => {
  const [, level, rest] = id.match(/^p(\d)-(.+)$/) ?? [];
  if (id.startsWith('p5-6-')) return `P5/6 ${FOCUS_NAMES[id.slice(5) as Focus]}`;
  if (level) return `P${level} ${AREA_NAMES[rest as Area]}`;
  return id;
};

export const resolveSyllabusQuestion = (question: string): GuideResult => {
  if (NOT_PRIMARY.test(question)) return { kind: 'unplaced' };
  const level = levelOf(question);
  const focuses = FOCUS_WORDS.filter(([, re]) => re.test(question)).map(([f]) => f);
  const areas = new Set(AREA_WORDS.filter(([, re]) => re.test(question)).map(([a]) => a));
  if (focuses.length) areas.add('games');
  if (level === null || areas.size !== 1 || focuses.length > 1) return { kind: 'unplaced' };
  const [area] = [...areas];
  const found = (id: string): GuideResult => {
    const section = SECTIONS.get(id);
    return section ? { kind: 'section', section } : { kind: 'unplaced' };
  };

  if (focuses.length === 1) {
    const focus = focuses[0];
    if (level >= 5) return found(focusId(focus));
    return {
      kind: 'mismatch',
      message: `${FOCUS_NAMES[focus]} are taught from Primary 5 in the syllabus. At P${level}, Games and Sports covers the basic skills of sending and receiving.`,
      choices: [label(focusId(focus)), label(levelId('games', level))],
    };
  }
  if (area === 'athletics' && level < 4) {
    return {
      kind: 'mismatch',
      message: `Athletics is taught from Primary 4 in the syllabus. At P${level}, running, jumping and throwing are learnt through Dance, Games and Sports, and Gymnastics.`,
      choices: [label(levelId('athletics', 4)), label(levelId('games', level))],
    };
  }
  if (area === 'swimming') return found('primary-swimming');
  if (area === 'cce') return found('primary-cce');
  return found(levelId(area, level));
};

// ── What the AI is sent ─────────────────────────────────────────────────────
/** Messages of the conversation sent with a section */
export const SECTION_HISTORY_LENGTH = 6;
export const recentHistory = <T>(history: T[]): T[] => history.slice(-SECTION_HISTORY_LENGTH);

export const SECTION_SYSTEM_INSTRUCTION = `You are the Singapore PE Syllabus Assistant for MOE Singapore's 2024 PE Syllabus.
The teacher's question is about ONE section of the syllabus, given to you in full. Answer from that section only.
- Be brief: teachers read on a phone. Use at most 5 bullet points or 4 sentences, unless the teacher asks for a full list; then give every item in the section, numbered, in the syllabus's own words.
- The section's full text and a link to its PDF page are shown under your answer, so do not paste the whole section unless asked.
- Answer directly. Do not offer menus or choices, and do not use [[SKILL_CHOICES]].
- If the section does not answer the question, say so in one sentence.
- Tone: direct, professional, Singapore PE context. No filler phrases.`;

export const sectionContextMessage = (s: SyllabusSection): string =>
  `SINGAPORE MOE PE SYLLABUS 2024 — ${s.title} (syllabus p. ${s.printedPage})\n\n${s.text}`;

export const sectionPdfLink = (s: Pick<SyllabusSection, 'pdfPage'>): string => `${SYLLABUS_PDF_URL}#page=${s.pdfPage}`;
