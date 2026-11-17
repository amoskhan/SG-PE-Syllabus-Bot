// Adding students to a class (#181): the rules behind each class's table on
// the Student Dashboard. Pure, so the rules are tested (classList.test.ts).
//
// A student is the same student when the class (ignoring case and spaces)
// and the index number match: index numbers restart in every class.

import { classKey } from './classGroups';

export interface ClassListRow {
  indexNumber: string;
  name: string;
  shortName?: string;
  studentClass: string;
}

/** A student already in the app, as far as a class's table cares. */
export interface ExistingStudent {
  id: string;
  indexNumber: string;
  name: string;
  shortName?: string;
  class?: string;
}

/** What saving a class's table will write. */
export interface ClassListResult {
  toAdd: ClassListRow[];
  toUpdate: (ClassListRow & { id: string })[];
}

/** First words that are rarely what a child is called: "Muhammad Hafiz" is Hafiz, "Nur Aisha" is Aisha. */
const SKIPPED_FIRST_WORDS = new Set(['muhammad', 'mohd', 'mohamed', 'md', 'nur', 'nurul']);

/**
 * A guess at what a student is called, from their full name: the first word,
 * skipping Muhammad, Mohd, Mohamed, Md, Nur and Nurul. The teacher edits it
 * when it's wrong.
 */
export const suggestShortName = (fullName: string): string => {
  const words = fullName.trim().split(/[\s,]+/).filter(Boolean);
  const called = words.find(w => !SKIPPED_FIRST_WORDS.has(w.toLowerCase().replace(/\.$/, '')));
  return called ?? words[0] ?? '';
};

/**
 * The only name a pupil device shows: the student's Short Name, or a guess
 * from their full name until the teacher gives one.
 */
export const shortNameOf = (student: { name: string; shortName?: string }): string =>
  student.shortName?.trim() || suggestShortName(student.name);

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

// ─── Checking a class's rows ─────────────────────────────────────────────────

/** What saving will do with one row of a class's table. */
export type RowCheck =
  | { kind: 'new' }
  | { kind: 'update'; id: string; changes: string[] }
  | { kind: 'same'; id: string }
  | { kind: 'problem'; message: string };

/**
 * Check each row of a class's table against the students already in the app,
 * and work out what saving writes. A row matches a student with the same
 * class and index number, or else a student saved without a class (from a
 * chat grading, say), who is given this class instead of being added twice.
 * A saved Short Name is kept when the row only has the app's guess for one.
 */
export const checkRows = (
  rows: DraftRow[],
  { studentClass, existing }: { studentClass: string; existing: ExistingStudent[] },
): ClassListResult & { checks: RowCheck[] } => {
  const cls = tidy(studentClass);
  const known = new Map(existing.map(s => [studentKey(s.class, s.indexNumber), s]));
  const classless = new Map(existing.filter(s => !s.class?.trim()).map(s => [studentKey('', s.indexNumber), s]));
  const seen = new Set<string>();
  const result: ClassListResult & { checks: RowCheck[] } = { toAdd: [], toUpdate: [], checks: [] };

  for (const raw of rows) {
    const indexNumber = tidy(raw.indexNumber);
    const name = tidy(raw.name);
    const typedShortName = tidy(raw.shortName);
    const problem = !cls ? 'No class'
      : !indexNumber ? 'No index number'
      : !/^\d+$/.test(indexNumber) ? 'Index numbers are numbers'
      : !name ? 'No name'
      : seen.has(studentKey(cls, indexNumber)) ? `Index number ${indexNumber} is already in this list`
      : null;
    if (problem) { result.checks.push({ kind: 'problem', message: problem }); continue; }
    const key = studentKey(cls, indexNumber);
    seen.add(key);

    const indexKey = studentKey('', indexNumber);
    const before = known.get(key) ?? classless.get(indexKey);
    if (!before) {
      result.toAdd.push({ indexNumber, name, shortName: typedShortName || undefined, studentClass: cls });
      result.checks.push({ kind: 'new' });
      continue;
    }
    if (!known.has(key)) classless.delete(indexKey);

    const keepSaved = before.shortName && (!typedShortName || raw.shortNameGuessed);
    const shortName = keepSaved ? before.shortName : typedShortName || undefined;
    const sameClass = classKey(before.class ?? '') === classKey(cls);
    const changes = [
      before.name !== name && `name ${before.name} → ${name}`,
      (before.shortName ?? '') !== (shortName ?? '') && `Short Name ${before.shortName || '(none)'} → ${shortName || '(none)'}`,
      !sameClass && `class ${before.class || '(none)'} → ${cls}`,
    ].filter((c): c is string => !!c);
    if (!changes.length) { result.checks.push({ kind: 'same', id: before.id }); continue; }
    result.toUpdate.push({ id: before.id, indexNumber, name, shortName, studentClass: sameClass ? before.class ?? cls : cls });
    result.checks.push({ kind: 'update', id: before.id, changes });
  }
  return result;
};

/**
 * What editing one saved student changes, in plain words for the teacher to
 * confirm. Choosing the index number a classmate has offers a swap (they get
 * this student's number); a number taken in a class the student moves to, or a
 * missing name or index number, is a problem. "4p" is the same class as "4P",
 * and "01" the same index number as "1".
 */
