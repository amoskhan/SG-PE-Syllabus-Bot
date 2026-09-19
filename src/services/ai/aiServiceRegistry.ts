import { sendMessageToGemini } from './geminiService';
import { sendMessageToClaudeAPI } from './claudeService';
import { Content } from '@google/genai';
import { MediaData, ChatResponse } from './geminiService';

export type AIServiceFunction = (
    history: any[], // We will normalize this inside the wrapper
    currentMessage: string,
    poseData?: import('../vision/poseDetectionService').PoseData[],
    mediaAttachments?: MediaData[],
    skillName?: string,
    isVerified?: boolean,
    sessionId?: string,
    teacherProfile?: import('../../types').TeacherProfile | null,
    studentMemory?: string,
    userId?: string,
    skillMode?: import('../../types').SkillMode
) => Promise<ChatResponse & { tokenUsage?: number }>;

// Wrapper for Gemini to convert standard history to Google Content format
const geminiWrapper: AIServiceFunction = async (history, currentMessage, poseData, mediaAttachments, skillName, isVerified, sessionId, teacherProfile, _studentMemory, _userId, skillMode) => {
    // Convert { role: 'user'|'assistant', content: string }[] to Google Content[]
    const googleHistory: Content[] = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }] as import('@google/genai').Part[]
    }));

    return sendMessageToGemini(googleHistory, currentMessage, poseData, mediaAttachments, skillName, isVerified, sessionId, teacherProfile, skillMode ?? 'fms');
};

// Wrapper for Claude Sonnet (Anthropic direct API)
const claudeWrapper: AIServiceFunction = async (history, currentMessage, poseData, mediaAttachments, skillName, isVerified, sessionId, teacherProfile, studentMemory, userId, skillMode) => {
    const standardHistory = history.map(msg => ({ role: msg.role, content: msg.content as string }));
    return sendMessageToClaudeAPI(standardHistory, currentMessage, poseData, mediaAttachments, skillName, isVerified, sessionId, teacherProfile, studentMemory, userId, skillMode ?? 'fms');
};

// Start with a registry that returns the FUNCTION.
// `modelId` is widened to string because stored sessions may still carry
// 'openrouter' or 'deepseek' from before those providers were removed; those
// fall through to Gemini rather than breaking an old chat.
export const getAIService = (modelId: string): AIServiceFunction => {
    switch (modelId) {
        case 'gemini':
            return geminiWrapper;
        case 'claude':
            return claudeWrapper;
        default:
            return geminiWrapper;
    }
};
