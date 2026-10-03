import React from 'react';
import { getSyllabusSection, sectionPdfLink } from '../../data/syllabusGuide';

// Under a syllabus answer (#112): the section the answer came from, in the
// syllabus's own words, and a link to that page of the official PDF. Built from
// the section id alone, so it shows even when the AI was busy or failed.

export const SyllabusSource: React.FC<{ sectionId: string }> = ({ sectionId }) => {
  const section = getSyllabusSection(sectionId);
  if (!section) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">From the 2024 PE Syllabus</span>
        <a
          href={sectionPdfLink(section)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-zinc-700 px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-zinc-800 transition-colors"
        >
          📄 Open PDF p. {section.printedPage}
        </a>
      </div>
      <details className="group">
        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200 marker:text-slate-400">
          {section.title}
        </summary>
        <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {section.text}
        </p>
      </details>
    </div>
  );
};

export default SyllabusSource;
