import React, { useEffect, useMemo, useState } from 'react';
import { describeChoices, guideStep, type GuideStep, JUST_ANSWER, questionsAfter } from '../../data/syllabusGuide';

type GuideQuestion = Extract<GuideStep, { kind: 'ask' }>;

interface GuideCardProps {
  question: GuideQuestion;
  /** The guide is done: the answer to send for, and the options the teacher picked */
  onFinish: (step: GuideStep, picks: string[]) => void;
  disabled?: boolean;
}

/**
 * The syllabus guide's questions in one card (#131), like Claude's question
 * card: one question at a time, each option with a line from the syllabus map.
 * Each pick works out the next question here, with no message sent; the chat
 * only hears about it once the guide is done.
 */
const GuideCard: React.FC<GuideCardProps> = ({ question, onFinish, disabled = false }) => {
  /** The questions asked so far, with the option picked for each */
  const [trail, setTrail] = useState<{ question: GuideQuestion; pick?: string }[]>([{ question }]);
  const [index, setIndex] = useState(0);
  const [other, setOther] = useState('');

  const current = trail[index].question;
  const options = current.choices.filter((c) => c !== JUST_ANSWER);
  const descriptions = useMemo(() => describeChoices(current), [current]);
  const total = index + 1 + questionsAfter(current);

  const choose = (choice: string) => {
    if (disabled || !choice.trim()) return;
    const step = guideStep(choice, current.state);
    const picks = [...trail.slice(0, index).map((t) => t.pick!), choice];
    if (step.kind === 'ask') {
      setTrail([...trail.slice(0, index), { question: current, pick: choice }, { question: step }]);
      setIndex(index + 1);
      setOther('');
    } else {
      onFinish(step, choice === JUST_ANSWER ? picks.slice(0, -1) : picks);
    }
  };

  // Number keys pick an option, unless the teacher is typing something. The chat
  // box keeps the focus after a question is sent, so an empty box still counts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (disabled || e.ctrlKey || e.metaKey || e.altKey) return;
      if (target?.isContentEditable || target?.tagName === 'SELECT') return;
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.value !== '') return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        choose(options[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const picked = trail[index].pick;
  const canGoNext = !!picked && index < trail.length - 1;

  return (
    <div className="mt-1 w-full rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h3 className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">{current.prompt}</h3>
        <button
          type="button"
          aria-label="Previous question"
          onClick={() => setIndex(index - 1)}
          disabled={index === 0 || disabled}
          className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
          {index + 1} of {total}
        </span>
        <button
          type="button"
          aria-label="Next question"
          onClick={() => setIndex(index + 1)}
          disabled={!canGoNext || disabled}
          className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
        >
          ›
        </button>
      </div>

      <ol className="max-h-[38vh] sm:max-h-[50vh] overflow-y-auto px-2">
        {options.map((option, i) => (
          <li key={option}>
            <button
              type="button"
              onClick={() => choose(option)}
              disabled={disabled}
              className={`w-full flex items-start gap-3 px-2 py-2.5 rounded-xl text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                picked === option ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-zinc-800'
              }`}
            >
              <span className="shrink-0 w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{option}</span>
                {descriptions[i] && (
                  <span className="block text-xs text-slate-500 dark:text-slate-400 leading-snug">{descriptions[i]}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 dark:border-zinc-800">
        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            choose(other);
          }}
        >
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Something else…"
            disabled={disabled}
            aria-label="Something else"
            className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none"
          />
        </form>
        <button
          type="button"
          onClick={() => choose(JUST_ANSWER)}
          disabled={disabled}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
};

export default GuideCard;
