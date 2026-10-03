import React, { useEffect, useRef, useState } from 'react';
import type { TeachMedia } from '../../utils/lessonFlow';
import { TEACH_MEDIA_MAX_MB, signTeachMedia } from '../../services/teachMediaService';

// The teacher's own videos and pictures on a Teach step (#89): a model
// performance, the teacher demonstrating, a photo of a rubric. Pupils see
// them first, as pages, in this order.

export type UploadMedia = (file: File, onProgress: (fraction: number) => void) => Promise<TeachMedia>;

// Changes are given as functions of the latest list: an upload can finish
// after the teacher has edited other things.
export type MediaChange = (change: (media: TeachMedia[]) => TeachMedia[]) => void;

interface TeachMediaEditorProps {
  media: TeachMedia[];
  onChange: MediaChange;
  onUpload?: UploadMedia; // missing when not signed in
}

const Thumb: React.FC<{ item: TeachMedia }> = ({ item }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    signTeachMedia([item.path]).then(l => { if (!cancelled) setSrc(l[item.path] ?? null); });
    return () => { cancelled = true; };
  }, [item.path]);
  const box = 'w-24 h-16 shrink-0 rounded-lg bg-slate-900 overflow-hidden flex items-center justify-center text-xl';
  if (!src) return <div className={box}>{item.type === 'video' ? '🎬' : '🖼️'}</div>;
  return item.type === 'video'
    ? <video src={src} muted playsInline preload="metadata" className={`${box} object-cover`} />
    : <img src={src} alt="" className={`${box} object-cover`} />;
};

interface Uploading { id: number; name: string; progress: number; error?: string }

export const TeachMediaEditor: React.FC<TeachMediaEditorProps> = ({ media, onChange, onUpload }) => {
  const pickRef = useRef<HTMLInputElement>(null);
  const filmRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<Uploading[]>([]);

  const upload = async (files: FileList | null) => {
    if (!files || !onUpload) return;
    for (const file of Array.from(files)) {
      const id = Date.now() + Math.random();
      setUploading(u => [...u, { id, name: file.name, progress: 0 }]);
      try {
        const item = await onUpload(file, p => setUploading(u => u.map(x => (x.id === id ? { ...x, progress: p } : x))));
        onChange(prev => [...prev, item]);
        setUploading(u => u.filter(x => x.id !== id));
      } catch (e) {
        setUploading(u => u.map(x => (x.id === id ? { ...x, error: e instanceof Error ? e.message : 'Upload failed.' } : x)));
      }
    }
  };

  const update = (i: number, patch: Partial<TeachMedia>) => onChange(prev => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i: number, by: -1 | 1) => onChange(prev => {
    const next = [...prev];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return next;
  });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white/70 dark:bg-zinc-900/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Your videos and pictures</span>
        <span className="text-[10px] text-slate-400">Up to {TEACH_MEDIA_MAX_MB} MB each · pupils see these first</span>
      </div>

      {media.map((m, i) => (
        <div key={m.path} className="flex items-center gap-2">
          <Thumb item={m} />
          <input
            type="text"
            maxLength={120}
            value={m.caption ?? ''}
            onChange={(e) => update(i, { caption: e.target.value || undefined })}
            placeholder={m.type === 'video' ? 'Caption, e.g. Watch my stepping foot' : 'Caption (optional)'}
            className="min-w-0 flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-white"
          />
          <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"
            className="w-7 h-7 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs disabled:opacity-30 cursor-pointer">↑</button>
          <button type="button" disabled={i === media.length - 1} onClick={() => move(i, 1)} aria-label="Move down"
            className="w-7 h-7 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs disabled:opacity-30 cursor-pointer">↓</button>
          <button type="button" onClick={() => onChange(prev => prev.filter((_, j) => j !== i))} aria-label="Remove"
            className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/30 text-red-600 text-xs cursor-pointer">✕</button>
        </div>
      ))}

      {uploading.map(u => (
        <div key={u.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
            <span className="truncate text-slate-600 dark:text-slate-300">{u.name}</span>
            {u.error
              ? <button type="button" onClick={() => setUploading(x => x.filter(y => y.id !== u.id))} className="shrink-0 text-slate-400 cursor-pointer">Dismiss</button>
              : <span className="shrink-0 text-slate-400">{Math.round(u.progress * 100)}%</span>}
          </div>
          {u.error
            ? <p role="alert" className="text-[11px] font-bold text-red-600 dark:text-red-400">{u.error}</p>
            : <div className="h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${u.progress * 100}%` }} /></div>}
        </div>
      ))}

      <input ref={pickRef} type="file" multiple accept="video/*,image/*" className="hidden"
        onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      <input ref={filmRef} type="file" accept="video/*" capture="environment" className="hidden"
        onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      {onUpload ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => pickRef.current?.click()}
            className="px-3 py-1.5 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer">
            ＋ Add videos or pictures
          </button>
          <button type="button" onClick={() => filmRef.current?.click()}
            className="px-3 py-1.5 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer">
            🎥 Film a demo
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">Sign in to add your own videos and pictures.</p>
      )}
    </div>
  );
};
