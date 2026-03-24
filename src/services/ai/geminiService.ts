
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { GroundingChunk } from '../../types';
import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, PROFICIENCY_RUBRIC, SKILL_REFERENCE_IMAGES, getSkillChecklist } from '../../data/fundamentalMovementSkillsData';
import { PE_SYLLABUS_TEXT } from '../../data/syllabusData';

const MODEL_NAME = 'gemini-2.5-flash';

// Initialize the client
// Note: In a real app, never expose keys on the client. This is for the generated demo environment.
// const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const FULL_SYSTEM_INSTRUCTION = `
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

**Displaying Reference Images:**
If the user asks to see what a skill looks like (e.g., "Show me overhand throw", "visual for dragging"), you can trigger the display of the reference image by including this EXACT tag in your response:
\`[[DISPLAY_REFERENCE: <Exact Skill Name>]]\`
Example: \`[[DISPLAY_REFERENCE: Underhand Throw]]\`
Valid Skill Names: ${Object.keys(SKILL_REFERENCE_IMAGES).join(', ')}
Do not show this tag to the user in the final output.

**STUDENT MODE (Show Me commands):**
If the user's intent is just to SEE the skill (e.g., "Show me", "What does it look like"), and the user appears to be a student (Primary/Secondary):
1. Use the \`[[DISPLAY_REFERENCE]]\` tag as described above.
2. **KEEP IT SIMPLE**: Do NOT show the full FMS Checklist or Rubric.
3. Provide a brief, encouraging description (1-2 sentences) suited for a child.
   - Example: "Here is the perfect form for an Underhand Throw! Notice how he faces the target and swings his arm back?"
`;

const MOTION_ANALYSIS_INSTRUCTION = `
You are the Singapore PE Syllabus Assistant, specializing in analyzing Fundamental Movement Skills (FMS).

You have access to the **Fundamental Movement Skills (FMS) Checklist** as your primary source of truth.

**FUNDAMENTAL MOVEMENT SKILLS CHECKLIST:**
${FUNDAMENTAL_MOVEMENT_SKILLS_TEXT}

**PROFICIENCY RUBRIC (GRADING RULES):**
${PROFICIENCY_RUBRIC}

**Your Role:**
Analyze movement patterns from video/images and grade them strictly based on the FMS Checklist and Rubric above.

**REFERENCE IMAGE USAGE (STATIC-TO-DYNAMIC COMPARISON):**
IF a Reference Image is provided (labeled "Gold Standard"):
1.  **Treat as Key Frame**: The Reference Image represents the "Perfect Moment" (e.g., Release point, Impact point).
2.  **Scan Video**: Look through the user's video frames to find the *best matching moment* that corresponds to the Reference Image.
3.  **Direct Comparison**: Compare the user's form at that specific moment against the Reference Image.
    - *Example*: "In the Reference Image, the elbow is at 90°. In your video (Frame 12), your elbow is only at 45°."
4.  **Handling Ambiguity**: If you CANNOT find a clear matching frame (due to blur, angle, or the user skipping the step), YOU MUST FLAG IT.
    - Response: "⚠️ Ambiguous - I cannot find a frame that matches the Reference Image's key pose. **This would require the assistance of a trained MOE PE teacher to verify.**"

**POSE DATA ANALYSIS WORKFLOW:**

**STEP 1 - OBSERVE AND HYPOTHESIZE:**
- Look at the pose data and the visual input.
- Identify the **TOP 4** most likely fundamental movement skills from the official list.
- Respond: "I've detected your movement! Based on the patterns, it looks like one of these 4 skills. Which one is it?"
- You MUST include the following tag at the end of your response:
  '[[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]]'

**STEP 2 - FULL ANALYSIS (AFTER CONFIRMATION):**
- Once the user confirms the skill, proceed to grade the performance strictly based on the FMS Checklist and Rubric.
- **CRITICAL**: You must grade the performance by checking off EACH critical feature from the Checklist for that skill.
- **Do NOT** use joint angles as the primary grade. Use the Checklist.
- **DETERMINE LEVEL**:
  - Mistake in >50% of items? → **Beginning**
  - Missed 1-2 items? → **Developing**
  - Hit ALL items? → **Competent**
  - Hit ALL items + Exceptional quality? → **Excellent**

- Provide a detailed assessment in this format:

  **Performance Analysis for [Movement Name]:**

  **Checklist Assessment:**
  - ✅ [Feature 1]: Observed (Brief evidence)
  - ✅ [Feature 2]: Observed
  - ❌ [Feature 3]: NOT Observed (Evidence: e.g. "Did not step with opposite foot")
  - ... (List all relevant features)

  **Proficiency Level: [Beginning / Developing / Competent / Excellent]**
  *(Reason: You met X out of Y criteria...)*

  **Feedback for Improvement:**
  1. [Specific correction for the missed feature]
  2. [Cue to remember]
`;


