import React from 'react';
import { ALL, ClassFilter, classesOf, levelsOf } from '../../utils/classGroups';

// Two rows of chips, levels then that level's classes (#109). Shared by the
// Lessons tab and the Review Tray, so one choice filters both.

interface ClassPickerProps {
  lessons: { level: string; className: string }[];
  value: ClassFilter;
  onChange: (f: ClassFilter) => void;
}

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
      active
        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800'
    }`}
  >
    {children}
  </button>
);

export const ClassPicker: React.FC<ClassPickerProps> = ({ lessons, value, onChange }) => {
  const levels = levelsOf(lessons);
  if (levels.length === 0) return null;
  const classes = classesOf(lessons, value.level);

  return (
    <div className="flex flex-col gap-2 mb-6" aria-label="Choose a level and class">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        <Chip active={value.level === ALL} onClick={() => onChange({ level: ALL, classKey: ALL })}>All levels</Chip>
        {levels.map((l) => (
          <Chip key={l} active={value.level === l} onClick={() => onChange({ level: l, classKey: ALL })}>{l}</Chip>
        ))}
      </div>
      {value.level !== ALL && classes.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <Chip active={value.classKey === ALL} onClick={() => onChange({ ...value, classKey: ALL })}>All {value.level}</Chip>
          {classes.map((c) => (
            <Chip key={c.key} active={value.classKey === c.key} onClick={() => onChange({ ...value, classKey: c.key })}>{c.name}</Chip>
          ))}
        </div>
      )}
    </div>
  );
};
