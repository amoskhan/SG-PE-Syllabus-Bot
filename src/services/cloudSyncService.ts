import { supabase } from "./db/supabaseClient";
import { PairSubmissionRecord, getSubmission, putSubmission, getLessonPass } from "./offline/offlineStorage";
import type { LessonStep } from "../utils/lessonFlow";

export async function backupSubmissionToSupabase(
  submission: PairSubmissionRecord,
  teacherId?: string,
  claimToken?: string,
): Promise<{
  bananaVideoUrl?: string;
  appleVideoUrl?: string;
  blocked?: boolean;
  locked?: boolean;
}> {
  let bananaVideoUrl: string | undefined = submission.appleRole.videoUrl;
  let appleVideoUrl: string | undefined = submission.bananaRole.videoUrl;

  // A clip is uploaded once; after that its stored link is re-sent. Uploading
  // again would make a new link, which the lock counts as changing that
  // performer's work (supabase_submission_lock.sql).
  const timestamp = Date.now();
  // If teacherId provided (from QR), nest under teacher folder so it appears in their dashboard
  const base = teacherId
    ? `${teacherId}/pair_submissions/lesson_${submission.lessonId}`
    : `pair_submissions/lesson_${submission.lessonId}`;
  const folder = `${base}/pair_${submission.pairNumber}_${timestamp}`;

  if (submission.appleRole.videoBlob && !submission.appleRole.videoUrl) {
    try {
      const path = `${folder}/banana_performer.mp4`;
      const { error } = await supabase.storage
        .from("student-videos")
        .upload(path, submission.appleRole.videoBlob, { cacheControl: "3600", upsert: false });

      if (!error) {
        const { data } = supabase.storage.from("student-videos").getPublicUrl(path);
        bananaVideoUrl = data.publicUrl;
      }
    } catch (e) {
      console.warn("[CloudBackup] Banana video upload failed:", e);
    }
  }

  if (submission.bananaRole.videoBlob && !submission.bananaRole.videoUrl) {
    try {
      const path = `${folder}/apple_performer.mp4`;
      const { error } = await supabase.storage
        .from("student-videos")
        .upload(path, submission.bananaRole.videoBlob, { cacheControl: "3600", upsert: false });

      if (!error) {
        const { data } = supabase.storage.from("student-videos").getPublicUrl(path);
        appleVideoUrl = data.publicUrl;
      }
    } catch (e) {
      console.warn("[CloudBackup] Apple video upload failed:", e);
    }
  }

  if (bananaVideoUrl || appleVideoUrl) {
    try {
      const record = await getSubmission(submission.id);
      if (record) {
        if (bananaVideoUrl) record.appleRole.videoUrl = bananaVideoUrl;
        if (appleVideoUrl) record.bananaRole.videoUrl = appleVideoUrl;
        record.syncedAt = new Date().toISOString();
        await putSubmission(record);
        console.log("[CloudBackup] Submission record updated with Supabase video URLs ✓");
      }
    } catch (e) {
      console.warn("[CloudBackup] IndexedDB URL update failed:", e);
    }
  }

  const result = await savePupilSubmission({
    id: submission.id,
    lesson_id: submission.lessonId,
    pair_number: submission.pairNumber,
    skill_name: submission.skillName,
    teacher_id: teacherId,
    status: submission.status, // trigger maps to 'resubmitted' if already reviewed
    claim_token: claimToken ?? submission.claimToken,
    pair_photo: submission.pairPhoto,
    banana_video_url: bananaVideoUrl,
    apple_video_url: appleVideoUrl,
    banana_cues: submission.appleRole.cues,
    apple_cues: submission.bananaRole.cues,
    ai_student_feedback: submission.aiStudentFeedback,
    ai_teacher_report: submission.aiTeacherReport,
    ai_chat_analysis: submission.aiChatAnalysis,
    first_attempts: uploadedFirstAttempts(submission),
    created_at: submission.createdAt,
  });
  if (result === "claimed") {
    console.warn(`[CloudBackup] submission ${submission.id} owned by another group — write blocked`);
    return { bananaVideoUrl, appleVideoUrl, blocked: true };
  }
  if (result === "invalid_lesson") {
    console.warn(`[CloudBackup] submission ${submission.id} refused — lesson not on today or pass missing`);
  }
  if (result === "locked") {
    console.warn(`[CloudBackup] submission ${submission.id} refused — already sent, no redo requested`);
    return { bananaVideoUrl, appleVideoUrl, locked: true };
  }

  return { bananaVideoUrl, appleVideoUrl };
}

