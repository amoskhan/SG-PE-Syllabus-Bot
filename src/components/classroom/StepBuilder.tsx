import React from 'react';
import { AssessmentMethod, LessonProblem, LessonStep, StepKind, TeachMedia, canUseAiAnalysis, newStepId } from '../../utils/lessonFlow';
import { referenceImageFor } from '../../utils/teachPages';
import { getAllCuesForSkill } from '../../data/peerSyllabusCues';
import { TeachMediaEditor, UploadMedia } from './TeachMediaEditor';

// The teacher builds a lesson from Teach, Practise and Assess steps (#87, #88;
// GLOSSARY.md: Lesson Step, ADR 0002): add, reorder, edit and remove them.
// Pupils' devices follow them in this order.

interface StepBuilderProps {
  steps: LessonStep[];
  skills: string[];          // the skills of the lesson's learning area
  mainSkill: string;
  problems: LessonProblem[]; // from validateLesson
  onChange: (steps: LessonStep[]) => void;
  // A Teach step's own videos and pictures (#89), changed against the latest steps
  onStepMediaChange: (stepId: string, change: (media: TeachMedia[]) => TeachMedia[]) => void;
  onUploadMedia?: UploadMedia;
}

const inputClass =
  'w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500';
const smallLabel = 'text-[11px] font-bold text-slate-500 dark:text-slate-400';

const KIND_STYLE: Record<StepKind, { icon: string; name: string; tone: string }> = {
  teach: { icon: '👀', name: 'Teach', tone: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20' },
  practise: { icon: '🏃', name: 'Practise', tone: 'border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/20' },
  assess: { icon: '📋', name: 'Assess', tone: 'border-violet-200 dark:border-violet-900 bg-violet-50/60 dark:bg-violet-950/20' },
};

const METHODS: { value: AssessmentMethod; label: string }[] = [
  { value: 'peer_assessment', label: 'Peer assessment (film + partner ticks cues)' },
  { value: 'ai_analysis', label: 'Peer assessment + AI analysis (Practice Station)' },
];

export const blankStep = (kind: StepKind, skillName: string): LessonStep =>
  kind === 'teach'
    ? { id: newStepId(), kind, skillName, teach: { media: [], showCues: true, showReferenceImage: !!referenceImageFor(skillName) } }
    : kind === 'practise'
      ? { id: newStepId(), kind, skillName, practise: { films: false } }
      : { id: newStepId(), kind, skillName, assess: { method: 'peer_assessment' } };

export const StepBuilder: React.FC<StepBuilderProps> = ({ steps, skills, mainSkill, problems, onChange, onStepMediaChange, onUploadMedia }) => {
  const update = (i: number, patch: Partial<LessonStep>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const add = (kind: StepKind) => onChange([...steps, blankStep(kind, mainSkill)]);

  // A different skill has different cues, so the picked ones no longer apply
  const changeSkill = (step: LessonStep, skillName: string): Partial<LessonStep> =>
    step.assess ? { skillName, assess: { method: step.assess.method } } : { skillName };
  // Tick or untick one cue pupils will see. Every cue ticked is stored as no pick at all.
  const toggleCue = (i: number, step: LessonStep, all: number[], itemNumber: number) => {
    const picked = step.assess?.focusCues?.length ? step.assess.focusCues : all;
    const next = all.filter(n => (n === itemNumber ? !picked.includes(n) : picked.includes(n)));
    if (!step.assess || next.length === 0) return;
    update(i, { assess: { method: step.assess.method, ...(next.length < all.length ? { focusCues: next } : {}) } });
  };

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
          const kind = step.kind;
          const style = KIND_STYLE[kind];
          const hasPicture = !!referenceImageFor(step.skillName);
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
                    const k = e.target.value as StepKind;
                    onChange(steps.map((s, j) => (j === i ? { ...blankStep(k, s.skillName), id: s.id, instruction: s.instruction } : s)));
                  }}
                  className={`${inputClass} w-auto`}
                >
                  <option value="teach">👀 Teach</option>
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
                  <select value={step.skillName} onChange={(e) => update(i, changeSkill(step, e.target.value))} className={inputClass}>
                    {!skills.includes(step.skillName) && <option value={step.skillName}>{step.skillName || '—'}</option>}
                    {skills.map(s => <option key={s} value={s}>{s}{s === mainSkill ? ' (main skill)' : ''}</option>)}
                  </select>
                </label>

                {step.kind === 'assess' ? (
                  <label className="flex flex-col gap-1">
                    <span className={smallLabel}>How it's assessed</span>
                    <select
                      value={step.assess?.method ?? ''}
                      onChange={(e) => update(i, { assess: { ...step.assess, method: e.target.value as AssessmentMethod } })}
                      className={inputClass}
                    >
                      {METHODS.map(m => (
                        <option key={m.value} value={m.value} disabled={m.value === 'ai_analysis' && !ai.ok}>
                          {m.label}{m.value === 'ai_analysis' && !ai.ok ? ' (not for this skill)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : step.kind === 'teach' ? (
                  <div className="flex flex-col gap-1.5 sm:pt-5">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!step.teach?.showCues}
                        onChange={(e) => update(i, { teach: { media: [], showReferenceImage: false, ...step.teach, showCues: e.target.checked } })}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Show the cues</span>
                    </label>
                    <label className={`flex items-center gap-2 ${hasPicture ? '' : 'opacity-50'}`}>
                      <input
                        type="checkbox"
                        disabled={!hasPicture}
                        checked={hasPicture && !!step.teach?.showReferenceImage}
                        onChange={(e) => update(i, { teach: { media: [], showCues: false, ...step.teach, showReferenceImage: e.target.checked } })}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {hasPicture ? 'Show the reference picture' : 'No reference picture for this skill yet'}
                      </span>
                    </label>
                  </div>
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

              {step.kind === 'teach' && (
                <TeachMediaEditor
                  media={step.teach?.media ?? []}
                  onChange={(change) => onStepMediaChange(step.id, change)}
                  onUpload={onUploadMedia}
                />
              )}

              {step.kind === 'assess' && (() => {
                const first = steps.findIndex(s => s.kind === 'assess' && s.skillName === step.skillName);
                if (first !== i) {
                  return <p className="text-[11px] text-slate-500 dark:text-slate-400">Pupils tick the cues chosen in step {first + 1}.</p>;
                }
                const cues = getAllCuesForSkill(step.skillName);
                const all = cues.map(c => c.itemNumber);
                const picked = step.assess?.focusCues?.length ? step.assess.focusCues : all;
                return (
                  <div className="flex flex-col gap-1.5">
                    <span className={smallLabel}>Cues pupils tick ({picked.length} of {cues.length})</span>
                    {cues.map(c => (
                      <label key={c.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={picked.includes(c.itemNumber)}
                          disabled={picked.length === 1 && picked.includes(c.itemNumber)}
                          onChange={() => toggleCue(i, step, all, c.itemNumber)}
                          className="w-4 h-4 mt-0.5 accent-indigo-600"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{c.icon} {c.kidFriendlyText}</span>
                      </label>
                    ))}
                  </div>
                );
              })()}

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
                  placeholder={step.kind === 'teach' ? 'e.g. Look at where the stepping foot points' : step.kind === 'practise' ? 'e.g. 10 throws each at the wall target' : 'e.g. Film from the side'}
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
        <button type="button" onClick={() => add('teach')}
          className="px-3 py-2 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer">
          ＋ Teach step
        </button>
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
