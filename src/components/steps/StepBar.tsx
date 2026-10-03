import React from 'react';
import { LessonStep, stepLabel } from '../../utils/lessonFlow';

// "Step 2 of 3 · Practice Station", with a way back one step (#85). Shown on
// the pupil's device above whatever the step is.

interface StepBarProps {
  step: LessonStep;
  number: number;
  total: number;
  onBack?: () => void;   // omitted on the first step
  className?: string;
}

export const StepBar: React.FC<StepBarProps> = ({ step, number, total, onBack, className = '' }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    {onBack && number > 1 && (
      <button
        type="button"
        onClick={onBack}
        className="h-8 px-2.5 shrink-0 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-bold text-slate-200 cursor-pointer"
      >
        ← Step {number - 1}
      </button>
    )}
    <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-300">
      Step {number} of {total} · <span className="text-white">{stepLabel(step)}</span>
    </p>
  </div>
);
