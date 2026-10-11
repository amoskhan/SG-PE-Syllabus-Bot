import { describe, it, expect } from 'vitest';
import { GlowGrowSource, addHeard, glowGrowCard, glowGrowAfterSend, glowGrowLines, glowGrowToSend, isPicked, pairGlowGrow, pickChoice, readGlowGrow, readPairGlowGrow, savedGlowGrow } from './glowGrow';
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
        const base = { cues, ticks: {}, performer: 'Apple' as const };
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

describe('a starter the teacher ended with punctuation', () => {
    const input = {
        cues, ticks: { [hands]: true, [hips]: false, [legs]: true, [hold]: false }, performer: 'Apple' as const,
        picks: { glow: { source: cue(3), text: 'Legs together and pointing straight up' }, grow: { source: cue(4), text: 'Hold still for 3 seconds' } },
    };

    it('gets one colon in the sentence, not two', () => {
        const card = glowGrowCard({ ...input, setting: { glowStarter: 'You did well at:', growStarter: 'Next, try... ' } });
        expect(card.sentence).toBe('Apple, You did well at: Legs together and pointing straight up. Next, try: Hold still for 3 seconds.');
    });

    it('is shown in the headings without it, as the heading adds its own', () => {
        expect(glowGrowCard({ ...input, setting: { glowStarter: 'You did well at:', growStarter: 'Well done! Now try -' } }))
            .toMatchObject({ glowStarter: 'You did well at', growStarter: 'Well done! Now try' });
    });

    it('falls back to the default when it is punctuation only', () => {
        expect(glowGrowCard({ ...input, setting: { glowStarter: ':', growStarter: '...' } }))
            .toMatchObject({ glowStarter: 'You did well at', growStarter: 'Next, try' });
    });
});

describe('an own idea said into the microphone', () => {
  it('goes into an empty box as heard', () => {
    expect(addHeard('', 'bend your knees')).toBe('bend your knees');
  });

  it('is added after what the assessor already typed', () => {
    expect(addHeard('Step forward', 'and bend your knees')).toBe('Step forward and bend your knees');
    expect(addHeard('Step forward ', ' and bend your knees ')).toBe('Step forward and bend your knees');
  });

  it('leaves the box as it is when nothing was heard', () => {
    expect(addHeard('Step forward', '  ')).toBe('Step forward');
  });

  it('is cut at the 80-character limit', () => {
    const heard = 'keep your eyes on the ball and step forward with the other foot when you release it now';
    expect(addHeard('', heard)).toBe('keep your eyes on the ball and step forward with the other foot when you release');
    expect(addHeard('', heard)).toHaveLength(80);
    expect(addHeard('x'.repeat(80), 'more')).toBe('x'.repeat(80));
  });
});

