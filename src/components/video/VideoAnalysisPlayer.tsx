import React, { useRef, useEffect, useState } from 'react';
import { poseDetectionService, BallData } from '../../services/vision/poseDetectionService';

interface VideoAnalysisPlayerProps {
    src: string;
    width?: number;
    height?: number;
    label?: string;
}

const VideoAnalysisPlayer: React.FC<VideoAnalysisPlayerProps> = ({ src, label }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>();
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [status, setStatus] = useState('Initializing...');
    const [blobSrc, setBlobSrc] = useState<string>('');
    // The live skeleton runs pose and ball detection on every frame: on an iPad
    // that freezes playback (#168), so it's off until someone taps for it
    const [skeletonOn, setSkeletonOn] = useState(false);
    const skeletonOnRef = useRef(false);
    // Width / height of the video, so the whole picture shows, uncropped
    const [aspect, setAspect] = useState(16 / 9);

    // Convert base64 data URL → blob URL so the browser can stream it properly.
    // Large base64 data URLs fed directly to <video src> fail silently in Chrome/Firefox.
    useEffect(() => {
        if (!src) return;
        let objectUrl: string | null = null;
        let cancelled = false;

        if (src.startsWith('data:')) {
            fetch(src)
                .then(r => r.blob())
                .then(blob => {
                    objectUrl = URL.createObjectURL(blob);
                    if (cancelled) {
                        URL.revokeObjectURL(objectUrl);
                    } else {
                        setBlobSrc(objectUrl);
                    }
                });
        } else {
            setBlobSrc(src);
        }

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src]);

    // Debug stats
    const [fps, setFps] = useState(0);
    const frameCountRef = useRef(0);
    const lastFpsTimeRef = useRef(0);

    // Ball Trajectory State
    const ballTrajectoryRef = useRef<{ x: number; y: number; frame: number }[]>([]);

    const stopTracking = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = undefined;
    };

    const handlePlay = () => {
        setIsPlaying(true);
        if (skeletonOnRef.current) processVideoFrame();
    };

    const toggleSkeleton = () => {
        const on = !skeletonOnRef.current;
        skeletonOnRef.current = on;
        setSkeletonOn(on);
        stopTracking();
        if (on) {
            setStatus('Initializing...');
            const video = videoRef.current;
            if (video && !video.paused && !video.ended) processVideoFrame();
        } else {
            const canvas = canvasRef.current;
            canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            ballTrajectoryRef.current = [];
        }
    };

    useEffect(() => stopTracking, []);

    const handlePause = () => {
        setIsPlaying(false);
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
        }
    };

    const handleEnded = () => {
        setIsPlaying(false);
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
        }
    };

    const processVideoFrame = async () => {
        if (!skeletonOnRef.current || !videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) {
            return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            // Match canvas to video dimensions
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            try {
                // Detect and Draw
                // Use detectPoseFrame (Image Mode) for robust playback tracking
                // This bypasses strict timestamp requirements which can break on loops/seeking
                // Detect Pose & Ball
                // Serialized to allow proximity filtering (Ball depends on Pose)
                const pose = await poseDetectionService.detectPoseFrame(video);
                const ball = await poseDetectionService.detectBallFrame(video, pose || undefined);

                // Velocity & Holding Logic
                let detectedBall = ball;
                const MIN_VELOCITY = 5; // pixels per frame
                const HOLDING_RADIUS = 150; // pixels (generous radius around wrist)

                if (detectedBall && ballTrajectoryRef.current.length > 0) {
                    const lastPos = ballTrajectoryRef.current[ballTrajectoryRef.current.length - 1];
                    const dist = Math.hypot(detectedBall.center.x - lastPos.x, detectedBall.center.y - lastPos.y);
                    const isMoving = dist > MIN_VELOCITY;

                    let isHeld = false;
                    if (pose && pose.landmarks) {
                        // Check Right Wrist (16) and Left Wrist (15)
                        const width = canvas.width;
                        const height = canvas.height;
                        const rw = pose.landmarks[16];
                        const lw = pose.landmarks[15];

                        const distRW = Math.hypot(detectedBall.center.x - (rw.x * width), detectedBall.center.y - (rw.y * height));
                        const distLW = Math.hypot(detectedBall.center.x - (lw.x * width), detectedBall.center.y - (lw.y * height));

                        isHeld = distRW < HOLDING_RADIUS || distLW < HOLDING_RADIUS;
                    }

                    // FILTER: If NOT moving AND NOT held -> Ignore (likely background noise)
                    if (!isMoving && !isHeld) {
                        detectedBall = null;
                        // Optional: if it was previously tracked, maybe we keep showing the last valid position?
                        // For now, let's hide it to remove the "yellow marker on static object"
                    }
                }

                // Update Trajectory
                if (detectedBall) {
                    ballTrajectoryRef.current.push({
                        x: detectedBall.center.x,
                        y: detectedBall.center.y,
                        frame: frameCountRef.current // Approximate frame for now
                    });
                    // Keep last 15 frames for "Comet Tail"
                    if (ballTrajectoryRef.current.length > 15) {
                        ballTrajectoryRef.current.shift();
                    }
                } else {
                    // Ball lost or filtered out
                    if (ballTrajectoryRef.current.length > 0) {
                        ballTrajectoryRef.current.shift();
                    }
                }

                // Clear and draw
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (pose) {
                    poseDetectionService.drawPose(ctx, pose);
                    setStatus(detectedBall ? 'Tracking - Pose + Ball' : 'Tracking - Pose Found');
                } else {
                    setStatus(detectedBall ? 'Tracking - Ball Only' : 'Tracking - No Pose');
                }

                // Draw Ball Trajectory (Comet Tail)
                if (ballTrajectoryRef.current.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(ballTrajectoryRef.current[0].x, ballTrajectoryRef.current[0].y);

                    // Draw smooth curve or line
                    for (let i = 1; i < ballTrajectoryRef.current.length; i++) {
                        const p = ballTrajectoryRef.current[i];
                        ctx.lineTo(p.x, p.y);
                    }

                    // Neon Style
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.strokeStyle = '#FFFF00'; // Yellow core
                    ctx.lineWidth = 4;
                    ctx.stroke();

                    // Glow
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
                    ctx.lineWidth = 10;
                    ctx.stroke();
                }

                // Draw Current Ball Position
                if (ball) {
                    ctx.beginPath();
                    ctx.arc(ball.center.x, ball.center.y, 6, 0, 2 * Math.PI);
                    ctx.fillStyle = '#FFFF00';
                    ctx.fill();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                if (errorMsg.toLowerCase().includes('wasm') || errorMsg.toLowerCase().includes('model')) {
                    setStatus('Model Load Error');
                } else {
                    setStatus('Detection Error');
                }
                console.error('Video Analysis Error:', err);
                // Don't stop the loop immediately if it's a transient error, 
                // but for model errors we should probably pause or show a retry
            }

            // FPS Calculation
            frameCountRef.current++;
            const now = performance.now();
            if (now - lastFpsTimeRef.current >= 1000) {
                setFps(Math.round(frameCountRef.current * 1000 / (now - lastFpsTimeRef.current)));
                frameCountRef.current = 0;
                lastFpsTimeRef.current = now;
            }
        }

        if (skeletonOnRef.current) requestRef.current = requestAnimationFrame(processVideoFrame);
    };

    return (
        // Sized to the video's own shape, no taller than 60% of the screen, so
        // the whole picture shows and the skeleton lines up with it
        <div
            className="relative rounded-lg overflow-hidden bg-black mx-auto max-w-full group"
            style={{ aspectRatio: aspect, width: `min(100%, calc(60vh * ${aspect}))` }}
        >
            <video
                ref={videoRef}
                src={blobSrc}
                className="absolute inset-0 w-full h-full object-contain block"
                controls
                playsInline
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handleEnded}
                onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
                }}
                onLoadedData={() => setIsLoaded(true)}
            />
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
            />

            <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                <button
                    type="button"
                    onClick={toggleSkeleton}
                    aria-pressed={skeletonOn}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full shadow-lg border backdrop-blur-sm ${
                        skeletonOn ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-black/60 text-white border-white/30'
                    }`}
                >
                    🦴 {skeletonOn ? 'Hide skeleton' : 'Show skeleton'}
                </button>
            {/* Debug Overlay */}
            {skeletonOn && isPlaying && (
                <div className="flex flex-col items-end gap-1 pointer-events-none">
                    <div className={`text-[10px] px-2 py-1 rounded font-mono text-white ${
                        status.includes('Found') || status.includes('Tracking') ? 'bg-green-500/80' : 
                        status.includes('Error') || status.includes('No Pose') ? 'bg-red-500/80' : 
                        'bg-amber-500/80'
                    }`}>
                        {status}
                    </div>
                    <div className="bg-black/50 text-white text-[10px] px-2 py-1 rounded font-mono">
                        FPS: {fps}
                    </div>
                </div>
            )}
            </div>

            {/* Predicted Skill Label (top left, clear of the video controls) */}
            {label && (
                <div className="absolute top-2 left-2 pointer-events-none bg-black/70 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border border-white/20 backdrop-blur-sm transition-opacity duration-300">
                    {label}
                </div>
            )}

            {/* Play Button Overlay (when paused) */}
            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors pointer-events-none">
                    <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoAnalysisPlayer;
