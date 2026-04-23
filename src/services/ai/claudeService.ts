// Client-side service — calls the server-side /api/claude proxy.
// Mirrors geminiService.ts: same pose analysis, same system prompts, same logic.
// Key differences: Anthropic content-block format for images, no Google SDK, no grounding.

import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, PROFICIENCY_RUBRIC, SKILL_REFERENCE_IMAGES, getSkillChecklist, ALL_FMS_SKILLS } from '../../data/fundamentalMovementSkillsData';
import { GYMNASTICS_SKILLS_TEXT, ALL_GYMNASTICS_SKILLS, GYMNASTICS_REFERENCE_IMAGES, GYMNASTICS_RUBRIC, getGymnasticsChecklist } from '../../data/gymnasticsSkillsData';
import { getSyllabusContextMessage } from '../../data/syllabusContext';

const MODEL_NAME = 'claude-sonnet-4-6';

// ─── Tier 1: Short-Term Context Window ───────────────────────────────────────
// Caps the number of history messages sent to Claude per request.
// Keeps token usage predictable — the existing system prompt is already very
// long (FMS checklists, rubrics, biomechanics data, RAG context).
const SHORT_TERM_CONTEXT_WINDOW = 10;

// ─── System Instructions (copied from geminiService.ts) ──────────────────────

const FULL_SYSTEM_INSTRUCTION_TEMPLATE = `
You are the Singapore PE Syllabus Assistant for MOE Singapore's 2024 PE Syllabus.

{{FMS_CONTEXT}}

═══════════════════════════════════════
RULE 1 — BREVITY (HARD LIMIT)
═══════════════════════════════════════
Every text response MUST be short. Teachers read on mobile. They are busy.
- Maximum: 4 sentences OR a bullet list of up to 5 items.
- ONE topic per response. Never cover multiple areas in one reply.
- Do NOT add background, context, or related topics unless explicitly asked.
- If you feel the need to write more than 4 sentences, you are answering too broad a scope. Stop and apply Rule 2 instead.

═══════════════════════════════════════
RULE 2 — 3-TIER INTENT CLASSIFICATION
═══════════════════════════════════════
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

Example:
User: "P4 Athletics outcomes"
Response: "P4 Athletics covers running, jumping, and throwing — which area?"
[[SKILL_CHOICES: Running, Jumping, Throwing, All P4 Athletics Outcomes]]

──────────────────────────────────────
TIER C — SPECIFIC (sub-category known OR user confirmed from chips)
──────────────────────────────────────
Examples: "Sending & Receiving outcomes for P3", "What are the Throwing & Catching skills?", "Tell me about Propelling in P3"
The user has specified level + area + sub-category (or selected a chip from your previous response).
1. Answer directly. List ALL outcomes for that specific sub-category only.
2. Use a numbered list. Be complete — do NOT truncate or summarise.
3. End with [[SKILL_CHOICES: related follow-up 1, related follow-up 2, related follow-up 3]] to guide next steps.
4. If the sub-category has further sub-skills (e.g. Sending & Receiving → Throwing & Catching / Kicking & Trapping / Striking), FIRST ask which sub-skill: [[SKILL_CHOICES: Throwing & Catching, Kicking & Trapping (with body part), Striking & Trapping (long-handled implement)]]

Example:
User: "Sending & Receiving" (after being shown chips for P3 Games & Sports)
Response: "Sending & Receiving in P3 has three skill groups — which one?"
[[SKILL_CHOICES: Throwing & Catching, Kicking & Trapping (with body part), Striking & Trapping (long-handled implement)]]

Example:
User: "Throwing & Catching"
Response: "P3 Throwing & Catching — Movement Skills and Concepts:"
1. Throw using the 2-handed push pattern (chest pass and bounce pass) and the 2-handed overhead movement pattern (overhead pass) to a stationary and moving partner.
2. Throw using the backhand pattern, a disc to a stationary and moving partner, who will catch at different levels.
3. ...(all 5 outcomes)
[[SKILL_CHOICES: Kicking & Trapping outcomes, P3 Propelling outcomes, P4 Games & Sports outcomes]]

──────────────────────────────────────
KEY RULE: NEVER SKIP THE TIER CHECK
──────────────────────────────────────
Before responding to any syllabus question, ask yourself:
- Does this query specify a sub-category? → TIER C
- Does this query specify level + area but NOT sub-category? → TIER B
- Is this query vague with no level or area? → TIER A

═══════════════════════════════════════
RULE 4 — MOVEMENT MEDIA UPLOADED
═══════════════════════════════════════
When the user uploads a video or image:
- Guess the top 3 most likely FMS skills from the visual context.
- Always end with: \`[[SKILL_CHOICES: Skill 1, Skill 2, Skill 3]]\`

═══════════════════════════════════════
OTHER RULES
═══════════════════════════════════════
- Tone: Direct, professional, Singapore PE context. No filler phrases.
- Reference images: Use \`[[DISPLAY_REFERENCE: <Exact Skill Name>]]\` if the user asks to see a skill.
  Valid names: ${Object.keys(SKILL_REFERENCE_IMAGES).join(', ')}
- Student mode: If a student asks "show me", use [[DISPLAY_REFERENCE]] + 1 encouraging sentence. No checklist.
- Out of syllabus: Say so clearly, use search for a 1-sentence supplement.
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
- Grade every checklist criterion. Do NOT use joint angles as the primary grade.
- **DETERMINE LEVEL**:
  - Mistake in >50% of items? → **Beginning**
  - Missed 1-2 items? → **Developing**
  - Hit ALL items? → **Competent**
  - Hit ALL items + Exceptional quality? → **Excellent**

**OUTPUT FORMAT — be concise. Teachers are busy. No padding.**

**[Movement Name] — [Proficiency Level]**
X/Y criteria met.

| # | Criterion | Result | Note |
|---|-----------|--------|------|
| 1 | [criterion] | ✅/❌/⚠️ | one short phrase only |
| 2 | ... | | |

**Fix:** (❌ items only, max 1 sentence each)
- [criterion]: [one actionable cue]
`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatResponse {
    text: string;
    referenceImageURI?: string;
}

