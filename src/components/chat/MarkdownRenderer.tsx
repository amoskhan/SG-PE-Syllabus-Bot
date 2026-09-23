import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

// A small markdown renderer (no dependencies) for what the AI actually writes:
// headings, lists, **bold** / *italic*, > quotes, --- dividers and | tables |.
// Tables matter most: grading answers are checklist tables, which read as a
// wall of "|" characters on a phone if left as text.
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const lines = content.split('\n');
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    out.push(<ul key={`list-${key}`} className="list-disc ml-5 mb-3 space-y-1">{list}</ul>);
    list = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Table: a header row, a |---| separator row, then body rows
    if (trimmed.startsWith('|') && isTableSeparator(lines[i + 1]?.trim() ?? '')) {
      flushList(String(i));
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(splitRow(lines[j].trim()));
        j++;
      }
      out.push(
        <div key={i} className="my-3 -mx-1 overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
          <table className="w-full text-[13px] sm:text-sm border-collapse">
            <thead className="bg-slate-50 dark:bg-zinc-900/60">
              <tr>
                {header.map((cell, c) => (
                  <th key={c} className="px-2.5 py-2 text-left font-bold text-slate-700 dark:text-slate-200 align-bottom">{formatInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-t border-slate-100 dark:border-zinc-800">
                  {header.map((_, c) => (
                    <td key={c} className="px-2.5 py-2 align-top text-slate-700 dark:text-slate-300">{formatInline(row[c] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList(String(i));
      const level = heading[1].length;
      const text = formatInline(heading[2]);
      out.push(
        level <= 2
          ? <h2 key={i} className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white mt-4 mb-2">{text}</h2>
          : <h3 key={i} className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mt-3 mb-1.5">{text}</h3>
      );
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList(String(i));
      out.push(<hr key={i} className="my-3 border-slate-200 dark:border-zinc-800" />);
    } else if (trimmed.startsWith('>')) {
      flushList(String(i));
      out.push(
        <blockquote key={i} className="my-2 border-l-4 border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-r-lg px-3 py-2 text-slate-700 dark:text-slate-300">
          {formatInline(trimmed.replace(/^>\s?/, ''))}
        </blockquote>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      list.push(<li key={i} className="text-slate-700 dark:text-slate-300">{formatInline(trimmed.substring(2))}</li>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList(String(i));
      out.push(<div key={i} className="mb-1 text-slate-700 dark:text-slate-300">{formatInline(trimmed)}</div>);
    } else if (trimmed === '') {
      flushList(String(i));
      out.push(<div key={i} className="h-2"></div>);
    } else {
      flushList(String(i));
      out.push(<p key={i} className="mb-2 text-slate-700 dark:text-slate-300 leading-relaxed">{formatInline(trimmed)}</p>);
    }
  }
  flushList('end');

  return <div className="text-[15px] md:text-base">{out}</div>;
};

const isTableSeparator = (line: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line);

const splitRow = (line: string) =>
  line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

// **bold** and *italic*
const formatInline = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*.+?\*\*|\*[^*\s][^*]*?\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
};

export default MarkdownRenderer;
