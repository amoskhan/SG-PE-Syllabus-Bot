import React, { useState } from 'react';
import { ALL_FMS_SKILLS } from '../../data/fundamentalMovementSkillsData';
import { ALL_GYMNASTICS_SKILLS } from '../../data/gymnasticsSkillsData';
import {
  Lesson,
  LessonDraft,
  SkillArea,
  LEVELS,
  DEFAULT_PAIR_COUNT,
  MAX_PAIR_COUNT,
  lessonTitle,
  todayIso,
} from '../../services/lessonService';

const SKILLS_BY_AREA: Record<SkillArea, string[]> = {
  FMS: ALL_FMS_SKILLS,
  Gymnastics: ALL_GYMNASTICS_SKILLS,
};

const inputClass =
  'w-full px-3 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500';
const labelClass = 'text-xs font-bold text-slate-500 dark:text-slate-400';

// ── Plan a lesson ────────────────────────────────────────────────────────────

interface LessonPlanFormProps {
  onSave: (draft: LessonDraft, showNow: boolean) => Promise<void>;
  onCancel: () => void;
}

export const LessonPlanForm: React.FC<LessonPlanFormProps> = ({ onSave, onCancel }) => {
  const [lessonDate, setLessonDate] = useState(todayIso());
  const [className, setClassName] = useState('');
  const [level, setLevel] = useState('');
  const [objective, setObjective] = useState('');
  const [skillArea, setSkillArea] = useState<SkillArea>('FMS');
  const [skillName, setSkillName] = useState(SKILLS_BY_AREA.FMS[0]);
  const [pairCount, setPairCount] = useState(DEFAULT_PAIR_COUNT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeArea = (area: SkillArea) => {
    setSkillArea(area);
    setSkillName(SKILLS_BY_AREA[area][0]);
  };

  const submit = async (showNow: boolean) => {
    if (!className.trim()) {
      setError('Enter the class, e.g. 4B.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ lessonDate, className, level, objective, skillArea, skillName, pairCount }, showNow);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the lesson.');
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(true);
      }}
      className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 shadow-xl border border-slate-200 dark:border-zinc-800 flex flex-col gap-5"
    >
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Plan a lesson</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Each lesson gets its own QR code. Pupils' check-ins and videos are kept under it.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Date</span>
          <input type="date" required value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Class</span>
          <input
            type="text"
            required
            maxLength={20}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="e.g. 4B"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Lesson objective</span>
        <textarea
          rows={2}
          maxLength={200}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g. Pupils step forward with the opposite foot when throwing overhand"
          className={`${inputClass} resize-none`}
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Skill area</span>
          <div className="flex gap-1 bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl">
            {(['FMS', 'Gymnastics'] as SkillArea[]).map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => changeArea(area)}
                aria-pressed={skillArea === area}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  skillArea === area ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Skill</span>
          <select value={skillName} onChange={(e) => setSkillName(e.target.value)} className={inputClass}>
            {SKILLS_BY_AREA[skillArea].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Number of pairs</span>
          <input
            type="number"
            min={1}
            max={MAX_PAIR_COUNT}
            required
            value={pairCount}
            onChange={(e) => setPairCount(Math.max(1, Math.min(MAX_PAIR_COUNT, Number(e.target.value) || 1)))}
            className={inputClass}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save & show on projector'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => submit(false)}
          className="px-4 py-2.5 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-60 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          Save for later
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

// ── Your lessons ─────────────────────────────────────────────────────────────

interface LessonListProps {
  lessons: Lesson[];
  currentLessonId: string | null;
  loading: boolean;
  error: string | null;
  onPlan: () => void;
  onShow: (lesson: Lesson) => void;
  onDelete: (lesson: Lesson) => void;
  onPairs: (lesson: Lesson) => void;
  namedCounts: Record<string, number>; // lesson id → pupils named in its pairs
}

const LessonRow: React.FC<{
  lesson: Lesson;
  isCurrent: boolean;
  onShow: () => void;
  onDelete: () => void;
  onPairs: () => void;
  named: number;
}> = ({ lesson, isCurrent, onShow, onDelete, onPairs, named }) => (
  <li
    className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-3 ${
      isCurrent
        ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30 dark:border-indigo-700'
        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
    }`}
  >
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold text-sm text-slate-800 dark:text-white">{lessonTitle(lesson)}</span>
        {lesson.level && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300">
            {lesson.level}
          </span>
        )}
        {isCurrent && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">On projector</span>
        )}
      </div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
        {lesson.skillName} · {lesson.pairCount} pairs
      </p>
      {lesson.objective && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{lesson.objective}</p>}
    </div>
    <div className="flex gap-2 shrink-0">
      <button
        type="button"
        onClick={onPairs}
        title="Name the pupils in each pair"
        className="px-3 py-2 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
      >
        👥 Pairs{' '}
        <span className={named ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
          {named}/{lesson.pairCount * 2}
        </span>
      </button>
      {!isCurrent && (
        <button
          type="button"
          onClick={onShow}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
        >
          Show on projector
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        title="Delete lesson"
        aria-label={`Delete ${lessonTitle(lesson)}`}
        className="px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/60 text-red-600 rounded-xl text-xs font-bold cursor-pointer"
      >
        🗑
      </button>
    </div>
  </li>
);

export const LessonList: React.FC<LessonListProps> = ({
  lessons,
  currentLessonId,
  loading,
  error,
  onPlan,
  onShow,
  onDelete,
  onPairs,
  namedCounts,
}) => {
  const today = todayIso();
  const upcoming = lessons.filter((l) => l.lessonDate >= today).reverse(); // soonest first
  const past = lessons.filter((l) => l.lessonDate < today); // most recent first

  const section = (title: string, list: Lesson[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-2">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">{title}</h3>
        <ul className="flex flex-col gap-2">
          {list.map((l) => (
            <LessonRow
              key={l.id}
              lesson={l}
              isCurrent={l.id === currentLessonId}
              onShow={() => onShow(l)}
              onDelete={() => onDelete(l)}
              onPairs={() => onPairs(l)}
              named={namedCounts[l.id] ?? 0}
            />
          ))}
        </ul>
      </section>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Your lessons</h2>
          <p className="text-xs text-slate-500">Plan ahead, then put a lesson on the projector when class starts.</p>
        </div>
        <button
          type="button"
          onClick={onPlan}
          className="shrink-0 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold cursor-pointer"
        >
          ＋ Plan a lesson
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
          Couldn't load lessons: {error}
        </p>
      )}
      {loading && lessons.length === 0 && <p className="text-sm text-slate-400">Loading lessons…</p>}
      {!loading && !error && lessons.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800">
          <span className="text-5xl block mb-3">📋</span>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">No lessons yet</h3>
          <p className="text-xs text-slate-400 mt-1">Plan your first lesson to get a class QR code.</p>
        </div>
      )}

      {section('Today & upcoming', upcoming)}
      {section('Past', past)}
    </div>
  );
};