/** Each performer's earlier attempt (once they filmed again) that has been uploaded: links and ticks only. */
const uploadedFirstAttempts = (s: PairSubmissionRecord) => {
  const out: Record<string, { videoUrl: string; cues: unknown[] }> = {};
  for (const k of ["apple", "banana"] as const) {
    const a = s.firstAttempt?.[k];
    if (a?.videoUrl) out[k] = { videoUrl: a.videoUrl, cues: a.cues ?? [] };
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * Upload one pupil clip into today's lesson folder and return its stored link,
 * without touching the submission row. Used to keep a performer's first attempt
 * when they film again (#94).
 */
export async function uploadPupilClip(
  blob: Blob,
  teacherId: string,
  lessonId: string,
  pairNumber: number,
  label: string,
): Promise<string | undefined> {
  const path = `${teacherId}/pair_submissions/lesson_${lessonId}/pair_${pairNumber}_${Date.now()}/${label}.mp4`;
  const { error } = await supabase.storage
    .from("student-videos")
    .upload(path, blob, { cacheControl: "3600", upsert: false, contentType: "video/mp4" });
  if (error) {
    console.warn("[CloudSync] uploadPupilClip failed:", error.message);
    return undefined;
  }
  return supabase.storage.from("student-videos").getPublicUrl(path).data.publicUrl;
}

export function mapRowToSubmission(row: any): PairSubmissionRecord {
  return {
    id: row.id,
    lessonId: row.lesson_id || 'pe-lesson-today',
    pairNumber: row.pair_number || 1,
    skillName: row.skill_name || 'Overhand Throw',
    pairPhoto: row.pair_photo || '',
    appleRole: {
      studentPerformer: 'Banana',
      evaluator: 'Apple',
      videoUrl: row.banana_video_url || undefined,
      cues: Array.isArray(row.banana_cues) ? row.banana_cues : [],
    },
    bananaRole: {
      studentPerformer: 'Apple',
      evaluator: 'Banana',
      videoUrl: row.apple_video_url || undefined,
      cues: Array.isArray(row.apple_cues) ? row.apple_cues : [],
    },
    aiStudentFeedback: row.ai_student_feedback || undefined,
    aiTeacherReport: row.ai_teacher_report || undefined,
    aiChatAnalysis: row.ai_chat_analysis || undefined,
    firstAttempt: row.first_attempts || undefined,
    status: row.status || 'pending_sync',
    teacherFeedback: row.teacher_feedback || undefined,
    teacherStar: row.teacher_star || false,
    createdAt: row.created_at || new Date().toISOString(),
    claimToken: row.claim_token || undefined,
    appleSentAt: row.apple_sent_at || undefined,
    bananaSentAt: row.banana_sent_at || undefined,
    redoRequestedAt: row.redo_requested_at || undefined,
  };
}

// ─── Pupil-side access (no sign-in) ──────────────────────────────────────────
// Pupil devices can't read or write the pair tables directly (see
// supabase_protect_pupil_data.sql). Each of these calls one narrow database
// function instead, sending the lesson pass from the class QR
// (supabase_lesson_pass.sql). Writes for a lesson that isn't on today, or
// without its pass, come back as "invalid_lesson".

// "locked": that performer's work was already sent and the teacher hasn't
// asked for a redo (supabase_submission_lock.sql).
export type PupilWriteResult = "ok" | "claimed" | "invalid_lesson" | "locked" | "error";

export type LessonPassStatus = "ok" | "not_today" | "invalid" | "offline";

/** Checked right after a QR scan, so pupils hear straight away if it's the wrong code. */
export async function checkLessonPass(lessonId: string, pass: string): Promise<LessonPassStatus> {
  const { data, error } = await supabase.rpc("pupil_lesson_status", { p_lesson_id: lessonId, p_pass: pass });
  if (error) {
    console.warn("[CloudSync] pupil_lesson_status error:", error);
    return "offline";
  }
  return data === "ok" || data === "not_today" ? data : "invalid";
}

/**
 * Send a pair's work. Inserts the row, or updates only the student-owned
 * columns — empty / missing fields keep what is already stored, so this is
 * safe for partial updates such as one re-uploaded video.
 */
export async function savePupilSubmission(fields: {
  id: string;
  lesson_id: string;
  pair_number: number;
  skill_name: string;
  teacher_id?: string;
  status: string;
  claim_token?: string;
  pair_photo?: string;
  banana_video_url?: string;
  apple_video_url?: string;
  banana_cues?: unknown[];
  apple_cues?: unknown[];
  ai_student_feedback?: unknown;
  ai_teacher_report?: unknown;
  ai_chat_analysis?: unknown;
  first_attempts?: unknown;
  created_at?: string;
}): Promise<PupilWriteResult> {
  const { data, error } = await supabase.rpc("pupil_save_submission", {
    p: { ...fields, pass: getLessonPass(fields.lesson_id) },
  });
  if (error) {
    console.error("[CloudSync] pupil_save_submission error:", error);
    return "error";
  }
  return data === "claimed" || data === "invalid_lesson" || data === "locked" ? data : "ok";
}

/**
 * After a redo request: this performer keeps the work they already sent (#93).
 * Nothing changes except that it is marked as sent again, so it locks again.
 */
export async function keepPupilWork(fields: {
  id: string;
  lesson_id: string;
  claim_token: string;
  performer: "apple" | "banana";
}): Promise<PupilWriteResult> {
  const { data, error } = await supabase.rpc("pupil_keep_work", {
    p: { ...fields, pass: getLessonPass(fields.lesson_id) },
  });
  if (error) {
    console.error("[CloudSync] pupil_keep_work error:", error);
    return "error";
  }
  return data === "claimed" || data === "invalid_lesson" ? data : "ok";
}

/**
 * The steps of today's lesson (#87), with its pass. Null when refused (wrong
 * pass, not today) or offline; steps null = the legacy flow.
 */
export async function fetchPupilLessonSteps(
  lessonId: string,
): Promise<{ skillName: string; steps: LessonStep[] | null } | null> {
  const pass = getLessonPass(lessonId);
  if (!pass) return null;
  const { data, error } = await supabase.rpc("pupil_lesson_steps", { p_lesson_id: lessonId, p_pass: pass });
  if (error || !data) {
    if (error) console.warn("[CloudSync] pupil_lesson_steps error:", error);
    return null;
  }
  return { skillName: data.skill_name, steps: Array.isArray(data.steps) ? data.steps : null };
}

/** A pair's own submission, proven by its claim token. Null if none or not theirs. */
export async function fetchPupilSubmission(id: string, claimToken: string): Promise<PairSubmissionRecord | null> {
  const { data, error } = await supabase.rpc("pupil_get_submission", { p_id: id, p_claim_token: claimToken });
  if (error) {
    console.warn("[CloudSync] pupil_get_submission error:", error);
    return null;
  }
  return data ? mapRowToSubmission(data) : null;
}

/**
 * Turn a stored video reference into something a <video> can play. The
 * student-videos bucket is private, so stored public-style URLs are converted
 * to a signed URL valid for an hour. Local blob/data URLs pass through.
 */
export async function getPlayableVideoUrl(stored: string): Promise<string | null> {
  if (stored.startsWith("blob:") || stored.startsWith("data:")) return stored;
  const path = extractStoragePath(stored) ?? (stored.startsWith("http") ? null : stored);
  if (!path) return stored;
  const { data, error } = await supabase.storage.from("student-videos").createSignedUrl(path, 3600);
  if (error) {
    console.warn("[CloudSync] createSignedUrl error:", error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Fetch all student pair submissions for a given teacher from Supabase.
 * Allows the teacher to view all student videos from any phone, laptop, or tablet.
 */
export async function fetchTeacherSubmissions(
  teacherId?: string,
  lessonId?: string,
): Promise<PairSubmissionRecord[]> {
  try {
    const isValidUUID = teacherId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teacherId);

    let query = supabase
      .from("pair_submissions")
      .select("*")
      .order("created_at", { ascending: false });

    if (isValidUUID) {
      query = query.or(`teacher_id.eq.${teacherId},teacher_id.is.null`);
    }

    if (lessonId) {
      query = query.eq("lesson_id", lessonId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("[CloudSync] fetchTeacherSubmissions filtered query error, trying unconditional fetch:", error);
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("pair_submissions")
        .select("*")
        .order("created_at", { ascending: false });

      if (fallbackError) {
        console.error("[CloudSync] fetchTeacherSubmissions fallback error:", fallbackError);
        return [];
      }
      return (fallbackData || []).map(mapRowToSubmission);
    }

    return (data || []).map(mapRowToSubmission);
  } catch (e) {
    console.error("[CloudSync] fetchTeacherSubmissions unexpected error:", e);
    return [];
  }
}

/**
 * Update the review status, star, or feedback of a submission in Supabase cloud.
 */
export async function updateCloudSubmissionStatus(
  id: string,
  status: PairSubmissionRecord['status'],
  feedback?: string,
  star?: boolean,
): Promise<void> {
  try {
    const updatePayload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    // A redo request reopens a graded submission (supabase_submission_lock.sql)
    if (status === 'needs_redo') updatePayload.redo_requested_at = new Date().toISOString();
    if (feedback !== undefined) updatePayload.teacher_feedback = feedback;
    if (star !== undefined) updatePayload.teacher_star = star;

    const { error } = await supabase
      .from("pair_submissions")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      console.error("[CloudSync] updateCloudSubmissionStatus error:", error);
    }
  } catch (e) {
    console.error("[CloudSync] updateCloudSubmissionStatus unexpected error:", e);
  }
}

/**
 * Write ONLY the teacher's comment to a submission — no status transition.
 * Used by the "Send Feedback" button that ties to the student's submitted AI chat analysis.
 */
export async function updateCloudSubmissionFeedback(
  id: string,
  feedback: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("pair_submissions")
      .update({ teacher_feedback: feedback, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("[CloudSync] updateCloudSubmissionFeedback error:", error);
    }
  } catch (e) {
    console.error("[CloudSync] updateCloudSubmissionFeedback unexpected error:", e);
  }
}

// ─── Pair Check-In Sessions (Live Pair Check-In Grid) ─────────────────────────

export interface PairCheckInRow {
  id: string;
  lesson_id: string;
  pair_number: number;
  skill_name?: string;
  teacher_id?: string | null;
  pair_photo?: string | null;
  needs_help: boolean;
  checked_in_at: string;
  claim_token?: string | null;
  // The step the pair is on (#91; supabase_pair_steps.sql)
  step_id?: string | null;
  step_index?: number | null;
  step_finished?: boolean | null;
}

/**
 * Tell the teacher's board which step this pair is on (#91). Best effort: the
 * board just shows the last step it heard about.
 */
export async function reportPairStep(
  lessonId: string,
  pairNumber: number,
  claimToken: string,
  progress: { stepId?: string; index: number },
): Promise<void> {
  const { error } = await supabase.rpc("pupil_set_step", {
    p_lesson_id: lessonId,
    p_pass: getLessonPass(lessonId),
    p_pair_number: pairNumber,
    p_claim_token: claimToken,
    p_step_id: progress.stepId ?? null,
    p_step_index: progress.index,
    p_finished: !progress.stepId, // past the last step (lessonFlow.progressFor)
  });
  if (error) console.warn("[CloudSync] pupil_set_step error:", error);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upsert a pair's classroom check-in (pre-lineup selfie step) to Supabase so the
 * teacher's Command Board — running on a different device — can show it live.
 */
export async function upsertPairCheckIn(params: {
  lessonId: string;
  pairNumber: number;
  skillName?: string;
  teacherId?: string;
  pairPhoto?: string;
  needsHelp?: boolean;
  claimToken?: string;
}): Promise<{ blocked: boolean; invalidLesson?: boolean }> {
  // teacherId is no longer sent: the database uses the lesson's own teacher
  const { lessonId, pairNumber, skillName, pairPhoto, needsHelp, claimToken } = params;
  const { data, error } = await supabase.rpc("pupil_check_in", {
    p_lesson_id: lessonId,
    p_pass: getLessonPass(lessonId),
    p_pair_number: pairNumber,
    p_skill_name: skillName ?? null,
    p_pair_photo: pairPhoto ?? null,
    p_needs_help: needsHelp ?? false,
    p_claim_token: claimToken ?? null,
  });
  if (error) {
    console.error("[CloudSync] pupil_check_in error:", error);
    return { blocked: false };
  }
  if (data === "claimed") {
    console.warn(`[CloudSync] Pair ${pairNumber} already claimed by another group — check-in blocked`);
    return { blocked: true };
  }
  if (data === "invalid_lesson") return { blocked: false, invalidLesson: true };
  return { blocked: false };
}

/**
 * Clear a pair's classroom check-in (teacher control — "✕" on the check-in grid).
 * Removes only the pair_sessions row; any practice submission is deleted separately
 * from the Review Tray.
 */
export async function deletePairCheckIn(lessonId: string, pairNumber: number): Promise<void> {
  try {
    const { error } = await supabase
      .from("pair_sessions")
      .delete()
      .eq("id", `${lessonId}-p${pairNumber}`);
    if (error) console.error("[CloudSync] deletePairCheckIn error:", error);
  } catch (e) {
    console.error("[CloudSync] deletePairCheckIn unexpected error:", e);
  }
}

/**
 * Pair numbers already checked in for a lesson — used to grey out taken numbers
 * in the student's PairCheckInModal.
 */
export async function fetchClaimedPairNumbers(
  _teacherId?: string,
  lessonId?: string,
): Promise<Set<number>> {
  if (!lessonId) return new Set();
  const { data, error } = await supabase.rpc("pupil_claimed_pairs", {
    p_lesson_id: lessonId,
    p_pass: getLessonPass(lessonId),
  });
  if (error) {
    console.warn("[CloudSync] pupil_claimed_pairs error:", error);
    return new Set();
  }
  return new Set((data as number[] | null) ?? []);
}

/**
 * Fetch pair check-ins for the teacher's board. Mirrors fetchTeacherSubmissions:
 * scoped to the teacher (plus null teacher_id) when a valid UUID is given, with an
 * unconditional-fetch fallback if the filtered query errors.
 */
export async function fetchPairCheckIns(
  teacherId?: string,
  lessonId?: string,
): Promise<PairCheckInRow[]> {
  try {
    const isValidUUID = teacherId && UUID_RE.test(teacherId);

    let query = supabase
      .from("pair_sessions")
      .select("*")
      .order("checked_in_at", { ascending: false });

    if (isValidUUID) query = query.or(`teacher_id.eq.${teacherId},teacher_id.is.null`);
    if (lessonId) query = query.eq("lesson_id", lessonId);

    const { data, error } = await query;
    if (error) {
      console.warn("[CloudSync] fetchPairCheckIns filtered query error, trying unconditional fetch:", error);
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("pair_sessions")
        .select("*")
        .order("checked_in_at", { ascending: false });
      if (fallbackError) {
        console.error("[CloudSync] fetchPairCheckIns fallback error:", fallbackError);
        return [];
      }
      return (fallbackData || []) as PairCheckInRow[];
    }

    return (data || []) as PairCheckInRow[];
  } catch (e) {
    console.error("[CloudSync] fetchPairCheckIns unexpected error:", e);
    return [];
  }
}

/**
 * Extracts the storage object path from a Supabase public storage URL.
 * e.g. "https://xyz.supabase.co/storage/v1/object/public/student-videos/path/to/file.mp4"
 *   → "path/to/file.mp4"
 * Returns null if the URL doesn't match the expected Supabase storage pattern.
 */
function extractStoragePath(url: string): string | null {
  try {
    const marker = '/student-videos/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    // Decode URI components and strip any query string
    return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  } catch {
    return null;
  }
}

/**
 * Delete a submission from Supabase cloud — removes both the video files from
 * Storage AND the metadata row from the pair_submissions table.
 */
export async function deleteCloudSubmission(
  id: string,
  submission?: PairSubmissionRecord,
): Promise<void> {
  // 1. Delete video files from Storage (if we have the URLs)
  if (submission) {
    const videoUrls = [
      submission.appleRole.videoUrl,
      submission.bananaRole.videoUrl,
    ].filter(Boolean) as string[];

    const paths = videoUrls.map(extractStoragePath).filter(Boolean) as string[];

    if (paths.length > 0) {
      try {
        const { error: storageError } = await supabase.storage
          .from('student-videos')
          .remove(paths);
        if (storageError) {
          console.warn('[CloudSync] Storage file deletion partial error:', storageError.message);
        } else {
          console.log(`[CloudSync] Deleted ${paths.length} storage file(s) for submission ${id}`);
        }
      } catch (e) {
        console.warn('[CloudSync] Storage deletion unexpected error:', e);
      }
    }
  }

  // 2. Delete the metadata row from pair_submissions
  try {
    const { error } = await supabase
      .from('pair_submissions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[CloudSync] deleteCloudSubmission DB error:', error);
    }
  } catch (e) {
    console.error('[CloudSync] deleteCloudSubmission unexpected error:', e);
  }
}
