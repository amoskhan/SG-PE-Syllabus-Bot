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

## The Biomechanics Fields

### 0. Camera Orientation *(gate on everything below)*
> *"Is the student square to the camera, or filmed from the side?"*

**How it works:** Checks how wide the shoulders look relative to the torso's height, plus whether the left-side body points are much more visible than the right-side ones (or vice versa). Either sign → the student is **side-on** to the camera.

**Why it matters:** MediaPipe decides which points are "left" and which are "right" by guessing which way the body faces. Filmed close to side-on it often guesses front-vs-back backwards and **swaps every left/right point at once**. When that happens, "Stepping Foot: Left" really means right, "Dominant Hand: Left" really means right, and so on — the *maths* is fine, the *labels* are mirrored.

**What the system does about it:** When the shot is side-on, the report stops asserting "Left" or "Right" for the foot and hand. Instead it says which foot is **forward toward the target** ("lead foot") and tells the AI to confirm sides from the actual video frames. The coordination check (field 5) still works because it compares the arm and foot to *each other*, and both get swapped together.

---

### 1. Throwing Arm
> *"Which arm did they throw with?"*

**How it works:** Watches both wrists across every frame (ignoring frames where a wrist is hidden). Whichever wrist travelled more total distance = the throwing arm.

**In PE terms:** A student who throws with their right hand will have a right wrist that sweeps a large arc. The other wrist barely moves by comparison.

**Reported as a side ("Right hand") only when the student is square to the camera.** Side-on, it's reported as "the more-active arm" because left/right can't be trusted (see field 0). Either way, every check that needs "the throwing arm" uses *this* wrist, so a mirror-swap doesn't break them.

**Known limitation:** A large body rotation (e.g. full follow-through) can cause the other wrist to also travel far, potentially confusing the reading.

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

### 4. Stepping Foot *(lead foot)*
> *"Which foot is planted forward, toward the target?"*

**How it works:** First it works out which way the throw travels on screen — from where the ball ends up relative to the body, then the ball's path, then the direction the throwing hand swings, then which way the body faces. It only looks at the part of the clip from setup up to the release — anything after (the student straightening up, turning around, walking off) is ignored, because that tail used to flip the answer. Then, in a few frames around the release, it takes whichever ankle is furthest *toward* the throw direction — that's the lead (front) foot.

**In PE terms:** For a step-and-throw, the lead foot is the one that ends up planted ahead of the body, pointing at the target. The back foot pushes off behind it.

**Reported as "Left/Right foot forward" only when the student is square to the camera.** Side-on, it reads "lead foot points toward screen-left/right — confirm from the frames", because MediaPipe's left/right can be mirrored (field 0).

**Known limitation:** If the feet stay close together (no real step) or the throw direction can't be worked out, it reports "Undetermined" rather than guessing.

---

### 5. Coordination
> *"Did they step with the correct foot?"*

**How it works:** Checks whether the throwing arm and the lead foot are on the **same side of the body**. Same side → ipsilateral error. It does this by pairing the arm and foot tracking points (the throwing wrist pairs with the ankle on its side), so it stays correct **even if MediaPipe has mirrored every left/right label** — because the arm and the foot both get mirrored together.

**In PE terms:** Correct coordination = opposite foot to throwing hand (right hand → left foot forward). Stepping with the same-side foot is one of the most common beginner errors — it removes trunk rotation and kills power.

**Known limitation:** If the student barely steps at all (feet stay close together), the lead foot can't be identified and this reports "could not determine — verify visually" rather than flagging an error.

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
