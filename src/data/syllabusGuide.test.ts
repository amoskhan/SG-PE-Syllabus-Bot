import { describe, expect, it } from 'vitest';
import {
  type GuideState,
  type GuideStep,
  guideStep,
  JUST_ANSWER,
  recentHistory,
  sectionContextMessage,
  sectionPdfLink,
  takeNotInSyllabus,
} from './syllabusGuide';
import { PE_SYLLABUS_TEXT } from './syllabusData';

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
    expect(level.choices).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'Lower Sec', 'Upper Sec', 'Pre-U', 'Teaching & Assessment', JUST_ANSWER]);

    const { asked, step } = conversation('What should I teach?', 'P2', 'Dance', 'Teaching cues');
    expect(asked).toEqual(['level', 'area', 'need']);
    expect(step).toMatchObject({ kind: 'section', request: { need: 'Teaching cues', section: { id: 'p2-dance' } } });
  });

  it('offers only the areas taught at the level', () => {
    expect(asks(guideStep('P2 outcomes')).choices).not.toContain('Athletics');
    expect(asks(guideStep('P4 outcomes')).choices).toContain('Athletics');
  });

  it('offers only P4–P6 for athletics', () => {
    expect(asks(guideStep('athletics lesson ideas')).choices).toEqual(['P4', 'P5', 'P6', 'Secondary', 'Pre-U', JUST_ANSWER]);
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
    // No area yet: the syllabus's introduction
    expect(guideStep(JUST_ANSWER, area.state)).toMatchObject({ kind: 'section', request: { section: { id: 'syllabus-overview' } } });
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

  it('starts the questions again for a broad new question', () => {
    const tgfu = guideStep('what is TGfU?');
    if (tgfu.kind !== 'section') throw new Error(tgfu.kind);
    expect(asks(guideStep('what should i teach?', tgfu.state)).step).toBe('level');
  });

  it('lets a skill-checklist question leave the syllabus section', () => {
    expect(guideStep('what are the critical elements of the Overhand Throw?', answered()).kind).toBe('unplaced');
  });
});

describe('questions it leaves to the rest of the app', () => {
  it.each([
    'hello',
    'critical elements of the overhand throw',
  ])('"%s"', (question) => {
    expect(guideStep(question).kind).toBe('unplaced');
  });
});

