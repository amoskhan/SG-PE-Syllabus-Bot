import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface ClassQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (lessonData: { lessonId: string; title: string; skillName: string; teacherId?: string }) => void;
}

export const ClassQrScannerModal: React.FC<ClassQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isSecure, setIsSecure] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrRegionId = 'class-qr-scanner-region';
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const secure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      setIsSecure(secure);
      if (!secure) {
        setError('iOS Safari requires HTTPS for camera access. Please open with https:// or enter the 4-digit code below.');
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    if (isSecure && navigator.mediaDevices?.getUserMedia) {
      startScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen, isSecure]);

  const startScanner = async () => {
    try {
      setError(null);
      setIsScanning(true);

      // Stop any existing instance
      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(qrRegionId, {
        verbose: false,
        formatsToSupport: [0], // QR_CODE
      });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.75);
            return { width: Math.max(edge, 180), height: Math.max(edge, 180) };
          },
        },
        (decodedText) => {
          handleDecodedPayload(decodedText);
        },
        () => {
          // ignore scan frames
        }
      );
    } catch (err: any) {
      console.warn('Camera scanner failed:', err);
      const isHttpsIssue = !window.isSecureContext && window.location.protocol === 'http:';
      setError(
        isHttpsIssue
          ? 'iOS Safari blocks camera on HTTP. Please use HTTPS or enter the 4-digit code below.'
          : err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera in Safari Settings, or use the 4-digit code.'
          : 'Could not start camera. Enter the 4-digit code shown on the screen.'
      );
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleDecodedPayload = (payload: string) => {
    try {
      if (payload.startsWith('{')) {
        const parsed = JSON.parse(payload);
        if (parsed.lessonId) {
          stopScanner();
          onScanSuccess({
            lessonId: parsed.lessonId,
            title: parsed.title || 'PE Partner Practice',
            skillName: parsed.skillName || 'Overhand Throw',
            teacherId: parsed.teacherId ?? undefined, // ← forwarded from teacher's QR
          });
          return;
        }
      }

      if (payload.includes(':')) {
        const parts = payload.split(':');
        stopScanner();
        onScanSuccess({
          lessonId: parts[1] || 'lesson-today',
          title: 'Class PE Activity',
          skillName: parts[2] || 'Overhand Throw',
        });
        return;
      }

      stopScanner();
      onScanSuccess({
        lessonId: payload.trim(),
        title: 'Class PE Practice',
        skillName: 'Overhand Throw',
      });
    } catch {
      stopScanner();
      onScanSuccess({
        lessonId: 'class-session-1',
        title: 'Class PE Session',
        skillName: 'Overhand Throw',
      });
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    stopScanner();
    onScanSuccess({
      lessonId: `manual-${manualCode.trim()}`,
      title: `Lesson Code ${manualCode.trim()}`,
      skillName: 'Overhand Throw',
    });
  };

  // Fallback: scan image from photo album or native iOS camera prompt
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !scannerRef.current) return;
    try {
      const decoded = await scannerRef.current.scanFile(file, true);
      handleDecodedPayload(decoded);
    } catch {
      setError('Could not find a QR code in that image. Try entering the code manually.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col items-center animate-scale-in">
        
        {/* Header */}
        <div className="w-full flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📱</span>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Scan Teacher QR</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Point camera at the whiteboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-700 flex items-center justify-center text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Video QR Viewport */}
        <div className="relative w-full aspect-square max-w-[280px] bg-black rounded-2xl overflow-hidden border-2 border-indigo-500/40 shadow-inner flex items-center justify-center">
          <div id={qrRegionId} className="w-full h-full" />

          {!isScanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-900/90 text-white gap-3">
              <span className="text-3xl">📷</span>
              <p className="text-xs text-slate-300">Tap below to allow camera access on your iPhone</p>
              <button
                type="button"
                onClick={startScanner}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md cursor-pointer"
              >
                Enable Camera
              </button>
            </div>
          )}

          {isScanning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-dashed border-indigo-400 rounded-xl animate-pulse" />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/30 rounded-xl text-xs text-amber-800 dark:text-amber-300 text-center">
            {error}
          </div>
        )}

        {/* iOS Native Camera Photo Fallback */}
        <div className="mt-3">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileScan}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>📸 Or snap a photo of the QR code</span>
          </button>
        </div>

        {/* Manual 4-Digit Fallback */}
        <form onSubmit={handleManualSubmit} className="mt-4 w-full pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 text-center">
            Can't scan? Enter 4-digit lesson code from screen:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. 1234"
              className="flex-1 px-4 py-2 text-center text-lg font-mono font-bold tracking-widest bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
            >
              Join
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
