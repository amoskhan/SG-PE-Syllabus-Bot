import React, { useRef, useState } from 'react';
import { TeachPage } from '../../utils/teachPages';

// A Teach step's pages (#88): swipe, or tap the arrows/dots, one page at a
// time. A picture opens full screen when tapped.

const PageBody: React.FC<{ page: TeachPage; onZoom: (src: string) => void }> = ({ page, onZoom }) => {
  if (page.kind === 'reference') {
    return (
      <button type="button" onClick={() => onZoom(page.src)} className="w-full h-full flex flex-col items-center justify-center gap-2 cursor-zoom-in">
        <img src={page.src} alt={`${page.skillName}: how it looks`} className="max-w-full max-h-full rounded-2xl bg-white object-contain" />
        <span className="text-[11px] text-slate-400">Tap to see it bigger</span>
      </button>
    );
  }
  return (
    <div className="w-full h-full overflow-y-auto overscroll-contain">
      <p className="text-xs font-black uppercase tracking-wider text-emerald-300 mb-2">Cues for {page.skillName}</p>
      <ol className="flex flex-col gap-2">
        {page.cues.map((c, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl bg-slate-800 border border-slate-700 px-3.5 py-3 text-left">
            <span className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-black flex items-center justify-center">{i + 1}</span>
            <span className="shrink-0 text-xl leading-7">{c.icon}</span>
            <span className="min-w-0">
              <span className="block text-base font-black text-white leading-snug">{c.text}</span>
              {c.detail && <span className="block text-sm text-slate-300 leading-snug mt-0.5">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export const TeachPager: React.FC<{ pages: TeachPage[] }> = ({ pages }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  };

  if (pages.length === 0) return null;
  return (
    <div className="w-full flex-1 min-h-0 flex flex-col gap-3">
      <div
        ref={trackRef}
        onScroll={(e) => {
          const t = e.currentTarget;
          setAt(Math.round(t.scrollLeft / Math.max(t.clientWidth, 1)));
        }}
        className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((page, i) => (
          <div key={i} className="w-full shrink-0 snap-center px-0.5">
            <PageBody page={page} onZoom={setZoom} />
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="shrink-0 flex items-center justify-between gap-3">
          <button type="button" disabled={at === 0} onClick={() => goTo(at - 1)} aria-label="Previous page"
            className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 text-lg font-black disabled:opacity-30">‹</button>
          <div className="flex items-center gap-2">
            {pages.map((_, i) => (
              <button key={i} type="button" onClick={() => goTo(i)} aria-label={`Page ${i + 1} of ${pages.length}`}
                className={`h-2.5 rounded-full transition-all ${i === at ? 'w-6 bg-emerald-400' : 'w-2.5 bg-slate-600'}`} />
            ))}
          </div>
          <button type="button" disabled={at === pages.length - 1} onClick={() => goTo(at + 1)} aria-label="Next page"
            className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 text-lg font-black disabled:opacity-30">›</button>
        </div>
      )}

      {zoom && (
        <button type="button" onClick={() => setZoom(null)} aria-label="Close picture"
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-3 cursor-zoom-out">
          <img src={zoom} alt="" className="max-w-full max-h-full object-contain rounded-xl bg-white" />
        </button>
      )}
    </div>
  );
};
