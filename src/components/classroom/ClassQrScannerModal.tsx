import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { checkLessonPass } from '../../services/cloudSyncService';
import { saveLessonPass } from '../../services/offline/offlineStorage';

const NOT_A_LESSON_QR = "That isn't a lesson QR code. Scan the QR code your teacher is showing.";

interface ClassQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (lessonData: { lessonId: string; title: string; skillName: string; teacherId?: string; pairCount?: number }) => void;
}

export const ClassQrScannerModal: React.FC<ClassQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  // The camera reports the same code many times a second — handle one at a time
  const checkingRef = useRef(false);
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
        setError('iOS Safari requires HTTPS for camera access. Please open the app with https://, or snap a photo of the QR code below.');
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
          ? 'iOS Safari blocks camera on HTTP. Please use HTTPS, or snap a photo of the QR code below.'
          : err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera in Safari Settings, or snap a photo of the QR code below.'
          : 'Could not start camera. Snap a photo of the QR code below instead.'
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

  // Only lesson QR codes from the teacher board are accepted. The lesson pass
  // they carry is checked with the database before the pupil joins, so a
  // wrong-day or made-up code is caught here rather than when they submit.
  const handleDecodedPayload = async (payload: string) => {
    let parsed: any = null;
    try {
      parsed = payload.trim().startsWith('{') ? JSON.parse(payload) : null;
    } catch {
      parsed = null;
    }
    if (!parsed?.lessonId || typeof parsed.pass !== 'string') {
      setError(NOT_A_LESSON_QR);
      return;
    }

    if (checkingRef.current) return;
    checkingRef.current = true;
    stopScanner();
    setIsChecking(true);
    const status = await checkLessonPass(parsed.lessonId, parsed.pass);
    setIsChecking(false);
    checkingRef.current = false;

    if (status === 'not_today') {
      setError("This QR code is for a lesson on a different day. Ask your teacher to show today's lesson.");
      return;
    }
    if (status === 'invalid') {
      setError(NOT_A_LESSON_QR);
      return;
    }
    // 'ok' — or 'offline': join anyway; the database checks again when work is sent

    saveLessonPass(parsed.lessonId, parsed.pass);
    onScanSuccess({
      lessonId: parsed.lessonId,
      title: parsed.title || 'PE Partner Practice',
      skillName: parsed.skillName || 'Overhand Throw',
      teacherId: parsed.teacherId ?? undefined, // ← forwarded from teacher's QR
      // Older QR codes carry no pairCount; the check-in modal then shows 15
      pairCount: Number.isInteger(parsed.pairCount) ? parsed.pairCount : undefined,
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
      setError('Could not find a QR code in that image. Try again with the whole code in the photo.');
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

        {isChecking && (
          <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Checking lesson…</p>
        )}

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

      </div>
    </div>
  );
};
