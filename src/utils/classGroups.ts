// Level → Class organisation of the Lessons tab and the Review Tray (#109).
// The teacher picks a level and a class once; both views show only those
// lessons. Pure functions so the rules are tested (classGroups.test.ts).

export const NO_LEVEL = 'No level';
export const ALL = 'ALL';

export interface ClassFilter {
  level: string; // 'P1'..'P6', NO_LEVEL or ALL
  classKey: string; // classKey() of a class, or ALL
}

export const ALL_CLASSES: ClassFilter = { level: ALL, classKey: ALL };

type LessonLike = { level: string; className: string };

/** "4 b" and "4B" are the same class. */
export const classKey = (className: string) => className.replace(/\s+/g, '').toUpperCase();

/**
 * The lesson's level, or one taken from its class name's first digit
 * ("4B" → P4) when the teacher left it blank.
 */
export const lessonLevel = (l: LessonLike): string => {
  if (l.level) return l.level;
  const digit = l.className.match(/\d/)?.[0];
  return digit && digit >= '1' && digit <= '6' ? `P${digit}` : NO_LEVEL;
};

/** Levels that have lessons, P1 first, "No level" last. */
export const levelsOf = (lessons: LessonLike[]): string[] =>
  [...new Set(lessons.map(lessonLevel))].sort((a, b) =>
    a === NO_LEVEL ? 1 : b === NO_LEVEL ? -1 : a.localeCompare(b));

/** The classes of a level (or of every level) that have lessons: key and name, sorted. */
export const classesOf = (lessons: LessonLike[], level: string): { key: string; name: string }[] => {
  const byKey = new Map<string, string>();
  for (const l of lessons) {
    if (level !== ALL && lessonLevel(l) !== level) continue;
    const key = classKey(l.className);
    if (key && !byKey.has(key)) byKey.set(key, l.className.trim());
  }
  return [...byKey].map(([key, name]) => ({ key, name })).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
};

export const matchesFilter = (l: LessonLike, f: ClassFilter) =>
  (f.level === ALL || lessonLevel(l) === f.level) && (f.classKey === ALL || classKey(l.className) === f.classKey);

/**
 * A remembered choice that no longer fits the lessons (its class was deleted)
 * falls back to the widest one that does.
 */
export const fitFilter = (lessons: LessonLike[], f: ClassFilter): ClassFilter => {
  if (f.level !== ALL && !levelsOf(lessons).includes(f.level)) return ALL_CLASSES;
  if (f.classKey !== ALL && !classesOf(lessons, f.level).some(c => c.key === f.classKey)) return { ...f, classKey: ALL };
  return f;
};

/** Finished in the Review Tray: the teacher approved it and nothing new came since. */
export const isGraded = (sub: { status: string }) => sub.status === 'approved';

// The choice is per device, like the lesson on the projector
const filterKey = (teacherId?: string) => `pe-board-class-filter:${teacherId || 'guest'}`;

export const getClassFilter = (teacherId?: string): ClassFilter => {
  try {
    const raw = localStorage.getItem(filterKey(teacherId));
    const f = raw ? JSON.parse(raw) : null;
    return f && typeof f.level === 'string' && typeof f.classKey === 'string' ? f : ALL_CLASSES;
  } catch {
    return ALL_CLASSES;
  }
};

export const saveClassFilter = (teacherId: string | undefined, f: ClassFilter) => {
  try {
    localStorage.setItem(filterKey(teacherId), JSON.stringify(f));
  } catch {
    // Blocked storage: the choice just won't survive a refresh
  }
};
