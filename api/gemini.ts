import { GoogleGenAI } from '@google/genai';
import { getAllowedOrigin } from './_utils';

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export default async function handler(req: any, res: any) {
    const allowedOrigin = getAllowedOrigin(req.headers?.origin || '');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!apiKey) {
        console.error('SERVER ERROR: GEMINI_API_KEY is missing in Vercel Environment Variables.');
        return res.status(500).json({ error: 'Server Configuration Error: API Key missing. Please set GEMINI_API_KEY in Vercel Settings.' });
    }

    try {
        const { history, message, systemInstruction, tools } = req.body;

        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction, tools },
            history: history || [],
        });

        const result = await chat.sendMessage({ message });
        const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        return res.status(200).json({
            text: result.text || '',
            tokenUsage: result.usageMetadata?.totalTokenCount,
            groundingChunks,
        });
    } catch (error: any) {
        console.error('Gemini API Error (Server-Side):', error);
        return res.status(500).json({ error: 'Error communicating with Google Gemini API', details: error.message });
    }
}
