import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Student } from '../../types';
import {
  checkRows, describeClassEdit, nextIndexNumber, readPaste, suggestShortName,
  type ClassEditRow, type ColumnRole, type DraftRow, type RowCheck,
} from '../../utils/classList';
import { deleteStudent, renumberStudents, saveClassList, updateStudent } from '../../services/studentService';
import { classKey } from '../../utils/classGroups';
import { Modal } from './StudentManageDialogs';

// One class on the Student Dashboard as a table (#181). Saved students are
// locked, so a stray click changes nothing: "Edit" unlocks the whole table,
// and "Save changes…" lists every change in a popup to confirm. New students are added in rows, typed or
// pasted from Excel, and nothing is written until "Save N students"; if that
// would also change saved students, a popup lists them first. The rules
// (matching, the Short Name guess, reading a paste) are in utils/classList.ts.

interface Draft extends DraftRow {
  key: number;
}

/** The last paste, kept so a wrong guess about a column can be corrected. */
interface Paste {
  text: string;
  roles: ColumnRole[];
  firstIndex: number;
  keys: number[];
  samples: string[];
}

const ROLE_LABEL: Record<ColumnRole, string> = {
  index: 'Index',
  name: 'Full name',
  shortName: 'Short Name',
  ignore: 'Ignore',
};

const cell =
  'w-full px-2 py-1.5 text-sm rounded-md border border-transparent bg-transparent text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-zinc-800';

const editCell =
  'w-full px-2 py-1.5 text-sm rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:italic focus:outline-none focus:border-blue-400';

const secondaryButton =
  'flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors';
const primaryButton =
  'flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium';

let nextKey = 1;

