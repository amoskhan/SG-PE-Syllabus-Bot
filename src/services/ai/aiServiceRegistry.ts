import { sendMessageToGemini } from './geminiService';
import { sendMessageToBedrock } from './bedrockService';
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
    isVerified?: boolean
) => Promise<ChatResponse & { tokenUsage?: number }>;

// Wrapper for Bedrock to match the interface (ignoring extra args)
const bedrockWrapper: AIServiceFunction = async (history, currentMessage) => {
    return sendMessageToBedrock(history, currentMessage);
};

// Wrapper for Gemini to convert standard history to Google Content format
const geminiWrapper: AIServiceFunction = async (history, currentMessage, poseData, mediaAttachments, skillName, isVerified) => {
    // Convert { role: 'user'|'assistant', content: string }[] to Google Content[]
    const googleHistory: Content[] = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }] as import('@google/genai').Part[]
    }));

    return sendMessageToGemini(googleHistory, currentMessage, poseData, mediaAttachments, skillName, isVerified);
};

// Start with a registry that returns the FUNCTION
export const getAIService = (modelId: 'gemini' | 'bedrock'): AIServiceFunction => {
    switch (modelId) {
        case 'gemini':
            return geminiWrapper;
        case 'bedrock':
            return bedrockWrapper;
        default:
            return geminiWrapper;
    }
};
