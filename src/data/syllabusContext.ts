import { PE_SYLLABUS_TEXT } from './syllabusData';

const SYLLABUS_TEXT = PE_SYLLABUS_TEXT.replace(/\r\n/g, '\n');

function extractSection(start: string, end: string): string {
  const startIdx = SYLLABUS_TEXT.indexOf(start);
  if (startIdx === -1) return '';
  const endIdx = end ? SYLLABUS_TEXT.indexOf(end, startIdx + start.length) : SYLLABUS_TEXT.length;
  return SYLLABUS_TEXT.slice(startIdx, endIdx !== -1 ? endIdx : undefined);
}

/**
 * Returns the full syllabus content as a single string for injection into
 * the conversation as a reference context message (not the system instruction).
 * Includes all level LOs, pedagogy, assessment, and glossary.
 * Excludes the bulky overview prose sections to keep token count manageable (~82K tokens).
 */
export function getSyllabusContextMessage(): string {
  const sections = [
    extractSection(
      '1. INTRODUCTION\n1.1 Curriculum Framework',
      '2. PRIMARY LEVEL SYLLABUS CONTENT\n2.1 Overview'
    ),
    extractSection(
      'LEARNING OUTCOMES\nPRIMARY 1 \u2013 DANCE',
      '3. SECONDARY LEVEL SYLLABUS CONTENT\n3.1 Overview'
    ),
    extractSection(
      'LEARNING OUTCOMES\nSECONDARY 1',
      '4. PRE-UNIVERSITY LEVEL SYLLABUS CONTENT\n4.1 Overview'
    ),
    extractSection(
      '4. PRE-UNIVERSITY LEVEL SYLLABUS CONTENT\n4.1 Overview',
      'PEDAGOGY\n\nSINGAPORE CURRICULUM PHILOSOPHY'
    ),
    extractSection(
      'PEDAGOGY\n\nSINGAPORE CURRICULUM PHILOSOPHY',
      'ASSESSMENT\n\nPURPOSE'
    ),
    extractSection(
      'ASSESSMENT\n\nPURPOSE',
      'GLOSSARY\n\nThe definitions'
    ),
    extractSection(
      'GLOSSARY\n\nThe definitions',
      ''
    ),
  ].filter(Boolean);

  return `SINGAPORE MOE PE SYLLABUS 2024 — REFERENCE DOCUMENT\n\n${sections.join('\n\n---\n\n')}`;
}
