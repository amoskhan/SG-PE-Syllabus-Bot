import { PE_SYLLABUS_TEXT } from './syllabusData';

// Normalize CRLF → LF so boundary indexOf checks work on Windows-saved files.
const SYLLABUS_TEXT = PE_SYLLABUS_TEXT.replace(/\r\n/g, '\n');

// Default cap for large level sections. Overview sub-sections are much smaller
// and don't need a large cap.
const SECTION_CAP = 80_000;

// These markers uniquely identify the start of each section's *content* (not the TOC entry).
// Primary and Secondary are split into Overview + LearningOutcomes because the raw LOs
// start deep into those sections (primary LOs at ~22KB in; secondary LOs at ~79KB in).
// Pointing 'primary'/'secondary' directly at the LOs means keyword matches immediately
// return the actual learning content instead of framework prose.
const SECTION_BOUNDARIES: Array<{ key: string; start: string; end: string; cap?: number }> = [
  {
    key: 'preamble',
    start: 'PREAMBLE\nPhysical Education and Sports Development Framework',
    end: '1. INTRODUCTION\n1.1 Curriculum Framework',
  },
  {
    key: 'introduction',
    start: '1. INTRODUCTION\n1.1 Curriculum Framework',
    end: '2. PRIMARY LEVEL SYLLABUS CONTENT\n2.1 Overview',
  },
  // Overview prose (framework, content organisation, time allocation) — small, no cap needed
  {
    key: 'primaryOverview',
    start: '2. PRIMARY LEVEL SYLLABUS CONTENT\n2.1 Overview',
    end: 'LEARNING OUTCOMES\nPRIMARY 1 – DANCE',
    cap: 25_000,
  },
  // Actual P1–P6 learning outcomes for all learning areas
  {
    key: 'primary',
    start: 'LEARNING OUTCOMES\nPRIMARY 1 – DANCE',
    end: '3. SECONDARY LEVEL SYLLABUS CONTENT\n3.1 Overview',
  },
  // Overview prose for secondary — large (~79KB), cap tightly
  {
    key: 'secondaryOverview',
    start: '3. SECONDARY LEVEL SYLLABUS CONTENT\n3.1 Overview',
    end: 'LEARNING OUTCOMES\nSECONDARY 1',
    cap: 25_000,
  },
  // Actual Sec 1–4 learning outcomes — fits within 80KB cap
  {
    key: 'secondary',
    start: 'LEARNING OUTCOMES\nSECONDARY 1',
    end: '4. PRE-UNIVERSITY LEVEL SYLLABUS CONTENT\n4.1 Overview',
  },
  {
    key: 'preUniversity',
    start: '4. PRE-UNIVERSITY LEVEL SYLLABUS CONTENT\n4.1 Overview',
    end: 'PEDAGOGY\n\nSINGAPORE CURRICULUM PHILOSOPHY',
  },
  {
    key: 'pedagogy',
    start: 'PEDAGOGY\n\nSINGAPORE CURRICULUM PHILOSOPHY',
    end: 'ASSESSMENT\n\nPURPOSE',
  },
  {
    key: 'assessment',
    start: 'ASSESSMENT\n\nPURPOSE',
    end: 'GLOSSARY\n\nThe definitions',
  },
  {
    key: 'glossary',
    start: 'GLOSSARY\n\nThe definitions',
    end: '',
  },
];

// Maps section keys to the keywords that trigger them.
const KEYWORD_MAP: Record<string, string[]> = {
  preamble: ['preamble', 'rationale', 'purpose of pe', 'why pe', 'vision', 'framework overview'],
  introduction: [
    'introduction', 'curriculum framework', 'syllabus design', '21st century',
    'doe', 'desired outcomes', 'curriculum overview', 'what is pe',
    // "learning outcomes" alone (no level specified) → return intro so AI asks which level
    'learning outcome', 'learning outcomes',
  ],
  primaryOverview: [
    'primary overview', 'primary curriculum', 'content organisation', 'primary framework',
    'primary structure',
  ],
  primary: [
    'primary', ' p1', ' p2', ' p3', ' p4', ' p5', ' p6',
    'pri 1', 'pri 2', 'pri 3', 'pri 4', 'pri 5', 'pri 6',
    'primary 1', 'primary 2', 'primary 3', 'primary 4', 'primary 5', 'primary 6',
    'primary school', 'primary level',
    // Learning areas taught at primary — route directly to primary LOs
    'athletics', 'dance', 'gymnastics', 'swimming',
    'games and sports', 'striking', 'net barrier', 'invasion',
    'fundamental motor', 'locomotor', 'manipulative',
    'outdoor education', 'outdoor ed',
  ],
  secondaryOverview: [
    'secondary overview', 'secondary curriculum', 'secondary framework', 'secondary structure',
  ],
  secondary: [
    'secondary', ' sec ', ' s1', ' s2', ' s3', ' s4',
    'lower secondary', 'upper secondary', 'secondary school', 'secondary level',
    'express', 'normal academic', 'normal technical',
  ],
  preUniversity: [
    'pre-university', 'pre university', ' jc', 'junior college',
    'jc1', 'jc2', 'a level', 'a-level', 'pre-u', 'preu',
  ],
  pedagogy: [
    'pedagogy', 'pedagogical', 'teaching approach', 'instructional approach',
    'teach', 'lesson plan', 'learning experience', 'methodology', 'how to teach',
    'differentiated', 'inquiry', 'cooperative learning',
  ],
  assessment: [
    'assessment', 'assess', 'grading', 'evaluate', 'evaluation',
    'rubric', 'test', 'marking', 'summative', 'formative',
    'performance task', 'how to grade', 'how to mark',
  ],
  glossary: [
    'glossary', 'define ', 'definition', 'meaning of', 'what does',
    'what is a ', 'terminology', 'term',
  ],
};

function extractSection(start: string, end: string, cap?: number): string {
  const startIdx = SYLLABUS_TEXT.indexOf(start);
  if (startIdx === -1) return '';
  const endIdx = end ? SYLLABUS_TEXT.indexOf(end, startIdx + start.length) : SYLLABUS_TEXT.length;
  const raw = SYLLABUS_TEXT.slice(startIdx, endIdx !== -1 ? endIdx : undefined);
  const limit = cap ?? SECTION_CAP;
  return raw.length > limit ? raw.slice(0, limit) + '\n\n[... section continues — ask a more specific question for further detail ...]' : raw;
}

/**
 * Returns only the syllabus sections relevant to the user's query.
 * Falls back to Preamble + Introduction when no keywords match.
 */
export function getSyllabusContext(query: string): string {
  const q = (' ' + query + ' ').toLowerCase();
  const matched = new Set<string>();

  for (const [section, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(kw => q.includes(kw))) {
      matched.add(section);
    }
  }

  // If a specific level is matched, drop the generic 'introduction' match that
  // "learning outcomes" keywords add — the level section is sufficient.
  const levelSections = new Set(['primary', 'primaryOverview', 'secondary', 'secondaryOverview', 'preUniversity']);
  const hasLevelMatch = [...matched].some(s => levelSections.has(s));
  if (hasLevelMatch) {
    matched.delete('introduction');
  }

  // Default fallback: orientation sections only
  if (matched.size === 0) {
    matched.add('preamble');
    matched.add('introduction');
  }

  const parts: string[] = [];
  for (const boundary of SECTION_BOUNDARIES) {
    if (matched.has(boundary.key)) {
      const text = extractSection(boundary.start, boundary.end, boundary.cap);
      if (text) parts.push(text);
    }
  }

  return parts.join('\n\n---\n\n');
}
