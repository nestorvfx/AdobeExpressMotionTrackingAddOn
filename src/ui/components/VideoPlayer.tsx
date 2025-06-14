import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { TrackingPoint } from '../utils/lucasKanadeTracker';
import './VideoPlayer.css';

interface VideoPlayerProps {
    src: string;
    currentFrame: number;
    isPlaying: boolean;
    trackingPoints: TrackingPoint[];
    onMetadataLoaded: (duration: number, width: number, height: number, fps?: number) => void;
    onAddTrackingPoint: (x: number, y: number) => void;
    onUpdateSearchRadius: (pointId: string, radius: number) => void;
    onMovePoint?: (pointId: string, x: number, y: number) => void;
    getPointColor: (index: number) => string;
    // New props for frame-specific rendering
    getPointsAtFrame?: (frame: number) => Array<TrackingPoint & { framePosition?: { x: number; y: number } }>;
    getTrajectoryPaths?: (frame: number, range?: number) => Array<{
        pointId: string;
        path: Array<{ x: number; y: number; frame: number }>;
    }>;
    // Mode control
    interactionMode?: 'scale' | 'move';
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({
    src,
    currentFrame,
    isPlaying,
    trackingPoints,
    onMetadataLoaded,
    onAddTrackingPoint,
    onUpdateSearchRadius,
    onMovePoint,
    getPointColor,
    getPointsAtFrame,
    getTrajectoryPaths,
    interactionMode = 'scale'
}, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);    const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
    const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
    const [videoFps, setVideoFps] = useState(30); // Will be detected from video
    
    const [dragState, setDragState] = useState<{
        pointId: string | null;
        isScaling: boolean;
        isMoving: boolean;
        startRadius: number;
        startX: number;
        startY: number;
        mouseDownPos: { x: number; y: number } | null;
        pendingAddPoint: { x: number; y: number } | null;
        currentMovePos?: { x: number; y: number }; // Real-time position during move
    }>({
        pointId: null,
        isScaling: false,
        isMoving: false,
        startRadius: 0,
        startX: 0,
        startY: 0,
        mouseDownPos: null,
        pendingAddPoint: null,
        currentMovePos: undefined
    });
    const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

    // Expose video ref to parent
    useImperativeHandle(ref, () => videoRef.current!, []);

