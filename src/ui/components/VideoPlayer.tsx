import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { TrackingPoint, PlanarTracker, TrackingMode, InteractionMode } from '../utils/tracking/TrackingTypes';
import { Text3DElement } from '../utils/text3d/Text3DTypes';
import { Text3DRenderer } from '../utils/text3d/Text3DRenderer';
import './VideoPlayer.css';

type VideoPlayerMode = 'tracking' | 'text3d';

interface VideoPlayerProps {
    src: string;
    currentFrame: number;
    isPlaying: boolean;
    trackingPoints: TrackingPoint[];
    planarTrackers?: PlanarTracker[];
    trackingMode?: TrackingMode;
    onMetadataLoaded: (duration: number, width: number, height: number, fps?: number) => void;
    onAddTrackingPoint: (x: number, y: number) => void;
    onAddPlanarTracker?: (x: number, y: number) => void;
    onUpdateSearchRadius: (pointId: string, radius: number) => void;
    onMovePoint?: (pointId: string, x: number, y: number) => void;
    onMovePlanarCorner?: (trackerId: string, cornerIndex: number, x: number, y: number) => void;
    getPointColor: (index: number) => string;
    getPlanarTrackerColor?: (index: number) => string;
    // Props for trajectory rendering
    getTrajectoryPaths?: (frame: number, range?: number) => Array<{
        pointId: string;
        path: Array<{ x: number; y: number; frame: number }>;
    }>;
    // Mode control
    interactionMode?: InteractionMode;
    // Text3D mode props
    renderMode?: VideoPlayerMode;
    text3DElements?: Text3DElement[];
    onTextSelect?: (textId: string | null) => void;
    onTrackerSelect?: (trackerId: string | null, isPoint: boolean) => void;
    selectedTextId?: string | null;    selectedTrackerId?: string | null;
    hoveredTextId?: string | null;
    hoveredTrackerId?: string | null;
    onTextHover?: (textId: string | null) => void;
    onTrackerHover?: (trackerId: string | null) => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({
    src,
    currentFrame,
    isPlaying,
    trackingPoints,
    planarTrackers = [],
    trackingMode = 'point',
    onMetadataLoaded,
    onAddTrackingPoint,
    onAddPlanarTracker,
    onUpdateSearchRadius,
    onMovePoint,
    onMovePlanarCorner,
    getPointColor,
    getPlanarTrackerColor = (index) => `hsl(${(index * 60) % 360}, 70%, 50%)`,
    getTrajectoryPaths,
    interactionMode = 'scale',
    // Text3D mode props
    renderMode = 'tracking',
    text3DElements = [],
    onTextSelect,
    onTrackerSelect,    selectedTextId,
    selectedTrackerId,
    hoveredTextId,
    hoveredTrackerId,
    onTextHover,
    onTrackerHover
}, ref) => {    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const text3DRendererRef = useRef<Text3DRenderer | null>(null);const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
    const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
    const [videoFps, setVideoFps] = useState(30); // Will be detected from video
    
    const [dragState, setDragState] = useState<{
        pointId: string | null;
        planarTrackerId: string | null;
        planarCornerIndex: number;
        isScaling: boolean;
        isMoving: boolean;
        isMovingPlanarCorner: boolean;
        startRadius: number;
        startX: number;
        startY: number;
        mouseDownPos: { x: number; y: number } | null;
        pendingAddPoint: { x: number; y: number } | null;
        pendingAddPlanar: { x: number; y: number } | null;
        currentMovePos?: { x: number; y: number }; // Real-time position during move
    }>({
        pointId: null,
        planarTrackerId: null,
        planarCornerIndex: -1,
        isScaling: false,
        isMoving: false,
        isMovingPlanarCorner: false,
        startRadius: 0,
        startX: 0,
        startY: 0,
        mouseDownPos: null,
        pendingAddPoint: null,
        pendingAddPlanar: null,
        currentMovePos: undefined
    });
    const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
    const [hoveredPlanarInfo, setHoveredPlanarInfo] = useState<{
        trackerId: string;
        cornerIndex: number;
    } | null>(null);    // Expose video ref to parent
    useImperativeHandle(ref, () => videoRef.current!, []);

    // Initialize Text3D renderer when in text3d mode
    useEffect(() => {
        if (renderMode === 'text3d' && canvasRef.current && !text3DRendererRef.current) {
            text3DRendererRef.current = new Text3DRenderer(canvasRef.current);
        }
    }, [renderMode]);

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
        }        // Check if moving planar corner
        if (dragState.isMovingPlanarCorner && dragState.planarTrackerId !== null && dragState.planarCornerIndex !== -1 && onMovePlanarCorner) {
            const videoX = (mouseX / displaySize.width) * videoSize.width;
            const videoY = (mouseY / displaySize.height) * videoSize.height;
            
            // Update real-time position for visual feedback
            setDragState(prev => ({
                ...prev,
                currentMovePos: { x: videoX, y: videoY }
            }));
              return;
        }

