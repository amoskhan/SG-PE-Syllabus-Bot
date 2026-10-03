import { describe, expect, it } from 'vitest';
import { chatKind, chatTitle, displayTitle, hasTeacherMessage, questionTitle, shortChatDate } from './chatTitles';
import { Sender, type Message } from '../types';

const msg = (sender: Sender, text: string, extra: Partial<Message> = {}): Message =>
  ({ id: text, text, sender, timestamp: new Date(), ...extra });
const welcome = msg(Sender.BOT, 'Hello! I am your Singapore PE Syllabus Bot.');

describe('questionTitle', () => {
  it("keeps the teacher's whole question, first letter capitalised", () => {
    expect(questionTitle('what is TGfU?')).toBe('What is TGfU?');
    expect(questionTitle('P5 net-barrier learning outcomes')).toBe('P5 net-barrier learning outcomes');
  });

  it('drops the web-search prefix and anything after the first line', () => {
    expect(questionTitle('🔎 Search the web: pickleball rules\nmore')).toBe('Pickleball rules');
  });

  it('shortens a very long question at a word', () => {
    const title = questionTitle('a '.repeat(10) + 'very long question about the teaching of games for understanding in lower primary classes');
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('chatTitle', () => {
  const first = 'P5 net-barrier learning outcomes';

  it('names a syllabus chat by its topic and need', () => {
    expect(chatTitle({ current: 'New Chat', firstQuestion: first, topic: 'P5/6 Net-barrier', need: 'Outcomes' }))
      .toBe('P5/6 Net-barrier · Outcomes');
    expect(chatTitle({ current: 'New Chat', firstQuestion: 'what is TGfU?', topic: 'Pedagogy · Game-based approach' }))
      .toBe('Pedagogy · Game-based approach');
  });

  it('names a video chat by the skill analysed', () => {
    expect(chatTitle({ current: 'Media Analysis', firstQuestion: 'Analyze this movement', skill: 'Underhand Roll' }))
      .toBe('Underhand Roll analysis');
  });

  it('marks a web search', () => {
    expect(chatTitle({ current: 'New Chat', firstQuestion: '🔎 Search the web: pickleball rules', web: true }))
      .toBe('Pickleball rules (web)');
  });

  it("uses the teacher's question when there is no topic", () => {
    expect(chatTitle({ current: 'New Chat', firstQuestion: 'hello' })).toBe('Hello');
  });

  it('replaces the old cut-off titles', () => {
    expect(chatTitle({ current: 'P5 net-barrier learning outcom...', firstQuestion: first, topic: 'P5/6 Net-barrier', need: 'Outcomes' }))
      .toBe('P5/6 Net-barrier · Outcomes');
  });

  it("keeps a title once it has a topic, and never changes one the teacher typed", () => {
    expect(chatTitle({ current: 'P5/6 Net-barrier · Outcomes', firstQuestion: first, topic: 'Sec Basketball', need: 'Outcomes' }))
      .toBe('P5/6 Net-barrier · Outcomes');
    expect(chatTitle({ current: '5B games lesson', firstQuestion: first, topic: 'P5/6 Net-barrier' })).toBe('5B games lesson');
  });
});

describe('displayTitle (chats saved before titles had topics)', () => {
  const topicOf = (id: string) => ({ 'ta-pedagogy-game-based-approach': 'Pedagogy · Game-based approach' }[id]);

  it('names an old syllabus chat by the section it answered from', () => {
    const messages = [welcome, msg(Sender.USER, 'what is TGFU'), msg(Sender.BOT, 'TGfU is…', { syllabusSectionId: 'ta-pedagogy-game-based-approach' })];
    expect(displayTitle('what is TGFU', messages, topicOf)).toBe('Pedagogy · Game-based approach');
  });

  it('names an old video chat by the skill it found', () => {
    const messages = [welcome, msg(Sender.USER, 'Analyze this movement', { hasMedia: true, predictedSkill: 'Underhand Roll' })];
    expect(displayTitle('Media Analysis', messages, topicOf)).toBe('Underhand Roll analysis');
  });

  it("keeps a chat's own title when there is nothing better", () => {
    expect(displayTitle('🍎🍌 Pair #3 - Overhand Throw', [welcome], topicOf)).toBe('🍎🍌 Pair #3 - Overhand Throw');
  });
});

describe('chatKind', () => {
  it('tells video, syllabus, web and plain chats apart', () => {
    expect(chatKind([welcome, msg(Sender.USER, 'Analyze this movement', { hasMedia: true })])).toBe('video');
    expect(chatKind([welcome, msg(Sender.USER, 'P5 net-barrier'), msg(Sender.BOT, 'Outcomes…', { syllabusSectionId: 'p5-6-net-barrier' })])).toBe('syllabus');
    expect(chatKind([welcome, msg(Sender.USER, 'pickleball'), msg(Sender.BOT, 'From the web…', { fromWebSearch: true })])).toBe('web');
    expect(chatKind([welcome, msg(Sender.USER, 'hello'), msg(Sender.BOT, 'Hi!')])).toBe('chat');
  });
});

describe('hasTeacherMessage', () => {
  it('is false for a chat with only the welcome message', () => {
    expect(hasTeacherMessage([welcome])).toBe(false);
    expect(hasTeacherMessage([welcome, msg(Sender.USER, 'hi')])).toBe(true);
  });
});

describe('shortChatDate', () => {
  it('reads "3 Oct · 23:35"', () => {
    expect(shortChatDate(new Date(2026, 9, 3, 23, 35))).toBe('3 Oct · 23:35');
  });
});
