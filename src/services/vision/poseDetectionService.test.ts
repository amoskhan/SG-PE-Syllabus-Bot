import { describe, it, expect } from 'vitest';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { resolveThrowOrientation, measureBackswing, findStep, type PoseData } from './poseDetectionService';
import { backswingCheck } from '../ai/backswingCheck';
import rollClips from './__fixtures__/underhandRoll.json';

// Synthetic clips: a pupil throwing toward screen-right with the RIGHT arm
// (wrist 16). Y: 0 = top of frame, 1 = bottom. Filmed front-on, MediaPipe's
// left-side landmarks (11, 15, 23, 25, 27) sit on screen-right.

type Pt = { x: number; y: number };
type Stance = { ankle27x: number; ankle28x: number };

const FRONT_ON = { shoulder11x: 0.57, shoulder12x: 0.43 }; // span 0.14 vs torso 0.25 -> square to camera
const SIDE_ON = { shoulder11x: 0.51, shoulder12x: 0.49 };  // span 0.02 -> side-on

function frame(opts: {
    wrist16: Pt;
    stance: Stance;
    shoulders?: { shoulder11x: number; shoulder12x: number };
    noseX?: number;
    ballX?: number;
}): PoseData {
    const { shoulder11x, shoulder12x } = opts.shoulders ?? FRONT_ON;
    const lm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    const set = (i: number, x: number, y: number) => { lm[i] = { x, y, z: 0, visibility: 1 }; };

    set(0, opts.noseX ?? 0.5, 0.2);          // nose
    set(11, shoulder11x, 0.3);               // left shoulder
    set(12, shoulder12x, 0.3);               // right shoulder
    set(15, 0.58, 0.55);                     // left wrist — non-throwing, stays still
    set(16, opts.wrist16.x, opts.wrist16.y); // right wrist — throwing arm
    set(23, 0.54, 0.55);                     // left hip
    set(24, 0.46, 0.55);                     // right hip
    set(25, 0.54, 0.72);                     // left knee
    set(26, 0.46, 0.72);                     // right knee
    set(27, opts.stance.ankle27x, 0.9);      // left ankle
    set(28, opts.stance.ankle28x, 0.9);      // right ankle

    const ball = opts.ballX === undefined ? undefined : {
        center: { x: opts.ballX * 640, y: 300 },
        centerNormalized: { x: opts.ballX, y: 0.6 },
        box: { originX: 0, originY: 0, width: 10, height: 10 },
        isValid: true,
    };
    return { landmarks: lm, worldLandmarks: lm, ball };
}

/** 8-frame throw: right wrist swings from behind (screen-left) to release (screen-right), ball carried along. */
function throwClip(stance: Stance, shoulders = FRONT_ON): PoseData[] {
    return Array.from({ length: 8 }, (_, i) => frame({
        wrist16: { x: 0.35 + i * 0.05, y: 0.6 - i * 0.02 },
        ballX: 0.45 + i * 0.03,
        stance,
        shoulders,
    }));
}

// Left foot (27) forward toward screen-right = opposite foot to the right throwing arm.
const CORRECT_STEP: Stance = { ankle27x: 0.6, ankle28x: 0.45 };
// Right foot (28) forward = same side as the throwing arm.
const SAME_SIDE_STEP: Stance = { ankle27x: 0.45, ankle28x: 0.6 };

