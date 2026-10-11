import React from 'react';
import { glowGrowLines } from '../../utils/glowGrow';

// A performer's saved glow and grow (#156), under their peer ticks on the
// Review Tray and on Our progress. It renders nothing when there is none, so a
// lesson without Glow and Grow looks as it always did.
//
// An own idea is a pupil's free text: it is shown as plain text, never as markup.

interface GlowGrowSaidProps {
  said?: unknown;      // one performer's saved glow and grow, as stored
  className?: string;
}

export const GlowGrowSaid: React.FC<GlowGrowSaidProps> = ({ said, className = '' }) => {
  const lines = glowGrowLines(said);
  if (lines.length === 0) return null;
  return (
    <dl className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-3 py-2 space-y-1.5 ${className}`}>
      {lines.map(line => (
        <div key={line.label} className="flex items-start gap-2 text-xs leading-snug">
          <dt className={`shrink-0 w-14 font-black ${line.label === 'Glow' ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
            {line.label === 'Glow' ? '🌟' : '🌱'} {line.label}
          </dt>
          <dd className="min-w-0 text-slate-700 dark:text-slate-200 break-words">
            <span className="whitespace-pre-wrap">{line.text}</span>
            {line.own && (
              <span className="ml-1.5 inline-block rounded-full bg-sky-100 dark:bg-sky-900/50 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:text-sky-200">
                💡 Own idea
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
};
