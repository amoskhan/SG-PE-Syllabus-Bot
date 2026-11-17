import React, { useMemo, useState } from 'react';
import { Student } from '../../types';
import { Lesson, MAX_PAIR_COUNT, lessonTitle } from '../../services/lessonService';
import { getOrCreateStudent } from '../../services/studentService';
import { PairSlot, Performer, copyPairs, sameClass, setPairSlot } from '../../services/pairService';
import { nextPairNumber, pairCountFor, pairsOf } from '../../utils/pairForming';
import { shortNameOf } from '../../utils/classList';

const inputClass =
  'w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500';

const byIndex = (a: Student, b: Student) =>
  a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true }) || a.name.localeCompare(b.name);

interface Props {
  lesson: Lesson;
  lessons: Lesson[];
  students: Student[];
  slots: PairSlot[];
  teacherId?: string;
  /** Reload every pair slot; resolves to the fresh list. */
  onSlotsChanged: () => Promise<PairSlot[]>;
  /** The lesson's pair count follows the pairs formed (#187). */
  onPairCount: (pairCount: number) => Promise<void>;
  onStudentAdded: (s: Student) => void;
  onBack: () => void;
}

/** Where the next tapped name goes: a new pair, or the empty place of a pair with one name. */
type Target = { pairNumber: number; performer: Performer } | null;

/**
 * Form the lesson's pairs (#187): tap one name, then their partner, and they
 * become the next pair (the first tapped is Apple). ⇄ swaps Apple and Banana,
 * ✕ splits a pair. Each pupil's Practice Station work goes to their own record.
 */