    // Handle video metadata loaded
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;        const handleLoadedMetadata = async () => {
            const duration = video.duration;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
              // Try to detect actual framerate using common framerates heuristic
            let detectedFps = 30; // fallback
            
            try {
                // Test common framerates to see which gives the most sensible frame count
                const commonFps = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
                let bestFps = 30;
                let smallestError = Infinity;
                
                for (const fps of commonFps) {
                    const calculatedFrames = Math.round(duration * fps);
                    const timePerFrame = 1 / fps;
                    const calculatedDuration = calculatedFrames * timePerFrame;
                    const error = Math.abs(calculatedDuration - duration);
                    
                    if (error < smallestError) {
                        smallestError = error;
                        bestFps = fps;
                    }
                }
                
                // Only use detected FPS if the error is reasonable (less than 0.5 seconds)
                if (smallestError < 0.5) {
                    detectedFps = bestFps;
                }
                
                console.log(`Video FPS detected: ${detectedFps} (duration: ${duration.toFixed(2)}s, estimated ${Math.round(duration * detectedFps)} frames, error: ${smallestError.toFixed(3)}s)`);
                setVideoFps(detectedFps);
                
            } catch (error) {
                console.warn('FPS detection failed, using 30fps fallback:', error);
                setVideoFps(30);
            }
            
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
            
            onMetadataLoaded(duration, videoWidth, videoHeight, detectedFps);
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }, [src, onMetadataLoaded]);    // Update video current time based on current frame with accurate FPS
    // Only sync when NOT playing to avoid feedback loop with timeupdate event
    useEffect(() => {
        const video = videoRef.current;
        if (!video || video.duration === 0 || isPlaying) return;

        const targetTime = currentFrame / videoFps;
        
        if (Math.abs(video.currentTime - targetTime) > 0.03) {
            video.currentTime = targetTime;
        }
    }, [currentFrame, videoFps, isPlaying]);

    // Handle play/pause
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isPlaying) {
            video.play().catch(console.error);
        } else {
            video.pause();
        }    }, [isPlaying]);    // Handle mouse move for search radius adjustment or point moving
    const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !videoSize.width || !videoSize.height) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Check if scaling search radius
        if (dragState.isScaling && dragState.pointId) {
            const deltaX = mouseX - dragState.startX;
            
            // Calculate new radius with proper scaling
            const scaleFactor = videoSize.width / displaySize.width; // Convert display pixels to video pixels
            const newRadius = Math.max(25, Math.min(140, dragState.startRadius + deltaX * scaleFactor * 0.8)); // Min 25px, Max radius 140px
            
            onUpdateSearchRadius(dragState.pointId, newRadius);
            return;
        }        // Check if moving point
        if (dragState.isMoving && dragState.pointId && onMovePoint) {
            // Convert mouse position to video coordinates
            const videoX = (mouseX / displaySize.width) * videoSize.width;
            const videoY = (mouseY / displaySize.height) * videoSize.height;
            
            // Update the real-time position for visual feedback
            setDragState(prev => ({
                ...prev,
                currentMovePos: { x: videoX, y: videoY }
            }));
            
            return;
        }

        // Check if hovering over a tracking point
        let newHoveredPointId: string | null = null;
        for (const point of trackingPoints) {
            const displayX = (point.x / videoSize.width) * displaySize.width;
            const displayY = (point.y / videoSize.height) * displaySize.height;
            const distance = Math.sqrt((mouseX - displayX) ** 2 + (mouseY - displayY) ** 2);
            
            if (distance <= 15) {
                newHoveredPointId = point.id;
                break;
            }
        }
        
        if (newHoveredPointId !== hoveredPointId) {
            setHoveredPointId(newHoveredPointId);
        }
    };

    // Handle mouse up - either add point or end scaling/moving
    const handleCanvasMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (dragState.isScaling) {
            // End scaling operation
            setDragState({
                pointId: null,
                isScaling: false,
                isMoving: false,
                startRadius: 0,
                startX: 0,
                startY: 0,
                mouseDownPos: null,
                pendingAddPoint: null,
                currentMovePos: undefined
            });
        } else if (dragState.isMoving && dragState.pointId && dragState.currentMovePos && onMovePoint) {
            // Finalize point move - actually update the point position
            onMovePoint(dragState.pointId, dragState.currentMovePos.x, dragState.currentMovePos.y);
            
            setDragState({
                pointId: null,
                isScaling: false,
                isMoving: false,
                startRadius: 0,
                startX: 0,
                startY: 0,
                mouseDownPos: null,
                pendingAddPoint: null,
                currentMovePos: undefined
            });
        } else if (dragState.pendingAddPoint) {
            // Add new tracking point at mouse up position
            const rect = event.currentTarget.getBoundingClientRect();
            const upX = event.clientX - rect.left;
            const upY = event.clientY - rect.top;
            
            const videoX = (upX / displaySize.width) * videoSize.width;
            const videoY = (upY / displaySize.height) * videoSize.height;
            
            onAddTrackingPoint(videoX, videoY);
            setDragState({
                pointId: null,
                isScaling: false,
                isMoving: false,
                startRadius: 0,                startX: 0,
                startY: 0,
                mouseDownPos: null,
                pendingAddPoint: null,
                currentMovePos: undefined
            });
        }
    };

    // Handle mouse down to start scaling, moving, or prepare to add point
    const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !videoSize.width || !videoSize.height) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Convert click coordinates to video coordinates
        const videoX = (clickX / displaySize.width) * videoSize.width;
        const videoY = (clickY / displaySize.height) * videoSize.height;

        // Check if clicking on an existing tracking point
        for (const point of trackingPoints) {
            const displayX = (point.x / videoSize.width) * displaySize.width;
            const displayY = (point.y / videoSize.height) * displaySize.height;
            const distance = Math.sqrt((clickX - displayX) ** 2 + (clickY - displayY) ** 2);
            
            if (distance <= 15) { // 15px click tolerance
                if (interactionMode === 'scale') {
                    // Start search radius adjustment
                    setDragState({
                        pointId: point.id,
                        isScaling: true,
                        isMoving: false,
                        startRadius: point.searchRadius,
                        startX: clickX,
                        startY: clickY,
                        mouseDownPos: { x: clickX, y: clickY },
                        pendingAddPoint: null
                    });
                } else if (interactionMode === 'move') {
                    // Start point moving
                    setDragState({
                        pointId: point.id,
                        isScaling: false,
                        isMoving: true,
                        startRadius: point.searchRadius,
                        startX: clickX,
                        startY: clickY,
                        mouseDownPos: { x: clickX, y: clickY },
                        pendingAddPoint: null
                    });
                }
                return;
            }
        }

        // No point clicked, prepare to add new point
        setDragState({
            pointId: null,
            isScaling: false,
            isMoving: false,
            startRadius: 0,
            startX: 0,
            startY: 0,
            mouseDownPos: { x: clickX, y: clickY },
            pendingAddPoint: { x: videoX, y: videoY }        });
    };    // Draw tracking points and paths - frame-aware rendering
    useEffect(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !displaySize.width || !displaySize.height) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Log when we're drawing for this frame
        const videoTime = video ? video.currentTime.toFixed(3) : 'N/A';
        const expectedTime = (currentFrame / videoFps).toFixed(3);
        console.log(`Drawing Frame ${currentFrame}: Video at ${videoTime}s, Expected ${expectedTime}s`);

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);// Get frame-specific points and trajectories if available
        const framePoints = getPointsAtFrame ? getPointsAtFrame(currentFrame) : trackingPoints.map(p => ({ ...p, framePosition: undefined }));
        const trajectoryPaths = getTrajectoryPaths ? getTrajectoryPaths(currentFrame, 5) : [];

        // Draw trajectory paths first (background) - show full ±5 frames paths
        trajectoryPaths.forEach((pathData, pathIndex) => {
            const pointIndex = framePoints.findIndex(p => p.id === pathData.pointId);
            if (pointIndex === -1 || pathData.path.length < 2) return;

            const color = getPointColor(pointIndex);

            // Draw the full trajectory path
            if (pathData.path.length > 1) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 3]);
                ctx.globalAlpha = 0.7; // Make paths more visible

                ctx.beginPath();
                pathData.path.forEach((trajPoint, trajIndex) => {
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

            // Draw trajectory points with frame indicators
            pathData.path.forEach(trajPoint => {
                const trajDisplayX = (trajPoint.x / videoSize.width) * displaySize.width;
                const trajDisplayY = (trajPoint.y / videoSize.height) * displaySize.height;
                
                // Different styles for past, current, and future frames
                const isCurrentFrame = trajPoint.frame === currentFrame;
                const isPastFrame = trajPoint.frame < currentFrame;
                
                if (isCurrentFrame) {
                    // Current frame - larger, fully opaque
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 1.0;
                    ctx.beginPath();
                    ctx.arc(trajDisplayX, trajDisplayY, 4, 0, 2 * Math.PI);
                    ctx.fill();
                } else if (isPastFrame) {
                    // Past frames - smaller, semi-transparent
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.5;
                    ctx.beginPath();
                    ctx.arc(trajDisplayX, trajDisplayY, 2, 0, 2 * Math.PI);
                    ctx.fill();
                } else {
                    // Future frames - hollow circles
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = 0.5;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(trajDisplayX, trajDisplayY, 2, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            });

            ctx.globalAlpha = 1.0;
        });        // Draw tracking points at their frame-specific positions
        framePoints.forEach((point, index) => {
            // Use frame-specific position if available, otherwise use current position
            let pointX = (point as any).framePosition?.x ?? point.x;
            let pointY = (point as any).framePosition?.y ?? point.y;
            
            // Override with real-time move position if this point is being moved
            if (dragState.isMoving && dragState.pointId === point.id && dragState.currentMovePos) {
                pointX = dragState.currentMovePos.x;
                pointY = dragState.currentMovePos.y;
            }
            
            // Convert video coordinates to display coordinates
            const displayX = (pointX / videoSize.width) * displaySize.width;
            const displayY = (pointY / videoSize.height) * displaySize.height;
            const displayRadius = (point.searchRadius / videoSize.width) * displaySize.width;

            // Draw search area (outer circle) - only for active points
            if (point.isActive) {
                ctx.strokeStyle = getPointColor(index);
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.arc(displayX, displayY, displayRadius, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1.0;
            }

            // Draw tracking point (inner circle)
            const pointColor = getPointColor(index);
            ctx.fillStyle = point.isActive ? pointColor : '#888888'; // Gray for inactive points
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.arc(displayX, displayY, point.isActive ? 6 : 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            // Highlight if currently being scaled
            if (dragState.isScaling && dragState.pointId === point.id) {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(displayX, displayY, displayRadius, 0, 2 * Math.PI);
                ctx.stroke();
            }

            // Draw point label with frame info
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            
            // Draw text outline
            ctx.strokeText(`${index + 1}`, displayX, displayY - 10);
            ctx.fillText(`${index + 1}`, displayX, displayY - 10);

            // Show confidence for active points
            if (point.isActive && point.confidence < 0.8) {
                ctx.font = '10px Arial';
                const confidenceText = `${Math.round(point.confidence * 100)}%`;
                ctx.strokeText(confidenceText, displayX, displayY + 20);
                ctx.fillText(confidenceText, displayX, displayY + 20);
            }
        });
    }, [trackingPoints, displaySize, videoSize, getPointColor, dragState, hoveredPointId, currentFrame, getPointsAtFrame, getTrajectoryPaths, videoFps]);

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
                height={displaySize.height}                style={{
                    width: displaySize.width,
                    height: displaySize.height,
                    cursor: hoveredPointId ? 
                        (interactionMode === 'scale' ? 'ew-resize' : 'move') : 
                        'crosshair'
                }}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseDown={handleCanvasMouseDown}
            />
        </div>
    );
});
