import { describe, expect, it } from 'vitest';
import {
  type GuideState,
  type GuideStep,
  guideStep,
  JUST_ANSWER,
  recentHistory,
  sectionContextMessage,
  sectionPdfLink,
} from './syllabusGuide';
import { getSyllabusContextMessage } from './syllabusContext';

/** Ask, then tap "Just answer" at every question, until the guide answers */
const answerOf = (question: string) => {
  let step = guideStep(question);
  for (let i = 0; step.kind === 'ask' && i < 5; i++) step = guideStep(JUST_ANSWER, step.state);
  if (step.kind !== 'section') throw new Error(`"${question}" did not reach a section (${step.kind})`);
  return step.request;
};
const section = (question: string) => answerOf(question).section;

/** The chips a teacher would tap, one per question, collecting each question the guide asked */
const conversation = (question: string, ...taps: string[]) => {
  const asked: string[] = [];
  let step: GuideStep = guideStep(question);
  for (const tap of taps) {
    if (step.kind !== 'ask') break;
    asked.push(step.step);
    step = guideStep(tap, step.state);
  }
  if (step.kind === 'ask') asked.push(step.step);
  return { asked, step };
};

const asks = (step: GuideStep) => {
  if (step.kind !== 'ask') throw new Error(`expected a question, got ${step.kind}`);
  return step;
};

describe('the sections a question can reach', () => {
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

  it('answers P5/6 Games with no category from the Games overview (printed p. 28)', () => {
    const s = section('P5 games');
    expect(s.printedPage).toBe(28);
    expect(s.text).toMatch(/^Games and Sports\nGames and Sports promote/);
    expect(s.text).not.toContain('PRIMARY 1');
  });
});

describe('asking before answering', () => {
  it('asks a vague syllabus question for the level first, then the area, then what is needed', () => {
    const level = asks(guideStep('What are the learning outcomes?'));
    expect(level.step).toBe('level');
    expect(level.choices).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', JUST_ANSWER]);

    const { asked, step } = conversation('What should I teach?', 'P2', 'Dance', 'Teaching cues');
    expect(asked).toEqual(['level', 'area', 'need']);
    expect(step).toMatchObject({ kind: 'section', request: { need: 'Teaching cues', section: { id: 'p2-dance' } } });
  });

  it('offers only the areas taught at the level', () => {
    expect(asks(guideStep('P2 outcomes')).choices).not.toContain('Athletics');
    expect(asks(guideStep('P4 outcomes')).choices).toContain('Athletics');
  });

  it('offers only P4–P6 for athletics', () => {
    expect(asks(guideStep('athletics lesson ideas')).choices).toEqual(['P4', 'P5', 'P6', JUST_ANSWER]);
  });

  it('asks the games category at P5/6, and the skills at P1–4', () => {
    expect(asks(guideStep('P5 games outcomes')).choices).toEqual([
      'Net-barrier games', 'Striking-fielding games', 'Territorial-invasion games', JUST_ANSWER,
    ]);
    expect(asks(guideStep('P1 games outcomes')).choices).toEqual([
      'Throwing and catching', 'Kicking and trapping', 'Striking', 'Dribbling', JUST_ANSWER,
    ]);
  });

  it('skips the focus question for areas without sub-groups', () => {
    expect(asks(guideStep('P3 dance')).step).toBe('need');
  });

  it('skips questions the typed message already answers', () => {
    expect(guideStep('P5 net-barrier learning outcomes')).toMatchObject({ kind: 'section', request: { need: 'Outcomes' } });
    expect(conversation('lesson ideas for P4 gymnastics').asked).toEqual([]);
  });

  it('skips a question with only one possible answer (one swimming section for all levels)', () => {
    const { asked, step } = conversation('swimming', 'Outcomes');
    expect(asked).toEqual(['need']);
    expect(step).toMatchObject({ kind: 'section', request: { section: { id: 'primary-swimming' } } });
  });

  it('takes a typed reply that answers more than the question asked', () => {
    const level = asks(guideStep('What are the learning outcomes?'));
    expect(guideStep('P4 athletics assessment', level.state)).toMatchObject({
      kind: 'section',
      request: { need: 'Assessment', section: { id: 'p4-athletics' } },
    });
  });

  it('answers straight away on Just answer, from what it knows', () => {
    const area = asks(guideStep('P4 outcomes'));
    expect(guideStep(JUST_ANSWER, area.state).kind).toBe('unplaced'); // no area yet: whole syllabus
    const need = asks(guideStep('P4 dance'));
    expect(guideStep(JUST_ANSWER, need.state)).toMatchObject({ kind: 'section', request: { section: { id: 'p4-dance' } } });
  });

  it('never asks more than 4 questions', () => {
    const { asked, step } = conversation('What is in the syllabus?', 'P1', 'Games and Sports', 'Kicking and trapping', 'Lesson ideas');
    expect(asked).toEqual(['level', 'area', 'focus', 'need']);
    expect(step).toMatchObject({
      kind: 'section',
      request: { section: { id: 'p1-games' }, focus: 'Kicking and trapping', need: 'Lesson ideas' },
    });
    const capped = guideStep('P1 games', { asked: 4, step: 'need' } as GuideState);
    expect(capped.kind).toBe('section');
  });

  it('starts over when a reply ignores the question', () => {
    const level = asks(guideStep('What are the learning outcomes?'));
    expect(guideStep('critical elements of the overhand throw', level.state).kind).toBe('unplaced');
  });
});

