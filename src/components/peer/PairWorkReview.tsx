import React, { useEffect, useState } from 'react';
import type { AttemptSnapshot, PairSubmissionRecord, PeerCueResult } from '../../services/offline/offlineStorage';
import { currentAttempt, Performer, performerKey, PerformerStage, Stage } from '../../utils/pairWork';
import MarkdownRenderer from '../chat/MarkdownRenderer';

// "Our work": what a pair has done so far (#94). Shows each performer's
// video(s), the peer checklist, the AI analysis and the teacher's feedback.
// Nothing here changes the work; filming again and the final submission
// happen in the Practice Station.
//
// The page body doesn't scroll (index.html), so this screen is a fixed-height
// column whose middle part scrolls.

interface PairWorkReviewProps {
  pairNumber: number;
  skillName: string;
  record: PairSubmissionRecord | null;     // this device's copy, else the teacher's
  onDevice: boolean;                       // false: videos aren't on this device
  teacherFeedback?: string;
  teacherStar?: boolean;
  stageFor: (p: Performer) => PerformerStage & { redo: boolean };
  onOpenPracticeStation: () => void;
  onStartRecording: () => void;
  onClose: () => void;
}

const STAGE_TEXT: Record<Stage, string> = {
  not_started: 'Not filmed yet',
  needs_ticks: 'Assessor: tick the cues for this video',
  needs_analysis: 'Next: ask Coach Bot to analyse this video',
  ready: 'Ready to submit your final recording',
  submitted: 'Final recording submitted',
};

const THEME: Record<Performer, { icon: string; tab: string; ring: string; soft: string }> = {
  Banana: { icon: '🍌', tab: 'bg-amber-400 text-amber-950', ring: 'border-amber-400/60', soft: 'bg-amber-400/10' },
  Apple: { icon: '🍎', tab: 'bg-rose-500 text-white', ring: 'border-rose-500/60', soft: 'bg-rose-500/10' },
};

const ClipPlayer: React.FC<{ blob?: Blob; label: string; sent?: boolean }> = ({ blob, label, sent }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || !blob.size) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-slate-800/70 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-1 text-center p-4">
        <span className="text-3xl">{sent ? '📤' : '📹'}</span>
        <span className="text-sm font-bold text-slate-300">
          {sent ? `${label}'s video is with your teacher` : `No video of ${label} yet`}
        </span>
      </div>
    );
  }
  return <video src={url} controls playsInline className="w-full aspect-video rounded-2xl bg-black object-contain" />;
};