export interface ChatResponse {
  text: string;
  groundingChunks?: GroundingChunk[];
  referenceImageURI?: string;
}

export interface MediaData {
  mimeType: string;
  data: string; // base64 without data URL prefix
}

export const sendMessageToGemini = async (
  history: Content[],
  currentMessage: string,
  poseData?: import('../vision/poseDetectionService').PoseData[],
  mediaAttachments?: MediaData[],
  skillName?: string,
  isVerified?: boolean,
  sessionId?: string,
  teacherProfile?: import('../../types').TeacherProfile | null
): Promise<ChatResponse & { tokenUsage?: number }> => {
  try {
    let enhancedMessage = currentMessage;
    let poseDescription = '';
    let movementPattern = '';
    let biomechanicsReport = '';

    // If pose data is provided, analyze it and enhance the message
    if (poseData && poseData.length > 0) {
      const { poseDetectionService } = await import('../vision/poseDetectionService');
      const analyses = poseData.map(pose => poseDetectionService.analyzePoseGeometry(pose));

      // Calculate frame-to-frame changes for movement pattern detection
      if (poseData.length > 1) {
        const changes: string[] = [];

        // Helper to detect dominant side and stance
        let maxRightHandVel = 0;
        let maxLeftHandVel = 0;
        let totalRightHandMove = 0;
        let totalLeftHandMove = 0;
        let maxRightFootVel = 0;
        let maxLeftFootVel = 0;
        let narrowStanceCount = 0;

        // Wind-up detection
        let minRightHandY = 0; // 0 is top. Max value = lowest point (Deepest windup)
        let rightHipY = 0;
        let minLeftHandY = 0;
        let leftHipY = 0;
        let noseY = 1; // Default to bottom

        // High Arm Detection (For excessive swing)
        let maxRightHandHighY = 1; // 1 is bottom. Smallest value = highest point.
        let maxLeftHandHighY = 1;

        // Knee Bend Detection
        let minKneeAngle = 180;

        // Step Detection (Stride Length)
        let initialAnkleDist = 0;
        let maxAnkleDist = 0;

        if (poseData.length > 0) {
          const firstFrame = poseData[0].landmarks;
          initialAnkleDist = Math.hypot(firstFrame[27].x - firstFrame[28].x, firstFrame[27].y - firstFrame[28].y);
          maxRightHandHighY = firstFrame[16].y;
          maxLeftHandHighY = firstFrame[15].y;
        }

        // Key Frame Indices
        let minKneeAngleFrame = -1;
        let maxRightHandHighFrame = -1;
        let maxLeftHandHighFrame = -1;
        let releaseFrame = -1; // Placeholder for future ball integration

        // Iterate analyses to find key angles and their frames
        analyses.forEach((analysis, index) => {
          const rightKnee = analysis.keyAngles.find(a => a.joint === 'Right Knee')?.angle || 180;
          const leftKnee = analysis.keyAngles.find(a => a.joint === 'Left Knee')?.angle || 180;
          const currentMin = Math.min(rightKnee, leftKnee);

          if (currentMin < minKneeAngle) {
            minKneeAngle = currentMin;
            minKneeAngleFrame = index + 1; // 1-based frame index
          }
        });

        for (let i = 1; i < poseData.length; i++) {
          const prev = poseData[i - 1].landmarks;
          const curr = poseData[i].landmarks;

          // ... (existing code for noseY, moves, etc) ...
          noseY = curr[0].y;

          // Movement Calcs
          const rightHandMove = Math.hypot(curr[16].x - prev[16].x, curr[16].y - prev[16].y);
          const leftHandMove = Math.hypot(curr[15].x - prev[15].x, curr[15].y - prev[15].y);

          totalRightHandMove += rightHandMove;
          totalLeftHandMove += leftHandMove;

          const rightFootMoveX = curr[28].x - prev[28].x;
          const leftFootMoveX = curr[27].x - prev[27].x;

          maxRightHandVel = Math.max(maxRightHandVel, rightHandMove);
          maxLeftHandVel = Math.max(maxLeftHandVel, leftHandMove);
          maxRightFootVel = Math.max(maxRightFootVel, Math.abs(rightFootMoveX));
          maxLeftFootVel = Math.max(maxLeftFootVel, Math.abs(leftFootMoveX));

          // Track lowest hand position (Highest Y value) for Deep Windup
          minRightHandY = Math.max(minRightHandY, curr[16].y);
          minLeftHandY = Math.max(minLeftHandY, curr[15].y);

          // Track highest hand position (Lowest Y value) for High Swing
          if (curr[16].y < maxRightHandHighY) {
            maxRightHandHighY = curr[16].y;
            maxRightHandHighFrame = i + 1;
          }
          if (curr[15].y < maxLeftHandHighY) {
            maxLeftHandHighY = curr[15].y;
            maxLeftHandHighFrame = i + 1;
          }

          // Store Hip Y
          rightHipY = curr[24].y;
          leftHipY = curr[23].y;

          // Stance Width / Stride Length
          const currentAnkleDist = Math.hypot(curr[27].x - curr[28].x, curr[27].y - curr[28].y);
          maxAnkleDist = Math.max(maxAnkleDist, currentAnkleDist);

          const shoulderWidth = Math.abs(curr[11].x - curr[12].x);
          const ankleWidth = Math.abs(curr[27].x - curr[28].x);
          if (ankleWidth < shoulderWidth * 0.8) narrowStanceCount++;

          const rightFootMoveY = curr[28].y - prev[28].y;

          // Movement Log
          const stepThreshold = 0.05;
          if (Math.abs(rightFootMoveX) > stepThreshold) {
            changes.push(`Right foot moved X: ${rightFootMoveX.toFixed(2)}`);
          }
          if (Math.abs(leftFootMoveX) > stepThreshold) {
            changes.push(`Left foot moved X: ${leftFootMoveX.toFixed(2)}`);
          }
        }

        // Generate Biomechanics Report with Citation Evidence
        // "Force Generation" on Orange lines = Right Handed
        const dominantHand = totalRightHandMove > totalLeftHandMove ? 'Right' : 'Left';
        const handRatio = Math.max(totalRightHandMove, totalLeftHandMove) / Math.min(totalRightHandMove, totalLeftHandMove);
        const confidence = handRatio > 1.2 ? '(High Confidence)' : '(Low Confidence)';

        // Stepping foot 
        const strideExpansion = maxAnkleDist / (initialAnkleDist + 0.001); // Avoid div/0
        const stepDetected = strideExpansion > 1.2;
        const steppingFoot = maxRightFootVel > maxLeftFootVel * 1.2 ? 'Right' : (maxLeftFootVel > maxRightFootVel * 1.2 ? 'Left' : 'None/Both');

        const stanceIssue = narrowStanceCount > (poseData.length * 0.6) ? '⚠️ Feet too narrow (Narrower than shoulders)' : '✅ Stance width looks okay';

        // Coordination Check
        let coordinationCheck = '✅ Coordination looks okay';
        if (dominantHand === 'Right' && steppingFoot === 'Right') coordinationCheck = '❌ IPSILATERAL ERROR: Stepped with Right Foot while throwing with Right Hand (Should be Left Foot)';
        if (dominantHand === 'Left' && steppingFoot === 'Left') coordinationCheck = '❌ IPSILATERAL ERROR: Stepped with Left Foot while throwing with Left Hand (Should be Right Foot)';

        // Wind-up Check (Depth) - ONLY for skills where hand drops/swings back
        let windUpCheck = 'N/A (Not required for this skill)';
        const requiresWindUp = ['Underhand Throw', 'Underhand Roll', 'Overhand Throw', 'Kick'].some(s => skillName?.includes(s));

        if (requiresWindUp) {
          windUpCheck = '⚠️ No significant wind-up (Hand stayed high)';
          if (dominantHand === 'Right' && minRightHandY > rightHipY) windUpCheck = '✅ Good Wind-up (Hand dropped below waist)';
          if (dominantHand === 'Left' && minLeftHandY > leftHipY) windUpCheck = '✅ Good Wind-up (Hand dropped below waist)';
        }

        // Excessive High Swing Check (Consistency)
        let highSwingCheck = '✅ Hand Height Controlled (Below Head Level)';
        // Y increases downwards. Smaller Y = Higher.
        const highPoint = dominantHand === 'Right' ? maxRightHandHighY : maxLeftHandHighY;
        const highPointFrame = dominantHand === 'Right' ? maxRightHandHighFrame : maxLeftHandHighFrame;

        if (highPoint < noseY) {
          highSwingCheck = `⚠️ Hand raised ABOVE HEAD level (High Backswing/Follow-through). Check if excessive for this skill. (Evidence: Frame ${highPointFrame})`;
        }

        // Knee Bend Check
        const kneeBendCheck = minKneeAngle < 170.0
          ? `✅ Knees Bent Detected (Min angle: ${minKneeAngle}° at Frame ${minKneeAngleFrame}). Credit "knees bent" criteria.`
          : `⚠️ Knees appear straight (Min angle: ${minKneeAngle}° at Frame ${minKneeAngleFrame}).`;

        // Step Check Report
        const stepNote = stepDetected
          ? `✅ DISTINCT STEP DETECTED (Stride widened by ${(strideExpansion * 100 - 100).toFixed(0)}%). Stepping foot: ${steppingFoot}.`
          : `⚠️ No significant step detected (Stride expansion only ${(strideExpansion * 100 - 100).toFixed(0)}%).`;

        biomechanicsReport = `\n
**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Hand**: ${dominantHand} ${confidence}
2. **Stepping Foot**: ${steppingFoot}
3. **Coordination**: ${coordinationCheck}
4. **Stance**: ${stanceIssue}
5. **Wind-up (Depth)**: ${windUpCheck}
6. **Arm Height**: ${highSwingCheck}
7. **Knee Bend**: ${kneeBendCheck}
8. **Step Verification**: ${stepNote}
`;

        movementPattern = `\n\n**Movement patterns (Kinetic Chain indicators):**\n${changes.slice(0, 30).map((c, i) => `• Frame ${i + 1}→${i + 2}: ${c}`).join('\n')}`;
      }

      poseDescription = analyses.map((analysis, i) => {
        const ball = poseData[i].ball;
        // Only report 'YES' if the ball exists AND is marked as valid by the logic or user
        const hasBall = (ball && ball.isValid)
          ? `YES (x:${ball.center.x.toFixed(0)}, y:${ball.center.y.toFixed(0)})`
          : 'NO (Not detected or User Omitted)';
        return `
**Frame ${i + 1}:**
Position: ${analysis.poseSummary}
Angles: ${analysis.keyAngles.map(a => `${a.joint}=${a.angle}°`).join(', ')}
Ball Detected: ${hasBall}
      `;
      }).join('\n');

      const userTargetSkill = (skillName && isVerified) ? `\n**USER DECLARED SKILL**: "${skillName}".\nNOTE: The user has explicitly identified this movement.\nDO NOT ASK "Is this correct?".\nDO NOT GUESS.\nPROCEED DIRECTLY TO GRADING.` : (skillName ? `\nNote: The user mentioned "${skillName}", but we are still in the verification phase. Provide the Top 4 choices anyway to confirm.` : '');

      enhancedMessage = `I've captured pose data from ${poseData.length} keyframes extracted evenly across the video duration.

**Pose measurements:**
${poseDescription}${movementPattern}
${biomechanicsReport}
${userTargetSkill}

**Your task:**
1. **Analyze the Kinetic Chain**: Look at the "Movement patterns" above. Is the movement fluid and sequential (e.g., legs -> torso -> arms) or "segmented" (robotic/broken)?
2. **Biomechanics Check**: Read the "BIOMECHANICS ANALYSIS" above.
3. ${isVerified ?
          `**IMMEDIATE ACTION**: Provide a full performance analysis for "${skillName || 'this movement'}" using the FMS Rubric.` :
          `**VERIFICATION PHASE**: You must identify the TOP 4 most likely skills from the Fundamental Movement Skills list. DO NOT grade the performance yet.`}
4. ${isVerified ?
          'Ensure you site specific frames for any deductions.' :
          'You MUST include the [[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]] tag at the end of your response.'}`;
    }

    // Auto-detect skill from text if not explicitly provided to get specific rubric
    let activeSkillName = skillName;
    if (!activeSkillName) {
      const lowerMsg = currentMessage.toLowerCase();
      const knownSkills = Object.keys(SKILL_REFERENCE_IMAGES).sort((a, b) => b.length - a.length);
      for (const skill of knownSkills) {
        if (lowerMsg.includes(skill.toLowerCase())) {
          console.log(`🧠 Text Context detected skill: ${skill}`);
          activeSkillName = skill;
          break;
        }
      }
    }

    let specificChecklistText = FUNDAMENTAL_MOVEMENT_SKILLS_TEXT;
    if (activeSkillName) {
      const checklist = getSkillChecklist(activeSkillName);
      const customRubric = teacherProfile?.customRubrics?.[activeSkillName];

      if (customRubric) {
        specificChecklistText = `*** TEACHER'S CUSTOM RUBRIC FOR ${activeSkillName} ***
The teacher has provided a custom rubric with specific labels and groupings for this class.
When grading "Beginning", "Developing", "Competent", or "Accomplished", you MUST use these groupings and criteria below:

**Level: Beginning**
${customRubric.beginning?.map(g => `- Label: "${g.label}" (Requires you to observe: ${g.originalCriteriaIndices.length > 0 ? g.originalCriteriaIndices.map(i => checklist[i].replace(/^\\d+\\.\\s*/, '')).join(' AND ') : 'No sub-criteria, label stands alone'})`).join('\n') || 'No specific criteria set. If they fail Developing, default to generic "Beginning".'}

**Level: Developing**
${customRubric.developing.map(g => `- Label: "${g.label}" (Requires you to observe: ${g.originalCriteriaIndices.length > 0 ? g.originalCriteriaIndices.map(i => checklist[i].replace(/^\\d+\\.\\s*/, '')).join(' AND ') : 'No sub-criteria, label stands alone'})`).join('\n') || 'No specific criteria set'}

**Level: Competent**
${customRubric.competent.map(g => `- Label: "${g.label}" (Requires you to observe: ${g.originalCriteriaIndices.length > 0 ? g.originalCriteriaIndices.map(i => checklist[i].replace(/^\\d+\\.\\s*/, '')).join(' AND ') : 'No sub-criteria, label stands alone'})`).join('\n') || 'No specific criteria set'}

**Level: Accomplished**
${customRubric.accomplished.map(g => `- Label: "${g.label}" (Requires you to observe: ${g.originalCriteriaIndices.length > 0 ? g.originalCriteriaIndices.map(i => checklist[i].replace(/^\\d+\\.\\s*/, '')).join(' AND ') : 'No sub-criteria, label stands alone'})`).join('\n') || 'No specific criteria set'}

If the student only demonstrates the "Beginning" characteristics (or fails to meet Developing), grade them as "Beginning".
When giving feedback, refer to the teacher's Labels (e.g. "You missed the '${customRubric.developing[0]?.label || 'Setup'}' position", or "You are at '${customRubric.beginning?.[0]?.label || 'Beginning'}'").
Your Checklist Assessment MUST be grouped by these Levels and Labels instead of the standard 10 criteria.
(END OF CUSTOM RUBRIC)`;
      } else if (checklist.length > 0) {
        specificChecklistText = `*** OFFICIAL CHECKLIST FOR ${activeSkillName} ***
You MUST evaluate EACH of the following ${checklist.length} criteria. DO NOT SKIP ANY.
                  
${checklist.join('\n')}
                  
(END OF CHECKLIST)`;
      }
    }

    // Choose the appropriate system instruction based on context
    let systemInstruction = poseData && poseData.length > 0
      ? MOTION_ANALYSIS_INSTRUCTION.replace(FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, specificChecklistText)
      : FULL_SYSTEM_INSTRUCTION;

    // RAG RETRIEVAL: Fetch extra context from uploaded PDFs
    let ragContext = '';
    try {
      if (currentMessage && currentMessage.trim().length > 3) {
        console.log("🔍 Querying Vector DB for context...");
        const ragResponse = await fetch('/api/rag-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: currentMessage })
        });
        if (ragResponse.ok) {
          const ragData = await ragResponse.json();
          ragContext = ragData.context || '';
          if (ragContext) console.log("✅ RAG Context Retrieved!");
        }
      }
    } catch (e) {
      console.warn('RAG Search failed:', e);
    }

    // Generate dynamic list of valid skills for the prompt
    const validSkillsList = Object.keys(SKILL_REFERENCE_IMAGES).join(', ');

    if (poseData && poseData.length > 0) {
      if (!isVerified) {
        // PRE-ANALYSIS VERIFICATION MODE
        systemInstruction = `
You are the Singapore PE Syllabus Assistant.
I have captured pose data from ${poseData.length} keyframes extracted evenly across the video.

**Pose measurements:**
${poseDescription}${movementPattern}
${biomechanicsReport || ''}

**YOUR GOAL (VERIFICATION PHASE):**
You must complete TWO phases before analysis can begin.
**PHASE 1**: Identify the Top 4 likely FMS Skills.
**PHASE 2**: Verify the Computer Vision data (Ball detection).

**VALID SKILLS LIST**: ${validSkillsList}

**INSTRUCTIONS:**
1. **Observe**: Look at the pose data and the visual input.
2. **Identify**: Pick the **TOP 4** most likely skills from the VALID SKILLS LIST.
   - If the movement is definitely NOT an FMS (e.g. Squat, Push-up), say it's an "Unknown Movement".
   - Otherwise, provide the 4 closest matches.
3. **Format**: Use the following tag at the end of your response:
   '[[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]]'
   Example: '[[SKILL_CHOICES: Underhand Throw, Overhand Throw, Underhand Roll, Bounce Pass]]'

4. **Call to Action**:
   - Ask: "I've detected your movement! Which of these 4 skills is it?"
   - Mention: "Once you select one, I'll proceed to the full analysis."

**RESTRICTIONS:**
- **DO NOT GRADE** the performance yet.
- **DO NOT** output the FMS Rubric or Checklist.
- JUST Identify the top 4 choices.
`;
      } else {
        // FULL ANALYSIS MODE
        systemInstruction += `

**CURRENT POSE DATA CONTEXT:**
I have captured pose data from ${poseData.length} keyframes extracted evenly across the video.

**Pose measurements:**
${poseDescription}${movementPattern}
${biomechanicsReport || ''}
${skillName ? `\n**TARGET SKILL**: ${skillName}` : ''}

**Immediate Task:**
${skillName ? `Proceed directly to grading "${skillName}" using the FMS Rubric. Refer to Biomechanics Report for critical errors.` : `Proceed with "STEP 1 - OBSERVE AND HYPOTHESIZE". Identify top 4 likely skills.`}

**IMPORTANT**:
- **Visual Evidence**: You MUST add a section called "**Visual Evidence**" where you quote specific differences between the provided Reference Image ("Gold Standard") and the User's Video ("Actual Performance").
- **CITATION RULE**: You MUST cite the specific frame number (e.g. "At Frame 12...") where the error or key event occurred. Do NOT say "consistent across all frames". Use the 'Ball Detected' status to confirm release points.
- **Teacher Check**: If the movement is partially obscured, ambiguous, or you are <70% confident, you MUST say: "I am not 100% sure about the [specific body part]. **This would require the assistance of a trained MOE PE teacher to verify.**"
- **FAILURE EXPLANATION**: When marking a feature as ❌, you MUST cite the specific frame and state what you observed instead (e.g. "At Frame 8, Knee angle was 175° (Straight) instead of <170°"). Do NOT claim "no frames found" if you have data; point to the frame that shows the error.

**CRITICAL CONSISTENCY RULE (PROFICIENCY VS CHECKLIST):**
- If you grade the Proficiency Level as "Keeping it Real" / "Developing" / "Beginning", you **MUST** have at least one ❌ or ⚠️ in the Checklist Assessment.
- **You cannot have a "Competent" checklist (all ✅) and a "Developing" grade.** They must tell the same story.
- **SPECIFIC OVERRIDE FOR UNDERHAND ROLL**: 
  - IF "Hand raised ABOVE HEAD" is detected in the Biomechanics Report, you **MUST MARK CHECKLIST ITEM #5 ("Swing dominant hand back at least to waist level") as ❌ OR ⚠️**.
  - Reason: "Excessive backswing violates the controlled nature of the skill."
  - **DO NOT** give a "Pass" just because it went *past* the waist. It must be *controlled* at the waist. "Too much" is a failure of the specific criteria.

- Pay close attention to the \`biomechanicsReport\` for definitive pass/fail on Step and Wind-up.
- **QUALITY CHECK**: If "Arm Height" is "ABOVE HEAD" for a low-skill like Underarm Roll, penalize it as "Excessive Movement" and FAIL the backswing criteria.
- **CAMERA ANGLE AWARENESS**:
  - The video might be filmed from the **Front** OR the **Side**.
  - **"Face Target"** means the user is looking towards *their* throwing direction.
  - If the video is a **Side Profile**, "Facing Target" will look like "Looking Forward" (to the side of the screen). Do NOT penalize the user for not looking at the Camera.
`;
      }
    } else {
      // No pose data case already handled by initial systemInstruction value
    }

    if (ragContext) {
      systemInstruction += `\n\n**ADDITIONAL RELEVANT KNOWLEDGE (From Uploaded Syllabus/PDF Documents):**\n${ragContext}\n\n*INSTRUCTION*: If this additional knowledge answers the user's question, prioritize it heavily and cite it.`;
    }

    // Construct the message parts (text + images)
    const parts: Part[] = [{ text: enhancedMessage }];

    // 1. ATTACH REFERENCE IMAGE (IF SKILL IS KNOWN OR DETECTED)
    // This gives the AI the "Gold Standard" to compare against
    // (activeSkillName was already detected earlier)

    if (activeSkillName && SKILL_REFERENCE_IMAGES[activeSkillName]) {
      console.log(`📘 Injecting Reference Image for: ${activeSkillName}`);

      // We need to fetch the image from the public folder and convert to base64
      // Since this runs in browser, we can use fetch
      try {
        const response = await fetch(SKILL_REFERENCE_IMAGES[activeSkillName]);

        if (!response.ok) {
          throw new Error(`Failed to fetch reference image: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
          throw new Error(`Invalid content type for reference image: ${contentType}. Expected image/*`);
        }

        const blob = await response.blob();
        const reader = new FileReader();

        const base64Reference = await new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            // Handle both data URL formats just in case
            const base64 = result.includes('base64,')
              ? result.split('base64,')[1]
              : result;
            resolve(base64);
          };
          reader.readAsDataURL(blob);
        });

        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Reference
          }
        });

        // Add a text note telling AI which image is which
        parts.push({ text: "\n\n[SYSTEM NOTE]: The first image attached above is the TEXTBOOK REFERENCE (Gold Standard). The subsequent images below are the USER'S PERFORMANCE. Compare the user's form to the reference image." });

      } catch (e) {
        console.error("Failed to load reference image", e);
      }
    }

    // Helper to compress images for Vercel Payload Limits (4.5MB)
    const compressBase64Image = async (base64: string, maxWidth = 640, quality = 0.6): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        // Ensure prefix
        const src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
        img.src = src;

        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if too big
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(base64.replace(/^data:image\/[a-z]+;base64,/, ''));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl.split(',')[1]);
        };

        img.onerror = () => {
          // If compression fails, return original (but stripped)
          resolve(base64.replace(/^data:image\/[a-z]+;base64,/, ''));
        };
      });
    };

    if (mediaAttachments && mediaAttachments.length > 0) {
      console.log(`📎 Attaching ${mediaAttachments.length} images/frames to prompt`);

      // Process serially to be safe
      for (const media of mediaAttachments) {
        // Strip data URL prefix if present for logic, but compression needs it
        let base64Data = media.data;

        // ONLY Compress if we are sending to Server (VS PROD MODE)
        // OR always compress to be safe? 
        // Let's always compress video analysis frames as they can be huge (10 frames * 1MB = 10MB)
        try {
          console.log("Compressing frame for upload...");
          base64Data = await compressBase64Image(media.data);
        } catch (e) {
          console.warn("Compression failed, sending original", e);
          base64Data = media.data.replace(/^data:image\/[a-z]+;base64,/, '');
        }

        parts.push({
          inlineData: {
            mimeType: media.mimeType,
            data: base64Data
          }
        });
      }
    }

    let result;
    let text = "";
    let groundingChunks: GroundingChunk[] = [];
    let tokenUsage = 0;

    // --- HYBRID EXECUTOR ---
    // If LOCAL (DEV) -> Use Direct Client Key (Fast, no server setup needed)
    // If PROD -> Use Serverless Proxy (Secure, hides key)
    if (import.meta.env.DEV) {
      console.log("🔧 DEV MODE: Using direct Client-Side API Key");

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is missing in .env.local");

      const ai = new GoogleGenAI({ apiKey });

      const chat = ai.chats.create({
        model: MODEL_NAME,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
        },
        history: history
      });

      result = await chat.sendMessage({ message: parts as any });

      // Safety check - ensure we have a valid response
      if (!result) {
        throw new Error("Gemini API returned an empty response. This is usually due to Safety Filters or Quota Limits.");
      }

      const response = result.response || result;
      text = typeof response.text === 'function' ? response.text() :
        (response.candidates?.[0]?.content?.parts?.[0]?.text || "");

      groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      tokenUsage = response.usageMetadata?.totalTokenCount || 0;

    } else {
      console.log("🚀 PROD MODE: Using Secure Serverless Function");

      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          history: history,
          message: parts, // Send the array of text/images
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }] // Request search tool
        }),
      });

      if (!response.ok) {
        let errorMsg = response.statusText;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.details || response.statusText;
        } catch (_) { /* ignore JSON parse error */ }
        throw new Error(`${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      text = data.text || '';
      groundingChunks = data.groundingChunks || [];
      tokenUsage = data.tokenUsage || 0;

      // Detect empty / blocked responses
      if (!text || text.trim().length === 0) {
        const reason = data.finishReason;
        if (reason === 'SAFETY') {
          throw new Error('safety: The AI blocked this response. Try rephrasing your question.');
        } else if (reason === 'RECITATION') {
          throw new Error('recitation: The AI blocked this response due to recitation policy.');
        } else {
          throw new Error('no candidates: The AI returned an empty response. Please try rephrasing.');
        }
      }
    }

    // Check for DISPLAY_REFERENCE tag in text
    let finalReferenceURI = (activeSkillName && SKILL_REFERENCE_IMAGES[activeSkillName]) ? SKILL_REFERENCE_IMAGES[activeSkillName] : undefined;

    // Regex to find [[DISPLAY_REFERENCE: Skill Name]]
    const referenceTagMatch = text.match(/\[\[DISPLAY_REFERENCE:\s*([^\]]+)\]\]/);
    if (referenceTagMatch) {
      const suggestedSkill = referenceTagMatch[1].trim();
      if (SKILL_REFERENCE_IMAGES[suggestedSkill]) {
        finalReferenceURI = SKILL_REFERENCE_IMAGES[suggestedSkill];
        console.log(`🖼️ AI triggered reference image for: ${suggestedSkill}`);
      }
    }

    // Clean the tag from the displayed text
    const cleanText = text.replace(/\[\[DISPLAY_REFERENCE:\s*[^\]]+\]\]/g, '').trim();

    // LOGGING TO SUPABASE (Fire and Forget)
    if (sessionId) {
      // Don't await this, let it run in background to not block UI
      import('../db/supabaseClient').then(({ logChatToDB }) => {
        logChatToDB(
          sessionId,
          currentMessage,
          cleanText,
          activeSkillName || undefined,
          {
            model: MODEL_NAME,
            tokenUsage,
            hasMedia: mediaAttachments && mediaAttachments.length > 0
          }
        );
      });
    }

    return {
      text: cleanText,
      groundingChunks,
      referenceImageURI: finalReferenceURI,
      tokenUsage: tokenUsage
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
