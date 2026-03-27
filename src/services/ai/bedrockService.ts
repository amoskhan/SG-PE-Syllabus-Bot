// Client-side service — calls the server-side /api/bedrock proxy.
// AWS credentials never touch the browser; all auth happens server-side.
// The system prompt (with PE syllabus data) is built client-side from already-bundled data files,
// then sent to the API route — matching the same pattern used by geminiService.ts.

import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT } from '../../data/fundamentalMovementSkillsData';
import { PE_SYLLABUS_TEXT } from '../../data/syllabusData';

const SYSTEM_PROMPT = `You are the Singapore PE Syllabus Assistant, an expert on the Physical Education (PE) syllabus provided by the Ministry of Education (MOE) Singapore.

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
- Fundamental Movement Skills (Throwing, Catching, Dribbling, etc.) — **Use the FMS Checklist for these.**
- CCE Developmental Milestones.
- Pedagogy (Game-Based Approach, Place-Responsive, etc.).
- Assessment (Holistic Development Profile).

If you are unsure, state that it is not explicitly mentioned in the syllabus text.`;

export interface ChatResponse {
    text: string;
}

export const sendMessageToBedrock = async (
    history: { role: string; content: string }[],
    currentMessage: string
): Promise<ChatResponse & { tokenUsage?: number }> => {
    const response = await fetch('/api/bedrock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            history,
            message: currentMessage,
            systemPrompt: SYSTEM_PROMPT,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));

        if (response.status === 429) {
            throw new Error('Bedrock usage limit exceeded (429). Please try again later.');
        }
        if (response.status === 403) {
            throw new Error('Bedrock access denied (403). Check your IAM permissions for Bedrock in ap-southeast-1.');
        }

        throw new Error(errorData.error || `Bedrock API error (${response.status})`);
    }

    const data = await response.json();
    return {
        text: data.text || "I couldn't generate a response. Please try again.",
        tokenUsage: data.tokenUsage,
    };
};