const ClassStudentTable: React.FC<{
  teacherId: string;
  className: string;
  /** The students in this class. */
  students: Student[];
  /** All the teacher's students, so a row can find a student saved without a class. */
  allStudents: Student[];
  /** A class the teacher has just started: the table opens with one empty row. */
  startEmpty?: boolean;
  onOpenStudent: (s: Student) => void;
  onSaved: () => void;
  onUnsavedChange: (unsaved: boolean) => void;
}> = ({ teacherId, className, students, allStudents, startEmpty, onOpenStudent, onSaved, onUnsavedChange }) => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [paste, setPaste] = useState<Paste | null>(null);
  const [pasteBox, setPasteBox] = useState(false);
  const [editRows, setEditRows] = useState<ClassEditRow[] | null>(null);
  const [confirmingEdit, setConfirmingEdit] = useState(false);
  // Deleting the whole class (#191): only from edit mode, and the class name is typed to confirm
  const [deletingClass, setDeletingClass] = useState(false);
  const [typedClass, setTypedClass] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const focusKey = useRef<number | null>(null);
  const nameInputs = useRef(new Map<number, HTMLInputElement>());

  const sorted = useMemo(
    () => [...students].sort((a, b) => a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true })),
    [students],
  );
  const firstFreeIndex = (rows: Draft[]) =>
    nextIndexNumber([...students.map(s => s.indexNumber), ...rows.map(d => d.indexNumber)]);
  const emptyRow = (rows: Draft[]): Draft =>
    ({ key: nextKey++, indexNumber: String(firstFreeIndex(rows)), name: '', shortName: '', shortNameGuessed: true });

  useEffect(() => {
    if (startEmpty) addRow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A row with nothing typed but its index number is not a student yet
  const filled = drafts.filter(d => d.name.trim() || d.shortName.trim());
  const result = useMemo(
    () => checkRows(filled, { studentClass: className, existing: allStudents }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filled), className, allStudents],
  );
  const checkOf = new Map<number, RowCheck>(filled.map((d, i) => [d.key, result.checks[i]]));
  const updates = result.checks.flatMap(c => (c.kind === 'update' ? [c] : []));
  const toSave = result.toAdd.length + result.toUpdate.length;
  const problems = result.checks.filter(c => c.kind === 'problem').length;
  const edit = useMemo(() => (editRows ? describeClassEdit(students, editRows) : null), [editRows, students]);
  const editProblems = edit ? Object.keys(edit.problems).length : 0;
  const unsaved = filled.length > 0 || !!edit?.changes.length;

  useEffect(() => onUnsavedChange(unsaved), [unsaved, onUnsavedChange]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onUnsavedChange(false), []);

  useEffect(() => {
    if (focusKey.current === null) return;
    nameInputs.current.get(focusKey.current)?.focus();
    focusKey.current = null;
  });

  function addRow() {
    const row = emptyRow(drafts);
    focusKey.current = row.key;
    setDrafts([...drafts, row]);
  }

  const change = (key: number, patch: Partial<DraftRow>) =>
    setDrafts(rows => rows.map(d => {
      if (d.key !== key) return d;
      const next = { ...d, ...patch };
      // The Short Name follows the full name until the teacher types their own
      if (patch.name !== undefined && d.shortNameGuessed) next.shortName = suggestShortName(patch.name);
      if (patch.shortName !== undefined) next.shortNameGuessed = false;
      return next;
    }));

  const remove = (key: number) => setDrafts(rows => rows.filter(d => d.key !== key));

  const applyPaste = (text: string, roles?: ColumnRole[], replacing?: Paste) => {
    // Empty rows give way to the pasted ones; a corrected paste replaces its own rows
    const kept = drafts.filter(d => !replacing?.keys.includes(d.key) && (d.name.trim() || d.shortName.trim()));
    const firstIndex = replacing?.firstIndex ?? firstFreeIndex(kept);
    const read = readPaste(text, { firstIndex, roles });
    const added = read.rows.map(r => ({ ...r, key: nextKey++ }));
    const firstLine = text.split(/\r?\n/).find(l => l.trim()) ?? '';
    setPaste(read.roles.length > 1
      ? { text, roles: read.roles, firstIndex, keys: added.map(d => d.key), samples: firstLine.split('\t') }
      : null);
    setDrafts([...kept, ...added]);
    setPasteBox(false);
  };

  const onPasteInto = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (!/[\n\t]/.test(text.trim())) return; // one name: an ordinary paste into the box
    e.preventDefault();
    applyPaste(text);
  };

  const pasteFromExcel = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) return applyPaste(text);
    } catch { /* no clipboard access: paste into the box instead */ }
    setPasteBox(true);
  };

  const onKeyDown = (e: React.KeyboardEvent, key: number, lastColumn: boolean) => {
    const isLast = drafts[drafts.length - 1]?.key === key;
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && lastColumn && isLast)) {
      e.preventDefault();
      addRow();
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    const { failed } = await saveClassList(teacherId, result);
    setSaving(false);
    setConfirmingSave(false);
    if (failed) setMessage(`${failed} didn’t save. Please try again.`);
    else {
      setDrafts([]);
      setPaste(null);
    }
    onSaved();
  };

  // Saved students without a Short Name: the guess for each, confirmed in a popup before saving
  const missing = sorted.filter(s => !s.shortName);
  const saveSuggested = async () => {
    setSaving(true);
    const { failed } = await saveClassList(teacherId, {
      toAdd: [],
      toUpdate: missing.map(s => ({
        id: s.id, indexNumber: s.indexNumber, name: s.name, shortName: suggestShortName(s.name), studentClass: s.class ?? className,
      })),
    });
    setSaving(false);
    setSuggesting(false);
    if (failed) setMessage(`${failed} Short Name${failed !== 1 ? 's' : ''} didn’t save. Please try again.`);
    onSaved();
  };

  const nameOf = (id: string) => allStudents.find(s => s.id === id)?.name ?? '';

  // Editing the saved students: the whole table unlocks, and nothing is
  // written until the teacher confirms the list of changes
  const startEditing = () => {
    setMessage('');
    setEditRows(sorted.map(s => ({ id: s.id, indexNumber: s.indexNumber, name: s.name, shortName: s.shortName ?? '' })));
  };
  const changeSaved = (id: string, patch: Partial<ClassEditRow>) =>
    setEditRows(rows => rows && rows.map(r => (r.id === id ? { ...r, ...patch } : r)));

  // Each student goes as they do one at a time (gradings, graded videos). Any
  // that fail stay, so the class stays with them and the teacher can try again.
  const deleteClass = async () => {
    setSaving(true);
    let failed = 0;
    for (const st of students) if (!(await deleteStudent(st.id))) failed++;
    setSaving(false);
    setDeletingClass(false);
    if (failed) setMessage(`${failed} student${failed !== 1 ? 's' : ''} couldn’t be deleted. Try again.`);
    else setEditRows(null);
    onSaved();
  };

  const saveEdit = async () => {
    if (!edit || !editRows) return;
    setSaving(true);
    setMessage('');
    // Index numbers first, all together, so a swap never clashes halfway
    if (!(await renumberStudents(edit.moves))) {
      setSaving(false);
      setConfirmingEdit(false);
      setMessage('The index numbers didn’t save. Please try again.');
      return;
    }
    let failed = 0;
    for (const { id } of edit.changes) {
      const row = editRows.find(r => r.id === id);
      const before = students.find(s => s.id === id);
      if (!row || !before) continue;
      if (row.name.trim() === before.name && row.shortName.trim() === (before.shortName ?? '')) continue;
      const saved = await updateStudent(id, {
        indexNumber: row.indexNumber.trim(), name: row.name.trim(), studentClass: before.class ?? className, shortName: row.shortName,
      });
      if (!saved || saved === 'duplicate') failed++;
    }
    setSaving(false);
    setConfirmingEdit(false);
    if (failed) setMessage(`${failed} didn’t save. Please try again.`);
    else setEditRows(null);
    onSaved();
  };

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-zinc-900 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <tr>
            <th className="text-left font-semibold px-3 py-2 w-20">Index</th>
            <th className="text-left font-semibold px-3 py-2">Full name</th>
            <th className="text-left font-semibold px-3 py-2 w-40">Short Name</th>
            <th className="w-40" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => {
            const skillCount = Object.keys(s.progressSummary ?? {}).length;
            const row = editRows?.find(r => r.id === s.id);
            if (row) {
              const problem = edit?.problems[s.id];
              const changed = edit?.changes.some(c => c.id === s.id);
              const tint = problem ? 'bg-red-50/70 dark:bg-red-900/10' : changed ? 'bg-amber-50/70 dark:bg-amber-900/10' : '';
              return (
                <tr key={s.id} className={`border-t border-slate-100 dark:border-zinc-800 ${tint}`}>
                  <td className="px-1 py-1">
                    <input className={editCell} aria-label={`Index number of ${s.name}`} inputMode="numeric" value={row.indexNumber}
                      onChange={e => changeSaved(s.id, { indexNumber: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <input className={editCell} aria-label={`Full name of ${s.name}`} value={row.name}
                      onChange={e => changeSaved(s.id, { name: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <input className={editCell} aria-label={`Short Name of ${s.name}`} value={row.shortName} placeholder={suggestShortName(row.name)}
                      onChange={e => changeSaved(s.id, { shortName: e.target.value })} />
                  </td>
                  <td className="px-2 py-1 text-xs text-right">
                    {problem
                      ? <span className="text-red-600 dark:text-red-400">{problem}</span>
                      : changed && <span className="text-amber-700 dark:text-amber-400">changed</span>}
                  </td>
                </tr>
              );
            }
            return (
              // The whole row opens the student's analysis history
              <tr
                key={s.id}
                onClick={() => onOpenStudent(s)}
                title={`Open ${s.name}’s analysis history`}
                className="group border-t border-slate-100 dark:border-zinc-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
              >
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{s.indexNumber}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={e => { e.stopPropagation(); onOpenStudent(s); }}
                    className="font-medium text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 text-left"
                  >
                    {s.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                  {s.shortName || (
                    <span className="text-slate-400 dark:text-slate-500 italic" title="Not set yet: pupil devices show this guess">
                      {suggestShortName(s.name)}?
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {skillCount > 0 && (
                    <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      {skillCount} skill{skillCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}

          {drafts.map((d, i) => {
            const check = checkOf.get(d.key);
            const tint = check?.kind === 'problem' ? 'bg-red-50/70 dark:bg-red-900/10' : 'bg-blue-50/60 dark:bg-blue-900/10';
            return (
              <tr key={d.key} className={`border-t border-slate-100 dark:border-zinc-800 ${tint}`}>
                <td className="px-1 py-1">
                  <input className={cell} aria-label="Index number" inputMode="numeric" value={d.indexNumber}
                    onChange={e => change(d.key, { indexNumber: e.target.value })} onKeyDown={e => onKeyDown(e, d.key, false)} onPaste={onPasteInto} />
                </td>
                <td className="px-1 py-1">
                  <input className={cell} aria-label="Full name" placeholder={i === 0 ? 'Type a name, or paste from Excel' : 'Full name'} value={d.name}
                    ref={el => { if (el) nameInputs.current.set(d.key, el); else nameInputs.current.delete(d.key); }}
                    onChange={e => change(d.key, { name: e.target.value })} onKeyDown={e => onKeyDown(e, d.key, false)} onPaste={onPasteInto} />
                </td>
                <td className="px-1 py-1">
                  <input className={`${cell} ${d.shortNameGuessed ? 'text-slate-500 dark:text-slate-400' : ''}`} aria-label="Short Name" value={d.shortName}
                    onChange={e => change(d.key, { shortName: e.target.value })} onKeyDown={e => onKeyDown(e, d.key, true)} onPaste={onPasteInto} />
                </td>
                <td className="px-2 py-1 text-xs">
                  <div className="flex items-center justify-end gap-2">
                    <RowStatus check={check} className={className} />
                    <button onClick={() => remove(d.key)} aria-label="Remove this row" className="text-slate-400 hover:text-red-500 px-1">✕</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {paste && (
        <div className="border-t border-slate-100 dark:border-zinc-800 px-3 py-2 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
          <span>Pasted columns:</span>
          {paste.roles.map((role, c) => (
            <label key={c} className="flex items-center gap-1">
              <span className="italic truncate max-w-[8rem]">{paste.samples[c] || `column ${c + 1}`}</span>
              <select
                className="rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1 py-0.5"
                value={role}
                onChange={e => {
                  const roles = paste.roles.map((r, j) => (j === c ? e.target.value as ColumnRole : r));
                  applyPaste(paste.text, roles, paste);
                }}
              >
                {(Object.keys(ROLE_LABEL) as ColumnRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {pasteBox && (
        <div className="border-t border-slate-100 dark:border-zinc-800 p-3">
          <textarea
            autoFocus
            className="w-full h-20 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2"
            placeholder="Copy the rows in Excel, then paste them here (Ctrl+V)"
            onPaste={e => { e.preventDefault(); applyPaste(e.clipboardData.getData('text')); }}
          />
          <button onClick={() => setPasteBox(false)} className="text-xs text-slate-500 hover:underline">Cancel</button>
        </div>
      )}

      {editRows ? (
        <div className="border-t border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-amber-800 dark:text-amber-300 font-medium">Editing {className}</span>
          <button
            onClick={() => { setTypedClass(''); setDeletingClass(true); }}
            className="text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            🗑 Delete class
          </button>
          <div className="ml-auto flex items-center gap-3">
            {message && <span className="text-xs text-red-500">{message}</span>}
            {editProblems > 0 && <span className="text-xs text-red-500">{editProblems} row{editProblems !== 1 ? 's' : ''} to fix</span>}
            <button onClick={() => { setEditRows(null); setMessage(''); }} className="text-slate-500 dark:text-slate-400 hover:underline">Cancel</button>
            <button
              onClick={() => setConfirmingEdit(true)}
              disabled={saving || editProblems > 0 || !edit?.changes.length}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {edit?.changes.length ? 'Save changes…' : 'No changes'}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-100 dark:border-zinc-800 px-3 py-2 flex flex-wrap items-center gap-3 text-sm">
          <button onClick={addRow} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">+ Add students</button>
          <button onClick={pasteFromExcel} className="text-blue-600 dark:text-blue-400 hover:underline">Paste from Excel</button>
          {missing.length > 0 && (
            <button onClick={() => setSuggesting(true)} className="text-slate-500 dark:text-slate-400 hover:underline">
              Use suggested Short Names ({missing.length})
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {message && <span className="text-xs text-red-500">{message}</span>}
            {problems > 0 && <span className="text-xs text-red-500">{problems} row{problems !== 1 ? 's' : ''} to fix</span>}
            {toSave > 0 && (
              <button
                onClick={() => (updates.length ? setConfirmingSave(true) : save())}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'Saving…' : `Save ${toSave} student${toSave !== 1 ? 's' : ''}`}
              </button>
            )}
            {sorted.length > 0 && drafts.length === 0 && (
              <button onClick={startEditing} className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                ✎ Edit {className}
              </button>
            )}
          </div>
        </div>
      )}

      {confirmingEdit && edit && (
        <Modal onClose={() => setConfirmingEdit(false)}>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Change {className}?</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">You’re changing:</p>
          <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-100 space-y-1 max-h-60 overflow-y-auto">
            {edit.changes.map(c => <li key={c.id}><b>{c.name}</b>: {c.changes.join(', ')}</li>)}
          </ul>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setConfirmingEdit(false)} className={secondaryButton}>Back</button>
            <button onClick={saveEdit} disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Yes, change it'}</button>
          </div>
        </Modal>
      )}

      {deletingClass && (
        <Modal onClose={() => !saving && setDeletingClass(false)}>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Delete {className}?</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
            This deletes all <b>{students.length} student{students.length !== 1 ? 's' : ''}</b> in {className}, with their
            gradings and graded videos. Pairs’ work in the Review Tray stays. This can’t be undone.
          </p>
          <label className="block text-sm text-slate-600 dark:text-slate-300 mt-3">
            Type <b>{className}</b> to confirm
            <input
              value={typedClass}
              onChange={e => setTypedClass(e.target.value)}
              autoFocus
              className={`${editCell} mt-1`}
            />
          </label>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setDeletingClass(false)} disabled={saving} className={secondaryButton}>Back</button>
            <button
              onClick={deleteClass}
              disabled={saving || classKey(typedClass) !== classKey(className)}
              className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? 'Deleting…' : `Delete ${students.length} student${students.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {confirmingSave && (
        <Modal onClose={() => setConfirmingSave(false)}>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Change saved students?</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
            {result.toAdd.length > 0 && <>Adding {result.toAdd.length} new student{result.toAdd.length !== 1 ? 's' : ''}, and </>}
            changing {updates.length} already saved:
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-100 space-y-1 max-h-60 overflow-y-auto">
            {updates.map(u => <li key={u.id}><b>{nameOf(u.id)}</b>: {u.changes.join(', ')}</li>)}
          </ul>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setConfirmingSave(false)} className={secondaryButton}>Back</button>
            <button onClick={save} disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Yes, save'}</button>
          </div>
        </Modal>
      )}

      {suggesting && (
        <Modal onClose={() => setSuggesting(false)}>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
            Set {missing.length} Short Name{missing.length !== 1 ? 's' : ''}?
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">You’re setting:</p>
          <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-100 space-y-1 max-h-60 overflow-y-auto">
            {missing.map(s => <li key={s.id}>{s.name} → <b>{suggestShortName(s.name)}</b></li>)}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">You can change any of them afterwards with Edit.</p>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setSuggesting(false)} className={secondaryButton}>Cancel</button>
            <button onClick={saveSuggested} disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Yes, set them'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const RowStatus: React.FC<{ check?: RowCheck; className: string }> = ({ check, className }) => {
  if (!check) return null;
  if (check.kind === 'problem') return <span className="text-red-600 dark:text-red-400">{check.message}</span>;
  if (check.kind === 'same') return <span className="text-slate-400">already saved</span>;
  if (check.kind === 'update') return <span className="text-amber-700 dark:text-amber-400" title={check.changes.join('\n')}>already in {className}: {check.changes.join(', ')}</span>;
  return <span className="text-blue-600 dark:text-blue-400">new</span>;
};

export default ClassStudentTable;
