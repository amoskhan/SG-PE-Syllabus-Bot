import React, { useState } from 'react';

interface TeacherHelpBeaconProps {
  pairNumber?: number;
  cartPinReminder?: string;
  onSignalHelp?: () => void;
}

export const TeacherHelpBeacon: React.FC<TeacherHelpBeaconProps> = ({
  pairNumber,
  cartPinReminder = '1234',
  onSignalHelp,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHelpSignaled, setIsHelpSignaled] = useState(false);

  const handleCallTeacher = () => {
    setIsHelpSignaled(true);
    onSignalHelp?.();
  };

  return (
    <>
      {/* Floating corner button positioned above mobile action buttons */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-3 sm:bottom-6 sm:right-6 z-40 flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold rounded-full shadow-lg shadow-amber-500/30 text-xs transition-all cursor-pointer border border-amber-400/40 backdrop-blur-xs"
        title="Need help with iPad or pairing?"
      >
        <span className="text-sm">🙋‍♂️</span>
        <span>Help</span>
      </button>

      {/* Trouble Assistance Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col animate-scale-in">
            
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🆘</span>
                <h3 className="font-extrabold text-slate-800 dark:text-white text-base">iPad & Pair Help</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 my-2 text-xs text-slate-600 dark:text-slate-300">
              
              {/* Locked iPad cart passcode reminder */}
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-150 dark:border-indigo-900/30">
                <p className="font-bold text-indigo-700 dark:text-indigo-300 mb-1">
                  🔒 Locked iPad Passcode:
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Cart Unlock PIN:</span>
                  <span className="px-2 py-0.5 bg-white dark:bg-zinc-900 rounded-md font-mono font-black text-sm tracking-widest text-indigo-600 dark:text-indigo-400 border border-indigo-200">
                    {cartPinReminder}
                  </span>
                </div>
              </div>

              {/* No internet explanation */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-900/30">
                <p className="font-bold text-amber-800 dark:text-amber-300 mb-1">
                  📶 No Wi-Fi at Sports Hall / Field?
                </p>
                <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                  Don't worry! This app works 100% offline. You can record videos and check off skills without internet. Everything saves to this iPad automatically!
                </p>
              </div>

              {/* Clueless Kid Prompt */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-900/30">
                <p className="font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                  🤝 Pair Rule:
                </p>
                <p className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">
                  <strong>Apple 🍎</strong> holds the iPad and records.<br />
                  <strong>Banana 🍌</strong> does the skill.<br />
                  Then tap "Swap Roles" so both get a turn!
                </p>
              </div>
            </div>

            {/* Signal teacher button */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleCallTeacher}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isHelpSignaled
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300'
                    : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20'
                }`}
              >
                <span>{isHelpSignaled ? '✓ Teacher Alerted!' : `Call Teacher to Pair #${pairNumber || '?'}`}</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
