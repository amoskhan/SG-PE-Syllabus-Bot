import { supabase } from "./db/supabaseClient";
import { LessonStep, stepsOrLegacy } from "../utils/lessonFlow";

// Planned lessons live in Supabase (see supabase_lessons.sql) so a teacher can
// plan at home and run the lesson on the school laptop. Which lesson is on the
// projector right now is a per-device choice, kept in localStorage.

export type SkillArea = "FMS" | "Gymnastics";

export interface Lesson {
  id: string;
  lessonDate: string; // YYYY-MM-DD
  className: string;
  level: string; // 'P1'..'P6', or '' if not set
  objective: string;
  skillArea: SkillArea;
  skillName: string; // the main skill: pupils' work is filed under it
  pairCount: number;
  // The steps pupils' devices walk through (lessonFlow.ts). A lesson planned
  // before steps existed reads as the legacy flow.
  steps: LessonStep[];
  pupilPass: string; // secret carried in the class QR (see supabase_lesson_pass.sql)
  createdAt: string;
}

// Steps are optional until the Lesson Planner builds them: none = the legacy flow
export type LessonDraft = Omit<Lesson, "id" | "createdAt" | "pupilPass" | "steps"> & { steps?: LessonStep[] };

export const LEVELS = ["P1", "P2", "P3", "P4", "P5", "P6"];
export const MAX_PAIR_COUNT = 30;

export interface LessonRow {
  id: string;
  lesson_date: string;
  class_name: string;
  level: string | null;
  objective: string | null;
  skill_area: SkillArea;
  skill_name: string;
  pair_count: number;
  pupil_pass: string | null;
  steps?: LessonStep[] | null;
  created_at: string;
}

export const fromRow = (r: LessonRow): Lesson => ({
  id: r.id,
  lessonDate: r.lesson_date,
  className: r.class_name,
  level: r.level ?? "",
  objective: r.objective ?? "",
  skillArea: r.skill_area,
  skillName: r.skill_name,
  pairCount: r.pair_count,
  pupilPass: r.pupil_pass ?? "",
  steps: stepsOrLegacy(r.steps, r.skill_name),
  createdAt: r.created_at,
});

/** The columns a teacher writes when saving a lesson. */
export const toRow = (d: LessonDraft) => ({
  lesson_date: d.lessonDate,
  class_name: d.className.trim(),
  level: d.level || null,
  objective: d.objective.trim() || null,
  skill_area: d.skillArea,
  skill_name: d.skillName,
  pair_count: d.pairCount,
  steps: d.steps?.length ? d.steps : null,
});

/** Only [a-z0-9-]: the id is also a Storage folder name and part of pair ids. */
/**
 * A lesson's id and pupil pass, made before it is first saved when the
 * teacher uploads teach media while planning it: the media's folder needs
 * both (supabase_teach_media.sql).
 */
export interface LessonKeys {
  id: string;
  pupilPass: string;
}

export const makeLessonKeys = (d: LessonDraft): LessonKeys => ({
  id: makeLessonId(d),
  pupilPass: (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
  ).replace(/-/g, ""),
});

const makeLessonId = (d: LessonDraft) => {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return [d.lessonDate, slug(d.className).slice(0, 12), slug(d.skillName).slice(0, 20), suffix]
    .filter(Boolean)
    .join("-");
};

/** "4B · Fri 27 Sep" — how a lesson is named everywhere on the board. */
export const lessonTitle = (l: Pick<Lesson, "className" | "lessonDate">) =>
  `${l.className} · ${new Date(`${l.lessonDate}T00:00:00`).toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })}`;

export const todayIso = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

export async function fetchLessons(): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .order("lesson_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as LessonRow[]).map(fromRow);
}

export async function createLesson(draft: LessonDraft, keys?: LessonKeys): Promise<Lesson> {
  const { data, error } = await supabase
    .from("lessons")
    .insert({
      id: keys?.id ?? makeLessonId(draft),
      ...(keys ? { pupil_pass: keys.pupilPass } : {}),
      ...toRow(draft),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as LessonRow);
}

export async function updateLesson(id: string, draft: LessonDraft): Promise<Lesson> {
  const { data, error } = await supabase.from("lessons").update(toRow(draft)).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return fromRow(data as LessonRow);
}

export async function deleteLesson(id: string): Promise<void> {
  const { error } = await supabase.from("lessons").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Which lesson is on the projector (this device) ──────────────────────────

const currentKey = (teacherId?: string) => `pe-board-current-lesson:${teacherId || "guest"}`;

export const getCurrentLessonId = (teacherId?: string): string | null => {
  try {
    return localStorage.getItem(currentKey(teacherId));
  } catch {
    return null;
  }
};

export const setCurrentLessonId = (teacherId: string | undefined, id: string | null) => {
  try {
    if (id) localStorage.setItem(currentKey(teacherId), id);
    else localStorage.removeItem(currentKey(teacherId));
  } catch {
    // Blocked storage — the choice just won't survive a refresh
  }
};

/**
 * Lessons created by the first version of this feature (name only, kept in
 * localStorage). Used only to label their submissions in the Review Tray.
 */
export const getLocalLessonNames = (teacherId?: string): Record<string, string> => {
  try {
    const raw = localStorage.getItem(`pe-board-lesson-history:${teacherId || "guest"}`);
    const list = raw ? (JSON.parse(raw) as { id: string; name: string }[]) : [];
    return Object.fromEntries(list.map((l) => [l.id, l.name]));
  } catch {
    return {};
  }
};