/** Swap every left/right landmark pair, as MediaPipe does when it misreads which way a side-on body faces. */
function mirrorLabels(clip: PoseData[]): PoseData[] {
    const pairs = [[11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
    return clip.map(f => {
        const lm = [...f.landmarks];
        for (const [a, b] of pairs) [lm[a], lm[b]] = [lm[b], lm[a]];
        return { ...f, landmarks: lm, worldLandmarks: lm };
    });
}

describe('resolveThrowOrientation', () => {
    it('falls back to "undetermined" with fewer than 2 frames', () => {
        const r = resolveThrowOrientation([]);
        expect(r.throwDirection).toBe('unknown');
        expect(r.leadAnkleIndex).toBeNull();
        expect(r.ipsilateralStep).toBeNull();
        expect(r.confidence).toBe('low');
    });

    it('front-on: picks the throwing arm, direction and opposite-foot step', () => {
        const r = resolveThrowOrientation(throwClip(CORRECT_STEP));
        expect(r.throwingWristIndex).toBe(16);
        expect(r.throwDirection).toBe('right');
        expect(r.leadAnkleIndex).toBe(27);
        expect(r.ipsilateralStep).toBe(false);
        expect(r.anatomicalReliable).toBe(true);
        expect(r.leadFootLabel).toBe('Left foot forward (toward screen-right)');
        expect(r.confidence).toBe('high');
    });

    it('flags stepping with the same foot as the throwing arm', () => {
        const r = resolveThrowOrientation(throwClip(SAME_SIDE_STEP));
        expect(r.leadAnkleIndex).toBe(28);
        expect(r.ipsilateralStep).toBe(true);
    });

    it('side-on: refuses to name Left/Right and says to check the frames', () => {
        const r = resolveThrowOrientation(throwClip(CORRECT_STEP, SIDE_ON));
        expect(r.anatomicalReliable).toBe(false);
        expect(r.leadFootLabel).toContain('NOT reliable');
        expect(r.leadFootLabel).not.toMatch(/^(Left|Right) foot/);
    });

    it('mirror-flipped labels do not change direction or the coordination verdict', () => {
        for (const stance of [CORRECT_STEP, SAME_SIDE_STEP]) {
            const clip = throwClip(stance, SIDE_ON);
            const normal = resolveThrowOrientation(clip);
            const flipped = resolveThrowOrientation(mirrorLabels(clip));
            expect(flipped.throwDirection).toBe(normal.throwDirection);
            expect(flipped.ipsilateralStep).toBe(normal.ipsilateralStep);
            // Only the index names swap, never the verdict.
            expect(flipped.throwingWristIndex).toBe(normal.throwingWristIndex === 16 ? 15 : 16);
            expect(flipped.leadAnkleIndex).toBe(normal.leadAnkleIndex === 27 ? 28 : 27);
        }
    });

    it('ignores the pupil turning around after release', () => {
        // After the ball leaves, the pupil turns to face screen-left, swings the arm back
        // and swaps their feet. None of that should flip the answer.
        const tail = Array.from({ length: 10 }, (_, i) => frame({
            wrist16: { x: 0.7 - i * 0.05, y: 0.5 },
            noseX: 0.4,
            stance: SAME_SIDE_STEP,
        }));
        const r = resolveThrowOrientation([...throwClip(CORRECT_STEP), ...tail]);
        expect(r.throwDirection).toBe('right');
        expect(r.leadAnkleIndex).toBe(27);
        expect(r.ipsilateralStep).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Real Underhand Roll clips (landmarks only, see __fixtures__/underhandRoll.json).
// Right answers checked by eye from the video.
// ---------------------------------------------------------------------------

type Clip = { aspect: number; sampled: { lm: number[][]; ball: number[] | null }[]; dense: { t: number; lm: number[][] }[] };
const clips = rollClips.clips as Record<string, Clip>;
const toLandmarks = (lm: number[][]): NormalizedLandmark[] => lm.map(([x, y, visibility]) => ({ x, y, z: 0, visibility }));

/** The frames the app sends the AI, as the app builds them (ball included). */
const sampled = (c: Clip): PoseData[] => c.sampled.map((f, i) => ({
    landmarks: toLandmarks(f.lm), worldLandmarks: [], timestamp: i, aspect: c.aspect,
    ball: f.ball ? {
        center: { x: f.ball[0] * 640, y: f.ball[1] * 360 }, centerNormalized: { x: f.ball[0], y: f.ball[1] },
        box: { originX: 0, originY: 0, width: 10, height: 10 }, isValid: true,
    } : undefined,
}));
/** The 8 fps pass used only for measurements. */
const dense = (c: Clip): PoseData[] => c.dense.map(f => ({ landmarks: toLandmarks(f.lm), worldLandmarks: [], timestamp: f.t, aspect: c.aspect }));

describe('real Underhand Roll clips', () => {
    const cases = [
        ['bad_highBackswing_rollsLeft', 'left'],
        ['bad_rollsRight', 'right'],
        ['good_rollsRight', 'right'],
        ['good_rollsRight_2', 'right'],
    ] as const;

    it.each(cases)('%s: rolls toward screen-%s, stepping with the opposite foot to the rolling arm', (name, direction) => {
        const r = resolveThrowOrientation(sampled(clips[name]));
        expect(r.throwDirection).toBe(direction);
        expect(r.ipsilateralStep).toBe(false);
    });

    it.each(cases)('%s: still opposite-foot when MediaPipe swaps left/right mid-clip', name => {
        // Swap labels from the 7th frame on — around the step, where it happened for real.
        const clip = sampled(clips[name]);
        const flipped = [...clip.slice(0, 6), ...mirrorLabels(clip.slice(6))];
        expect(resolveThrowOrientation(flipped).ipsilateralStep).toBe(false);
    });

    it('is not fooled by a floor spot the ball detector mistakes for the ball', () => {
        // In this clip a red floor spot is "detected" in the same place in 11 of 12 frames.
        const clip = sampled(clips.bad_highBackswing_rollsLeft);
        expect(clip.filter(f => f.ball).length).toBeGreaterThanOrEqual(10);
        expect(resolveThrowOrientation(clip).throwDirection).toBe('left');
    });

    it('finds the stepping foot as the foot that moves', () => {
        expect(findStep(sampled(clips.bad_highBackswing_rollsLeft))?.direction).toBe('left');
        expect(findStep(sampled(clips.good_rollsRight))?.direction).toBe('right');
    });

    it('measures a shoulder-high backswing as too high', () => {
        const m = measureBackswing(dense(clips.bad_highBackswing_rollsLeft))!;
        expect(m.height).toBeGreaterThan(0.75);
        const check = backswingCheck('Underhand Roll', m)!;
        expect(check.failed).toBe(true);
        expect(check.line).toContain('TOO HIGH');
    });

    it.each(['bad_rollsRight', 'good_rollsRight', 'good_rollsRight_2'])('%s: backswing at waist height', name => {
        const m = measureBackswing(dense(clips[name]))!;
        const check = backswingCheck('Underhand Roll', m)!;
        expect(check.failed).toBe(false);
        expect(check.line).toMatch(/^✅/);
    });

    it('does not count a high follow-through as the backswing', () => {
        // After release this pupil's rolling hand ends up on top of the head.
        const frames = dense(clips.bad_highBackswing_rollsLeft);
        const m = measureBackswing(frames)!;
        const release = findStep(frames)!.plant;
        expect(frames.findIndex(f => f.timestamp === m.time)).toBeLessThanOrEqual(release);
    });
});

describe('backswingCheck (Underhand Roll: hand at waist height, not higher or lower)', () => {
    const at = (height: number, reach = 1) => backswingCheck('Underhand Roll', { height, reach, time: 1 })!;
    it('passes waist height', () => expect(at(0.35).line).toMatch(/^✅/));
    it('fails too high', () => expect(at(1.0).failed).toBe(true));
    it('fails too low', () => expect(at(-0.4)).toMatchObject({ failed: true }));
    it('leaves borderline heights to the grader', () => expect(at(0.68)).toMatchObject({ failed: false, line: expect.stringMatching(/^⚠️/) }));
    it('flags a hand that never swung back', () => expect(at(0.3, 0.1).line).toMatch(/^⚠️/));
    it('says to judge from the frames when nothing was measured', () => expect(backswingCheck('Underhand Roll', null)!.line).toMatch(/^⚠️/));
    it('does not apply to other skills', () => expect(backswingCheck('Overhand Throw', { height: 2, reach: 1, time: 1 })).toBeNull());
    it('never auto-fails the Underhand Throw', () => expect(backswingCheck('Underhand Throw', { height: 2, reach: 1, time: 1 })!.failed).toBe(false));
});
