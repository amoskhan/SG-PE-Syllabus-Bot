import React, { useState } from 'react';
import { Student } from '../../types';
import { updateStudent, deleteStudent, renumberStudents } from '../../services/studentService';
import { describeStudentEdit, suggestShortName } from '../../utils/classList';

const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

// ─── Edit ─────────────────────────────────────────────────────────────────────

/**
 * Edit one saved student. Saving first shows what will change and asks the
 * teacher to confirm, so nothing changes by a slip. Given the student's
 * classmates, choosing an index number one of them has offers a swap.
 */
export const EditStudentModal: React.FC<{
  student: Student;
  /** The students in the same class, to offer a swap of index numbers. */
  classmates?: Student[];
  onClose: () => void;
  onSaved: (s: Student) => void;
}> = ({ student, classmates = [], onClose, onSaved }) => {
  const [form, setForm] = useState({
    indexNumber: student.indexNumber,
    name: student.name,
    studentClass: student.class ?? '',
    shortName: student.shortName ?? '',
  });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const edit = describeStudentEdit(student, form, classmates);

  const save = async () => {
    setSaving(true);
    setError('');
    // A swap moves both students in one go, so neither number is ever held twice
    if (edit.swapWith && !(await renumberStudents([
      { id: student.id, indexNumber: form.indexNumber.trim() },
      { id: edit.swapWith.id, indexNumber: student.indexNumber },
    ]))) {
      setSaving(false);
      return setError('Couldn’t swap the index numbers. Please try again.');
    }
    const result = await updateStudent(student.id, {
      indexNumber: form.indexNumber.trim(), name: form.name.trim(), studentClass: form.studentClass.trim(), shortName: form.shortName,
    });
    setSaving(false);
    if (result === 'duplicate') return setError(`Another student in this class already has index number ${form.indexNumber.trim()}.`);
    if (!result) return setError('Couldn’t save. Please try again.');
    onSaved(result);
  };

  if (confirming) {
    return (
      <Modal onClose={onClose}>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Change {student.name}?</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">You’re changing:</p>
        <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-100 space-y-1">
          {edit.changes.map(c => <li key={c}>{c}</li>)}
        </ul>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Back
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? 'Saving…' : 'Yes, change it'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Edit Student</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Index Number *</label>
          <input className={inputClass} inputMode="numeric" value={form.indexNumber} onChange={e => setForm(f => ({ ...f, indexNumber: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Full name *</label>
          <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Short Name</label>
          <input className={inputClass} placeholder={suggestShortName(form.name) || 'e.g. Aisha'} value={form.shortName} onChange={e => setForm(f => ({ ...f, shortName: e.target.value }))} />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">What the student is called day to day. Pupil devices show only this name.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Class</label>
          <input className={inputClass} placeholder="e.g. 3A" value={form.studentClass} onChange={e => setForm(f => ({ ...f, studentClass: e.target.value }))} />
        </div>
        {edit.problem && <p className="text-xs text-red-500">{edit.problem}</p>}
      </div>
      <div className="flex gap-2 mt-5">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => setConfirming(true)}
          disabled={!!edit.problem || edit.changes.length === 0}
          className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
        >
          {edit.changes.length === 0 ? 'No changes' : 'Save…'}
        </button>
      </div>
    </Modal>
  );
};

// ─── Delete ───────────────────────────────────────────────────────────────────

export const DeleteStudentModal: React.FC<{
  student: Student;
  gradingCount: number;
  onClose: () => void;
  onDeleted: (id: string) => void;
}> = ({ student, gradingCount, onClose, onDeleted }) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setDeleting(true);
    setError('');
    const ok = await deleteStudent(student.id);
    setDeleting(false);
    if (!ok) return setError('Couldn’t delete. Please try again.');
    onDeleted(student.id);
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Delete {student.name}?</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        This permanently deletes #{student.indexNumber} {student.name}
        {gradingCount > 0
          ? `, their ${gradingCount} grading${gradingCount !== 1 ? 's' : ''}, the graded videos and their progress.`
          : ' and their progress.'}
      </p>
      <p className="text-sm font-medium text-red-600 dark:text-red-400 mt-2">This can’t be undone.</p>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <div className="flex gap-2 mt-5">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={remove}
          disabled={deleting}
          className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
        >
          {deleting ? 'Deleting…' : 'Delete student'}
        </button>
      </div>
    </Modal>
  );
};