export interface MediaData {
    mimeType: string;
    data: string; // base64 without data URL prefix
}

type AnthropicContentBlock =
    | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

// ─── Main function ────────────────────────────────────────────────────────────

export const sendMessageToClaudeAPI = async (
    history: { role: string; content: string }[],
    currentMessage: string,
    poseData?: import('../vision/poseDetectionService').PoseData[],
    mediaAttachments?: MediaData[],
    skillName?: string,
    isVerified?: boolean,
    sessionId?: string,
    teacherProfile?: import('../../types').TeacherProfile | null,
    studentMemory?: string,
    userId?: string,
    skillMode: import('../../types').SkillMode = 'fms'
): Promise<ChatResponse & { tokenUsage?: number }> => {
    try {
        let enhancedMessage = currentMessage;
        let poseDescription = '';
        let movementPattern = '';
        let biomechanicsReport = '';

        // ── Pose data analysis (identical to geminiService.ts) ──────────────
        if (poseData && poseData.length > 0) {
            const { poseDetectionService } = await import('../vision/poseDetectionService');
            const analyses = poseData.map(pose => poseDetectionService.analyzePoseGeometry(pose));

            if (poseData.length > 1) {
                const changes: string[] = [];

                let maxRightHandVel = 0;
                let maxLeftHandVel = 0;
                let totalRightHandMove = 0;
                let totalLeftHandMove = 0;
                let maxRightFootVel = 0;
                let maxLeftFootVel = 0;
                let narrowStanceCount = 0;

                let minRightHandY = 0;
                let rightHipY = 0;
                let minLeftHandY = 0;
                let leftHipY = 0;
                let noseY = 1;

                let maxRightHandHighY = 1;
                let maxLeftHandHighY = 1;

                let minKneeAngle = 180;
                let initialAnkleDist = 0;
                let maxAnkleDist = 0;

                if (poseData.length > 0) {
                    const firstFrame = poseData[0].landmarks;
                    initialAnkleDist = Math.hypot(firstFrame[27].x - firstFrame[28].x, firstFrame[27].y - firstFrame[28].y);
                    maxRightHandHighY = firstFrame[16].y;
                    maxLeftHandHighY = firstFrame[15].y;
                }

                let minKneeAngleFrame = -1;
                let maxRightHandHighFrame = -1;
                let maxLeftHandHighFrame = -1;
                let releaseFrameIndex = -1;

                analyses.forEach((analysis, index) => {
                    const rightKnee = analysis.keyAngles.find(a => a.joint === 'Right Knee')?.angle || 180;
                    const leftKnee = analysis.keyAngles.find(a => a.joint === 'Left Knee')?.angle || 180;
                    const currentMin = Math.min(rightKnee, leftKnee);

                    if (currentMin < minKneeAngle) {
                        minKneeAngle = currentMin;
                        minKneeAngleFrame = index + 1;
                    }
                });

                for (let i = 1; i < poseData.length; i++) {
                    const prev = poseData[i - 1].landmarks;
                    const curr = poseData[i].landmarks;

                    noseY = curr[0].y;

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

                    minRightHandY = Math.max(minRightHandY, curr[16].y);
                    minLeftHandY = Math.max(minLeftHandY, curr[15].y);

                    if (curr[16].y < maxRightHandHighY) {
                        maxRightHandHighY = curr[16].y;
                        maxRightHandHighFrame = i + 1;
                    }
                    if (curr[15].y < maxLeftHandHighY) {
                        maxLeftHandHighY = curr[15].y;
                        maxLeftHandHighFrame = i + 1;
                    }

                    rightHipY = curr[24].y;
                    leftHipY = curr[23].y;

                    const currentAnkleDist = Math.hypot(curr[27].x - curr[28].x, curr[27].y - curr[28].y);
                    maxAnkleDist = Math.max(maxAnkleDist, currentAnkleDist);

                    const shoulderWidth = Math.abs(curr[11].x - curr[12].x);
                    const ankleWidth = Math.abs(curr[27].x - curr[28].x);
                    if (ankleWidth < shoulderWidth * 0.8) narrowStanceCount++;

                    const stepThreshold = 0.05;
                    if (Math.abs(rightFootMoveX) > stepThreshold) {
                        changes.push(`Right foot moved X: ${rightFootMoveX.toFixed(2)}`);
                    }
                    if (Math.abs(leftFootMoveX) > stepThreshold) {
                        changes.push(`Left foot moved X: ${leftFootMoveX.toFixed(2)}`);
                    }
                }

                const dominantHand = totalRightHandMove > totalLeftHandMove ? 'Right' : 'Left';
                const handRatio = Math.max(totalRightHandMove, totalLeftHandMove) / Math.min(totalRightHandMove, totalLeftHandMove);
                const confidence = handRatio > 1.2 ? '(High Confidence)' : '(Low Confidence)';

                const strideExpansion = maxAnkleDist / (initialAnkleDist + 0.001);
                const stepDetected = strideExpansion > 1.2;
                const steppingFoot = maxRightFootVel > maxLeftFootVel * 1.2 ? 'Right' : (maxLeftFootVel > maxRightFootVel * 1.2 ? 'Left' : 'None/Both');

                const stanceIssue = narrowStanceCount > (poseData.length * 0.6) ? '⚠️ Feet too narrow (Narrower than shoulders)' : '✅ Stance width looks okay';

                let coordinationCheck = '✅ Coordination looks okay';
                if (dominantHand === 'Right' && steppingFoot === 'Right') coordinationCheck = '❌ IPSILATERAL ERROR: Stepped with Right Foot while throwing with Right Hand (Should be Left Foot)';
                if (dominantHand === 'Left' && steppingFoot === 'Left') coordinationCheck = '❌ IPSILATERAL ERROR: Stepped with Left Foot while throwing with Left Hand (Should be Right Foot)';

                let windUpCheck = 'N/A (Not required for this skill)';
                const requiresWindUp = ['Underhand Throw', 'Underhand Roll', 'Overhand Throw', 'Kick'].some(s => skillName?.includes(s));

                if (requiresWindUp) {
                    windUpCheck = '⚠️ No significant wind-up (Hand stayed high)';
                    if (dominantHand === 'Right' && minRightHandY > rightHipY) windUpCheck = '✅ Good Wind-up (Hand dropped below waist)';
                    if (dominantHand === 'Left' && minLeftHandY > leftHipY) windUpCheck = '✅ Good Wind-up (Hand dropped below waist)';
                }

                const highPoint = dominantHand === 'Right' ? maxRightHandHighY : maxLeftHandHighY;
                const highPointFrame = dominantHand === 'Right' ? maxRightHandHighFrame : maxLeftHandHighFrame;
                const isUnderhanded = skillName && ['Underhand Throw', 'Underhand Roll'].some(s => skillName.includes(s));

                let highSwingCheck = '✅ Arm height appropriate for this skill.';
                let highSwingFailed = false;

                if (highPoint < noseY) {
                    if (isUnderhanded) {
                        highSwingCheck = `❌ EXCESSIVE BACKSWING: Hand raised ABOVE HEAD level at Frame ${highPointFrame}. This violates the controlled low-swing requirement for ${skillName}.`;
                        highSwingFailed = true;
                    } else {
                        highSwingCheck = `✅ Arm peaked above head level at Frame ${highPointFrame}. Normal for Overhand Throw, Chest Pass, or overhead striking.`;
                    }
                }

                let setupKneeBendStatus = '⚠️ Unable to assess';
                let setupKneeBendFailed = false;
                let setupKneeAngle = 180;

                if (poseData.length >= 2) {
                    const firstFrame = poseData[0].landmarks;
                    const secondFrame = poseData[1].landmarks;

                    const getKneeAngle = (landmarks: any[], side: 'left' | 'right' = 'right') => {
                        const hip = side === 'right' ? landmarks[24] : landmarks[23];
                        const knee = side === 'right' ? landmarks[26] : landmarks[25];
                        const ankle = side === 'right' ? landmarks[28] : landmarks[27];
                        const vec1 = { x: hip.x - knee.x, y: hip.y - knee.y };
                        const vec2 = { x: ankle.x - knee.x, y: ankle.y - knee.y };
                        const dot = vec1.x * vec2.x + vec1.y * vec2.y;
                        const mag1 = Math.sqrt(vec1.x ** 2 + vec1.y ** 2);
                        const mag2 = Math.sqrt(vec2.x ** 2 + vec2.y ** 2);
                        if (mag1 === 0 || mag2 === 0) return 180;
                        const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
                        return Math.acos(cosAngle) * (180 / Math.PI);
                    };

                    const firstFrameMinKnee = Math.min(getKneeAngle(firstFrame, 'right'), getKneeAngle(firstFrame, 'left'));
                    const secondFrameMinKnee = Math.min(getKneeAngle(secondFrame, 'right'), getKneeAngle(secondFrame, 'left'));
                    setupKneeAngle = Math.min(firstFrameMinKnee, secondFrameMinKnee);

                    if (setupKneeAngle < 170.0) {
                        setupKneeBendStatus = `✅ SETUP KNEE BEND DETECTED: Initial knee angle ${setupKneeAngle.toFixed(0)}° in Frame 1-2. "Pray" position correct.`;
                    } else {
                        setupKneeBendStatus = `❌ STRAIGHT KNEES IN SETUP: Initial knee angle ${setupKneeAngle.toFixed(0)}° in Frame 1-2. User did NOT start with "slightly bent knees" as required by the "Pray" position.`;
                        setupKneeBendFailed = true;
                    }
                }

                const movementKneeBendCheck = minKneeAngle < 170.0
                    ? `✅ Knees Bent During Movement (Min angle: ${minKneeAngle}° at Frame ${minKneeAngleFrame}).`
                    : `⚠️ Knees appear straight during movement (Min angle: ${minKneeAngle}° at Frame ${minKneeAngleFrame}).`;

                let releaseAnalysis = 'N/A (No ball data available)';
                let releasePoint = 'unknown';

                if (poseData && poseData.length > 0) {
                    let ballFrameCount = 0;
                    let lastBallFrame = -1;
                    for (let i = 0; i < poseData.length; i++) {
                        const ball = poseData[i].ball;
                        if (ball && ball.isValid) {
                            ballFrameCount++;
                            lastBallFrame = i;
                            releaseFrameIndex = i;
                        }
                    }
                    if (ballFrameCount > 0) {
                        releaseAnalysis = `Ball detected in ${ballFrameCount} of ${poseData.length} frames (last seen: Frame ${lastBallFrame + 1}). Use visual evidence to determine release point.`;
                        releasePoint = 'visual-only';
                    }
                }

                let skillDifferentiation = '';
                if (skillName === 'Underhand Roll' || skillName === 'Underhand Throw') {
                    skillDifferentiation = `\n**SKILL DIFFERENTIATION (Throw vs Roll):**
- Release Point: ${releasePoint === 'below-knee' ? 'BELOW KNEE (Roll pattern)' : releasePoint === 'between-knee-waist' ? 'BETWEEN KNEE-WAIST (Throw pattern)' : 'UNCLEAR'}
- Backswing Control: ${highSwingFailed ? 'EXCESSIVE (Above head - violates controlled underhand motion)' : 'Controlled'}
- Setup Knee Bend: ${setupKneeBendFailed ? 'MISSING (Straight knees in "Pray" position)' : 'Present'}
`;
                }

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
6. **Backswing Height**: ${highSwingCheck} ${highSwingFailed ? '**FAILURE**' : ''}
7. **Setup Knee Bend ("Pray" Position)**: ${setupKneeBendStatus} ${setupKneeBendFailed ? '**FAILURE**' : ''}
8. **Movement Knee Bend**: ${movementKneeBendCheck}
9. **Ball Release Point**: ${releaseAnalysis}
10. **Step Verification**: ${stepNote}
${skillDifferentiation}
**KEY FRAMES FOR GRADING:**
- Setup Phase (Pray Position): Frames 1-2 → Check knee angle ${setupKneeAngle.toFixed(0)}°
- Backswing Peak: Frame ${highPointFrame} → Hand Y position ${highPoint.toFixed(3)} (nose Y = ${noseY.toFixed(3)})
- Release: Frame ${releaseFrameIndex >= 0 ? releaseFrameIndex + 1 : 'N/A'} → ${releasePoint === 'unknown' ? 'Ball not tracked' : releasePoint}
`;

                movementPattern = `\n\n**Movement patterns (Kinetic Chain indicators):**\n${changes.slice(0, 30).map((c, i) => `• Frame ${i + 1}→${i + 2}: ${c}`).join('\n')}`;
            }

            poseDescription = analyses.map((analysis, i) => {
                const ball = poseData[i].ball;
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

            const containsMultipleSkills = /\b(into|then|and|sequence)\b/i.test(currentMessage);
            const knownSkillsList = skillMode === 'gymnastics'
              ? ALL_GYMNASTICS_SKILLS
              : ['Underhand Throw', 'Underhand Roll', 'Overhand Throw', 'Kick', 'Dribble (Hand)', 'Dribble (Foot)', 'Chest Pass', 'Catch above waist', 'Bounce pass', 'Bounce'];
            const singleSkillMatch = skillName && knownSkillsList.includes(skillName);
            const isSequencing = !singleSkillMatch || containsMultipleSkills;

            const userTargetSkill = (skillName && isVerified)
                ? `\n**USER DECLARED SKILL**: "${skillName}".\nNOTE: The user has explicitly identified this movement.\nDO NOT ASK "Is this correct?".\nDO NOT GUESS.\nPROCEED DIRECTLY TO GRADING.`
                : (skillName ? `\nNote: The user mentioned "${skillName}", but we are still in the verification phase. Provide the Top 4 choices anyway to confirm.` : '');

            enhancedMessage = `I've captured pose data from ${poseData.length} keyframes extracted evenly across the video duration.

**Pose measurements:**
${poseDescription}${movementPattern}
${biomechanicsReport}
${userTargetSkill}

**Your task:**
1. **Analyze the Kinetic Chain**: Look at the "Movement patterns" above. Is the movement fluid and sequential (e.g., legs -> torso -> arms) or "segmented" (robotic/broken)?
2. **Biomechanics Check**: Read the "BIOMECHANICS ANALYSIS" above.
3. ${isVerified
                    ? `**IMMEDIATE ACTION**: Provide a full performance analysis for "${skillName || 'this movement'}" using the ${skillMode === 'gymnastics' ? 'Gymnastics Skills Rubric' : 'FMS Rubric'}.`
                    : skillMode === 'gymnastics'
                      ? `**IDENTIFICATION PHASE (GYMNASTICS)**: Identify ALL gymnastics skills visible in this video — the student may perform more than one. Look for locomotor skills (hopping, galloping, sliding, running, skipping, jumping, leaping), balance skills (1-Point Balance, 2-Point Balance, 3-Point Balance, Patch Balance), and rolling skills (Forward Roll, Backward Roll, Log Roll). For each skill you identify, briefly describe the visual evidence. DO NOT grade yet.`
                      : `**VERIFICATION PHASE**: You must identify the TOP 4 most likely skills from the Fundamental Movement Skills list. DO NOT grade the performance yet.`}
4. ${isVerified
                    ? 'Ensure you cite specific frames for any deductions.'
                    : skillMode === 'gymnastics'
                      ? 'You MUST include the [[MULTI_SKILL_CHOICES: Skill 1, Skill 2, ...]] tag listing ALL identified skills at the end of your response. Use exact skill names from the whitelist.'
                      : 'You MUST include the [[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]] tag at the end of your response.'}
${(isSequencing || containsMultipleSkills) && isVerified ? `5. **Sequencing & Transitions**: Evaluate the transition between the multiple skills shown. Grade it based on smooth transitions, lack of abrupt stops, and overall rhythmic flow. Add this as a separate section in your grading output.` : ''}`;
        }

        // ── Skill / checklist detection ──────────────────────────────────────
        let activeSkillName = skillName;
        if (!activeSkillName) {
            const lowerMsg = currentMessage.toLowerCase();
            const referenceImages = skillMode === 'gymnastics' ? GYMNASTICS_REFERENCE_IMAGES : SKILL_REFERENCE_IMAGES;
            const knownSkills = Object.keys(referenceImages).sort((a, b) => b.length - a.length);
            for (const skill of knownSkills) {
                if (lowerMsg.includes(skill.toLowerCase())) {
                    activeSkillName = skill;
                    break;
                }
            }
        }

        const activeSkillsText = skillMode === 'gymnastics' ? GYMNASTICS_SKILLS_TEXT : FUNDAMENTAL_MOVEMENT_SKILLS_TEXT;
        const activeRubric = skillMode === 'gymnastics' ? GYMNASTICS_RUBRIC : PROFICIENCY_RUBRIC;
        const activeReferenceImages = skillMode === 'gymnastics' ? GYMNASTICS_REFERENCE_IMAGES : SKILL_REFERENCE_IMAGES;

        let specificChecklistText = activeSkillsText;
        if (activeSkillName) {
            const checklist = skillMode === 'gymnastics'
                ? getGymnasticsChecklist(activeSkillName)
                : getSkillChecklist(activeSkillName);
            const customRubric = teacherProfile?.customRubrics?.[activeSkillName];

            if (customRubric) {
                specificChecklistText = `*** TEACHER'S CUSTOM RUBRIC FOR ${activeSkillName} ***
The teacher has provided a custom rubric with specific labels and groupings for this class.
When grading "Beginning", "Developing", "Competent", or "Accomplished", you MUST use these groupings and criteria below:

**Level: Beginning**
${customRubric.beginning?.map(g => `- Label: "${g.label}" (Requires you to observe: ${g.originalCriteriaIndices.length > 0 ? g.originalCriteriaIndices.map(i => checklist[i].replace(/^\d+\.\s*/, '')).join(' AND ') : 'No sub-criteria, label stands alone'})`).join('\n') || 'No specific criteria set. If they fail Developing, default to generic "Beginning".'}

**Level: Developing**
${customRubric.developing.map(g => `- Label: "${g.label}" (Requires you to observe: ${g.originalCriteriaIndices.length > 0 ? g.originalCriteriaIndices.map(i => checklist[i].replace(/^\d+\.\s*/, '')).join(' AND ') : 'No sub-criteria, label stands alone'})`).join('\n') || 'No specific criteria set'}

**Level: Competent**
${customRubric.competent.map(g => `- Label: "${g.label}" (Requires you to observe: ${g.originalCriteriaIndices.length > 0 ? g.originalCriteriaIndices.map(i => checklist[i].replace(/^\d+\.\s*/, '')).join(' AND ') : 'No sub-criteria, label stands alone'})`).join('\n') || 'No specific criteria set'}

**Level: Accomplished**
${customRubric.accomplished.map(g => `- Label: "${g.label}" (Requires you to observe: ${g.originalCriteriaIndices.length > 0 ? g.originalCriteriaIndices.map(i => checklist[i].replace(/^\d+\.\s*/, '')).join(' AND ') : 'No sub-criteria, label stands alone'})`).join('\n') || 'No specific criteria set'}

If the student only demonstrates the "Beginning" characteristics (or fails to meet Developing), grade them as "Beginning".
When giving feedback, refer to the teacher's Labels (e.g. "You missed the '${customRubric.developing[0]?.label || 'Setup'}' position", or "You are at '${customRubric.beginning?.[0]?.label || 'Beginning'}'").
Your Checklist Assessment MUST be grouped by these Levels and Labels instead of the standard 10 criteria.
(END OF CUSTOM RUBRIC)`;
            } else if (checklist.length > 0) {
                specificChecklistText = `*** OFFICIAL CHECKLIST FOR ${activeSkillName} ***
This skill has EXACTLY ${checklist.length} criteria. You MUST output EXACTLY ${checklist.length} checklist items — no more, no fewer. DO NOT merge, skip, or combine any criteria.

${checklist.join('\n')}

REMINDER: The list above has ${checklist.length} items (1 through ${checklist.length}). Your Checklist Assessment section MUST contain ${checklist.length} bullet points. Count them before submitting your response.
(END OF CHECKLIST)`;
            }
        }

        // ── System instruction selection ─────────────────────────────────────
        const skillsBlockLabel = skillMode === 'gymnastics'
            ? 'GYMNASTICS LOCOMOTOR SKILLS'
            : 'FUNDAMENTAL MOVEMENT SKILLS';

        const fmsBlock = activeSkillName
            ? `**${skillsBlockLabel} CONTENT START**\n${specificChecklistText}\n**${skillsBlockLabel} CONTENT END**`
            : '';

        let systemInstruction = poseData && poseData.length > 0
            ? MOTION_ANALYSIS_INSTRUCTION
                .replace(FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, specificChecklistText)
                .replace(PROFICIENCY_RUBRIC, activeRubric)
                .replace('Valid names: ' + Object.keys(SKILL_REFERENCE_IMAGES).join(', '), 'Valid names: ' + Object.keys(activeReferenceImages).join(', '))
            : FULL_SYSTEM_INSTRUCTION_TEMPLATE.replace('{{FMS_CONTEXT}}', fmsBlock)
                .replace('Valid names: ' + Object.keys(SKILL_REFERENCE_IMAGES).join(', '), 'Valid names: ' + Object.keys(activeReferenceImages).join(', '));

        if (skillMode === 'gymnastics') {
            systemInstruction = systemInstruction
                .replace(/Fundamental Movement Skills \(FMS\)/g, 'Gymnastics Locomotor Skills')
                .replace(/Fundamental Movement Skills list/g, 'Gymnastics Locomotor Skills list')
                .replace(/Fundamental Movement Skills/g, 'Gymnastics Locomotor Skills')
                .replace(/FMS Checklist/g, 'Gymnastics Checklist')
                .replace(/FMS Rubric/g, 'Gymnastics Rubric')
                .replace(/FUNDAMENTAL MOVEMENT SKILLS CHECKLIST/g, 'GYMNASTICS LOCOMOTOR SKILLS CHECKLIST')
                .replace('[[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]]', '[[SKILL_CHOICES: ' + ALL_GYMNASTICS_SKILLS.slice(0, 4).join(', ') + ']]',);
        } else {
            systemInstruction = systemInstruction.replace('[[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]]', '[[SKILL_CHOICES: ' + ALL_FMS_SKILLS.slice(0, 4).join(', ') + ']]',);
        }

        // ── RAG retrieval ────────────────────────────────────────────────────
        let ragContext = '';
        try {
            if (currentMessage && currentMessage.trim().length > 3) {
                const ragController = new AbortController();
                const ragTimeout = setTimeout(() => ragController.abort(), 30_000);
                const ragResponse = await fetch('/api/rag-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: currentMessage }),
                    signal: ragController.signal,
                }).finally(() => clearTimeout(ragTimeout));
                if (ragResponse.ok) {
                    const ragData = await ragResponse.json();
                    ragContext = ragData.context || '';
                }
            }
        } catch (e) {
            console.warn('RAG Search failed:', e);
        }

        const validSkillsList = Object.keys(SKILL_REFERENCE_IMAGES).join(', ');

        if (poseData && poseData.length > 0) {
            if (!isVerified) {
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
1. **Observe**: Look at the pose data and the visual input. Pay special attention to:
   - **Release Point**: Where is the ball released? (Below knee = Roll, Knee-Waist = Throw, Above waist = Overhand/Catch)
   - **Arm Trajectory**: Does the arm swing downward (Underhand) or upward/overhead (Overhand)?
   - **Body Orientation**: Is the user facing the target or sideways (Overhand Throw/Kick often use side stance)?
   - **Leg Movement**: Is there a step? Which foot steps?

2. **Identify**: Pick the **TOP 4** most likely skills from the VALID SKILLS LIST using these discriminators:
   - **Underhand Roll vs Underhand Throw**: Roll releases BELOW KNEE (ball rolls on ground), Throw releases BETWEEN KNEE-WAIST (ball travels in air)
   - **Overhand Throw vs Chest Pass**: Overhand has arm going overhead and across body, Chest Pass extends straight forward from chest
   - **Kick**: Non-dominant foot plants beside ball, dominant leg swings through
   - **Dribble (hands)**: Repeated downward push, ball returns to hand
   - **Dribble (feet)**: Ball stays on ground, tapped with inside of foot

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
                systemInstruction += `

**CURRENT POSE DATA CONTEXT:**
I have captured pose data from ${poseData.length} keyframes extracted evenly across the video.

**Pose measurements:**
${poseDescription}${movementPattern}
${biomechanicsReport || ''}
${skillName ? `\n**TARGET SKILL**: ${skillName}` : ''}

**Immediate Task:**
${skillName ? `Proceed directly to grading "${skillName}" using the FMS Rubric. Use the Biomechanics Report's findings as supporting evidence. Only treat a biomechanics field as definitive failure if it is explicitly marked ❌ with **FAILURE** AND that failure is relevant to the confirmed skill.

**CHECKLIST COMPLETENESS (CRITICAL):** The checklist for "${skillName}" has a fixed number of criteria. You MUST grade EVERY single criterion — do not stop early, do not merge two criteria into one bullet. Before writing your response, count the criteria in the checklist and verify your Checklist Assessment has the same number of bullet points.` : `Proceed with "STEP 1 - OBSERVE AND HYPOTHESIZE". Identify top 4 likely skills.`}

**IMPORTANT**:
- In the Note column, cite the frame only for ❌/⚠️ items (e.g. "Fr.8: elbow dropped"). ✅ items need no note.
- If ambiguous (<70% confident on a body part), add ⚠️ and note "Verify with teacher."
- NO separate "Visual Evidence" section. Evidence belongs in the table Note column only.

**CRITICAL CONSISTENCY RULE (PROFICIENCY VS CHECKLIST):**
- If you grade the Proficiency Level as "Keeping it Real" / "Developing" / "Beginning", you **MUST** have at least one ❌ or ⚠️ in the Checklist Assessment.
- **You cannot have a "Competent" checklist (all ✅) and a "Developing" grade.** They must tell the same story.

**MANDATORY CHECKLIST RULES FOR UNDERHAND ROLL:**
1. **Checklist Item #3 "Keep knees slightly bent"**: Look at "Setup Knee Bend" in biomechanics. If ❌ STRAIGHT KNEES → mark as ❌.
2. **Checklist Item #5 "Swing dominant hand back at least to waist level"**: Look at "Backswing Height". If ❌ EXCESSIVE BACKSWING → mark as ❌.
3. **Checklist Item #8 "Release ball on the ground"**: Look at "Ball Release Point". If above waist/knee-waist → mark as ❌.

- **CAMERA ANGLE AWARENESS**:
  - If the video is a **Side Profile**, "Facing Target" will look like "Looking Forward" (to the side of the screen). Do NOT penalize the user for not looking at the Camera.
`;
            }
        }

        if (studentMemory && isVerified) {
            systemInstruction = `**STUDENT MEMORY:**\n${studentMemory}\n\nUse this to contextualise your grading. Begin your response with one sentence on the student's trajectory before the grading table.\n\n` + systemInstruction;
        }

        // ── Tier 3: Long-Term Teacher Memory Injection ───────────────────────
        // Fetch the last 3 days of archived summaries for this teacher and
        // prepend them to the system instruction so Claude has ongoing context.
        // GUARD: skip during pose-detection/verification phase to avoid polluting
        // biomechanics analysis with irrelevant teacher notes.
        if (userId && !(poseData && poseData.length > 0)) {
            try {
                const memResponse = await fetch(`/api/get-memory?userId=${encodeURIComponent(userId)}`);
                if (memResponse.ok) {
                    const memData = await memResponse.json() as { summaries: { summary_date: string; summary_text: string }[] };
                    if (memData.summaries && memData.summaries.length > 0) {
                        const longTermMemory = memData.summaries
                            .map(s => `[${s.summary_date}]\n${s.summary_text}`)
                            .join('\n\n');
                        systemInstruction = `**TEACHER MEMORY (Past 3 Days):**\n${longTermMemory}\n--- END OF MEMORY ---\n\n` + systemInstruction;
                    }
                }
            } catch (e) {
                // Silent fail — never crash the chat experience due to memory fetch
                console.warn('Long-term memory fetch failed (silently skipped):', e);
            }
        }

        if (ragContext) {
            systemInstruction += `\n\n**ADDITIONAL RELEVANT KNOWLEDGE (From Uploaded Syllabus/PDF Documents):**\n${ragContext}\n\n*INSTRUCTION*: If this additional knowledge answers the user's question, prioritize it heavily and cite it.`;
        }

        // ── Build Anthropic content blocks for current message ───────────────
        const contentBlocks: AnthropicContentBlock[] = [{ type: 'text', text: enhancedMessage }];

        // Helper: compress image base64
        const compressBase64Image = async (base64: string, maxWidth = 640, quality = 0.6): Promise<string> => {
            return new Promise((resolve) => {
                const img = new Image();
                const src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
                img.src = src;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve(base64.replace(/^data:image\/[a-z]+;base64,/, '')); return; }
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
                };
                img.onerror = () => resolve(base64.replace(/^data:image\/[a-z]+;base64,/, ''));
            });
        };

        // Attach reference image (Gold Standard)
        if (activeSkillName && SKILL_REFERENCE_IMAGES[activeSkillName]) {
            try {
                const refResponse = await fetch(SKILL_REFERENCE_IMAGES[activeSkillName]);
                if (refResponse.ok) {
                    const blob = await refResponse.blob();
                    const base64Reference = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const result = reader.result as string;
                            resolve(result.includes('base64,') ? result.split('base64,')[1] : result);
                        };
                        reader.readAsDataURL(blob);
                    });
                    contentBlocks.push({
                        type: 'image',
                        source: { type: 'base64', media_type: 'image/jpeg', data: base64Reference },
                    });
                    contentBlocks.push({ type: 'text', text: "\n\n[SYSTEM NOTE]: The first image attached above is the TEXTBOOK REFERENCE (Gold Standard). The subsequent images below are the USER'S PERFORMANCE. Compare the user's form to the reference image." });
                }
            } catch (e) {
                console.error('Failed to load reference image', e);
            }
        }

        // Attach media frames
        if (mediaAttachments && mediaAttachments.length > 0) {
            for (const media of mediaAttachments) {
                let base64Data = media.data;
                try {
                    base64Data = await compressBase64Image(media.data);
                } catch (e) {
                    base64Data = media.data.replace(/^data:image\/[a-z]+;base64,/, '');
                }
                contentBlocks.push({
                    type: 'image',
                    source: { type: 'base64', media_type: media.mimeType as any, data: base64Data },
                });
            }
        }

        // ── Build messages array ─────────────────────────────────────────────
        // Inject syllabus context for text-only queries (mirrors Gemini syllabusContextPair).
        // The large syllabus message (~80K tokens) is marked for prompt caching so repeated
        // requests read from cache rather than re-tokenising, staying within rate limits.
        type MessageWithContent = { role: string; content: string | AnthropicContentBlock[] };
        const syllabusPrefix: MessageWithContent[] = (poseData && poseData.length > 0) ? [] : [
            {
                role: 'user',
                content: [
                    {
                        type: 'text' as const,
                        text: getSyllabusContextMessage(),
                        cache_control: { type: 'ephemeral' as const },
                    },
                ],
            },
            { role: 'assistant', content: 'I have read the full Singapore MOE PE Syllabus 2024 and am ready to answer questions based on it.' },
        ];

        // Tier 1: cap history to the last SHORT_TERM_CONTEXT_WINDOW messages
        const trimmedHistory = history.slice(-SHORT_TERM_CONTEXT_WINDOW);

        const anthropicMessages: MessageWithContent[] = [
            ...syllabusPrefix,
            ...trimmedHistory.map(m => ({ role: m.role, content: m.content as string })),
            { role: 'user', content: contentBlocks },
        ];

        // ── API call ─────────────────────────────────────────────────────────
        let text = '';
        let tokenUsage = 0;

        // Cache the system instruction too — it's large and stable within a session.
        const requestBody = {
            model: MODEL_NAME,
            max_tokens: 1500,
            system: [
                {
                    type: 'text' as const,
                    text: systemInstruction,
                    cache_control: { type: 'ephemeral' as const },
                },
            ],
            messages: anthropicMessages,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);

        // DEV: Vite proxies /api/claude → api.anthropic.com (key injected in vite.config.ts)
        // PROD: Vercel serverless /api/claude.ts handles the request
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText })) as any;
            if (response.status === 429) throw new Error('Claude API rate limit exceeded (429). Please try again later.');
            if (response.status === 401) throw new Error('Claude API key invalid (401). Check your ANTHROPIC_API_KEY.');
            throw new Error(errorData.error?.message || errorData.error || `Claude API error (${response.status})`);
        }

        const data = await response.json() as any;
        text = data.text || '';
        tokenUsage = data.tokenUsage || 0;

        if (!text || text.trim().length === 0) {
            throw new Error('Claude returned an empty response. Please try rephrasing.');
        }

        // ── DISPLAY_REFERENCE tag handling ───────────────────────────────────
        let finalReferenceURI = (activeSkillName && SKILL_REFERENCE_IMAGES[activeSkillName])
            ? SKILL_REFERENCE_IMAGES[activeSkillName]
            : undefined;

        const referenceTagMatch = text.match(/\[\[DISPLAY_REFERENCE:\s*([^\]]+)\]\]/);
        if (referenceTagMatch) {
            const suggestedSkill = referenceTagMatch[1].trim();
            if (SKILL_REFERENCE_IMAGES[suggestedSkill]) {
                finalReferenceURI = SKILL_REFERENCE_IMAGES[suggestedSkill];
            }
        }

        const cleanText = text.replace(/\[\[DISPLAY_REFERENCE:\s*[^\]]+\]\]/g, '').trim();

        // ── Supabase logging (fire and forget) ──────────────────────────────
        if (sessionId) {
            import('../db/supabaseClient').then(({ logChatToDB }) => {
                logChatToDB(
                    sessionId,
                    currentMessage,
                    cleanText,
                    activeSkillName || undefined,
                    {
                        model: MODEL_NAME,
                        tokenUsage,
                        hasMedia: mediaAttachments && mediaAttachments.length > 0,
                    }
                );
            });
        }

        return {
            text: cleanText,
            referenceImageURI: finalReferenceURI,
            tokenUsage,
        };

    } catch (error) {
        console.error('Claude API Error:', error);
        throw error;
    }
};
