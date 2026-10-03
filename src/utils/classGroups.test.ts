import { describe, expect, it } from 'vitest';
import { ALL, ALL_CLASSES, NO_LEVEL, classesOf, fitFilter, isGraded, lessonLevel, levelsOf, matchesFilter } from './classGroups';

const lesson = (className: string, level = '') => ({ className, level });

describe('lessonLevel', () => {
  it("uses the lesson's level when set", () => {
    expect(lessonLevel(lesson('4B', 'P5'))).toBe('P5');
  });
  it("takes a blank level from the class name's first digit", () => {
    expect(lessonLevel(lesson('4B'))).toBe('P4');
    expect(lessonLevel(lesson('Class 2 Kindness'))).toBe('P2');
  });
  it('files a class name without a primary level under "No level"', () => {
    expect(lessonLevel(lesson('Eagles'))).toBe(NO_LEVEL);
    expect(lessonLevel(lesson('9A'))).toBe(NO_LEVEL);
  });
});

describe('levels and classes', () => {
  const lessons = [lesson('5C'), lesson('4b'), lesson('4B', 'P4'), lesson('4A'), lesson('Eagles'), lesson('3A', 'P3')];

  it('lists levels in order, "No level" last', () => {
    expect(levelsOf(lessons)).toEqual(['P3', 'P4', 'P5', NO_LEVEL]);
  });
  it("lists a level's classes once each, ignoring case and spaces", () => {
    expect(classesOf(lessons, 'P4')).toEqual([{ key: '4A', name: '4A' }, { key: '4B', name: '4b' }]);
  });
  it('lists every class for all levels', () => {
    expect(classesOf(lessons, ALL).map(c => c.key)).toEqual(['3A', '4A', '4B', '5C', 'EAGLES']);
  });
  it('filters by level, then class', () => {
    expect(lessons.filter(l => matchesFilter(l, { level: 'P4', classKey: ALL }))).toHaveLength(3);
    expect(lessons.filter(l => matchesFilter(l, { level: 'P4', classKey: '4B' }))).toHaveLength(2);
    expect(lessons.filter(l => matchesFilter(l, ALL_CLASSES))).toHaveLength(6);
  });
  it('widens a remembered choice whose class or level is gone', () => {
    expect(fitFilter(lessons, { level: 'P4', classKey: '4Z' })).toEqual({ level: 'P4', classKey: ALL });
    expect(fitFilter(lessons, { level: 'P6', classKey: '6A' })).toEqual(ALL_CLASSES);
    expect(fitFilter(lessons, { level: 'P4', classKey: '4A' })).toEqual({ level: 'P4', classKey: '4A' });
  });
});

describe('isGraded', () => {
  it('counts approved work as graded, and a resubmission as to grade', () => {
    expect(isGraded({ status: 'approved' })).toBe(true);
    expect(isGraded({ status: 'resubmitted' })).toBe(false);
    expect(isGraded({ status: 'synced' })).toBe(false);
  });
});