export const describeStudentEdit = (
  before: ExistingStudent,
  after: { indexNumber: string; name: string; shortName: string; studentClass: string },
  classmates: ExistingStudent[],
): { changes: string[]; swapWith?: ExistingStudent; problem?: string } => {
  const indexNumber = tidy(after.indexNumber);
  const name = tidy(after.name);
  const shortName = tidy(after.shortName);
  const studentClass = tidy(after.studentClass);
  const sameClass = classKey(before.class ?? '') === classKey(studentClass);
  const sameIndex = studentKey('', before.indexNumber) === studentKey('', indexNumber);
  const holder = classmates.find(s =>
    s.id !== before.id && studentKey(s.class, s.indexNumber) === studentKey(studentClass, indexNumber));
  const swapWith = holder && sameClass ? holder : undefined;

  const changes = [
    !sameIndex && `Index number ${before.indexNumber} → ${indexNumber}${swapWith ? ` (${swapWith.name} becomes ${before.indexNumber})` : ''}`,
    before.name !== name && `Full name ${before.name} → ${name}`,
    (before.shortName ?? '') !== shortName && `Short Name ${before.shortName || '(none)'} → ${shortName || '(none)'}`,
    !sameClass && `Class ${before.class || '(none)'} → ${studentClass || '(none)'}`,
  ].filter((c): c is string => !!c);

  const problem = !name ? 'The full name is needed'
    : !indexNumber ? 'The index number is needed'
    : !/^\d+$/.test(indexNumber) ? 'Index numbers are numbers'
    : holder && !swapWith ? `Index number ${indexNumber} is already ${holder.name}’s in ${studentClass}`
    : undefined;
  return { changes, ...(swapWith && { swapWith }), ...(problem && { problem }) };
};

/** The index number a new row starts with: one after the highest already used. */
export const nextIndexNumber = (indexNumbers: string[]): number =>
  Math.max(0, ...indexNumbers.map(n => Number(tidy(n))).filter(Number.isFinite)) + 1;

// ─── Pasting from Excel ──────────────────────────────────────────────────────

/** What a pasted column holds. */
export type ColumnRole = 'index' | 'name' | 'shortName' | 'ignore';

/** One student typed or pasted into a class's table, not yet saved. */
export interface DraftRow {
  indexNumber: string;
  name: string;
  shortName: string;
  /** The Short Name is the app's guess, not one the teacher typed or pasted. */
  shortNameGuessed?: boolean;
}

const isNumber = (s: string) => /^\d+$/.test(s);

/** The role a heading names ("Index No.", "Full name", "Short Name", "Gender" …). */
const roleOfHeading = (heading: string): ColumnRole =>
  /short|called|nick|preferred/i.test(heading) ? 'shortName'
  : /index|^no\.?$|reg/i.test(heading) ? 'index'
  : /name/i.test(heading) ? 'name'
  : 'ignore';

/**
 * Lines of a paste as cells. Excel pastes tab-separated cells. Without tabs,
 * the lines are a CSV only when they all split into the same number of cells
 * and one of them is all numbers; otherwise each line is one name, commas and
 * all ("Tan, Wei Ming").
 */
const tableOf = (text: string): string[][] => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.some(l => l.includes('\t'))) return lines.map(l => l.split('\t').map(tidy));
  const csv = lines.map(l => cellsOf(l).map(tidy));
  const width = csv[0]?.length ?? 0;
  const looksLikeCsv = width > 1 && csv.every(r => r.length === width)
    && Array.from({ length: width }, (_, c) => c).some(c => csv.every(r => isNumber(r[c])));
  return looksLikeCsv ? csv : lines.map(l => [tidy(l)]);
};

/** A guess at each column's role, from the data alone. */
const guessRoles = (rows: string[][]): ColumnRole[] => {
  const width = Math.max(0, ...rows.map(r => r.length));
  const columns = Array.from({ length: width }, (_, c) => rows.map(r => r[c] ?? '').filter(Boolean));
  const indexCol = columns.findIndex(col => col.length > 0 && col.every(isNumber));
  const average = (col: string[]) => col.reduce((n, s) => n + s.length, 0) / Math.max(1, col.length);
  let nameCol = -1;
  columns.forEach((col, c) => {
    if (c === indexCol || col.every(isNumber)) return;
    if (nameCol < 0 || average(col) > average(columns[nameCol])) nameCol = c;
  });
  return columns.map((_, c) => (c === indexCol ? 'index' : c === nameCol ? 'name' : 'ignore'));
};

/**
 * Students pasted from a spreadsheet (or a CSV, or a list of names), with the
 * role worked out for each column: a heading row names them, or else the
 * all-numbers column is the index and the longest text column is the full
 * name. Pass `roles` to correct the guess. Without an index column, students
 * are numbered in order from `firstIndex`. A missing Short Name is suggested.
 */
export const readPaste = (
  text: string,
  { firstIndex, roles: chosen }: { firstIndex: number; roles?: ColumnRole[] },
): { roles: ColumnRole[]; rows: DraftRow[] } => {
  let table = tableOf(text);
  const headingRoles = table.length && !table[0].some(isNumber) && table[0].some(c => /index|name|class|^no\.?$/i.test(c))
    ? table[0].map(roleOfHeading) : null;
  if (headingRoles) table = table.slice(1);
  const roles = chosen ?? headingRoles ?? guessRoles(table);

  const col = (role: ColumnRole) => roles.indexOf(role);
  let next = firstIndex;
  const rows = table
    .map(cells => {
      const name = cells[col('name')] ?? '';
      const pastedShortName = cells[col('shortName')] ?? '';
      const indexNumber = col('index') >= 0 ? cells[col('index')] ?? '' : name ? String(next++) : '';
      return pastedShortName
        ? { indexNumber, name, shortName: pastedShortName }
        : { indexNumber, name, shortName: suggestShortName(name), shortNameGuessed: true };
    })
    .filter(r => r.name || r.indexNumber);
  return { roles, rows };
};
