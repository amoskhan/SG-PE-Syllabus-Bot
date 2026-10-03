import React, { useEffect, useRef, useState } from 'react';
import { LessonStep } from '../../utils/lessonFlow';
import { StepBar } from './StepBar';
import { TeachPager } from './TeachPager';
import { teachPages } from '../../utils/teachPages';

// The pupil screen for a step that isn't peer assessment or the Practice
// Station (those have their own screens): Teach, Practise, and an Assess step
// done by the teacher alone. A Teach step shows its pages (#88). A Practise step can let pupils film each other to
// watch back (#87); that video stays on the device and is never sent.
//
// The page body doesn't scroll (index.html), so the middle of this screen does.

interface LessonStepScreenProps {
  step: LessonStep;
  number: number;
  total: number;
  pairNumber: number;
  onNext: () => void;
  onBack: () => void;
  onHome: () => void;
}

const COPY = (step: LessonStep): { icon: string; title: string; hint: string; next: string } => {
  if (step.kind === 'teach') {
    return { icon: '👀', title: `Learn: ${step.skillName}`, hint: 'Watch and read together. Move on when you both know what to do.', next: "We're ready ➔" };
  }
  if (step.kind === 'practise') {
    return { icon: '🏃', title: `Practise: ${step.skillName}`, hint: 'Take turns. Help each other remember the cues.', next: "We're done practising ➔" };
  }
  return { icon: '🧑‍🏫', title: 'Your teacher is assessing you', hint: `Show your teacher your best ${step.skillName}. Wait for your teacher before moving on.`, next: 'Next ➔' };
};

/** Film a go and watch it back. Nothing is uploaded. */
const PractiseFilm: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div className="w-full flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setUrl(URL.createObjectURL(file));
          e.target.value = '';
        }}
      />
      {url && <video src={url} controls playsInline className="w-full aspect-video rounded-2xl bg-black object-contain" />}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="h-12 rounded-2xl bg-slate-800 border border-slate-700 text-base font-black active:scale-[0.98]"
      >
        {url ? '📹 Film another go' : '📹 Film your partner'}
      </button>
      <p className="text-xs text-slate-400">Watch it back together. This video stays on this device and isn't sent to your teacher.</p>
    </div>
  );
};

export const LessonStepScreen: React.FC<LessonStepScreenProps> = ({ step, number, total, pairNumber, onNext, onBack, onHome }) => {
  const copy = COPY(step);
  return (
    <div className="dark h-[100dvh] w-full bg-slate-900 text-white flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-slate-950/90 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-black">🍎🍌 Pair #{pairNumber}</h1>
          <button type="button" onClick={onHome} className="h-9 px-3 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 active:scale-95">
            ← Home
          </button>
        </div>
        <StepBar step={step} number={number} total={total} onBack={onBack} />
      </div>

      {step.kind === 'teach' ? (
        // Teach (#88): the pages fill the screen; the cues page scrolls on its own
        <div className="flex-1 min-h-0 w-full max-w-xl mx-auto px-4 py-4 flex flex-col gap-3">
          <h2 className="shrink-0 text-xl font-black leading-tight">{copy.icon} {copy.title}</h2>
          {step.instruction && (
            <p className="shrink-0 rounded-2xl bg-indigo-500/15 border border-indigo-400/40 px-4 py-2.5 text-sm font-bold text-indigo-50">
              {step.instruction}
            </p>
          )}
          <TeachPager key={step.id} pages={teachPages(step)} />
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="w-full max-w-xl mx-auto px-4 py-8 flex flex-col items-center text-center gap-4">
          <span className="text-6xl">{copy.icon}</span>
          <h2 className="text-2xl font-black leading-tight">{copy.title}</h2>
          {step.instruction && (
            <p className="w-full rounded-2xl bg-indigo-500/15 border border-indigo-400/40 px-4 py-3 text-base font-bold text-indigo-50">
              {step.instruction}
            </p>
          )}
          <p className="text-sm text-slate-300">{copy.hint}</p>
          {step.kind === 'practise' && step.practise?.films && <PractiseFilm key={step.id} />}
        </div>
      </div>
      )}

      <div className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-slate-950/95 border-t border-slate-800">
        <button
          type="button"
          onClick={onNext}
          className="w-full max-w-xl mx-auto block h-14 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] rounded-2xl text-base font-black"
        >
          {copy.next}
        </button>
      </div>
    </div>
  );
};
