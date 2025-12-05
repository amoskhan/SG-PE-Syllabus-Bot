
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { GroundingChunk } from '../types';
import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT } from './fundamentalMovementSkillsData';
import { PE_SYLLABUS_TEXT } from './syllabusData';

const MODEL_NAME = 'gemini-2.5-flash';

// Initialize the client
// Note: In a real app, never expose keys on the client. This is for the generated demo environment.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
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
5. **Search Grounding**: Use Google Search ONLY if the user asks for information *not* found in the syllabus text (e.g., "current weather for outdoor camp", "latest NAPFA award badges images", "news about MOE PE").
6. **Tone**: Professional, encouraging, educational, and structured.

**Key Topics You Know:**
- Goals & Core Values (Respect, Resilience, etc.)
- Learning Areas: Physical Activity (Sports, Dance, Gym, Athletics, Swim), Outdoor Ed, Health & Safety.
- Fundamental Movement Skills (Throwing, Catching, Dribbling, etc.) - **Use the FMS Checklist for these.**
- CCE Developmental Milestones.
- Pedagogy (Game-Based Approach, Place-Responsive, etc.).
- Assessment (Holistic Development Profile).

If you are unsure, state that it is not explicitly mentioned in the syllabus text and then use search to find supplementary info.
`;

export interface ChatResponse {
  text: string;
  groundingChunks?: GroundingChunk[];
}

export interface MediaData {
  mimeType: string;
  data: string; // base64 without data URL prefix
}

export const sendMessageToGemini = async (
  history: Content[],
  currentMessage: string,
  poseData?: import('./poseDetectionService').PoseData[],
  mediaAttachments?: MediaData[]
): Promise<ChatResponse> => {
  try {
    let enhancedMessage = currentMessage;

    // If pose data is provided, analyze it and enhance the message
    if (poseData && poseData.length > 0) {
      // ... (pose analysis logic remains the same) ...
      const { poseDetectionService } = await import('./poseDetectionService');
      const analyses = poseData.map(pose => poseDetectionService.analyzePoseGeometry(pose));

      // Calculate frame-to-frame changes for movement pattern detection
      let movementPattern = '';
      if (poseData.length > 1) {
        const changes = [];
        for (let i = 1; i < poseData.length; i++) {
          const prev = poseData[i - 1].landmarks;
          const curr = poseData[i].landmarks;

          // Track significant position changes
          const rightWristYChange = curr[15].y - prev[15].y;
          const leftWristYChange = curr[16].y - prev[16].y;
          const rightFootYChange = curr[27].y - prev[27].y;

          if (Math.abs(rightWristYChange) > 0.08) {
            changes.push(`Right hand ${rightWristYChange < 0 ? 'moved up' : 'moved down'}`);
          }
          if (Math.abs(leftWristYChange) > 0.08) {
            changes.push(`Left hand ${leftWristYChange < 0 ? 'moved up' : 'moved down'}`);
          }
          if (Math.abs(rightFootYChange) > 0.08) {
            changes.push(`Right foot ${rightFootYChange < 0 ? 'raised' : 'lowered'}`);
          }
        }

        if (changes.length > 0) {
          movementPattern = `\n\n**Movement patterns:**\n${changes.slice(0, 4).map((c, i) => `• Frame ${i + 1}→${i + 2}: ${c}`).join('\n')}`;
        }
      }

      const poseDescription = analyses.map((analysis, i) => `
**Frame ${i + 1}:**
Position: ${analysis.poseSummary}
Angles: ${analysis.keyAngles.map(a => `${a.joint}=${a.angle}°`).join(', ')}
      `).join('\n');

      enhancedMessage = `I've captured pose data from ${poseData.length} frame${poseData.length > 1 ? 's' : ''} of the uploaded media.

**Pose measurements:**
${poseDescription}${movementPattern}

**Your task:**
1. Based on the pose data and movement patterns, make your best educated guess about which fundamental movement skill this is
2. Respond in this format: "Based on the pose data, I believe this is a **[movement name]**. Is this correct?"
3. Wait for the user to confirm (yes/no)
4. If confirmed → YOU must analyze the pose data yourself using the measurements above. Check each FMS criterion against the actual angles and positions. Determine proficiency level and provide specific improvements. DO NOT ask the user to check - you do it.
5. If not confirmed → ask the user to tell you the correct movement, then analyze

Common FMS to consider: Overhand throw, Underarm roll/underhand throw, Chest pass, Bounce pass, Overhead pass, Kicking, Catching, Dribbling (hands), Dribbling (feet), Jumping, Running`;
    }

    // Enhance system instruction when pose data is present
    const systemInstruction = poseData && poseData.length > 0
      ? `${SYSTEM_INSTRUCTION}

**POSE DATA ANALYSIS WORKFLOW:**
When pose/landmark data is provided, follow this collaborative approach:

**STEP 1 - MAKE AN EDUCATED GUESS AND CONFIRM:**
- Analyze the pose data (joint angles, body positions, movement patterns)
- Make your best educated guess about which fundamental movement skill is being performed
- Respond: "Based on the pose data [briefly mention key indicators], I believe this is a **[movement name]**. Is this correct?"
- Examples of indicators to mention:
  - "arms raised above shoulders" → possibly overhand throw
  - "arms at chest level moving forward" → possibly chest pass
  - "body lowered, arm swinging low" → possibly underarm roll
  - "foot raised high" → possibly kicking

**STEP 2A - IF USER CONFIRMS (yes/correct/right):**
- You MUST actively analyze the pose data against FMS criteria - DO NOT just list the checklist
- Use the actual measurements provided (joint angles, body positions, movement patterns)
- Provide a detailed assessment in this format:

  **Performance Analysis for [Movement Name]:**
  
  **What I observed from the pose data:**
  - [Specific observation with measurement, e.g., "Elbow flexion at 120° in frame 3"]
  - [Movement pattern observation, e.g., "Hands moved forward from chest level"]
  - [Body position observation]
  
  **Proficiency Assessment:**
  - ✅ [Criteria met with evidence from pose data]
  - ⚠️ [Areas for improvement with specific issues]
  - ❌ [Criteria not met with evidence]
  
  **Overall: [Proficient/Developing/Needs Improvement]**
  
  **How to improve:**
  1. [Specific teaching cue based on detected issue]
  2. [Next concrete action to practice]

- Be SPECIFIC - refer to the actual angles and positions from the pose data
- Don't say "observe whether..." - YOU do the observing using the data provided

**STEP 2B - IF USER SAYS NO (incorrect guess):**
- Ask: "What fundamental movement skill were you performing?"
- Wait for user's response
- Then provide the same detailed analysis as Step 2A for the correct movement

Be confident but humble in your guesses. Use the pose data intelligently.`
      : SYSTEM_INSTRUCTION;

    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }], // Enable Search Grounding for supplementary info
      },
      history: history
    });

    // Construct the message parts (text + images)
    const parts: Part[] = [{ text: enhancedMessage }];

    if (mediaAttachments && mediaAttachments.length > 0) {
      console.log(`📎 Attaching ${mediaAttachments.length} images/frames to prompt`);
      mediaAttachments.forEach(media => {
        // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,")
        const base64Data = media.data.replace(/^data:image\/[a-z]+;base64,/, '');

        parts.push({
          inlineData: {
            mimeType: media.mimeType,
            data: base64Data
          }
        });
      });
    }

    // Cast to any because the SDK type definition might be strict about message being string
    // but the underlying API supports Part[] for multimodal
    const result = await chat.sendMessage({ message: parts as any });
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