        // Convert mouse position to video coordinates for text3d mode
        const videoX = (mouseX / displaySize.width) * videoSize.width;
        const videoY = (mouseY / displaySize.height) * videoSize.height;

        // Handle text3d mode hover detection
        if (renderMode === 'text3d') {
            // Check for text hover
            let hoveredText: string | null = null;
            if (text3DRendererRef.current) {
                for (const text of text3DElements) {
                    if (text3DRendererRef.current.hitTestText(
                        text,
                        { x: videoX, y: videoY },
                        trackingPoints,
                        planarTrackers,
                        currentFrame
                    )) {
                        hoveredText = text.id;
                        break;
                    }
                }
            }

            // Check for tracker hover
            let hoveredTracker: string | null = null;
            const tracker = getTrackerAtPosition(videoX, videoY);
            if (tracker) {
                hoveredTracker = tracker.id;
            }            // Notify parent about hover changes
            if (hoveredText !== hoveredTextId) {
                onTextHover?.(hoveredText);
            }
            if (hoveredTracker !== hoveredTrackerId) {
                onTrackerHover?.(hoveredTracker);
            }

            // Update cursor
            const cursor = hoveredText || hoveredTracker ? 'pointer' : 'default';
            canvas.style.cursor = cursor;
            return;
        }

        // Original tracking mode hover logic
        let newHoveredPointId: string | null = null;
        for (const point of trackingPoints) {
            // Check if this point is a feature point for any planar tracker
            const isFeaturePoint = planarTrackers.some(tracker => 
                tracker.featurePoints?.some(featurePoint => featurePoint.id === point.id)
            );
            
            // Skip hover detection for hidden feature points
            if (isFeaturePoint) {
                continue;
            }
            
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
          // Check if hovering over a planar tracker corner (only in move mode)
        let newHoveredPlanarInfo: { trackerId: string; cornerIndex: number } | null = null;
        if (interactionMode === 'move') {
            for (const tracker of planarTrackers) {
                for (let i = 0; i < 4; i++) {
                    const corner = tracker.corners[i];
                    const displayX = (corner.x / videoSize.width) * displaySize.width;
                    const displayY = (corner.y / videoSize.height) * displaySize.height;
                    const distance = Math.sqrt((mouseX - displayX) ** 2 + (mouseY - displayY) ** 2);
                    
                    if (distance <= 10) {
                        newHoveredPlanarInfo = { trackerId: tracker.id, cornerIndex: i };
                        break;
                    }
                }
                if (newHoveredPlanarInfo) break;
            }
        }
        
        if (newHoveredPlanarInfo !== hoveredPlanarInfo) {
            setHoveredPlanarInfo(newHoveredPlanarInfo);
        }
    };

