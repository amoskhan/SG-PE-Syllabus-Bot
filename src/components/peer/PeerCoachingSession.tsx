import React, { useState, useRef, useEffect } from 'react';
import {
  getAllCuesForSkill,
  getCoreCuesForSkill,
  PeerSyllabusCue,
} from '../../data/peerSyllabusCues';
import { speechService } from '../../services/speechService';
import {
  queuePairSubmission,
  PairSubmissionRecord,
  PeerCueResult,
} from '../../services/offline/offlineStorage';
import { backupSubmissionToSupabase } from '../../services/cloudSyncService';
import { uploadGuestVideo } from '../../services/studentService';
import { poseDetectionService } from '../../services/vision/poseDetectionService';
import VideoAnalysisPlayer from '../video/VideoAnalysisPlayer';

export interface CompletedPeerSession {
  pairNumber: number;
  lessonId: string;
  skillName: string;
  pairPhoto: string;
  appleVideoBlob?: Blob;
  applePoseFrames: string[];
  appleCues: Record<string, boolean>;
  bananaVideoBlob?: Blob;
  bananaPoseFrames: string[];
  bananaCues: Record<string, boolean>;
}

interface PeerCoachingSessionProps {
  pairNumber: number;
  lessonId: string;
  skillName: string;
  pairPhoto: string;
  teacherId?: string; // From QR — used to upload videos to teacher's Supabase bucket
  onSessionComplete: () => void;
  onSendToCoachBot?: (data: CompletedPeerSession) => void;
  onExit: () => void;
}

type Step =
  | 'APPLE_INTRO'
  | 'APPLE_RECORDING'
  | 'APPLE_REVIEW'
  | 'SWAP_PROMPT'
  | 'BANANA_RECORDING'
  | 'BANANA_REVIEW'
  | 'SESSION_COMPLETED';

