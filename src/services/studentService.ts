import { supabase } from './db/supabaseClient';
import { Student, SkillAnalysis } from '../types';

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

/** Returns a cached analysis for deduplication (same video + student + skill). */
export const lookupByVideoHash = async (
    videoHash: string,
    studentId: string,
    skillName: string
): Promise<SkillAnalysis | null> => {
    const { data, error } = await supabase
        .from('skill_analyses')
        .select('*')
        .eq('video_hash', videoHash)
        .eq('student_id', studentId)
        .eq('skill_name', skillName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) { console.error('lookupByVideoHash error:', error); return null; }
    return data ? mapAnalysis(data) : null;
};
