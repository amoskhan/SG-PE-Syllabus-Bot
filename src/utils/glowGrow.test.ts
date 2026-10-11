import { describe, it, expect } from 'vitest';
import { GlowGrowSource, glowGrowCard, isPicked, pickChoice } from './glowGrow';
import { getLessonCues } from '../data/peerSyllabusCues';

// Shoulder Stand: four short cues, ids shoulder-stand-1..4
const cues = getLessonCues('Shoulder Stand');
const [hands, hips, legs, hold] = cues.map(c => c.id);
const cue = (itemNumber: number): GlowGrowSource => ({ kind: 'cue', itemNumber });
const own: GlowGrowSource = { kind: 'own' };

describe('glowGrowCard', () => {
    it('offers the 👍 cues as glows and the 👎 cues as grows, in checklist order', () => {
        const card = glowGrowCard({ cues, ticks: { [hold]: true, [hips]: false, [hands]: true, [legs]: false }, performer: 'Banana' });
        expect(card.allTicked).toBe(true);
        expect(card.glowChoices.map(c => c.text)).toEqual(['Hands hold the lower back, elbows on the mat', 'Hold still for 3 seconds']);
        expect(card.growChoices.map(c => c.text)).toEqual(['Hips and legs up above the head', 'Legs together and pointing straight up', 'My own idea']);
        expect(card.glowChoices[0]).toMatchObject({ icon: '🤲', source: { kind: 'cue', itemNumber: 1 } });
        expect(card.growChoices[2].source).toEqual({ kind: 'own' });
    });

    it('offers only "My own idea" as the grow when every cue is 👍', () => {
        const card = glowGrowCard({ cues, ticks: { [hands]: true, [hips]: true, [legs]: true, [hold]: true }, performer: 'Banana' });
        expect(card.glowChoices).toHaveLength(4);
        expect(card.growChoices.map(c => c.text)).toEqual(['My own idea']);
    });

    it('offers only "You gave it a go" as the glow when every cue is 👎', () => {
        const card = glowGrowCard({ cues, ticks: { [hands]: false, [hips]: false, [legs]: false, [hold]: false }, performer: 'Banana' });
        expect(card.glowChoices.map(c => [c.text, c.source.kind])).toEqual([['You gave it a go', 'fixed']]);
        expect(card.growChoices).toHaveLength(5);
    });

    it('has no card until every displayed cue is ticked', () => {
        const picks = { glow: { source: cue(1), text: 'Hands' }, grow: { source: own, text: 'Point your toes' } };
        const card = glowGrowCard({ cues, ticks: { [hands]: true, [hips]: false, [legs]: false }, performer: 'Banana', picks });
        expect(card).toMatchObject({ allTicked: false, tickedCount: 3, complete: false });
        expect(card.sentence).toBeUndefined();
        expect(glowGrowCard({ cues, ticks: {}, performer: 'Banana' }).allTicked).toBe(false);
    });

    it('uses only the focus cues the teacher picked', () => {
        const focus = getLessonCues('Shoulder Stand', { focusCues: [2, 4] });
        // A tick left over for a cue that is not shown counts for nothing
        const card = glowGrowCard({ cues: focus, ticks: { [hands]: true, [hips]: true, [hold]: false }, performer: 'Apple' });
        expect(card.allTicked).toBe(true);
        expect(card.glowChoices.map(c => c.text)).toEqual(['Hips and legs up above the head']);
        expect(card.growChoices.map(c => c.text)).toEqual(['Hold still for 3 seconds', 'My own idea']);
    });

    it("uses the teacher's wording and extra cues, as ticked", () => {
        const planned = getLessonCues('Shoulder Stand', { focusCues: [1, 4], cueText: { 4: 'Freeze like a statue' }, extraCues: ['Chin tucked to the chest'] });
        const card = glowGrowCard({ cues: planned, ticks: { [hands]: false, [hold]: true, 'extra-1': false }, performer: 'Apple' });
        expect(card.glowChoices.map(c => c.text)).toEqual(['Freeze like a statue']);
        expect(card.growChoices.map(c => c.text)).toEqual(['Hands hold the lower back, elbows on the mat', 'Chin tucked to the chest', 'My own idea']);
        expect(card.growChoices[1].source).toEqual({ kind: 'cue', itemNumber: 101 });
    });

    it("shows the teacher's starters exactly as typed, and the default for a blank one", () => {
        const base = { cues, ticks: {}, performer: 'Apple' };
        expect(glowGrowCard({ ...base, setting: { glowStarter: 'I liked how you', growStarter: 'Even better if you' } }))
            .toMatchObject({ glowStarter: 'I liked how you', growStarter: 'Even better if you' });
        expect(glowGrowCard({ ...base, setting: { glowStarter: '   ', growStarter: '' } }))
            .toMatchObject({ glowStarter: 'You did well at', growStarter: 'Next, try' });
        expect(glowGrowCard(base)).toMatchObject({ glowStarter: 'You did well at', growStarter: 'Next, try' });
    });
});

