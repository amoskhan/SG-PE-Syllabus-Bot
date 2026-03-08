import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT } from '../../data/fundamentalMovementSkillsData';
import { PE_SYLLABUS_TEXT } from '../../data/syllabusData';
import { StandardHistoryMessage } from '../../types';


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

export const sendMessageToBedrock = async (
    history: StandardHistoryMessage[],
    currentMessage: string
): Promise<ChatResponse & { tokenUsage?: number }> => {
    try {

        const messages = [
            ...history.map((msg) => ({
                role: msg.role === "user" ? "user" : "assistant",
                content: [{ text: msg.content }],
            })),
            { role: "user", content: [{ text: currentMessage }] },
        ];

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

        const response = await fetch('/api/bedrock', {
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

        const text = (data.output?.message?.content || [])
            .filter((block: any) => block.text)
            .map((block: any) => block.text)
            .join('');

        return {
            text: text || "I couldn't generate a response. Please try again.",
            tokenUsage: (data.usage?.inputTokens || 0) + (data.usage?.outputTokens || 0)
        };
    } catch (error) {
        console.error("Bedrock API Error:", error);
        throw error;
    }
};
