import React from 'react';
import { Lesson, lessonTitle } from '../../services/lessonService';
import type { PairPlan } from '../../utils/pairPlan';

/**
 * "No pairs planned yet" (#182), where the teacher plans a lesson and where
 * they show its QR. Only a warning: the QR still works, and the teacher can
 * plan pairs while pupils wait. Nothing shows once every place is named.
 */
export const PairsWarning: React.FC<{
  plan: PairPlan<Lesson>;
  copying: boolean;
  /** The last copy didn't save. */
  failed?: boolean;
  onCopy: () => void;
  onPlanPairs: () => void;
}> = ({ plan, copying, failed, onCopy, onPlanPairs }) => {
  if (plan.kind === 'planned') return null;
  const none = plan.kind === 'none';
  return (
    <div
      role="status"
      className="w-full flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-left"
    >
      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
        ⚠️ {none ? 'No pairs planned yet' : `${plan.unnamed} place${plan.unnamed === 1 ? '' : 's'} still unnamed`}
      </span>
      {failed && (
        <span role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">Couldn’t copy the pairs. Please try again.</span>
      )}
      <div className="flex flex-wrap gap-2 ml-auto">
        {none && plan.copyFrom && (
          <button
            type="button"
            onClick={onCopy}
            disabled={copying}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold cursor-pointer"
          >
            {copying ? 'Copying…' : `Copy pairs from ${lessonTitle(plan.copyFrom)}`}
          </button>
        )}
        <button
          type="button"
          onClick={onPlanPairs}
          className="px-2.5 py-1 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-bold cursor-pointer"
        >
          {none ? 'Plan pairs' : 'Name them'}
        </button>
      </div>
    </div>
  );
};
