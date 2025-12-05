import React, { useRef, useEffect, useState } from 'react';
import { poseDetectionService } from '../services/poseDetectionService';

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
                // Use Date.now() for timestamp to ensure it's always increasing, which MediaPipe VIDEO mode requires
                const pose = await poseDetectionService.detectPoseFromVideo(video, Date.now());

                // Clear and draw
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (pose) {
                    poseDetectionService.drawPose(ctx, pose);
                    setStatus('Tracking - Pose Found');
                } else {
                    setStatus('Tracking - No Pose');
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
        <div className="relative rounded-lg overflow-hidden bg-black max-w-sm group">
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