describe('something not taught at that level', () => {
  it('explains that net-barrier games start at P5/6 and offers the nearest real sections', () => {
    const r = guideStep('P4 net-barrier outcomes');
    expect(r.kind).toBe('mismatch');
    if (r.kind !== 'mismatch') return;
    expect(r.message).toMatch(/Primary 5/);
    expect(r.choices).toEqual(['P5/6 Net-barrier games', 'P4 Games and Sports']);
  });

  it('explains that athletics starts at P4', () => {
    expect(guideStep('P2 athletics')).toMatchObject({ kind: 'mismatch', choices: ['P4 Athletics', 'P2 Games and Sports'] });
  });

  it('leads each offered chip to a section', () => {
    for (const q of ['P4 net-barrier', 'P2 athletics']) {
      const r = guideStep(q);
      if (r.kind !== 'mismatch') throw new Error(q);
      for (const choice of r.choices) expect(section(choice)).toBeTruthy();
    }
  });
});

describe('follow-ups after an answer', () => {
  const answered = () => {
    const step = guideStep('P5 net-barrier learning outcomes');
    if (step.kind !== 'section') throw new Error(step.kind);
    return step.state;
  };

  it('stays on the same section, with the new need', () => {
    expect(guideStep('and how do I assess that?', answered())).toMatchObject({
      kind: 'section',
      request: { need: 'Assessment', section: { id: 'p5-6-net-barrier' } },
    });
  });

  it('moves to a new level or area named in the follow-up', () => {
    expect(guideStep('what about P6 invasion games?', answered())).toMatchObject({
      kind: 'section',
      request: { need: 'Outcomes', section: { id: 'p5-6-territorial-invasion' } },
    });
    expect(guideStep('and P4 dance?', answered())).toMatchObject({ kind: 'section', request: { section: { id: 'p4-dance' } } });
  });

  it('lets a skill-checklist question leave the syllabus section', () => {
    expect(guideStep('what are the critical elements of the Overhand Throw?', answered()).kind).toBe('unplaced');
  });
});

describe('questions it leaves to the rest of the app', () => {
  it.each([
    'hello',
    'critical elements of the overhand throw',
    'Sec 2 badminton outcomes',
    'P4 dance and gymnastics',
  ])('"%s"', (question) => {
    expect(guideStep(question).kind).toBe('unplaced');
  });
});

describe('what the AI is sent for a section', () => {
  it('is the one section with its title, page and the need, a small part of the whole syllabus', () => {
    const request = answerOf('P5 net-barrier outcomes');
    const context = sectionContextMessage(request);
    expect(context).toContain('Primary 5 and 6 – Net-barrier games');
    expect(context).toContain('p. 36');
    expect(context).toContain('The teacher needs: Outcomes');
    expect(context).toContain(request.section.text);
    expect(context.length).toBeLessThan(getSyllabusContextMessage().length / 10);
  });

  it('names the P1–4 Games focus', () => {
    const { step } = conversation('P2 games', 'Dribbling', 'Lesson ideas');
    if (step.kind !== 'section') throw new Error(step.kind);
    expect(sectionContextMessage(step.request)).toContain('Focus on: Dribbling.');
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
