import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, PROFICIENCY_RUBRIC, SKILL_REFERENCE_IMAGES } from '../../data/fundamentalMovementSkillsData';
import {
  GYMNASTICS_SKILLS_TEXT,
  GYMNASTICS_RUBRIC,
  ALL_GYMNASTICS_SKILLS,
  GYMNASTICS_REFERENCE_IMAGES,
} from '../../data/gymnasticsSkillsData';
import { getSyllabusContextMessage } from '../../data/syllabusContext';
import { getFewShotExamples } from '../../data/skillExamples';
import type { SkillMode } from '../../types';

const VITE_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;
const MODEL_NAME = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-v4-flash';
const SITE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:3000';
const SITE_NAME = 'SG PE Syllabus Bot';

export interface ChatResponse {
  text: string;
  referenceImageURI?: string;
  tokenUsage?: number;
}

const buildSystemInstruction = (skillMode: SkillMode, skillName?: string) => {
  const isGymnastics = skillMode === 'gymnastics';
  const activeSkillsText = isGymnastics ? GYMNASTICS_SKILLS_TEXT : FUNDAMENTAL_MOVEMENT_SKILLS_TEXT;
  const activeRubric = isGymnastics ? GYMNASTICS_RUBRIC : PROFICIENCY_RUBRIC;
  const validNames = isGymnastics ? ALL_GYMNASTICS_SKILLS.join(', ') : Object.keys(SKILL_REFERENCE_IMAGES).join(', ');
  const fewShot = !isGymnastics && skillName ? getFewShotExamples(skillName) : '';

  return `
You are the Singapore PE Syllabus Assistant for MOE Singapore's 2024 PE Syllabus.

RULE 1 - BREVITY
- Keep responses short and direct.
- Use at most 4 sentences unless the user explicitly asks for a full list of outcomes.
- Do not add filler or background.

RULE 2 - ROUTING
- If the message is a syllabus question, use syllabus context only when needed.
- If the message asks for performance criteria, checklist, or how to perform a skill, use the skill checklist and rubric.
- If the message is a casual test or generic chat, answer directly and keep it brief.

RULE 3 - SKILL CRITERIA QUERY
- If the user asks for critical elements, performance criteria, checklist, or how to perform a skill, answer from the skill content above.
- If a specific skill is mentioned, list the criteria and end with [[DISPLAY_REFERENCE: <Exact Skill Name>]].
- If no specific skill is mentioned, offer skill choices using [[SKILL_CHOICES: ...]].

RULE 4 - TEXT ONLY
- This model is for text chat.
- Ignore media analysis requests and keep the response text-based.
- If the user wants movement analysis, tell them to switch to a vision-capable model.

Tone: Professional, concise, Singapore PE context.
`.trim();
};

const isSyllabusQuery = (message: string) => /\b(syllabus|learning outcome|learning outcomes|games & sports|games and sports|athletics|dance|gymnastics|swimming|outdoor education|primary|secondary|pre-university|pe)\b/i.test(message);

const isSkillCriteriaQuery = (message: string) => /\b(critical elements|performance criteria|checklist|how to perform|teach me|how do i perform|movement skill|fundamental movement skill|fms)\b/i.test(message);

const buildMessages = (
  history: { role: string; content: string }[],
  currentMessage: string,
  skillMode: SkillMode,
  skillName?: string,
) => {
  const sanitizedHistory = [...history].filter(msg => typeof msg.content === 'string' && msg.content.trim().length > 0);
  const needsSyllabusContext = isSyllabusQuery(currentMessage);
  const needsSkillContext = isSkillCriteriaQuery(currentMessage) || !!skillName;

  const contextMessages: { role: string; content: string }[] = [];

  if (needsSyllabusContext) {
    contextMessages.push(
      { role: 'user', content: getSyllabusContextMessage() },
      { role: 'assistant', content: 'I have read the full Singapore MOE PE Syllabus 2024 and am ready to answer questions based on it.' },
    );
  }

  if (needsSkillContext) {
    const isGymnastics = skillMode === 'gymnastics';
    const activeSkillsText = isGymnastics ? GYMNASTICS_SKILLS_TEXT : FUNDAMENTAL_MOVEMENT_SKILLS_TEXT;
    const activeRubric = isGymnastics ? GYMNASTICS_RUBRIC : PROFICIENCY_RUBRIC;

    contextMessages.push({
      role: 'user',
      content: `
SKILL CHECKLIST CONTEXT
${activeSkillsText}

PROFICIENCY RUBRIC
${activeRubric}

VALID SKILL NAMES
${isGymnastics ? ALL_GYMNASTICS_SKILLS.join(', ') : Object.keys(SKILL_REFERENCE_IMAGES).join(', ')}

${!isGymnastics && skillName ? getFewShotExamples(skillName) : ''}
`.trim(),
    });
    contextMessages.push({ role: 'assistant', content: 'Understood. I will use the checklist context when relevant.' });
  }

  return [
    { role: 'system', content: buildSystemInstruction(skillMode, skillName) },
    ...contextMessages,
    ...sanitizedHistory,
    { role: 'user', content: currentMessage },
  ];
};

export const sendMessageToDeepSeek = async (
  history: { role: string; content: string }[],
  currentMessage: string,
  _poseData?: import('../vision/poseDetectionService').PoseData[],
  _mediaAttachments?: import('./geminiService').MediaData[],
  skillName?: string,
  _isVerified?: boolean,
  _sessionId?: string,
  _teacherProfile?: import('../../types').TeacherProfile | null,
  _studentMemory?: string,
  _userId?: string,
  skillMode: SkillMode = 'fms'
): Promise<ChatResponse> => {
  const useProxy = !VITE_API_KEY;

  if (useProxy && import.meta.env.DEV) {
    console.warn('⚠️ No VITE_DEEPSEEK_API_KEY found. Using /api/deepseek proxy for local dev.');
  }

  const endpoint = useProxy ? '/api/deepseek' : 'https://api.deepseek.com/chat/completions';
  const messages = buildMessages(history, currentMessage, skillMode, skillName);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': SITE_URL,
    'X-Title': SITE_NAME,
  };

  if (!useProxy) {
    headers.Authorization = `Bearer ${VITE_API_KEY}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        temperature: 0.3,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`DeepSeek API error (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content ?? '';

    return {
      text: rawText || 'I could not generate a response.',
      tokenUsage: data?.usage?.total_tokens || 0,
    };
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
};
