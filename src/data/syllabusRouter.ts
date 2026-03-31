import { PE_SYLLABUS_TEXT } from './syllabusData';

// Cap injected section size to prevent flooding the context window.
// Each level section is ~200KB raw; we cap at 60KB which covers Overview + Learning Areas summary.
const SECTION_CAP = 60_000;

// These markers uniquely identify the start of each section's *content* (not the TOC entry).
const SECTION_BOUNDARIES: Array<{ key: string; start: string; end: string }> = [
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
  {
    key: 'primary',
    start: '2. PRIMARY LEVEL SYLLABUS CONTENT\n2.1 Overview',
    end: '3. SECONDARY LEVEL SYLLABUS CONTENT\n3.1 Overview',
  },
  {
    key: 'secondary',
    start: '3. SECONDARY LEVEL SYLLABUS CONTENT\n3.1 Overview',
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
    end: '8. REFERENCES',
  },
];

// Maps section keys to the keywords that trigger them.
const KEYWORD_MAP: Record<string, string[]> = {
  preamble: ['preamble', 'rationale', 'purpose of pe', 'why pe', 'vision', 'framework overview'],
  introduction: [
    'introduction', 'curriculum framework', 'syllabus design', '21st century',
    'doe', 'desired outcomes', 'curriculum overview', 'what is pe',
  ],
  primary: [
    'primary', ' p1', ' p2', ' p3', ' p4', ' p5', ' p6',
    'pri 1', 'pri 2', 'pri 3', 'pri 4', 'pri 5', 'pri 6',
    'primary 1', 'primary 2', 'primary 3', 'primary 4', 'primary 5', 'primary 6',
    'primary school', 'primary level',
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

function extractSection(start: string, end: string): string {
  const startIdx = PE_SYLLABUS_TEXT.indexOf(start);
  if (startIdx === -1) return '';
  const endIdx = end ? PE_SYLLABUS_TEXT.indexOf(end, startIdx + start.length) : PE_SYLLABUS_TEXT.length;
  const raw = PE_SYLLABUS_TEXT.slice(startIdx, endIdx !== -1 ? endIdx : undefined);
  return raw.length > SECTION_CAP ? raw.slice(0, SECTION_CAP) + '\n\n[... section continues — ask a more specific question for further detail ...]' : raw;
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

  // Default fallback: orientation sections only
  if (matched.size === 0) {
    matched.add('preamble');
    matched.add('introduction');
  }

  const parts: string[] = [];
  for (const boundary of SECTION_BOUNDARIES) {
    if (matched.has(boundary.key)) {
      const text = extractSection(boundary.start, boundary.end);
      if (text) parts.push(text);
    }
  }

  return parts.join('\n\n---\n\n');
}
