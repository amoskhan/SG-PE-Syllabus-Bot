import React, { useMemo, useState } from 'react';
import { SkillAnalysis } from '../../types';
import { saveTeacherReview } from '../../services/studentService';
import {
  LEVELS, CriterionResult, effectiveCriteria, effectiveLevel, levelFromCriteria, levelIndex,
} from '../../utils/gradingReview';

interface Props {
  analysis: SkillAnalysis;
  onSaved: (updated: SkillAnalysis) => void;
}

const AI_MARK: Record<CriterionResult, string> = { met: '✅', missed: '❌', unsure: '⚠️' };

/**
 * Lets the teacher overrule the AI cue by cue. The level follows the ticks
 * using the FMS rubric, and the teacher can still pick a different level.
 */
const TeacherReviewPanel: React.FC<Props> = ({ analysis, onSaved }) => {
  const initial = useMemo(() => effectiveCriteria(analysis), [analysis]);
  const [marks, setMarks] = useState<Record<string, CriterionResult>>(
    () => Object.fromEntries(initial.map(c => [c.name, c.result])),
  );
  // Until a tick changes, the level shown is the one on record; after that it
  // follows the ticks. A level the teacher picks by hand overrides both.
  const [touched, setTouched] = useState(false);
  const [manualLevel, setManualLevel] = useState<string | null>(() => {
    if (!analysis.teacherLevel || !initial.length) return null;
    const fromTicks = levelFromCriteria(initial.map(c => c.result), analysis.proficiencyLevel);
    return analysis.teacherLevel !== fromTicks ? analysis.teacherLevel : null;
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);

  const results = initial.map(c => marks[c.name]);
  const autoLevel = touched && results.length
    ? levelFromCriteria(results, analysis.proficiencyLevel)
    : effectiveLevel(analysis) ?? 'Developing';
  const level = manualLevel ?? autoLevel;
  const met = results.filter(r => r === 'met').length;
  const unsure = results.filter(r => r === 'unsure').length;
  const reviewed = !!analysis.teacherReviewedAt;

  const setMark = (name: string, result: 'met' | 'missed') => {
    setMarks(m => ({ ...m, [name]: result }));
    setTouched(true);
    setStatus(null);
  };

  const save = async () => {
    setSaving(true);
    // A cue left as ⚠️ isn't stored, so it keeps the AI's "unsure".
    const criteria = Object.fromEntries(
      Object.entries(marks).filter(([, r]) => r !== 'unsure'),
    ) as Record<string, 'met' | 'missed'>;
    const updated = await saveTeacherReview(analysis.id, { criteria, level });
    setSaving(false);
    if (!updated) return setStatus('error');
    setStatus('saved');
    onSaved(updated);
  };

  const undo = async () => {
    setSaving(true);
    const updated = await saveTeacherReview(analysis.id, null);
    setSaving(false);
    if (!updated) return setStatus('error');
    setMarks(Object.fromEntries(effectiveCriteria(updated).map(c => [c.name, c.result])));
    setTouched(false);
    setManualLevel(null);
    setStatus(null);
    onSaved(updated);
  };

  const changedFromAi = initial.some(c => marks[c.name] !== c.ai);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 md:p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-white">Your review</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {reviewed
              ? `Checked by you on ${analysis.teacherReviewedAt!.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`
              : 'Mark each cue as you saw it. Your marks replace the AI’s everywhere.'}
          </p>
        </div>
        {initial.length > 0 && (
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
            {met}/{initial.length} hit
          </p>
        )}
      </div>

      {initial.length > 0 ? (
        <div className="divide-y divide-slate-100 dark:divide-zinc-800 mb-4">
          {initial.map(c => {
            const r = marks[c.name];
            const differs = r !== c.ai && r !== 'unsure';
            return (
              <div key={c.name} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-200">{c.name}</p>
                  <p className={`text-xs ${r === 'unsure' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    AI said {AI_MARK[c.ai]}
                    {r === 'unsure' && ' · not sure, please decide'}
                    {differs && ' · you changed this'}
                  </p>
                </div>
                <div className="flex rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden flex-shrink-0" role="group" aria-label={`${c.name}: hit or missed`}>
                  <button
                    type="button"
                    aria-pressed={r === 'met'}
                    onClick={() => setMark(c.name, 'met')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      r === 'met'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    ✓ Hit
                  </button>
                  <button
                    type="button"
                    aria-pressed={r === 'missed'}
                    onClick={() => setMark(c.name, 'missed')}
                    className={`px-3 py-1.5 text-xs font-medium border-l border-slate-200 dark:border-zinc-700 transition-colors ${
                      r === 'missed'
                        ? 'bg-red-500 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    ✗ Missed
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          No cue checklist found in this grading, but you can still set the level.
        </p>
      )}

      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Level</p>
          {manualLevel && initial.length > 0 && (
            <button
              type="button"
              onClick={() => { setManualLevel(null); setStatus(null); }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Use level from the cues ({autoLevel})
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {LEVELS.map(l => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => { setManualLevel(l === autoLevel ? null : l); setStatus(null); }}
              className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                level === l
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
          {manualLevel
            ? 'Set by you.'
            : touched
            ? 'Worked out from your marks: all cues → Competent, half or more → Developing, under half → Beginning.'
            : levelIndex(analysis.teacherLevel) >= 0
            ? 'Your saved level.'
            : 'The AI’s level. It updates when you change a cue.'}
          {unsure > 0 && ` ${unsure} cue${unsure > 1 ? 's are' : ' is'} still ⚠️ and count${unsure > 1 ? '' : 's'} as not hit.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
        >
          {saving ? 'Saving…' : !reviewed && !changedFromAi && !manualLevel ? 'Confirm AI grading' : 'Save review'}
        </button>
        {reviewed && (
          <button
            type="button"
            onClick={undo}
            disabled={saving}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            Go back to AI grading
          </button>
        )}
        {status === 'saved' && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved. The AI note updates tonight.</span>}
        {status === 'error' && <span className="text-xs text-red-500">Couldn’t save. Check your connection and try again.</span>}
      </div>
    </div>
  );
};

export default TeacherReviewPanel;
