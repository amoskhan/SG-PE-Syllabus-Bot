
import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, PROFICIENCY_RUBRIC, SKILL_REFERENCE_IMAGES, getSkillChecklist } from '../../data/fundamentalMovementSkillsData';
import { getFewShotExamples } from '../../data/skillExamples';
import { PE_SYLLABUS_TEXT } from '../../data/syllabusData';
import { MediaData } from './geminiService';

// Note: In development, we can use VITE_OPENROUTER_API_KEY. 
// In production (Vercel), we should use the server-side proxy /api/openrouter to hide the key.
const VITE_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
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
- Look at the pose data calculation stats provided.
- Make a cautious educated guess about which fundamental movement skill is being performed.
- Respond: "Based on the pose data, I believe this might be a **[movement name]**. Is this correct?"

**STEP 2A - IF USER CONFIRMS (yes/confirm):**
- **CRITICAL**: You must grade the performance by checking off EACH critical feature from the Checklist for that skill.
- **SMOOTHNESS CHECK (THE "ROBOT" RULE)**:
  - If all technical points are met BUT the movement is "Segmented", "Robotic", or lacks "Flow" -> **DOWNGRADE to 'Developing'**.
  - **Competent** requires BOTH technical accuracy AND fluid kinetic chain.

- **DETERMINE LEVEL**:
  - Mistake in >50% of items? → **Beginning**
  - Missed 1-2 items OR Robotic/Segmented? → **Developing**
  - Hit ALL items + Fluid Motion? → **Competent**
  - Hit ALL items + Exceptional quality? → **Excellent**

- Provide a detailed assessment in this format.
  **REQUIRED OUTPUT FORMAT (START RESPONSE WITH THIS HEADER):**

  **Performance Analysis for [Movement Name]:**

  **Checklist Assessment:**
  - ✅ [Feature 1]: Observed (Evidence: "At Frame 3, Knee Angle was **135°**...")
  - ✅ [Feature 2]: Observed (Evidence: "Hand velocity increased to **Max** in Frame 6")
  - ❌ [Feature 3]: NOT Observed (Evidence: "Elbow was **locked at 180°**, expected bent")
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
    referenceImageURI?: string;
}