export const PairAssignment: React.FC<Props> = ({
  lesson, lessons, students, slots, teacherId, onSlotsChanged, onPairCount, onStudentAdded, onBack,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [first, setFirst] = useState<string | null>(null); // the name tapped first, waiting for a partner
  const [target, setTarget] = useState<Target>(null);
  const [addForm, setAddForm] = useState({ indexNumber: '', name: '' });
  const [adding, setAdding] = useState(false);

  const pairs = pairsOf(slots, lesson.id);
  const paired = new Set(pairs.flatMap(p => [p.apple, p.banana]).filter(Boolean));
  const studentById = new Map<string, Student>(students.map(s => [s.id, s]));
  const classRoster = useMemo(() => students.filter(s => sameClass(s.class, lesson.className)).sort(byIndex), [students, lesson.className]);
  const others = useMemo(() => students.filter(s => !sameClass(s.class, lesson.className)).sort(byIndex), [students, lesson.className]);
  const unpaired = classRoster.filter(s => !paired.has(s.id));
  const unpairedOthers = others.filter(s => !paired.has(s.id));

  // The most recent other lesson for this class that has pairs set
  const copySource = lessons
    .filter(l => l.id !== lesson.id && sameClass(l.className, lesson.className) && slots.some(s => s.lessonId === l.id))
    .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate))[0];

  /** Save some slot changes, in order, then make the pair count follow the pairs. */
  const run = async (changes: [number, Performer, string | null][]) => {
    setBusy(true);
    setError(null);
    for (const [n, performer, studentId] of changes) {
      if (!(await setPairSlot(lesson.id, n, performer, studentId))) {
        setError('Couldn’t save that change. Check your connection and try again.');
        break;
      }
    }
    await syncCount(await onSlotsChanged());
    setBusy(false);
  };

  const syncCount = async (fresh: PairSlot[]) => {
    const count = pairCountFor(pairsOf(fresh, lesson.id));
    if (count !== lesson.pairCount) await onPairCount(count);
  };

  const tapName = (id: string) => {
    if (busy) return;
    if (target) {
      setTarget(null);
      return run([[target.pairNumber, target.performer, id]]);
    }
    if (!first) return setFirst(id);
    if (first === id) return setFirst(null); // tapped again: never mind
    const n = nextPairNumber(pairs);
    if (n > MAX_PAIR_COUNT) return setError(`A lesson can have up to ${MAX_PAIR_COUNT} pairs.`);
    setFirst(null);
    return run([[n, 'apple', first], [n, 'banana', id]]);
  };

  const swap = (n: number, apple?: string, banana?: string) =>
    run([[n, 'apple', banana ?? null], [n, 'banana', apple ?? null]]);
  const split = (n: number) => run([[n, 'apple', null], [n, 'banana', null]]);

  const copy = async () => {
    if (!copySource) return;
    if (pairs.length && !window.confirm(`Replace this lesson's pairs with the ones from ${lessonTitle(copySource)}?`)) return;
    setBusy(true);
    setError(null);
    if (!(await copyPairs(copySource.id, lesson.id, MAX_PAIR_COUNT))) setError('Couldn’t copy the pairs. Please try again.');
    await syncCount(await onSlotsChanged());
    setBusy(false);
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

  const nameOf = (id?: string) => {
    const s = id ? studentById.get(id) : undefined;
    return s ? shortNameOf(s) : '';
  };

  const chip = (s: Student) => (
    <button
      key={s.id}
      type="button"
      disabled={busy}
      onClick={() => tapName(s.id)}
      title={s.name}
      className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer disabled:opacity-60 ${
        first === s.id
          ? 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-200 dark:ring-indigo-900'
          : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-slate-100 hover:border-indigo-400'
      }`}
    >
      {first === s.id && '🍎 '}{shortNameOf(s)}
      <span className="ml-1.5 text-[10px] font-semibold opacity-60">#{s.indexNumber}</span>
    </button>
  );

  const prompt = target
    ? `Tap a name for Pair ${target.pairNumber}’s ${target.performer === 'apple' ? '🍎 Apple' : '🍌 Banana'}.`
    : first
    ? `Now tap ${nameOf(first)}’s partner.`
    : 'Tap one name, then their partner. The first one is Apple.';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white mb-1 cursor-pointer">
            ← Your lessons
          </button>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Pairs · {lessonTitle(lesson)}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {lesson.skillName} · {pairs.length} pair{pairs.length === 1 ? '' : 's'} · {classRoster.length - unpaired.length} of {classRoster.length} in {lesson.className} paired
          </p>
        </div>
        {copySource && (
          <button
            type="button"
            onClick={copy}
            disabled={busy}
            className="shrink-0 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Copy pairs from {lessonTitle(copySource)}
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}

      <section className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{prompt}</p>
          {(first || target) && (
            <button type="button" onClick={() => { setFirst(null); setTarget(null); }} className="text-xs font-bold text-slate-500 hover:underline cursor-pointer">
              Cancel
            </button>
          )}
        </div>
        {classRoster.length === 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            No students in class {lesson.className} yet. Add them below, or on the Student Dashboard.
          </p>
        ) : unpaired.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">Everyone in {lesson.className} is in a pair. ✓</p>
        ) : (
          <div className="flex flex-wrap gap-2">{unpaired.map(chip)}</div>
        )}
        {unpairedOthers.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs font-bold text-slate-500 cursor-pointer select-none">Students from other classes ({unpairedOthers.length})</summary>
            <div className="flex flex-wrap gap-2 mt-2">{unpairedOthers.map(chip)}</div>
          </details>
        )}
      </section>

      {pairs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pairs.map(p => (
            <li key={p.pairNumber} className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-3">
              <span className="w-14 shrink-0 font-extrabold text-sm text-slate-500 dark:text-slate-400">Pair {p.pairNumber}</span>
              {(['apple', 'banana'] as const).map(performer => (
                <span key={performer} className="flex-1 min-w-0 flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white">
                  <span aria-hidden>{performer === 'apple' ? '🍎' : '🍌'}</span>
                  {p[performer] ? (
                    <span className="truncate" title={studentById.get(p[performer]!)?.name}>{nameOf(p[performer])}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setFirst(null); setTarget({ pairNumber: p.pairNumber, performer }); }}
                      className={`px-2 py-0.5 rounded-lg border border-dashed text-xs cursor-pointer ${
                        target?.pairNumber === p.pairNumber && target.performer === performer
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-slate-300 dark:border-zinc-600 text-slate-400'
                      }`}
                    >
                      ＋ add
                    </button>
                  )}
                </span>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => swap(p.pairNumber, p.apple, p.banana)}
                title="Swap Apple and Banana"
                aria-label={`Swap Apple and Banana in Pair ${p.pairNumber}`}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-sm cursor-pointer disabled:opacity-50"
              >
                ⇄
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => split(p.pairNumber)}
                title="Split this pair"
                aria-label={`Split Pair ${p.pairNumber}`}
                className="px-2.5 py-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 text-sm cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
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
