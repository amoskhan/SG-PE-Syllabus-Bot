import React, { useEffect, useRef } from 'react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { speechService } from '../../services/speechService';
import { GLOW_GROW_MAX_LENGTH, GlowGrowCard, GlowGrowChoice, GlowGrowPicks, addHeard, isPicked, pickChoice } from '../../utils/glowGrow';

// Glow and Grow on the tick screen (#151, GLOSSARY.md): once every cue is
// ticked the cue list folds to one line and the "Tell <performer>" card asks
// the assessor for one glow and one grow. The rules are in utils/glowGrow.ts;
// nothing here is sent anywhere.

interface GlowGrowPanelProps {
  card: GlowGrowCard;
  performer: 'Apple' | 'Banana';
  cueCount: number;
  cuesOpen: boolean;              // the assessor reopened the folded cue list
  onCuesOpen: (open: boolean) => void;
  onPicks: (picks: GlowGrowPicks) => void;
}

const choiceClass = (picked: boolean, tone: string) =>
  `w-full min-h-14 px-3 py-3 rounded-2xl text-left text-sm font-black flex items-center gap-2.5 transition-all cursor-pointer ${
    picked ? `${tone} text-white ring-2 ring-white` : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
  }`;

// The "My own idea" box, with a microphone beside it (#153). The microphone
// is the browser's own speech-to-text, the one the chat composer uses: it
// only gives back words, which land in the box for the assessor to correct.
// The app records and stores no audio, but the browser's speech-to-text
// service may send the audio to the browser vendor to transcribe it. Where
// the browser has no speech-to-text the button is not shown and the box is
// typed in as before.
const OwnIdeaBox: React.FC<{ text: string; onText: (text: string) => void }> = ({ text, onText }) => {
  const { isListening, transcript, startListening, stopListening, resetTranscript, hasRecognitionSupport } =
    useSpeechRecognition({ continuous: false });
  // What the box held when listening began; null once the assessor types,
  // so a late result never overwrites their correction
  const beforeRef = useRef<string | null>(null);

  useEffect(() => {
    if (transcript && beforeRef.current !== null) onText(addHeard(beforeRef.current, transcript));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  const toggleMic = () => {
    if (isListening) { stopListening(); return; }
    beforeRef.current = text;
    resetTranscript();
    startListening();
  };

  return (
    <div className="flex items-stretch gap-2">
      <input
        type="text"
        autoFocus
        maxLength={GLOW_GROW_MAX_LENGTH}
        value={text}
        onChange={(e) => {
          beforeRef.current = null;
          if (isListening) stopListening();
          onText(e.target.value);
        }}
        placeholder={isListening ? 'Listening…' : hasRecognitionSupport ? 'Type or say your idea' : 'Type your idea'}
        aria-label="My own idea"
        className="flex-1 min-w-0 px-3 py-3 rounded-2xl bg-white text-slate-900 text-base font-bold border-2 border-sky-400 focus:outline-hidden focus:ring-2 focus:ring-sky-300"
      />
      {hasRecognitionSupport && (
        <button
          type="button"
          onClick={toggleMic}
          aria-pressed={isListening}
          aria-label={isListening ? 'Stop listening' : 'Say your idea'}
          className={`shrink-0 min-w-14 px-3 rounded-2xl text-xl font-black cursor-pointer transition-all ${
            isListening ? 'bg-red-500 text-white ring-2 ring-white animate-pulse' : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
          }`}
        >
          {isListening ? '⏹️' : '🎤'}
        </button>
      )}
    </div>
  );
};

export const GlowGrowPanel: React.FC<GlowGrowPanelProps> = ({ card, performer, cueCount, cuesOpen, onCuesOpen, onPicks }) => {
  if (!card.allTicked) {
    return (
      <p className="mb-3 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-bold text-slate-300">
        Tick every cue ({card.tickedCount} of {cueCount}) to tell {performer} a glow and a grow.
      </p>
    );
  }
  if (cuesOpen) {
    return (
      <button
        type="button"
        onClick={() => onCuesOpen(false)}
        className="mb-3 w-full py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-sm font-black text-white cursor-pointer"
      >
        ✅ Done ticking
      </button>
    );
  }

  const { picks } = card;
  const row = (choices: GlowGrowChoice[], side: 'glow' | 'grow', tone: string) => (
    <div className="flex flex-col gap-2">
      {choices.map((c, n) => (
        <button
          key={n}
          type="button"
          aria-pressed={isPicked(c, picks[side])}
          onClick={() => { if (!isPicked(c, picks[side])) onPicks({ ...picks, [side]: pickChoice(c) }); }}
          className={choiceClass(isPicked(c, picks[side]), tone)}
        >
          <span className="text-xl shrink-0">{c.icon}</span>
          <span className="leading-tight">{c.text}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="mb-3 px-3 py-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-between gap-2">
        <p className="text-sm font-black text-white">✅ {card.tickedCount} cues ticked</p>
        <button
          type="button"
          onClick={() => onCuesOpen(true)}
          className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-slate-200 cursor-pointer"
        >
          change
        </button>
      </div>

      <div className="mb-3 p-3 rounded-2xl bg-slate-800/90 border-2 border-amber-400/70 flex flex-col gap-3">
        <h3 className="text-base font-black text-amber-300">💬 Tell {performer}</h3>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-black text-emerald-300">🌟 Glow · {card.glowStarter}…</p>
          {row(card.glowChoices, 'glow', 'bg-emerald-600')}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-black text-sky-300">🌱 Grow · {card.growStarter}…</p>
          {row(card.growChoices, 'grow', 'bg-sky-600')}
          {picks.grow?.source.kind === 'own' && (
            <OwnIdeaBox
              text={picks.grow.text}
              onText={(text) => onPicks({ ...picks, grow: { source: { kind: 'own' }, text } })}
            />
          )}
        </div>

        {card.sentence ? (
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-700 flex flex-col gap-2">
            <p className="text-[11px] font-bold text-slate-400">Say this to {performer}:</p>
            <p className="text-base font-black text-white leading-snug">{card.sentence}</p>
            {/* Spoken only on a tap: a hall of iPads must not all talk at once */}
            <button
              type="button"
              onClick={() => speechService.speak(card.sentence!)}
              className="self-start px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black cursor-pointer"
            >
              🔊 Hear it
            </button>
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400">Choose one glow and one grow to go on.</p>
        )}
      </div>
    </>
  );
};
