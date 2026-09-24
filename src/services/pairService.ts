import { supabase } from './db/supabaseClient';
import { SkillAnalysis } from '../types';
import { mapAnalysis } from './studentService';

// Who is in each pair of a lesson (supabase_lesson_pairs.sql). Setting a slot
// is all the app does: the database then files that pair's Practice Station
// analyses under the named students.

export type Performer = 'apple' | 'banana';

export interface PairSlot {
  lessonId: string;
  pairNumber: number;
  performer: Performer;
  studentId: string;
}

export const slotKey = (lessonId: string, pairNumber: number, performer: Performer) =>
  `${lessonId}|${pairNumber}|${performer}`;

/** "4 B" and "4b" are the same class. */
export const sameClass = (a?: string, b?: string) =>
  !!a && !!b && a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

/** Every pair slot the teacher has set, across all their lessons. */
export const fetchPairSlots = async (): Promise<PairSlot[]> => {
  const { data, error } = await supabase.from('lesson_pairs').select('lesson_id, pair_number, performer, student_id');
  if (error) { console.error('fetchPairSlots error:', error); return []; }
  return (data ?? []).map(r => ({
    lessonId: r.lesson_id,
    pairNumber: r.pair_number,
    performer: r.performer,
    studentId: r.student_id,
  }));
};

/**
 * Put a student in a slot, or clear it with `null`. A pupil can only be in one
 * slot per lesson, so they're taken out of any other slot first.
 */
export const setPairSlot = async (
  lessonId: string,
  pairNumber: number,
  performer: Performer,
  studentId: string | null,
): Promise<boolean> => {
  if (!studentId) {
    const { error } = await supabase.from('lesson_pairs').delete()
      .eq('lesson_id', lessonId).eq('pair_number', pairNumber).eq('performer', performer);
    if (error) { console.error('setPairSlot clear error:', error); return false; }
    return true;
  }

  const { error: moveError } = await supabase.from('lesson_pairs').delete()
    .eq('lesson_id', lessonId).eq('student_id', studentId)
    .or(`pair_number.neq.${pairNumber},performer.neq.${performer}`);
  if (moveError) { console.error('setPairSlot move error:', moveError); return false; }

  const { error } = await supabase.from('lesson_pairs').upsert(
    { lesson_id: lessonId, pair_number: pairNumber, performer, student_id: studentId },
    { onConflict: 'lesson_id,pair_number,performer' },
  );
  if (error) { console.error('setPairSlot error:', error); return false; }
  return true;
};

/** Replace a lesson's pairs with another lesson's, dropping pairs it doesn't have. */
export const copyPairs = async (fromLessonId: string, toLessonId: string, pairCount: number): Promise<boolean> => {
  const { data: from, error: readError } = await supabase.from('lesson_pairs')
    .select('pair_number, performer, student_id').eq('lesson_id', fromLessonId);
  if (readError) { console.error('copyPairs read error:', readError); return false; }

  const { error: clearError } = await supabase.from('lesson_pairs').delete().eq('lesson_id', toLessonId);
  if (clearError) { console.error('copyPairs clear error:', clearError); return false; }

  const rows = (from ?? [])
    .filter(r => r.pair_number <= pairCount)
    .map(r => ({ lesson_id: toLessonId, pair_number: r.pair_number, performer: r.performer, student_id: r.student_id }));
  if (!rows.length) return true;
  const { error } = await supabase.from('lesson_pairs').insert(rows);
  if (error) { console.error('copyPairs insert error:', error); return false; }
  return true;
};

/** The student-record copies of one pair submission's analyses, by performer. */
export const fetchSubmissionGradings = async (submissionId: string): Promise<Partial<Record<Performer, SkillAnalysis>>> => {
  const { data, error } = await supabase.from('skill_analyses').select('*').eq('submission_id', submissionId);
  if (error) { console.error('fetchSubmissionGradings error:', error); return {}; }
  const out: Partial<Record<Performer, SkillAnalysis>> = {};
  for (const row of data ?? []) {
    if (row.performer === 'apple' || row.performer === 'banana') out[row.performer as Performer] = mapAnalysis(row);
  }
  return out;
};
