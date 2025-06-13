import React, { useState, useRef, useEffect } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { Timeline } from './Timeline';
import { LucasKanadeTracker, TrackingPoint } from '../utils/lucasKanadeTracker';
import { DocumentSandboxApi } from '../../models/DocumentSandboxApi';
import './App.css';

interface AppProps {
    addOnUISdk: any;
    sandboxProxy: DocumentSandboxApi;
}

export const App: React.FC<AppProps> = ({ addOnUISdk, sandboxProxy }) => {
    // Video state
    const [videoSrc, setVideoSrc] = useState<string>('');
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [duration, setDuration] = useState(0);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [totalFrames, setTotalFrames] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [fps] = useState(30);    // Tracking state
    const [trackingPoints, setTrackingPoints] = useState<TrackingPoint[]>([]);
    const [isTracking, setIsTracking] = useState(false);
    const [trackingProgress, setTrackingProgress] = useState(0);
    const trackingCancelledRef = useRef(false);

    // Toast state
    const [toast, setToast] = useState<{message: string, type: 'info' | 'success' | 'error'} | null>(null);

    // Refs
    const trackerRef = useRef<LucasKanadeTracker | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize tracker
    useEffect(() => {
        trackerRef.current = new LucasKanadeTracker();
    }, []);

    // Toast auto-hide
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
        setToast({ message, type });
    };

    // File upload handlers
    const handleVideoUpload = (file: File) => {
        setVideoFile(file);
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        showToast('Video uploaded successfully', 'success');
    };

    const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            handleVideoUpload(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files[0] && files[0].type.startsWith('video/')) {
            handleVideoUpload(files[0]);
        }
    };

    // Video metadata handler
    const handleVideoLoaded = async (videoDuration: number, width: number, height: number) => {
        setDuration(videoDuration);
        setTotalFrames(Math.floor(videoDuration * fps));
        setCurrentFrame(0);
        
        if (trackerRef.current) {
            await trackerRef.current.initialize();
        }
    };

    // Playback handlers
    const handlePlayPause = () => {
        setIsPlaying(!isPlaying);
    };    const handleFrameChange = (frame: number) => {
        const newFrame = Math.max(0, Math.min(frame, totalFrames - 1));
        setCurrentFrame(newFrame);
        setIsPlaying(false);
        
        // Reset tracking state when seeking to ensure optical flow consistency
        if (trackerRef.current) {
            trackerRef.current.handleSeek();
            trackerRef.current.setCurrentFrame(newFrame);
        }
    };    // Tracking point handlers
    const handleAddTrackingPoint = async (x: number, y: number) => {
        if (!trackerRef.current || !videoRef.current) return;        try {
            // Ensure tracker is initialized first
            const isInitialized = await trackerRef.current.initialize();
            if (!isInitialized) {
                showToast('Tracker not initialized', 'error');
                return;
            }

            // First, process the current frame to ensure we have reference data
            const canvasElement = document.createElement('canvas');
            trackerRef.current.setCurrentFrame(currentFrame);
            
            // Small delay to ensure video frame is stable
            await new Promise(resolve => setTimeout(resolve, 100));
            
            trackerRef.current.processFrame(videoRef.current, canvasElement);
            
            // Now add the tracking point
            const pointId = trackerRef.current.addTrackingPoint(x, y);
            if (pointId) {
                const updatedPoints = trackerRef.current.getTrackingPoints();
                setTrackingPoints(updatedPoints);
                showToast(`Added tracking point at (${Math.round(x)}, ${Math.round(y)})`, 'success');
            }
        } catch (error) {
            console.error('Error adding tracking point:', error);
            showToast('Failed to add tracking point', 'error');
        }
    };

    const handleRemoveTrackingPoint = (pointId: string) => {
        if (!trackerRef.current) return;

        try {
            trackerRef.current.removeTrackingPoint(pointId);
            const updatedPoints = trackerRef.current.getTrackingPoints();
            setTrackingPoints(updatedPoints);
            showToast('Tracking point removed', 'info');
        } catch (error) {
            console.error('Error removing tracking point:', error);
        }
    };

    const handleClearAllPoints = () => {
        if (!trackerRef.current) return;

        try {
            trackerRef.current.clearAllPoints();
            setTrackingPoints([]);
            showToast('All tracking points cleared', 'info');
        } catch (error) {
            console.error('Error clearing tracking points:', error);        }
    };

    // Tracking handlers
    const handleTrackForward = async () => {
        if (!trackerRef.current || !videoRef.current || trackingPoints.length === 0) {
            showToast('Please add tracking points first', 'error');
            return;
        }

        // Ensure tracker is initialized
        const isInitialized = await trackerRef.current.initialize();
        if (!isInitialized) {
            showToast('Failed to initialize tracker', 'error');
            return;
        }        // Reset tracker state for new tracking session
        trackerRef.current.resetTracker();
        trackerRef.current.setCurrentFrame(currentFrame);

        setIsTracking(true);
        setTrackingProgress(0);
        trackingCancelledRef.current = false;

        try {
            const framesToTrack = totalFrames - currentFrame - 1;
            let trackedFrames = 0;            for (let i = currentFrame + 1; i < totalFrames && !trackingCancelledRef.current; i++) {
                if (videoRef.current) {
                    // Seek to the new frame and wait for it to complete
                    videoRef.current.currentTime = i / fps;
                    
                    // Wait for video to seek properly
                    await new Promise<void>((resolve) => {
                        const video = videoRef.current!;
                        const handleSeeked = () => {
                            video.removeEventListener('seeked', handleSeeked);
                            resolve();
                        };
                        video.addEventListener('seeked', handleSeeked);
                        
                        // Fallback timeout in case seeked event doesn't fire
                        setTimeout(() => {
                            video.removeEventListener('seeked', handleSeeked);
                            resolve();
                        }, 100);
                    });

                    // Additional delay to ensure frame is fully rendered
                    await new Promise(resolve => setTimeout(resolve, 50));

                    // Process the frame
                    const canvasElement = document.createElement('canvas');
                    console.log(`Tracking frame ${i}, video time: ${videoRef.current.currentTime}`);
                    trackerRef.current.setCurrentFrame(i);
                    trackerRef.current.processFrame(videoRef.current, canvasElement);
                    const updatedPoints = trackerRef.current.getTrackingPoints();
                    setTrackingPoints([...updatedPoints]);trackedFrames++;
                    setTrackingProgress(trackedFrames / framesToTrack);
                    setCurrentFrame(i);
                    
                    // Small delay to allow UI updates and cancellation checks
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            if (trackingCancelledRef.current) {
                showToast('Forward tracking stopped', 'info');
            } else {
                showToast('Forward tracking completed', 'success');
            }
        } catch (error) {
            console.error('Error during forward tracking:', error);
            showToast('Tracking failed', 'error');
        } finally {
            setIsTracking(false);
            setTrackingProgress(0);
            trackingCancelledRef.current = false;
        }
    };    const handleTrackBackward = async () => {
        if (!trackerRef.current || !videoRef.current || trackingPoints.length === 0) {
            showToast('Please add tracking points first', 'error');
            return;
        }

        // Ensure tracker is initialized
        const isInitialized = await trackerRef.current.initialize();
        if (!isInitialized) {
            showToast('Failed to initialize tracker', 'error');
            return;
        }

        setIsTracking(true);
        setTrackingProgress(0);
        trackingCancelledRef.current = false;

        try {
            const framesToTrack = currentFrame;
            let trackedFrames = 0;

            for (let i = currentFrame - 1; i >= 0 && !trackingCancelledRef.current; i--) {
                if (videoRef.current) {
                    // Seek to the new frame and wait for it to complete
                    videoRef.current.currentTime = i / fps;
                    
                    // Wait for video to seek properly
                    await new Promise<void>((resolve) => {
                        const video = videoRef.current!;
                        const handleSeeked = () => {
                            video.removeEventListener('seeked', handleSeeked);
                            resolve();
                        };
                        video.addEventListener('seeked', handleSeeked);
                        
                        // Fallback timeout in case seeked event doesn't fire
                        setTimeout(() => {
                            video.removeEventListener('seeked', handleSeeked);
                            resolve();
                        }, 100);                    });

                    // Additional delay to ensure frame is fully rendered
                    await new Promise(resolve => setTimeout(resolve, 50));

                    // Process the frame
                    const canvasElement = document.createElement('canvas');
                    console.log(`Tracking frame ${i}, video time: ${videoRef.current.currentTime}`);
                    trackerRef.current.setCurrentFrame(i);
                    trackerRef.current.processFrame(videoRef.current, canvasElement);
                    const updatedPoints = trackerRef.current.getTrackingPoints();
                    setTrackingPoints([...updatedPoints]);

                    trackedFrames++;
                    setTrackingProgress(trackedFrames / framesToTrack);
                    setCurrentFrame(i);
                    
                    // Small delay to allow UI updates and cancellation checks
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            if (trackingCancelledRef.current) {
                showToast('Backward tracking stopped', 'info');
            } else {
                showToast('Backward tracking completed', 'success');
            }
        } catch (error) {
            console.error('Error during backward tracking:', error);
            showToast('Tracking failed', 'error');
        } finally {
            setIsTracking(false);
            setTrackingProgress(0);
            trackingCancelledRef.current = false;
        }
    };

    const handleStepForward = async () => {
        if (!trackerRef.current || !videoRef.current || currentFrame >= totalFrames - 1) return;

        const nextFrame = currentFrame + 1;        if (videoRef.current) {
            videoRef.current.currentTime = nextFrame / fps;
            
            // Wait for video seeking to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvasElement = document.createElement('canvas');
            trackerRef.current.setCurrentFrame(nextFrame);
            trackerRef.current.processFrame(videoRef.current, canvasElement);
            const updatedPoints = trackerRef.current.getTrackingPoints();
            setTrackingPoints([...updatedPoints]);
            setCurrentFrame(nextFrame);
        }
    };

    const handleStepBackward = async () => {
        if (!trackerRef.current || !videoRef.current || currentFrame <= 0) return;

        const prevFrame = currentFrame - 1;        if (videoRef.current) {
            videoRef.current.currentTime = prevFrame / fps;
            await new Promise(resolve => setTimeout(resolve, 50));

            const canvasElement = document.createElement('canvas');
            trackerRef.current.setCurrentFrame(prevFrame);
            trackerRef.current.processFrame(videoRef.current, canvasElement);
            const updatedPoints = trackerRef.current.getTrackingPoints();
            setTrackingPoints([...updatedPoints]);
            setCurrentFrame(prevFrame);
        }
    };

    const handleUpdateSearchRadius = (pointId: string, radius: number) => {
        if (!trackerRef.current) return;

        try {
            trackerRef.current.updatePointSearchRadius(pointId, radius);
            const updatedPoints = trackerRef.current.getTrackingPoints();
            setTrackingPoints(updatedPoints);
        } catch (error) {
            console.error('Error updating search radius:', error);
        }
    };    const handleStopTracking = () => {
        trackingCancelledRef.current = true;
        showToast('Stopping tracking...', 'info');
    };

    return (
        <div className="app">
            <header className="app-header">
                <div className="app-title">
                    <div className="app-icon">🎯</div>
                    <h1>Motion Tracker</h1>
                </div>
            </header>

            <main className="app-main">
                <section className="video-section">
                    {!videoSrc ? (
                        <div 
                            className="upload-area"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                        >
                            <div className="upload-icon">📁</div>
                            <h3>Upload Video</h3>
                            <p>Click here or drag and drop a video file</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="video/*"
                                onChange={handleFileInputChange}
                                style={{ display: 'none' }}
                            />
                        </div>
                    ) : (                        <VideoPlayer
                            ref={videoRef}
                            src={videoSrc}
                            currentFrame={currentFrame}
                            isPlaying={isPlaying}
                            trackingPoints={trackingPoints}
                            onMetadataLoaded={handleVideoLoaded}
                            onAddTrackingPoint={handleAddTrackingPoint}
                            onUpdateSearchRadius={handleUpdateSearchRadius}
                            getPointColor={(index) => `hsl(${(index * 60) % 360}, 70%, 50%)`}
                        />
                    )}
                </section>

                {videoSrc && (
                    <section className="controls-section">
                        <div className="scrubber-container">
                            <Timeline
                                currentFrame={currentFrame}
                                totalFrames={totalFrames}
                                isPlaying={isPlaying}
                                onPlayPause={handlePlayPause}
                                onSeek={handleFrameChange}
                                onStepForward={() => handleFrameChange(currentFrame + 1)}
                                onStepBackward={() => handleFrameChange(currentFrame - 1)}
                            />
                        </div>

                        <div className="tracking-controls">
                            <div className="control-row">
                                <button 
                                    onClick={handleTrackBackward}
                                    disabled={isTracking || trackingPoints.length === 0}
                                    className="primary"
                                >
                                    Track All Backward
                                </button>
                                <button 
                                    onClick={handleTrackForward}
                                    disabled={isTracking || trackingPoints.length === 0}
                                    className="primary"
                                >
                                    Track All Forward
                                </button>
                            </div>
                            <div className="control-row">
                                <button 
                                    onClick={handleStepBackward}
                                    disabled={isTracking || currentFrame <= 0}
                                >
                                    ← Step Back
                                </button>
                                <button 
                                    onClick={handleStepForward}
                                    disabled={isTracking || currentFrame >= totalFrames - 1}
                                >
                                    Step Forward →
                                </button>
                            </div>
                        </div>                        {isTracking && (
                            <div className="tracking-progress">
                                <div className="progress-text">
                                    Tracking... {Math.round(trackingProgress * 100)}%
                                </div>
                                <div className="progress-bar">
                                    <div 
                                        className="progress-fill"
                                        style={{ width: `${trackingProgress * 100}%` }}
                                    />
                                </div>
                                <button 
                                    onClick={handleStopTracking}
                                    className="stop-tracking-btn"
                                    style={{
                                        marginTop: '8px',
                                        padding: '6px 12px',
                                        border: '1px solid #ef4444',
                                        background: '#ef4444',
                                        color: 'white',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        width: '100%'
                                    }}
                                >
                                    Stop Tracking
                                </button>
                            </div>
                        )}
                    </section>
                )}

                {videoSrc && (
                    <section className="tracking-points-section">
                        <div className="section-header">
                            <h3>Tracking Points</h3>
                            <span className="point-count">{trackingPoints.length}</span>
                        </div>
                          {trackingPoints.length === 0 ? (
                            <div className="empty-state">
                                <p>Click on the video to add tracking points</p>
                                <p style={{ fontSize: '10px', marginTop: '8px', color: '#9ca3af' }}>
                                    Click and drag on points to adjust search area
                                </p>
                            </div>
                        ) : (
                            <div className="tracking-points-list">
                                {trackingPoints.map((point, index) => (
                                    <div key={point.id} className="tracking-point-item">
                                        <div className="point-info">
                                            <div 
                                                className="point-color"
                                                style={{ 
                                                    backgroundColor: `hsl(${(index * 60) % 360}, 70%, 50%)` 
                                                }}
                                            />                                            <div className="point-details">
                                                <div className="point-id">
                                                    Point {point.id.substring(0, 6)} • X: {Math.round(point.x)}, Y: {Math.round(point.y)}
                                                </div>
                                                <div className="point-meta">
                                                    Search: {Math.round(point.searchRadius)}px • {point.isActive ? 'Active' : 'Lost'}
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            className="point-remove"
                                            onClick={() => handleRemoveTrackingPoint(point.id)}
                                            disabled={isTracking}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {trackingPoints.length > 0 && (
                            <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6' }}>
                                <button 
                                    onClick={handleClearAllPoints}
                                    disabled={isTracking}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ef4444',
                                        background: 'white',
                                        color: '#ef4444',
                                        borderRadius: '6px',
                                        cursor: trackingPoints.length > 0 ? 'pointer' : 'not-allowed',
                                        opacity: isTracking ? 0.5 : 1
                                    }}
                                >
                                    Clear All Points
                                </button>
                            </div>
                        )}
                    </section>
                )}
            </main>

            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
};
