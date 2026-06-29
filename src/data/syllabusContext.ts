import { PE_SYLLABUS_TEXT } from './syllabusData';

// Normalise line endings once so all searches use \n
const SYLLABUS_TEXT = PE_SYLLABUS_TEXT.replace(/\r\n/g, '\n');

/**
 * Regex-based section extractor — immune to em-dash vs hyphen corruption.
 * The PDF parser stored true Unicode en-dashes (U+2013) in the TypeScript
 * source, but earlier code searched for a plain hyphen (-) and never matched.
 *
 * Instead of requiring an exact separator character, we use a pattern that
 * matches any dash variant (-, –, —, ?) between the level number and subject.
 */
function extractSection(startPattern: RegExp | string, endPattern: RegExp | string): string {
  let startIdx: number;
  let matchLength: number;

  if (typeof startPattern === 'string') {
    startIdx = SYLLABUS_TEXT.indexOf(startPattern);
    matchLength = startPattern.length;
  } else {
    const m = SYLLABUS_TEXT.match(startPattern);
    if (!m || m.index === undefined) return '';
    startIdx = m.index;
    matchLength = m[0].length;
  }

  if (startIdx === -1) return '';

  let endIdx: number;
  if (!endPattern) {
    endIdx = SYLLABUS_TEXT.length;
  } else if (typeof endPattern === 'string') {
    endIdx = SYLLABUS_TEXT.indexOf(endPattern, startIdx + matchLength);
  } else {
    const m = endPattern.exec(SYLLABUS_TEXT.slice(startIdx + matchLength));
    endIdx = m ? startIdx + matchLength + (m.index ?? 0) : SYLLABUS_TEXT.length;
  }

  return SYLLABUS_TEXT.slice(startIdx, endIdx !== -1 ? endIdx : undefined);
}

/**
 * Returns the full syllabus content as a single string for injection into
 * the conversation as a reference context message (not the system instruction).
 * Includes all level LOs, pedagogy, assessment, and glossary.
 *
 * IMPORTANT: syllabusData.ts stores true Unicode en-dashes (U+2013) from the
 * original PDF. All section markers now use regex patterns (/.../s) to match
 * any dash variant, making this robust against future re-imports or encoding
 * changes.
 */
export function getSyllabusContextMessage(): string {
  const sections = [
    // Introduction & curriculum framework
    extractSection(
      '1. INTRODUCTION\n1.1 Curriculum Framework',
      /\n2\. PRIMARY LEVEL SYLLABUS CONTENT\n2\.1 Overview/
    ),

    // All primary level LOs (Games & Sports, Dance, Athletics, Gymnastics, Swimming, OE, PHS)
    // Regex handles any dash variant between level number and subject name.
    extractSection(
      /LEARNING OUTCOMES\nPRIMARY 1\s*[–—\-?]\s*GAMES AND SPORTS/,
      /\n3\. SECONDARY LEVEL SYLLABUS CONTENT\n3\.1 Overview/
    ),

    // Secondary LOs
    extractSection(
      /LEARNING OUTCOMES\nSECONDARY 1/,
      /\n4\. PRE-UNIVERSITY LEVEL SYLLABUS CONTENT\n4\.1 Overview/
    ),

    // Pre-University LOs
    extractSection(
      /4\. PRE-UNIVERSITY LEVEL SYLLABUS CONTENT\n4\.1 Overview/,
      /\nPEDAGOGY\n\nSINGAPORE CURRICULUM PHILOSOPHY/
    ),

    // Pedagogy
    extractSection(
      /PEDAGOGY\n\nSINGAPORE CURRICULUM PHILOSOPHY/,
      /\nASSESSMENT\n\nPURPOSE/
    ),

    // Assessment
    extractSection(
      /ASSESSMENT\n\nPURPOSE/,
      /\nGLOSSARY\n\nThe definitions/
    ),

    // Glossary
    extractSection(
      /GLOSSARY\n\nThe definitions/,
      ''
    ),
  ].filter(Boolean);

  return `SINGAPORE MOE PE SYLLABUS 2024 — REFERENCE DOCUMENT\n\n${sections.join('\n\n---\n\n')}`;
}
