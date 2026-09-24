import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Student, SkillAnalysis } from '../../types';
import {
  LEVELS, levelIndex, Criterion, effectiveCriteria, effectiveLevel, effectiveScore,
} from '../../utils/gradingReview';

// ─── Proficiency scale ────────────────────────────────────────────────────────

// Same colours as the grade badges in Analysis History, so a level looks the
// same everywhere on the page. The level name is always shown beside the
// colour, so it never carries meaning on its own.
const LEVEL_BADGE = [
  'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
];
const LEVEL_DOT = [
  'fill-red-500 dark:fill-red-400',
  'fill-amber-500 dark:fill-amber-400',
  'fill-blue-500 dark:fill-blue-400',
  'fill-emerald-500 dark:fill-emerald-400',
];

// ─── Reading a grading ────────────────────────────────────────────────────────

/**
 * The nightly summary is written by Haiku for the grader's context, so it can
 * come back with Markdown headings and bold labels. Drop the heading (the card
 * already names the skill) and split the bold labels into their own lines.
 */
const cleanSummary = (text: string): { label?: string; body: string }[] =>
  text
    .split('\n')
    // A heading line may run straight into the first bold label, so keep
    // whatever follows the heading text rather than dropping the whole line.
    .map(l => (l.trim().startsWith('#') ? (l.includes('**') ? l.slice(l.indexOf('**')) : '') : l))
    .filter(l => l.trim())
    .join(' ')
    .split(/\*\*([^*]+?):?\*\*:?/)
    .reduce<{ label?: string; body: string }[]>((acc, part, i, arr) => {
      if (i % 2 === 1) acc.push({ label: part.trim(), body: (arr[i + 1] ?? '').trim() });
      else if (i === 0 && part.trim()) acc.push({ body: part.trim() });
      return acc;
    }, [])
    .filter(p => p.body);

const shortDate = (d: Date) => d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
const longDate = (d: Date) => d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

// ─── Per-skill model ──────────────────────────────────────────────────────────

interface SkillProgress {
  skill: string;
  sessions: (SkillAnalysis & { level: number; score: [number, number] | null })[]; // oldest first
  latestCriteria: Criterion[];
  summary?: string;
}

const buildSkillProgress = (student: Student, analyses: SkillAnalysis[]): SkillProgress[] => {
  const bySkill = new Map<string, SkillProgress>();
  const chronological = [...analyses].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const a of chronological) {
    // Teacher-reviewed values win over the AI's wherever they exist.
    const level = levelIndex(effectiveLevel(a));
    if (level < 0) continue;
    if (!bySkill.has(a.skillName)) bySkill.set(a.skillName, { skill: a.skillName, sessions: [], latestCriteria: [] });
    const entry = bySkill.get(a.skillName)!;
    entry.sessions.push({ ...a, level, score: effectiveScore(a) });
    entry.latestCriteria = effectiveCriteria(a);
  }

  // A summary can exist for a skill whose gradings were since deleted.
  for (const [skill, summary] of Object.entries(student.progressSummary ?? {})) {
    if (!bySkill.has(skill)) bySkill.set(skill, { skill, sessions: [], latestCriteria: [] });
    bySkill.get(skill)!.summary = summary;
  }

  const lastSeen = (p: SkillProgress) => p.sessions.at(-1)?.createdAt.getTime() ?? 0;
  return [...bySkill.values()].sort((a, b) => lastSeen(b) - lastSeen(a));
};

// ─── Pieces ───────────────────────────────────────────────────────────────────

const useWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
};

