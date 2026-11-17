import React from 'react';
import { PARTNER_ABSENT, nameOf, type CheckInScreen, type PairChoice } from '../../utils/checkIn';

// The name step of check-in (#183): renders only what checkInScreen()
// (utils/checkIn.ts) decides. The pair taps their two names ("Amos & Joseph");
// the pair number and roles come from the teacher's plan.

export type Choice = PairChoice | typeof PARTNER_ABSENT | null;

const ASK_TEACHER: Record<Extract<CheckInScreen, { kind: 'ask_teacher' }>['reason'], string> = {
  no_plan: 'Your teacher hasn’t put you in pairs yet.',
  no_partner: 'Your pair doesn’t have a partner named yet.',
  partner_absent: 'Your partner isn’t here today.',
};

const primary =
  'mt-5 w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl text-base shadow-lg shadow-indigo-600/20 cursor-pointer';
const secondary =
  'mt-3 w-full py-3 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm cursor-pointer';

export const NameCheckIn: React.FC<{
  screen: CheckInScreen | null; // null: the names are still loading
  loadFailed: boolean;
  onChoose: (choice: Choice) => void;
  onRetry: () => void;
  onContinue: () => void;
}> = ({ screen, loadFailed, onChoose, onRetry, onContinue }) => {
  if (!screen) {
    return (
      <div className="w-full text-center py-10">
        {loadFailed ? (
          <>
            <p className="text-base font-bold text-slate-700 dark:text-slate-200">Couldn’t load your class’s pairs.</p>
            <p className="text-sm text-slate-500 mt-1">Check the Wi-Fi, then try again.</p>
            <button type="button" onClick={onRetry} className={primary}>Try again</button>
          </>
        ) : (
          <p className="text-sm text-slate-400">Loading pairs…</p>
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

  switch (screen.kind) {
    case 'pairs':
      return (
        <div className="w-full flex flex-col items-center">
          {title('Tap your pair', screen.changed ? 'Your teacher changed the pairs. Find yours again.' : 'Find your two names.')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-h-[50vh] overflow-y-auto p-1">
            {screen.pairs.map(p => (
              <button
                key={p.pairNumber}
                type="button"
                disabled={p.taken}
                onClick={() => onChoose({ pairNumber: p.pairNumber, appleId: p.appleId, bananaId: p.bananaId })}
                className={`min-h-16 px-4 py-3 rounded-2xl text-left transition-all ${
                  p.taken
                    ? 'bg-slate-100 dark:bg-zinc-800/50 text-slate-300 dark:text-zinc-600 border border-slate-200 dark:border-zinc-800 cursor-not-allowed'
                    : 'bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-zinc-700 hover:bg-indigo-50 dark:hover:bg-zinc-700 cursor-pointer'
                }`}
              >
                <span className="block text-xl font-black leading-tight">{p.label}</span>
                <span className="block text-[11px] uppercase font-bold opacity-60">
                  {p.taken ? 'Checked in' : `Pair ${p.pairNumber}`}
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onChoose(PARTNER_ABSENT)} className={secondary}>My partner isn’t here</button>
        </div>
      );

    case 'ready':
      return (
        <div className="w-full flex flex-col items-center">
          {title(`${nameOf(screen.apple)} & ${nameOf(screen.banana)}`, `Pair ${screen.pairNumber}`)}
          <div className="flex gap-3 text-lg font-extrabold">
            <span className="px-3 py-1.5 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300">🍎 {nameOf(screen.apple)}</span>
            <span className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">🍌 {nameOf(screen.banana)}</span>
          </div>
          <button type="button" onClick={onContinue} className={primary}>That’s us! Pair Photo 📸 →</button>
          <button type="button" onClick={() => onChoose(null)} className={secondary}>← Not us</button>
        </div>
      );

    case 'taken':
      return (
        <div className="w-full flex flex-col items-center text-center">
          {title(`${screen.label} are already checked in`, 'If that’s really you, ask your teacher.')}
          <button type="button" onClick={() => onChoose(null)} className={primary}>← Back to pairs</button>
        </div>
      );

    case 'ask_teacher':
      return (
        <div className="w-full flex flex-col items-center text-center">
          <span className="text-5xl mb-2">🙋</span>
          {title('Ask your teacher', ASK_TEACHER[screen.reason])}
          <button type="button" onClick={() => (screen.reason === 'no_plan' ? onRetry() : onChoose(null))} className={primary}>
            {screen.reason === 'no_plan' ? 'Check again' : '← Back to pairs'}
          </button>
        </div>
      );
  }
};
