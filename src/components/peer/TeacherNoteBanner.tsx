import React from 'react';

/**
 * The Teacher Note on the pair's iPad (#179). Shown on every lesson screen —
 * steps, peer assessment and the Practice Station — so the pair sees it
 * wherever they are. `overlay` floats it over a full-screen step.
 */
export const TeacherNoteBanner: React.FC<{ message: string; onDismiss: () => void; overlay?: boolean }> = ({
  message,
  onDismiss,
  overlay,
}) => (
  <div
    className={`${overlay ? 'absolute top-0 inset-x-0 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-lg' : 'shrink-0'} z-50 bg-amber-50 dark:bg-amber-950/90 border-b border-amber-300 dark:border-amber-800/70 px-4 py-2.5`}
    role="status"
  >
    <div className="max-w-5xl mx-auto flex items-start gap-3">
      <span className="text-lg shrink-0">📩</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase font-extrabold tracking-wider text-amber-700 dark:text-amber-300">Teacher Feedback</p>
        <p className="text-sm text-amber-900 dark:text-amber-100 leading-snug whitespace-pre-line">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold text-xs cursor-pointer"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  </div>
);
