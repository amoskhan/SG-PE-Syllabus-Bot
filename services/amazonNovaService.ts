
import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, PROFICIENCY_RUBRIC, SKILL_REFERENCE_IMAGES } from './fundamentalMovementSkillsData';
import { PE_SYLLABUS_TEXT } from './syllabusData';
import { MediaData } from './geminiService';

// Note: Using the shared OpenRouter API Key
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "";
const SITE_URL = import.meta.env.VITE_SITE_URL || "http://localhost:3000";
const SITE_NAME = "SG PE Syllabus Bot";

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

const MOTION_ANALYSIS_INSTRUCTION = `
You are the Singapore PE Syllabus Assistant, specializing in analyzing Fundamental Movement Skills (FMS).

You have access to the **Fundamental Movement Skills (FMS) Checklist** as your primary source of truth.

**FUNDAMENTAL MOVEMENT SKILLS CHECKLIST:**
${FUNDAMENTAL_MOVEMENT_SKILLS_TEXT}

**PROFICIENCY RUBRIC (GRADING RULES):**
${PROFICIENCY_RUBRIC}

**Your Role:**
Analyze movement patterns based on the provided POSE DATA textual description and grade them strictly based on the FMS Checklist and Rubric above.

**POSE DATA ANALYSIS WORKFLOW:**

**STEP 1 - OBSERVE AND HYPOTHESIZE:**
- Look at the pose data calculation stats provided.
- Make a cautious educated guess about which fundamental movement skill is being performed.
- Respond: "Based on the pose data, I believe this might be a **[movement name]**. Is this correct?"

**STEP 2A - IF USER CONFIRMS (yes/confirm):**
- **CRITICAL**: You must grade the performance by checking off EACH critical feature from the Checklist for that skill.
- **DETERMINE LEVEL**:
  - Mistake in >50% of items? → **Beginning**
  - Missed 1-2 items? → **Developing**
  - Hit ALL items? → **Competent**
  - Hit ALL items + Exceptional quality? → **Excellent**

- Provide a detailed assessment in this format:

  **Performance Analysis for [Movement Name]:**

  **Checklist Assessment:**
  - ✅ [Feature 1]: Observed (Brief evidence from data)
  - ✅ [Feature 2]: Observed
  - ❌ [Feature 3]: NOT Observed (Evidence: e.g. "Did not step with opposite foot")
  - ... (List all relevant features)

  **Proficiency Level: [Beginning / Developing / Competent / Excellent]**
  *(Reason: You met X out of Y criteria...)*

  **Feedback for Improvement:**
  1. [Specific correction for the missed feature]
  2. [Cue to remember]

**STEP 2B - IF USER SAYS NO:**
- Ask for the correct movement name, then apply the same grading logic as above.
`;

export interface ChatResponse {
    text: string;
}

