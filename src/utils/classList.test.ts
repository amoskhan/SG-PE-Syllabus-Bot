import { describe, expect, it } from 'vitest';
import { checkRows, describeClassEdit, describeStudentEdit, nextIndexNumber, readPaste, shortNameOf, suggestShortName, type DraftRow, type ExistingStudent } from './classList';

describe('checkRows', () => {
  const existing: ExistingStudent[] = [
    { id: 's12', indexNumber: '12', name: 'Nur Aisha', class: '4a' },
    { id: 's13', indexNumber: '13', name: 'Bala Krishnan', shortName: 'Bala', class: '4A' },
    { id: 'b12', indexNumber: '12', name: 'Daniel Lim', class: '4B' },
  ];
  // A row's Short Name is the app's guess unless one is given
const row = (indexNumber: string, name: string, shortName?: string): DraftRow =>
    shortName === undefined ? { indexNumber, name, shortName: suggestShortName(name), shortNameGuessed: true } : { indexNumber, name, shortName };
  const check = (rows: DraftRow[], studentClass = '4A', more: ExistingStudent[] = []) =>
    checkRows(rows, { studentClass, existing: [...existing, ...more] });

  it('marks students not yet in the class as new, and lists them to add with the class', () => {
    const { checks, toAdd } = check([row('20', 'Farah Lee')]);
    expect(checks).toEqual([{ kind: 'new' }]);
    expect(toAdd).toEqual([{ indexNumber: '20', name: 'Farah Lee', shortName: 'Farah', studentClass: '4A' }]);
  });

  it('updates a student with the same index number in the same class, never adding them twice', () => {
    const { checks, toAdd, toUpdate } = check([row('12', 'Nur Aisha binte Ahmad', 'Aisha')]);
    expect(checks).toEqual([{ kind: 'update', id: 's12', changes: ['name Nur Aisha → Nur Aisha binte Ahmad', 'Short Name (none) → Aisha'] }]);
    expect(toAdd).toEqual([]);
    expect(toUpdate).toEqual([{ id: 's12', indexNumber: '12', name: 'Nur Aisha binte Ahmad', shortName: 'Aisha', studentClass: '4a' }]); // the saved spelling of the same class is kept
  });

  it('adds a student whose index number is only used in another class', () => {
    expect(check([row('13', 'Chen Hui')], '4B').checks).toEqual([{ kind: 'new' }]);
  });

  it('leaves out a student whose details are the same', () => {
    const { checks, toAdd, toUpdate } = check([row('13', 'Bala Krishnan', 'Bala')]);
    expect(checks).toEqual([{ kind: 'same', id: 's13' }]);
    expect([...toAdd, ...toUpdate]).toEqual([]);
  });

  it("keeps a saved Short Name instead of the app's guess, but not instead of one the teacher typed", () => {
    const { checks } = check([row('13', 'Bala Krishnan')], '4A', [
      { id: 's14', indexNumber: '14', name: 'Muhammad Hafiz', shortName: 'Fiz', class: '4A' },
    ]);
    expect(checks[0]).toEqual({ kind: 'same', id: 's13' });
    expect(check([row('14', 'Muhammad Hafiz')], '4A', [
      { id: 's14', indexNumber: '14', name: 'Muhammad Hafiz', shortName: 'Fiz', class: '4A' },
    ]).checks).toEqual([{ kind: 'same', id: 's14' }]);
    expect(check([row('14', 'Muhammad Hafiz', 'Hafiz')], '4A', [
      { id: 's14', indexNumber: '14', name: 'Muhammad Hafiz', shortName: 'Fiz', class: '4A' },
    ]).checks).toEqual([{ kind: 'update', id: 's14', changes: ['Short Name Fiz → Hafiz'] }]);
  });

  it('gives the class to a student saved without one, instead of adding them again', () => {
    const { checks } = check([row('20', 'Farah Lee')], '4A', [{ id: 'noclass20', indexNumber: '20', name: 'Farah Lee' }]);
    expect(checks).toEqual([{ kind: 'update', id: 'noclass20', changes: ['Short Name (none) → Farah', 'class (none) → 4A'] }]);
  });

  it('keeps two students with the same Short Name', () => {
    expect(check([row('1', 'Muhammad Adam'), row('2', 'Adam Tan')]).checks).toEqual([{ kind: 'new' }, { kind: 'new' }]);
  });

  it('flags rows it cannot save, and leaves them out', () => {
    const { checks, toAdd } = check([
      row('21', 'Ali Hassan'),
      row('', 'No Index'),
      row('22', ''),
      row('Naila', ''),
      row('21', 'Ali Again'),
    ]);
    expect(checks).toEqual([
      { kind: 'new' },
      { kind: 'problem', message: 'No index number' },
      { kind: 'problem', message: 'No name' },
      { kind: 'problem', message: 'Index numbers are numbers' },
      { kind: 'problem', message: 'Index number 21 is already in this list' },
    ]);
    expect(toAdd.map(r => r.name)).toEqual(['Ali Hassan']);
  });

  it('needs a class', () => {
    expect(check([row('1', 'Ali Hassan')], '  ').checks).toEqual([{ kind: 'problem', message: 'No class' }]);
  });
});