/** Level over time — one dot per grading, hover or tap for the details. */
const LevelTimeline: React.FC<{ sessions: SkillProgress['sessions'] }> = ({ sessions }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const H = 150, top = 12, bottom = 26, left = 76, right = 14;
  const innerW = Math.max(width - left - right, 1);
  const innerH = H - top - bottom;
  const n = sessions.length;
  const x = (i: number) => (n === 1 ? left + innerW / 2 : left + (i * innerW) / (n - 1));
  const y = (lvl: number) => top + ((3 - lvl) * innerH) / 3;

  const hit = active !== null ? sessions[active] : null;

  return (
    <div ref={ref} className="relative select-none" onMouseLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={H} className="block overflow-visible">
          {LEVELS.map((l, i) => (
            <g key={l}>
              <line x1={left} x2={width - right} y1={y(i)} y2={y(i)} className="stroke-slate-100 dark:stroke-zinc-800" strokeWidth={1} />
              <text x={left - 10} y={y(i)} dy="0.35em" textAnchor="end" className="fill-slate-400 dark:fill-slate-500 text-[11px]">
                {l}
              </text>
            </g>
          ))}

          {hit && (
            <line x1={x(active!)} x2={x(active!)} y1={top} y2={top + innerH} className="stroke-slate-300 dark:stroke-zinc-600" strokeWidth={1} />
          )}

          {n > 1 && (
            <polyline
              points={sessions.map((s, i) => `${x(i)},${y(s.level)}`).join(' ')}
              fill="none"
              className="stroke-slate-300 dark:stroke-zinc-600"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )}

          {sessions.map((s, i) => (
            <circle
              key={s.id}
              cx={x(i)}
              cy={y(s.level)}
              r={active === i ? 7 : 5}
              className={`${LEVEL_DOT[s.level]} stroke-white dark:stroke-slate-950`}
              strokeWidth={2}
            />
          ))}

          {/* Dates at the ends only; the tooltip gives every other one. */}
          <text x={x(0)} y={H - 6} textAnchor={n === 1 ? 'middle' : 'start'} className="fill-slate-400 dark:fill-slate-500 text-[11px]">
            {shortDate(sessions[0].createdAt)}
          </text>
          {n > 1 && (
            <text x={x(n - 1)} y={H - 6} textAnchor="end" className="fill-slate-400 dark:fill-slate-500 text-[11px]">
              {shortDate(sessions[n - 1].createdAt)}
            </text>
          )}

          {/* Hit areas: a full-height band per grading, much bigger than the dot. */}
          {sessions.map((s, i) => {
            const half = n === 1 ? innerW / 2 : innerW / (n - 1) / 2;
            return (
              <rect
                key={`hit-${s.id}`}
                x={x(i) - half}
                y={top - 8}
                width={half * 2}
                height={innerH + 16}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(active === i ? null : i)}
              />
            );
          })}
        </svg>
      )}

      {hit && (
        <div
          className="absolute z-10 pointer-events-none px-2.5 py-1.5 rounded-lg shadow-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs whitespace-nowrap"
          style={{
            left: Math.min(Math.max(x(active!), 70), width - 70),
            top: y(hit.level) - 12,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="text-slate-400 dark:text-slate-500">{longDate(hit.createdAt)}</p>
          <p className="font-semibold text-slate-800 dark:text-white">{LEVELS[hit.level]}</p>
          {hit.score && (
            <p className="text-slate-500 dark:text-slate-400 tabular-nums">
              {hit.score[0]}/{hit.score[1]} criteria met
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const Trend: React.FC<{ sessions: SkillProgress['sessions'] }> = ({ sessions }) => {
  if (sessions.length < 2) return <span className="text-xs text-slate-400 dark:text-slate-500">First grading</span>;
  const now = sessions.at(-1)!.level;
  const before = sessions.at(-2)!.level;
  if (now > before)
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">▲ Up from {LEVELS[before]}</span>;
  if (now < before)
    return <span className="text-xs font-medium text-red-500 dark:text-red-400">▼ Down from {LEVELS[before]}</span>;
  return <span className="text-xs text-slate-500 dark:text-slate-400">● Same as last time</span>;
};

const SkillCard: React.FC<{ progress: SkillProgress }> = ({ progress }) => {
  const { skill, sessions, latestCriteria, summary } = progress;
  const latest = sessions.at(-1);
  const score = latest?.score ?? null;
  const toWorkOn = latestCriteria.filter(c => c.result !== 'met');
  const summaryParts = summary ? cleanSummary(summary) : [];
  const [showNote, setShowNote] = useState(false);

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-xl p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 dark:text-white">{skill}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {sessions.length
              ? `${sessions.length} grading${sessions.length !== 1 ? 's' : ''} · last ${longDate(latest!.createdAt)}`
              : 'No gradings on record'}
          </p>
          {latest?.teacherReviewedAt && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">✓ Latest grading checked by you</p>
          )}
        </div>
        {latest && (
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${LEVEL_BADGE[latest.level]}`}>
              {LEVELS[latest.level]}
            </span>
            <Trend sessions={sessions} />
          </div>
        )}
      </div>

      {score && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Cues hit (latest)</p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {score[0]}/{score[1]}
            </p>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 dark:bg-blue-400"
              style={{ width: `${score[1] ? (score[0] / score[1]) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {toWorkOn.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Working on</p>
          <div className="flex flex-wrap gap-1.5">
            {toWorkOn.map(c => (
              <span
                key={c.name}
                className={`text-xs px-2 py-1 rounded-md border ${
                  c.result === 'missed'
                    ? 'border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-300'
                    : 'border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300'
                }`}
              >
                {c.result === 'missed' ? '✗' : '?'} {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {sessions.length > 1 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Level over time</p>
          <LevelTimeline sessions={sessions} />
        </div>
      )}

      {summaryParts.length > 0 && !showNote && (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Show AI note
        </button>
      )}
      {summaryParts.length > 0 && showNote && (
        <div className="rounded-lg bg-slate-50 dark:bg-zinc-900/60 px-3 py-2.5 space-y-1">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">AI note</p>
            <button type="button" onClick={() => setShowNote(false)} className="text-xs text-slate-400 hover:underline">
              Hide
            </button>
          </div>
          {summaryParts.map((p, i) => (
            <p key={i} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {p.label && <span className="font-medium text-slate-700 dark:text-slate-200">{p.label}: </span>}
              {p.body}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Overview ─────────────────────────────────────────────────────────────────

interface Props {
  student: Student;
  analyses: SkillAnalysis[];
  loading: boolean;
}

const StudentProgressOverview: React.FC<Props> = ({ student, analyses, loading }) => {
  const skills = useMemo(() => buildSkillProgress(student, analyses), [student, analyses]);
  const [selected, setSelected] = useState<string | null>(null);

  if (loading) {
    return <div className="text-slate-400 dark:text-slate-500 text-sm py-8 text-center mb-8">Loading progress…</div>;
  }
  if (skills.length === 0) return null;

  // One skill at a time; the most recently graded one until the teacher picks.
  const current = skills.find(s => s.skill === selected) ?? skills[0];

  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
        Progress
      </h2>

      {skills.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-1 px-1" role="tablist" aria-label="Skill">
          {skills.map(s => {
            const level = s.sessions.at(-1)?.level;
            const active = s.skill === current.skill;
            return (
              <button
                key={s.skill}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(s.skill)}
                className={`flex-shrink-0 flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full border text-sm transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                {s.skill}
                {level !== undefined && (
                  <span
                    className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                      active ? 'bg-white/20 text-white' : LEVEL_BADGE[level]
                    }`}
                  >
                    {LEVELS[level]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <SkillCard key={current.skill} progress={current} />
    </div>
  );
};

export default StudentProgressOverview;
