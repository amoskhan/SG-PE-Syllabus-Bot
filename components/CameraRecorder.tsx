import React, { useState, useRef, useEffect } from 'react';
import { poseDetectionService } from '../services/poseDetectionService';

interface CameraRecorderProps {
    onVideoRecorded: (videoBlob: Blob) => void;
    onClose: () => void;
}

const CameraRecorder: React.FC<CameraRecorderProps> = ({ onVideoRecorded, onClose }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [debugStatus, setDebugStatus] = useState<string>('Initializing...');

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const requestRef = useRef<number>();
    const frameCountRef = useRef<number>(0);
    const lastFpsTimeRef = useRef<number>(0);

    useEffect(() => {
        // Request camera access when component mounts
        startCamera();

        return () => {
            // Cleanup: stop camera, timers, and animation frame
            stopCamera();
            if (timerRef.current) clearInterval(timerRef.current);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, []);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 1280, height: 720 },
                audio: false
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                // Start pose detection loop once video is playing
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play();
                    detectPoseLoop();
                };
            }
        } catch (error) {
            console.error('Camera access error:', error);
            alert('Unable to access camera. Please ensure camera permissions are granted.');
            onClose();
        }
    };

    const detectPoseLoop = async () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');

            if (ctx && video.readyState === 4) {
                // Match canvas size to video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                // FPS Calculation
                frameCountRef.current++;
                const now = performance.now();
                if (now - lastFpsTimeRef.current >= 1000) {
                    const fps = Math.round(frameCountRef.current * 1000 / (now - lastFpsTimeRef.current));
                    // Update debug status only once per second to avoid re-renders
                    setDebugStatus(`FPS: ${fps} | Model: Heavy`);
                    frameCountRef.current = 0;
                    lastFpsTimeRef.current = now;
                }

                // Detect pose
                const pose = await poseDetectionService.detectPoseFromVideo(video, Date.now());

                // Clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Draw pose if detected
                if (pose) {
                    // console.log('Drawing pose...'); // Too spammy using visual debug instead
                    poseDetectionService.drawPose(ctx, pose);
                } else {
                    // console.log('No pose detected');
                }
            }
        }
        requestRef.current = requestAnimationFrame(detectPoseLoop);
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
        }
    };

    const startCountdown = () => {
        let count = 3;
        setCountdown(count);

        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                setCountdown(count);
            } else {
                setCountdown(null);
                clearInterval(countdownInterval);
                startRecording();
            }
        }, 1000);
    };

    const startRecording = () => {
        if (!stream) return;

        chunksRef.current = [];
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            onVideoRecorded(blob);
            stopCamera();
            onClose();
        };

        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
        setRecordingTime(0);

        // Start recording timer
        timerRef.current = setInterval(() => {
            setRecordingTime(prev => prev + 1);
        }, 1000);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    };

    const handleCancel = () => {
        stopRecording();
        stopCamera();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 text-white flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Record Movement</h2>
                        <p className="text-sm text-red-100 mt-1">
                            {!isRecording && !countdown ? 'Position yourself in frame, then click Record' : ''}
                            {countdown ? `Recording starts in ${countdown}...` : ''}
                            {isRecording ? 'Recording in progress...' : ''}
                        </p>
                    </div>
                    {/* Debug status overlay */}
                    <div className="bg-black/30 px-3 py-1 rounded text-xs font-mono">
                        {debugStatus}
                    </div>
                </div>

                {/* Video Preview */}
                <div className="relative bg-black">
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="w-full h-96 object-cover"
                    />
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />

                    {/* Countdown Overlay */}
                    {countdown && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                            <div className="text-white text-9xl font-bold animate-pulse">
                                {countdown}
                            </div>
                        </div>
                    )}

                    {/* Recording Indicator */}
                    {isRecording && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full z-10">
                            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                            <span className="font-mono text-sm">
                                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                            </span>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="p-6 bg-gray-50 flex items-center justify-center gap-4">
                    {!isRecording && !countdown && (
                        <>
                            <button
                                onClick={startCountdown}
                                className="px-8 py-3 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <circle cx="10" cy="10" r="8" />
                                </svg>
                                Start Recording
                            </button>
                            <button
                                onClick={handleCancel}
                                className="px-8 py-3 bg-gray-300 text-gray-700 rounded-full font-semibold hover:bg-gray-400 transition-colors"
                            >
                                Cancel
                            </button>
                        </>
                    )}

                    {isRecording && (
                        <button
                            onClick={stopRecording}
                            className="px-8 py-3 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <rect x="6" y="6" width="8" height="8" />
                            </svg>
                            Stop Recording
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CameraRecorder;
