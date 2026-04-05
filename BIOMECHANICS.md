# Biomechanics Detection Logic

A plain-language reference for understanding how the system reads and classifies student movement — written for PE teachers who want to verify or edit the detection logic.

---

## How the Camera Sees the Body

The system tracks **9 body points** (landmarks) every frame using MediaPipe:

```
           [0] Nose
          /         \
   [11] L.Shoulder  [12] R.Shoulder
        |                  |
  [15] L.Wrist        [16] R.Wrist
        |                  |
   [23] L.Hip          [24] R.Hip
        |                  |
  [27] L.Ankle        [28] R.Ankle
```

Each point has an X position (left–right) and a Y position (up–down).

**Critical quirk — Y-axis is inverted:**
- Y = 0 → top of screen (head)
- Y = 1 → bottom of screen (feet)

So a *smaller Y number = higher position on the body*. This is opposite to how we normally think about numbers going up. Keep this in mind when reading any logic that compares Y values.

---

## The 8 Biomechanics Fields

### 1. Dominant Hand
> *"Which hand did they use?"*

**How it works:** Watches both wrists across every frame. Whichever wrist travelled more total distance = dominant hand.

**In PE terms:** A student who throws with their right hand will have a right wrist that sweeps a large arc. The left wrist barely moves by comparison.

**Known limitation:** A large body rotation (e.g. full follow-through) can cause the non-dominant wrist to also travel far, potentially confusing the reading.

---

### 2. Arm Trajectory *(primary skill classifier)*
> *"How high did the throwing arm go?"*

**How it works:** Finds the highest point the dominant wrist reached across all frames, then compares it against two reference points:
- **Above the nose** → classified as **OVERHEAD** (overhand throw family)
- **Below the hip** → classified as **LOW SWING** (underhand family)
- **Between nose and hip** → classified as **MID-LEVEL** (passes, dribble)

**In PE terms:**

| Classification | What it looks like | Skills it maps to |
|---|---|---|
| OVERHEAD | Arm swings up past the ear/nose during the throw | Overhand throw |
| LOW SWING | Arm swings back and down, releases near the ground | Underhand throw, Underhand roll |
| MID-LEVEL | Arm moves in front of the body at chest/waist height | Chest pass, Bounce pass, Dribble |

**Known limitation:** Only looks at the *peak wrist height* — not *when* in the movement it occurred. A student with a large upward follow-through after an underhand roll may trigger OVERHEAD even though the release was low.

---

### 3. Wind-up
> *"Did the arm drop low in the backswing?"*

**How it works:** A simple yes/no — did the dominant wrist drop **below the hip** at any point during the video?

**In PE terms:**
- Underhand throw / roll → **YES** expected (pendulum backswing drops behind and below the hip)
- Overhand throw → **NO** expected (backswing goes up and behind the shoulder)

**Known limitation:** Students with a shallow or lazy backswing may not drop the wrist far enough below the hip, causing a false NO. This is actually a teaching cue opportunity — if the system says NO wind-up on an underhand skill, the student likely has an incomplete backswing.

---

### 4. Stepping Foot
> *"Which foot stepped forward?"*

**How it works:** Watches both ankles on the left–right axis. Whichever ankle moved more sideways = the stepping foot.

**In PE terms:** When a student steps forward to throw, the stepping foot's ankle shifts significantly in the X direction. The planted foot barely moves.

**Known limitation:** Doesn't detect the direction of the step — only which foot moved more. A student who shuffles sideways would still trigger this.

---

### 5. Coordination
> *"Did they step with the correct foot?"*

**How it works:** Cross-checks fields 1 and 4. If the dominant hand and the stepping foot are on the **same side** → ipsilateral error flagged.

**In PE terms:** Correct coordination = opposite foot to throwing hand (right hand → left foot forward). This is one of the most common beginner errors — stepping with the same-side foot removes trunk rotation and reduces power.

**Known limitation:** If the student barely steps at all (feet stay close together throughout), neither ankle moves much and the check may not trigger, even if they have poor coordination.

---

### 6. Stance
> *"Were the feet about shoulder-width apart?"*

**How it works:** Compares the distance between the two ankles vs the distance between the two shoulders. If ankle gap ≈ shoulder gap, it passes.