describe('saving a glow and grow for the teacher', () => {
  // What the device sends and the teacher's copy gives back: plain JSON
  const back = (saved: unknown) => readGlowGrow(JSON.parse(JSON.stringify(saved ?? null)));

  it('keeps a cue pick with the wording the assessor saw', () => {
    const picks = {
      glow: { source: cue(1), text: 'Hands under your hips' },
      grow: { source: cue(4), text: 'Freeze like a statue' },
    };
    expect(back(savedGlowGrow(picks))).toEqual(picks);
  });

  it("keeps the fixed glow, and an own idea in the assessor's own words", () => {
    const saved = savedGlowGrow({
      glow: { source: { kind: 'fixed' }, text: 'You gave it a go' },
      grow: { source: own, text: '  Point your toes  ' },
    });
    expect(back(saved)).toEqual({
      glow: { source: { kind: 'fixed' }, text: 'You gave it a go' },
      grow: { source: { kind: 'own' }, text: 'Point your toes' },
    });
  });

  it('saves nothing until both are chosen', () => {
    const glow = { source: cue(1), text: 'Hands hold the lower back, elbows on the mat' };
    expect(savedGlowGrow(undefined)).toBeUndefined();
    expect(savedGlowGrow({})).toBeUndefined();
    expect(savedGlowGrow({ glow })).toBeUndefined();
    expect(savedGlowGrow({ glow, grow: { source: own, text: '   ' } })).toBeUndefined();
  });

  it('reads anything that is not a whole glow and grow as none', () => {
    const glow = { source: cue(1), text: 'Hands under your hips' };
    const bad = [
      undefined, null, 'glow', [], {}, { glow },
      { glow, grow: { source: own } },
      { glow, grow: { source: own, text: ' ' } },
      { glow, grow: { source: { kind: 'ai' }, text: 'x' } },
      { glow, grow: { source: { kind: 'cue' }, text: 'x' } },
    ];
    for (const value of bad) expect(readGlowGrow(value)).toBeUndefined();
  });

  it("saves each performer's finished card, and nothing for one still being filled in", () => {
    const ticks = { [hands]: true, [hips]: false, [legs]: true, [hold]: true };
    const done = glowGrowCard({
      cues, ticks, performer: 'Banana',
      picks: { glow: { source: cue(1), text: cues[0].kidFriendlyText }, grow: { source: own, text: 'Point your toes' } },
    });
    const half = glowGrowCard({ cues, ticks, performer: 'Apple', picks: { glow: { source: cue(1), text: cues[0].kidFriendlyText } } });
    expect(pairGlowGrow({ Apple: half, Banana: done })).toEqual({
      banana: { glow: { source: cue(1), text: 'Hands hold the lower back, elbows on the mat' }, grow: { source: own, text: 'Point your toes' } },
    });
    // Glow and Grow is off: there are no cards
    expect(pairGlowGrow({ Apple: null, Banana: null })).toBeUndefined();
  });

  it('is shown as a Glow line and a Grow line, with an own idea marked as the pupil\'s own', () => {
    expect(glowGrowLines({ glow: { source: cue(1), text: 'Hands under your hips' }, grow: { source: own, text: '<b>Point</b> your toes' } })).toEqual([
      { label: 'Glow', text: 'Hands under your hips', own: false },
      { label: 'Grow', text: '<b>Point</b> your toes', own: true },
    ]);
    expect(glowGrowLines(undefined)).toEqual([]);
    expect(glowGrowLines({ glow: { source: cue(1), text: 'Hands under your hips' } })).toEqual([]);
  });

  it("reads a pair's saved glow and grow performer by performer", () => {
    const said = { glow: { source: cue(1), text: 'Hands under your hips' }, grow: { source: own, text: 'Point your toes' } };
    expect(readPairGlowGrow({ apple: said, banana: said })).toEqual({ apple: said, banana: said });
    expect(readPairGlowGrow({ banana: said, apple: { glow: 'nice' }, carrot: said })).toEqual({ banana: said });
    for (const none of [undefined, null, 'x', [], {}, { apple: 3 }]) expect(readPairGlowGrow(none)).toBeUndefined();
  });
});

describe("what is sent with a performer's peer ticks", () => {
  const said = { glow: { source: cue(1), text: 'Hands under your hips' }, grow: { source: own, text: 'Point your toes' } };
  const other = { glow: { source: { kind: 'fixed' as const }, text: 'You gave it a go' }, grow: { source: cue(2), text: 'Hips up high' } };
  const ticks = [{ cueIndex: 1, isObserved: true }];
  // What reaches the database is plain JSON: a key that is absent means "leave it alone"
  const wire = (sent: unknown) => JSON.parse(JSON.stringify({ glow_grow: sent })).glow_grow;

  it("sends each ticked performer's glow and grow", () => {
    expect(wire(glowGrowToSend({ apple: said, banana: other }, { apple: ticks, banana: ticks }))).toEqual({ apple: said, banana: other });
  });

  it('sends an explicit clear for a ticked performer whose attempt has none', () => {
    expect(wire(glowGrowToSend({ banana: other }, { apple: ticks, banana: ticks }))).toEqual({ apple: null, banana: other });
    expect(wire(glowGrowToSend(undefined, { apple: ticks, banana: ticks }))).toEqual({ apple: null, banana: null });
    // An entry that isn't a whole glow and grow is none
    expect(wire(glowGrowToSend({ apple: { glow: said.glow } }, { apple: ticks }))).toEqual({ apple: null });
  });

  it("leaves a performer alone when their ticks aren't sent", () => {
    expect(wire(glowGrowToSend({ apple: said, banana: other }, { apple: ticks, banana: [] }))).toEqual({ apple: said });
    expect(wire(glowGrowToSend(undefined, { banana: ticks }))).toEqual({ banana: null });
    // The early auto-save of a clip carries no ticks: nothing is sent at all
    expect(wire(glowGrowToSend({ apple: said }, { apple: [], banana: undefined }))).toBeUndefined();
    expect(wire(glowGrowToSend(undefined, {}))).toBeUndefined();
  });

  it("leaves this device's record as the teacher's copy ends up", () => {
    // Performer by performer: replaced, cleared, or left alone
    expect(glowGrowAfterSend({ apple: said, banana: other }, { apple: other })).toEqual({ apple: other, banana: other });
    expect(glowGrowAfterSend({ apple: said, banana: other }, { apple: null })).toEqual({ banana: other });
    expect(glowGrowAfterSend({ apple: said }, { apple: null, banana: null })).toBeUndefined();
    expect(glowGrowAfterSend({ apple: said }, undefined)).toEqual({ apple: said });
    expect(glowGrowAfterSend(undefined, { banana: other })).toEqual({ banana: other });
    expect(glowGrowAfterSend(undefined, undefined)).toBeUndefined();
  });
});
