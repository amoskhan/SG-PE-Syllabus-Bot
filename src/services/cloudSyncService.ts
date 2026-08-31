import { supabase } from "./db/supabaseClient";
import { PairSubmissionRecord, getDB } from "./offline/offlineStorage";

export async function backupSubmissionToSupabase(
  submission: PairSubmissionRecord,
  teacherId?: string,
): Promise<{
  bananaVideoUrl?: string;
  appleVideoUrl?: string;
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

  try {
    await supabase.from("pair_submissions").upsert({
      id: submission.id,
      lesson_id: submission.lessonId,
      pair_number: submission.pairNumber,
      skill_name: submission.skillName,
      teacher_id: teacherId ?? null,
      pair_photo: submission.pairPhoto || null,
      banana_video_url: bananaVideoUrl || null,
      apple_video_url: appleVideoUrl || null,
      banana_cues: submission.appleRole.cues || [],
      apple_cues: submission.bananaRole.cues || [],
      ai_student_feedback: submission.aiStudentFeedback ?? null,
      ai_teacher_report: submission.aiTeacherReport ?? null,
      status: submission.status,
      created_at: submission.createdAt,
    });
  } catch (e) {
    console.warn("[CloudBackup] Supabase DB metadata sync note:", e);
  }

  return { bananaVideoUrl, appleVideoUrl };
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
    let query = supabase
      .from("pair_submissions")
      .select("*")
      .order("created_at", { ascending: false });

    if (teacherId) {
      query = query.or(`teacher_id.eq.${teacherId},teacher_id.is.null`);
    }

    if (lessonId) {
      query = query.eq("lesson_id", lessonId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[CloudSync] fetchTeacherSubmissions error:", error);
      return [];
    }

    return (data || []).map((row: any): PairSubmissionRecord => ({
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
      status: row.status || 'pending_sync',
      teacherFeedback: row.teacher_feedback || undefined,
      teacherStar: row.teacher_star || false,
      createdAt: row.created_at || new Date().toISOString(),
    }));
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
