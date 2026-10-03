import { describe, expect, it } from 'vitest';
import { recentHistory, resolveSyllabusQuestion, sectionContextMessage, sectionPdfLink } from './syllabusGuide';
import { getSyllabusContextMessage } from './syllabusContext';

const section = (question: string) => {
  const r = resolveSyllabusQuestion(question);
  if (r.kind !== 'section') throw new Error(`"${question}" did not resolve to a section (${r.kind})`);
  return r.section;
};

describe('resolveSyllabusQuestion: a specific Primary question', () => {
  it('finds the P1 Games and Sports outcomes on printed p. 32 (PDF p. 37)', () => {
    const s = section('What are the P1 games and sports learning outcomes?');
    expect(s.printedPage).toBe(32);
    expect(s.pdfPage).toBe(37);
    expect(s.text).toContain('Roll using the underhand movement pattern');
    expect(s.text).not.toContain('PRIMARY 2');
  });

  // Printed pages read off the 2024 PDF
  it.each([
    ['P4 athletics outcomes', 20, 'PRIMARY 4'],
    ['Primary 5 athletics', 21, 'PRIMARY 5'],
    ['p6 athletics', 22, 'PRIMARY 6'],
    ['P1 dance learning outcomes', 25, 'PRIMARY 1'],
    ['P2 games and sports', 33, 'PRIMARY 2'],
    ['P3 games', 34, 'PRIMARY 3'],
    ['P4 games outcomes', 35, 'PRIMARY 4'],
    ['P5 net-barrier learning outcomes', 36, 'NET-BARRIER'],
    ['P6 striking fielding games', 43, 'STRIKING-FIELDING'],
    ['P5 invasion games', 47, 'TERRITORIAL-INVASION'],
    ['P1 gymnastics outcomes', 71, 'PRIMARY 1'],
    ['P3 swimming', 79, 'SWIMMING'],
    ['P1 outdoor education', 86, 'PRIMARY 1'],
    ['P1 PHS outcomes', 94, 'PRIMARY 1'],
    ['P4 CCE', 100, 'Character and Citizenship'],
  ])('"%s" → printed p. %i', (question, printedPage, heading) => {
    const s = section(question);
    expect(s.printedPage).toBe(printedPage);
    expect(s.pdfPage).toBe(printedPage + 5);
    expect(s.text).toContain(heading);
  });

  it("gives the section in the syllabus's words, without page footers or stamps", () => {
    const s = section('P5 net-barrier outcomes');
    expect(s.text).not.toMatch(/OFFICIAL \(CLOSED\)/);
    expect(s.text).not.toMatch(/\n3[6-9]\n/);
    expect(s.text).not.toContain('STRIKING-FIELDING');
  });

  it.each([
    ['P6 athletics', 'Dance develops'],
    ['P6 dance', 'Games and Sports promote'],
    ['P6 invasion games', 'Gymnastics enhances'],
    ['P6 gymnastics', 'Swimming develops'],
    ['P6 swimming', 'Outdoor Education engages'],
    ['P6 outdoor education', 'Physical Health and Safety stimulates'],
  ])("ends %s before the next area's introduction", (question, nextArea) => {
    expect(section(question).text).not.toContain(nextArea);
  });

  it('treats P3 games, which spans two pages, as one section ending before P4', () => {
    const s = section('P3 games');
    expect(s.text.match(/PRIMARY 3\s*[–-]\s*GAMES AND SPORTS/g)?.length).toBe(2);
    expect(s.text).not.toMatch(/PRIMARY 4\s*[–-]\s*GAMES/);
  });
});

describe('resolveSyllabusQuestion: something not taught at that level', () => {
  it('explains that net-barrier games start at P5/6 and offers the nearest real sections', () => {
    const r = resolveSyllabusQuestion('P4 net-barrier outcomes');
    expect(r.kind).toBe('mismatch');
    if (r.kind !== 'mismatch') return;
    expect(r.message).toMatch(/Primary 5/);
    expect(r.choices).toEqual(['P5/6 Net-barrier games', 'P4 Games and Sports']);
  });

  it('explains that athletics starts at P4', () => {
    const r = resolveSyllabusQuestion('P2 athletics');
    expect(r).toMatchObject({ kind: 'mismatch', choices: ['P4 Athletics', 'P2 Games and Sports'] });
  });

  it('resolves each offered chip to a real section', () => {
    for (const q of ['P4 net-barrier', 'P2 athletics']) {
      const r = resolveSyllabusQuestion(q);
      if (r.kind !== 'mismatch') throw new Error(q);
      for (const choice of r.choices) expect(resolveSyllabusQuestion(choice).kind).toBe('section');
    }
  });
});

describe('resolveSyllabusQuestion: questions it leaves to the whole syllabus', () => {
  it.each([
    'What are the learning outcomes?', // no level, no area
    'P4 outcomes', // no area
    'games and sports outcomes', // no level
    'P5 games', // P5/6 games need a category
    'P4 dance and gymnastics', // two areas
    'Sec 2 badminton outcomes', // secondary
  ])('"%s"', (question) => {
    expect(resolveSyllabusQuestion(question).kind).toBe('unplaced');
  });
});

describe('what the AI is sent for a section', () => {
  it('is the one section with its title and page, a small part of the whole syllabus', () => {
    const s = section('P5 net-barrier outcomes');
    const context = sectionContextMessage(s);
    expect(context).toContain('Primary 5 and 6 – Net-barrier games');
    expect(context).toContain('p. 36');
    expect(context).toContain(s.text);
    expect(context.length).toBeLessThan(getSyllabusContextMessage().length / 10);
  });

  it('keeps only the last 6 messages of the conversation', () => {
    const history = Array.from({ length: 10 }, (_, i) => `message ${i + 1}`);
    expect(recentHistory(history)).toEqual(['message 5', 'message 6', 'message 7', 'message 8', 'message 9', 'message 10']);
    expect(recentHistory(['only one'])).toEqual(['only one']);
  });

  it('links to the hosted PDF at the right page', () => {
    expect(sectionPdfLink(section('P1 games'))).toBe('/syllabus/pe-syllabus-2024.pdf#page=37');
  });
});