describe('nextIndexNumber', () => {
  it('is one after the highest index number in the class', () => {
    expect(nextIndexNumber(['3', '12', '07'])).toBe(13);
  });
  it('starts at 1 in an empty class', () => {
    expect(nextIndexNumber([])).toBe(1);
    expect(nextIndexNumber(['', 'x'])).toBe(1);
  });
});

describe('shortNameOf', () => {
  it("uses the student's Short Name", () => {
    expect(shortNameOf({ name: 'Nur Aisha binte Ahmad', shortName: 'Aisha' })).toBe('Aisha');
  });
  it('falls back to the first word of the full name when there is no Short Name', () => {
    expect(shortNameOf({ name: '  Bala Krishnan' })).toBe('Bala');
    expect(shortNameOf({ name: 'Bala Krishnan', shortName: '  ' })).toBe('Bala');
  });
});

describe('suggestShortName', () => {
  it('suggests the first word of the full name', () => {
    expect(suggestShortName('Bala Krishnan')).toBe('Bala');
    expect(suggestShortName('Daniel')).toBe('Daniel');
  });
  it('skips the first words that are rarely what a child is called', () => {
    expect(suggestShortName('Muhammad Hafiz bin Rahman')).toBe('Hafiz');
    expect(suggestShortName('Nur Aisha binte Ahmad')).toBe('Aisha');
    expect(suggestShortName('MOHD Irfan')).toBe('Irfan');
    expect(suggestShortName('Nurul Huda')).toBe('Huda');
    expect(suggestShortName('Md. Arif')).toBe('Arif');
    expect(suggestShortName('Muhammad Nur Iman')).toBe('Iman');
  });
  it('keeps a skipped word when it is the whole name', () => {
    expect(suggestShortName('Nur')).toBe('Nur');
  });
  it('suggests nothing for an empty name', () => {
    expect(suggestShortName('   ')).toBe('');
  });
});

describe('readPaste', () => {
  it('works out the columns of an Excel sheet in any order, ignoring the ones it does not need', () => {
    const text = 'Name\tIndex No.\tGender\n'
      + 'Muhammad Hafiz bin Rahman\t3\tM\n'
      + 'Nur Aisha binte Ahmad\t12\tF';
    const { roles, rows } = readPaste(text, { firstIndex: 1 });
    expect(roles).toEqual(['name', 'index', 'ignore']);
    expect(rows).toEqual([
      { indexNumber: '3', name: 'Muhammad Hafiz bin Rahman', shortName: 'Hafiz', shortNameGuessed: true },
      { indexNumber: '12', name: 'Nur Aisha binte Ahmad', shortName: 'Aisha', shortNameGuessed: true },
    ]);
  });

  it('works out the columns without a heading row: all numbers is the index, the longest text is the name', () => {
    const text = '7\tF\tTan Wei Ming\t4A\n8\tM\tLim Jun Jie\t4A';
    const { roles, rows } = readPaste(text, { firstIndex: 1 });
    expect(roles).toEqual(['index', 'ignore', 'name', 'ignore']);
    expect(rows.map(r => [r.indexNumber, r.name])).toEqual([['7', 'Tan Wei Ming'], ['8', 'Lim Jun Jie']]);
  });

  it("uses a Short Name column when there is one", () => {
    const { roles, rows } = readPaste('Index\tFull name\tShort Name\n12\tNur Aisha binte Ahmad\tAisha', { firstIndex: 1 });
    expect(roles).toEqual(['index', 'name', 'shortName']);
    expect(rows[0].shortName).toBe('Aisha');
  });

  it('numbers a list of names in order, starting where the class leaves off', () => {
    const { roles, rows } = readPaste('Naila\nJoseph\n\nTan, Wei Ming', { firstIndex: 31 });
    expect(roles).toEqual(['name']);
    expect(rows).toEqual([
      { indexNumber: '31', name: 'Naila', shortName: 'Naila', shortNameGuessed: true },
      { indexNumber: '32', name: 'Joseph', shortName: 'Joseph', shortNameGuessed: true },
      { indexNumber: '33', name: 'Tan, Wei Ming', shortName: 'Tan', shortNameGuessed: true },
    ]);
  });

  it('reads a CSV with a number column, with a quoted name that has a comma in it', () => {
    const { rows } = readPaste('7,"Tan, Wei Ming"\n8,Siti   Rahmah', { firstIndex: 1 });
    expect(rows.map(r => [r.indexNumber, r.name])).toEqual([['7', 'Tan, Wei Ming'], ['8', 'Siti Rahmah']]);
  });

  it('lets the teacher correct a wrong guess about a column', () => {
    const text = '7\tTan Wei Ming\tWei Ming';
    expect(readPaste(text, { firstIndex: 1 }).roles).toEqual(['index', 'name', 'ignore']);
    const { rows } = readPaste(text, { firstIndex: 1, roles: ['index', 'name', 'shortName'] });
    expect(rows[0].shortName).toBe('Wei Ming');
  });
});