describe('picks', () => {
    const mixed = { [hands]: true, [hips]: false, [legs]: true, [hold]: false };
    const glowHands = pickChoice(glowGrowCard({ cues, ticks: mixed, performer: 'Banana' }).glowChoices[0]);

    it('needs both a glow and a grow', () => {
        expect(glowGrowCard({ cues, ticks: mixed, performer: 'Banana', picks: {} }).complete).toBe(false);
        expect(glowGrowCard({ cues, ticks: mixed, performer: 'Banana', picks: { glow: glowHands } }).complete).toBe(false);
        const both = glowGrowCard({ cues, ticks: mixed, performer: 'Banana', picks: { glow: glowHands, grow: { source: cue(2), text: 'Hips and legs up above the head' } } });
        expect(both.complete).toBe(true);
    });

    it('takes an own idea once something is typed, and trims it in the sentence', () => {
        const withIdea = (text: string) => glowGrowCard({ cues, ticks: mixed, performer: 'Banana', picks: { glow: glowHands, grow: { source: own, text } } });
        expect(pickChoice(withIdea('').growChoices[2])).toEqual({ source: own, text: '' });
        expect(withIdea('').complete).toBe(false);
        expect(withIdea('   ').complete).toBe(false);
        expect(withIdea('   ').picks.grow).toEqual({ source: own, text: '   ' }); // still the chosen button
        expect(withIdea('  point your toes ').complete).toBe(true);
        expect(withIdea('  point your toes ').sentence)
            .toBe('Banana, You did well at: Hands hold the lower back, elbows on the mat. Next, try: point your toes.');
    });

    it('drops a pick when its tick changes side, and keeps one that still fits', () => {
        const picks = { glow: glowHands, grow: { source: cue(2), text: 'Hips and legs up above the head' } };
        const card = glowGrowCard({ cues, ticks: { ...mixed, [hands]: false }, performer: 'Banana', picks });
        expect(card.picks).toEqual({ grow: picks.grow });
        expect(card.complete).toBe(false);
        expect(card.sentence).toBeUndefined();
    });

    it('drops "You gave it a go" once a cue is 👍, and keeps an own idea whatever the ticks', () => {
        const allDown = { [hands]: false, [hips]: false, [legs]: false, [hold]: false };
        const picks = { glow: { source: { kind: 'fixed' as const }, text: 'You gave it a go' }, grow: { source: own, text: 'Tuck your chin' } };
        expect(glowGrowCard({ cues, ticks: allDown, performer: 'Apple', picks }).picks).toEqual(picks);
        expect(glowGrowCard({ cues, ticks: { ...allDown, [legs]: true }, performer: 'Apple', picks }).picks).toEqual({ grow: picks.grow });
    });

    it('marks the chosen button', () => {
        const card = glowGrowCard({ cues, ticks: mixed, performer: 'Banana', picks: { glow: glowHands } });
        expect(card.glowChoices.map(c => isPicked(c, card.picks.glow))).toEqual([true, false]);
        expect(card.growChoices.map(c => isPicked(c, card.picks.grow))).toEqual([false, false, false]);
    });

    it('keeps the wording the assessor saw', () => {
        const reworded = getLessonCues('Shoulder Stand', { cueText: { 1: 'Hands on your back' } });
        const card = glowGrowCard({ cues: reworded, ticks: mixed, performer: 'Banana', picks: { glow: glowHands } });
        expect(card.picks.glow?.text).toBe('Hands hold the lower back, elbows on the mat');
    });
});

describe('the sentence', () => {
    it('starts with the performer and puts each starter before its pick', () => {
        const card = glowGrowCard({
            cues, ticks: { [hands]: true, [hips]: false, [legs]: true, [hold]: false }, performer: 'Apple',
            setting: { glowStarter: 'I liked how you', growStarter: '' },
            picks: { glow: { source: cue(3), text: 'Legs together and pointing straight up' }, grow: { source: cue(4), text: 'Hold still for 3 seconds' } },
        });
        expect(card.sentence).toBe('Apple, I liked how you: Legs together and pointing straight up. Next, try: Hold still for 3 seconds.');
    });

    it('says "You gave it a go" when nothing was 👍', () => {
        const card = glowGrowCard({
            cues, ticks: { [hands]: false, [hips]: false, [legs]: false, [hold]: false }, performer: 'Banana',
            picks: { glow: { source: { kind: 'fixed' }, text: 'You gave it a go' }, grow: { source: cue(1), text: 'Hands hold the lower back, elbows on the mat' } },
        });
        expect(card.sentence).toBe('Banana, You did well at: You gave it a go. Next, try: Hands hold the lower back, elbows on the mat.');
    });

    it('uses an FMS cue written as a question as it is', () => {
        const kick = getLessonCues('Kick', { focusCues: [1, 2] });
        const card = glowGrowCard({
            cues: kick, ticks: { 'k-1': true, 'k-2': false }, performer: 'Banana',
            picks: { glow: { source: cue(1), text: kick[0].kidFriendlyText }, grow: { source: cue(2), text: kick[1].kidFriendlyText } },
        });
        expect(card.sentence).toBe('Banana, You did well at: Did partner start directly behind the ball? Next, try: Did partner keep their eyes locked on the ball?');
    });
});
