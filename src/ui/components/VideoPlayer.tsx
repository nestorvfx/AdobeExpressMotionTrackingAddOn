import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { TrackingPoint } from '../utils/lucasKanadeTracker';
import './VideoPlayer.css';

interface VideoPlayerProps {
    src: string;
    currentFrame: number;
    isPlaying: boolean;
    trackingPoints: TrackingPoint[];
    onMetadataLoaded: (duration: number, width: number, height: number) => void;
    onAddTrackingPoint: (x: number, y: number) => void;
    getPointColor: (index: number) => string;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({
    src,
    currentFrame,
    isPlaying,
    trackingPoints,
    onMetadataLoaded,
    onAddTrackingPoint,
    getPointColor
}, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
    const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

    // Expose video ref to parent
    useImperativeHandle(ref, () => videoRef.current!, []);

    // Handle video metadata loaded
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleLoadedMetadata = () => {
            const duration = video.duration;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
            
            // Calculate display size maintaining aspect ratio
            const containerWidth = 280; // Max width for add-on (320px - 40px padding)
            const maxHeight = 240; // Max height (double upload area height)
            
            let displayWidth = containerWidth;
            let displayHeight = (videoHeight / videoWidth) * containerWidth;
            
            // If height exceeds max, scale down
            if (displayHeight > maxHeight) {
                displayHeight = maxHeight;
                displayWidth = (videoWidth / videoHeight) * maxHeight;
            }
            
            setVideoSize({ width: videoWidth, height: videoHeight });
            setDisplaySize({ width: displayWidth, height: displayHeight });
            
            onMetadataLoaded(duration, videoWidth, videoHeight);
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }, [src, onMetadataLoaded]);

    // Update video current time based on current frame
    useEffect(() => {
        const video = videoRef.current;
        if (!video || video.duration === 0) return;

        const fps = 30; // Assume 30fps
        const targetTime = currentFrame / fps;
        
        if (Math.abs(video.currentTime - targetTime) > 0.1) {
            video.currentTime = targetTime;
        }
    }, [currentFrame]);

    // Handle play/pause
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isPlaying) {
            video.play().catch(console.error);
        } else {
            video.pause();
        }
    }, [isPlaying]);

    // Handle canvas click to add tracking points
    const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video || !videoSize.width || !videoSize.height) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Convert click coordinates to video coordinates
        const videoX = (clickX / displaySize.width) * videoSize.width;
        const videoY = (clickY / displaySize.height) * videoSize.height;

        onAddTrackingPoint(videoX, videoY);
    };

    // Draw tracking points and paths
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !displaySize.width || !displaySize.height) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw tracking points
        trackingPoints.forEach((point, index) => {
            // Convert video coordinates to display coordinates
            const displayX = (point.x / videoSize.width) * displaySize.width;
            const displayY = (point.y / videoSize.height) * displaySize.height;

            // Draw point
            ctx.fillStyle = getPointColor(index);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.arc(displayX, displayY, 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            // Draw trajectory path (last 5 frames)
            if (point.trajectory && point.trajectory.length > 1) {
                ctx.strokeStyle = getPointColor(index);
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 3]);
                
                ctx.beginPath();
                const recentPoints = point.trajectory.slice(-5); // Last 5 points
                
                recentPoints.forEach((trajPoint, trajIndex) => {
                    const trajDisplayX = (trajPoint.x / videoSize.width) * displaySize.width;
                    const trajDisplayY = (trajPoint.y / videoSize.height) * displaySize.height;
                    
                    if (trajIndex === 0) {
                        ctx.moveTo(trajDisplayX, trajDisplayY);
                    } else {
                        ctx.lineTo(trajDisplayX, trajDisplayY);
                    }
                });
                
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Draw point label
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${index + 1}`, displayX, displayY - 10);
        });
    }, [trackingPoints, displaySize, videoSize, getPointColor]);

    return (
        <div 
            ref={containerRef}
            className="video-player"
            style={{ 
                width: displaySize.width,
                height: displaySize.height,
                maxWidth: '100%'
            }}
        >
            <video
                ref={videoRef}
                src={src}
                className="video-element"
                style={{
                    width: displaySize.width,
                    height: displaySize.height
                }}
                muted
                preload="metadata"
            />
            <canvas
                ref={canvasRef}
                className="video-overlay"
                width={displaySize.width}
                height={displaySize.height}
                style={{
                    width: displaySize.width,
                    height: displaySize.height,
                    cursor: 'crosshair'
                }}
                onClick={handleCanvasClick}
            />
        </div>
    );
});
