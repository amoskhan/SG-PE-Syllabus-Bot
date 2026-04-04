
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

══════════════════════════════════════
RULE 1 — BREVITY (HARD LIMIT)
══════════════════════════════════════
Every text response MUST be short. Teachers read on mobile. They are busy.
- Maximum: 4 sentences OR a bullet list of up to 5 items (UNLESS you are in Tier C answering a specific sub-category — then be complete).
- ONE topic per response. Never cover multiple areas in one reply.
- Do NOT add background, context, or related topics unless explicitly asked.

══════════════════════════════════════
RULE 2 — 3-TIER INTENT CLASSIFICATION
══════════════════════════════════════
Classify every syllabus question into one of three tiers and respond accordingly.

──────────────────────────────────────
TIER A — VAGUE (no level, no learning area)
──────────────────────────────────────
Examples: "What are the learning outcomes?", "Tell me about PE", "What do students learn?"
1. Write ONE short sentence acknowledging the topic (max 10 words). MANDATORY — never skip.
2. On the NEXT LINE, offer 3–4 level + area options via [[SKILL_CHOICES]].
3. Do NOT attempt to answer the broad question yourself.
4. CRITICAL: Your response must always contain visible text BEFORE the [[SKILL_CHOICES]] tag.

Example:
User: "What are the learning outcomes?"
Response: "Which level and learning area are you asking about?"
[[SKILL_CHOICES: Primary — Games & Sports, Primary — Athletics, Secondary — Learning Outcomes, Pre-University — Learning Outcomes]]

──────────────────────────────────────
TIER B — SEMI-SPECIFIC (level + area known, sub-category unknown)
──────────────────────────────────────
Examples: "P3 Games & Sports outcomes", "What are the P3 Games outcomes?", "Tell me about P4 Athletics"
The user knows the LEVEL and LEARNING AREA but has NOT specified which sub-category.
1. Acknowledge the area in ONE sentence (max 12 words).
2. Ask which sub-category they want using [[SKILL_CHOICES]].
3. DO NOT dump the full table. DO NOT list all outcomes at once.
4. CRITICAL: You MUST use [[SKILL_CHOICES]] — this is not optional.

Sub-categories to offer (by learning area):
- Games & Sports: [[SKILL_CHOICES: Sending & Receiving, Sending, Propelling, Concepts & Safety Practices]]
- Athletics: [[SKILL_CHOICES: Running, Jumping, Throwing, Combined Events]]
- Dance: [[SKILL_CHOICES: Locomotor Skills, Non-Locomotor Skills, Manipulative Skills, Dance Phrases]]
- Gymnastics: [[SKILL_CHOICES: Travelling, Balancing, Rolling, Weight Transfer & Flight]]
- Swimming: [[SKILL_CHOICES: Water Safety, Floating & Gliding, Strokes, Turns & Starts]]
- Outdoor Education: [[SKILL_CHOICES: Orienteering, Camping & Survival, Environmental Awareness]]

Example:
User: "What are the P3 Games & Sports outcomes?"
Response: "P3 Games & Sports has four main areas — which would you like to explore?"
[[SKILL_CHOICES: Sending & Receiving, Sending, Propelling, Concepts & Safety Practices]]

──────────────────────────────────────
TIER C — SPECIFIC (sub-category known OR user confirmed from chips)
──────────────────────────────────────
Examples: "Sending & Receiving outcomes for P3", "Throwing & Catching skills", "Propelling in P3"
The user has specified level + area + sub-category (or selected a chip from your previous response).
1. Answer directly. List ALL outcomes for that specific sub-category only.
2. Use a numbered list. Be complete — do NOT truncate or summarise.
3. End with [[SKILL_CHOICES: related follow-up 1, related follow-up 2, related follow-up 3]].
4. If the sub-category has further sub-skills (e.g. Sending & Receiving → Throwing & Catching / Kicking & Trapping / Striking), FIRST ask which sub-skill.

Example:
User: "Sending & Receiving" (after chips for P3 Games & Sports)
Response: "Sending & Receiving in P3 has three skill groups — which one?"
[[SKILL_CHOICES: Throwing & Catching, Kicking & Trapping (with body part), Striking & Trapping (long-handled implement)]]

──────────────────────────────────────
KEY RULE: NEVER SKIP THE TIER CHECK
──────────────────────────────────────
Before responding to any syllabus question, ask yourself:
- Does this query specify a sub-category? → TIER C
- Does this query specify level + area but NOT sub-category? → TIER B
- Is this query vague with no level or area? → TIER A

