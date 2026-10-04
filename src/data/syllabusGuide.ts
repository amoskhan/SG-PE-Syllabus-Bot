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
  /** A short name for the chat list, e.g. "P5/6 Net-barrier" */
  topic: string;
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

// ── Sections ────────────────────────────────────────────────────────────────
const DASH = String.raw`\s*[–—\-?�]\s*`;

type Area = 'athletics' | 'dance' | 'games' | 'gymnastics' | 'swimming' | 'pa' | 'outdoor' | 'phs' | 'cce' | 'pedagogy' | 'assessment' | 'glossary';
type Focus = 'net-barrier' | 'striking-fielding' | 'territorial-invasion';
/** 'ta' is Teaching & Assessment: pedagogy, assessment and the glossary, for every level */
type Stage = 'primary' | 'secondary' | 'preu' | 'ta';

const AREA_NAMES: Record<Area, string> = {
  athletics: 'Athletics',
  dance: 'Dance',
  games: 'Games and Sports',
  gymnastics: 'Gymnastics',
  swimming: 'Swimming',
  pa: 'Physical Activities',
  outdoor: 'Outdoor Education',
  phs: 'Physical Health and Safety',
  cce: 'Character and Citizenship Education',
  pedagogy: 'Pedagogy',
  assessment: 'Assessment',
  glossary: 'Glossary',
};

/** Shorter area names for the chat list */
const AREA_SHORT: Record<Area, string> = {
  ...AREA_NAMES,
  games: 'Games',
  outdoor: 'Outdoor Ed',
  phs: 'PHS',
  cce: 'CCE',
};
const FOCUS_SHORT: Record<string, string> = {
  'net-barrier': 'Net-barrier',
  'striking-fielding': 'Striking-fielding',
  'territorial-invasion': 'Invasion games',
};

/** The learning areas each stage has, in the syllabus's order */
const STAGE_AREAS: Record<Stage, Area[]> = {
  primary: ['athletics', 'dance', 'games', 'gymnastics', 'swimming', 'outdoor', 'phs', 'cce'],
  secondary: ['pa', 'outdoor', 'phs', 'cce'],
  preu: ['pa', 'phs', 'cce'],
  ta: ['pedagogy', 'assessment', 'glossary'],
};

const FOCUS_NAMES: Record<Focus, string> = {
  'net-barrier': 'Net-barrier games',
  'striking-fielding': 'Striking-fielding games',
  'territorial-invasion': 'Territorial-invasion games',
};

/** Secondary and Pre-U physical activities: id, chip, heading in the text, words that name it */
const SPORTS: [string, string, string, RegExp][] = [
  ['badminton', 'Badminton', 'Badminton', /\bbadminton\b/i],
  ['table-tennis', 'Table Tennis', 'Table Tennis', /\btable[- ]tennis\b|\bping[- ]?pong\b/i],
  ['mini-tennis', 'Mini/Paddle Tennis', 'Mini/Paddle Tennis', /\b(mini|paddle)[- ]?tennis\b|(?<!table[- ])\btennis\b/i],
  ['volleyball', 'Volleyball', 'Volleyball', /\bvolleyball\b/i],
  ['tchoukball', 'Tchoukball', 'Tchoukball', /\btchoukball\b/i],
  ['softball', 'Softball', 'Softball', /\bsoftball\b|\bbaseball\b/i],
  ['basketball', 'Basketball', 'Basketball', /\bbasketball\b/i],
  ['floorball', 'Floorball', 'Floorball', /\bfloorball\b|\bhockey\b/i],
  ['football', 'Football', 'Football', /\bfootball\b|\bsoccer\b/i],
  ['rugby', 'Non-Contact Rugby', 'Non-Contact Rugby', /\brugby\b/i],
  ['netball', 'Netball', 'Netball', /\bnetball\b/i],
  ['ultimate', 'Ultimate Frisbee', 'Ultimate Frisbee', /\bultimate\b|\bfrisbee\b/i],
  ['track-and-field', 'Track and Field', 'Track and Field', /\btrack (and|&) field\b|\bhurdles?\b|\bdiscus\b|\bjavelin\b|\bshot[- ]?putt?\b|\bhigh jump\b|\blong jump\b|\brelays?\b/i],
];
const SPORT_NAME = new Map(SPORTS.map(([id, name]) => [id, name]));

/** At primary a sport is taught through its games category */
const SPORT_CATEGORY: Record<string, Focus> = {
  badminton: 'net-barrier',
  'table-tennis': 'net-barrier',
  'mini-tennis': 'net-barrier',
  volleyball: 'net-barrier',
  softball: 'striking-fielding',
  basketball: 'territorial-invasion',
  floorball: 'territorial-invasion',
  football: 'territorial-invasion',
  rugby: 'territorial-invasion',
  netball: 'territorial-invasion',
  ultimate: 'territorial-invasion',
};

/** Secondary Outdoor Education modules: chip, heading word in the text, words that name it */
const OE_MODULES: [string, string, RegExp][] = [
  ['Navigation', 'NAVIGATION', /\bnavigat\w*|\borienteering\b|\bmap(s|ping)?\b/i],
  ['Outdoor cooking', 'OUTDOOR COOKING', /\bcook(ing)?\b/i],
  ['Shelter building', 'SHELTER BUILDING', /\bshelters?\b/i],
  ['Trip planning', 'TRIP PLANNING', /\btrips?\b/i],
];
const moduleId = (module: string) => `sec-oe-${module.toLowerCase().replace(/\s+/g, '-')}`;

