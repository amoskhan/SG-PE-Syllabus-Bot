import { supabase } from "./db/supabaseClient";
import { PairSubmissionRecord, getDB } from "./offline/offlineStorage";

export async function backupSubmissionToSupabase(
  submission: PairSubmissionRecord,
  teacherId?: string,
  claimToken?: string,
): Promise<{
  bananaVideoUrl?: string;
  appleVideoUrl?: string;
  blocked?: boolean;
}> {
  let bananaVideoUrl: string | undefined = submission.appleRole.videoUrl;
  let appleVideoUrl: string | undefined = submission.bananaRole.videoUrl;

  const timestamp = Date.now();
  // If teacherId provided (from QR), nest under teacher folder so it appears in their dashboard
  const base = teacherId
    ? `${teacherId}/pair_submissions/lesson_${submission.lessonId}`
    : `pair_submissions/lesson_${submission.lessonId}`;
  const folder = `${base}/pair_${submission.pairNumber}_${timestamp}`;

  if (submission.appleRole.videoBlob) {
    try {
      const path = `${folder}/banana_performer.mp4`;
      const { error } = await supabase.storage
        .from("student-videos")
        .upload(path, submission.appleRole.videoBlob, { cacheControl: "3600", upsert: true });

      if (!error) {
        const { data } = supabase.storage.from("student-videos").getPublicUrl(path);
        bananaVideoUrl = data.publicUrl;
      }
    } catch (e) {
      console.warn("[CloudBackup] Banana video upload failed:", e);
    }
  }

  if (submission.bananaRole.videoBlob) {
    try {
      const path = `${folder}/apple_performer.mp4`;
      const { error } = await supabase.storage
        .from("student-videos")
        .upload(path, submission.bananaRole.videoBlob, { cacheControl: "3600", upsert: true });

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
      const db = await getDB();
      const record = await db.get("submissions", submission.id);
      if (record) {
        if (bananaVideoUrl) record.appleRole.videoUrl = bananaVideoUrl;
        if (appleVideoUrl) record.bananaRole.videoUrl = appleVideoUrl;
        record.syncedAt = new Date().toISOString();
        await db.put("submissions", record);
        console.log("[CloudBackup] Submission record updated with Supabase video URLs ✓");
      }
    } catch (e) {
      console.warn("[CloudBackup] IndexedDB URL update failed:", e);
    }
  }

  const validTeacherId = (teacherId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teacherId)) ? teacherId : null;
  const token = claimToken ?? submission.claimToken;

  // Never blind-upsert the whole row: an omitted column would be nulled by
  // supabase-js (defaultToNull), which is how teacher_feedback / teacher_star /
  // ai_* used to vanish on a student re-upload. Instead: insert if new, else
  // update ONLY the student-owned columns. The DB trigger (protect_teacher_columns)
  // is the belt-and-braces guarantee.
  try {
    const { data: existing } = await supabase
      .from("pair_submissions")
      .select("id, claim_token")
      .eq("id", submission.id)
      .maybeSingle();

    if (existing) {
      if (existing.claim_token && token && existing.claim_token !== token) {
        console.warn(`[CloudBackup] submission ${submission.id} owned by another group — write blocked`);
        return { bananaVideoUrl, appleVideoUrl, blocked: true };
      }
      const updatePayload: Record<string, any> = {
        skill_name: submission.skillName,
        banana_cues: submission.appleRole.cues || [],
        apple_cues: submission.bananaRole.cues || [],
        status: submission.status, // trigger maps to 'resubmitted' if already reviewed
        updated_at: new Date().toISOString(),
      };
      if (submission.pairPhoto) updatePayload.pair_photo = submission.pairPhoto;
      if (bananaVideoUrl) updatePayload.banana_video_url = bananaVideoUrl;
      if (appleVideoUrl) updatePayload.apple_video_url = appleVideoUrl;
      if (submission.aiStudentFeedback) updatePayload.ai_student_feedback = submission.aiStudentFeedback;
      if (submission.aiTeacherReport) updatePayload.ai_teacher_report = submission.aiTeacherReport;
      if (submission.aiChatAnalysis) updatePayload.ai_chat_analysis = submission.aiChatAnalysis;
      if (token) updatePayload.claim_token = token;

      const { error: updErr } = await supabase
        .from("pair_submissions")
        .update(updatePayload)
        .eq("id", submission.id);
      if (updErr) {
        if (String(updErr.message || "").includes("PAIR_CLAIMED")) {
          return { bananaVideoUrl, appleVideoUrl, blocked: true };
        }
        console.error("[CloudBackup] Supabase DB metadata update error:", updErr);
      } else {
        console.log(`[CloudBackup] Updated submission ${submission.id} (student columns only) ✓`);
      }
    } else {
      const { error: insErr } = await supabase.from("pair_submissions").insert({
        id: submission.id,
        lesson_id: submission.lessonId,
        pair_number: submission.pairNumber,
        skill_name: submission.skillName,
        teacher_id: validTeacherId,
        pair_photo: submission.pairPhoto || null,
        banana_video_url: bananaVideoUrl || null,
        apple_video_url: appleVideoUrl || null,
        banana_cues: submission.appleRole.cues || [],
        apple_cues: submission.bananaRole.cues || [],
        ai_student_feedback: submission.aiStudentFeedback ?? null,
        ai_teacher_report: submission.aiTeacherReport ?? null,
        ai_chat_analysis: submission.aiChatAnalysis ?? null,
        status: submission.status,
        created_at: submission.createdAt,
        claim_token: token ?? null,
      });
      if (insErr) {
        if (String(insErr.message || "").includes("PAIR_CLAIMED")) {
          return { bananaVideoUrl, appleVideoUrl, blocked: true };
        }
        console.error("[CloudBackup] Supabase DB metadata insert error:", insErr);
      } else {
        console.log(`[CloudBackup] Inserted submission ${submission.id} to Supabase ✓`);
      }
    }
  } catch (e) {
    console.warn("[CloudBackup] Supabase DB metadata sync note:", e);
  }

  return { bananaVideoUrl, appleVideoUrl };
}

