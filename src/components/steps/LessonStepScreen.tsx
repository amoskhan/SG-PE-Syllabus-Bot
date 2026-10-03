import React from 'react';
import { LessonStep } from '../../utils/lessonFlow';
import { StepBar } from './StepBar';

// The pupil screen for a step that isn't peer assessment or the Practice
// Station (those have their own screens): Teach, Practise, and an Assess step
// done by the teacher alone. Kept simple here (#85); later tickets fill in
// teach media and filming.
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

export const LessonStepScreen: React.FC<LessonStepScreenProps> = ({ step, number, total, pairNumber, onNext, onBack, onHome }) => {
  const copy = COPY(step);
  return (
    <div className="h-[100dvh] w-full bg-slate-900 text-white flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-slate-950/90 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-black">🍎🍌 Pair #{pairNumber}</h1>
          <button type="button" onClick={onHome} className="h-9 px-3 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 active:scale-95">
            ← Home
          </button>
        </div>
        <StepBar step={step} number={number} total={total} onBack={onBack} />
      </div>

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
        </div>
      </div>

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