export const PeerCoachingSession: React.FC<PeerCoachingSessionProps> = ({
  pairNumber,
  lessonId,
  skillName,
  pairPhoto,
  teacherId,
  onSessionComplete,
  onSendToCoachBot,
  onExit,
}) => {
  const [step, setStep] = useState<Step>('APPLE_INTRO');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecondsLeft, setRecordSecondsLeft] = useState(5);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  // Turn 1 Data (Banana performs, Apple records)
  const [bananaVideoUrl, setBananaVideoUrl] = useState<string | null>(null);
  const [bananaVideoBlob, setBananaVideoBlob] = useState<Blob | null>(null);
  const [bananaCues, setBananaCues] = useState<Record<string, boolean>>({});
  const [bananaPoseFrames, setBananaPoseFrames] = useState<string[]>([]);

  // Turn 2 Data (Apple performs, Banana records)
  const [appleVideoUrl, setAppleVideoUrl] = useState<string | null>(null);
  const [appleVideoBlob, setAppleVideoBlob] = useState<Blob | null>(null);
  const [appleCues, setAppleCues] = useState<Record<string, boolean>>({});
  const [applePoseFrames, setApplePoseFrames] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [showFullChecklist, setShowFullChecklist] = useState(false);
  // Per-video cloud save state — tracks "Save to Teacher" button independent of full peer-assessment flow
  const [bananaSaveState, setBananaSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [appleSaveState, setAppleSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const allCues: PeerSyllabusCue[] = getAllCuesForSkill(skillName);
  const coreCues: PeerSyllabusCue[] = getCoreCuesForSkill(skillName);
  const displayedCues = showFullChecklist ? allCues : coreCues;

  // Voice Guidance on Step Changes
  useEffect(() => {
    switch (step) {
      case 'APPLE_INTRO':
        speechService.speak(`Apple, hold the iPad. Banana, stand back and get ready for ${skillName}!`);
        break;
      case 'APPLE_REVIEW':
        speechService.speak('Apple, watch the replay. Did Banana follow the PE syllabus cues?');
        break;
      case 'SWAP_PROMPT':
        speechService.speak('Great job, Apple! Now swap roles. Banana grab the iPad, Apple get ready to perform!');
        break;
      case 'BANANA_REVIEW':
        speechService.speak('Banana, watch the replay. Check off Apple cues!');
        break;
      case 'SESSION_COMPLETED':
        speechService.speak('Awesome teamwork! Both partners are done. Your practice has been saved for the teacher!');
        break;
    }
  }, [step, skillName]);

  const attachStreamToVideo = (videoEl: HTMLVideoElement | null, stream: MediaStream | null) => {
    if (!videoEl || !stream) return;
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.setAttribute('webkit-playsinline', 'true');
      videoEl.muted = true;
      videoEl.play().catch(console.warn);
    }
  };

  // Keep stream attached whenever activeStream or step changes
  useEffect(() => {
    attachStreamToVideo(videoPreviewRef.current, activeStream);
  }, [activeStream, step]);

  // Start Camera Stream for Recording Steps - never tear down when transitioning between intro & recording
  const isApplePhase = step === 'APPLE_INTRO' || step === 'APPLE_RECORDING';
  const isBananaPhase = step === 'SWAP_PROMPT' || step === 'BANANA_RECORDING';

  useEffect(() => {
    if (isApplePhase || isBananaPhase) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isApplePhase, isBananaPhase]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      if (activeStream && activeStream.active && activeStream.getVideoTracks().some((t) => t.readyState === 'live')) {
        attachStreamToVideo(videoPreviewRef.current, activeStream);
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia not available (check HTTPS on iOS)');
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setActiveStream(stream);
      attachStreamToVideo(videoPreviewRef.current, stream);
    } catch (e) {
      console.warn('Camera stream error:', e);
    }
  };

  const stopCamera = () => {
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      setActiveStream(null);
    }
  };

  const currentPerformerRef = useRef<'Banana' | 'Apple'>('Banana');
  const timerRef = useRef<any>(null);
  const snapIntervalRef = useRef<any>(null);

  // Capture real, live body frames directly from the active camera element in the DOM
  const captureLivePoseSnapshot = async (performer: 'Banana' | 'Apple') => {
    if (!videoPreviewRef.current) return;
    try {
      const video = videoPreviewRef.current;
      if (!video.videoWidth || !video.videoHeight) return;
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 480, 360);

      const img = new Image();
      img.src = canvas.toDataURL('image/jpeg', 0.85);
      await new Promise((res) => { img.onload = res; });

      const pose = await poseDetectionService.detectPoseFromImage(img);
      if (pose) {
        const annotated = await poseDetectionService.drawPoseToImage(img, pose);
        if (annotated) {
          if (performer === 'Banana') {
            setBananaPoseFrames((prev) => [...prev.slice(-2), annotated]);
          } else {
            setApplePoseFrames((prev) => [...prev.slice(-2), annotated]);
          }
          return;
        }
      }
      if (performer === 'Banana') {
        setBananaPoseFrames((prev) => [...prev.slice(-2), img.src]);
      } else {
        setApplePoseFrames((prev) => [...prev.slice(-2), img.src]);
      }
    } catch (e) {
      console.warn('Live snapshot notice:', e);
    }
  };

  // Start 5-Second Recording with Countdown
  const handleStartRecording = (performer: 'Banana' | 'Apple') => {
    if (isRecording) return;
    currentPerformerRef.current = performer;

    if (performer === 'Banana') {
      setBananaPoseFrames([]);
      setStep('APPLE_RECORDING');
    } else {
      setApplePoseFrames([]);
      setStep('BANANA_RECORDING');
    }

    recordedChunksRef.current = [];
    setIsRecording(true);
    setRecordSecondsLeft(5);

    // Initial snapshot at start
    setTimeout(() => captureLivePoseSnapshot(performer), 400);

    // Periodic live snapshot every 1.3s during movement
    if (snapIntervalRef.current) clearInterval(snapIntervalRef.current);
    snapIntervalRef.current = setInterval(() => {
      captureLivePoseSnapshot(performer);
    }, 1300);

    try {
      if (activeStream) {
        let mime = '';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
            mime = 'video/mp4;codecs=avc1';
          } else if (MediaRecorder.isTypeSupported('video/mp4')) {
            mime = 'video/mp4';
          } else if (MediaRecorder.isTypeSupported('video/webm')) {
            mime = 'video/webm';
          }
        }
        const recorder = mime ? new MediaRecorder(activeStream, { mimeType: mime }) : new MediaRecorder(activeStream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          finalizeRecording(currentPerformerRef.current);
        };

        recorder.start(500); // 500ms timeslices for reliable chunk delivery on iOS
      }
    } catch (e) {
      console.warn('Recording start error:', e);
    }

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          handleStopRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleStopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (snapIntervalRef.current) {
      clearInterval(snapIntervalRef.current);
      snapIntervalRef.current = null;
    }
    // Capture final frame
    captureLivePoseSnapshot(currentPerformerRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Error stopping recorder:', e);
        finalizeRecording(currentPerformerRef.current);
      }
    } else {
      finalizeRecording(currentPerformerRef.current);
    }
  };

  const finalizeRecording = (performer: 'Banana' | 'Apple') => {
    setIsRecording(false);
    if (snapIntervalRef.current) {
      clearInterval(snapIntervalRef.current);
      snapIntervalRef.current = null;
    }

    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    const fullBlob = recordedChunksRef.current.length > 0
      ? new Blob(recordedChunksRef.current, { type: mime })
      : null;
    const videoUrl = fullBlob ? URL.createObjectURL(fullBlob) : null;

    if (performer === 'Banana') {
      if (fullBlob) setBananaVideoBlob(fullBlob);
      if (videoUrl) setBananaVideoUrl(videoUrl);
      setStep('APPLE_REVIEW');
    } else {
      if (fullBlob) setAppleVideoBlob(fullBlob);
      if (videoUrl) setAppleVideoUrl(videoUrl);
      setStep('BANANA_REVIEW');
    }
  };

  // Extract keyframes and overlay local MediaPipe pose skeleton safely
  const extractPoseFrames = async (videoBlob: Blob, setFrames: (f: string[]) => void) => {
    try {
      await poseDetectionService.initializeVideoMode();
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoBlob);
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.load();

      // Safe race timeout so extraction never blocks review
      await Promise.race([
        new Promise((res) => { video.onloadedmetadata = res; }),
        new Promise((res) => setTimeout(res, 1200))
      ]);

      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const frames: string[] = [];
      const duration = video.duration && !isNaN(video.duration) ? video.duration : 4;
      const numFrames = 3;
      const interval = duration / (numFrames + 1);

      for (let i = 1; i <= numFrames; i++) {
        video.currentTime = i * interval;
        await Promise.race([
          new Promise((res) => { video.onseeked = res; }),
          new Promise((res) => setTimeout(res, 500))
        ]);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const img = new Image();
        img.src = canvas.toDataURL('image/jpeg');
        await new Promise((res) => { img.onload = res; });

        const pose = await poseDetectionService.detectPoseFromImage(img);
        if (pose) {
          const skeletonFrame = await poseDetectionService.drawPoseToImage(img, pose);
          if (skeletonFrame) frames.push(skeletonFrame);
        } else {
          frames.push(img.src);
        }
      }
      if (frames.length > 0) setFrames(frames);
    } catch (e) {
      console.warn('MediaPipe offline extract notice:', e);
    }
  };

  const handleCueToggle = (cueId: string, value: boolean, isBananaReview: boolean) => {
    if (isBananaReview) {
      setAppleCues((prev) => ({ ...prev, [cueId]: value }));
    } else {
      setBananaCues((prev) => ({ ...prev, [cueId]: value }));
    }
  };

  /**
   * Instantly upload a single recorded video to the teacher's Supabase bucket.
   * Students can do this right after recording — no peer assessment required.
   */
  const handleSaveToTeacher = async (performer: 'banana' | 'apple') => {
    if (!teacherId) return; // No teacher ID from QR — skip cloud save
    const blob = performer === 'banana' ? bananaVideoBlob : appleVideoBlob;
    if (!blob) return;
    const setState = performer === 'banana' ? setBananaSaveState : setAppleSaveState;
    setState('saving');
    try {
      const url = await uploadGuestVideo(blob, teacherId, lessonId, pairNumber, performer, skillName);
      setState(url ? 'saved' : 'error');
    } catch {
      setState('error');
    }
  };

  // Final Submit Action
  const handleSubmitSession = async () => {
    setIsSaving(true);

    const mapCues = (rated: Record<string, boolean>): PeerCueResult[] => {
      return allCues.map((c) => ({
        cueIndex: c.itemNumber,
        criterionText: c.syllabusCriterion,
        isObserved: rated[c.id] ?? false,
      }));
    };

    const submission: PairSubmissionRecord = {
      id: `sub-${lessonId}-p${pairNumber}-${Date.now()}`,
      lessonId,
      pairNumber,
      skillName,
      pairPhoto,
      appleRole: {
        studentPerformer: 'Banana',
        evaluator: 'Apple',
        videoBlob: bananaVideoBlob || undefined,
        cues: mapCues(bananaCues),
      },
      bananaRole: {
        studentPerformer: 'Apple',
        evaluator: 'Banana',
        videoBlob: appleVideoBlob || undefined,
        cues: mapCues(appleCues),
      },
      status: 'pending_sync',
      createdAt: new Date().toISOString(),
    };

    try {
      await queuePairSubmission(submission);
      // Fire-and-forget background cloud backup — passes teacherId so videos land in teacher's bucket
      backupSubmissionToSupabase(submission, teacherId).catch((e) =>
        console.warn('Background Supabase video backup note:', e)
      );
      setIsOfflineSaved(true);
      setStep('SESSION_COMPLETED');
    } catch (e) {
      console.error('Queue submission failed:', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white select-none">
      
      {/* Top Bar: Role Indicators & Step Progress */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏃‍♂️</span>
          <div>
            <h1 className="text-sm font-black tracking-wide text-indigo-400">PAIR #{pairNumber}</h1>
            <p className="text-[11px] text-slate-400 font-semibold">{skillName}</p>
          </div>
        </div>

        {/* Current Active Role Highlight */}
        <div className="flex items-center gap-2">
          {step.startsWith('APPLE') ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-600/90 text-white rounded-full text-xs font-black ring-2 ring-red-400">
              <span>🍎 Apple</span>
              <span className="text-[10px] font-normal opacity-85">is Recording</span>
            </div>
          ) : step === 'SWAP_PROMPT' ? (
            <div className="flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-black animate-bounce">
              <span>🔄 Swap Roles!</span>
            </div>
          ) : step.startsWith('BANANA') ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 text-slate-950 rounded-full text-xs font-black ring-2 ring-amber-300">
              <span>🍌 Banana</span>
              <span className="text-[10px] font-normal opacity-85">is Recording</span>
            </div>
          ) : (
            <div className="px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-black">
              ✓ Completed
            </div>
          )}

          <button
            onClick={onExit}
            className="text-xs text-slate-400 hover:text-white px-2 py-1"
          >
            Exit
          </button>
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-3 overflow-y-auto">

        {/* STEP 1: APPLE RECORDING BANANA */}
        {(step === 'APPLE_INTRO' || step === 'APPLE_RECORDING') && (
          <div className="w-full h-full max-w-2xl flex flex-col items-center justify-between">
            <div className="w-full bg-slate-800/80 rounded-2xl p-2.5 mb-2 text-center border border-slate-700">
              <span className="text-xs font-bold text-red-300">🍎 Apple's Turn to Record:</span>
              <p className="text-sm font-black text-white">Point camera at Banana performing {skillName}!</p>
            </div>

            {/* Camera Viewport */}
            <div className="relative w-full flex-1 max-h-[60vh] bg-black rounded-3xl overflow-hidden border-2 border-slate-800 flex items-center justify-center">
              <video
                ref={(el) => {
                  videoPreviewRef.current = el;
                  attachStreamToVideo(el, activeStream);
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {isRecording && (
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-600/90 text-white rounded-full text-xs font-bold animate-pulse">
                  <div className="w-2.5 h-2.5 bg-white rounded-full" />
                  <span>RECORDING: {recordSecondsLeft}s</span>
                </div>
              )}
            </div>

            {/* Big Kid Record / Stop Button */}
            <div className="w-full pt-3 flex flex-col items-center gap-2">
              {isRecording ? (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 text-base md:text-lg font-black rounded-3xl shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer animate-pulse"
                >
                  <div className="w-4 h-4 bg-slate-950 rounded-xs" />
                  <span>Done with {skillName}! Stop & Review ⏹️ ({recordSecondsLeft}s)</span>
                </button>
              ) : (
                <div className="w-full flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartRecording('Banana')}
                    className="w-full py-4 bg-red-600 hover:bg-red-500 active:scale-98 text-white text-lg font-black rounded-3xl shadow-xl shadow-red-600/30 transition-all flex items-center justify-center gap-3 cursor-pointer"
                  >
                    <div className="w-4 h-4 bg-white rounded-full animate-ping" />
                    <span>Tap to Record Banana (5s) 🎥</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => finalizeRecording('Banana')}
                    className="text-xs text-slate-400 hover:text-white py-1 cursor-pointer font-semibold text-center"
                  >
                    Skip recording / Go straight to review ➔
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: APPLE REVIEWS BANANA WITH MOE PE SYLLABUS CUES */}
        {step === 'APPLE_REVIEW' && (
          <div className="w-full max-w-xl flex flex-col h-full justify-between pb-2 animate-fade-in">
            <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700 mb-2">
              <p className="text-xs font-bold text-amber-400">🍎 Apple, check Banana's movement:</p>
              <p className="text-xs text-slate-400">Watch the replay and tap thumbs up or down for each syllabus rule.</p>
            </div>

            {/* Video Replay with VideoAnalysisPlayer */}
            {bananaVideoUrl && (
              <div className="w-full max-h-56 bg-black rounded-2xl overflow-hidden border border-slate-700 mb-3 flex items-center justify-center">
                <VideoAnalysisPlayer src={bananaVideoUrl} label="Banana with AI Skeleton" />
              </div>
            )}

            {/* MediaPipe Skeleton Freeze Frames */}
            {bananaPoseFrames.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 px-1">
                  <span>AI Skeleton Motion Capture</span>
                  <span className="text-emerald-400 font-extrabold">✓ {bananaPoseFrames.length} Frames Tracked</span>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                  {bananaPoseFrames.map((frame, i) => (
                    <div key={i} className="relative shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 border-indigo-500/80 bg-black shadow-md">
                      <img src={frame} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 left-1.5 px-1.5 py-0.5 bg-black/80 text-[10px] font-mono font-bold text-white rounded-md backdrop-blur-xs">
                        Frame #{i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Checklist Toggle: 3 Quick Cues vs All MOE Items */}
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 mb-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowFullChecklist(false)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !showFullChecklist
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ⭐ 3 Quick Cues
              </button>
              <button
                type="button"
                onClick={() => setShowFullChecklist(true)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  showFullChecklist
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                📋 All {allCues.length} MOE Rules
              </button>
            </div>

            {/* MOE Syllabus Peer Cues List */}
            <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
              {displayedCues.map((cue) => {
                const isChecked = bananaCues[cue.id];
                return (
                  <div key={cue.id} className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black px-1.5 py-0.5 bg-slate-700 text-indigo-300 rounded">
                          #{cue.itemNumber}
                        </span>
                        <span className="text-base">{cue.icon}</span>
                        <p className="text-xs font-black text-white leading-tight">{cue.kidFriendlyText}</p>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic">
                        MOE Standard: {cue.syllabusCriterion}
                      </p>
                    </div>

                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCueToggle(cue.id, true, false)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isChecked === true
                            ? 'bg-emerald-600 text-white ring-2 ring-white scale-105'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        👍 Yes!
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCueToggle(cue.id, false, false)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isChecked === false
                            ? 'bg-red-600 text-white ring-2 ring-white scale-105'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        👎 Try Again
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions: Re-do or Continue to Swap Roles */}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setBananaVideoUrl(null);
                  setBananaVideoBlob(null);
                  setBananaPoseFrames([]);
                  setBananaSaveState('idle');
                  setStep('APPLE_INTRO');
                }}
                className="px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs border border-slate-700 transition-all cursor-pointer"
              >
                ↺ Re-do {skillName}
              </button>

              {/* Save to Teacher — uploads instantly, independent of peer assessment */}
              {teacherId && bananaVideoBlob && (
                <button
                  type="button"
                  disabled={bananaSaveState === 'saving' || bananaSaveState === 'saved'}
                  onClick={() => handleSaveToTeacher('banana')}
                  className={`px-4 py-3.5 font-bold rounded-2xl text-xs transition-all cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 ${
                    bananaSaveState === 'saved'
                      ? 'bg-emerald-700 text-white'
                      : bananaSaveState === 'error'
                      ? 'bg-red-700 text-white'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  {bananaSaveState === 'saving' ? '⏳ Saving…' : bananaSaveState === 'saved' ? '✓ Saved!' : bananaSaveState === 'error' ? '⚠ Retry' : '💾 Save to Teacher'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setStep('SWAP_PROMPT')}
                className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 font-black rounded-2xl text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Next: Swap Roles 🍎 ⇄ 🍌</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CELEBRATION & ROLE SWAP SCREEN */}
        {step === 'SWAP_PROMPT' && (
          <div className="w-full max-w-md bg-slate-800 p-6 rounded-3xl border-2 border-indigo-500 text-center flex flex-col items-center animate-scale-in">
            <span className="text-6xl mb-3 animate-spin">🔄</span>
            <h2 className="text-2xl font-black text-white">SWAP ROLES NOW!</h2>
            
            <div className="my-4 p-4 bg-slate-900/80 rounded-2xl border border-slate-700 text-left space-y-2 text-sm w-full">
              <p className="flex items-center gap-2 text-amber-300 font-bold">
                <span>🍌 Banana:</span> Grab the iPad! You are recording now!
              </p>
              <p className="flex items-center gap-2 text-red-300 font-bold">
                <span>🍎 Apple:</span> Stand back and get ready to perform!
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleStartRecording('Apple')}
              className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-lg shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Banana is Ready: Record Apple (5s) 🎥</span>
            </button>
          </div>
        )}

        {/* STEP 4: BANANA RECORDING APPLE */}
        {step === 'BANANA_RECORDING' && (
          <div className="w-full h-full max-w-2xl flex flex-col items-center justify-between">
            <div className="w-full bg-slate-800/80 rounded-2xl p-2.5 mb-2 text-center border border-slate-700">
              <span className="text-xs font-bold text-amber-400">🍌 Banana's Turn to Record:</span>
              <p className="text-sm font-black text-white">Hold camera steady! Apple is performing {skillName}.</p>
            </div>

            <div className="relative w-full flex-1 max-h-[60vh] bg-black rounded-3xl overflow-hidden border-2 border-slate-800 flex items-center justify-center">
              <video
                ref={(el) => {
                  videoPreviewRef.current = el;
                  attachStreamToVideo(el, activeStream);
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              {isRecording && (
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-slate-950 rounded-full text-xs font-black animate-pulse">
                  <div className="w-2.5 h-2.5 bg-slate-950 rounded-full" />
                  <span>RECORDING: {recordSecondsLeft}s</span>
                </div>
              )}
            </div>

            {/* Big Kid Record / Stop Button for Banana */}
            <div className="w-full pt-3 flex flex-col items-center gap-2">
              {isRecording ? (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 text-base md:text-lg font-black rounded-3xl shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer animate-pulse"
                >
                  <div className="w-4 h-4 bg-slate-950 rounded-xs" />
                  <span>Done with {skillName}! Stop & Review ⏹️ ({recordSecondsLeft}s)</span>
                </button>
              ) : (
                <div className="w-full flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartRecording('Apple')}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-lg shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Tap to Record Apple (5s) 🎥</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => finalizeRecording('Apple')}
                    className="text-xs text-slate-400 hover:text-white py-1 cursor-pointer font-semibold text-center"
                  >
                    Skip recording / Go straight to review ➔
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: BANANA REVIEWS APPLE */}
        {step === 'BANANA_REVIEW' && (
          <div className="w-full max-w-xl flex flex-col h-full justify-between pb-2 animate-fade-in">
            <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700 mb-2">
              <p className="text-xs font-bold text-amber-400">🍌 Banana, check Apple's movement:</p>
              <p className="text-xs text-slate-400">Watch the replay and check off the syllabus rules.</p>
            </div>

            {/* Video Replay with VideoAnalysisPlayer */}
            {appleVideoUrl && (
              <div className="w-full max-h-56 bg-black rounded-2xl overflow-hidden border border-slate-700 mb-3 flex items-center justify-center">
                <VideoAnalysisPlayer src={appleVideoUrl} label="Apple with AI Skeleton" />
              </div>
            )}

            {/* MediaPipe Skeleton Freeze Frames */}
            {applePoseFrames.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 px-1">
                  <span>AI Skeleton Motion Capture</span>
                  <span className="text-emerald-400 font-extrabold">✓ {applePoseFrames.length} Frames Tracked</span>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                  {applePoseFrames.map((frame, i) => (
                    <div key={i} className="relative shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 border-amber-500/80 bg-black shadow-md">
                      <img src={frame} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 left-1.5 px-1.5 py-0.5 bg-black/80 text-[10px] font-mono font-bold text-white rounded-md backdrop-blur-xs">
                        Frame #{i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Checklist Toggle: 3 Quick Cues vs All MOE Items */}
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 mb-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowFullChecklist(false)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !showFullChecklist
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ⭐ 3 Quick Cues
              </button>
              <button
                type="button"
                onClick={() => setShowFullChecklist(true)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  showFullChecklist
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                📋 All {allCues.length} MOE Rules
              </button>
            </div>

            {/* MOE Syllabus Peer Cues List */}
            <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
              {displayedCues.map((cue) => {
                const isChecked = appleCues[cue.id];
                return (
                  <div key={cue.id} className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black px-1.5 py-0.5 bg-slate-700 text-amber-300 rounded">
                          #{cue.itemNumber}
                        </span>
                        <span className="text-base">{cue.icon}</span>
                        <p className="text-xs font-black text-white leading-tight">{cue.kidFriendlyText}</p>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic">
                        MOE Standard: {cue.syllabusCriterion}
                      </p>
                    </div>

                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCueToggle(cue.id, true, true)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isChecked === true
                            ? 'bg-emerald-600 text-white ring-2 ring-white scale-105'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        👍 Yes!
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCueToggle(cue.id, false, true)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isChecked === false
                            ? 'bg-red-600 text-white ring-2 ring-white scale-105'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        👎 Try Again
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions: Re-do or Submit to Teacher */}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setAppleVideoUrl(null);
                  setAppleVideoBlob(null);
                  setApplePoseFrames([]);
                  setAppleSaveState('idle');
                  setStep('SWAP_PROMPT');
                }}
                className="px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs border border-slate-700 transition-all cursor-pointer"
              >
                ↺ Re-do {skillName}
              </button>

              {/* Save to Teacher — Apple's video, uploads instantly */}
              {teacherId && appleVideoBlob && (
                <button
                  type="button"
                  disabled={appleSaveState === 'saving' || appleSaveState === 'saved'}
                  onClick={() => handleSaveToTeacher('apple')}
                  className={`px-4 py-3.5 font-bold rounded-2xl text-xs transition-all cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 ${
                    appleSaveState === 'saved'
                      ? 'bg-emerald-700 text-white'
                      : appleSaveState === 'error'
                      ? 'bg-red-700 text-white'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  {appleSaveState === 'saving' ? '⏳ Saving…' : appleSaveState === 'saved' ? '✓ Saved!' : appleSaveState === 'error' ? '⚠ Retry' : '💾 Save to Teacher'}
                </button>
              )}

              <button
                type="button"
                disabled={isSaving}
                onClick={handleSubmitSession}
                className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 font-black rounded-2xl text-sm shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isSaving ? 'Saving to iPad… ⏳' : 'Send to Teacher Review Tray 🚀'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: SESSION COMPLETED (OFFLINE SAFE CONFIRMATION) */}
        {step === 'SESSION_COMPLETED' && (
          <div className="w-full max-w-md bg-slate-800 p-6 rounded-3xl border-2 border-emerald-500 text-center flex flex-col items-center animate-scale-in">
            <span className="text-6xl mb-3 animate-bounce">🎉</span>
            <h2 className="text-2xl font-black text-white">MISSION COMPLETE!</h2>
            <p className="text-xs text-emerald-400 font-bold mt-1">Both Apple & Banana Finished Practice</p>

            {isOfflineSaved && (
              <div className="my-4 p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl text-xs text-emerald-300 flex items-center gap-2">
                <span className="text-lg">💾</span>
                <span className="text-left leading-relaxed">
                  Saved safely to iPad storage! The teacher will receive your videos when the iPad connects to Wi-Fi.
                </span>
              </div>
            )}

            <div className="p-4 bg-slate-900 rounded-2xl w-full border border-slate-700 my-2">
              <p className="text-sm font-bold text-white mb-1">Teacher Instructions:</p>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Put the iPad down safely.<br />
                2. High-five your partner! 🤝<br />
                3. Sit down quietly in your pair spot.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onSendToCoachBot) {
                  onSendToCoachBot({
                    pairNumber,
                    lessonId,
                    skillName,
                    pairPhoto,
                    appleVideoBlob: appleVideoBlob || undefined,
                    applePoseFrames,
                    appleCues,
                    bananaVideoBlob: bananaVideoBlob || undefined,
                    bananaPoseFrames,
                    bananaCues,
                  });
                } else {
                  onSessionComplete();
                }
              }}
              className="mt-4 w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-black rounded-2xl text-base shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer animate-pulse"
            >
              <span>🤖 Ask Coach Bot to Analyze Movement</span>
              <span>➔</span>
            </button>

            <button
              type="button"
              onClick={onSessionComplete}
              className="mt-2 w-full py-2.5 bg-transparent hover:bg-slate-700/50 text-slate-400 hover:text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Finished Lesson (Back to Home)
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