function mapRowToSubmission(row: any): PairSubmissionRecord {
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
    status: row.status || 'pending_sync',
    teacherFeedback: row.teacher_feedback || undefined,
    teacherStar: row.teacher_star || false,
    createdAt: row.created_at || new Date().toISOString(),
    claimToken: row.claim_token || undefined,
  };
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
}): Promise<{ blocked: boolean }> {
  const { lessonId, pairNumber, skillName, teacherId, pairPhoto, needsHelp, claimToken } = params;
  const id = `${lessonId}-p${pairNumber}`;

  // Collision guard: if this pair number is already claimed by another group, block.
  if (claimToken) {
    try {
      const { data: existing } = await supabase
        .from("pair_sessions")
        .select("claim_token")
        .eq("id", id)
        .maybeSingle();
      if (existing?.claim_token && existing.claim_token !== claimToken) {
        console.warn(`[CloudSync] Pair ${pairNumber} already claimed by another group — check-in blocked`);
        return { blocked: true };
      }
    } catch (e) {
      console.warn("[CloudSync] upsertPairCheckIn claim pre-check failed (continuing):", e);
    }
  }

  const payload: Record<string, any> = {
    id,
    lesson_id: lessonId,
    pair_number: pairNumber,
    skill_name: skillName ?? null,
    teacher_id: teacherId && UUID_RE.test(teacherId) ? teacherId : null,
    needs_help: needsHelp ?? false,
    updated_at: new Date().toISOString(),
  };
  if (pairPhoto) payload.pair_photo = pairPhoto;
  if (claimToken) payload.claim_token = claimToken;

  try {
    const { error } = await supabase
      .from("pair_sessions")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      if (String(error.message || "").includes("PAIR_CLAIMED")) return { blocked: true };
      console.error("[CloudSync] upsertPairCheckIn error:", error);
    }
  } catch (e) {
    console.error("[CloudSync] upsertPairCheckIn unexpected error:", e);
  }
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
  teacherId?: string,
  lessonId?: string,
): Promise<Set<number>> {
  const rows = await fetchPairCheckIns(teacherId, lessonId);
  return new Set(rows.map((r) => r.pair_number));
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