/** The pedagogy chapter's parts: chip, heading in the text, words that name it */
const PEDAGOGY_PARTS: [string, string, RegExp][] = [
  ['Teaching practices', 'PEDAGOGY', /\bteaching practices?\b|\bSTP\b|\bcurriculum philosophy\b|\blesson observation\b/i],
  ['Understanding students', 'UNDERSTANDING STUDENTS', /\bunderstanding students\b|\bspecial (educational )?needs\b/i],
  ['Teaching styles (Mosston)', 'PEDAGOGICAL APPROACHES AND STRATEGIES', /\bmosston\b|\bspectrum\b|\bteaching styles?\b/i],
  ['Movement Education', 'Movement Education', /\bmovement education\b/i],
  ['Game-based approach', 'Game-Based Approach', /\bgame[- ]based\b|\bTGfU\b|\bgames? sense\b|\bteaching games for understanding\b/i],
  ['Place-responsive pedagogy', 'Place-Responsive Pedagogy', /\bplace[- ]responsive\b/i],
  ['Nonlinear pedagogy', 'Nonlinear Pedagogy', /\bnon-?linear\b/i],
  ['Experiential learning', 'Experiential Learning Approach', /\bexperiential\b/i],
  ['Inquiry-based learning', 'Inquiry-Based Learning Approach', /\binquiry\b/i],
  ['Direct instruction', 'Direct Instruction', /\bdirect instruction\b/i],
  ['Affective learning', 'LEVERAGING AFFECTIVE LEARNING OPPORTUNITIES', /\baffective\b/i],
  ['Use of technology', 'USE OF TECHNOLOGY IN LEARNING', /\btechnology\b|\bICT\b|\bdigital\b/i],
];
const pedagogyId = (part: string) => `ta-pedagogy-${part.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}`;

/** Primary headings as they appear in the text, each on a line of its own. */
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
/** Where a line starting with `text` begins, after `from` */
const lineStart = (text: string, from: number): number => {
  const index = TEXT.indexOf(`\n${text}`, from);
  return index === -1 ? -1 : index + 1;
};

const PRIMARY_START = TEXT.indexOf('2. PRIMARY LEVEL SYLLABUS CONTENT\n2.1 Overview');
const SECONDARY_START = TEXT.indexOf('3. SECONDARY LEVEL SYLLABUS CONTENT\n3.1 Overview');
const PREU_START = TEXT.indexOf('4. PRE-UNIVERSITY LEVEL SYLLABUS CONTENT', SECONDARY_START);
const PEDAGOGY_START = lineStart('5.\n\nPEDAGOGY\n', PREU_START);
const ASSESSMENT_START = lineStart('6.\n\nASSESSMENT\n', PEDAGOGY_START);
const GLOSSARY_START = lineStart('7.\n\nGLOSSARY\n', ASSESSMENT_START);
const REFERENCES_START = lineStart('8.\n\nREFERENCES\n', GLOSSARY_START);

/**
 * Where each section starts. A section runs to the next of these (or of the
 * area introductions below), so cut points come from the headings themselves
 * and nothing is measured by hand.
 */
const STARTS: { id: string; index: number; title: string; topic: string }[] = [];
const start = (id: string, index: number, title: string, topic: string) => {
  if (index !== -1) STARTS.push({ id, index, title, topic });
};
const levelId = (area: Area, level: number) => `p${level}-${area}`;
const focusId = (focus: Focus) => `p5-6-${focus}`;

// Primary
for (const [area, heading] of Object.entries(LEVEL_HEADINGS) as [Area, string][]) {
  for (let level = 1; level <= 6; level++) {
    const index = lineIndex(`PRIMARY ${level}${DASH}${heading}`, PRIMARY_START);
    if (index < SECONDARY_START) start(levelId(area, level), index, `Primary ${level} – ${AREA_NAMES[area]}: learning outcomes`, `P${level} ${AREA_SHORT[area]}`);
  }
}
for (const [focus, heading] of Object.entries(FOCUS_HEADINGS) as [Focus, string][]) {
  start(focusId(focus), lineIndex(`PRIMARY 5 AND 6: LEARNING OUTCOMES - ${heading} CATEGORY`, PRIMARY_START), `Primary 5 and 6 – ${FOCUS_NAMES[focus]}: learning outcomes`, `P5/6 ${FOCUS_SHORT[focus]}`);
}
start('primary-swimming', lineIndex(`BY END OF PRIMARY 6${DASH}SWIMMING`, PRIMARY_START), 'Swimming: learning outcomes by the end of Primary 6', 'Primary Swimming');
start('primary-games-overview', lineStart('Games and Sports\nGames and Sports ', PRIMARY_START), 'Games and Sports (Primary): overview, progression and games concepts', 'P5/6 Games');
start('primary-cce', TEXT.indexOf('2.3 Character and Citizenship Education', PRIMARY_START), 'Character and Citizenship Education: developmental milestones (Primary)', 'Primary CCE');

// Secondary and Pre-U physical activities: each one's name sits on its own line
// above its description (Pre-U games carry a *)
const sportStart = (heading: string, from: number): number => {
  const m = new RegExp(`\\n${heading.replace('/', '\\/')}\\*?\\n\\n?DESCRIPTION OF THE`).exec(TEXT.slice(from));
  return m ? from + m.index + 1 : -1;
};
for (const [prefix, from, stageTitle] of [['sec', SECONDARY_START, 'Secondary'], ['preu', PREU_START, 'Pre-University']] as const) {
  for (const [id, name, heading] of SPORTS) {
    start(`${prefix}-${id}`, sportStart(heading, from), `${stageTitle} – ${name}: learning outcomes`, `${prefix === 'sec' ? 'Sec' : 'Pre-U'} ${name}`);
  }
}
start('sec-pa-overview', lineStart('PHYSICAL ACTIVITIES GUIDELINES\n', SECONDARY_START), 'Physical Activities (Secondary): guidelines, games categories and concepts', 'Sec Physical Activities');
start('preu-pa-overview', lineStart('PHYSICAL ACTIVITIES OFFERINGS\n', PREU_START), 'Physical Activities (Pre-University): offerings, guidelines and games concepts', 'Pre-U Physical Activities');