export const sendMessageToOpenRouter = async (
    history: { role: string; content: string }[],
    currentMessage: string,
    poseData?: import('../vision/poseDetectionService').PoseData[],
    mediaAttachments?: MediaData[],
    skillName?: string,
    isVerified?: boolean,
    modelId?: 'nemotron',
    sessionId?: string
): Promise<ChatResponse & { tokenUsage?: number }> => {
    try {
        const useProxy = !VITE_API_KEY;

        if (useProxy && window.location.hostname === 'localhost') {
            console.warn("⚠️ No VITE_OPENROUTER_API_KEY found. Attempting to use /api/openrouter proxy. Ensure you are running with 'vercel dev'.");
        }

        let enhancedMessage = currentMessage;
        let poseDescription = '';
        let movementPattern = '';
        let biomechanicsReport = '';

        // If pose data is provided, analyze it and enhance the message
        // ONLY if this is the first turn (History is empty) OR if the user is explicitly asking to analyze
        // AND there are no media attachments (because if we have video, the model can SEE it, so pose data is just backup context)
        // NOTE: We check for 0 or 1 message if the first one is 'assistant' (Welcome message)
        const isFirstMessage = history.length === 0 || (history.length === 1 && history[0].role === 'assistant');

        // Try to identify skill name if not provided but we are in verification mode or have pose data
        let activeSkillName = skillName;
        if (!activeSkillName && (poseData || isVerified)) {
            const lowerMsg = currentMessage.toLowerCase();
            // Sort keys by length desc to prevent partial matches
            const knownSkills = Object.keys(SKILL_REFERENCE_IMAGES).sort((a, b) => b.length - a.length);
            for (const skill of knownSkills) {
                if (lowerMsg.includes(skill.toLowerCase())) {
                    activeSkillName = skill;
                    break;
                }
            }
        }


        if (poseData && poseData.length > 0 && isFirstMessage) {
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
                // let releaseFrame = -1; // Placeholder for future ball integration

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

                    // const rightFootMoveY = curr[28].y - prev[28].y;

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
            ${poseDescription}
            ${movementPattern}
            ${biomechanicsReport}
            ${userTargetSkill}

            **Your task:**
            1. **Analyze the Kinetic Chain**: Look at the "Movement patterns" above. Is the movement fluid and sequential (e.g., legs -> torso -> arms) or "segmented" (robotic/broken)?
            2. **Biomechanics Check**: Read the "BIOMECHANICS ANALYSIS" above.
            3. ${activeSkillName ? `**IMMEDIATE ACTION**: Analyze "${activeSkillName}" using the FMS Checklist & Rubric. (Confirmation step is SKIPPED).` : `**Observe and Hypothesize**: Based on the pose data and movement flow, make your best educated guess about which fundamental movement skill this is.`}
            ${activeSkillName ? '' : `4. Respond in this format: "Based on the pose data, I believe this is a **[movement name]**. Is this correct?" then wait for confirmation.`}
            5. ${activeSkillName ? 'Assessment' : 'If confirmed -> Grade'} using the FMS Checklist & Rubric.
            - **Step Verification**: If "DISTINCT STEP DETECTED", credit the step criteria.
            - **Quality Control**: Even if all checkboxes are technically met, if the movement looks "Chaotic", "Excessive", or "Segmented", you MUST downgrade the Proficiency Level to "Developing" or "Beginning" and explain why.

            **CRITICAL CONSISTENCY RULE (PROFICIENCY VS CHECKLIST):**
            - If you grade the Proficiency Level as "Keeping it Real" / "Developing" / "Beginning", you **MUST** have at least one ❌ or ⚠️ in the Checklist Assessment.
            - **You cannot have a "Competent" checklist (all ✅) and a "Developing" grade.** They must tell the same story.
            - **SPECIFIC OVERRIDE FOR UNDERHAND ROLL**: 
              - IF "Hand raised ABOVE HEAD" is detected in the Biomechanics Report, you **MUST MARK CHECKLIST ITEM #5 ("Swing dominant hand back at least to waist level") as ❌ OR ⚠️**.
              - Reason: "Excessive backswing violates the controlled nature of the skill."
              - **DO NOT** give a "Pass" just because it went *past* the waist. It must be *controlled* at the waist. "Too much" is a failure of the specific criteria.
`;
        }

        // Choose appropriate system instruction
        let systemInstruction = '';



        let specificChecklistText = FUNDAMENTAL_MOVEMENT_SKILLS_TEXT;
        if (activeSkillName) {
            const checklist = getSkillChecklist(activeSkillName);
            if (checklist.length > 0) {
                specificChecklistText = `*** OFFICIAL CHECKLIST FOR ${activeSkillName} ***
                 You MUST evaluate EACH of the following ${checklist.length} criteria. DO NOT SKIP ANY/MERGE ANY.
                 
                 ${checklist.join('\n')}
                 
                 (END OF CHECKLIST)`;
            }
        }

        const baseInstruction = poseData && poseData.length > 0
            ? MOTION_ANALYSIS_INSTRUCTION
            : FULL_SYSTEM_INSTRUCTION;

        if (poseData && poseData.length > 0 && (isFirstMessage || isVerified)) {
            if (!isVerified) {
                // PRE-ANALYSIS VERIFICATION MODE (Phase 1: Identification ONLY)
                systemInstruction = `
                You are the Singapore PE Syllabus Assistant.
                
                **IMMEDIATE TASK (PHASE 1)**:
                Identify the specific Fundamental Movement Skill (FMS) in the video/images.
                            
                **VALID FMS SKILLS (STRICT WHITELIST)**: 
                Underhand Throw, Underhand Roll, Overhand Throw, Kick, Dribble (Hand), Dribble (Foot), Chest Pass, Catch above waist, Bounce pass, Bounce.

                **CRITICAL RULES:**
                1. You must ONLY classify the movement as one of the exact keys above.
                2. Do not use synonyms (e.g. NEVER say "Free Throw", say "Underhand Throw" or "Chest Pass" if it matches one of those patterns, otherwise "Unknown").
                3. If the movement does not match any of the above skills, output "❌ **Unknown Movement**".
                
                **INSTRUCTIONS**:
                1. Look at the visual evidence and pose data.
                2. Identify the skill from the WHITELIST.
                3. **STOP**. Do NOT grade it yet.
                
                **REQUIRED OUTPUT FORMAT**:
                "Phase 1: I have detected a **[Skill Name]**."

                Example: "Phase 1: I have detected a **Kick**."
                
                ${activeSkillName ? `
                **USER OVERRIDE**:
                The user has explicitly stated this is a **${activeSkillName}**.
                Unless the video clearly contradicts it (e.g. user says "Kick" but video shows "Throw"), you should CONFIRM this skill.
                Output: "Phase 1: I have detected a **${activeSkillName}**."
                ` : ''}

                If the movement is random or unclear:
                "❌ **Unknown Movement**. Please demonstrate a standard PE skill."
                `;
            } else {
                // ANALYSIS MODE (Phase 2: Grading)
                systemInstruction = `
                You are the PE Syllabus Assistant.
                
                **TASK**: Compare the User's Video (Visual Evidence) against the Gold Standard (Reference Image) using the FMS Checklist.

                **VALID SKILLS ONLY**: Underhand Throw, Underhand Roll, Overhand Throw, Kick, Dribble (Hand), Dribble (Foot), Chest Pass, Catch above waist, Bounce pass, Bounce.
                (If the movement is "Free Throw", "Shooting", etc., classify it as the CLOSEST VALID SKILL or "Unknown").

                **INPUTS:**
                1. **IMAGE 1 (Reference)**: The "Gold Standard" textbook form.
                2. **IMAGES 2+ (User)**: The user's actual performance.
                3. **POSE DATA**: Biomechanical stats (Angles, Velocities) to support your visual findings.

                **CRITICAL RULES:**
                1. **LOOK AT THE IMAGES**. Do not just rely on pose data. Compare the user's arm angles, leg positions, and posture to the Reference Image.
                2. **STRICT FORMATTING (CLEAN TEXT)**:
                   - **NO** Markdown Headers (Do not use #, ##, ###).
                   - **NO** Tables (Do not use | | |).
                   - **NO** Horizontal Rules (Do not use ---).
                   - Use **Bold** for section titles.
                   - Use simple dashed lists (-) for items.

                **REQUIRED OUTPUT FORMAT:**

                **Performance Analysis for [Movement Name]:**

                **Checklist Assessment:**
                (For each criterion, cite the Frame Number where you observed the evidence)
                - ✅ [Criterion 1]: Observed (Evidence: "In **Frame 3**, knees bent to 90 deg")
                - ❌ [Criterion 2]: NOT Observed (Evidence: "Looking at **Frame 5-7**, step was with same foot")
                (List ALL criteria items from the checklist below)

                **Proficiency Level: [Beginning / Developing / Competent / Excellent]**
                *(Reason: You met X out of Y criteria...)*

                **Feedback for Improvement:**
                1. [Specific correction for the missed feature]
                2. [Cue to remember]

                **CONTEXT DATA (FMS CHECKLISTS):**
                ${specificChecklistText}
                ${activeSkillName ? getFewShotExamples(activeSkillName) : ''}
                
                **POSE DATA:**
                ${poseDescription}${movementPattern}
                ${biomechanicsReport || ''}
                ${activeSkillName ? `\n**TARGET SKILL**: ${activeSkillName}` : ''}
                `;
            }
        } else {
            systemInstruction = baseInstruction;
        }


        // Convert OpenRouter History (Role/Content) to API payload format, handling images if any
        // Note: OpenRouter supports content as an array for multimodal messages:
        // { role: "user", content: [ { type: "text", text: "..." }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } } ] }

        // Sanitize history: The first message after system MUST be 'user' for some models (like Nova/Claude)
        // If the first message in history is 'assistant' (e.g. Welcome message), remove it.
        let sanitizedHistory = [...history];
        while (sanitizedHistory.length > 0 && sanitizedHistory[0].role !== 'user') {
            sanitizedHistory.shift();
        }

        // AGGRESSIVE TRUNCATION
        // If history is too long, keep only the last few turns.
        const MAX_HISTORY_TURNS = 10;
        if (sanitizedHistory.length > MAX_HISTORY_TURNS) {
            console.log(`⚠️ Truncating history from ${sanitizedHistory.length} to ${MAX_HISTORY_TURNS} to save context.`);
            sanitizedHistory = sanitizedHistory.slice(-MAX_HISTORY_TURNS);
        }

        const openRouterMessages: any[] = [
            { role: "system", content: systemInstruction },
            ...sanitizedHistory
        ];

        // Construct the CURRENT user message
        let finalMessageContent = enhancedMessage;

        // [DEV TOOL] Log the full prompt data so we can copy it for Few-Shot Learning examples
        if (poseData && poseData.length > 0) {
            console.log("👇👇 COPY FROM HERE (FEW-SHOT DATA) 👇👇");
            console.log(enhancedMessage);
            console.log("👆👆 COPY TO HERE 👆👆");
        }

        // CRITICAL: For Nemotron/Nova (Smaller models), they often forget the System Instruction "Phase 1" rule
        // because the Pose Data context is so large. We must REMIND them at the END of the prompt.
        // HOWEVER: 
        // 1. If a specific skillName is provided by the system/user (meaning it's trusted), we do NOT force Phase 1.
        // 2. If there is NO visual data (text-only query), we do NOT force Phase 1.
        const hasVisualContext = (mediaAttachments && mediaAttachments.length > 0) || (poseData && poseData.length > 0);


        const userContent: any[] = [
            { type: "text", text: finalMessageContent }
        ];

        // 1. ATTACH REFERENCE IMAGE (ONLY IF VERIFIED)
        // This gives the AI the "Gold Standard" to compare against, but ONLY after Phase 1 (Identification) is complete.
        let finalReferenceURI: string | undefined = undefined;

        if (isVerified) {
            // Auto-detect skill from text if not explicitly provided
            if (activeSkillName && SKILL_REFERENCE_IMAGES[activeSkillName]) {

                console.log(`📘 [OpenRouter] Injecting Reference Image for: ${activeSkillName}`);
                finalReferenceURI = SKILL_REFERENCE_IMAGES[activeSkillName];

                try {
                    const response = await fetch(SKILL_REFERENCE_IMAGES[activeSkillName]);
                    if (!response.ok) throw new Error("Failed to fetch reference image");

                    const blob = await response.blob();
                    const reader = new FileReader();
                    const base64Reference = await new Promise<string>((resolve) => {
                        reader.onloadend = () => {
                            const result = reader.result as string;
                            // Strip prefix if present, though OpenRouter might handle it? 
                            // safely sending full data URL usually works better with 'url' field
                            resolve(result);
                        };
                        reader.readAsDataURL(blob);
                    });

                    // Add Reference Image FIRST (Context)
                    userContent.push({
                        type: "image_url",
                        image_url: {
                            url: base64Reference
                        }
                    });

                    // Add a text note telling AI which image is which
                    userContent.push({
                        type: "text",
                        text: "\n\n[SYSTEM NOTE]: The IMAGE ATTACHED ABOVE is the TEXTBOOK REFERENCE (Gold Standard). The images BELOW (if any) are the USER'S PERFORMANCE. Compare the user's form to the reference image."
                    });

                } catch (e) {
                    console.error("Failed to load reference image for OpenRouter", e);
                }
            }
        }

        // If we have media attachments (images/frames), attach them for the model to SEE
        if (mediaAttachments && mediaAttachments.length > 0) {
            let processedAttachments = mediaAttachments;

            // Molmo has strict 6-image limit per prompt
            const maxUserFrames = 6;

            processedAttachments.forEach(media => {
                // Ensure data URL proper format
                // Check if it's already a data URL
                const dataUrl = media.data.trim().startsWith('data:')
                    ? media.data
                    : `data:${media.mimeType};base64,${media.data}`;

                userContent.push({
                    type: "image_url",
                    image_url: {
                        url: dataUrl
                    }
                });
            });
            console.log(`[OpenRouterService] Attached ${processedAttachments.length} images for vision processing.`);
        }

        openRouterMessages.push({
            role: "user",
            content: userContent
        });

        // Map internal model IDs to OpenRouter model strings
        const modelMap: Record<string, string> = {
            'nemotron': 'nvidia/nemotron-nano-12b-v2-vl:free',
        };

        const targetModel = modelMap[modelId || 'nemotron'] || 'nvidia/nemotron-nano-12b-v2-vl:free';

        console.log(`🤖 Using OpenRouter Model: ${targetModel}`);

        const endpoint = useProxy ? '/api/openrouter' : "https://openrouter.ai/api/v1/chat/completions";

        const headers: any = {
            "HTTP-Referer": SITE_URL,
            "X-Title": SITE_NAME,
            "Content-Type": "application/json"
        };

        if (!useProxy) {
            headers["Authorization"] = `Bearer ${VITE_API_KEY}`;
        }

        // This is a TRUE MULTIMODAL model (Vision + Text)
        const response = await fetch(endpoint, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                "model": targetModel,
                "messages": openRouterMessages,
                "temperature": 0.5,
                "max_tokens": 5000,
                "transforms": ["middle-out"]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error response:', errorText);
            throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log("🟢 OpenRouter Raw Response:", JSON.stringify(data, null, 2)); // Debug log

        if (data.error) {
            throw new Error(`API Error: ${data.error.message || JSON.stringify(data.error)}`);
        }

        const responseText = data.choices?.[0]?.message?.content || "I couldn't generate a response (No content received).";
        const tokenUsage = data.usage?.total_tokens;

        // LOGGING TO SUPABASE (Fire and Forget)
        if (sessionId) {
            import('../db/supabaseClient').then(({ logChatToDB }) => {
                logChatToDB(
                    sessionId,
                    finalMessageContent,
                    responseText, // The final text
                    activeSkillName || undefined,
                    {
                        model: targetModel,
                        tokenUsage: data.usage?.total_tokens || 0,
                        hasMedia: mediaAttachments && mediaAttachments.length > 0
                    }
                );
            });
        }

        return {
            text: responseText,
            tokenUsage: data.usage?.total_tokens || 0,
            referenceImageURI: finalReferenceURI
        };
    } catch (error) {
        console.error("OpenRouter API Error:", error);
        throw error;
    }
};
