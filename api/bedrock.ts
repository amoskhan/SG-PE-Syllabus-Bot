// Vercel Serverless Function — AWS Bedrock (Converse API) Proxy
// The client sends { history, message, systemPrompt } in the request body.
// AWS credentials live only server-side; never exposed to the browser.

// Load .env.local explicitly for vercel dev (vercel dev does NOT auto-load .env.local
// into the Node.js serverless function runtime — only VITE picks it up for the browser bundle)
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import {
    BedrockRuntimeClient,
    ConverseCommand,
    type Message as BedrockMessage,
    type ContentBlock,
    type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

// Fallback system prompt if the client doesn't supply one
const FALLBACK_SYSTEM_PROMPT =
    'You are the Singapore PE Syllabus Assistant, an expert on the Physical Education (PE) syllabus provided by the Ministry of Education (MOE) Singapore. Answer questions accurately, professionally and helpfully.';

export default async function handler(req: any, res: any) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
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

    // Read credentials inside handler (after dotenv.config runs at module init)
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsRegion = process.env.AWS_REGION || 'ap-southeast-1';
    const awsBedrockModel =
        process.env.AWS_BEDROCK_MODEL || 'anthropic.claude-3-7-sonnet-20250219-v1:0';

    // Validate AWS credentials
    if (!awsAccessKey || !awsSecretKey) {
        console.error('[bedrock] Missing AWS credentials.');
        return res.status(500).json({
            error: 'Server Configuration Error: AWS credentials missing. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to .env.local or Vercel environment variables.',
        });
    }

    try {
        const { history = [], message, systemPrompt } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Missing required field: message' });
        }

        const activeSystemPrompt: string = systemPrompt || FALLBACK_SYSTEM_PROMPT;

        console.log(
            `[bedrock] Request received. History: ${history.length}, Model: ${awsBedrockModel}`
        );

        // Build Bedrock-format messages from normalised history
        const bedrockMessages: BedrockMessage[] = history.map(
            (msg: { role: string; content: string }) => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: [{ text: msg.content } as ContentBlock],
            })
        );

        // Append the current user turn
        bedrockMessages.push({
            role: 'user',
            content: [{ text: message } as ContentBlock],
        });

        const client = new BedrockRuntimeClient({
            region: awsRegion,
            credentials: {
                accessKeyId: awsAccessKey,
                secretAccessKey: awsSecretKey,
            },
        });

        const command = new ConverseCommand({
            modelId: awsBedrockModel,
            messages: bedrockMessages,
            system: [{ text: activeSystemPrompt } as SystemContentBlock],
            inferenceConfig: {
                maxTokens: 2048,
                temperature: 0.7,
                topP: 0.9,
            },
        });

        const bedrockResponse = await client.send(command);

        // Extract text from response
        const outputContent = bedrockResponse.output?.message?.content || [];
        let text = '';
        for (const block of outputContent) {
            if (block.text) text += block.text;
        }

        const tokenUsage =
            (bedrockResponse.usage?.inputTokens ?? 0) +
            (bedrockResponse.usage?.outputTokens ?? 0);

        console.log(`[bedrock] Success. Tokens: ${tokenUsage}`);

        return res.status(200).json({
            text: text || "I couldn't generate a response. Please try again.",
            tokenUsage,
        });
    } catch (error: any) {
        console.error(
            '[bedrock] Error:',
            JSON.stringify({
                message: error.message,
                name: error.name,
                httpStatus: error.$metadata?.httpStatusCode,
                stack: error.stack?.substring(0, 500),
            })
        );

        const httpStatus =
            error.$metadata?.httpStatusCode === 429
                ? 429
                : error.$metadata?.httpStatusCode === 403
                ? 403
                : 500;

        return res.status(httpStatus).json({
            error: error.message || 'Error communicating with AWS Bedrock',
            details: error.name || undefined,
        });
    }
}
