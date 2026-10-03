import { Sender, type Message } from '../types';

// Names and icons for chats in the sidebar. A chat is named after what it
// turned out to be about (the syllabus section, the skill analysed), not the
// first 30 characters typed. Pure functions so the rules are tested
// (chatTitles.test.ts).

export type ChatKind = 'syllabus' | 'video' | 'web' | 'chat';

export const CHAT_ICONS: Record<ChatKind, string> = {
  syllabus: '📘',
  video: '🎥',
  web: '🔎',
  chat: '💬',
};

const MAX_TITLE = 60;
const WEB_PREFIX = /^🔎 Search the web:\s*/;

/** The teacher's question as a title: first line, capitalised, shortened at a word */
export const questionTitle = (text: string): string => {
  const line = text.replace(WEB_PREFIX, '').split('\n')[0].trim();
  const title = line.charAt(0).toUpperCase() + line.slice(1);
  if (title.length <= MAX_TITLE) return title;
  const cut = title.slice(0, MAX_TITLE);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : MAX_TITLE).trimEnd()}…`;
};

/** Titles the app made itself, which a better one may replace; a teacher's own title is kept */
const isAutoTitle = (current: string, firstQuestion: string) =>
  ['New Chat', 'New Conversation', 'Media Analysis'].includes(current)
  || current.startsWith('Analysis: ')
  // Before this, a chat was titled with its first 30 characters
  || current === firstQuestion.substring(0, 30) + (firstQuestion.length > 30 ? '...' : '')
  || current === questionTitle(firstQuestion);

export const chatTitle = ({ current, firstQuestion, topic, need, skill, web }: {
  current: string;
  firstQuestion: string;
  /** The syllabus section's short name */
  topic?: string;
  need?: string;
  /** The skill a video analysis graded */
  skill?: string;
  web?: boolean;
}): string => {
  if (!isAutoTitle(current, firstQuestion)) return current;
  if (topic) return need ? `${topic} · ${need}` : topic;
  if (skill) return `${skill} analysis`;
  const question = questionTitle(firstQuestion);
  if (!question) return current;
  return web ? `${question} (web)` : question;
};

/**
 * The title to show for a chat, worked out from its messages, so chats saved
 * before titles had topics read as well as new ones.
 */
export const displayTitle = (title: string, messages: Message[], topicOf: (sectionId: string) => string | undefined): string => {
  const answer = messages.find((m) => m.syllabusSectionId);
  return chatTitle({
    current: title || 'New Chat',
    firstQuestion: messages.find((m) => m.sender === Sender.USER)?.text ?? '',
    topic: answer?.syllabusSectionId ? topicOf(answer.syllabusSectionId) : undefined,
    need: answer?.guide?.need,
    skill: messages.find((m) => m.predictedSkill)?.predictedSkill,
    web: messages.some((m) => m.fromWebSearch),
  });
};

export const hasTeacherMessage =(messages: Message[]) => messages.some((m) => m.sender === Sender.USER);

/** What a chat is: a video analysis, a syllabus answer, a web search, or anything else */
export const chatKind = (messages: Message[]): ChatKind => {
  if (messages.some((m) => m.hasMedia || (m.poseData && m.poseData.length > 0))) return 'video';
  if (messages.some((m) => m.syllabusSectionId)) return 'syllabus';
  if (messages.some((m) => m.fromWebSearch)) return 'web';
  return 'chat';
};

/** "3 Oct · 23:35" */
export const shortChatDate = (date: Date): string => {
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })} · ${time}`;
};