**In PE terms:** Checks the "feet shoulder-width apart" starting position criterion.

**Known limitation:** Only measures side-to-side width, not front-to-back depth. A student in a deep lunge (one foot far forward, one far back) would still pass this check because the ankles appear wide — even though their stance is unusual.

---

### 7. Knee Bend
> *"Did they bend their knees?"*

**How it works:** Calculates the angle at each knee joint across all frames. Reports the **minimum angle found** and which frame it occurred in. A straight leg ≈ 180°. More bent = lower angle.

**In PE terms:** Checks "knees slightly bent" as a criterion. A reading below ~150° typically indicates a meaningful bend.

**Known limitation:** Reports the minimum across the *entire video*, so it might pick up a deep bend from the student crouching to pick up a ball before the movement — not from the throw itself. If you're seeing suspiciously low knee angles, check which frame number it cites.

---

### 8. Step Detection
> *"Did they step toward the target?"*

**How it works:** Measures ankle separation at the start of the video vs the maximum ankle separation during the video. If maximum separation > **1.2× the starting separation**, a step is detected.

**In PE terms:** Checks "step forward toward the target" criterion. The 1.2 multiplier means the student needs to meaningfully widen their stance — a small shift won't count.

**Known limitation:** Measures ankle separation only — doesn't know which direction the step went. Also, a student who starts with feet already wide apart won't produce a large enough ratio, even if they do step. And it won't distinguish stepping *toward* the target vs stepping sideways.

---

## Skill-by-Skill Expected Readings

Use this table to manually verify whether the detection logic makes sense for each skill:

| Skill | Dominant Hand | Arm Trajectory | Wind-up | Coordination | Stance | Knee Bend | Step |
|---|---|---|---|---|---|---|---|
| **Underhand Throw** | Throwing hand | LOW SWING | YES | Opposite foot | ~Shoulder-width | Some bend | YES |
| **Underhand Roll** | Throwing hand | LOW SWING | YES | Opposite foot | ~Shoulder-width | Deeper bend (low release) | YES |
| **Overhand Throw** | Throwing hand | OVERHEAD | NO | Opposite foot | ~Shoulder-width | Some bend | YES |
| **Kick** | N/A (foot skill) | N/A | N/A | N/A | One foot planted | Kicking leg extends | YES (plant step) |
| **Chest Pass** | Either (two-handed) | MID-LEVEL | NO | N/A | ~Shoulder-width | Some bend | Optional |
| **Bounce Pass** | Either (two-handed) | MID-LEVEL | NO | N/A | ~Shoulder-width | More bend (low release) | Optional |
| **Dribble with Hands** | Dribbling hand | MID-LEVEL | NO | N/A | ~Shoulder-width | Some bend | N/A |
| **Dribble with Feet** | N/A (foot skill) | N/A | N/A | N/A | ~Shoulder-width | Some bend | N/A |
| **Catch Above Waist** | Catching hand | MID-LEVEL | NO | N/A | ~Shoulder-width | Some bend | N/A |
| **Bounce** | Bouncing hand | MID-LEVEL | NO | N/A | ~Shoulder-width | Some bend | N/A |

---

## Underhand Roll vs Underhand Throw — How the System Tells Them Apart

Both skills share the same biomechanics profile (LOW SWING, YES wind-up, opposite foot). The distinguishing factor is in the **Phase 2 grading checklist**, not in the biomechanics report:

- **Underhand Throw**: ball releases between knee and waist height, travels through the air
- **Underhand Roll**: ball releases at/near ground level, rolls along the ground

The Phase 1 classifier (biomechanics report) cannot distinguish these two — it presents both as options for the teacher to confirm. This is by design.

---

## Where to Edit the Logic

| What you want to change | File to edit |
|---|---|
| How biomechanics fields are computed | `src/services/ai/openRouterService.ts` → `sendMessageToOpenRouter` |
| The 1.2 step detection threshold | Same file — search for `1.2` |
| The knee angle threshold | Same file — search for knee angle calculation |
| FMS skill checklists (grading criteria) | `src/data/fundamentalMovementSkillsData.ts` |
| Which skills Phase 1 can identify | `src/services/ai/openRouterService.ts` ~line 525 and `src/services/ai/geminiService.ts` |
