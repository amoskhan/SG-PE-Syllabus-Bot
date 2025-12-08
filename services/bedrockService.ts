import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT } from './fundamentalMovementSkillsData';
import { PE_SYLLABUS_TEXT } from './syllabusData';

// Get bearer token from environment - this is actually a base64-encoded pre-signed URL
const BEDROCK_BEARER_TOKEN = import.meta.env.VITE_BEDROCK_BEARER_TOKEN || "";

const SYSTEM_PROMPT = `
You are the Singapore PE Syllabus Assistant, an expert on the Physical Education (PE) syllabus provided by the Ministry of Education (MOE) Singapore.

You have access to two primary sources of truth:
1. **2024 PE Syllabus** (Primary, Secondary, Pre-University)
2. **Fundamental Movement Skills (FMS) Checklist**

Use the provided text below as your knowledge base.

**SYLLABUS CONTENT START**
${PE_SYLLABUS_TEXT}
**SYLLABUS CONTENT END**

**FUNDAMENTAL MOVEMENT SKILLS CONTENT START**
${FUNDAMENTAL_MOVEMENT_SKILLS_TEXT}
**FUNDAMENTAL MOVEMENT SKILLS CONTENT END**

**Your Role:**
1. Answer questions specifically based on the syllabus content and FMS checklist provided above.
2. If the user asks about specific Learning Outcomes (LOs), Activity Guidelines, or Assessment criteria, quote or paraphrase the document accurately.
3. If the user asks about **Fundamental Movement Skills** (e.g., "how to do an overhand throw", "teaching cues for kicking"), refer to the FMS CONTENT section.
4. Differentiate clearly between Primary, Secondary, and Pre-University levels.
5. **Tone**: Professional, encouraging, educational, and structured.

**Key Topics You Know:**
- Goals & Core Values (Respect, Resilience, etc.)
- Learning Areas: Physical Activity (Sports, Dance, Gym, Athletics, Swim), Outdoor Ed, Health & Safety.
- Fundamental Movement Skills (Throwing, Catching, Dribbling, etc.) - **Use the FMS Checklist for these.**
- CCE Developmental Milestones.
- Pedagogy (Game-Based Approach, Place-Responsive, etc.).
- Assessment (Holistic Development Profile).

If you are unsure, state that it is not explicitly mentioned in the syllabus text.
`;

export interface ChatResponse {
    text: string;
}

// Decode base64 URL
function decodeBedrockUrl(token: string): string {
    // Remove 'bedrock-api-key-' prefix if present
    const base64Part = token.replace(/^bedrock-api-key-/, '');

    // Decode base64
    try {
        const decodedUrl = atob(base64Part);
        return decodedUrl;
    } catch (error) {
        console.error('Error decoding bearer token:', error);
        throw new Error('Invalid bearer token format');
    }
}

export const sendMessageToBedrock = async (
    history: { role: string; content: string }[],
    currentMessage: string
): Promise<ChatResponse & { tokenUsage?: number }> => {
    try {
        if (!BEDROCK_BEARER_TOKEN) {
            throw new Error("Bedrock bearer token not configured. Please add VITE_BEDROCK_BEARER_TOKEN to your .env.local file.");
        }

        // Decode the pre-signed URL from the bearer token
        let fullPresignedUrl = decodeBedrockUrl(BEDROCK_BEARER_TOKEN);
        if (!fullPresignedUrl.startsWith('http')) {
            fullPresignedUrl = `https://${fullPresignedUrl}`;
        }

        // Extract region from the signed URL (e.g. ap-southeast-1)
        // Format checks for region in X-Amz-Credential OR host
        // Default to ap-southeast-1 if finding fails, but usually signed URL has it.


        // Use the local proxy path instead of the direct URL to avoid CORS
        // Note: Can't modify the path as the AWS signature is tied to it
        const urlObj = new URL(fullPresignedUrl);
        const proxyUrl = `/bedrock-api${urlObj.search}`;

        const messages = history.map((msg) => ({
            role: msg.role === "user" ? "user" : "assistant",
            content: [{ text: msg.content }],
        }));

        // Add current message
        messages.push({
            role: "user",
            content: [{ text: currentMessage }],
        });

        // Prepare the request body for Bedrock Converse API
        const requestBody = {
            modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            messages: messages,
            system: [{ text: SYSTEM_PROMPT }],
            inferenceConfig: {
                maxTokens: 2048,
                temperature: 0.7,
                topP: 0.9,
            },
        };

        // Make the API call using the proxy URL
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Bedrock API error response:', errorText);

            if (response.status === 429) {
                throw new Error("Bedrock usage limit exceeded (429). Please try again later.");
            }

            throw new Error(`Bedrock API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        // Extract text from response
        const outputMessage = data.output?.message;
        const contentBlocks = outputMessage?.content || [];

        let text = "";
        for (const block of contentBlocks) {
            if (block.text) {
                text += block.text;
            }
        }

        return {
            text: text || "I couldn't generate a response. Please try again.",
            tokenUsage: (data.usage?.inputTokens || 0) + (data.usage?.outputTokens || 0)
        };
    } catch (error) {
        console.error("Bedrock API Error:", error);
        throw error;
    }
};
