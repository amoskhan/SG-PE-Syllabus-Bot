import React, { useEffect, useState } from 'react';
import { Student } from '../types';
import { getStudents, getOrCreateStudent } from '../services/studentService';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onOpenChat: () => void;
}

const Dashboard: React.FC<Props> = ({ onOpenChat }) => {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ indexNumber: '', name: '', studentClass: '' });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    getStudents(user.id).then(s => {
      setStudents(s);
      setLoading(false);
    });
  }, [user]);

  const grouped = students.reduce<Record<string, Student[]>>((acc, s) => {
    const cls = s.class || 'Unassigned';
    if (!acc[cls]) acc[cls] = [];
    acc[cls].push(s);
    return acc;
  }, {});

  const handleAdd = async () => {
    if (!addForm.indexNumber.trim() || !addForm.name.trim()) {
      setAddError('Index number and name are required.');
      return;
    }
    if (!user) return;
    setAddLoading(true);
    setAddError('');
    const s = await getOrCreateStudent(user.id, {
      indexNumber: addForm.indexNumber.trim(),
      name: addForm.name.trim(),
      studentClass: addForm.studentClass.trim() || undefined,
    });
    if (s) {
      setStudents(prev => {
        const exists = prev.find(p => p.id === s.id);
        return exists ? prev : [s, ...prev];
      });
      setShowAddModal(false);
      setAddForm({ indexNumber: '', name: '', studentClass: '' });
    } else {
      setAddError('Failed to create student. Please try again.');
    }
    setAddLoading(false);
  };

  if (selectedStudent) {
    return (
      <StudentProfile
        student={selectedStudent}
        onBack={() => setSelectedStudent(null)}
        onOpenChat={onOpenChat}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Student Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {students.length} student{students.length !== 1 ? 's' : ''} tracked
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenChat}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Back to Chat
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
            >
              + Add Student
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400 dark:text-slate-500 text-sm py-12 text-center">Loading students…</div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <p className="text-lg mb-2">No students yet.</p>
            <p className="text-sm">Add a student or fill in the Student fields during a grading session.</p>
          </div>
        ) : (
          Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cls, clsStudents]) => (
              <div key={cls} className="mb-8">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  {cls}
                </h2>
                <div className="border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                  {clsStudents.map((s, i) => {
                    const skillCount = Object.keys(s.progressSummary ?? {}).length;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStudent(s)}
                        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left ${i < clsStudents.length - 1 ? 'border-b border-slate-100 dark:border-zinc-800' : ''}`}
                      >
                        <div>
                          <span className="font-medium text-slate-800 dark:text-white text-sm">{s.name}</span>
                          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">#{s.indexNumber}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                          {skillCount > 0 && (
                            <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                              {skillCount} skill{skillCount !== 1 ? 's' : ''}
                            </span>
                          )}
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Add Student</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Index Number *</label>
                <input
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 01"
                  value={addForm.indexNumber}
                  onChange={e => setAddForm(f => ({ ...f, indexNumber: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Name *</label>
                <input
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Ali bin Ahmad"
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Class</label>
                <input
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 3A"
                  value={addForm.studentClass}
                  onChange={e => setAddForm(f => ({ ...f, studentClass: e.target.value }))}
                />
              </div>
              {addError && <p className="text-xs text-red-500">{addError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowAddModal(false); setAddError(''); }}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={addLoading}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                {addLoading ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Student Profile ──────────────────────────────────────────────────────────

import { SkillAnalysis } from '../types';
import { getAnalysisHistory, getSignedVideoUrl } from '../services/studentService';

interface ProfileProps {
  student: Student;
  onBack: () => void;
  onOpenChat: () => void;
}

const StudentProfile: React.FC<ProfileProps> = ({ student, onBack, onOpenChat }) => {
  const [analyses, setAnalyses] = useState<SkillAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    getAnalysisHistory(student.id).then(a => {
      setAnalyses(a);
      setLoading(false);
    });
  }, [student.id]);

  const skills = Object.keys(student.progressSummary ?? {});

  const gradeColor = (level?: string) => {
    switch (level?.toLowerCase()) {
      case 'excellent': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20';
      case 'competent': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'developing': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20';
      case 'beginning': return 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      default: return 'text-slate-400 bg-slate-100 dark:bg-zinc-800';
    }
  };

  const formatDateTime = (date: Date) => ({
    date: date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true }),
  });

  // Render markdown-style table and bold text from analysis text
  const renderAnalysis = (text: string) => {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let tableLines: string[] = [];
    let key = 0;

    const flushTable = () => {
      if (tableLines.length < 2) {
        tableLines.forEach(l => result.push(<p key={key++} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{l}</p>));
        tableLines = [];
        return;
      }
      const headerCells = tableLines[0].split('|').map(c => c.trim()).filter(Boolean);
      const bodyRows = tableLines.slice(2).map(r => r.split('|').map(c => c.trim()).filter(Boolean));
      result.push(
        <div key={key++} className="overflow-x-auto my-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-zinc-700/50">
                {headerCells.map((h, i) => (
                  <th key={i} className="text-left px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white dark:bg-zinc-800/30' : 'bg-slate-50 dark:bg-zinc-800/60'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-600 text-xs leading-relaxed">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableLines = [];
    };

    for (const line of lines) {
      if (line.trim().startsWith('|')) {
        tableLines.push(line);
      } else {
        if (tableLines.length) flushTable();
        if (!line.trim()) {
          result.push(<div key={key++} className="h-1" />);
        } else {
          // Bold text: **text**
          const parts = line.split(/(\*\*[^*]+\*\*)/g);
          result.push(
            <p key={key++} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {parts.map((p, i) =>
                p.startsWith('**') && p.endsWith('**')
                  ? <strong key={i} className="font-semibold text-slate-800 dark:text-white">{p.slice(2, -2)}</strong>
                  : p
              )}
            </p>
          );
        }
      }
    }
    if (tableLines.length) flushTable();
    return result;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{student.name}</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            #{student.indexNumber}{student.class ? ` · ${student.class}` : ''}
          </p>
        </div>

        {skills.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              AI Progress Summary
            </h2>
            <div className="space-y-3">
              {skills.map(skill => (
                <div key={skill} className="border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">{skill}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {student.progressSummary[skill]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
            Analysis History
          </h2>
          {loading ? (
            <div className="text-slate-400 dark:text-slate-500 text-sm py-8 text-center">Loading…</div>
          ) : analyses.length === 0 ? (
            <div className="text-slate-400 dark:text-slate-500 text-sm py-8 text-center">No analyses yet.</div>
          ) : (
            <div className="border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              {analyses.map((a, i) => {
                const { date, time } = formatDateTime(a.createdAt);
                const isOpen = expandedId === a.id;
                return (
                  <div key={a.id} className={i < analyses.length - 1 ? 'border-b border-slate-100 dark:border-zinc-800' : ''}>
                    {/* Row header — click to expand */}
                    <button
                      type="button"
                      onClick={async () => {
                        const next = isOpen ? null : a.id;
                        setExpandedId(next);
                        // Fetch signed URL once when first opened
                        if (next && a.videoUrl && !signedUrls[a.id]) {
                          const url = await getSignedVideoUrl(a.videoUrl);
                          if (url) setSignedUrls(prev => ({ ...prev, [a.id]: url }));
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors text-left"
                    >
                      {/* Date + time */}
                      <div className="w-32 flex-shrink-0">
                        <p className="text-sm text-slate-700 dark:text-slate-200">{date}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{time}</p>
                      </div>

                      {/* Skill */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{a.skillName}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{a.modelId ?? '—'}</p>
                      </div>

                      {/* Grade badge */}
                      {a.proficiencyLevel && (
                        <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${gradeColor(a.proficiencyLevel)}`}>
                          {a.proficiencyLevel}
                        </span>
                      )}

                      {/* Chevron */}
                      <svg
                        className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expandable analysis */}
                    {isOpen && (
                      <div className="px-4 pb-4 bg-slate-50 dark:bg-zinc-900/40 border-t border-slate-100 dark:border-zinc-800">
                        {/* Video player */}
                        {a.videoUrl && (
                          <div className="pt-3 pb-2">
                            {signedUrls[a.id] ? (
                              <video
                                src={signedUrls[a.id]}
                                controls
                                className="w-full max-h-64 rounded-lg bg-black"
                                playsInline
                              />
                            ) : (
                              <div className="w-full h-24 rounded-lg bg-slate-200 dark:bg-zinc-700 flex items-center justify-center text-xs text-slate-400">
                                Loading video…
                              </div>
                            )}
                          </div>
                        )}
                        <div className="pt-2 space-y-1">
                          {renderAnalysis(a.analysisText)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={onOpenChat}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          >
            Grade Another Video for {student.name}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
