import React, { useState, useRef, useEffect } from 'react';
import { speechService } from '../../services/speechService';
import { saveActivePairSession, PairSessionData } from '../../services/offline/offlineStorage';

interface PairCheckInModalProps {
  isOpen: boolean;
  lessonId: string;
  lessonTitle: string;
  skillName: string;
  onCompleteCheckIn: (sessionData: PairSessionData) => void;
  onCancel: () => void;
}

export const PairCheckInModal: React.FC<PairCheckInModalProps> = ({
  isOpen,
  lessonId,
  lessonTitle,
  skillName,
  onCompleteCheckIn,
  onCancel,
}) => {
  const [step, setStep] = useState<'SELECT_PAIR' | 'TAKE_PHOTO' | 'READY_LINEUP'>('SELECT_PAIR');
  const [selectedPairNumber, setSelectedPairNumber] = useState<number | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [needsHelp, setNeedsHelp] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const nativeFileInputRef = useRef<HTMLInputElement>(null);

  // Play audio guidance as steps advance
  useEffect(() => {
    if (!isOpen) return;

    if (step === 'SELECT_PAIR') {
      speechService.speak('Apple, please choose your pair number.');
    } else if (step === 'TAKE_PHOTO') {
      speechService.speak('Apple and Banana, smile together for your pair photo!');
    } else if (step === 'READY_LINEUP') {
      speechService.speak('Great job! You are ready. Please line up quietly at the classroom door!');
    }
  }, [step, isOpen]);

  // Auto-start camera when entering TAKE_PHOTO step
  useEffect(() => {
    if (isOpen && step === 'TAKE_PHOTO' && !cameraStream) {
      startFrontCamera();
    }
  }, [step, isOpen, cameraStream]);

  // Attach stream to video whenever element or stream changes
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      const video = videoRef.current;
      if (video.srcObject !== cameraStream) {
        video.srcObject = cameraStream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.play().catch(console.warn);
      }
    }
  }, [cameraStream, step]);

  // Clean up camera when leaving
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  };

  const startFrontCamera = async () => {
    setCameraError(null);
    try {
      if (typeof window !== 'undefined' && !window.isSecureContext && window.location.protocol === 'http:') {
        setCameraError('iOS Safari disables live camera on HTTP. Tap "Take Photo with iPhone Camera" below or open using HTTPS.');
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera API not accessible. Use the "Take Photo with iPhone Camera" button below.');
        return;
      }

      // iOS WebKit compatible constraint
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
      } catch {
        // Fallback constraint for older iOS
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.muted = true;
        await videoRef.current.play().catch(console.warn);
      }
    } catch (e: any) {
      console.warn('Camera error for pair photo:', e);
      setCameraError(
        e.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera in Settings > Safari, or use the button below.'
          : 'Could not start live camera preview. Tap "Take Photo with iPhone Camera" below.'
      );
    }
  };

  const handleTriggerPhoto = () => {
    if (countdown !== null) return;
    setCountdown(3);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          captureSelfie();
          return null;
        }
        speechService.speak(String(prev - 1));
        return prev - 1;
      });
    }, 1000);
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = video.videoWidth || 400;
    const vh = video.videoHeight || 400;

    // Flip horizontal so captured selfie matches mirrored selfie preview
    ctx.translate(400, 0);
    ctx.scale(-1, 1);

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const minDim = Math.min(vw, vh);
      const sx = (vw - minDim) / 2;
      const sy = (vh - minDim) / 2;
      ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, 400, 400);
    } else {
      ctx.drawImage(video, 0, 0, 400, 400);
    }

    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    setPhotoData(base64);
    stopCamera();
    setStep('READY_LINEUP');
  };

  // Native iOS front-camera photo fallback (works even on HTTP or MDM)
  const handleNativePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) {
        setPhotoData(result);
        stopCamera();
        setStep('READY_LINEUP');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFinish = async () => {
    if (!selectedPairNumber || !photoData) return;
    const sessionData: PairSessionData = {
      pairNumber: selectedPairNumber,
      lessonId,
      pairPhoto: photoData,
      checkedInAt: new Date().toISOString(),
      needsHelp,
    };
    await saveActivePairSession(sessionData);
    onCompleteCheckIn(sessionData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col items-center animate-scale-in">

        {/* Top Progress & Role Badges */}
        <div className="w-full flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold flex items-center gap-1">
              🍎 Apple: iPad Holder
            </span>
            <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-bold flex items-center gap-1">
              🍌 Banana: Partner
            </span>
          </div>
          <button
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* STEP 1: SELECT PAIR NUMBER */}
        {step === 'SELECT_PAIR' && (
          <div className="w-full flex flex-col items-center">
            <div className="text-center mb-5">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white">Choose Your Pair Number</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Apple, tap your pair number below (Pair 1 to 15):
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2.5 w-full max-w-md my-2">
              {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSelectedPairNumber(num)}
                  className={`aspect-square rounded-2xl font-black text-lg md:text-xl transition-all duration-150 flex flex-col items-center justify-center shadow-xs cursor-pointer ${
                    selectedPairNumber === num
                      ? 'bg-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/30 ring-4 ring-indigo-200 dark:ring-indigo-900'
                      : 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 hover:bg-indigo-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span>{num}</span>
                  <span className="text-[9px] uppercase font-bold opacity-70">Pair</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!selectedPairNumber}
              onClick={() => {
                setStep('TAKE_PHOTO');
                startFrontCamera();
              }}
              className="mt-6 w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-2xl text-base shadow-lg shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Continue to Pair Photo 📸</span>
              <span>→</span>
            </button>
          </div>
        )}

        {/* STEP 2: TAKE PAIR PHOTO */}
        {step === 'TAKE_PHOTO' && (
          <div className="w-full flex flex-col items-center">
            <div className="text-center mb-3">
              <span className="inline-block px-3 py-1 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold rounded-full text-xs mb-1">
                Pair #{selectedPairNumber} Check-In
              </span>
              <h2 className="text-2xl font-black text-slate-800 dark:text-white">Smile Together! 🍎 + 🍌</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Both partners look at the camera so teacher can verify you
              </p>
            </div>

            {/* Video Viewport */}
            <div className="relative w-64 h-64 bg-black rounded-3xl overflow-hidden shadow-xl border-4 border-white dark:border-zinc-800 my-2 flex items-center justify-center">
              <video
                ref={(el) => {
                  (videoRef as any).current = el;
                  if (el && cameraStream && el.srcObject !== cameraStream) {
                    el.srcObject = cameraStream;
                    el.setAttribute('playsinline', 'true');
                    el.setAttribute('webkit-playsinline', 'true');
                    el.muted = true;
                    el.play().catch(console.warn);
                  }
                }}
                playsInline
                autoPlay
                muted
                className="w-full h-full object-cover -scale-x-100"
              />

              {countdown !== null && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-xs">
                  <span className="text-7xl font-black text-white animate-ping">{countdown}</span>
                </div>
              )}

              {!cameraStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-900 text-white gap-2">
                  <span className="text-3xl">📷</span>
                  <button
                    type="button"
                    onClick={startFrontCamera}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md"
                  >
                    Start Front Camera
                  </button>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/30 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 text-center max-w-xs">
                {cameraError}
              </div>
            )}

            {/* Native iPhone Camera Capture Fallback */}
            <input
              type="file"
              ref={nativeFileInputRef}
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleNativePhotoUpload}
            />

            <button
              type="button"
              onClick={() => nativeFileInputRef.current?.click()}
              className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <span>📱 Take Photo with iPhone Camera App</span>
            </button>

            <div className="flex gap-3 w-full mt-4">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setStep('SELECT_PAIR');
                }}
                className="flex-1 py-3 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleTriggerPhoto}
                disabled={countdown !== null || !cameraStream}
                className="flex-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-2xl text-base shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Snap Photo 📸</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: READY TO LINE UP SCREEN (TEACHER DOOR INSPECTION BADGE) */}
        {step === 'READY_LINEUP' && photoData && (
          <div className="w-full flex flex-col items-center text-center">
            
            {/* Massive Green Verification Banner */}
            <div className="w-full bg-emerald-500 text-white p-4 rounded-2xl shadow-lg mb-4 flex items-center justify-center gap-3 animate-bounce">
              <span className="text-3xl">🚶‍♂️</span>
              <div className="text-left">
                <p className="text-xs uppercase font-extrabold tracking-wider">Checked In & Ready</p>
                <p className="text-xl font-black">LINE UP AT DOOR!</p>
              </div>
            </div>

            {/* Pair Card */}
            <div className="relative p-4 bg-slate-50 dark:bg-zinc-800/60 rounded-3xl border-2 border-emerald-400 dark:border-emerald-600 shadow-md w-full flex flex-col items-center">
              <div className="w-40 h-40 rounded-2xl overflow-hidden shadow-inner border-2 border-white mb-3">
                <img src={photoData} alt="Pair" className="w-full h-full object-cover" />
              </div>

              <span className="text-3xl font-black text-slate-800 dark:text-white">
                PAIR #{selectedPairNumber}
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                Task: {skillName}
              </span>

              <p className="text-xs text-slate-400 mt-2 italic">
                Hold this screen up to show the teacher at the door.
              </p>
            </div>

            <button
              type="button"
              onClick={handleFinish}
              className="mt-6 w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-lg shadow-xl shadow-emerald-600/30 transition-all cursor-pointer"
            >
              Go to PE Practice Venue 🏃‍♂️
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
