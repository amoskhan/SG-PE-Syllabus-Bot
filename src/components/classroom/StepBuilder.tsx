import React from 'react';
import { AssessmentMethod, LessonProblem, LessonStep, canUseAiAnalysis, newStepId } from '../../utils/lessonFlow';

// The teacher builds a lesson from Practise and Assess steps (#87; GLOSSARY.md:
// Lesson Step, ADR 0002): add, reorder, edit and remove them. Pupils' devices
// follow them in this order. Teach steps come later (#88).

interface StepBuilderProps {
  steps: LessonStep[];
  skills: string[];          // the skills of the lesson's learning area
  mainSkill: string;
  problems: LessonProblem[]; // from validateLesson
  onChange: (steps: LessonStep[]) => void;
}

const inputClass =
  'w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500';
const smallLabel = 'text-[11px] font-bold text-slate-500 dark:text-slate-400';

const KIND_STYLE: Record<'practise' | 'assess', { icon: string; name: string; tone: string }> = {
  practise: { icon: '🏃', name: 'Practise', tone: 'border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/20' },
  assess: { icon: '📋', name: 'Assess', tone: 'border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/20' },
};

const METHODS: { value: AssessmentMethod; label: string }[] = [
  { value: 'peer_assessment', label: 'Peer assessment (film + partner ticks cues)' },
  { value: 'ai_analysis', label: 'AI analysis (Practice Station)' },
];

export const blankStep = (kind: 'practise' | 'assess', skillName: string): LessonStep =>
  kind === 'practise'
    ? { id: newStepId(), kind, skillName, practise: { films: false } }
    : { id: newStepId(), kind, skillName, assess: { method: 'peer_assessment' } };

export const StepBuilder: React.FC<StepBuilderProps> = ({ steps, skills, mainSkill, problems, onChange }) => {
  const update = (i: number, patch: Partial<LessonStep>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const add = (kind: 'practise' | 'assess') => onChange([...steps, blankStep(kind, mainSkill)]);

  const problemsFor = (i: number) => problems.filter(p => p.stepIndex === i);
  const noSteps = problems.some(p => p.code === 'no_steps');

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Lesson steps</span>
        <p className="text-[11px] text-slate-400 mt-0.5">Pupils' devices go through these in order. Each pair moves on when they're ready.</p>
      </div>

      {noSteps && (
        <p role="alert" className="text-xs font-bold px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
          ⚠️ This lesson has no steps, so pupils would have nothing to do. Add one below.
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => {
          const kind = step.kind === 'assess' ? 'assess' : 'practise';
          const style = KIND_STYLE[kind];
          const ai = canUseAiAnalysis(step.skillName);
          return (
            <li key={step.id} className={`rounded-2xl border p-3 flex flex-col gap-2.5 ${style.tone}`}>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 shrink-0 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-black flex items-center justify-center">
                  {i + 1}
                </span>
                <select
                  aria-label={`Step ${i + 1} kind`}
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as 'practise' | 'assess';
                    onChange(steps.map((s, j) => (j === i ? { ...blankStep(k, s.skillName), id: s.id, instruction: s.instruction } : s)));
                  }}
                  className={`${inputClass} w-auto`}
                >
                  <option value="practise">🏃 Practise</option>
                  <option value="assess">📋 Assess</option>
                </select>
                <div className="flex-1" />
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`}
                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm disabled:opacity-30 cursor-pointer">↑</button>
                <button type="button" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move step ${i + 1} down`}
                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm disabled:opacity-30 cursor-pointer">↓</button>
                <button type="button" onClick={() => remove(i)} aria-label={`Remove step ${i + 1}`}
                  className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/30 text-red-600 text-sm cursor-pointer">✕</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className={smallLabel}>Skill</span>
                  <select value={step.skillName} onChange={(e) => update(i, { skillName: e.target.value })} className={inputClass}>
                    {!skills.includes(step.skillName) && <option value={step.skillName}>{step.skillName || '—'}</option>}
                    {skills.map(s => <option key={s} value={s}>{s}{s === mainSkill ? ' (main skill)' : ''}</option>)}
                  </select>
                </label>

                {step.kind === 'assess' ? (
                  <label className="flex flex-col gap-1">
                    <span className={smallLabel}>How it's assessed</span>
                    <select
                      value={step.assess?.method ?? ''}
                      onChange={(e) => update(i, { assess: { method: e.target.value as AssessmentMethod } })}
                      className={inputClass}
                    >
                      {METHODS.map(m => (
                        <option key={m.value} value={m.value} disabled={m.value === 'ai_analysis' && !ai.ok}>
                          {m.label}{m.value === 'ai_analysis' && !ai.ok ? ' (not for this skill)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="flex items-center gap-2 sm:pt-5">
                    <input
                      type="checkbox"
                      checked={!!step.practise?.films}
                      onChange={(e) => update(i, { practise: { films: e.target.checked } })}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Pupils film each other to watch back</span>
                  </label>
                )}
              </div>

              {step.kind === 'assess' && !ai.ok && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">ℹ️ {ai.reason}</p>
              )}

              <label className="flex flex-col gap-1">
                <span className={smallLabel}>Instruction for pupils (optional)</span>
                <input
                  type="text"
                  maxLength={160}
                  value={step.instruction ?? ''}
                  onChange={(e) => update(i, { instruction: e.target.value || undefined })}
                  placeholder={step.kind === 'practise' ? 'e.g. 10 throws each at the wall target' : 'e.g. Film from the side'}
                  className={inputClass}
                />
              </label>

              {problemsFor(i).map(p => (
                <p key={p.code} role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">{p.message}</p>
              ))}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => add('practise')}
          className="px-3 py-2 rounded-xl border border-dashed border-sky-300 dark:border-sky-800 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer">
          ＋ Practise step
        </button>
        <button type="button" onClick={() => add('assess')}
          className="px-3 py-2 rounded-xl border border-dashed border-violet-300 dark:border-violet-800 text-xs font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 cursor-pointer">
          ＋ Assess step
        </button>
      </div>
    </div>
  );
};