// Secondary Outdoor Education: an introduction, then four modules (Sec 1, then Sec 2 and/or 3)
start('sec-oe-overview', lineStart('Outdoor Education\nOutdoor Education ', SECONDARY_START), 'Outdoor Education (Secondary): strands, lesson design and modules', 'Sec Outdoor Ed');
for (const [module, heading] of OE_MODULES) {
  start(moduleId(module), lineIndex(`SECONDARY 1${DASH}${heading}`, SECONDARY_START), `Secondary – Outdoor Education, ${module}: learning outcomes (Sec 1, Sec 2 and/or 3)`, `Sec OE · ${module}`);
}

// Physical Health and Safety and CCE
start('sec-phs-lower', lineIndex(`SECONDARY 1${DASH}PHYSICAL HEALTH AND SAFETY`, SECONDARY_START), 'Lower Secondary (Sec 1–2) – Physical Health and Safety: learning outcomes', 'Lower Sec PHS');
start('sec-phs-upper', lineIndex(`SECONDARY 3${DASH}PHYSICAL HEALTH AND SAFETY`, SECONDARY_START), 'Upper Secondary (Sec 3–4) – Physical Health and Safety: learning outcomes', 'Upper Sec PHS');
start('sec-cce', TEXT.indexOf('3.3 Character and Citizenship Education', SECONDARY_START), 'Character and Citizenship Education: developmental milestones (Secondary)', 'Sec CCE');
start('preu-phs', lineStart('LEARNING OUTCOMES\n', lineStart('Physical Health and Safety\nPhysical Health and Safety ', PREU_START)), 'Pre-University – Physical Health and Safety: learning outcomes', 'Pre-U PHS');
start('preu-cce', TEXT.indexOf('4.3 Character and Citizenship Education', PREU_START), 'Character and Citizenship Education: developmental milestones (Pre-University)', 'Pre-U CCE');

// Teaching & Assessment: the pedagogy chapter in parts, then assessment and the glossary
for (const [part, heading] of PEDAGOGY_PARTS) {
  start(pedagogyId(part), part === 'Teaching practices' ? PEDAGOGY_START : lineStart(`${heading}\n`, PEDAGOGY_START), `Pedagogy: ${part}`, `Pedagogy · ${part}`);
}
start('ta-assessment', ASSESSMENT_START, 'Assessment in PE: purpose, principles, the four-stage process and reporting', 'Assessment in PE');
start('ta-glossary', GLOSSARY_START, 'Glossary of terms', 'Glossary');

// The syllabus's introduction answers a question with nothing chosen yet
start('syllabus-overview', TEXT.indexOf('1. INTRODUCTION\n1.1 Curriculum Framework'), 'Introduction: the PE curriculum framework', 'Syllabus overview');

/**
 * Each area opens with its name as a heading, then a sentence starting with
 * that name ("Dance\nDance develops…"). These end the last section before them.
 */
const AREA_INTROS = [...TEXT.matchAll(/\n(Dance|Games and Sports|Gymnastics|Swimming|Outdoor Education|Physical Health and Safety)\n\1 /g)]
  .map((m) => (m.index ?? 0) + 1);

const CUTS = [...STARTS.map((s) => s.index), ...AREA_INTROS, PRIMARY_START, SECONDARY_START, PREU_START, PEDAGOGY_START, ASSESSMENT_START, GLOSSARY_START, REFERENCES_START]
  .sort((a, b) => a - b);

const SECTIONS = new Map<string, SyllabusSection>(
  STARTS.map(({ id, index, title, topic }) => {
    const end = CUTS.find((c) => c > index) ?? REFERENCES_START;
    const printedPage = printedPageAt(index);
    return [id, { id, title, topic, printedPage, pdfPage: printedPage + PDF_PAGE_OFFSET, text: cleanText(index, end) }];
  }),
);

export const getSyllabusSection = (id: string): SyllabusSection | undefined => SECTIONS.get(id);
export const allSyllabusSections = (): SyllabusSection[] => [...SECTIONS.values()];

// ── The syllabus map (#130) ─────────────────────────────────────────────────
// One line per section, so the AI knows where everything sits in the syllabus
// ("kicking first appears in P2 Games, p. 33") whichever section it is sent.
// Cut from the sections' own text; the prototype is on branch prototype/syllabus-map.
const MAP_WORDS_PER_OUTCOME = 6;
const MAP_OUTCOMES_PER_SECTION = 5;

const MAP_FILLER = /\b(the|a|an|using|of|to|and|with|in|on|for|by|at|into|from|towards?|their|its|one's|that|which|who|will|be|is|are|e\.g\.,?)\b/gi;
/** Footnote numbers stuck to a word ("minutes7", "overhand15") */
const FOOTNOTE = /([a-z’)])\d{1,3}\b/g;

