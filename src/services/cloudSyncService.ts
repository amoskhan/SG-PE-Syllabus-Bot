import { supabase } from "./db/supabaseClient";
import { PairSubmissionRecord, getDB } from "./offline/offlineStorage";

export async function backupSubmissionToSupabase(
  submission: PairSubmissionRecord,
  teacherId?: string,
): Promise<{
  bananaVideoUrl?: string;
  appleVideoUrl?: string;
}> {
  let bananaVideoUrl: string | undefined;
  let appleVideoUrl: string | undefined;

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
      banana_video_url: bananaVideoUrl,
      apple_video_url: appleVideoUrl,
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

