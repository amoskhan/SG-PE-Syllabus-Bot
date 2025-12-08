import React, { useRef, useEffect, useState } from 'react';
import { poseDetectionService, BallData } from '../services/poseDetectionService';

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

    // Debug stats
    const [fps, setFps] = useState(0);
    const frameCountRef = useRef(0);
    const lastFpsTimeRef = useRef(0);

    // Ball Trajectory State
    const ballTrajectoryRef = useRef<{ x: number; y: number; frame: number }[]>([]);

    const handlePlay = () => {
        setIsPlaying(true);
        processVideoFrame();
    };

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
        if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) {
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
                setStatus('Error detecting pose');
                console.error(err);
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

        requestRef.current = requestAnimationFrame(processVideoFrame);
    };

    return (
        <div className="relative rounded-lg overflow-hidden bg-black w-full group">
            <video
                ref={videoRef}
                src={src}
                className="w-full h-auto block"
                controls
                playsInline
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handleEnded}
                onLoadedData={() => setIsLoaded(true)}
            />
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Debug Overlay */}
            {isPlaying && (
                <div className="absolute top-2 right-2 flex flex-col items-end gap-1 pointer-events-none">
                    <div className={`text-[10px] px-2 py-1 rounded font-mono text-white ${status.includes('Found') ? 'bg-green-500/80' : 'bg-red-500/50'}`}>
                        {status}
                    </div>
                    <div className="bg-black/50 text-white text-[10px] px-2 py-1 rounded font-mono">
                        FPS: {fps}
                    </div>
                </div>
            )}

            {/* Predicted Skill Label */}
            {label && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg border border-white/20 backdrop-blur-sm transition-opacity duration-300">
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
