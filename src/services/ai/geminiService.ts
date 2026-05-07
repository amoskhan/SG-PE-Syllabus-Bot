
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { GroundingChunk } from '../../types';
import { FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, PROFICIENCY_RUBRIC, SKILL_REFERENCE_IMAGES, getSkillChecklist, ALL_FMS_SKILLS } from '../../data/fundamentalMovementSkillsData';
import {
  GYMNASTICS_SKILLS_TEXT,
  GYMNASTICS_RUBRIC,
  ALL_GYMNASTICS_SKILLS,
  getGymnasticsChecklist,
  GYMNASTICS_REFERENCE_IMAGES,
} from '../../data/gymnasticsSkillsData';
import type { SkillMode } from '../../types';
import { getSyllabusContextMessage } from '../../data/syllabusContext';

const MODEL_NAME = 'gemini-2.5-flash';

// Initialize the client
// Note: In a real app, never expose keys on the client. This is for the generated demo environment.
// const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// Template — {{SYLLABUS_CONTEXT}} is filled dynamically per query in sendMessageToGemini
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
- Gymnastics: [[SKILL_CHOICES: Travelling, Jumping & Climbing, Balancing, Rotating, Mounting, Dismounting & Vaulting]]
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
RULE 3 — SKILL CRITERIA QUERY
═══════════════════════════════════════
If the user asks for "critical elements", "performance criteria", "checklist", "how to perform",
or "teach me [a skill]":
- These are questions about PERFORMANCE CRITERIA from the skill data — NOT PE Syllabus learning outcomes.
- DO NOT route to Tier A/B/C. DO NOT ask about level.
- If a specific skill name is mentioned (e.g. "critical elements of leaping"):
  1. List the performance criteria for that skill from the skill data.
  2. On its own line at the end, add: [[DISPLAY_REFERENCE: <Exact Skill Name>]]
- If no specific skill is mentioned (e.g. "critical elements of gymnastics"):
  Respond with ONE short sentence then offer skill choices:
  [[SKILL_CHOICES: skill1, skill2, skill3, skill4]]
  Use the exact skill names from the Valid names list in OTHER RULES.

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
- Reference images: Use \`[[DISPLAY_REFERENCE: <Exact Skill Name>]]\` when:
  (a) the user asks to see a skill, OR
  (b) you just listed performance criteria for a specific skill (auto-trigger per RULE 3).
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
  teacherProfile?: import('../../types').TeacherProfile | null,
  skillMode: SkillMode = 'fms'
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

        // Arm Height Check — interpretation depends on skill
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
            // Overhand Throw, Chest Pass, etc. — overhead arm is expected/correct
            highSwingCheck = `✅ Arm peaked above head level at Frame ${highPointFrame}. Normal for Overhand Throw, Chest Pass, or overhead striking.`;
          }
        }

        // Knee Bend Check - SETUP PHASE (First 2 frames) vs MOVEMENT PHASE
        // Critical for "Pray" position assessment - check ONLY the initial setup
        let setupKneeBendStatus = '⚠️ Unable to assess';
        let setupKneeBendFailed = false;
        let setupKneeAngle = 180;

        if (poseData.length >= 2) {
          // Check first 2 frames for setup knee bend (the "Pray" position)
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

          const firstFrameRightKnee = getKneeAngle(firstFrame, 'right');
          const firstFrameLeftKnee = getKneeAngle(firstFrame, 'left');
          const firstFrameMinKnee = Math.min(firstFrameRightKnee, firstFrameLeftKnee);

          const secondFrameRightKnee = getKneeAngle(secondFrame, 'right');
          const secondFrameLeftKnee = getKneeAngle(secondFrame, 'left');
          const secondFrameMinKnee = Math.min(secondFrameRightKnee, secondFrameLeftKnee);

          // Use the MORE bent knee from first 2 frames as setup indicator
          setupKneeAngle = Math.min(firstFrameMinKnee, secondFrameMinKnee);

          if (setupKneeAngle < 170.0) {
            setupKneeBendStatus = `✅ SETUP KNEE BEND DETECTED: Initial knee angle ${setupKneeAngle.toFixed(0)}° in Frame 1-2. "Pray" position correct.`;
          } else {
            setupKneeBendStatus = `❌ STRAIGHT KNEES IN SETUP: Initial knee angle ${setupKneeAngle.toFixed(0)}° in Frame 1-2. User did NOT start with "slightly bent knees" as required by the "Pray" position.`;
            setupKneeBendFailed = true;
          }
        }

        // Movement phase knee bend (for "Sweep the floor" / lowering phase)
        const movementKneeBendCheck = minKneeAngle < 170.0
          ? `✅ Knees Bent During Movement (Min angle: ${minKneeAngle}° at Frame ${minKneeAngleFrame}).`
          : `⚠️ Knees appear straight during movement (Min angle: ${minKneeAngle}° at Frame ${minKneeAngleFrame}).`;

        // Ball Detection Summary
        // NOTE: ball.center is in canvas pixels; landmarks are MediaPipe-normalized (0–1).
        // Cross-scale comparison (pixels vs normalized) is unreliable, so we only report
        // presence/absence. Release-point classification is left to the LLM's visual analysis.
        let releaseAnalysis = 'N/A (No ball data available)';
        let releasePoint = 'unknown';
        let releaseFrameIndex = -1;

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

        // Skill Differentiation Summary
        let skillDifferentiation = '';
        if (skillName === 'Underhand Roll' || skillName === 'Underhand Throw') {
          skillDifferentiation = `\n**SKILL DIFFERENTIATION (Throw vs Roll):**