/** An outcome cut to its first clause, without filler words */
const shortOutcome = (outcome: string): string =>
  outcome.replace(/\s+/g, ' ').replace(FOOTNOTE, '$1').replace(/\bmovement( pattern)?\b/gi, '').replace(/\(.*?\)/g, '')
    .split(/[,;:.](?:\s|$)/)[0]
    .replace(MAP_FILLER, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').slice(0, MAP_WORDS_PER_OUTCOME).join(' ').toLowerCase();

/** Short lines above a numbered list that aren't a skill heading */
const NOT_SKILL_HEADING = /^(Movement Skills and Concepts|Learning Outcome|Strand|Sending( and Receiving)?|Propelling\d*|Skill execution|Games-related Concept)$/i;

const joinHeading = (lines: string[]): string => lines.join(' ').replace(FOOTNOTE, '$1');

/**
 * Headings run together in a table's first column, split where a line starts
 * a new one: ["Kicking and", "trapping", "Striking and", "Trapping"] → 2 headings.
 * A line carries on the one before when it starts in lower case, or the one
 * before ends in "and", "&", "/" or "," or has an unclosed bracket.
 */
const splitHeadings = (lines: string[]): string[] => {
  const headings: string[][] = [];
  for (const line of lines) {
    const sofar = headings.at(-1)?.join(' ') ?? '';
    const carriesOn = sofar && (!/^[A-Z]/.test(line) || /(\band|&|\/|,)$/.test(sofar)
      || (sofar.match(/\(/g) ?? []).length > (sofar.match(/\)/g) ?? []).length);
    if (carriesOn) headings.at(-1)!.push(line);
    else headings.push([line]);
  }
  return headings.map(joinHeading);
};

/**
 * Numbered outcomes ("1. Kick using…"), each under its skill heading, if any.
 * A list takes the heading just above it. Some tables (P3 Games) give every
 * heading first, then the lists: a list with no heading above takes the next
 * of those.
 */
const numberedOutcomes = (text: string): { heading: string; text: string }[] => {
  const out: { heading: string; text: string }[] = [];
  let heading = '';
  let headingLines: string[] = [];
  /** Headings seen earlier, not yet given to a list */
  let earlier: string[] = [];
  let current: { heading: string; text: string } | undefined;
  const finish = () => {
    if (current) out.push(current);
    current = undefined;
  };
  for (const line of text.split('\n').map((l) => l.trim())) {
    const numbered = line.match(/^(\d{1,2})\.\s+(\S.*)$/);
    if (numbered) {
      finish();
      if (numbered[1] === '1' && headingLines.length) {
        heading = joinHeading(headingLines);
        earlier = [];
      } else if (numbered[1] === '1') {
        heading = earlier.shift() ?? heading;
      }
      headingLines = [];
      current = { heading, text: numbered[2] };
    } else if (!line) {
      finish();
    } else if (current) {
      current.text += ` ${line}`;
    } else if (line.length < 30 && !/[.•:]/.test(line) && !NOT_SKILL_HEADING.test(line) && line !== line.toUpperCase()) {
      headingLines.push(line);
    } else {
      earlier.push(...splitHeadings(headingLines));
      headingLines = [];
    }
  }
  finish();
  return out;
};

/** The outcomes grouped by skill heading; every group keeps at least one, the rest share what's left */
const outcomesSummary = (text: string): string => {
  const groups = new Map<string, string[]>();
  for (const { heading, text: outcome } of numberedOutcomes(text)) {
    const items = groups.get(heading) ?? [];
    const short = shortOutcome(outcome);
    if (!items.includes(short)) items.push(short);
    groups.set(heading, items);
  }
  const lists = [...groups.values()];
  const shown = lists.map(() => 1);
  let left = MAP_OUTCOMES_PER_SECTION - shown.length;
  for (let round = 1; left > 0 && lists.some((items) => items.length > round); round++) {
    lists.forEach((items, i) => {
      if (left > 0 && items.length > round) {
        shown[i]++;
        left--;
      }
    });
  }
  return [...groups].map(([heading, items], i) => (heading ? `${heading}: ` : '') + items.slice(0, shown[i]).join('; ')).join(' | ');
};

/** PHS strand names, which the PDF's table sometimes puts between a bullet and its outcome */
const PHS_STRAND = /^(Physical Fitness|Safety and Risk Management|Nutrition|Personal Hygiene and Self-Care)$/;

/** Bulleted outcomes ("• Know the components of a balanced diet."), for levels without numbered ones */
const bulletPoints = (text: string): string[] =>
  text.split(/\n\s*•\s*/).slice(1)
    .map((b) => {
      const [first, next = ''] = b.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim());
      return PHS_STRAND.test(first) ? next : first;
    })
    .filter((b) => b.length > 15);

const bulletsSummary = (text: string): string =>
  [...new Set(bulletPoints(text).map(shortOutcome))].slice(0, MAP_OUTCOMES_PER_SECTION).join('; ');

/** The tactical problems a P5/6 games category is taught through */
const TACTICAL_PROBLEM = /^(Winning the Point|Sending into Space|Setting up an Attack|Defending against an Attack|Maintaining Possession|Attacking the Goal|Defending Space|Defending the Goal|Regaining Possession|Getting on Base|Advancing Runners|Scoring Runs|Preventing Scoring|Keeping Possession[^\n]*)$/gim;

/** P5/6 category tables: their tactical problems and situational games (1v1, 2v2…) */
const categorySummary = (text: string): string => {
  const problems = [...new Set([...text.matchAll(TACTICAL_PROBLEM)].map((m) => m[1].trim()))];
  const games = [...new Set([...text.matchAll(/\b(\d)\s?v\s?(\d)\b/g)].map((m) => `${m[1]}v${m[2]}`))];
  return `${problems.join('; ')}${games.length ? ` (games: ${games.join(', ')})` : ''}`;
};

/** Glossary terms: each a short paragraph ("Active\nEngagement") followed by its longer definition */
const glossaryTerms = (text: string): string[] => {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim());
  return paragraphs.filter((p, i) =>
    p.length < 60 && /^[A-Z]/.test(p) && !/\d/.test(p) && !/[.:,]$/.test(p) && p !== 'GLOSSARY' && (paragraphs[i + 1] ?? '').length > p.length);
};

/**
 * Hand-written lines for sections that are prose or tables, not lists of
 * outcomes: cut from their text, these came out empty or as half a sentence.
 * Each says only what that section says.
 */
