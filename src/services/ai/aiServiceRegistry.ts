import { sendMessageToGemini } from './geminiService';
import { sendMessageToClaudeAPI } from './claudeService';
import { sendMessageToOpenRouter } from './openRouterService';
import { Content } from '@google/genai';
import { MediaData, ChatResponse } from './geminiService';
import { Message, Sender } from '../../types';

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

// Wrapper for OpenRouter with dynamic model routing (video → gemini-2.5-flash, text/PDF → qwen)
const openrouterWrapper: AIServiceFunction = async (history, currentMessage, poseData, mediaAttachments, skillName, isVerified, sessionId, teacherProfile, _studentMemory, _userId, skillMode) => {
    return sendMessageToOpenRouter(history, currentMessage, poseData, mediaAttachments, skillName, isVerified, 'openrouter', sessionId, teacherProfile, skillMode ?? 'fms');
};

// Start with a registry that returns the FUNCTION
export const getAIService = (modelId: 'gemini' | 'claude' | 'openrouter'): AIServiceFunction => {
    switch (modelId) {
        case 'gemini':
            return geminiWrapper;
        case 'claude':
            return claudeWrapper;
        case 'openrouter':
            return openrouterWrapper;
        default:
            return geminiWrapper;
    }
};
