import { supabase } from './db/supabaseClient';
import { Student, SkillAnalysis } from '../types';
import { savePupilSubmission } from './cloudSyncService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mapStudent = (row: any): Student => ({
    id: row.id,
    teacherId: row.teacher_id,
    indexNumber: row.index_number,
    name: row.name,
    class: row.class ?? undefined,
    progressSummary: row.progress_summary ?? {},
    createdAt: new Date(row.created_at),
});

const mapAnalysis = (row: any): SkillAnalysis => ({
    id: row.id,
    studentId: row.student_id,
    skillName: row.skill_name,
    videoHash: row.video_hash ?? undefined,
    videoUrl: row.video_url ?? undefined,
    proficiencyLevel: row.proficiency_level ?? undefined,
    analysisText: row.analysis_text,
    sessionId: row.session_id ?? undefined,
    modelId: row.model_id ?? undefined,
    tokenUsage: row.token_usage ?? undefined,
    summarised: row.summarised ?? false,
    createdAt: new Date(row.created_at),
});

// ─── Students ─────────────────────────────────────────────────────────────────

export const getStudents = async (teacherId: string): Promise<Student[]> => {
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('class', { ascending: true })
        .order('name', { ascending: true });

    if (error) { console.error('getStudents error:', error); return []; }
    return (data ?? []).map(mapStudent);
};

export const getOrCreateStudent = async (
    teacherId: string,
    { indexNumber, name, studentClass }: { indexNumber: string; name: string; studentClass?: string }
): Promise<Student | null> => {
    // Try fetch first
    const { data: existing } = await supabase
        .from('students')
        .select('*')
        .eq('teacher_id', teacherId)
        .eq('index_number', indexNumber)
        .maybeSingle();

    if (existing) return mapStudent(existing);

    // Create new
    const { data: created, error } = await supabase
        .from('students')
        .insert({ teacher_id: teacherId, index_number: indexNumber, name, class: studentClass ?? null })
        .select()
        .single();

    if (error) { console.error('createStudent error:', error); return null; }
    return mapStudent(created);
};

// ─── Analyses ─────────────────────────────────────────────────────────────────