const MAP_LINES: Record<string, string> = {
  'primary-games-overview': 'how primary games progress: P1-3 basic manipulative skills and movement patterns; P4 combination skills (catch, dribble, throw) while defended; P5-6 three games categories (net-barrier, striking-fielding, territorial-invasion) taught through situational games (1v1, 2v2); games-related concepts per category',
  'primary-cce': 'CCE developmental milestones (social-emotional competencies) for Lower, Middle and Upper Primary under each core value: respect, responsibility, resilience, integrity, care, harmony; not for grading',
  'sec-pa-overview': 'choosing secondary physical activities: at least 5 per student, from at least 2 games categories, at least 1 individual/dual; each at least 16 hours with a culminating event; activities by category (e.g. basketball, football, badminton, volleyball, softball, swimming, track & field); school-designed activities',
  'sec-oe-overview': 'secondary Outdoor Education: strands outdoor living, sense of place, risk assessment and management; modules navigation, outdoor cooking, shelter building, trip planning (by end of Sec 1 for the 4D3N camp, by end of Sec 3 for the 5D4N camp); themes, lesson design',
  'sec-cce': 'CCE developmental milestones (social-emotional competencies) for Secondary under each core value: respect, responsibility, resilience, integrity, care, harmony; not for grading',
  'preu-pa-overview': 'choosing Pre-U physical activities: at least 5 per student, at least 1 individual/dual and 1 team, own choice, at least 1 recreational competition; each at least 10 hours with a culminating event; revisit secondary activities or learn new ones',
  'preu-cce': 'CCE developmental milestones (social-emotional competencies) for Pre-U under each core value: respect, responsibility, resilience, integrity, care, harmony; not for grading',
  'ta-pedagogy-teaching-practices': 'Singapore Curriculum Philosophy and Singapore Teaching Practice; 4 teaching processes: positive classroom culture, lesson preparation, lesson enactment, assessment and feedback; PE Lesson Observation Tool (PELOT, 24 teaching areas)',
  'ta-pedagogy-understanding-students': 'learner profiles and differentiated instruction (content, process, product, environment; 4 guidelines); students with special educational needs (learning, physical, social-behavioural, sensory)',
  'ta-pedagogy-teaching-styles-mosston': "Mosston's spectrum: 11 teaching styles A-K; reproduction cluster A-E (command, practice, reciprocal, self-check, inclusion); production cluster F-K (guided, convergent, divergent discovery; learner designed, learner initiated, self teach); teacher and learner roles",
  'ta-pedagogy-movement-education': "Laban's movement concepts: body, space, effort, relationship; small-step progression to a dance or gymnastics sequence; modified small-sided games",
  'ta-pedagogy-game-based-approach': "Game-Based Approach (TGfU, Tactical Games, Game Sense): 'what, why, when' before 'how'; modified games (sampling, representation, exaggeration, tactical complexity); teacher facilitates by questioning",
  'ta-pedagogy-place-responsive-pedagogy': 'Outdoor Education: five pedagogical foci from P1 to Sec 3 (being present in places, engaging with places, representing places, holistic understanding, civic engagement); building personal connections with places',
  'ta-pedagogy-nonlinear-pedagogy': 'Nonlinear Pedagogy: manipulate task, performer and environment constraints so learners explore their own movement solutions; representativeness, attentional focus, functional variability',
  'ta-pedagogy-experiential-learning': "Kolb's experiential learning cycle: concrete experience, reflective observation, abstract conceptualisation, active experimentation; e.g. outdoor cooking; teacher and student roles",
  'ta-pedagogy-inquiry-based-learning': 'inquiry-based learning: students pose questions, gather and analyse information, draw conclusions, collaborate, reflect; open or structured inquiry; in games tactics and PHS',
  'ta-pedagogy-direct-instruction': 'direct instruction: task-oriented clear goals, skills broken into parts, demonstration, active monitoring, immediate specific feedback; for hierarchical basic skills and safety',
  'ta-pedagogy-affective-learning': 'five affective learning opportunities: explicit teaching, content setting, communication styles, didactic interactions, teachable moments; how to use each in a lesson',
  'ta-pedagogy-use-of-technology': 'technology in PE: Student Learning Space (SLS), Key Applications of Technology, video and collaboration tools for feedback, critical use of health information and fitness apps',
  'ta-assessment': 'assessment purpose and 4 principles; the four-stage process (plan learning intentions and success criteria, ongoing assessment, analyse evidence, share attainment); P1-2 reporting by Holistic Development Profile (qualitative descriptors); P3 onwards school-chosen reporting; rubrics',
};

const mapBody = (s: SyllabusSection): string => {
  if (MAP_LINES[s.id]) return MAP_LINES[s.id];
  if (s.id === 'ta-glossary') return `terms: ${glossaryTerms(s.text).join(', ')}`;
  if (s.id.startsWith('p5-6-')) return categorySummary(s.text);
  if (numberedOutcomes(s.text).length >= 2) return outcomesSummary(s.text);
  return bulletsSummary(s.text);
};

const mapLine = (s: SyllabusSection): string => `${s.topic} (p. ${s.printedPage}): ${mapBody(s)}`;

/** The whole syllabus in one line per section, in page order */
export const syllabusMap = (): string =>
  [...SECTIONS.values()]
    .filter((s) => s.id !== 'syllabus-overview')
    .sort((a, b) => a.printedPage - b.printedPage)
    .map(mapLine)
    .join('\n');

