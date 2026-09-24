import type { BackswingMeasure } from '../vision/poseDetectionService';

// Checklist item 5 for the Underhand Roll, "Swing dominant hand back at least to
// waist level", read the way the PE teacher grades it: at the back of the swing
// the hand is at WAIST HEIGHT — higher is a fault, and so is lower.
//
// Height is measured against the pupil's own body in the same frame:
// 0 = hip line, 1 = shoulder line. Calibrated on class clips at 8 fps: good rolls
// measured 0.35–0.41 (another 0.19); a shoulder-high backswing measured 0.99.
// Between the ✅ band and the ❌ limits the call is left to the grader (⚠️).
export const BACKSWING_OK = { low: 0, high: 0.6 };
export const BACKSWING_FAIL = { below: -0.15, above: 0.75 };
/** Hand must get this far behind the hips (torso lengths) to count as a backswing. */
const MIN_REACH = 0.35;

/** Grading instruction for item 5, shared by the Claude and Gemini prompts. */
export const BACKSWING_ITEM5_RULE = `   - Look at "**Backswing Height**" in the biomechanics report. It is measured at the back of the swing, BEFORE release — the follow-through (item 9) rising above the waist is correct and is NOT the backswing.
   - For Underhand Roll the hand must reach WAIST HEIGHT at the back of the swing: not higher, and not lower.
   - "✅ Backswing at waist height" → mark Item #5 ✅.
   - "❌ BACKSWING TOO HIGH" or "❌ BACKSWING TOO LOW" (**FAILURE**) → You MUST mark Item #5 as ❌, quoting the measurement (e.g. "At about 2.9s the hand swung back to shoulder height; it should stop at waist height.").
   - "⚠️" → look at the frames around that moment and decide: waist height is ✅, anything higher or lower is ❌.`;

export interface BackswingCheck {
  /** One line for the biomechanics report. */
  line: string;
  /** True when item 5 must be marked ❌. */
  failed: boolean;
}

const where = (h: number) =>
  h < -0.15 ? 'below the hips'
  : h < 0.6 ? 'at waist height'
  : h < 0.9 ? 'at chest height'
  : h < 1.15 ? 'at shoulder height'
  : 'above the shoulders';

const describe = (m: BackswingMeasure) =>
  `at ${m.time.toFixed(1)}s into the clip the hand was ${where(m.height)} (${Math.round(m.height * 100)}% of the way from hip line to shoulder line)`;

/**
 * The backswing line for underhand skills, or null for any other skill (callers
 * keep their own arm-height logic there). `m` comes from dense tracking of the
 * clip; without it the grader is told to judge from the frames.
 */
export function backswingCheck(skillName: string | undefined, m: BackswingMeasure | null | undefined): BackswingCheck | null {
  const isRoll = !!skillName?.includes('Underhand Roll');
  if (!isRoll && !skillName?.includes('Underhand Throw')) return null;

  if (!m) {
    return {
      line: '⚠️ Could not measure the backswing (no clear step found in the clip) — judge from the frames' +
        (isRoll ? ': at the back of the swing the hand should be at waist height, not higher and not lower.' : '.'),
      failed: false,
    };
  }
  if (!isRoll) {
    return { line: `ℹ️ Backswing measured: ${describe(m)}. Judge item 5 from the frames.`, failed: false };
  }
  if (m.reach < MIN_REACH) {
    return {
      line: `⚠️ The hand hardly swung behind the body (${describe(m)}). Check the frames: no backswing back to waist height means ❌.`,
      failed: false,
    };
  }
  if (m.height > BACKSWING_FAIL.above) {
    return { line: `❌ BACKSWING TOO HIGH: ${describe(m)}. It should stop at waist height.`, failed: true };
  }
  if (m.height < BACKSWING_FAIL.below) {
    return { line: `❌ BACKSWING TOO LOW: ${describe(m)}. It should come back up to waist height.`, failed: true };
  }
  if (m.height > BACKSWING_OK.high || m.height < BACKSWING_OK.low) {
    return { line: `⚠️ Backswing borderline: ${describe(m)}. Check the frames around that moment — waist height is correct, higher or lower is ❌.`, failed: false };
  }
  return { line: `✅ Backswing at waist height: ${describe(m)}.`, failed: false };
}
