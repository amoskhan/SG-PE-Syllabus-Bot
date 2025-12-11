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
    }
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