// ── Reading the question ────────────────────────────────────────────────────
const AREA_WORDS: [Area, RegExp][] = [
  ['athletics', /\bathletics?\b/i],
  ['dance', /\bdanc(e|es|ing)\b/i],
  ['games', /\bgames?\b(?![- ]based)|\bsports?\b/i],
  ['gymnastics', /\bgym(nastics?)?\b/i],
  ['swimming', /\bswim(ming)?\b|\baquatics?\b/i],
  ['pa', /\bphysical activit(y|ies)\b/i],
  ['outdoor', /\boutdoor\b|\bOE\b|\borienteering\b|\bcamping\b/],
  ['phs', /\bphysical health\b|\bPHS\b|\bhealth and safety\b|\bnutrition\b|\bhygiene\b/i],
  ['cce', /\bCCE\b|\bcharacter\b|\bcitizenship\b|\bvalues\b|\bsocial[- ]emotional\b/i],
  ['pedagogy', /\bpedagog\w*|\bteaching (approach|strateg)\w*/i],
  // "Assessment" alone is what a teacher needs for an area; these ask about assessment itself
  ['assessment', /\bassessment (principles|purpose|process)\b|\bfour[- ]stage\b|\bqualitative descriptors?\b|\bQDs?\b|\bhow (should|do|can) (i|we|teachers) assess (in )?PE\b|\b(PE|holistic) assessment\b|\bassessment in PE\b/i],
  ['glossary', /\bglossary\b|\bdefin(e|ition)s?\b|\bwhat is meant by\b/i],
];

