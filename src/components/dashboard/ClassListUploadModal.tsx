import React, { useMemo, useState } from 'react';
import { Student } from '../../types';
import { readClassList } from '../../utils/classList';
import { saveClassList } from '../../services/studentService';

const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

/** How many new or changed students the preview lists before "and N more". */
const MAX_LISTED = 10;

/**
 * Upload a whole class at once (#181): paste lines from a spreadsheet or pick
 * a CSV, check what will change, then save. The reading rules are in
 * readClassList (src/utils/classList.ts).
 */
const ClassListUploadModal: React.FC<{
  teacherId: string;
  students: Student[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ teacherId, students, onClose, onSaved }) => {
  const [text, setText] = useState('');
  const [defaultClass, setDefaultClass] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const result = useMemo(
    () => readClassList(text, { existing: students, defaultClass }),
    [text, students, defaultClass],
  );
  const toSave = result.toAdd.length + result.toUpdate.length;
  const byId = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setMessage('');
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    const { added, updated, failed } = await saveClassList(teacherId, result);
    setSaving(false);
    if (failed) {
      setMessage(`Saved ${added + updated} of ${toSave}. ${failed} didn’t save. Please try again.`);
      onSaved();
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">Upload class list</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          One student per line: <b>index number, full name, Short Name, class</b>. Copy the columns from a spreadsheet and paste them here, or choose a CSV file.
        </p>

        <div className="space-y-3">
          <textarea
            className={`${inputClass} font-mono h-40`}
            placeholder={'12\tNur Aisha binte Ahmad\tAisha\t4A\n13\tBala Krishnan\tBala\t4A'}
            value={text}
            onChange={e => { setText(e.target.value); setMessage(''); }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
              Choose a CSV file
              <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={e => pickFile(e.target.files?.[0])} />
            </label>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="class-list-default-class">Class for lines without one</label>
              <input id="class-list-default-class" className={`${inputClass} w-20`} placeholder="4A" value={defaultClass} onChange={e => setDefaultClass(e.target.value)} />
            </div>
          </div>

          {text.trim() && (
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 p-3 text-sm space-y-2">
              <p className="text-slate-700 dark:text-slate-200">
                <b>{result.toAdd.length}</b> new · <b>{result.toUpdate.length}</b> to update · {result.unchanged} already up to date
              </p>
              {result.toAdd.length > 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  <p className="font-medium">New</p>
                  <ul className="list-disc pl-5">
                    {result.toAdd.slice(0, MAX_LISTED).map(r => (
                      <li key={`${r.studentClass}#${r.indexNumber}`}>{r.studentClass} #{r.indexNumber} {r.name}{r.shortName ? ` (${r.shortName})` : ''}</li>
                    ))}
                    {result.toAdd.length > MAX_LISTED && <li>and {result.toAdd.length - MAX_LISTED} more</li>}
                  </ul>
                </div>
              )}
              {result.toUpdate.length > 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  <p className="font-medium">To update</p>
                  <ul className="list-disc pl-5">
                    {result.toUpdate.slice(0, MAX_LISTED).map(r => {
                      const before = byId.get(r.id);
                      const changes = [
                        before?.name !== r.name && `name ${before?.name} → ${r.name}`,
                        before?.shortName !== r.shortName && `Short Name ${before?.shortName || '(none)'} → ${r.shortName}`,
                        (before?.class ?? '') !== r.studentClass && `class ${before?.class || '(none)'} → ${r.studentClass}`,
                      ].filter(Boolean);
                      return <li key={r.id}>{r.studentClass} #{r.indexNumber}: {changes.join(', ')}</li>;
                    })}
                    {result.toUpdate.length > MAX_LISTED && <li>and {result.toUpdate.length - MAX_LISTED} more</li>}
                  </ul>
                </div>
              )}
              {result.problems.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  <p className="font-medium">These lines will be left out:</p>
                  <ul className="list-disc pl-5">
                    {result.problems.map(p => <li key={p.line}>Line {p.line}: {p.message}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {message && <p className="text-xs text-red-500">{message}</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || toSave === 0}
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? 'Saving…' : toSave ? `Save ${toSave} student${toSave !== 1 ? 's' : ''}` : 'Nothing to save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassListUploadModal;