══════════════════════════════════════
RULE 3 — SKILL ANALYSIS (media uploaded)
══════════════════════════════════════
If a video/image is uploaded, provide the top 4 FMS skill guesses:
Tag: [[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]]

**Tone**: Professional, concise, Singapore PE context. No filler phrases.

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
- Respond: "I've detected your movement! Based on the patterns, it looks like one of these 4 skills. Which one is it?"
- YOU MUST include the [[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]] tag.

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
    modelId?: 'openrouter' | 'openrouter-video' | 'openrouter-text',
    sessionId?: string,
    teacherProfile?: import('../../types').TeacherProfile | null
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

                // Y increases downwards. Smaller Y = Higher position on screen.
                const highPoint = dominantHand === 'Right' ? maxRightHandHighY : maxLeftHandHighY;
                const highPointFrame = dominantHand === 'Right' ? maxRightHandHighFrame : maxLeftHandHighFrame;
                const lowestDominantY = dominantHand === 'Right' ? minRightHandY : minLeftHandY;
                const dominantHipY = dominantHand === 'Right' ? rightHipY : leftHipY;

                // Arm Trajectory Classification — primary signal for skill identification
                // High arm (above nose) = overhand family; Low arm (below hip) = underhand family
                let armTrajectory: string;
                if (highPoint < noseY) {
                    armTrajectory = `OVERHEAD — arm peaked above head level at Frame ${highPointFrame}. ✅ Normal for Overhand Throw, Chest Pass, or overhead striking. ❌ Abnormal for Underhand Throw / Underhand Roll (which require arm to stay below waist).`;
                } else if (lowestDominantY > dominantHipY) {
                    armTrajectory = `LOW SWING — arm dropped below hip/waist level. ✅ Normal for Underhand Throw, Underhand Roll, Kick. ❌ Abnormal for Overhand Throw (which requires arm to swing overhead).`;
                } else {
                    armTrajectory = `MID-LEVEL — arm stayed between waist and head. Consistent with Chest Pass, Bounce Pass, or Dribble.`;
                }

                // Wind-up Check — run always so AI gets this context even in Phase 1
                let windUpCheck: string;
                const handDroppedBelowWaist = (dominantHand === 'Right' && minRightHandY > rightHipY) || (dominantHand === 'Left' && minLeftHandY > leftHipY);
                if (handDroppedBelowWaist) {
                    windUpCheck = '✅ Hand dropped below waist — consistent with Underhand Throw / Underhand Roll / Kick wind-up.';
                } else if (highPoint < noseY) {
                    windUpCheck = '✅ Arm swung overhead — consistent with Overhand Throw backswing/follow-through.';
                } else {
                    windUpCheck = '⚠️ No distinct wind-up detected (arm stayed between waist and head throughout).';
                }

                // Excessive High Swing check (only relevant when skill is known and it should be low)
                let highSwingCheck = '✅ Arm height appropriate';
                const isUnderhanded = skillName && ['Underhand Throw', 'Underhand Roll'].some(s => skillName.includes(s));
                if (isUnderhanded && highPoint < noseY) {
                    highSwingCheck = `⚠️ Arm raised ABOVE HEAD for an underhand skill — this violates the controlled low swing requirement. (Evidence: Frame ${highPointFrame})`;
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
                2. **Arm Trajectory (Skill Classifier)**: ${armTrajectory}
                3. **Wind-up**: ${windUpCheck}
                4. **Stepping Foot**: ${steppingFoot}
                5. **Coordination**: ${coordinationCheck}
                6. **Stance**: ${stanceIssue}
                7. **Arm Height (Skill-Specific)**: ${highSwingCheck}
                8. **Knee Bend**: ${kneeBendCheck}
                9. **Step Verification**: ${stepNote}
                `;

                movementPattern = `\n\n**Movement patterns (Kinetic Chain indicators):**\n${changes.slice(0, 30).map((c, i) => `• Frame ${i + 1}→${i + 2}: ${c}`).join('\n')}`;
            }


            poseDescription = analyses.map((analysis, i) => {
                const ball = poseData[i].ball;
                // Only report 'YES' if the ball exists AND is marked as valid by the logic or user
                // Report ball presence only — raw pixel coords are on a different scale from
                // normalized landmarks (0-1) and cause the LLM to fabricate "below knee level" claims.
                const hasBall = (ball && ball.isValid) ? 'YES (detected)' : 'NO';
                return `
                **Frame ${i + 1}:**
                Position: ${analysis.poseSummary}
                Angles: ${analysis.keyAngles.map(a => `${a.joint}=${a.angle}°`).join(', ')}
                Ball Detected: ${hasBall}
            `;
            }).join('\n');

            const userTargetSkill = (skillName && isVerified) ? `\n**USER DECLARED SKILL**: "${skillName}".\nNOTE: The user has explicitly identified this movement.\nDO NOT ASK "Is this correct?".\nDO NOT GUESS.\nPROCEED DIRECTLY TO GRADING.` : (skillName ? `\nNote: The user mentioned "${skillName}", but we are still in the verification phase. Provide the Top 4 choices anyway to confirm.` : '');

            enhancedMessage = `I've captured pose data from ${poseData.length} keyframes extracted evenly across the video duration.

            **Pose measurements (Textual Description):**
            ${poseDescription}
            ${movementPattern}
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
                'You MUST include the [[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]] tag at the end of your response.'}

            ${isVerified ? `**CRITICAL CONSISTENCY RULE (PROFICIENCY VS CHECKLIST):**
            - If you grade the Proficiency Level as "Keeping it Real" / "Developing" / "Beginning", you **MUST** have at least one ❌ or ⚠️ in the Checklist Assessment.
            - **You cannot have a "Competent" checklist (all ✅) and a "Developing" grade.** They must tell the same story.
            - **SPECIFIC OVERRIDE FOR UNDERHAND ROLL**:
              - IF "Hand raised ABOVE HEAD" is detected in the Biomechanics Report, you **MUST MARK CHECKLIST ITEM #5 ("Swing dominant hand back at least to waist level") as ❌ OR ⚠️**.
              - Reason: "Excessive backswing violates the controlled nature of the skill."
              - **DO NOT** give a "Pass" just because it went *past* the waist. It must be *controlled* at the waist. "Too much" is a failure of the specific criteria.` : ''}