- Release Point: ${releasePoint === 'below-knee' ? 'BELOW KNEE (Roll pattern)' : releasePoint === 'between-knee-waist' ? 'BETWEEN KNEE-WAIST (Throw pattern)' : 'UNCLEAR'}
- Backswing Control: ${highSwingFailed ? 'EXCESSIVE (Above head - violates controlled underhand motion)' : 'Controlled'}
- Setup Knee Bend: ${setupKneeBendFailed ? 'MISSING (Straight knees in "Pray" position)' : 'Present'}
`;
        }

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

      const isGymnastics = skillMode === 'gymnastics';
      const containsMultipleSkills = /\b(into|then|and|sequence)\b/i.test(currentMessage);
      const knownSkillsList = isGymnastics
        ? ALL_GYMNASTICS_SKILLS
        : ALL_FMS_SKILLS;
      const singleSkillMatch = skillName && knownSkillsList.includes(skillName);
      const isSequencing = !singleSkillMatch || containsMultipleSkills;

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
          `**IMMEDIATE ACTION**: Provide a full performance analysis for "${skillName || 'this movement'}" using the ${isGymnastics ? 'Gymnastics Skills Rubric' : 'FMS Rubric'}.` :
          isGymnastics
            ? `**IDENTIFICATION PHASE (GYMNASTICS)**: Identify ALL gymnastics skills visible in this video — the student may perform more than one. Look for locomotor skills (hopping, galloping, sliding, running, skipping, jumping, leaping), balance skills (1-Point Balance, 2-Point Balance, 3-Point Balance, Patch Balance), and rolling skills (Forward Roll, Backward Roll, Log Roll). For each skill you identify, briefly describe the visual evidence. DO NOT grade yet.`
            : `**VERIFICATION PHASE**: You must identify the TOP 4 most likely skills from the Fundamental Movement Skills list. DO NOT grade the performance yet.`}
4. ${isVerified ?
          'Ensure you cite specific frames for any deductions.' :
          isGymnastics
            ? 'You MUST include the [[MULTI_SKILL_CHOICES: Skill 1, Skill 2, ...]] tag listing ALL identified skills at the end of your response. Use exact skill names from the whitelist.'
            : 'You MUST include the [[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]] tag at the end of your response.'}
${isVerified ? (
  (isSequencing || containsMultipleSkills)
    ? `5. **Sequencing & Transitions**: Evaluate the transition between the multiple skills shown. Grade it based on smooth transitions, lack of abrupt stops, and overall rhythmic flow. Add this as a separate section in your grading output.`
    : isGymnastics
      ? `5. **Sequence Readiness**: As a final note in your feedback, briefly comment on how the quality of this skill — especially the landing position, body control, and rhythm — prepares the student for a smooth transition into the next movement in a gymnastics sequence.`
      : ''
) : ''}`;
    }

    // Auto-detect skill from text if not explicitly provided to get specific rubric
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

    // Choose the appropriate system instruction based on context.
    // For text-only queries, dynamically inject only the relevant syllabus section
    // (keyword-routed) instead of the full 455KB document.
    const skillsBlockLabel = skillMode === 'gymnastics'
      ? 'GYMNASTICS LOCOMOTOR SKILLS'
      : 'FUNDAMENTAL MOVEMENT SKILLS';
    const fmsBlock = activeSkillName
      ? `**${skillsBlockLabel} CONTENT START**\n${specificChecklistText}\n**${skillsBlockLabel} CONTENT END**`
      : '';

    // For motion analysis, substitute the active checklist and rubric directly into
    // the template, then swap FMS label strings if in gymnastics mode.
    let modeAwareMotionInstruction = MOTION_ANALYSIS_INSTRUCTION
      .replace(FUNDAMENTAL_MOVEMENT_SKILLS_TEXT, specificChecklistText)
      .replace(PROFICIENCY_RUBRIC, activeRubric);

    if (skillMode === 'gymnastics') {
      modeAwareMotionInstruction = modeAwareMotionInstruction
        .replace('specializing in analyzing Fundamental Movement Skills (FMS)', 'specializing in analyzing Gymnastics Locomotor Skills')
        .replace('You have access to the **Fundamental Movement Skills (FMS) Checklist** as your primary source of truth.', 'You have access to the **Gymnastics Locomotor Skills Checklist** as your primary source of truth.')
        .replace('**FUNDAMENTAL MOVEMENT SKILLS CHECKLIST:**', '**GYMNASTICS LOCOMOTOR SKILLS CHECKLIST:**');
    }

    let systemInstruction = poseData && poseData.length > 0
      ? modeAwareMotionInstruction
      : FULL_SYSTEM_INSTRUCTION_TEMPLATE
          .replace('{{FMS_CONTEXT}}', fmsBlock);

    // RAG RETRIEVAL: Fetch extra context from uploaded PDFs
    let ragContext = '';
    try {
      if (currentMessage && currentMessage.trim().length > 3) {
        console.log("🔍 Querying Vector DB for context...");
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

    // Generate dynamic list of valid skills for the prompt
    const validSkillsList = Object.keys(SKILL_REFERENCE_IMAGES).join(', ');

    if (poseData && poseData.length > 0) {
      const isGymnastics = skillMode === 'gymnastics';
      if (!isVerified) {
        // PRE-ANALYSIS VERIFICATION MODE
        const validSkillsForMode = isGymnastics
          ? ALL_GYMNASTICS_SKILLS.join(', ')
          : validSkillsList;

        const gymnasticsBiomechanicsNote = isGymnastics
          ? `\nNote: For gymnastics locomotor skills, arm trajectory direction is not used to classify the skill. Focus on flight phase detection (both feet off ground), landing mechanics (knee bend), and rhythm/coordination instead.\n`
          : '';

        const phase1Discriminators = isGymnastics
          ? `   - **Flight Phase**: Are both feet off the ground at any point? (Required for Galloping, Sliding, Skipping, Jumping, Leaping, Running)
   - **Same Foot Take-off/Landing**: Does the student push off and land on the same foot? (Hopping)
   - **Rhythm & Pattern**: Is there a step-hop pattern? (Skipping) A lead-close pattern? (Galloping/Sliding)
   - **Direction of Travel**: Moving sideways? (Sliding) Forward? (all others)
   - **Landing Mechanics**: Does the student land on one foot or two feet?`
          : `   - **Release Point**: Where is the ball released? (Below knee = Roll, Knee-Waist = Throw, Above waist = Overhand/Catch)
   - **Arm Trajectory**: Does the arm swing downward (Underhand) or upward/overhead (Overhand)?
   - **Body Orientation**: Is the user facing the target or sideways (Overhand Throw/Kick often use side stance)?
   - **Leg Movement**: Is there a step? Which foot steps?`;

        const phase1SkillDiscriminators = isGymnastics
          ? `   - **Hopping vs Skipping**: Hopping uses ONE foot take-off and landing; Skipping is step-hop alternating feet
   - **Galloping vs Sliding**: Galloping moves forward; Sliding moves sideways
   - **Jumping (vertical) vs Jumping (horizontal)**: Vertical = upward thrust; Horizontal = forward thrust with body lean
   - **Leaping vs Running**: Leaping has a longer flight phase from a run, landing on opposite foot`
          : `   - **Underhand Roll vs Underhand Throw**: Roll releases BELOW KNEE (ball rolls on ground), Throw releases BETWEEN KNEE-WAIST (ball travels in air)
   - **Overhand Throw vs Chest Pass**: Overhand has arm going overhead and across body, Chest Pass extends straight forward from chest
   - **Kick**: Non-dominant foot plants beside ball, dominant leg swings through
   - **Dribble (hands)**: Repeated downward push, ball returns to hand
   - **Dribble (feet)**: Ball stays on ground, tapped with inside of foot`;

        systemInstruction = `
You are the Singapore PE Syllabus Assistant.
I have captured pose data from ${poseData.length} keyframes extracted evenly across the video.

**Pose measurements:**
${poseDescription}${movementPattern}
${biomechanicsReport || ''}
${gymnasticsBiomechanicsNote}
**YOUR GOAL (VERIFICATION PHASE):**
You must complete TWO phases before analysis can begin.
**PHASE 1**: Identify the Top 4 likely ${isGymnastics ? 'Gymnastics Locomotor Skills' : 'FMS Skills'}.
**PHASE 2**: Verify the Computer Vision data (${isGymnastics ? 'Flight phase and landing detection' : 'Ball detection'}).

**VALID SKILLS LIST**: ${validSkillsForMode}

**SKILL REFERENCE CHECKLIST:**
${activeSkillsText}

**INSTRUCTIONS:**
1. **Observe**: Look at the pose data and the visual input. Pay special attention to:
${phase1Discriminators}

2. **Identify**: Pick the **TOP 4** most likely skills from the VALID SKILLS LIST using these discriminators:
${phase1SkillDiscriminators}

3. **Format**: Use the following tag at the end of your response:
   '[[SKILL_CHOICES: Skill 1, Skill 2, Skill 3, Skill 4]]'
   Example: '[[SKILL_CHOICES: ${isGymnastics ? 'Hopping, Skipping, Galloping, Running' : 'Underhand Throw, Overhand Throw, Underhand Roll, Bounce Pass'}]]'

4. **Call to Action**:
   - Ask: "I've detected your movement! Which of these 4 skills is it?"
   - Mention: "Once you select one, I'll proceed to the full analysis."

**RESTRICTIONS:**
- **DO NOT GRADE** the performance yet.
- **DO NOT** output the ${isGymnastics ? 'Gymnastics Rubric' : 'FMS Rubric'} or Checklist.
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
${skillName ? `Proceed directly to grading "${skillName}" using the ${isGymnastics ? 'Gymnastics Locomotor Skills Rubric' : 'FMS Rubric'}. Use the Biomechanics Report's findings as supporting evidence. Only treat a biomechanics field as definitive failure if it is explicitly marked ❌ with **FAILURE** AND that failure is relevant to the confirmed skill (e.g. "EXCESSIVE BACKSWING" is only a failure for underhand skills, NOT for Overhand Throw where overhead arm is required).` : `Proceed with "STEP 1 - OBSERVE AND HYPOTHESIZE". Identify top 4 likely skills.`}

**IMPORTANT**:
- **Visual Evidence**: You MUST add a section called "**Visual Evidence**" where you quote specific differences between the provided Reference Image ("Gold Standard") and the User's Video ("Actual Performance").
- **CITATION RULE**: You MUST cite the specific frame number (e.g. "At Frame 12...") where the error or key event occurred. Do NOT say "consistent across all frames". Use the 'Ball Detected' status to confirm release points.
- **Teacher Check**: If the movement is partially obscured, ambiguous, or you are <70% confident, you MUST say: "I am not 100% sure about the [specific body part]. **This would require the assistance of a trained MOE PE teacher to verify.**"
- **FAILURE EXPLANATION**: When marking a feature as ❌, you MUST cite the specific frame and state what you observed instead (e.g. "At Frame 8, Knee angle was 175° (Straight) instead of <170°"). Do NOT claim "no frames found" if you have data; point to the frame that shows the error.

**CRITICAL CONSISTENCY RULE (PROFICIENCY VS CHECKLIST):**
- If you grade the Proficiency Level as "Keeping it Real" / "Developing" / "Beginning", you **MUST** have at least one ❌ or ⚠️ in the Checklist Assessment.
- **You cannot have a "Competent" checklist (all ✅) and a "Developing" grade.** They must tell the same story.

${!isGymnastics ? `**MANDATORY CHECKLIST RULES FOR UNDERHAND ROLL:**
The biomechanics report now provides SPECIFIC frame-level evidence. You MUST use it:

1. **Checklist Item #3 "Keep knees slightly bent" (Pray Position / Setup Phase)**:
   - Look at "**Setup Knee Bend ("Pray" Position)**" in the biomechanics report
   - If it says "❌ STRAIGHT KNEES IN SETUP" or "**FAILURE**" → You MUST mark Item #3 as ❌
   - Evidence format: "At Frame 1-2, knee angle was XX° (straight). The 'Pray' position requires slightly bent knees from the start."

2. **Checklist Item #5 "Swing dominant hand back at least to waist level" (Controlled Backswing)**:
   - Look at "**Backswing Height**" in the biomechanics report
   - If it says "❌ EXCESSIVE BACKSWING" or "ABOVE HEAD" or "**FAILURE**" → You MUST mark Item #5 as ❌
   - Evidence format: "At Frame X, hand reached Y position (above head level). The backswing must be CONTROLLED at waist level, not excessively high."
   - **DO NOT** give a "Pass" just because the hand went *past* the waist. "At least to waist level" means the MINIMUM is waist, but for Underhand Roll the MAXIMUM is also waist (controlled). "Too much" is a failure.

3. **Checklist Item #8 "Release ball on the ground"**:
   - Look at "**Ball Release Point**" in the biomechanics report
   - If release point is "above-waist" or "between-knee-waist" → You MUST mark Item #8 as ❌
   - Evidence format: "At Frame X, ball was released at Y position (above ground). For Underhand Roll, the ball must contact the ground before rolling."

- Pay close attention to the \`biomechanicsReport\` for definitive pass/fail on Step and Wind-up.` : ''}
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

    if (activeSkillName && activeReferenceImages[activeSkillName]) {
      // We need to fetch the image from the public folder and convert to base64
      // Since this runs in browser, we can use fetch
      try {
        const response = await fetch(activeReferenceImages[activeSkillName]);

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
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is missing in .env.local");

      const ai = new GoogleGenAI({ apiKey });

      // Prepend syllabus as a context exchange so it lives in conversation
      // history rather than the system instruction (avoids system instruction size limits).
      const syllabusContextPair: Content[] = poseData && poseData.length > 0 ? [] : [
        { role: 'user', parts: [{ text: getSyllabusContextMessage() }] },
        { role: 'model', parts: [{ text: 'I have read the full Singapore MOE PE Syllabus 2024 and am ready to answer questions based on it.' }] },
      ];

      const chat = ai.chats.create({
        model: MODEL_NAME,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
        },
        history: [...syllabusContextPair, ...history]
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
      const geminiController = new AbortController();
      const geminiTimeout = setTimeout(() => geminiController.abort(), 60_000);
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          history: poseData && poseData.length > 0
            ? history
            : [
                { role: 'user', parts: [{ text: getSyllabusContextMessage() }] },
                { role: 'model', parts: [{ text: 'I have read the full Singapore MOE PE Syllabus 2024 and am ready to answer questions based on it.' }] },
                ...history,
              ],
          message: parts, // Send the array of text/images
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }], // Request search tool
          // Motion analysis: 1500 tokens; Tier C syllabus (full sub-section): 1500 tokens;
          // Tier A/B clarification responses are short so 600 is fine, but we send 1500
          // as a safe ceiling — the AI self-limits via the system prompt rules.
          maxOutputTokens: (poseData && poseData.length > 0) ? 1500 : 1500,
        }),
        signal: geminiController.signal,
      }).finally(() => clearTimeout(geminiTimeout));

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
    let finalReferenceURI = (activeSkillName && activeReferenceImages[activeSkillName])
      ? activeReferenceImages[activeSkillName]
      : undefined;

    // Regex to find [[DISPLAY_REFERENCE: Skill Name]]
    const referenceTagMatch = text.match(/\[\[DISPLAY_REFERENCE:\s*([^\]]+)\]\]/);
    if (referenceTagMatch) {
      const suggestedSkill = referenceTagMatch[1].trim();
      // Check both image maps so DISPLAY_REFERENCE works in either mode
      if (activeReferenceImages[suggestedSkill]) {
        finalReferenceURI = activeReferenceImages[suggestedSkill];
      } else if (SKILL_REFERENCE_IMAGES[suggestedSkill]) {
        finalReferenceURI = SKILL_REFERENCE_IMAGES[suggestedSkill];
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