describe('Secondary and Pre-U', () => {
  // Printed pages read off the 2024 PDF
  it.each([
    ['Sec 2 badminton outcomes', 116, 'Badminton'],
    ['Sec 3 mini tennis', 118, 'Mini/Paddle Tennis'],
    ['secondary table tennis', 120, 'Table Tennis'],
    ['S1 football', 133, 'Football'],
    ['upper sec ultimate frisbee', 139, 'Ultimate Frisbee'],
    ['secondary track and field', 142, 'Track and Field'],
    ['Sec 1 navigation', 150, 'SECONDARY 1 – NAVIGATION'],
    ['lower sec PHS', 157, 'SECONDARY 1 – PHYSICAL HEALTH AND SAFETY'],
    ['Sec 4 CCE', 161, 'Character and Citizenship'],
    ['JC badminton', 175, 'Badminton'],
    ['pre-u ultimate frisbee', 198, 'Ultimate Frisbee'],
    ['JC PHS', 206, 'LEARNING OUTCOMES'],
    ['pre-u CCE', 207, 'Character and Citizenship'],
  ])('"%s" → printed p. %i', (question, printedPage, heading) => {
    const s = section(question);
    expect(s.printedPage).toBe(printedPage);
    expect(s.pdfPage).toBe(printedPage + 5);
    expect(s.text).toContain(heading);
  });

  it.each([
    ['upper sec ultimate frisbee', 'Track and Field'],
    ['secondary track and field', 'Outdoor Education engages'],
    ['Sec 1 navigation', 'COOKING'],
    ['Sec 1 trip planning', 'Physical Health and Safety support'],
    ['lower sec PHS', 'SECONDARY 3'],
    ['Sec 4 CCE', 'PRE-UNIVERSITY'],
    ['JC track and field', 'Physical Health and Safety stimulates'],
    ['pre-u CCE', 'PEDAGOGY'],
  ])('ends %s before the next section', (question, next) => {
    expect(section(question).text).not.toContain(next);
  });

  it('keeps both Sec 1 and Sec 2/3 in an Outdoor Education module', () => {
    const s = section('Sec 2 shelter building');
    expect(s.text).toContain('SECONDARY 1 – SHELTER BUILDING');
    expect(s.text).toContain('SECONDARY 2 AND/OR 3 – SHELTER BUILDING');
  });

  it('asks the physical activity for secondary games, and the module for secondary OE', () => {
    const sport = asks(guideStep('Sec 2 games lesson ideas'));
    expect(sport.prompt).toBe('Which physical activity?');
    expect(sport.choices).toContain('Netball');
    expect(asks(guideStep('Sec 2 outdoor education')).choices).toEqual([
      'Navigation', 'Outdoor cooking', 'Shelter building', 'Trip planning', JUST_ANSWER,
    ]);
  });

  it('asks only the levels that change the answer', () => {
    // One section per sport for all of secondary, and one at P5/6
    expect(asks(guideStep('badminton outcomes')).choices).toEqual(['P5/6', 'Secondary', 'Pre-U', JUST_ANSWER]);
    // PHS differs between lower and upper secondary
    expect(asks(guideStep('secondary PHS')).choices).toEqual(['Lower Sec', 'Upper Sec', JUST_ANSWER]);
    // One CCE section per stage
    expect(asks(guideStep('CCE outcomes')).choices).toEqual(['Primary', 'Secondary', 'Pre-U', JUST_ANSWER]);
  });

  it('answers secondary badminton from the badminton section and P5 badminton from Net-barrier games', () => {
    expect(section('Sec 2 badminton outcomes').id).toBe('sec-badminton');
    expect(section('P5 badminton outcomes').id).toBe('p5-6-net-barrier');
  });

  it('asks the learning area again when the stage does not have the one named', () => {
    expect(asks(guideStep('Pre-U outdoor education')).choices).toEqual([
      'Physical Activities', 'Physical Health and Safety', 'Character and Citizenship Education', JUST_ANSWER,
    ]);
  });

  it('explains that badminton at P3 is taught through net-barrier games from P5', () => {
    const r = guideStep('P3 badminton');
    expect(r).toMatchObject({ kind: 'mismatch', choices: ['P5/6 Net-barrier games', 'P3 Games and Sports'] });
    if (r.kind === 'mismatch') expect(r.message).toMatch(/^Badminton is part of net-barrier games/);
  });

  it('carries on from a chat saved when levels were numbers', () => {
    const saved = { level: 5, area: 'games', focus: 'net-barrier', need: 'Outcomes', asked: 0, sectionId: 'p5-6-net-barrier' } as unknown as GuideState;
    expect(guideStep('and how do I assess that?', saved)).toMatchObject({
      kind: 'section',
      request: { need: 'Assessment', section: { id: 'p5-6-net-barrier' } },
    });
  });

  it('follows up from a primary answer to the same sport at secondary', () => {
    const p5 = guideStep('P5 basketball outcomes');
    if (p5.kind !== 'section') throw new Error(p5.kind);
    expect(guideStep('and for Sec 3?', p5.state)).toMatchObject({ kind: 'section', request: { section: { id: 'sec-basketball' } } });
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
    expect(context.length).toBeLessThan(PE_SYLLABUS_TEXT.length / 20);
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

describe('when the syllabus does not cover the question', () => {
  it("takes the AI's tag off the answer and offers a web search", () => {
    expect(takeNotInSyllabus("The syllabus doesn't cover pickleball.\n[[NOT_IN_SYLLABUS]]")).toEqual({
      text: "The syllabus doesn't cover pickleball.",
      notInSyllabus: true,
    });
  });

  it('leaves an answer without the tag as it is', () => {
    expect(takeNotInSyllabus('1. Roll using the underhand pattern.')).toEqual({
      text: '1. Roll using the underhand pattern.',
      notInSyllabus: false,
    });
  });
});

describe('Teaching & Assessment', () => {
  // Printed pages read off the 2024 PDF
  it.each([
    ['what are the Singapore Teaching Practices?', 211, 'ta-pedagogy-teaching-practices'],
    ['how should I assess PE?', 224, 'ta-assessment'],
    ['glossary', 230, 'ta-glossary'],
  ])('"%s" → printed p. %i', (question, printedPage, id) => {
    const s = section(question);
    expect(s.id).toBe(id);
    expect(s.printedPage).toBe(printedPage);
  });

  it('answers "what is TGfU?" from the Game-Based Approach, without asking anything', () => {
    const step = guideStep('what is TGfU?');
    expect(step).toMatchObject({ kind: 'section', request: { section: { id: 'ta-pedagogy-game-based-approach' } } });
    if (step.kind !== 'section') return;
    expect(step.request.section.text).toMatch(/^Game-Based Approach/);
    expect(step.request.section.text).not.toContain('Place-Responsive Pedagogy');
  });

  it('asks which part of pedagogy, and never the level or the need', () => {
    const part = asks(guideStep('pedagogy'));
    expect(part.prompt).toBe('Which part of pedagogy?');
    expect(part.choices).toContain('Inquiry-based learning');
    expect(part.choices).toHaveLength(13);
    expect(guideStep('Inquiry-based learning', part.state)).toMatchObject({
      kind: 'section',
      request: { section: { id: 'ta-pedagogy-inquiry-based-learning' } },
    });
  });

  it('is a level chip, then offers Pedagogy, Assessment and Glossary', () => {
    const { asked, step } = conversation('What should I teach?', 'Teaching & Assessment', 'Assessment');
    expect(asked).toEqual(['level', 'area']);
    expect(step).toMatchObject({ kind: 'section', request: { section: { id: 'ta-assessment' } } });
    const area = asks(guideStep('Teaching & Assessment', asks(guideStep('What should I teach?')).state));
    expect(area.choices).toEqual(['Pedagogy', 'Assessment', 'Glossary', JUST_ANSWER]);
  });

  it('treats a pedagogy named with a level as Teaching & Assessment', () => {
    expect(section('P4 TGfU').id).toBe('ta-pedagogy-game-based-approach');
  });

  it('keeps "assessment" as a need for a learning area', () => {
    expect(guideStep('P4 dance assessment')).toMatchObject({
      kind: 'section',
      request: { need: 'Assessment', section: { id: 'p4-dance' } },
    });
  });

  it.each([
    ['use of technology in PE', 'ASSESSMENT'],
    ['how should I assess PE?', 'GLOSSARY'],
    ['glossary', 'REFERENCES'],
    ['pre-u CCE', 'PEDAGOGY'],
  ])('ends %s before the next chapter', (question, next) => {
    const text = section(question).text;
    expect(text).not.toContain(next);
    expect(text).not.toMatch(/\n\d\.$/);
  });
});

describe('no more whole-syllabus answers', () => {
  it('asks which area when a question names two', () => {
    const area = asks(guideStep('P4 dance and gymnastics'));
    expect(area.step).toBe('area');
    expect(area.state.level).toBe('P4');
  });

  it('answers "Just answer" with nothing chosen from the introduction', () => {
    const level = asks(guideStep('What are the learning outcomes?'));
    expect(guideStep(JUST_ANSWER, level.state)).toMatchObject({ kind: 'section', request: { section: { id: 'syllabus-overview' } } });
  });
});
