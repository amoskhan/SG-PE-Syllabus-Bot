export interface FewShotExample {
    skillName: string;
    label: string; // e.g., "Competent Execution" or "Common Error: Straight Legs"
    inputData: string;
    idealOutput: string;
}

export const SKILL_EXAMPLES: FewShotExample[] = [
    // ============================================================================
    // SKILL: UNDERHAND ROLL
    // ============================================================================
    {
        skillName: "Underhand Roll",
        label: "Competent Execution (Teacher Demo)",
        inputData: `**Compressed Frame Data (Evidence):**
F1: RArm:MID. R.Elbow:56. Knees:176.
F2: RArm:MID. R.Elbow:47. Knees:176.
F3: RArm:MID. R.Elbow:61. Knees:175.
F4: RArm:MID. R.Elbow:52. Knees:176.
F5: RArm:MID. R.Elbow:82. Knees:176.
F6: RArm:MID. R.Elbow:105. Knees:175.
F7: RArm:MID. R.Elbow:116. Knees:154.
F8: RArm:MID. R.Elbow:117. Knees:154.
F9: RArm:MID. R.Elbow:105. Knees:117.
F10: RArm:MID. R.Elbow:99. Knees:70.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Hand**: Right (High Confidence)
2. **Stepping Foot**: Left (Correct contralateral step)
3. **Coordination**: ✅ Coordination looks okay
4. **Stance**: ✅ Stance width looks okay
5. **Wind-up**: N/A
6. **Arm Height**: ⚠️ Hand raised ABOVE HEAD level (Follow-through)
7. **Knee Bend**: ✅ Knees Bent Detected (Min angle: 70°). Credit "knees bent" criteria.
8. **Step Verification**: ✅ DISTINCT STEP DETECTED (Stride widened by 545%).`,
        idealOutput: `DETECTED SKILL: Underhand Roll

COMPARISON TO GOLD STANDARD
The user demonstrates competent form. The step forward is wide and distinct (Left foot), and the knees bend deeply (down to 70°) which is critical for a low release in a roll.

CHECKLIST ASSESSMENT
- 1. Face Target: ✅ Observed
- 2. Place feet shoulder width apart: ✅ Observed
- 3. Keep knees slightly bent: ✅ Observed (Excellent deep knee bend to 70°)
- 4. Hold ball with dominant hand in front: ✅ Observed
- 5. Swing dominant hand back at least to waist: ✅ Observed (Arm moves back in frames 1-4)
- 6. Step with non-dominant foot toward target: ✅ Observed (Left foot step detected)
- 7. Lower body by bending at knees and waist: ✅ Observed (Knee angle drops significantly from 176° to 70°)
- 8. Swing dominant hand forward and release: ✅ Observed
- 9. After release, hand continues toward target: ✅ Observed

PROFICIENCY LEVEL: Competent
You met ALL critical features. The deep knee bend is particularly good for this skill.

FEEDBACK
Excellent execution. The low release point was achieved through good knee flexion.`
    },
    {
        skillName: "Underhand Roll",
        label: "Competent Execution (Right Hand)",
        inputData: `**Compressed Frame Data (Evidence):**
F1: RArm:MID. R.Elbow:43. Knees:145.
F2: RArm:MID. R.Elbow:153. Knees:151.
F3: RArm:MID. R.Elbow:174. Knees:137.
F4: RArm:MID. R.Elbow:160. Knees:145.
F5: RArm:MID. R.Elbow:164. Knees:110.
F6: RArm:MID. R.Elbow:140. Knees:89.
F7: RArm:MID. R.Elbow:91. Knees:82.
F8: RArm:MID. R.Elbow:104. Knees:76.
F9: RArm:MID. R.Elbow:113. Knees:75.
F10: RArm:MID. R.Elbow:119. Knees:79.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Hand**: Right (High Confidence)
2. **Stepping Foot**: Left
3. **Coordination**: ✅ Coordination looks okay
4. **Stance**: ✅ Stance width looks okay
5. **Wind-up**: N/A
6. **Arm Height**: ⚠️ Hand raised ABOVE HEAD level (High Backswing/Follow-through)
7. **Knee Bend**: ✅ Knees Bent Detected (Min angle: 75°). Credit "knees bent" criteria.
8. **Step Verification**: ✅ DISTINCT STEP DETECTED (Stride widened by 809%).`,
        idealOutput: `DETECTED SKILL: Underhand Roll

COMPARISON TO GOLD STANDARD
Another proficient demonstration. The user executes a very strong contralateral step (widening stride by >800%) and lowers the body effectively (knees 75°). The release is smooth.

CHECKLIST ASSESSMENT
- 1. Face Target: ✅ Observed
- 2. Place feet shoulder width apart: ✅ Observed
- 3. Keep knees slightly bent: ✅ Observed (Good bend)
- 4. Hold ball with dominant hand in front: ✅ Observed
- 5. Swing dominant hand back at least to waist: ✅ Observed
- 6. Step with non-dominant foot toward target: ✅ Observed (Left foot, very wide step)
- 7. Lower body by bending at knees and waist: ✅ Observed (Knees drop 151° -> 75°)
- 8. Swing dominant hand forward and release: ✅ Observed
- 9. After release, hand continues toward target: ✅ Observed

PROFICIENCY LEVEL: Competent
Mechanics are sound. The wide step provides excellent stability.

FEEDBACK
Very stable base. Keep the release point low/consistent.`
    },
    {
        skillName: "Underhand Roll",
        label: "Developing: Ambiguous Step & High Swing",
        inputData: `**Compressed Frame Data (Evidence):**
F1: RArm:MID. R.Elbow:86. Knees:141.
F2: RArm:MID. R.Elbow:83. Knees:145.
F3: RArm:MID. R.Elbow:82. Knees:149.
F4: RArm:MID. R.Elbow:122. Knees:153.
F5: RArm:MID. R.Elbow:104. Knees:122.
F6: RArm:MID. R.Elbow:163. Knees:87.
F7: RArm:MID. R.Elbow:175. Knees:67.
F8: RArm:MID. R.Elbow:165. Knees:71.
F9: RArm:MID. R.Elbow:176. Knees:70.
F10: RArm:MID. R.Elbow:170. Knees:69.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Hand**: Right (High Confidence)
2. **Stepping Foot**: None/Both (Ambiguous)
3. **Coordination**: ✅ Coordination looks okay
4. **Stance**: ✅ Stance width looks okay
5. **Wind-up**: N/A
6. **Arm Height**: ⚠️ Hand raised ABOVE HEAD level (High Backswing)
7. **Knee Bend**: ✅ Knees Bent Detected (Min angle: 67°).
8. **Step Verification**: ✅ DISTINCT STEP DETECTED (Stride widened by 1104%). Stepping foot: None/Both.`,
        idealOutput: `DETECTED SKILL: Underhand Roll

COMPARISON TO GOLD STANDARD
The user gets low to the ground (good knee bend), but the mechanics are messy. The step is ambiguous (listed as "None/Both"), and the arm swing is uncontrolled and high.

CHECKLIST ASSESSMENT
- 1. Face Target: ✅ Observed
- 2. Place feet shoulder width apart: ✅ Observed
- 3. Keep knees slightly bent: ✅ Observed
- 4. Hold ball with dominant hand in front: ✅ Observed
- 5. Swing dominant hand back: ✅ Observed
- 6. Step with non-dominant foot: ❌ Not Observed (Step was detected but foot was ambiguous/unclear)
- 7. Lower body by bending at knees and waist: ✅ Observed
- 8. Swing dominant hand forward and release: ✅ Observed
- 9. After release, hand continues toward target: ❌ Partial (Hand swings too high)

PROFICIENCY LEVEL: Developing
The foundation is there (good depth), but the footwork (step) is unclear and the arm action is excessive.

FEEDBACK
Focus on a clear step with the OPPOSITE foot. Keep the arm swing controlled and low.`
    },
    {
        skillName: "Underhand Roll",
        label: "Common Error: High Release/Follow-through (Left Handed)",
        inputData: `**Compressed Frame Data (Evidence):**
F1: RArm:MID. R.Elbow:48. Knees:159.
F2: RArm:MID. R.Elbow:44. Knees:159.
F3: RArm:MID. R.Elbow:46. Knees:160.
F4: RArm:MID. R.Elbow:44. Knees:158.
F5: RArm:MID. R.Elbow:168. Knees:150.
F6: RArm:MID. R.Elbow:165. Knees:158.
F7: RArm:MID. R.Elbow:166. Knees:83.
F8: RArm:MID. R.Elbow:101. Knees:74.
F9: RArm:MID. R.Elbow:101. Knees:73.
F10: RArm:MID. R.Elbow:168. Knees:70.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Hand**: Left (High Confidence)
2. **Stepping Foot**: Right
3. **Coordination**: ✅ Coordination looks okay (Left Hand + Right Foot is correct)
4. **Stance**: ✅ Stance width looks okay
5. **Wind-up**: N/A
6. **Arm Height**: ⚠️ Hand raised ABOVE HEAD level (High Backswing/Follow-through). Check if excessive.
7. **Knee Bend**: ✅ Knees Bent Detected (Min angle: 70°).`,
        idealOutput: `DETECTED SKILL: Underhand Roll

COMPARISON TO GOLD STANDARD
The user is Left-Handed and correctly steps with the Right foot. However, the arm swing is excessively high (going above the head), which defeats the purpose of a "Roll". A roll must stay low to the ground.

CHECKLIST ASSESSMENT
- 1. Face Target: ✅ Observed
- 2. Place feet shoulder width apart: ✅ Observed
- 3. Keep knees slightly bent: ✅ Observed
- 4. Hold ball with dominant hand in front: ✅ Observed
- 5. Swing dominant hand back: ✅ Observed
- 6. Step with non-dominant foot: ✅ Observed (Right foot, correct for Lefty)
- 7. Lower body by bending at knees and waist: ✅ Observed
- 8. Swing dominant hand forward and release: ✅ Observed
- 9. After release, hand continues toward target: ❌ Partial (Hand goes WAY too high, above head)

PROFICIENCY LEVEL: Developing
Mechanics are correct, but the release trajectory is wrong. You are throwing, not rolling.

FEEDBACK
Keep your hand LOW. Your fingers should almost graze the floor on release. Do not swing above your waist.`
    },
    // ============================================================================
    // SKILL: JUMPING (VERTICAL)
    // ============================================================================
    {
        skillName: "Jumping (vertical)",
        label: "Competent Execution",
        inputData: `**Compressed Frame Data (Evidence):**
F1: Arms:LOW. Knees:168. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F2: Arms:LOW. Knees:142. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F3: Arms:BACK. Knees:98. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F4: Arms:FORWARD_UP. Knees:72. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F5: Arms:OVERHEAD. Knees:155. AnkleGap:SHOULDER_WIDTH. BothFeet:AIR.
F6: Arms:OVERHEAD. Knees:170. AnkleGap:SHOULDER_WIDTH. BothFeet:AIR.
F7: Arms:OVERHEAD. Knees:172. AnkleGap:SHOULDER_WIDTH. BothFeet:AIR.
F8: Arms:FORWARD. Knees:160. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F9: Arms:LOW. Knees:118. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F10: Arms:LOW. Knees:105. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Hand**: Both (symmetrical jump)
2. **Arm Trajectory**: LOW SWING → OVERHEAD (full arm swing detected)
3. **Wind-up**: ✅ Arms swung back before takeoff (F3)
4. **Stance**: ✅ Feet shoulder-width apart throughout
5. **Knee Bend**: ✅ Knees Bent Detected (Min angle: 72°). Deep pre-jump squat.
6. **Flight Phase**: ✅ Both feet off ground detected (F5–F7)
7. **Landing**: ✅ Knee bend on landing (105° at F10)`,
        idealOutput: `DETECTED SKILL: Jumping (vertical)

COMPARISON TO GOLD STANDARD
The user demonstrates competent vertical jump mechanics. The preparation phase shows a clear arm swing-back (F3) and deep knee bend (72°), arms drive upward to overhead during takeoff, a clear flight phase is present (3 frames airborne), and landing shows appropriate knee bend (105°) to absorb force.

CHECKLIST ASSESSMENT
- 1. Knees and Arms: Knees are bent and arms are back to begin the jump: ✅ Observed (Knees 72°, arms back at F3–F4)
- 2. Feet: Feet are shoulder-width apart: ✅ Observed (AnkleGap:SHOULDER_WIDTH throughout)
- 3. Arms: Arms begin to swing forward and up toward the sky: ✅ Observed (Arms reach OVERHEAD at F5)
- 4. Legs: Legs forcefully thrust the body upward: ✅ Observed (Clear flight phase F5–F7)
- 5. Landing: Knees are bent and shoulder-width apart: ✅ Observed (Knee angle 105° at landing, feet shoulder-width)

PROFICIENCY LEVEL: Competent
All criteria are met. The deep pre-jump knee bend and full arm swing contribute to a strong vertical jump.

FEEDBACK
Excellent execution. The arm swing is full and timed well with the leg drive. Maintain the knee bend on landing to protect joints.`
    },
    {
        skillName: "Jumping (vertical)",
        label: "Common Error: No Arm Swing",
        inputData: `**Compressed Frame Data (Evidence):**
F1: Arms:SIDES. Knees:165. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F2: Arms:SIDES. Knees:138. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F3: Arms:SIDES. Knees:95. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F4: Arms:SIDES. Knees:78. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F5: Arms:SIDES. Knees:162. AnkleGap:SHOULDER_WIDTH. BothFeet:AIR.
F6: Arms:SIDES. Knees:170. AnkleGap:SHOULDER_WIDTH. BothFeet:AIR.
F7: Arms:SIDES. Knees:155. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F8: Arms:SIDES. Knees:128. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F9: Arms:SIDES. Knees:118. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F10: Arms:SIDES. Knees:115. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Hand**: Both (symmetrical)
2. **Arm Trajectory**: STATIC (arms remain at sides throughout)
3. **Wind-up**: ❌ No arm swing-back detected
4. **Stance**: ✅ Feet shoulder-width apart
5. **Knee Bend**: ✅ Knees Bent Detected (Min angle: 78°). Pre-jump squat present.
6. **Flight Phase**: ✅ Both feet off ground detected (F5–F6, only 2 frames)
7. **Landing**: ✅ Knee bend on landing (115°)`,
        idealOutput: `DETECTED SKILL: Jumping (vertical)

COMPARISON TO GOLD STANDARD
The user bends the knees well and achieves lift-off, but the arms remain at the sides throughout the entire movement. Without an arm swing, the jump height is significantly reduced. The flight phase is short (only 2 frames compared to 3+ for competent execution).

CHECKLIST ASSESSMENT
- 1. Knees and Arms: Knees are bent and arms are back to begin the jump: ❌ Partial (Knees bent ✅, but arms never swing back ❌)
- 2. Feet: Feet are shoulder-width apart: ✅ Observed
- 3. Arms: Arms begin to swing forward and up toward the sky: ❌ Not Observed (Arms remained at sides throughout F1–F10)
- 4. Legs: Legs forcefully thrust the body upward: ⚠️ Partial (Takeoff present but limited flight due to no arm assist)
- 5. Landing: Knees are bent and shoulder-width apart: ✅ Observed (115° knee bend on landing)

PROFICIENCY LEVEL: Developing
Knee action and landing are correct, but the arm swing — a key power source for vertical jump — is absent.

FEEDBACK
Use your arms! Swing them back during the squat, then drive them forward and up as you jump. This arm action adds significant height to your jump.`
    },
    // ============================================================================
    // SKILL: LEAPING
    // ============================================================================
    {
        skillName: "Leaping",
        label: "Competent Execution",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. LeadFoot:LEFT. Arms:RUNNING. Knees:158. RunningStride:DETECTED.
F2: BothFeet:GROUNDED. LeadFoot:LEFT. Arms:RUNNING. Knees:155. RunningStride:DETECTED.
F3: BothFeet:GROUNDED. TakeoffFoot:RIGHT. Arms:FORWARD_REACH. Knees:138.
F4: TakeoffFoot:RIGHT_PUSHING. LeadFoot:LEFT_FORWARD. Arms:OPP_ARM_FORWARD. BothFeet:AIR.
F5: BothFeet:AIR. StridePosition:SPLIT. OppArm:FORWARD. Knees:168.
F6: BothFeet:AIR. StridePosition:SPLIT. OppArm:FORWARD. Knees:170.
F7: LandingFoot:LEFT. BothFeet:GROUNDED. Arms:BALANCING. Knees:128.
F8: BothFeet:GROUNDED. Arms:RUNNING. Knees:148. RunningStride:DETECTED.
F9: BothFeet:GROUNDED. Arms:RUNNING. Knees:152. RunningStride:DETECTED.
F10: BothFeet:GROUNDED. Arms:RUNNING. Knees:155. RunningStride:DETECTED.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Foot**: Right (takeoff foot)
2. **Running Approach**: ✅ Running stride detected before leap (F1–F2)
3. **Takeoff**: ✅ Single-foot takeoff detected (Right foot, F3–F4)
4. **Flight Phase**: ✅ Both feet off ground in stride/split position (F5–F6)
5. **Opposite Arm**: ✅ Left arm (opposite to right takeoff foot) reaches forward in flight
6. **Landing**: ✅ Landing on opposite foot (Left foot, F7); knee bend 128°
7. **Post-Landing Run**: ✅ Running steps detected after landing (F8–F10)`,
        idealOutput: `DETECTED SKILL: Leaping

COMPARISON TO GOLD STANDARD
The user demonstrates a complete and well-executed leap. There is a clear running approach (F1–F2), a defined single-foot push-off from the right foot (F3–F4), a stride/split position in flight with the opposite (left) arm reaching forward (F5–F6), and a controlled landing on the left foot with knee bend (F7), followed by continuation of the run (F8–F10).

CHECKLIST ASSESSMENT
- 1. Run: Take several running steps before starting to leap: ✅ Observed (Running stride detected F1–F2)
- 2. Takeoff: Push off the ground with one foot: ✅ Observed (Right foot single-foot push-off at F3–F4)
- 3. Flight: Both feet temporarily off ground in stride position; opposite arm reaches forward: ✅ Observed (Stride split at F5–F6, left arm forward)
- 4. Landing: Land on opposite foot from takeoff; knee bent to absorb force: ✅ Observed (Left foot landing at F7, knee 128°)
- 5. Run: Run a few steps after landing: ✅ Observed (Running continues F8–F10)

PROFICIENCY LEVEL: Competent
All five criteria are met. The opposite-arm reach and stride split in flight are particularly well-executed.

FEEDBACK
Excellent leap. The arm-leg opposition in flight shows good coordination. To progress toward Excellent, focus on maximising the flight phase duration and achieving a longer, more dramatic stride split.`
    },
    {
        skillName: "Leaping",
        label: "Common Error: Two-Foot Takeoff",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. Arms:RUNNING. Knees:155. RunningStride:DETECTED.
F2: BothFeet:GROUNDED. Arms:RUNNING. Knees:152. RunningStride:DETECTED.
F3: BothFeet:GROUNDED. BothFeetPushing:TRUE. Arms:FORWARD. Knees:130.
F4: BothFeet:AIR. Arms:FORWARD. Knees:158. SimultaneousTakeoff:TRUE.
F5: BothFeet:AIR. Arms:FORWARD. Knees:165. StridePosition:NONE.
F6: BothFeet:GROUNDED. LandingFoot:LEFT. Arms:BALANCING. Knees:132.
F7: BothFeet:GROUNDED. Arms:RUNNING. Knees:148. RunningStride:DETECTED.
F8: BothFeet:GROUNDED. Arms:RUNNING. Knees:150. RunningStride:DETECTED.
F9: BothFeet:GROUNDED. Arms:RUNNING. Knees:152.
F10: BothFeet:GROUNDED. Arms:RUNNING. Knees:154.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Foot**: Ambiguous (both feet pushed off simultaneously)
2. **Running Approach**: ✅ Running stride detected (F1–F2)
3. **Takeoff**: ❌ Simultaneous two-foot takeoff detected at F3–F4 (not a single-foot push-off)
4. **Flight Phase**: ✅ Both feet off ground (F4–F5), but no stride/split position
5. **Opposite Arm**: ❌ Not detected; both arms forward symmetrically
6. **Landing**: ✅ Left foot landing with knee bend (132°) at F6
7. **Post-Landing Run**: ✅ Running steps after landing (F7–F10)`,
        idealOutput: `DETECTED SKILL: Leaping

COMPARISON TO GOLD STANDARD
The user has a good running approach and continues to run after landing, but the takeoff is the critical error: both feet push off the ground simultaneously (F3–F4), making this more of a broad jump than a leap. A true leap requires a single-foot push-off with the other leg swinging forward into stride position. The flight phase also lacks the characteristic stride split.

CHECKLIST ASSESSMENT
- 1. Run: Take several running steps before starting to leap: ✅ Observed (Running approach F1–F2)
- 2. Takeoff: Push off the ground with one foot: ❌ Not Observed (Simultaneous two-foot takeoff detected at F3–F4)
- 3. Flight: Both feet temporarily off ground in stride position; opposite arm reaches forward: ❌ Partial (Airborne at F4–F5 ✅, but no stride split and no opposite-arm reach ❌)
- 4. Landing: Land on opposite foot from takeoff; knee bent to absorb force: ⚠️ Partial (Knee bend present ✅, but takeoff foot was ambiguous so "opposite foot" cannot be confirmed ❌)
- 5. Run: Run a few steps after landing: ✅ Observed (F7–F10)

PROFICIENCY LEVEL: Developing
Running approach and post-landing run are present, but the defining feature of a leap — single-foot push-off into a stride split — is missing.

FEEDBACK
Focus on the takeoff: push off with ONE foot only, letting the other leg swing forward. Think of it as an exaggerated running stride rather than a jump. As you rise into the air, your legs should be split wide apart like a scissors shape.`
    },
    // ============================================================================
    // SKILL: HOPPING (GYMNASTICS)
    // ============================================================================
    {
        skillName: "Hopping",
        label: "Competent Execution",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. HoppingFoot:RIGHT. Knees:148. Eyes:FORWARD. Arms:BENT_RUNNING.
F2: HoppingFoot:RIGHT_PUSHING. NonSupportLeg:LEFT_BENT. Knees:95. Arms:FORWARD.
F3: BothFeet:AIR. HoppingFoot:RIGHT_EXTENDED. NonSupportLeg:LEFT_FORWARD. Knees:162.
F4: BothFeet:AIR. StridePosition:PENDING. Knees:168. Arms:FORWARD_BENT.
F5: HoppingFoot:RIGHT_LANDING. LandingKnee:BENT. Knees:82. Arms:BALANCING.
F6: BothFeet:GROUNDED. HoppingFoot:RIGHT. Knees:135. Arms:BENT_RUNNING. Rhythm:SMOOTH.
F7: HoppingFoot:RIGHT_PUSHING. NonSupportLeg:LEFT_BENT. Knees:98. Arms:FORWARD.
F8: BothFeet:AIR. StridePosition:CLEAR. Knees:165. Arms:FORWARD_BENT.
F9: HoppingFoot:RIGHT_LANDING. LandingKnee:BENT. Knees:85. Arms:BALANCING.
F10: BothFeet:GROUNDED. BodyPosition:UPRIGHT. Rhythm:SMOOTH_RHYTHMIC.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Hopping Foot**: Right (consistent throughout)
2. **Eyes and Body**: ✅ Eyes forward, upright body position maintained
3. **Takeoff/Landing**: ✅ Same foot (Right) for both takeoff and landing across all cycles (F2–F3, F6–F7)
4. **Swing Knee**: ✅ Non-support leg (Left) bent and swinging forward at each hop (F2, F7)
5. **Arm Action**: ✅ Elbows bent, opposite arm motion with swing leg (Left arm forward when Left leg swings)
6. **Landing Mechanics**: ✅ Knee bend on landing (82° at F5, 85° at F9) to absorb force
7. **Rhythm**: ✅ Smooth, rhythmic motion evident across all cycles (even timing between hops)`,
        idealOutput: `DETECTED SKILL: Hopping

COMPARISON TO GOLD STANDARD
The user demonstrates proficient hopping mechanics. Both hop cycles (F2–F5 and F6–F9) show consistent right-foot takeoff and landing, the left (non-hopping) knee is flexed and swings forward on each hop, the elbows remain bent with controlled arm action, and the landing shows good knee bend to absorb impact. The body remains upright and the rhythm is smooth and controlled.

CHECKLIST ASSESSMENT
- 1. Eyes and Body: The eyes look forward in the direction of travel, and the body moves in an upright position: ✅ Observed (Eyes forward, upright throughout)
- 2. Foot and Takeoff Leg: Take off and land on the same foot, bending the knee on landing: ✅ Observed (Right foot takeoff and landing on both cycles; knee bend 82–85°)
- 3. Swing Knee: The swing knee is bent and swings forward: ✅ Observed (Left knee bent and forward at F2, F7)
- 4. Arms: The elbows are bent, and the arm opposite the swing leg moves forward: ✅ Observed (Bent elbows with Left arm forward on each hop)
- 5. Glide: The body moves with a smooth, rhythmic motion: ✅ Observed (Consistent rhythm across both cycles)

PROFICIENCY LEVEL: Competent
All criteria are met. The consistent foot pattern, coordinated arm-leg opposition, and smooth rhythm demonstrate solid hopping technique.

FEEDBACK
Excellent hopping. The knee bend on landing and controlled arm action are particularly good. To progress to Excellent, try increasing the height of the hop while maintaining the same smooth rhythm.`
    },
    // ============================================================================
    // SKILL: SKIPPING (GYMNASTICS)
    // ============================================================================
    {
        skillName: "Skipping",
        label: "Competent Execution",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. LeadFoot:RIGHT. Eyes:FORWARD. BodyPosition:UPRIGHT. Arms:RUNNING.
F2: RightFoot:STEPPING. LeftLeg:BENT. Knees:125. Arms:OPP_FORWARD.
F3: BothFeet:AIR. RightLeg:HOPPING_UPWARD. LeftLeg:BENT_UP. Knees:158. Arms:MOVING_OPPOSITION.
F4: BothFeet:AIR. FlightPhase:CLEAR. LeftLeg:FORWARD_BENT. Knees:165. Arms:LEFT_FORWARD.
F5: RightFoot:LANDING. LandingKnee:BENT. Knees:88. Arms:RUNNING_MOTION.
F6: BothFeet:GROUNDED. LeftFoot:STEPPING. RightLeg:BENT. Knees:130. Arms:OPP_FORWARD.
F7: BothFeet:AIR. LeftLeg:HOPPING_UPWARD. RightLeg:BENT_UP. Knees:160. Arms:MOVING_OPPOSITION.
F8: BothFeet:AIR. FlightPhase:CLEAR. RightLeg:FORWARD_BENT. Knees:163. Arms:RIGHT_FORWARD.
F9: LeftFoot:LANDING. LandingKnee:BENT. Knees:87. Arms:RUNNING_MOTION.
F10: BothFeet:GROUNDED. CycleComplete:TRUE. Rhythm:SMOOTH.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Eyes and Body**: ✅ Eyes forward, upright body position throughout
2. **Step and Hop**: ✅ Clear step-hop pattern on each foot (Right: F2–F5, Left: F6–F9)
3. **Arms**: ✅ Arms move in opposition (Left arm forward with Right leg hop, Right arm forward with Left leg hop)
4. **Flight**: ✅ Both feet off ground in each cycle (F3–F4, F7–F8); non-support leg bent during flight
5. **Glide**: ✅ Smooth, rhythmic motion with consistent timing across both cycles
6. **Landing**: ✅ Bent knees on landing (88°, 87°) absorbing force effectively`,
        idealOutput: `DETECTED SKILL: Skipping

COMPARISON TO GOLD STANDARD
The user demonstrates competent skipping with clear alternating step-hop patterns. Each cycle (Right foot: F2–F5, Left foot: F6–F9) shows a controlled step followed by a hop on the same foot, the arms move in coordinated opposition (Left arm forward during Right-leg hop, and vice versa), both feet achieve flight in each cycle with the non-support leg bent, landing is controlled with good knee bend (87–88°), and the overall rhythm is smooth and even.

CHECKLIST ASSESSMENT
- 1. Eyes and Body: The eyes focus in the direction of travel, and the body maintains an upright position: ✅ Observed (Eyes forward, upright throughout F1–F10)
- 2. Step and Hop: Step and hop on the same foot: ✅ Observed (Right-foot step-hop F2–F5, Left-foot step-hop F6–F9)
- 3. Arms: Arms move in opposition: ✅ Observed (Opposite-arm swing with each step-hop cycle)
- 4. Flight: Both feet temporarily off the ground; the nonsupport leg is bent: ✅ Observed (Flight phases F3–F4 and F7–F8 with bent non-support legs)
- 5. Glide: The body moves with a smooth, rhythmic motion: ✅ Observed (Consistent timing and smooth transitions across all cycles)

PROFICIENCY LEVEL: Competent
All criteria are met. The coordinated arm-leg opposition and consistent step-hop rhythm demonstrate solid skipping technique.

FEEDBACK
Well done. Your skip rhythm is even and your arm-leg coordination is clean. To advance, try increasing the height of the hop phase while keeping the rhythm consistent.`
    },
    // ============================================================================
    // SKILL: LEAPING INTO FORWARD ROLL (SEQUENCED SKILL)
    // ============================================================================
    {
        skillName: "Leaping into Forward Roll",
        label: "Competent Execution with Smooth Transition",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. LeadFoot:LEFT. Arms:RUNNING. Knees:158. RunningStride:DETECTED.
F2: BothFeet:GROUNDED. LeadFoot:LEFT. Arms:RUNNING. Knees:152. RunningStride:DETECTED.
F3: BothFeet:GROUNDED. TakeoffFoot:RIGHT. Arms:FORWARD_REACH. Knees:135.
F4: TakeoffFoot:RIGHT_PUSHING. LeadFoot:LEFT_FORWARD. Arms:OPP_ARM_FORWARD. BothFeet:AIR.
F5: BothFeet:AIR. StridePosition:SPLIT. OppArm:FORWARD. Knees:168. FlightPhase:PEAK.
F6: BothFeet:AIR. StridePosition:SPLIT. OppArm:FORWARD. Knees:170. FlightPhase:PEAK.
F7: LandingFoot:LEFT. BothFeet:GROUNDING. TransitionStart:TRUE. Knees:120. HeadPosition:TUCKED.
F8: BothFeet:GROUNDED. BodyPosition:FORWARD_ROLLING. Knees:95. ShoulderRoll:INITIATED. HeadTuck:COMPLETE.
F9: RollingPhase:MID. BackRolling:DETECTED. Knees:135. BodyCurved:TRUE. HeadTucked:YES.
F10: RollingPhase:COMPLETION. BothFeet:APPROACHING_GROUNDED. Knees:155. StandingUp:INITIATED.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Running Approach**: ✅ Running stride detected (F1–F2)
2. **Single-Foot Takeoff**: ✅ Right-foot push-off at F3–F4
3. **Flight Phase**: ✅ Both feet off ground in stride position (F5–F6)
4. **Opposite Arm**: ✅ Left arm reaches forward in flight
5. **Landing**: ✅ Left foot landing with knee bend (120°) at F7
6. **Transition Timing**: ✅ Smooth transition from leap landing to forward roll initiation (F7–F8)
7. **Head Tuck**: ✅ Head tucked at landing (F7) before rolling forward
8. **Body Curve**: ✅ Body maintains proper forward-roll curve through F9
9. **Roll Completion**: ✅ Standing recovery initiated at F10`,
        idealOutput: `DETECTED SKILL: Leaping into Forward Roll (Sequenced)

COMPARISON TO GOLD STANDARD
The user demonstrates competent execution of both the leap and the transition into a forward roll. The leap itself meets all criteria: a clear running approach (F1–F2), single-foot push-off from the right foot (F3–F4), a well-defined stride split in flight with opposite-arm reach (F5–F6), and a controlled landing on the left foot with knee bend (120°) at F7. The transition is smooth — the user immediately tucks the head and begins the forward roll (F8), maintains a proper body curve throughout the roll (F9), and initiates standing recovery (F10).

CHECKLIST ASSESSMENT (LEAP):
- 1. Run: Take several running steps before starting to leap: ✅ Observed (Running stride F1–F2)
- 2. Takeoff: Push off the ground with one foot: ✅ Observed (Right-foot single-foot push-off at F3–F4)
- 3. Flight: Both feet temporarily off ground in stride position; opposite arm reaches forward: ✅ Observed (Stride split at F5–F6, left arm forward)
- 4. Landing: Land on opposite foot from takeoff; knee bent to absorb force: ✅ Observed (Left foot landing at F7, knee 120°)
- 5. Run: Run a few steps after landing: N/A (Transitions into forward roll instead)

SEQUENCING & TRANSITIONS:
- Leap-to-Roll Timing: ✅ Transition occurs immediately after landing (F7–F8); no pause or loss of momentum
- Continuity: ✅ Flow is smooth; energy from leap carries into roll
- Safety: ✅ Head tuck is well-timed, body position controlled throughout

PROFICIENCY LEVEL: Competent
Both components are well-executed individually, and the transition between them is smooth and controlled. The user demonstrates good spatial awareness and body control throughout the sequence.

FEEDBACK
Excellent combination! Your leap has good height and the stride split is clear. The transition into the roll is smooth—your head tuck comes right on cue and you maintain momentum through the entire sequence. To progress to Excellent, focus on extending the flight phase of the leap slightly and maintaining an even, slower roll to show better control.`
    },
    // ============================================================================
    // SKILL: GALLOPING (GYMNASTICS)
    // ============================================================================
    {
        skillName: "Galloping",
        label: "Competent Execution",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. LeadFoot:RIGHT. Eyes:FORWARD. BodyPosition:UPRIGHT_SLIGHT_LEAN.
F2: LeadFoot:RIGHT_STEPPING. BackFoot:LEFT_CLOSING. Arms:BENT_FORWARD_BACK. Knees:145.
F3: BothFeet:AIR. FlightPhase:BRIEF. Knees:158. LeadFoot:FORWARD.
F4: LeadFoot:RIGHT_LANDING. BackFoot:LEFT_CLOSING. Knees:128. Arms:BENT_FORWARD_BACK.
F5: BothFeet:GROUNDED. LeadFoot:RIGHT. Rhythm:SMOOTH. Arms:SWINGING.
F6: LeadFoot:RIGHT_STEPPING. BackFoot:LEFT_CLOSING. Knees:142. Arms:BENT_FORWARD_BACK.
F7: BothFeet:AIR. FlightPhase:BRIEF. Knees:162.
F8: LeadFoot:RIGHT_LANDING. BackFoot:LEFT_CLOSING. Knees:132. Arms:MOVING.
F9: BothFeet:GROUNDED. Rhythm:CONSISTENT. BodyPosition:UPRIGHT_SLIGHT_LEAN.
F10: LeadFoot:RIGHT_STEPPING. Arms:BENT_FORWARD_BACK. Knees:140. Rhythm:SMOOTH_RHYTHMIC.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Lead Foot**: Right (consistent throughout)
2. **Eyes and Body**: ✅ Eyes forward, upright position with slight forward lean
3. **Step-Close Pattern**: ✅ Lead foot steps forward and back foot closes to it on each cycle (F2, F6)
4. **Flight Phase**: ✅ Both feet briefly off ground detected (F3, F7)
5. **Arms**: ✅ Elbows bent, arms swinging forward and back
6. **Rhythm**: ✅ Smooth, rhythmic motion across both cycles`,
        idealOutput: `DETECTED SKILL: Galloping

COMPARISON TO GOLD STANDARD
The user demonstrates competent galloping. The lead foot (Right) consistently steps forward and the back foot (Left) closes to it on each cycle, a brief flight phase is visible, the arms are bent and swinging in rhythm, and the body maintains an upright position with a slight forward lean throughout.

CHECKLIST ASSESSMENT
- 1. Eyes and Body: The eyes look in the direction of travel, and the body moves in an upright position with a slight forward lean: ✅ Observed (Eyes forward, upright with slight lean throughout)
- 2. Flight: Step forward with the lead foot and close with the back foot. Both feet are temporarily off the ground: ✅ Observed (Step-close pattern with flight at F3, F7)
- 3. Arms: Arms are bent and swinging forward and back: ✅ Observed (Bent elbows with forward-back swing each cycle)
- 4. Glide: The body moves with a smooth, rhythmic motion: ✅ Observed (Consistent rhythm across both cycles)

PROFICIENCY LEVEL: Competent
All criteria are met. The consistent lead foot, clear flight phase, and rhythmic arm action demonstrate solid galloping technique.

FEEDBACK
Good gallop! The step-close pattern is consistent and the flight phase is clear. To progress to Excellent, focus on maximizing the height of the flight phase while keeping the rhythm even.`
    },
    // ============================================================================
    // SKILL: SLIDING (GYMNASTICS)
    // ============================================================================
    {
        skillName: "Sliding",
        label: "Competent Execution",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. Direction:RIGHT. Eyes:RIGHT_LEAD_SHOULDER. BodyPosition:UPRIGHT.
F2: LeadFoot:RIGHT_STEPPING. TrailFoot:LEFT_PARALLEL. Knees:140. Arms:SIDES.
F3: BothFeet:AIR. FlightPhase:BRIEF. FeetParallel:YES. Knees:158.
F4: LeadFoot:RIGHT_LANDING. TrailFoot:LEFT_CLOSING. Knees:128. FeetParallel:YES.
F5: BothFeet:GROUNDED. FeetParallel:YES. Rhythm:SMOOTH. BodyPosition:UPRIGHT.
F6: LeadFoot:RIGHT_STEPPING. TrailFoot:LEFT_PARALLEL. Knees:138. Arms:SIDES.
F7: BothFeet:AIR. FlightPhase:BRIEF. FeetParallel:YES. Knees:162.
F8: LeadFoot:RIGHT_LANDING. TrailFoot:LEFT_CLOSING. Knees:130. FeetParallel:YES.
F9: BothFeet:GROUNDED. FeetParallel:YES. Rhythm:CONSISTENT.
F10: BothFeet:GROUNDED. BodyPosition:UPRIGHT. Rhythm:SMOOTH_RHYTHMIC. FeetParallel:YES.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Direction**: Right (lateral movement)
2. **Eyes and Body**: ✅ Chin over lead (right) shoulder, eyes in direction of travel, upright body
3. **Feet Parallel**: ✅ Feet remain parallel to each other throughout all frames
4. **Flight Phase**: ✅ Both feet briefly off ground (F3, F7)
5. **Rhythm**: ✅ Smooth, rhythmic lateral motion across both cycles`,
        idealOutput: `DETECTED SKILL: Sliding

COMPARISON TO GOLD STANDARD
The user demonstrates competent sliding. The chin is over the lead shoulder with eyes in the direction of travel, feet remain parallel to each other throughout the entire movement, a brief flight phase is visible on each step-close cycle, and the rhythm is smooth and consistent.

CHECKLIST ASSESSMENT
- 1. Chin, Eyes, and Body: The chin is placed over the lead shoulder, the eyes focus in the direction of travel, and the body maintains an upright position: ✅ Observed (Chin over right shoulder, upright body throughout)
- 2. Feet: Feet stay parallel to each other throughout the entire movement: ✅ Observed (FeetParallel:YES confirmed across all frames)
- 3. Flight: Both feet are temporarily off the ground: ✅ Observed (Flight phases at F3, F7)
- 4. Glide: The body moves with a smooth, rhythmic motion: ✅ Observed (Consistent rhythm throughout)

PROFICIENCY LEVEL: Competent
All criteria are met. The parallel foot position and consistent flight phase are particularly well-executed.

FEEDBACK
Well done! Your feet stay parallel throughout and the flight is clear on each cycle. To progress to Excellent, try to increase the lateral distance covered per step while maintaining the smooth rhythm.`
    },
    // ============================================================================
    // SKILL: RUNNING (GYMNASTICS)
    // ============================================================================
    {
        skillName: "Running",
        label: "Competent Execution",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. Eyes:FORWARD. BodyPosition:UPRIGHT_SLIGHT_LEAN. Toes:FORWARD.
F2: LeadFoot:RIGHT. TrailFoot:LEFT_TOE_OFF. Arms:BENT_90. Knees:148. HeelToToe:YES.
F3: BothFeet:AIR. StridePosition:SPLIT. Knees:158. Arms:OPP_FORWARD_BACK.
F4: LeadFoot:RIGHT_LANDING. HeelToToe:YES. Knees:145. Arms:BENT_90.
F5: SwingKnee:LEFT_BENT. HamstringCurl:HEEL_UP. Knees:165. Arms:BENT_90.
F6: LeadFoot:LEFT. TrailFoot:RIGHT_TOE_OFF. Arms:BENT_90. Knees:150. HeelToToe:YES.
F7: BothFeet:AIR. StridePosition:SPLIT. Knees:160. Arms:OPP_FORWARD_BACK.
F8: LeadFoot:LEFT_LANDING. HeelToToe:YES. Knees:148. Arms:BENT_90.
F9: SwingKnee:RIGHT_BENT. HamstringCurl:HEEL_UP. Knees:162. Arms:BENT_90.
F10: BothFeet:GROUNDED. BodyPosition:UPRIGHT_SLIGHT_LEAN. Rhythm:SMOOTH.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Eyes and Body**: ✅ Eyes forward, upright with slight forward lean, toes pointed forward
2. **Flight Phase**: ✅ Both feet off ground in stride position (F3, F7)
3. **Foot Strike**: ✅ Heel-to-toe landing detected (F4, F8)
4. **Arms**: ✅ Arms bent approximately 90°, moving forward and back without crossing midline (F2, F6)
5. **Knee Drive**: ✅ Swing knee bent with heel up behind body (F5, F9)`,
        idealOutput: `DETECTED SKILL: Running

COMPARISON TO GOLD STANDARD
The user demonstrates competent running form. Eyes are forward with a slight body lean, a clear flight phase (stride position) is visible on both cycles, foot strike is heel-to-toe, arms are bent at approximately 90° moving forward and back without crossing the midline, and the swing knee drives forward with the heel pulling up behind the body.

CHECKLIST ASSESSMENT
- 1. Eyes and Body: The eyes focus in the direction of travel, and the body moves in an upright position with a slight forward lean and toes pointed forward: ✅ Observed (Eyes forward, upright with lean, toes forward throughout)
- 2. Flight: Both feet are temporarily off the ground in a stride position. The foot lands heel to toe: ✅ Observed (Flight at F3, F7; heel-to-toe landing at F4, F8)
- 3. Arms: Arms are bent at about a 90-degree angle and move in a forward and backward direction without crossing the midline of the body: ✅ Observed (90° arm bend, no midline crossing, F2–F9)
- 4. Knees: Knee is bent to bring the heel up behind the body and parallel to the ground: ✅ Observed (Heel-up hamstring curl at F5, F9)

PROFICIENCY LEVEL: Competent
All criteria are met. The heel-to-toe landing and high knee drive are particularly good.

FEEDBACK
Strong running form! Your arm action is clean and your heel pulls up well behind you. To progress to Excellent, focus on driving the knee higher on each stride and increasing stride length while keeping the rhythm smooth.`
    },
    // ============================================================================
    // SKILL: JUMPING (HORIZONTAL) (GYMNASTICS)
    // ============================================================================
    {
        skillName: "Jumping (horizontal)",
        label: "Competent Execution",
        inputData: `**Compressed Frame Data (Evidence):**
F1: BothFeet:GROUNDED. Knees:168. Arms:SIDES. AnkleGap:SHOULDER_WIDTH. BodyLean:SLIGHT_FORWARD.
F2: Arms:BACK. Knees:138. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F3: Arms:FORWARD_UP. Knees:82. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED. BodyLean:FORWARD.
F4: Arms:FORWARD_UP. Knees:155. AnkleGap:SHOULDER_WIDTH. BothFeet:AIR. BodyExtended:YES.
F5: Arms:FORWARD_UP. Knees:168. AnkleGap:SHOULDER_WIDTH. BothFeet:AIR. BodyStretched:YES.
F6: Arms:FORWARD_REACHING. Knees:162. BothFeet:AIR. BodyLean:FORWARD.
F7: Arms:FORWARD_BALANCING. Knees:125. BothFeet:LANDING. AnkleGap:SHOULDER_WIDTH.
F8: Arms:FORWARD. Knees:108. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.
F9: Arms:FORWARD. Knees:100. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED. Balanced:YES.
F10: Arms:LOW. Knees:118. AnkleGap:SHOULDER_WIDTH. BothFeet:GROUNDED.

**BIOMECHANICS AUTO-ANALYSIS:**
1. **Dominant Hand**: Both (symmetrical jump)
2. **Arm Trajectory**: BACK → FORWARD_UP (full forward arm swing)
3. **Wind-up**: ✅ Arms swung back before takeoff (F2)
4. **Stance**: ✅ Feet shoulder-width apart throughout
5. **Knee Bend**: ✅ Deep pre-jump squat (Min angle: 82°)
6. **Body Lean**: ✅ Slight forward lean and arms reach forward in direction of travel (F3–F6)
7. **Flight Phase**: ✅ Both feet off ground (F4–F6)
8. **Landing**: ✅ Knees bent on landing (108° at F8), feet shoulder-width, arms forward for balance`,
        idealOutput: `DETECTED SKILL: Jumping (horizontal)

COMPARISON TO GOLD STANDARD
The user demonstrates competent horizontal jump mechanics. The preparation phase shows arms swinging back (F2) and a deep knee bend (82°), a slight forward lean redirects force horizontally, arms drive forward and up in the direction of travel (F3–F6), a clear flight phase is present (3 frames airborne), the body is extended in flight, and landing shows good knee bend (108°) with feet shoulder-width and arms forward for balance.

CHECKLIST ASSESSMENT
- 1. Knees and Arms: Knees are bent and arms are back to begin the jump: ✅ Observed (Knees 82°, arms back at F2–F3)
- 2. Arms: Arms swing forward and up in the direction of travel: ✅ Observed (Arms forward-up at F4–F6)
- 3. Feet and Body: Feet are shoulder-width apart, and the body has a slight forward lean: ✅ Observed (AnkleGap:SHOULDER_WIDTH throughout, forward lean at F3–F6)
- 4. Legs: Legs forcefully thrust the body forward in a stretched position: ✅ Observed (Clear flight phase F4–F6, body extended)
- 5. Landing: Knees are bent, feet are shoulder-width apart, and arms are in front of the body for balance: ✅ Observed (Knee 108°, shoulder-width feet, arms forward at F7–F9)

PROFICIENCY LEVEL: Competent
All criteria are met. The forward body lean and arm drive in the direction of travel are particularly well-executed for horizontal distance.

FEEDBACK
Excellent horizontal jump! The arm swing and forward lean work together well to generate distance. To progress to Excellent, focus on fully extending the hips and knees during flight to maximize your body stretch in the air.`
    },
];

export const getFewShotExamples = (skillName: string): string => {
    const examples = SKILL_EXAMPLES.filter(e => e.skillName.toLowerCase() === skillName.toLowerCase());

    if (examples.length === 0) return "";

    return `\n\n**FEW-SHOT EXAMPLES (REFERENCE ONLY):**
The following are examples of how to grade this skill based on similar data. Use them as a calibration guide.

${examples.map((ex, i) => `--- EXAMPLE ${i + 1}: ${ex.label} ---
INPUT DATA:
${ex.inputData}

IDEAL OUTPUT:
${ex.idealOutput}
`).join('\n')}
--- END OF EXAMPLES ---
`;
};
