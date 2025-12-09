import React, { useState, useEffect, useRef } from 'react';



interface VideoFrameSelectorProps {
    file: File;
    onRangeChange: (start: number, end: number) => void;
}

const VideoFrameSelector: React.FC<VideoFrameSelectorProps> = ({ file, onRangeChange }) => {
    const [thumbnails, setThumbnails] = useState<{ url: string; time: number }[]>([]);
    const [startIndex, setStartIndex] = useState<number>(0);
    const [endIndex, setEndIndex] = useState<number>(11);
    const [loading, setLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);

    // Constants
    const NUM_THUMBNAILS = 12;

    useEffect(() => {
        generateThumbnails();
    }, [file]);

    useEffect(() => {
        // Notify parent of time range changes
        if (thumbnails.length > 0) {
            const startTime = thumbnails[startIndex].time;
            const endTime = thumbnails[endIndex].time;
            onRangeChange(startTime, endTime);
        }
    }, [startIndex, endIndex, thumbnails]);

    const generateThumbnails = async () => {
        setLoading(true);
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const thumbs: { url: string; time: number }[] = [];

        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;

        // Wait for metadata to get duration
        await new Promise((resolve) => {
            video.onloadedmetadata = () => resolve(true);
        });

        const duration = video.duration;
        // We want thumbnails representing the standard distribution
        const interval = duration / NUM_THUMBNAILS;

        canvas.width = 160; // Thumbnail width
        canvas.height = 90; // Thumbnail height (16:9 approx)

        // Safety check for video dimensions, update canvas aspect ratio if needed
        if (video.videoWidth && video.videoHeight) {
            const ratio = video.videoWidth / video.videoHeight;
            canvas.height = canvas.width / ratio;
        }

        try {
            for (let i = 0; i < NUM_THUMBNAILS; i++) {
                // Sample middle of the interval
                const time = interval * i + (interval / 2);
                video.currentTime = time;

                await new Promise((resolve) => {
                    video.onseeked = () => {
                        if (ctx) {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            thumbs.push({
                                url: canvas.toDataURL('image/jpeg', 0.6),
                                time: time
                            });
                        }
                        resolve(true);
                    };
                });
            }
            setThumbnails(thumbs);
            setStartIndex(0);
            setEndIndex(thumbs.length - 1);
        } catch (e) {
            console.error("Error generating thumbnails", e);
        } finally {
            URL.revokeObjectURL(video.src);
            setLoading(false);
        }
    };

    const handleThumbnailClick = (index: number) => {
        // Smart selection logic
        // If clicking before start, make it new start
        // If clicking after end, make it new end
        // If clicking between, move the closest boundary

        if (index < startIndex) {
            setStartIndex(index);
        } else if (index > endIndex) {
            setEndIndex(index);
        } else {
            // Between start and end - determine which is closer
            const distToStart = index - startIndex;
            const distToEnd = endIndex - index;
            if (distToStart <= distToEnd) {
                setStartIndex(index);
            } else {
                setEndIndex(index);
            }
        }
    };

    if (loading) {
        return (
            <div className="w-full h-24 bg-slate-100 rounded-lg flex items-center justify-center animate-pulse">
                <span className="text-slate-400 text-sm">Generating timeline...</span>
            </div>
        );
    }

    // Render logic for a single thumbnail to avoid duplication
    const renderThumbnail = (thumb: { url: string; time: number }, idx: number, large = false) => {
        const isSelected = idx >= startIndex && idx <= endIndex;
        const isStart = idx === startIndex;
        const isEnd = idx === endIndex;

        return (
            <div
                key={idx}
                onClick={() => handleThumbnailClick(idx)}
                className={`
                    relative flex-shrink-0 cursor-pointer transition-all duration-200
                    rounded overflow-hidden
                    ${large ? 'w-32 h-20 md:w-48 md:h-28' : 'w-16 h-12 md:w-20 md:h-14'}
                    ${isSelected ? 'ring-2 ring-blue-500 opacity-100' : 'opacity-40 hover:opacity-70'}
                    ${isStart ? 'ring-4 ring-offset-1 ring-green-500 z-10' : ''}
                    ${isEnd ? 'ring-4 ring-offset-1 ring-red-500 z-10' : ''}
                `}
            >
                <img src={thumb.url} alt={`Frame ${idx}`} className="w-full h-full object-cover" />

                {/* Markers */}
                {isStart && <div className={`absolute top-0 left-0 bg-green-500 text-white font-bold px-1 ${large ? 'text-xs p-1' : 'text-[8px]'}`}>START</div>}
                {isEnd && <div className={`absolute bottom-0 right-0 bg-red-500 text-white font-bold px-1 ${large ? 'text-xs p-1' : 'text-[8px]'}`}>END</div>}
                {large && <div className="absolute bottom-0 left-0 bg-black/50 text-white text-[10px] px-1">{thumb.time.toFixed(1)}s</div>}
            </div>
        );
    };

    return (
        <div className="w-full mt-2">
            {/* Header with Expand Button */}
            <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-slate-500">Trim Video (Click to set range)</span>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded">
                        {(thumbnails[endIndex].time - thumbnails[startIndex].time).toFixed(1)}s
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsExpanded(true)}
                        className="text-slate-400 hover:text-blue-500 p-1"
                        title="Expand Selection"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5-5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Compact Scrollable Strip */}
            <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin">
                {thumbnails.map((thumb, idx) => renderThumbnail(thumb, idx, false))}
            </div>

            {/* Expanded Modal Overlay */}
            {isExpanded && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-semibold text-lg text-slate-800">Precise Trimming</h3>
                                <p className="text-sm text-slate-500">Select the start and end of the movement.</p>
                            </div>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                            >
                                Done
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 bg-slate-100 flex items-center justify-center">
                            <div className="flex flex-wrap justify-center gap-4">
                                {thumbnails.map((thumb, idx) => renderThumbnail(thumb, idx, true))}
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                            <span className="text-sm text-slate-600">
                                Selected Duration: <span className="font-bold text-blue-600">{(thumbnails[endIndex].time - thumbnails[startIndex].time).toFixed(1)}s</span>
                            </span>
                            <span className="text-xs text-slate-400">Click a frame to set Start/End points</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoFrameSelector;