    // Handle mouse up - either add point or end scaling/moving
    const handleCanvasMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (dragState.isScaling) {
            // End scaling operation
            setDragState({
                pointId: null,
                planarTrackerId: null,
                planarCornerIndex: -1,
                isScaling: false,
                isMoving: false,
                isMovingPlanarCorner: false,
                startRadius: 0,
                startX: 0,
                startY: 0,
                mouseDownPos: null,
                pendingAddPoint: null,
                pendingAddPlanar: null,
                currentMovePos: undefined
            });
        } else if (dragState.isMoving && dragState.pointId && dragState.currentMovePos && onMovePoint) {
            // Finalize point move - actually update the point position
            onMovePoint(dragState.pointId, dragState.currentMovePos.x, dragState.currentMovePos.y);
            
            setDragState({
                pointId: null,
                planarTrackerId: null,
                planarCornerIndex: -1,
                isScaling: false,
                isMoving: false,
                isMovingPlanarCorner: false,
                startRadius: 0,
                startX: 0,
                startY: 0,
                mouseDownPos: null,
                pendingAddPoint: null,
                pendingAddPlanar: null,
                currentMovePos: undefined
            });
        } else if (dragState.isMovingPlanarCorner && dragState.planarTrackerId && dragState.planarCornerIndex !== -1 && dragState.currentMovePos) {
            // Finalize planar corner move
            const { planarTrackerId, planarCornerIndex, currentMovePos } = dragState;
            onMovePlanarCorner(planarTrackerId, planarCornerIndex, currentMovePos.x, currentMovePos.y);
            
            setDragState({
                pointId: null,
                planarTrackerId: null,
                planarCornerIndex: -1,
                isScaling: false,
                isMoving: false,
                isMovingPlanarCorner: false,
                startRadius: 0,
                startX: 0,
                startY: 0,
                mouseDownPos: null,
                pendingAddPoint: null,
                pendingAddPlanar: null,
                currentMovePos: undefined
            });
        } else if (dragState.pendingAddPlanar && onAddPlanarTracker) {
            // Add new planar tracker at mouse up position
            const rect = event.currentTarget.getBoundingClientRect();
            const upX = event.clientX - rect.left;
            const upY = event.clientY - rect.top;
            
            const videoX = (upX / displaySize.width) * videoSize.width;
            const videoY = (upY / displaySize.height) * videoSize.height;
            
            onAddPlanarTracker(videoX, videoY);
            setDragState({
                pointId: null,
                planarTrackerId: null,
                planarCornerIndex: -1,
                isScaling: false,
                isMoving: false,
                isMovingPlanarCorner: false,
                startRadius: 0,
                startX: 0,
                startY: 0,
                mouseDownPos: null,
                pendingAddPoint: null,
                pendingAddPlanar: null,
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
                planarTrackerId: null,
                planarCornerIndex: -1,
                isScaling: false,
                isMoving: false,
                isMovingPlanarCorner: false,
                startRadius: 0,                startX: 0,
                startY: 0,
                mouseDownPos: null,
                pendingAddPoint: null,
                pendingAddPlanar: null,
                currentMovePos: undefined
            });
        }
    };    // Handle mouse down to start scaling, moving, or prepare to add point
    const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !videoSize.width || !videoSize.height) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Convert click coordinates to video coordinates
        const videoX = (clickX / displaySize.width) * videoSize.width;
        const videoY = (clickY / displaySize.height) * videoSize.height;

        // Handle text3d mode interactions
        if (renderMode === 'text3d') {
            // Test if any text was clicked
            if (text3DRendererRef.current) {
                for (const text of text3DElements) {
                    if (text3DRendererRef.current.hitTestText(
                        text,
                        { x: videoX, y: videoY },
                        trackingPoints,
                        planarTrackers,
                        currentFrame
                    )) {
                        onTextSelect?.(text.id);
                        onTrackerSelect?.(null, false); // Deselect tracker when text is selected
                        return;
                    }
                }
            }

            // Test if any tracker was clicked
            const clickedTracker = getTrackerAtPosition(videoX, videoY);
            if (clickedTracker) {
                onTrackerSelect?.(clickedTracker.id, clickedTracker.type === 'point');
                onTextSelect?.(null); // Deselect text when tracker is selected
                return;
            }

            // If nothing was clicked, deselect everything
            onTrackerSelect?.(null, false);
            onTextSelect?.(null);
            return;
        }// Check if clicking on an existing tracking point
        for (const point of trackingPoints) {
            // Check if this point is a feature point for any planar tracker
            const isFeaturePoint = planarTrackers.some(tracker => 
                tracker.featurePoints?.some(featurePoint => featurePoint.id === point.id)
            );
            
            // Skip interaction with hidden feature points
            if (isFeaturePoint) {
                continue;
            }
            
            const displayX = (point.x / videoSize.width) * displaySize.width;
            const displayY = (point.y / videoSize.height) * displaySize.height;
            const distance = Math.sqrt((clickX - displayX) ** 2 + (clickY - displayY) ** 2);
            
            if (distance <= 15) { // 15px click tolerance
                if (interactionMode === 'scale') {
                    // Start search radius adjustment
                    setDragState({
                        pointId: point.id,
                        planarTrackerId: null,
                        planarCornerIndex: -1,
                        isScaling: true,
                        isMoving: false,
                        isMovingPlanarCorner: false,
                        startRadius: point.searchRadius,
                        startX: clickX,
                        startY: clickY,
                        mouseDownPos: { x: clickX, y: clickY },
                        pendingAddPoint: null,
                        pendingAddPlanar: null
                    });
                } else if (interactionMode === 'move') {
                    // Start point moving
                    setDragState({
                        pointId: point.id,
                        planarTrackerId: null,
                        planarCornerIndex: -1,
                        isScaling: false,
                        isMoving: true,
                        isMovingPlanarCorner: false,
                        startRadius: point.searchRadius,
                        startX: clickX,
                        startY: clickY,
                        mouseDownPos: { x: clickX, y: clickY },
                        pendingAddPoint: null,
                        pendingAddPlanar: null
                    });
                }
                return;
            }
        }        // Check if clicking on an existing planar tracker corner
        for (const tracker of planarTrackers) {
            for (let i = 0; i < 4; i++) {
                const corner = tracker.corners[i];
                const displayX = (corner.x / videoSize.width) * displaySize.width;
                const displayY = (corner.y / videoSize.height) * displaySize.height;
                const distance = Math.sqrt((clickX - displayX) ** 2 + (clickY - displayY) ** 2);
                
                if (distance <= 10) { // 10px click tolerance for corners
                    // Only allow moving planar corners in move mode, ignore in scale mode
                    if (interactionMode === 'move') {
                        // Start moving planar corner
                        setDragState({
                            pointId: null,
                            planarTrackerId: tracker.id,
                            planarCornerIndex: i,
                            isScaling: false,
                            isMoving: false,
                            isMovingPlanarCorner: true,
                            startRadius: 0,
                            startX: clickX,
                            startY: clickY,
                            mouseDownPos: { x: clickX, y: clickY },
                            pendingAddPoint: null,
                            pendingAddPlanar: null
                        });
                        return;
                    }
                    // In scale mode, ignore clicks on planar corners and continue to add new tracker/point
                }
            }
        }// No point or corner clicked, prepare to add new point or planar tracker
        if (trackingMode === 'point') {
            setDragState({
                pointId: null,
                planarTrackerId: null,
                planarCornerIndex: -1,
                isScaling: false,
                isMoving: false,
                isMovingPlanarCorner: false,
                startRadius: 0,
                startX: 0,
                startY: 0,
                mouseDownPos: { x: clickX, y: clickY },
                pendingAddPoint: { x: videoX, y: videoY },
                pendingAddPlanar: null
            });
        } else if (trackingMode === 'planar') {
            setDragState({
                pointId: null,
                planarTrackerId: null,
                planarCornerIndex: -1,
                isScaling: false,
                isMoving: false,
                isMovingPlanarCorner: false,
                startRadius: 0,
                startX: 0,
                startY: 0,
                mouseDownPos: { x: clickX, y: clickY },
                pendingAddPoint: null,
                pendingAddPlanar: { x: videoX, y: videoY }            });
        }
    };

    // Helper function to get tracker at position (for text3d mode)
    const getTrackerAtPosition = (x: number, y: number) => {
        // Check planar trackers first
        for (const tracker of planarTrackers) {
            if (!tracker.isActive) continue;
            
            // Get current frame corners
            let corners = [...tracker.corners];
            if (tracker.trajectory && tracker.trajectory.length > 0) {
                const frameEntry = tracker.trajectory.find(t => t.frame === currentFrame);
                if (frameEntry && frameEntry.corners.length === 4) {
                    corners = frameEntry.corners.map((c, i) => ({
                        ...tracker.corners[i],
                        x: c.x,
                        y: c.y
                    }));
                } else {
                    const validEntries = tracker.trajectory.filter(t => t.frame <= currentFrame);
                    if (validEntries.length > 0) {
                        const closestEntry = validEntries[validEntries.length - 1];
                        if (closestEntry.corners.length === 4) {
                            corners = closestEntry.corners.map((c, i) => ({
                                ...tracker.corners[i],
                                x: c.x,
                                y: c.y
                            }));
                        }
                    }
                }
            }
            
            // Check if point is inside polygon
            if (isPointInPolygon(x, y, corners)) {
                return { id: tracker.id, type: 'planar' as const };
            }
        }

        // Check point trackers
        for (const point of trackingPoints) {
            if (!point.isActive) continue;
            
            // Skip feature points from planar trackers
            const isFeaturePoint = planarTrackers.some(tracker => 
                tracker.featurePoints?.some(fp => fp.id === point.id)
            );
            if (isFeaturePoint) continue;
            
            const pos = point.framePositions?.get(currentFrame) || { x: point.x, y: point.y };
            const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
            
            if (distance <= 12) { // 12px hit radius
                return { id: point.id, type: 'point' as const };
            }
        }

        return null;
    };

    // Helper function for point-in-polygon test
    const isPointInPolygon = (x: number, y: number, polygon: { x: number; y: number }[]) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].y > y) !== (polygon[j].y > y)) &&
                (x < (polygon[j].x - polygon[i].x) * (y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                inside = !inside;
            }
        }
        return inside;
    };    // Draw tracking points and paths - frame-aware rendering
    useEffect(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !displaySize.width || !displaySize.height) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas dimensions based on render mode
        if (renderMode === 'text3d') {
            // For text3d mode, canvas should match video dimensions for proper Text3DRenderer coordinate system
            canvas.width = videoSize.width;
            canvas.height = videoSize.height;
        } else {
            // For tracking mode, canvas matches display size
            canvas.width = displaySize.width;
            canvas.height = displaySize.height;
        }

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Render based on mode
        if (renderMode === 'tracking') {
            renderTrackingMode(ctx);
        } else if (renderMode === 'text3d') {
            renderText3DMode(ctx);
        }
    }, [trackingPoints, displaySize, videoSize, getPointColor, dragState, hoveredPointId, hoveredPlanarInfo, currentFrame, getTrajectoryPaths, videoFps, planarTrackers, getPlanarTrackerColor, trackingMode, renderMode, text3DElements, selectedTextId, selectedTrackerId, hoveredTextId, hoveredTrackerId]);

    // Render tracking mode overlays
    const renderTrackingMode = (ctx: CanvasRenderingContext2D) => {// Get current tracking points - visual positions are already synced to frame during scrubbing
        const framePoints = trackingPoints;
        const trajectoryPaths = getTrajectoryPaths ? getTrajectoryPaths(currentFrame, 5) : [];        // Draw trajectory paths first (background) - show full ±5 frames paths
        trajectoryPaths.forEach((pathData, pathIndex) => {
            const pointIndex = framePoints.findIndex(p => p.id === pathData.pointId);
            if (pointIndex === -1 || pathData.path.length < 2) return;

            // Check if this trajectory belongs to a feature point (should be hidden)
            const isFeaturePointTrajectory = planarTrackers.some(tracker => 
                tracker.featurePoints?.some(featurePoint => featurePoint.id === pathData.pointId)
            );
            
            // Skip rendering trajectories for feature points
            if (isFeaturePointTrajectory) {
                return;
            }

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
        });        // Draw tracking points at their current visual positions (exclude planar tracker feature points)
        framePoints.forEach((point, index) => {
            // Check if this point is a feature point for any planar tracker
            const isFeaturePoint = planarTrackers.some(tracker => 
                tracker.featurePoints?.some(featurePoint => featurePoint.id === point.id)
            );
            
            // Skip rendering feature points - they should be hidden
            if (isFeaturePoint) {
                return;
            }
            
            // Always use current visual position (point.x, point.y) for display
            // This ensures manual moves and tracking results are immediately visible
            let pointX = point.x;
            let pointY = point.y;
            
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
          // Draw planar trackers
        planarTrackers.forEach((tracker, trackerIndex) => {
            const color = getPlanarTrackerColor(trackerIndex);
            
            // Update corner positions if being moved
            const displayCorners = tracker.corners.map((corner, cornerIndex) => {
                let cornerX = corner.x;
                let cornerY = corner.y;
                
                // Override with real-time move position if this corner is being moved
                if (dragState.isMovingPlanarCorner && 
                    dragState.planarTrackerId === tracker.id && 
                    dragState.planarCornerIndex === cornerIndex && 
                    dragState.currentMovePos) {
                    cornerX = dragState.currentMovePos.x;
                    cornerY = dragState.currentMovePos.y;
                }
                
                return {
                    x: (cornerX / videoSize.width) * displaySize.width,
                    y: (cornerY / videoSize.height) * displaySize.height
                };
            });
            
            // Draw tracker outline and fill
            if (displayCorners.length === 4) {
                // Fill the tracker area with semi-transparent overlay
                ctx.fillStyle = color;
                ctx.globalAlpha = tracker.isActive ? 0.2 : 0.0; // 20% opacity for active, transparent for inactive
                
                ctx.beginPath();
                ctx.moveTo(displayCorners[0].x, displayCorners[0].y);
                ctx.lineTo(displayCorners[1].x, displayCorners[1].y);
                ctx.lineTo(displayCorners[2].x, displayCorners[2].y);
                ctx.lineTo(displayCorners[3].x, displayCorners[3].y);
                ctx.closePath();
                ctx.fill();
                
                // Draw tracker outline
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash(tracker.isActive ? [] : [5, 5]); // Solid for active, dashed for inactive
                ctx.globalAlpha = tracker.isActive ? 1.0 : 0.7;
                
                ctx.beginPath();
                ctx.moveTo(displayCorners[0].x, displayCorners[0].y);
                ctx.lineTo(displayCorners[1].x, displayCorners[1].y);
                ctx.lineTo(displayCorners[2].x, displayCorners[2].y);
                ctx.lineTo(displayCorners[3].x, displayCorners[3].y);
                ctx.closePath();
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1.0;
            }
            
            // Draw tracker corners as diamond shapes
            displayCorners.forEach((displayCorner, cornerIndex) => {
                const isHovered = hoveredPlanarInfo?.trackerId === tracker.id && 
                                hoveredPlanarInfo?.cornerIndex === cornerIndex;
                
                // Draw diamond corner handle
                ctx.fillStyle = tracker.isActive ? color : '#888888';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.globalAlpha = 1.0;
                
                const size = isHovered ? 6 : 4; // Slightly larger when hovered
                
                ctx.beginPath();
                ctx.moveTo(displayCorner.x, displayCorner.y - size); // Top
                ctx.lineTo(displayCorner.x + size, displayCorner.y); // Right
                ctx.lineTo(displayCorner.x, displayCorner.y + size); // Bottom
                ctx.lineTo(displayCorner.x - size, displayCorner.y); // Left
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                
                // Show corner number in planar mode
                if (trackingMode === 'planar') {
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    
                    const cornerLabel = `${cornerIndex + 1}`;
                    ctx.strokeText(cornerLabel, displayCorner.x, displayCorner.y - 10);
                    ctx.fillText(cornerLabel, displayCorner.x, displayCorner.y - 10);
                }
            });
              // Show tracking quality indicator
            if (tracker.isActive && tracker.confidence < 0.8) {
                const centerX = displayCorners.reduce((sum, c) => sum + c.x, 0) / 4;
                const centerY = displayCorners.reduce((sum, c) => sum + c.y, 0) / 4;
                
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                
                const confidenceText = `${Math.round(tracker.confidence * 100)}%`;
                ctx.strokeText(confidenceText, centerX, centerY);
                ctx.fillText(confidenceText, centerX, centerY);
            }
        });
    };    // Render text3d mode overlays (matching original Text3DEditor appearance)
    const renderText3DMode = (ctx: CanvasRenderingContext2D) => {
        // Render tracking points with original Text3DEditor styling
        trackingPoints.forEach((point, index) => {
            // Skip feature points from planar trackers
            const isFeaturePoint = planarTrackers.some(tracker => 
                tracker.featurePoints?.some(fp => fp.id === point.id)
            );
            if (isFeaturePoint || !point.isActive) return;
            
            const isHovered = hoveredTrackerId === point.id;
            const isSelected = selectedTrackerId === point.id;
              // Get position for current frame or fallback to current position
            const pos = point.framePositions?.get(currentFrame) || { x: point.x, y: point.y };
            // Use video coordinates directly (no scaling needed in text3d mode)
            const displayX = pos.x;
            const displayY = pos.y;
            const color = `hsl(${(index * 60) % 360}, 70%, 50%)`;
            
            // Draw hover/selection glow effect (subtle like original)
            if (isHovered || isSelected) {
                ctx.fillStyle = color;
                ctx.globalAlpha = isSelected ? 0.3 : 0.2;
                ctx.beginPath();
                ctx.arc(displayX, displayY, isSelected ? 20 : 18, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                
                // Add outer glow ring for hover effect
                if (isHovered) {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.arc(displayX, displayY, 22, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }
            }
            
            // Draw point with original styling (smaller, more subtle)
            const pointSize = isSelected ? 9 : isHovered ? 8 : 6;
            ctx.fillStyle = color;
            ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : '#ffffff';
            ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 2;
            ctx.globalAlpha = isSelected ? 1.0 : isHovered ? 0.95 : 0.8;
            ctx.beginPath();
            ctx.arc(displayX, displayY, pointSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
              // Draw search radius (subtle like original) - use video coordinates
            ctx.strokeStyle = color;
            ctx.lineWidth = isSelected ? 2 : isHovered ? 1.5 : 1;
            ctx.globalAlpha = isSelected ? 0.5 : isHovered ? 0.4 : 0.25;
            ctx.beginPath();
            ctx.arc(displayX, displayY, point.searchRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        });        // Render planar trackers with original Text3DEditor styling
        planarTrackers.forEach((tracker, index) => {
            if (!tracker.isActive) return;
            
            const isHovered = hoveredTrackerId === tracker.id;
            const isSelected = selectedTrackerId === tracker.id;
            const color = `hsl(${(index * 60) % 360}, 70%, 50%)`;
            
            // Get current frame position from trajectory or use current position
            let corners = [...tracker.corners];
            let center = { ...tracker.center };
            
            if (tracker.trajectory && tracker.trajectory.length > 0) {
                const exactFrameEntry = tracker.trajectory.find(t => t.frame === currentFrame);
                if (exactFrameEntry && exactFrameEntry.corners.length === 4) {
                    corners = exactFrameEntry.corners.map((c, i) => ({
                        ...tracker.corners[i],
                        x: c.x,
                        y: c.y
                    }));
                    center = exactFrameEntry.center;
                } else {
                    const sortedEntries = tracker.trajectory
                        .filter(t => t.frame <= currentFrame)
                        .sort((a, b) => b.frame - a.frame);
                    
                    if (sortedEntries.length > 0) {
                        const closestEntry = sortedEntries[0];
                        if (closestEntry.corners.length === 4) {
                            corners = closestEntry.corners.map((c, i) => ({
                                ...tracker.corners[i],
                                x: c.x,
                                y: c.y
                            }));
                            center = closestEntry.center;
                        }
                    }
                }
            }            // Use video coordinates directly (no scaling)
            const displayCorners = corners.map(corner => ({
                x: corner.x,
                y: corner.y
            }));

            // Draw hover/selection fill (subtle like original)
            if (isHovered || isSelected) {
                ctx.fillStyle = color;
                ctx.globalAlpha = isSelected ? 0.2 : 0.12;
                ctx.beginPath();
                displayCorners.forEach((corner, i) => {
                    if (i === 0) {
                        ctx.moveTo(corner.x, corner.y);
                    } else {
                        ctx.lineTo(corner.x, corner.y);
                    }
                });
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1.0;
                
                // Add outer glow effect for hover (like original)
                if (isHovered) {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 6;
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    displayCorners.forEach((corner, i) => {
                        if (i === 0) {
                            ctx.moveTo(corner.x, corner.y);
                        } else {
                            ctx.lineTo(corner.x, corner.y);
                        }
                    });
                    ctx.closePath();
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }
            }
              // Draw tracker outline (original Text3DEditor sizing - thinner)
            ctx.strokeStyle = color;
            ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;
            ctx.globalAlpha = isSelected ? 1.0 : isHovered ? 0.95 : 0.7;
            ctx.beginPath();
            
            displayCorners.forEach((corner, i) => {
                if (i === 0) {
                    ctx.moveTo(corner.x, corner.y);
                } else {
                    ctx.lineTo(corner.x, corner.y);
                }
            });
            ctx.closePath();
            ctx.stroke();
              // Draw corner handles (original Text3DEditor sizing - smaller)
            const handleSize = isSelected ? 4 : isHovered ? 3.5 : 2.5;
            ctx.globalAlpha = 1.0;
            displayCorners.forEach(corner => {
                ctx.fillStyle = color;
                ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : 'white';
                ctx.lineWidth = isSelected ? 2 : isHovered ? 1.5 : 1;
                ctx.fillRect(corner.x - handleSize, corner.y - handleSize, handleSize * 2, handleSize * 2);
                ctx.strokeRect(corner.x - handleSize, corner.y - handleSize, handleSize * 2, handleSize * 2);
            });
              // Draw center point (original Text3DEditor sizing - smaller)
            const centerDisplayX = center.x;
            const centerDisplayY = center.y;
            const centerSize = isSelected ? 4 : isHovered ? 3.5 : 2.5;
            ctx.fillStyle = color;
            ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : 'white';
            ctx.lineWidth = isSelected ? 2 : isHovered ? 1.5 : 1;
            ctx.beginPath();
            ctx.arc(centerDisplayX, centerDisplayY, centerSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        // Render 3D text elements using Text3DRenderer
        if (text3DRendererRef.current) {
            text3DRendererRef.current.renderAllTexts(
                text3DElements,
                trackingPoints,
                planarTrackers,
                currentFrame,
                hoveredTextId
            );
        }
    };

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
            />            <canvas
                ref={canvasRef}
                className="video-overlay"
                width={renderMode === 'text3d' ? videoSize.width : displaySize.width}
                height={renderMode === 'text3d' ? videoSize.height : displaySize.height}
                style={{
                    width: displaySize.width,
                    height: displaySize.height,
                    cursor: (() => {
                        if (renderMode === 'text3d') {
                            // Text3D mode cursors are handled in mouse move handler
                            return 'default';
                        }
                        // Tracking mode cursors
                        if (hoveredPointId) {
                            return interactionMode === 'scale' ? 'ew-resize' : 'move';
                        }
                        if (hoveredPlanarInfo && interactionMode === 'move') {
                            return 'move';
                        }
                        return 'crosshair';
                    })()
                }}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseDown={handleCanvasMouseDown}
            />
        </div>
    );
});
