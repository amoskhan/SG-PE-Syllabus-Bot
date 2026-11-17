import React from 'react';
import { PARTNER_ABSENT, nameOf, type CheckInScreen, type NameButton, type PlannedStudent } from '../../utils/checkIn';

// The name step of check-in (#183): renders only what checkInScreen()
// (utils/checkIn.ts) decides. Pupils tap their own names; the pair and roles
// come from the teacher's plan.

const ASK_TEACHER: Record<Extract<CheckInScreen, { kind: 'ask_teacher' }>['reason'], string> = {
  no_plan: 'Your teacher hasn’t put you in pairs yet.',
  not_planned: 'That name isn’t in today’s pairs.',
  no_partner: 'You don’t have a partner in today’s pairs.',
  partner_absent: 'Your partner isn’t here today.',
};

const Names: React.FC<{ names: NameButton[]; onTap: (id: string) => void; highlight?: string }> = ({ names, onTap, highlight }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full max-h-[50vh] overflow-y-auto p-1">
    {names.map(n => (
      <button
        key={n.studentId}
        type="button"
        disabled={n.taken || n.studentId === highlight}
        onClick={() => onTap(n.studentId)}
        className={`min-h-16 px-3 py-3 rounded-2xl font-black text-lg leading-tight transition-all ${
          n.studentId === highlight
            ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 dark:ring-indigo-900'
            : n.taken
            ? 'bg-slate-100 dark:bg-zinc-800/50 text-slate-300 dark:text-zinc-600 border border-slate-200 dark:border-zinc-800 cursor-not-allowed'
            : 'bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-zinc-700 hover:bg-indigo-50 dark:hover:bg-zinc-700 cursor-pointer'
        }`}
      >
        {n.label}
        {n.taken && <span className="block text-[10px] uppercase font-bold">Taken</span>}
      </button>
    ))}
  </div>
);

const primary =
  'mt-5 w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl text-base shadow-lg shadow-indigo-600/20 cursor-pointer';
const secondary =
  'mt-3 w-full py-3 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm cursor-pointer';

export const NameCheckIn: React.FC<{
  screen: CheckInScreen | null; // null: the names are still loading
  loadFailed: boolean;
  picks: string[];
  onPicks: (picks: string[]) => void;
  onRetry: () => void;
  onContinue: () => void;
}> = ({ screen, loadFailed, picks, onPicks, onRetry, onContinue }) => {
  if (!screen) {
    return (
      <div className="w-full text-center py-10">
        {loadFailed ? (
          <>
            <p className="text-base font-bold text-slate-700 dark:text-slate-200">Couldn’t load your class’s names.</p>
            <p className="text-sm text-slate-500 mt-1">Check the Wi-Fi, then try again.</p>
            <button type="button" onClick={onRetry} className={primary}>Try again</button>
          </>
        ) : (
          <p className="text-sm text-slate-400">Loading names…</p>
        )}
      </div>
    );
  }

  const title = (text: string, sub?: string) => (
    <div className="text-center mb-4">
      <h2 className="text-2xl font-black text-slate-800 dark:text-white">{text}</h2>
      {sub && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
    </div>
  );
  const pairLine = (pairNumber: number, apple: PlannedStudent, banana: PlannedStudent) => (
    <p className="text-center text-lg font-extrabold text-indigo-700 dark:text-indigo-300 mb-3">
      Pair {pairNumber} · {nameOf(apple)} 🍎 and {nameOf(banana)} 🍌
    </p>
  );

  switch (screen.kind) {
    case 'names':
      return (
        <div className="w-full flex flex-col items-center">
          {title('Tap your name', 'One of you taps first, then your partner.')}
          <Names names={screen.names} onTap={id => onPicks([id])} />
        </div>
      );

    case 'partner':
      return (
        <div className="w-full flex flex-col items-center">
          {pairLine(screen.pairNumber, screen.apple, screen.banana)}
          {title(`${nameOf(screen.waitingFor)}, tap your name`, 'to show you’re here together.')}
          <Names names={screen.names} onTap={id => onPicks([picks[0], id])} highlight={picks[0]} />
          <div className="flex gap-2 w-full">
            <button type="button" onClick={() => onPicks([])} className={secondary}>← Not me</button>
            <button type="button" onClick={() => onPicks([picks[0], PARTNER_ABSENT])} className={secondary}>My partner isn’t here</button>
          </div>
        </div>
      );

    case 'ready':
      return (
        <div className="w-full flex flex-col items-center">
          {title('You’re a pair! ✓')}
          {pairLine(screen.pairNumber, screen.apple, screen.banana)}
          <button type="button" onClick={onContinue} className={primary}>Continue to Pair Photo 📸 →</button>
          <button type="button" onClick={() => onPicks([])} className={secondary}>← Start again</button>
        </div>
      );

    case 'taken':
      return (
        <div className="w-full flex flex-col items-center text-center">
          {title(`${nameOf(screen.student)} is already checked in`, 'If that’s really you, ask your teacher.')}
          <button type="button" onClick={() => onPicks([])} className={primary}>← Back to names</button>
        </div>
      );

    case 'wrong_partner':
      return (
        <div className="w-full flex flex-col items-center text-center">
          {title('Wrong partner', `Your partner today is ${nameOf(screen.expected)}. ${nameOf(screen.expected)}, tap your name.`)}
          <button type="button" onClick={() => onPicks([picks[0]])} className={primary}>Try again</button>
          <button type="button" onClick={() => onPicks([])} className={secondary}>← Start again</button>
        </div>
      );

    case 'ask_teacher':
      return (
        <div className="w-full flex flex-col items-center text-center">
          <span className="text-5xl mb-2">🙋</span>
          {title('Ask your teacher', ASK_TEACHER[screen.reason])}
          <button type="button" onClick={() => (screen.reason === 'no_plan' ? onRetry() : onPicks([]))} className={primary}>
            {screen.reason === 'no_plan' ? 'Check again' : '← Back to names'}
          </button>
        </div>
      );
  }
};
