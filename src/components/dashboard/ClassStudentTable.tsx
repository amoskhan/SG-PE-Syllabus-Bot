import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Student } from '../../types';
import {
  checkRows, nextIndexNumber, readPaste, suggestShortName,
  type ColumnRole, type DraftRow, type RowCheck,
} from '../../utils/classList';
import { saveClassList } from '../../services/studentService';

// One class on the Student Dashboard as a table (#181): its students, with
// their Short Names editable in place, and rows to add more by typing or by
// pasting from Excel. Nothing is written until "Save N students". The rules
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
  const [shortEdits, setShortEdits] = useState<Record<string, string>>({});
  const [paste, setPaste] = useState<Paste | null>(null);
  const [pasteBox, setPasteBox] = useState(false);
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

  // Typing fills the table; a row with nothing typed but its index number is not a student yet
  const filled = drafts.filter(d => d.name.trim() || d.shortName.trim());
  // A Short Name typed over an existing student's (clearing one is done on their profile)
  const isEdited = (s: Student) => !!shortEdits[s.id]?.trim() && shortEdits[s.id].trim() !== (s.shortName ?? '');
  const editedRows: DraftRow[] = sorted
    .filter(isEdited)
    .map(s => ({ indexNumber: s.indexNumber, name: s.name, shortName: shortEdits[s.id] }));
  const result = useMemo(
    () => checkRows([...editedRows, ...filled], { studentClass: className, existing: allStudents }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(editedRows), JSON.stringify(filled), className, allStudents],
  );
  const checkOf = new Map<number, RowCheck>(filled.map((d, i) => [d.key, result.checks[editedRows.length + i]]));
  const toSave = result.toAdd.length + result.toUpdate.length;
  const problems = result.checks.filter(c => c.kind === 'problem').length;
  const unsaved = filled.length > 0 || editedRows.length > 0;

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

  const useSuggested = () =>
    setShortEdits(edits => {
      const next = { ...edits };
      for (const s of sorted) if (!s.shortName && next[s.id] === undefined) next[s.id] = suggestShortName(s.name);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setMessage('');
    const { failed } = await saveClassList(teacherId, result);
    setSaving(false);
    if (failed) setMessage(`${failed} didn’t save. Please try again.`);
    else {
      setDrafts([]);
      setShortEdits({});
      setPaste(null);
    }
    onSaved();
  };

  const missingShortNames = sorted.filter(s => !s.shortName && shortEdits[s.id] === undefined).length;

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
            const edited = isEdited(s);
            return (
              <tr key={s.id} className={`border-t border-slate-100 dark:border-zinc-800 ${edited ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                <td className="px-3 py-1.5 text-slate-400 dark:text-slate-500">#{s.indexNumber}</td>
                <td className="px-3 py-1.5">
                  <button onClick={() => onOpenStudent(s)} className="font-medium text-slate-800 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left">
                    {s.name}
                  </button>
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cell}
                    aria-label={`Short Name for ${s.name}`}
                    value={shortEdits[s.id] ?? s.shortName ?? ''}
                    placeholder={suggestShortName(s.name)}
                    onChange={e => setShortEdits(edits => ({ ...edits, [s.id]: e.target.value }))}
                  />
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-slate-400 dark:text-slate-500">
                  {edited ? 'not saved' : skillCount > 0 && (
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

      <div className="border-t border-slate-100 dark:border-zinc-800 px-3 py-2 flex flex-wrap items-center gap-3 text-sm">
        <button onClick={addRow} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">+ Add students</button>
        <button onClick={pasteFromExcel} className="text-blue-600 dark:text-blue-400 hover:underline">Paste from Excel</button>
        {missingShortNames > 0 && (
          <button onClick={useSuggested} className="text-slate-500 dark:text-slate-400 hover:underline">
            Use suggested Short Names ({missingShortNames})
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {message && <span className="text-xs text-red-500">{message}</span>}
          {problems > 0 && <span className="text-xs text-red-500">{problems} row{problems !== 1 ? 's' : ''} to fix</span>}
          {toSave > 0 && (
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {saving ? 'Saving…' : `Save ${toSave} student${toSave !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
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
