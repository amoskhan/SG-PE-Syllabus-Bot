import React, { useState } from 'react';
import { Student } from '../../types';
import { updateStudent, deleteStudent } from '../../services/studentService';

const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

// ─── Edit ─────────────────────────────────────────────────────────────────────

export const EditStudentModal: React.FC<{
  student: Student;
  onClose: () => void;
  onSaved: (s: Student) => void;
}> = ({ student, onClose, onSaved }) => {
  const [form, setForm] = useState({
    indexNumber: student.indexNumber,
    name: student.name,
    studentClass: student.class ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const indexNumber = form.indexNumber.trim();
    const name = form.name.trim();
    if (!indexNumber || !name) return setError('Index number and name are required.');
    setSaving(true);
    setError('');
    const result = await updateStudent(student.id, { indexNumber, name, studentClass: form.studentClass.trim() });
    setSaving(false);
    if (result === 'duplicate') return setError(`Another student already has index number ${indexNumber}.`);
    if (!result) return setError('Couldn’t save. Please try again.');
    onSaved(result);
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Edit Student</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Index Number *</label>
          <input className={inputClass} value={form.indexNumber} onChange={e => setForm(f => ({ ...f, indexNumber: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Name *</label>
          <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Class</label>
          <input className={inputClass} placeholder="e.g. 3A" value={form.studentClass} onChange={e => setForm(f => ({ ...f, studentClass: e.target.value }))} />
        </div>
        {form.indexNumber.trim() !== student.indexNumber && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            When grading, enter the new index number to add to this student’s record.
          </p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
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
          disabled={saving}
          className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
        >
          {saving ? 'Saving…' : 'Save'}
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