export const uploadVideoToStorage = async (
    file: File,
    teacherId: string,
    studentId: string,
    skillName: string,
): Promise<string | null> => {
    const ext = file.name.split('.').pop() || 'mp4';
    const safeName = skillName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const path = `${teacherId}/${studentId}/${safeName}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
        .from('student-videos')
        .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) { console.error('uploadVideo error:', error); return null; }
    return path;
};

/**
 * Upload a video blob from a student device using the teacher's ID from the QR code.
 * No authenticated user required — the teacherId comes from the scanned QR payload.
 * Path: student-videos/{teacherId}/pair_submissions/{lessonId}/pair_{pairNumber}/{performer}_{timestamp}.mp4
 */
export const uploadGuestVideo = async (
    blob: Blob,
    teacherId: string,
    lessonId: string,
    pairNumber: number,
    performer: 'apple' | 'banana',
    skillName: string,
    pairPhoto?: string,
    claimToken?: string,
): Promise<string | null> => {
    const safeName = skillName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const path = `${teacherId}/pair_submissions/${lessonId}/pair_${pairNumber}/${performer}_${safeName}_${Date.now()}.mp4`;
    const { error } = await supabase.storage
        .from('student-videos')
        .upload(path, blob, { cacheControl: '3600', upsert: false, contentType: 'video/mp4' });
    if (error) { console.error('[GuestUpload] error:', error); return null; }
    // The bucket is private: this URL just records where the file is. The teacher's
    // board turns it into a short-lived signed link to play it.
    const { data } = supabase.storage.from('student-videos').getPublicUrl(path);
    const publicUrl = data.publicUrl ?? null;

    if (publicUrl) {
      // Sync to pair_submissions so the teacher Review Tray shows the clip live.
      // Only this performer's video column is sent; everything else is kept.
      const safeSkill = skillName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const result = await savePupilSubmission({
        id: `sub-${lessonId}-p${pairNumber}-${safeSkill}`,
        lesson_id: lessonId,
        pair_number: pairNumber,
        skill_name: skillName,
        teacher_id: teacherId,
        status: 'pending_sync',
        claim_token: claimToken,
        pair_photo: pairPhoto,
        [performer === 'banana' ? 'banana_video_url' : 'apple_video_url']: publicUrl,
      });
      if (result === 'claimed') console.warn('[GuestUpload] row owned by another group — DB sync skipped');
    }

    return publicUrl;
};


/**
 * Unified peer session upload — uploads both Apple and Banana performer videos
 * to Supabase Storage with the correct contentType (critical for iOS Safari),
 * then does ONE upsert to pair_submissions with full data including cues.
 *
 * This is the SINGLE source of truth for the student "Send to Teacher" action.
 * Called by PeerCoachingSession.handleSubmitSession when teacherId is available (QR scanned).
 */
export const uploadPeerSessionToTeacher = async (params: {
  teacherId: string;
  lessonId: string;
  pairNumber: number;
  skillName: string;
  pairPhoto?: string;
  bananaBlob?: Blob;   // Video of Banana PERFORMING (recorded by Apple)
  appleBlob?: Blob;    // Video of Apple PERFORMING (recorded by Banana)
  bananaCues?: any[];
  appleCues?: any[];
  claimToken?: string; // identifies the group that owns this pair
}): Promise<{ bananaVideoUrl?: string; appleVideoUrl?: string; success: boolean; blocked?: boolean }> => {
  const { teacherId, lessonId, pairNumber, skillName, pairPhoto, bananaBlob, appleBlob, bananaCues, appleCues, claimToken } = params;
  const safeName = skillName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const subId = `sub-${lessonId}-p${pairNumber}-${safeName}`;
  const ts = Date.now();

  let bananaVideoUrl: string | undefined;
  let appleVideoUrl: string | undefined;

  // ── Upload Banana performer video ──────────────────────────────────────────
  if (bananaBlob && bananaBlob.size > 0) {
    const path = `${teacherId}/pair_submissions/${lessonId}/pair_${pairNumber}/banana_${safeName}_${ts}.mp4`;
    console.log('[Upload] Uploading banana video to:', path, 'size:', bananaBlob.size);
    const { error } = await supabase.storage
      .from('student-videos')
      .upload(path, bananaBlob, { cacheControl: '3600', upsert: false, contentType: 'video/mp4' });
    if (error) {
      console.error('[Upload] Banana video upload FAILED:', error.message, error);
    } else {
      const { data } = supabase.storage.from('student-videos').getPublicUrl(path);
      bananaVideoUrl = data.publicUrl;
      console.log('[Upload] Banana video uploaded ✓', bananaVideoUrl);
    }
  }

  // ── Upload Apple performer video ───────────────────────────────────────────
  if (appleBlob && appleBlob.size > 0) {
    const path = `${teacherId}/pair_submissions/${lessonId}/pair_${pairNumber}/apple_${safeName}_${ts}.mp4`;
    console.log('[Upload] Uploading apple video to:', path, 'size:', appleBlob.size);
    const { error } = await supabase.storage
      .from('student-videos')
      .upload(path, appleBlob, { cacheControl: '3600', upsert: false, contentType: 'video/mp4' });
    if (error) {
      console.error('[Upload] Apple video upload FAILED:', error.message, error);
    } else {
      const { data } = supabase.storage.from('student-videos').getPublicUrl(path);
      appleVideoUrl = data.publicUrl;
      console.log('[Upload] Apple video uploaded ✓', appleVideoUrl);
    }
  }

  // ── Insert if new, else update ONLY student-owned columns ──────────────────
  // pupil_save_submission keeps anything not sent (teacher feedback, star, AI
  // analysis), and trg_protect_teacher_columns is the server-side backstop.
  const result = await savePupilSubmission({
    id: subId,
    lesson_id: lessonId,
    pair_number: pairNumber,
    skill_name: skillName,
    teacher_id: teacherId,
    status: 'pending_sync', // trigger maps to 'resubmitted' if already reviewed
    claim_token: claimToken,
    pair_photo: pairPhoto,
    banana_video_url: bananaVideoUrl,
    apple_video_url: appleVideoUrl,
    banana_cues: bananaCues,
    apple_cues: appleCues,
  });
  if (result === 'claimed') {
    console.warn('[Upload] pair_submissions row owned by another group — blocked');
    return { bananaVideoUrl, appleVideoUrl, success: false, blocked: true };
  }
  if (result === 'error') return { bananaVideoUrl, appleVideoUrl, success: false };

  console.log('[Upload] pair_submissions written successfully ✓');
  return { bananaVideoUrl, appleVideoUrl, success: true };
};



export const getSignedVideoUrl = async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
        .from('student-videos')
        .createSignedUrl(storagePath, 3600); // 1-hour expiry
    if (error) { console.error('getSignedUrl error:', error); return null; }
    return data.signedUrl;
};

export const saveAnalysis = async (entry: {
    studentId: string;
    teacherId: string;
    skillName: string;
    videoHash?: string;
    videoUrl?: string;
    proficiencyLevel?: string;
    analysisText: string;
    poseData?: any[];
    sessionId?: string;
    modelId?: string;
    tokenUsage?: number;
}): Promise<void> => {
    const { error } = await supabase.from('skill_analyses').insert({
        student_id: entry.studentId,
        teacher_id: entry.teacherId,
        skill_name: entry.skillName,
        video_hash: entry.videoHash ?? null,
        video_url: entry.videoUrl ?? null,
        proficiency_level: entry.proficiencyLevel ?? null,
        analysis_text: entry.analysisText,
        pose_data: entry.poseData ? entry.poseData : null,
        session_id: entry.sessionId ?? null,
        model_id: entry.modelId ?? null,
        token_usage: entry.tokenUsage ?? null,
        summarised: false,
    });
    if (error) console.error('saveAnalysis error:', error);
};

export const getAnalysisHistory = async (studentId: string): Promise<SkillAnalysis[]> => {
    const { data, error } = await supabase
        .from('skill_analyses')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

    if (error) { console.error('getAnalysisHistory error:', error); return []; }
    return (data ?? []).map(mapAnalysis);
};

