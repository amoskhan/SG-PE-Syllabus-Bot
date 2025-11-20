
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { GroundingChunk } from '../types';
import { PE_SYLLABUS_TEXT } from './syllabusData';

const MODEL_NAME = 'gemini-2.5-flash';

// Initialize the client
// Note: In a real app, never expose keys on the client. This is for the generated demo environment.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
You are the Singapore PE Syllabus Assistant, an expert on the Physical Education (PE) syllabus provided by the Ministry of Education (MOE) Singapore.

You have access to the full text of the **2024 PE Syllabus** (Primary, Secondary, Pre-University).
Use the provided syllabus text below as your PRIMARY source of truth.

**SYLLABUS CONTENT START**
${PE_SYLLABUS_TEXT}
**SYLLABUS CONTENT END**

**Your Role:**
1. Answer questions specifically based on the syllabus content provided above.
2. If the user asks about specific Learning Outcomes (LOs), Activity Guidelines, or Assessment criteria, quote or paraphrase the document accurately.
3. Differentiate clearly between Primary, Secondary, and Pre-University levels.
4. **Search Grounding**: Use Google Search ONLY if the user asks for information *not* found in the syllabus text (e.g., "current weather for outdoor camp", "latest NAPFA award badges images", "news about MOE PE").
5. **Tone**: Professional, encouraging, educational, and structured.

**Key Topics You Know:**
- Goals & Core Values (Respect, Resilience, etc.)
- Learning Areas: Physical Activity (Sports, Dance, Gym, Athletics, Swim), Outdoor Ed, Health & Safety.
- CCE Developmental Milestones.
- Pedagogy (Game-Based Approach, Place-Responsive, etc.).
- Assessment (Holistic Development Profile).

If you are unsure, state that it is not explicitly mentioned in the syllabus text and then use search to find supplementary info.
`;

export interface ChatResponse {
  text: string;
  groundingChunks?: GroundingChunk[];
}

export const sendMessageToGemini = async (
  history: Content[],
  currentMessage: string
): Promise<ChatResponse> => {
  try {
    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }], // Enable Search Grounding for supplementary info
      },
      history: history
    });

    const result = await chat.sendMessage({ message: currentMessage });
    const response = result;

    const text = response.text || "I couldn't generate a response. Please try again.";

    const groundingChunks: GroundingChunk[] =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return {
      text,
      groundingChunks
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
