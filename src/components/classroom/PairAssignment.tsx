import React, { useMemo, useState } from 'react';
import { Student } from '../../types';
import { Lesson, lessonTitle } from '../../services/lessonService';
import { getOrCreateStudent } from '../../services/studentService';
import { PairSlot, Performer, copyPairs, sameClass, setPairSlot, slotKey } from '../../services/pairService';

const inputClass =
  'w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500';

const PERFORMERS: { key: Performer; label: string; icon: string }[] = [
  { key: 'apple', label: 'Apple', icon: '🍎' },
  { key: 'banana', label: 'Banana', icon: '🍌' },
];

const byIndex = (a: Student, b: Student) =>
  a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true }) || a.name.localeCompare(b.name);

interface Props {
  lesson: Lesson;
  lessons: Lesson[];
  students: Student[];
  slots: PairSlot[];
  teacherId?: string;
  onSlotsChanged: () => Promise<void>;
  onStudentAdded: (s: Student) => void;
  onBack: () => void;
}

/**
 * Name the pupils in each pair before the lesson. Their Practice Station work
 * is then filed under their own student record.
 */
export const PairAssignment: React.FC<Props> = ({
  lesson, lessons, students, slots, teacherId, onSlotsChanged, onStudentAdded, onBack,
}) => {
  const [busy, setBusy] = useState<string | null>(null);   // slot key being saved, or 'copy'
  const [error, setError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ indexNumber: '', name: '' });
  const [adding, setAdding] = useState(false);

  const classRoster = useMemo(() => students.filter(s => sameClass(s.class, lesson.className)).sort(byIndex), [students, lesson.className]);
  const others = useMemo(() => students.filter(s => !sameClass(s.class, lesson.className)).sort(byIndex), [students, lesson.className]);

  const mine = slots.filter(s => s.lessonId === lesson.id);
  const bySlot = new Map(mine.map(s => [slotKey(s.lessonId, s.pairNumber, s.performer), s.studentId]));
  const pairOf = new Map(mine.map(s => [s.studentId, s.pairNumber]));
  const unpaired = classRoster.filter(s => !pairOf.has(s.id));

  // The most recent other lesson for this class that has pairs set
  const copySource = lessons
    .filter(l => l.id !== lesson.id && sameClass(l.className, lesson.className) && slots.some(s => s.lessonId === l.id))
    .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate))[0];

  const assign = async (pairNumber: number, performer: Performer, studentId: string | null) => {
    const key = slotKey(lesson.id, pairNumber, performer);
    setBusy(key);
    setError(null);
    const ok = await setPairSlot(lesson.id, pairNumber, performer, studentId);
    if (!ok) setError('Couldn’t save that change. Check your connection and try again.');
    await onSlotsChanged();
    setBusy(null);
  };

  const copy = async () => {
    if (!copySource) return;
    if (mine.length && !window.confirm(`Replace this lesson's pairs with the ones from ${lessonTitle(copySource)}?`)) return;
    setBusy('copy');
    setError(null);
    const ok = await copyPairs(copySource.id, lesson.id, lesson.pairCount);
    if (!ok) setError('Couldn’t copy the pairs. Please try again.');
    await onSlotsChanged();
    setBusy(null);
  };

  const addPupil = async () => {
    const indexNumber = addForm.indexNumber.trim();
    const name = addForm.name.trim();
    if (!indexNumber || !name || !teacherId) return;
    setAdding(true);
    setError(null);
    const s = await getOrCreateStudent(teacherId, { indexNumber, name, studentClass: lesson.className });
    setAdding(false);
    if (!s) return setError('Couldn’t add that pupil. Please try again.');
    onStudentAdded(s);
    setAddForm({ indexNumber: '', name: '' });
  };

  const option = (s: Student, thisPair: number) => {
    const inPair = pairOf.get(s.id);
    return (
      <option key={s.id} value={s.id}>
        #{s.indexNumber} {s.name}{inPair && inPair !== thisPair ? ` (in Pair ${inPair})` : ''}
      </option>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white mb-1 cursor-pointer">
            ← Your lessons
          </button>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Pairs · {lessonTitle(lesson)}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {lesson.skillName} · {mine.length} of {lesson.pairCount * 2} places named. Each pupil’s Practice Station work goes to their own record.
          </p>
        </div>
        {copySource && (
          <button
            type="button"
            onClick={copy}
            disabled={busy !== null}
            className="shrink-0 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            {busy === 'copy' ? 'Copying…' : `Copy pairs from ${lessonTitle(copySource)}`}
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}

      {classRoster.length === 0 && (
        <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-300">
          No students in class {lesson.className} yet. Add them below, or give existing students the class “{lesson.className}” in the Student Dashboard.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {Array.from({ length: lesson.pairCount }, (_, i) => i + 1).map(n => (
          <li key={n} className="p-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="w-16 shrink-0 font-extrabold text-sm text-slate-800 dark:text-white">Pair {n}</span>
            {PERFORMERS.map(p => {
              const key = slotKey(lesson.id, n, p.key);
              const current = bySlot.get(key) ?? '';
              return (
                <label key={p.key} className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-lg" title={p.label} aria-hidden>{p.icon}</span>
                  <select
                    aria-label={`Pair ${n} ${p.label}`}
                    value={current}
                    disabled={busy !== null}
                    onChange={e => assign(n, p.key, e.target.value || null)}
                    className={`${inputClass} ${busy === key ? 'opacity-60' : ''}`}
                  >
                    <option value="">{p.label} — not named</option>
                    {classRoster.length > 0 && <optgroup label={`Class ${lesson.className}`}>{classRoster.map(s => option(s, n))}</optgroup>}
                    {others.length > 0 && <optgroup label="Other classes">{others.map(s => option(s, n))}</optgroup>}
                  </select>
                </label>
              );
            })}
          </li>
        ))}
      </ul>

      {unpaired.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Not in a pair yet ({unpaired.length})</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{unpaired.map(s => s.name).join(', ')}</p>
        </div>
      )}

      <form
        onSubmit={e => { e.preventDefault(); addPupil(); }}
        className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row sm:items-end gap-2"
      >
        <label className="flex flex-col gap-1 sm:w-28">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Index no.</span>
          <input className={inputClass} value={addForm.indexNumber} onChange={e => setAddForm(f => ({ ...f, indexNumber: e.target.value }))} placeholder="e.g. 18" />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Name</span>
          <input className={inputClass} value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Melvin" />
        </label>
        <button
          type="submit"
          disabled={adding || !addForm.indexNumber.trim() || !addForm.name.trim()}
          className="shrink-0 px-4 py-2 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-50 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          {adding ? 'Adding…' : `＋ Add to ${lesson.className}`}
        </button>
      </form>
    </div>
  );
};
