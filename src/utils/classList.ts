// Reading a class list the teacher pastes from a spreadsheet or uploads as a
// CSV (#181): one line per child, "index number, full name, Short Name, class".
// Pure, so the rules are tested (classList.test.ts).
//
// A child is the same student when the class (ignoring case and spaces) and
// the index number match: index numbers restart in every class.

import { classKey } from './classGroups';

export interface ClassListRow {
  indexNumber: string;
  name: string;
  shortName?: string;
  studentClass: string;
}

/** A student already in the app, as far as the class list cares. */
export interface ExistingStudent {
  id: string;
  indexNumber: string;
  name: string;
  shortName?: string;
  class?: string;
}

export interface ClassListResult {
  toAdd: ClassListRow[];
  toUpdate: (ClassListRow & { id: string })[];
  unchanged: number;
  problems: ClassListProblem[];
}

/** A line that could not be used, numbered as in what the teacher pasted. */
export interface ClassListProblem {
  line: number;
  message: string;
}

export interface ClassListOptions {
  /** Students already in the app, so a child on the list updates rather than repeats. */
  existing?: ExistingStudent[];
  /** The class for lines that don't give one. */
  defaultClass?: string;
}

/**
 * The only name a pupil device shows: the student's Short Name, or the first
 * word of their full name until the teacher gives one.
 */
export const shortNameOf = (student: { name: string; shortName?: string }): string =>
  student.shortName?.trim() || student.name.trim().split(/\s+/)[0] || '';

/** Same class and index number: "4a" is "4A", and index "07" is "7". */
export const studentKey = (studentClass: string | undefined, indexNumber: string) =>
  `${classKey(studentClass ?? '')}#${indexNumber.trim().replace(/^0+(?=\d)/, '')}`;

/** Cells of one line: tab-separated (pasted from a spreadsheet) or CSV, where a quoted cell may hold commas. */
const cellsOf = (line: string): string[] => {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell.trim()); cell = ''; }
    else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
};

const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export const readClassList = (text: string, { existing = [], defaultClass = '' }: ClassListOptions = {}): ClassListResult => {
  const known = new Map(existing.map(s => [studentKey(s.class, s.indexNumber), s]));
  // Students saved without a class (from a chat grading, say) are found by index number alone,
  // once each, so the list gives them a class instead of adding them a second time
  const classless = new Map(existing.filter(s => !s.class?.trim()).map(s => [studentKey('', s.indexNumber), s]));
  const seenOnLine = new Map<string, number>();
  const toAdd: ClassListRow[] = [];
  const toUpdate: ClassListResult['toUpdate'] = [];
  const problems: ClassListProblem[] = [];
  let unchanged = 0;
  let firstLine = true;

  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const lineNo = i + 1;
    const [indexNumber, name, shortName, ownClass] = cellsOf(line).map(tidy);
    const isFirst = firstLine;
    firstLine = false;
    // A heading row ("Index No., Name, ...") has no digit where the index number goes
    if (isFirst && !/\d/.test(indexNumber)) return;
    const studentClass = ownClass || tidy(defaultClass);

    const problem = !indexNumber ? 'No index number' : !name ? 'No name' : !studentClass ? 'No class' : null;
    if (problem) { problems.push({ line: lineNo, message: problem }); return; }
    const key = studentKey(studentClass, indexNumber);
    const earlier = seenOnLine.get(key);
    if (earlier) {
      problems.push({ line: lineNo, message: `Index number ${indexNumber} in ${studentClass} is already on line ${earlier}` });
      return;
    }
    seenOnLine.set(key, lineNo);

    const row: ClassListRow = { indexNumber, name, shortName: shortName || undefined, studentClass };
    const indexKey = studentKey('', indexNumber);
    const existingStudent = known.get(key) ?? classless.get(indexKey);
    if (!existingStudent) { toAdd.push(row); return; }
    if (!known.has(key)) classless.delete(indexKey);
    // A blank Short Name in the list keeps the one the student already has
    const merged = { ...row, shortName: row.shortName ?? existingStudent.shortName };
    const same = merged.name === existingStudent.name
      && merged.shortName === existingStudent.shortName
      && merged.studentClass === (existingStudent.class ?? '');
    if (same) unchanged++;
    else toUpdate.push({ id: existingStudent.id, ...merged });
  });
  return { toAdd, toUpdate, unchanged, problems };
};