`;
        }

        // Choose appropriate system instruction
        let systemInstruction = '';



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

        const baseInstruction = poseData && poseData.length > 0
            ? MOTION_ANALYSIS_INSTRUCTION.replace(FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, specificChecklistText)
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

                **BIOMECHANICS PRIORITY RULE (READ THIS FIRST):**
                The "Arm Trajectory (Skill Classifier)" field in the Biomechanics Report is your PRIMARY and MOST RELIABLE signal.
                - **OVERHEAD** (arm peaked above head/nose level) → Overhand Throw, Chest Pass, or overhead striking
                - **LOW SWING** (arm dropped below hip level) → Underhand Throw, Underhand Roll, or Kick
                - **MID-LEVEL** (arm between waist and head) → Chest Pass, Bounce Pass, or Dribble
                Trust this classification ABOVE any ball position data, which is in raw pixels and may be unreliable.
                Ball detection only tells you IF a ball was present — NOT where in the movement it was released.

                **INSTRUCTIONS**:
                1. Read the "Arm Trajectory (Skill Classifier)" from the Biomechanics Report first.
                2. Use it to narrow down the skill family.
                3. Look at the visual evidence to confirm.
                4. Identify the skill from the WHITELIST.
                5. **STOP**. Do NOT grade it yet.
                
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
            sanitizedHistory = sanitizedHistory.slice(-MAX_HISTORY_TURNS);
        }

        const openRouterMessages: any[] = [
            { role: "system", content: systemInstruction },
            ...sanitizedHistory
        ];

        // Construct the CURRENT user message
        let finalMessageContent = enhancedMessage;

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
            const maxUserFrames = 6;
            const processedAttachments = mediaAttachments.slice(0, maxUserFrames);

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
        }

        openRouterMessages.push({
            role: "user",
            content: userContent
        });

        // Map internal model IDs to OpenRouter model strings
        const modelMap: Record<string, string> = {
            'openrouter': '', // Will be determined by input type
            'openrouter-video': 'google/gemini-2.5-flash',
            'openrouter-text': 'qwen/qwen3.6-plus:free',
        };

        // Determine target model based on input type
        let targetModel: string;
        if (modelId === 'openrouter' || !modelId) {
            // Route by input type: video → gemini, text/PDF → qwen
            const hasVideo = mediaAttachments && mediaAttachments.some(m => m.mimeType.startsWith('video/'));
            targetModel = hasVideo ? 'google/gemini-2.5-flash' : 'qwen/qwen3.6-plus:free';
        } else {
            targetModel = modelMap[modelId] || 'qwen/qwen3.6-plus:free';
        }

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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        const response = await fetch(endpoint, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                "model": targetModel,
                "messages": openRouterMessages,
                "temperature": 0.5,
                "max_tokens": 5000,
                "transforms": ["middle-out"]
            }),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error response:', errorText);
            throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

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