describe('describeStudentEdit', () => {
  const amos: ExistingStudent = { id: 'amos', indexNumber: '1', name: 'Khan Jun Ming Amos', shortName: 'Amos', class: '4P' };
  const joseph: ExistingStudent = { id: 'joseph', indexNumber: '2', name: 'Joseph Lai', shortName: 'Joseph', class: '4P' };
  const classmates = [amos, joseph];
  const edit = (patch: Partial<{ indexNumber: string; name: string; shortName: string; studentClass: string }>) =>
    describeStudentEdit(amos, { indexNumber: '1', name: 'Khan Jun Ming Amos', shortName: 'Amos', studentClass: '4P', ...patch }, classmates);

  it('says nothing changes when nothing does', () => {
    expect(edit({})).toEqual({ changes: [] });
    expect(edit({ indexNumber: ' 01 ', studentClass: '4p' })).toEqual({ changes: [] });
  });

  it('lists each change in plain words', () => {
    expect(edit({ name: 'Khan Jun Ming', shortName: 'Jun Ming', indexNumber: '3' }).changes).toEqual([
      'Index number 1 → 3',
      'Full name Khan Jun Ming Amos → Khan Jun Ming',
      'Short Name Amos → Jun Ming',
    ]);
  });

  it('offers to swap with the classmate who has that index number', () => {
    expect(edit({ indexNumber: '2' })).toEqual({
      changes: ['Index number 1 → 2 (Joseph Lai becomes 1)'],
      swapWith: joseph,
    });
  });

  it('refuses a number taken in another class it moves to', () => {
    const lim: ExistingStudent = { id: 'lim', indexNumber: '1', name: 'Lim', class: '4Q' };
    expect(describeStudentEdit(amos, { indexNumber: '1', name: amos.name, shortName: 'Amos', studentClass: '4Q' }, [lim]))
      .toEqual({ changes: ['Class 4P → 4Q'], problem: 'Index number 1 is already Lim’s in 4Q' });
  });

  it('refuses a missing name or index number', () => {
    expect(edit({ name: ' ' }).problem).toBe('The full name is needed');
    expect(edit({ indexNumber: 'x' }).problem).toBe('Index numbers are numbers');
  });

  it('can clear a Short Name', () => {
    expect(edit({ shortName: '' }).changes).toEqual(['Short Name Amos → (none)']);
  });
});

describe('describeClassEdit', () => {
  const amos: ExistingStudent = { id: 'a', indexNumber: '1', name: 'Khan Jun Ming Amos', shortName: 'Amos', class: '4P' };
  const joseph: ExistingStudent = { id: 'j', indexNumber: '2', name: 'Joseph Lai', class: '4P' };
  const row = (s: ExistingStudent, patch: Partial<{ indexNumber: string; name: string; shortName: string }> = {}) =>
    ({ id: s.id, indexNumber: s.indexNumber, name: s.name, shortName: s.shortName ?? '', ...patch });

  it('finds nothing to change when the table is as saved', () => {
    expect(describeClassEdit([amos, joseph], [row(amos), row(joseph)]))
      .toEqual({ changes: [], problems: {}, moves: [] });
  });

  it('lists each student’s changes in plain words', () => {
    const edit = describeClassEdit([amos, joseph], [row(amos, { name: 'Khan Amos' }), row(joseph, { shortName: 'Joe' })]);
    expect(edit.changes).toEqual([
      { id: 'a', name: 'Khan Jun Ming Amos', changes: ['Full name Khan Jun Ming Amos → Khan Amos'] },
      { id: 'j', name: 'Joseph Lai', changes: ['Short Name (none) → Joe'] },
    ]);
    expect(edit.moves).toEqual([]);
  });

  it('swaps two index numbers as moves', () => {
    const edit = describeClassEdit([amos, joseph], [row(amos, { indexNumber: '2' }), row(joseph, { indexNumber: '1' })]);
    expect(edit.problems).toEqual({});
    expect(edit.moves).toEqual([{ id: 'a', indexNumber: '2' }, { id: 'j', indexNumber: '1' }]);
    expect(edit.changes.map(c => c.changes)).toEqual([['Index number 1 → 2'], ['Index number 2 → 1']]);
  });

  it('refuses one index number used twice, on both rows', () => {
    const edit = describeClassEdit([amos, joseph], [row(amos, { indexNumber: '02' }), row(joseph)]);
    expect(edit.problems).toEqual({ a: 'Index number 2 is used twice', j: 'Index number 2 is used twice' });
  });

  it('refuses a missing name or a missing or non-number index', () => {
    const edit = describeClassEdit([amos, joseph], [row(amos, { name: ' ' }), row(joseph, { indexNumber: 'x' })]);
    expect(edit.problems).toEqual({ a: 'The full name is needed', j: 'Index numbers are numbers' });
  });
});
