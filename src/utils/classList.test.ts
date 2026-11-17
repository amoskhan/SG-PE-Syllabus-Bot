import { describe, expect, it } from 'vitest';
import { readClassList, shortNameOf } from './classList';

describe('readClassList', () => {
  it('reads lines pasted from a spreadsheet as students to add', () => {
    const text = '12\tNur Aisha binte Ahmad\tAisha\t4A\n13\tBala Krishnan\t\t4A';
    expect(readClassList(text).toAdd).toEqual([
      { indexNumber: '12', name: 'Nur Aisha binte Ahmad', shortName: 'Aisha', studentClass: '4A' },
      { indexNumber: '13', name: 'Bala Krishnan', shortName: undefined, studentClass: '4A' },
    ]);
  });

  it('reads a CSV, with a quoted name that has a comma in it', () => {
    const text = '7,"Tan, Wei Ming",Wei Ming,4B';
    expect(readClassList(text).toAdd).toEqual([
      { indexNumber: '7', name: 'Tan, Wei Ming', shortName: 'Wei Ming', studentClass: '4B' },
    ]);
  });

  it('skips a header row, blank lines and extra spaces', () => {
    const text = 'Index No.,Full name,Short Name,Class\n\n  3 ,  Siti   Rahmah ,  Siti , 4 A  \n   \n';
    expect(readClassList(text).toAdd).toEqual([
      { indexNumber: '3', name: 'Siti Rahmah', shortName: 'Siti', studentClass: '4 A' },
    ]);
  });

  it('keeps two children with the same Short Name', () => {
    const result = readClassList('1,Muhammad Adam,Adam,4A\n2,Adam Tan,Adam,4A');
    expect(result.toAdd.map(r => r.indexNumber)).toEqual(['1', '2']);
    expect(result.problems).toEqual([]);
  });

  it('uses the class typed for the whole list when a line has none', () => {
    const result = readClassList('5\tPriya Nair\tPriya', { defaultClass: '3C' });
    expect(result.toAdd).toEqual([{ indexNumber: '5', name: 'Priya Nair', shortName: 'Priya', studentClass: '3C' }]);
  });

  it('reports lines it cannot use, by line number, and leaves them out', () => {
    const text = [
      '1,Ali Hassan,Ali,4A',
      ',No Index,,4A',
      '2,,,4A',
      '3,No Class',
      '1,Ali Again,,4a',
    ].join('\n');
    const result = readClassList(text);
    expect(result.toAdd.map(r => r.name)).toEqual(['Ali Hassan']);
    expect(result.problems).toEqual([
      { line: 2, message: 'No index number' },
      { line: 3, message: 'No name' },
      { line: 4, message: 'No class' },
      { line: 5, message: 'Index number 1 in 4a is already on line 1' },
    ]);
  });

  it('reports names pasted without index numbers, never skipping the first one as a heading', () => {
    const result = readClassList('Naila\nJoseph', { defaultClass: '4A' });
    expect(result.toAdd).toEqual([]);
    expect(result.problems).toEqual([
      { line: 1, message: 'No index number before "Naila"' },
      { line: 2, message: 'No index number before "Joseph"' },
    ]);
  });

  describe('children already in the app', () => {
    const existing = [
      { id: 's12', indexNumber: '12', name: 'Nur Aisha', class: '4a' },
      { id: 's13', indexNumber: '13', name: 'Bala Krishnan', shortName: 'Bala', class: '4A' },
      { id: 'b12', indexNumber: '12', name: 'Daniel Lim', class: '4B' },
    ];

    it('updates a child with the same index number in the same class, never adding them twice', () => {
      const result = readClassList('12,Nur Aisha binte Ahmad,Aisha,4A', { existing });
      expect(result.toAdd).toEqual([]);
      expect(result.toUpdate).toEqual([
        { id: 's12', indexNumber: '12', name: 'Nur Aisha binte Ahmad', shortName: 'Aisha', studentClass: '4A' },
      ]);
    });

    it('adds a child whose index number is only used in another class', () => {
      const result = readClassList('13,Chen Hui,,4B', { existing });
      expect(result.toAdd.map(r => r.name)).toEqual(['Chen Hui']);
      expect(result.toUpdate).toEqual([]);
    });

    it('counts a child whose details are the same as unchanged', () => {
      const result = readClassList('13,Bala Krishnan,Bala,4A', { existing });
      expect(result.toAdd).toEqual([]);
      expect(result.toUpdate).toEqual([]);
      expect(result.unchanged).toBe(1);
    });

    it('gives a class to a student saved without one, instead of adding them again', () => {
      const result = readClassList('20,Farah Lee,Farah,4A', {
        existing: [...existing, { id: 'noclass20', indexNumber: '20', name: 'Farah Lee' }],
      });
      expect(result.toAdd).toEqual([]);
      expect(result.toUpdate).toEqual([
        { id: 'noclass20', indexNumber: '20', name: 'Farah Lee', shortName: 'Farah', studentClass: '4A' },
      ]);
    });

    it("keeps a child's Short Name when the list leaves it blank", () => {
      const result = readClassList('13,Bala Krishnan,,4A', { existing });
      expect(result.toUpdate).toEqual([]);
      expect(result.unchanged).toBe(1);
    });
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
