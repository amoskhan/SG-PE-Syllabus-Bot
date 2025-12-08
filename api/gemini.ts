// import type { VercelRequest, VercelResponse } from '@vercel/node'; 
// Use 'any' to avoid adding new dependencies for now
import { GoogleGenAI } from '@google/genai';

// Initialize the client with the server-side key
// This key is ONLY available on the server (Vercel)
const apiKey = process.env.GEMINI_API_KEY;

export default async function handler(req: any, res: any) {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!apiKey) {
        console.error('SERVER ERROR: GEMINI_API_KEY is missing in Vercel Environment Variables.');
        return res.status(500).json({
            error: 'Server Configuration Error: API Key missing. Please set GEMINI_API_KEY in Vercel Settings.'
        });
    }

    try {
        const { history, message, systemInstruction, tools } = req.body;

        // Initialize GenAI
        const ai = new GoogleGenAI({ apiKey });

        // Create chat session
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash', // Keep consistent with service
            config: {
                systemInstruction: systemInstruction,
                tools: tools,
            },
            history: history || []
        });

        // Send message (support text or parts for multimodal)
        const result = await chat.sendMessage({ message: message });
        const response = result;

        const text = response.text || "";
        const usage = response.usageMetadata?.totalTokenCount;
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        return res.status(200).json({
            text,
            tokenUsage: usage,
            groundingChunks
        });

    } catch (error: any) {
        console.error('Gemini API Error (Server-Side):', error);
        return res.status(500).json({
            error: 'Error communicating with Google Gemini API',
            details: error.message
        });
    }
}