const Checklist: React.FC<{ cues: PeerCueResult[] }> = ({ cues }) => {
  if (cues.length === 0) return <p className="text-sm text-slate-400">No cues ticked yet.</p>;
  const met = cues.filter(c => c.isObserved).length;
  return (
    <div>
      <p className="text-sm font-black text-white mb-2">
        {met} of {cues.length} cues <span className="text-emerald-400">✅</span>
      </p>
      <ul className="space-y-1.5">
        {cues.map(c => (
          <li
            key={c.cueIndex}
            className={`flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm leading-snug ${
              c.isObserved ? 'bg-emerald-500/10 text-emerald-50' : 'bg-slate-800/80 text-slate-300'}`}
          >
            <span className="shrink-0">{c.isObserved ? '✅' : '⬜'}</span>
            <span>{c.criterionText}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Folder: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <details className="group rounded-2xl bg-slate-800/70 border border-slate-700">
    <summary className="list-none flex items-center justify-between gap-2 px-4 py-3.5 cursor-pointer select-none">
      <span className="text-sm font-black text-white">{title}</span>
      <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <div className="px-4 pb-4">{children}</div>
  </details>
);

const PerformerPanel: React.FC<{
  performer: Performer;
  record: PairSubmissionRecord;
  stage: PerformerStage & { redo: boolean };
  onDevice: boolean;
}> = ({ performer, record, stage, onDevice }) => {
  const k = performerKey(performer);
  const attempt = currentAttempt(record, performer);
  const first: AttemptSnapshot | undefined = record.firstAttempt?.[k];
  const analysis = record.aiChatAnalysis?.[k] ?? record.pendingAnalysis?.[k];
  const sent = stage.stage === 'submitted' || stage.redo;
  const t = THEME[performer];

  // Off the recording device the next steps can't be done here: just saved / submitted
  const status = stage.redo
    ? { icon: '🔄', text: 'Your teacher asked you to try again', tone: 'bg-amber-500/15 border-amber-400/50 text-amber-200' }
    : stage.stage === 'submitted'
      ? { icon: '✅', text: STAGE_TEXT.submitted, tone: 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200' }
      : !onDevice && stage.stage !== 'not_started'
        ? { icon: '💾', text: 'Saved, not submitted yet', tone: 'bg-slate-800 border-slate-700 text-slate-200' }
        : { icon: '👉', text: STAGE_TEXT[stage.stage], tone: 'bg-indigo-500/15 border-indigo-400/50 text-indigo-100' };

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${status.tone}`}>
        <span className="text-2xl">{status.icon}</span>
        <p className="text-sm font-black leading-snug">{status.text}</p>
      </div>

      <div className={`rounded-3xl border-2 ${t.ring} ${t.soft} p-3`}>
        <p className="text-xs font-bold text-slate-300 mb-2 px-1">{first ? 'Final attempt' : 'Your video'}</p>
        <ClipPlayer blob={attempt.videoBlob} label={performer} sent={sent || !!attempt.videoUrl} />
      </div>

      <div className="rounded-3xl bg-slate-800/50 border border-slate-700 p-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Peer checklist</p>
        <Checklist cues={attempt.cues ?? []} />
      </div>

      {analysis && (
        <Folder title={`🤖 Coach Bot's analysis${first && analysis.analysedClip ? ' (first attempt)' : ''}`}>
          <div className="text-sm text-slate-200 prose prose-invert prose-sm max-w-none">
            <MarkdownRenderer content={analysis.analysisText} />
          </div>
        </Folder>
      )}

      {first && (
        <Folder title="🎬 First attempt">
          <div className="space-y-3">
            <ClipPlayer blob={first.videoBlob} label={`${performer}'s first attempt`} sent={!!first.videoUrl} />
            <Checklist cues={first.cues} />
          </div>
        </Folder>
      )}
    </div>
  );
};

export const PairWorkReview: React.FC<PairWorkReviewProps> = ({
  pairNumber,
  skillName,
  record,
  onDevice,
  teacherFeedback,
  teacherStar,
  stageFor,
  onOpenPracticeStation,
  onStartRecording,
  onClose,
}) => {
  const [tab, setTab] = useState<Performer>('Banana');

  return (
    <div className="h-[100dvh] w-full bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-slate-950/90 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-base font-black text-white">📋 Our work · Pair #{pairNumber}</h1>
          <p className="text-xs text-slate-400 font-semibold truncate">{skillName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 h-10 px-4 rounded-xl bg-slate-800 border border-slate-700 text-sm font-bold text-slate-200 active:scale-95"
        >
          ← Home
        </button>
      </div>

      {/* Scrolling middle */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="w-full max-w-xl mx-auto px-4 py-4 space-y-4">
          {(teacherFeedback || teacherStar) && (
            <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-4 shadow-lg shadow-indigo-900/40">
              <p className="text-xs font-black uppercase tracking-wider text-indigo-100 mb-1">
                {teacherStar ? '⭐ ' : '💬 '}From your teacher
              </p>
              {teacherFeedback && <p className="text-base font-bold text-white leading-snug">{teacherFeedback}</p>}
            </div>
          )}

          {record && !onDevice && (
            <p className="text-xs text-slate-400 text-center px-2">
              This isn't the device you recorded on, so your videos are on your teacher's tray instead.
            </p>
          )}

          {record ? (
            <>
              {/* One pupil at a time */}
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-800 border border-slate-700">
                {(['Banana', 'Apple'] as const).map(p => {
                  const st = stageFor(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTab(p)}
                      className={`h-12 rounded-xl text-base font-black flex items-center justify-center gap-1.5 transition-all ${
                        tab === p ? `${THEME[p].tab} shadow-md` : 'text-slate-300'}`}
                    >
                      <span>{THEME[p].icon}</span>
                      <span>{p}</span>
                      {st.stage === 'submitted' && <span className="text-sm">✅</span>}
                      {st.redo && <span className="text-sm">🔄</span>}
                    </button>
                  );
                })}
              </div>
              <PerformerPanel performer={tab} record={record} stage={stageFor(tab)} onDevice={onDevice} />
            </>
          ) : (
            <div className="flex flex-col items-center text-center gap-2 py-16">
              <span className="text-5xl">📹</span>
              <p className="text-base font-bold text-slate-200">Nothing saved on this device yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom action, clear of the phone's home bar */}
      <div className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-slate-950/95 border-t border-slate-800">
        <div className="w-full max-w-xl mx-auto">
          {record && onDevice ? (
            <button
              type="button"
              onClick={onOpenPracticeStation}
              className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] rounded-2xl text-base font-black shadow-lg shadow-indigo-900/40"
            >
              💬 Go to the Practice Station
            </button>
          ) : !record ? (
            <button
              type="button"
              onClick={onStartRecording}
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] rounded-2xl text-base font-black"
            >
              📹 Start recording
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full h-14 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] rounded-2xl text-base font-black"
            >
              ← Back to Home
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