export const sendMessageToAmazonNova = async (
    history: { role: string; content: string }[],
    currentMessage: string,
    poseData?: import('./poseDetectionService').PoseData[],
    mediaAttachments?: MediaData[],
    skillName?: string,
    isVerified?: boolean
): Promise<ChatResponse & { tokenUsage?: number }> => {
    try {
        if (!OPENROUTER_API_KEY) {
            throw new Error("OpenRouter API key not configured. Please add VITE_OPENROUTER_API_KEY to your .env.local file.");
        }

        let enhancedMessage = currentMessage;
        let poseDescription = '';
        let movementPattern = '';
        let biomechanicsReport = '';

        // If pose data is provided, analyze it and enhance the message
        // ONLY if this is the first turn (History is empty) OR if the user is explicitly asking to analyze
        // AND there are no media attachments (because if we have video, the model can SEE it, so pose data is just backup context)
        const isFirstMessage = history.length === 0;

        if (poseData && poseData.length > 0 && isFirstMessage) {
            const { poseDetectionService } = await import('./poseDetectionService');
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

            const userTargetSkill = skillName ? `\n**USER DECLARED SKILL**: "${skillName}".\nNOTE: The user has explicitly identified this movement.\nDO NOT ASK "Is this correct?".\nDO NOT GUESS.\nPROCEED DIRECTLY TO GRADING.` : '';

            enhancedMessage = `I've captured pose data from ${poseData.length} keyframes extracted evenly across the video duration.

            **Pose measurements (Textual Description):**
            ${poseDescription}${movementPattern}
            ${biomechanicsReport}
            ${userTargetSkill}

            **Your task:**
            1. **Analyze the Kinetic Chain**: Look at the "Movement patterns" above. Is the movement fluid and sequential (e.g., legs -> torso -> arms) or "segmented" (robotic/broken)?
            2. **Biomechanics Check**: Read the "BIOMECHANICS ANALYSIS" above.
            3. ${skillName ? `**IMMEDIATE ACTION**: Analyze "${skillName}" using the FMS Checklist & Rubric. (Confirmation step is SKIPPED).` : `**Observe and Hypothesize**: Based on the pose data and movement flow, make your best educated guess about which fundamental movement skill this is.`}
            ${skillName ? '' : `4. Respond in this format: "Based on the pose data, I believe this is a **[movement name]**. Is this correct?" then wait for confirmation.`}
            5. ${skillName ? 'Assessment' : 'If confirmed -> Grade'} using the FMS Checklist & Rubric.
            - **Step Verification**: If "DISTINCT STEP DETECTED", credit the step criteria.
            - **Quality Control**: Even if all checkboxes are technically met, if the movement looks "Chaotic", "Excessive", or "Segmented", you MUST downgrade the Proficiency Level to "Developing" or "Beginning" and explain why.`;
        }

        // Choose appropriate system instruction
        let systemInstruction = '';
        const baseInstruction = poseData && poseData.length > 0
            ? MOTION_ANALYSIS_INSTRUCTION
            : FULL_SYSTEM_INSTRUCTION;

        const validSkillsList = Object.keys(SKILL_REFERENCE_IMAGES).join(', ');

        if (poseData && poseData.length > 0 && isFirstMessage) {
            if (!isVerified) {
                // PRE-ANALYSIS VERIFICATION MODE (Text Only)
                systemInstruction = `
                You are the Singapore PE Syllabus Assistant.
                I have captured pose data from ${poseData.length} keyframes extracted evenly across the video.

                **Pose measurements:**
                ${poseDescription}${movementPattern}
                ${biomechanicsReport || ''}

                **YOUR GOAL (VERIFICATION PHASE):**
                You must complete TWO phases before analysis can begin.
                **PHASE 1**: Identify the FMS Skill.
                **PHASE 2**: Verify the Computer Vision data (Ball detection).

                **VALID SKILLS LIST**: ${validSkillsList}

                **INSTRUCTIONS:**
                1. **Listen to Context**: Check if the user is CORRECTING a previous guess (e.g., "No, it's a kick", "Underhand Roll").
                   - If **User Corrects**: Accept their label immediately. Response: "Phase 1: I have detected a **[User's Skill Name]**."
                
                2. **Observe (If no user correction)**: Look at the text pose data provided.
                3. **Validate**: Is this a valid FMS from the list above?
                - If **NO** (e.g. Push Up, Squat, Random Movement):
                    - Response: "❌ **Unknown Movement**. This movement is not in the official FMS Checklist."
                    - **DO NOT** proceed to Phase 2.
                - If **YES** (e.g. Kick):
                    - Response: "Phase 1: I have detected a **[Skill Name]**."
                    (IMPORTANT: You MUST wrap the skill name in double asterisks like **Kick** so the system can read it).

                3. **Verify**: Ask the user to check the frames.
                - Response: "Phase 2: Please verify the ball detection in the viewer."

                4. **Call to Action**:
                - Response: "Once you have confirmed the Skill, click 'Analyze Now' to proceed to grading."

                **RESTRICTIONS:**
                - **DO NOT GRADE** the performance yet.
                - **DO NOT** output the FMS Rubric or Checklist.
                - **DO NOT** give feedback on knees, arms, or technique.
                - JUST Identify and Verify.
                `;
            } else {
                systemInstruction = `${baseInstruction}

                **CURRENT POSE DATA CONTEXT:**
                I have captured pose data from ${poseData.length} keyframes extracted evenly across the video.

                **Pose measurements:**
                ${poseDescription}${movementPattern}
                ${biomechanicsReport || ''}
                ${skillName ? `\n**TARGET SKILL**: ${skillName}` : ''}

                **Immediate Task:**
                ${skillName ? `Proceed directly to grading "${skillName}" using the FMS Rubric. Refer to Biomechanics Report for critical errors.` : `Proceed with "STEP 1 - OBSERVE AND HYPOTHESIZE".`}
                `;
            }
        } else {
            systemInstruction = baseInstruction;
        }


        // Convert OpenRouter History (Role/Content) to API payload format, handling images if any
        // Note: OpenRouter supports content as an array for multimodal messages:
        // { role: "user", content: [ { type: "text", text: "..." }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } } ] }

        const openRouterMessages: any[] = [
            { role: "system", content: systemInstruction },
            ...history // Existing history is just text for now
        ];

        // Construct the CURRENT user message
        const userContent: any[] = [
            { type: "text", text: enhancedMessage }
        ];

        // If we have media attachments (images/frames), attach them for the model to SEE
        if (mediaAttachments && mediaAttachments.length > 0) {
            mediaAttachments.forEach(media => {
                // Ensure data URL proper format
                const dataUrl = `data:${media.mimeType};base64,${media.data}`;
                userContent.push({
                    type: "image_url",
                    image_url: {
                        url: dataUrl
                    }
                });
            });
            console.log(`[AmazonNovaService -> Gemini2] Attached ${mediaAttachments.length} images for vision processing.`);
        }

        openRouterMessages.push({
            role: "user",
            content: userContent
        });

        // Using Google Gemini 2.0 Flash (Experimental) via OpenRouter
        // This is a TRUE MULTIMODAL model (Vision + Text)
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "amazon/nova-2-lite-v1",
                "messages": openRouterMessages,
                "temperature": 0.7,
                "max_tokens": 2000
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter Amazon Nova API error response:', errorText);
            throw new Error(`OpenRouter Amazon Nova API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const text = data.choices[0]?.message?.content || "I couldn't generate a response.";
        const tokenUsage = data.usage?.total_tokens;

        return { text, tokenUsage };
    } catch (error) {
        console.error("Amazon Nova API Error:", error);
        throw error;
    }
};
