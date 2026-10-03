import { supabase } from './db/supabaseClient';
import type { LessonStep, TeachMedia } from '../utils/lessonFlow';
import type { LessonKeys } from './lessonService';

// The teacher's own videos and pictures on Teach steps (#89). Private bucket,
// one folder per lesson that includes the lesson's pupil pass, so a pupil's
// device can open them only with the pass and only on the lesson's date
// (supabase_teach_media.sql). Pupils get short-lived signed links.

const BUCKET = 'teach-media';
export const TEACH_MEDIA_MAX_MB = 50; // the bucket's limit (Supabase free plan)
const SIGNED_LINK_SECONDS = 60 * 60;   // long enough for a lesson's Teach step

/** 'video' | 'image' for a file the bucket accepts, else null. */
export const teachMediaType = (file: File): TeachMedia['type'] | null =>
  file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;

/**
 * Upload one file into the lesson's folder, reporting progress (0–1). Uses the
 * Storage REST endpoint directly because supabase-js doesn't report progress.
 */
export const uploadTeachMedia = async (
  file: File,
  teacherId: string,
  lesson: LessonKeys,
  onProgress?: (fraction: number) => void,
): Promise<TeachMedia> => {
  const type = teachMediaType(file);
  if (!type) throw new Error('Only videos and pictures can be added.');
  if (file.size > TEACH_MEDIA_MAX_MB * 1024 * 1024) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is ${TEACH_MEDIA_MAX_MB} MB: try a shorter video.`);
  }

  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || type;
  const path = `${teacherId}/${lesson.id}/${lesson.pupilPass}/${Date.now()}-${safe}`;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in again to upload.');

  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', key);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(xhr.status === 413 ? `That file is over ${TEACH_MEDIA_MAX_MB} MB.` : `Upload failed (${xhr.status}). Try again.`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check the internet and try again.'));
    xhr.send(file);
  });
  return { type, path, caption: undefined };
};

/** Every teach media path in a lesson's steps. */
export const mediaPaths = (steps: LessonStep[]): string[] =>
  steps.flatMap(s => s.teach?.media?.map(m => m.path) ?? []);

/** Delete files no longer used (best effort: a leftover file is only storage). */
export const removeTeachMedia = async (paths: string[]): Promise<void> => {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('[TeachMedia] could not remove:', error.message);
};

/** Short-lived links to play or show the files, by path. Missing ones are left out. */
export const signTeachMedia = async (paths: string[]): Promise<Record<string, string>> => {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_LINK_SECONDS);
  if (error) {
    console.warn('[TeachMedia] could not sign links:', error.message);
    return {};
  }
  return Object.fromEntries((data ?? []).filter(d => d.signedUrl && d.path).map(d => [d.path as string, d.signedUrl]));
};