const CATEGORY_WORDS: [Focus, RegExp][] = [
  ['net-barrier', /\bnet[- ]?barrier\b|\bsepak\b/i],
  ['striking-fielding', /\bstriking[- ]fielding\b|\bcricket\b|\brounders\b|\bkickball\b|\bt-?ball\b/i],
  ['territorial-invasion', /\bterritorial\b|\binvasion\b|\bhandball\b/i],
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
  ['Lesson ideas', /\blesson\b|\bactivit(y|ies)\b(?<!physical activit(y|ies))|\bideas?\b|\bdrills?\b|\bplan(s|ning)?\b(?! a trip)/i],
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

/** Words that make a message a syllabus question even without a level or area */
const SYLLABUS_INTENT = /\bsyllabus\b|\bcurriculum\b|\blearning areas?\b|\bscheme of work\b|\bwhat (should|do|can) (i|we|my \w+|pupils|students|they) (teach|learn|cover)\b/i;

/** FMS and gymnastics skill names: questions about these go to the skill checklists, not the guide */
const SKILL_NAMES = new RegExp(`\\b(${[...ALL_FMS_SKILLS, ...ALL_GYMNASTICS_SKILLS]
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

/**
 * A level as the teacher picks it. 'Primary', 'Secondary' and 'P5/6' stand
 * for several levels that share one answer.
 */
export type Level = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P5/6' | 'Primary' | 'Lower Sec' | 'Upper Sec' | 'Secondary' | 'Pre-U' | 'Teaching & Assessment';
const LEVELS: Level[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'Lower Sec', 'Upper Sec', 'Pre-U', 'Teaching & Assessment'];

const stageOf = (level: Level): Stage =>
  level === 'Teaching & Assessment' ? 'ta' : level === 'Pre-U' ? 'preu' : level === 'Lower Sec' || level === 'Upper Sec' || level === 'Secondary' ? 'secondary' : 'primary';
/** The primary year, if the level is one */
const yearOf = (level?: Level): number | undefined => (level && /^P[1-6]$/.test(level) ? Number(level[1]) : undefined);
/** The levels a picked level stands for */
const coveredBy = (level: Level): Level[] =>
  level === 'Primary' ? ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
    : level === 'P5/6' ? ['P5', 'P6']
      : level === 'Secondary' ? ['Lower Sec', 'Upper Sec']
        : [level];

const levelOf = (q: string): Level | undefined => {
  if (/\bteaching (&|and) assessment\b/i.test(q)) return 'Teaching & Assessment';
  if (/\bpre-?u(ni(versity)?)?\b|\bjc\b|\bjunior college\b|\bmillennia\b|\bpost[- ]sec(ondary)?\b/i.test(q)) return 'Pre-U';
  const p = q.match(/\b(?:p|pri|primary)\s*([1-6])\b/i);
  if (p) return `P${p[1]}` as Level;
  const s = q.match(/\b(?:s|sec|secondary)\s*([1-5])\b/i);
  if (s) return Number(s[1]) <= 2 ? 'Lower Sec' : 'Upper Sec';
  if (/\blower sec(ondary)?\b/i.test(q)) return 'Lower Sec';
  if (/\bupper sec(ondary)?\b/i.test(q)) return 'Upper Sec';
  if (/\bsec(ondary)?\b/i.test(q)) return 'Secondary';
  if (/\bprimary\b/i.test(q)) return 'Primary';
  return undefined;
};

interface Parsed {
  level?: Level;
  areas: Area[];
  categories: Focus[];
  sport?: string;
  module?: string;
  part?: string;
  group?: string;
  need?: Need;
}

const parse = (q: string): Parsed => {
  const categories = CATEGORY_WORDS.filter(([, re]) => re.test(q)).map(([f]) => f);
  const sport = SPORTS.find(([, , , re]) => re.test(q))?.[0];
  const module = OE_MODULES.find(([, , re]) => re.test(q))?.[0];
  const part = PEDAGOGY_PARTS.find(([, , re]) => re.test(q))?.[0];
  const chip = (Object.keys(AREA_NAMES) as Area[]).find((a) => AREA_NAMES[a].toLowerCase() === q.trim().toLowerCase());
  const areas = new Set(chip ? [chip] : AREA_WORDS.filter(([, re]) => re.test(q)).map(([a]) => a));
  if (categories.length) areas.add('games');
  if (sport) areas.add(sport === 'track-and-field' ? 'athletics' : 'games');
  if (module) areas.add('outdoor');
  // "Teaching games for understanding" names a pedagogy, not the Games area
  if (part) {
    areas.delete('games');
    areas.add('pedagogy');
  }
  // "Physical activities" and "games" are one area at secondary
  if (areas.has('pa') && areas.has('games')) areas.delete('games');
  return {
    level: levelOf(q),
    areas: [...areas],
    categories,
    sport,
    module,
    part,
    group: SKILL_GROUPS.find(([, re]) => re.test(q))?.[0],
    need: chip || /\bteaching (&|and) assessment\b/i.test(q) ? undefined : NEED_WORDS.find(([, re]) => re.test(q))?.[0],
  };
};

// ── The guide's steps ───────────────────────────────────────────────────────
export const JUST_ANSWER = 'Just answer';
export const MAX_QUESTIONS = 4;

export type GuideStepName = 'level' | 'area' | 'focus' | 'need';

/** What the guide knows, kept on each guide message so the next reply carries on from it */
export interface GuideState {
  level?: Level;
  area?: Area;
  /** A P5/6 Games category, a P1–4 Games skill group, or a secondary OE module */
  focus?: string;
  /** A secondary or Pre-U physical activity (at primary, its games category) */
  sport?: string;
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

/**
 * The same question at a given stage: "games" and "athletics" are Physical
 * Activities at secondary and Pre-U, a sport is its games category at primary,
 * and an area the stage doesn't have is dropped so it is asked again.
 */
const atStage = (s: GuideState): GuideState => {
  if (!s.level) return s;
  const stage = stageOf(s.level);
  if (stage === 'primary') {
    if (s.area === 'pa') return { ...s, area: s.sport === 'track-and-field' ? 'athletics' : 'games' };
    if (s.sport === 'track-and-field') return { ...s, area: 'athletics', sport: undefined };
    if (s.sport && !s.focus && SPORT_CATEGORY[s.sport]) return { ...s, focus: SPORT_CATEGORY[s.sport] };
    return s;
  }
  if (s.area === 'games' || s.area === 'athletics') {
    return { ...s, area: 'pa', sport: s.sport ?? (s.area === 'athletics' ? 'track-and-field' : undefined), focus: undefined };
  }
  if (s.area && !STAGE_AREAS[stage].includes(s.area)) return { ...s, area: undefined, focus: undefined };
  return s;
};

/** The section for what is known, or none yet */
const sectionIdFor = (state: GuideState): string | undefined => {
  const s = atStage(state);
  if (!s.level || !s.area) return undefined;
  const stage = stageOf(s.level);
  if (stage === 'ta') {
    if (s.area === 'pedagogy') return pedagogyId(s.focus ?? 'Teaching practices');
    return s.area === 'assessment' ? 'ta-assessment' : s.area === 'glossary' ? 'ta-glossary' : undefined;
  }
  if (stage === 'primary') {
    if (s.area === 'swimming') return 'primary-swimming';
    if (s.area === 'cce') return 'primary-cce';
    if (isCategory(s.focus)) return focusId(s.focus);
    const year = yearOf(s.level);
    if (s.area === 'games' && (s.level === 'P5/6' || (year && year >= 5))) return 'primary-games-overview';
    return year ? levelId(s.area, year) : undefined;
  }
  const prefix = stage === 'secondary' ? 'sec' : 'preu';
  if (s.area === 'pa') return s.sport ? `${prefix}-${s.sport}` : `${prefix}-pa-overview`;
  if (s.area === 'cce') return `${prefix}-cce`;
  if (s.area === 'outdoor') return s.focus ? moduleId(s.focus) : 'sec-oe-overview';
  if (s.area === 'phs') {
    if (stage === 'preu') return 'preu-phs';
    return s.level === 'Lower Sec' ? 'sec-phs-lower' : s.level === 'Upper Sec' ? 'sec-phs-upper' : undefined;
  }
  return undefined;
};

const mismatchFor = (state: GuideState): GuideStep | undefined => {
  const s = atStage(state);
  const year = yearOf(s.level);
  if (!year) return undefined;
  if (isCategory(s.focus) && year < 5) {
    const what = s.sport
      ? `${SPORT_NAME.get(s.sport)} is part of ${FOCUS_NAMES[s.focus].toLowerCase()}, which are`
      : `${FOCUS_NAMES[s.focus]} are`;
    return {
      kind: 'mismatch',
      message: `${what} taught from Primary 5 in the syllabus. At P${year}, Games and Sports covers the basic skills of sending and receiving.`,
      choices: [label(focusId(s.focus)), label(levelId('games', year))],
    };
  }
  if (s.area === 'athletics' && year < 4) {
    return {
      kind: 'mismatch',
      message: `Athletics is taught from Primary 4 in the syllabus. At P${year}, running, jumping and throwing are learnt through Dance, Games and Sports, and Gymnastics.`,
      choices: [label(levelId('athletics', 4)), label(levelId('games', year))],
    };
  }
  return undefined;
};

/** One chip for several levels that lead to the same section */
const groupLabel = (levels: Level[]): Level => {
  if (levels.length === 1) return levels[0];
  if (levels.join() === 'P5,P6') return 'P5/6';
  return stageOf(levels[0]) === 'primary' ? 'Primary' : 'Secondary';
};

/**
 * The level chips worth asking: levels the question could still be about,
 * grouped by the section each leads to, so a chip only appears if it changes
 * the answer. Before the area is known every level is offered.
 */
const levelChoices = (s: GuideState): Level[] => {
  const candidates = s.level ? coveredBy(s.level) : LEVELS;
  if (!s.area) return candidates;
  const groups = new Map<string, Level[]>();
  for (const level of candidates) {
    const at = { ...s, level };
    if (mismatchFor(at)) continue;
    const id = sectionIdFor(at);
    const stage = stageOf(level);
    // An area the stage doesn't have; or the same answer at one stage but its level matters for the next step
    if (!id && !(atStage(at).area && STAGE_AREAS[stage].includes(atStage(at).area!))) continue;
    const key = id ?? level;
    groups.set(key, [...(groups.get(key) ?? []), level]);
  }
  return [...groups.values()].map(groupLabel);
};

const keep = (s: GuideState): GuideState => ({ level: s.level, area: s.area, focus: s.focus, sport: s.sport, need: s.need, asked: s.asked });

const answer = (state: GuideState): GuideStep => {
  const s = atStage(state);
  const id = sectionIdFor(s);
  const section = (id && SECTIONS.get(id)) || SECTIONS.get('syllabus-overview');
  if (!section) return UNPLACED;
  const focus = s.focus && !isCategory(s.focus) && s.area === 'games' ? s.focus : undefined;
  return { kind: 'section', request: { section, need: s.need, focus }, state: { ...keep(s), sectionId: section.id } };
};

const ask = (s: GuideState, step: GuideStepName, prompt: string, choices: string[]): GuideStep => ({
  kind: 'ask',
  step,
  prompt,
  choices: [...choices, JUST_ANSWER],
  state: { ...keep(s), asked: s.asked + 1, step },
});

/** The next question, or the answer once nothing left would narrow it */
const next = (state: GuideState): GuideStep => {
  const mismatch = mismatchFor(state);
  if (mismatch) return mismatch;
  let s = atStage(state);
  if (s.asked >= MAX_QUESTIONS) return answer(s);

  const levels = levelChoices(s);
  if (levels.length === 1 && levels[0] !== s.level) s = atStage({ ...s, level: levels[0] });
  if (levels.length > 1) return ask(s, 'level', 'Which level are you planning for?', levels);
  if (!s.level) return answer(s);

  const stage = stageOf(s.level);
  if (!s.area) {
    const year = yearOf(s.level);
    const areas = STAGE_AREAS[stage].filter((a) => a !== 'athletics' || !year || year >= 4);
    return ask(s, 'area', 'Which learning area?', areas.map((a) => AREA_NAMES[a]));
  }
  if (stage === 'primary' && s.area === 'games' && !s.focus) {
    const year = yearOf(s.level);
    if (s.level === 'P5/6' || (year && year >= 5)) return ask(s, 'focus', 'Which games category?', Object.values(FOCUS_NAMES));
    if (year) return ask(s, 'focus', 'Which skills?', SKILL_GROUPS.map(([g]) => g));
  }
  if (stage !== 'primary' && s.area === 'pa' && !s.sport) {
    return ask(s, 'focus', 'Which physical activity?', SPORTS.map(([, name]) => name));
  }
  if (stage === 'ta' && s.area === 'pedagogy' && !s.focus) {
    return ask(s, 'focus', 'Which part of pedagogy?', PEDAGOGY_PARTS.map(([part]) => part));
  }
  if (stage === 'secondary' && s.area === 'outdoor' && !s.focus) {
    return ask(s, 'focus', 'Which Outdoor Education module?', OE_MODULES.map(([m]) => m));
  }
  if (!s.need && stage !== 'ta') return ask(s, 'need', 'What do you need?', [...NEEDS]);
  return answer(s);
};

/** Fill what the message says into what is known; a new level or area starts a new topic */
const merge = (s: GuideState, p: Parsed): GuideState => {
  const area = p.areas.length === 1 ? p.areas[0] : s.area;
  const level = p.level ?? s.level;
  const sameArea = area === s.area || (s.area === 'pa' && (area === 'games' || area === 'athletics'));
  const changedTopic = level !== s.level || !sameArea;
  const focus = p.categories.length === 1 ? p.categories[0]
    : p.module ? p.module
      : p.part ? p.part
      : (area === 'games' || area === 'pa') && p.group && !p.sport ? p.group
        : sameArea && !p.sport ? s.focus : undefined;
  const mergedArea = sameArea && s.area ? s.area : area;
  return {
    level: mergedArea && STAGE_AREAS.ta.includes(mergedArea) ? 'Teaching & Assessment' : level,
    area: mergedArea,
    focus,
    sport: p.sport ?? (sameArea ? s.sport : undefined),
    need: p.need ?? s.need,
    asked: changedTopic && s.sectionId ? 0 : s.asked,
  };
};

const says = (p: Parsed) => p.level !== undefined || p.areas.length > 0 || !!p.need || !!p.group;

/**
 * One step of the guide for a teacher's message. `previous` is the guide state
 * on the last bot message, if it was a guide question or a guide answer.
 */
export const guideStep = (text: string, saved?: GuideState): GuideStep => {
  // Chats saved before secondary was added kept the primary year as a number
  const previous = saved && typeof saved.level === 'number' ? { ...saved, level: `P${saved.level}` as Level } : saved;
  const parsed = parse(text);
  // Two areas named: ask which, rather than guess
  const twoAreas = parsed.categories.length > 1 || parsed.areas.length > 1;
  const p: Parsed = twoAreas ? { ...parsed, areas: [], categories: [], sport: undefined, module: undefined, part: undefined } : parsed;
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
    // A broad new question ("what should I teach?") starts the questions again
    if (p.level === undefined && p.areas.length === 0 && SYLLABUS_INTENT.test(text)) return guideStep(text);
    if (p.level === undefined && p.areas.length === 0) {
      return answer({ ...previous, need: p.need ?? previous.need, focus: p.group && previous.area === 'games' ? p.group : previous.focus });
    }
    return next(merge(previous, p));
  }

  // A new message
  if (!twoAreas && p.level === undefined && p.areas.length === 0 && (isSkillQuestion || !(p.need || SYLLABUS_INTENT.test(text)))) {
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
