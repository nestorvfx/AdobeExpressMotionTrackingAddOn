import { useState, useRef, useEffect } from 'react';
import { LucasKanadeTracker, TrackingPoint } from '../utils/lucasKanadeTracker';

export interface UseVideoTrackingProps {
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const useVideoTracking = ({ showToast }: UseVideoTrackingProps) => {
  // Video state
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(30); // Will be updated from video metadata

  // Tracking state
  const [trackingPoints, setTrackingPoints] = useState<TrackingPoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingProgress, setTrackingProgress] = useState(0);
  const trackingCancelledRef = useRef(false);
  // Refs
  const trackerRef = useRef<LucasKanadeTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastPauseTimeRef = useRef<number>(0);
  // Initialize tracker
  useEffect(() => {
    trackerRef.current = new LucasKanadeTracker();
  }, []);

  const handleVideoUpload = (file: File) => {
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    showToast('Video uploaded successfully', 'success');
  };
  const handleVideoLoaded = async (videoDuration: number, width: number, height: number, detectedFps?: number) => {
    const actualFps = detectedFps || 30;
    setFps(actualFps);
    setDuration(videoDuration);
    setTotalFrames(Math.floor(videoDuration * actualFps));
    setCurrentFrame(0);
    
    console.log(`Video loaded: ${videoDuration.toFixed(2)}s at ${actualFps}fps = ${Math.floor(videoDuration * actualFps)} frames`);
    
    if (trackerRef.current) {
      await trackerRef.current.initialize();
    }
  };  const handlePlayPause = () => {
    if (isPlaying) {
      // When pausing, capture the current frame at this exact moment
      // to prevent drift from video element settling
      const video = videoRef.current;
      if (video && fps > 0) {
        const exactFrame = Math.round(video.currentTime * fps);
        setCurrentFrame(exactFrame);
        lastPauseTimeRef.current = Date.now();
      }
    }
    setIsPlaying(!isPlaying);
  };
  const handleFrameChange = (frame: number) => {
    const newFrame = Math.max(0, Math.min(frame, totalFrames - 1));
    setCurrentFrame(newFrame);
    setIsPlaying(false);
    
    // Reset tracking state when seeking to ensure optical flow consistency
    if (trackerRef.current) {
      trackerRef.current.handleSeek();
      trackerRef.current.setCurrentFrame(newFrame);
      
      // Sync points to their stored positions for scrubbing (not tracking)
      trackerRef.current.syncPointsToFrameForScrubbing(newFrame);
    }
  };

  const handleAddTrackingPoint = async (x: number, y: number) => {
    if (!trackerRef.current || !videoRef.current) return;

    try {
      // Ensure tracker is initialized first
      const isInitialized = await trackerRef.current.initialize();
      if (!isInitialized) {
        showToast('Tracker not initialized', 'error');
        return;
      }

      // First, process the current frame to ensure we have reference data
      const canvasElement = document.createElement('canvas');
      trackerRef.current.setCurrentFrame(currentFrame);
      
      // Enhanced delay to ensure video frame is stable before processing
      await new Promise(resolve => setTimeout(resolve, 150));
      
      await trackerRef.current.processFrame(videoRef.current, canvasElement);
      
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
      console.error('Error clearing tracking points:', error);
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
  };

  const handleStopTracking = () => {
    trackingCancelledRef.current = true;
    showToast('Stopping tracking...', 'info');
  };
  // Update current frame based on video playback time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || fps === 0) return;

    let lastUpdateTime = 0;    const handleTimeUpdate = () => {
      // Throttle updates to avoid excessive re-renders
      const now = Date.now();
      if (now - lastUpdateTime < 50) return; // Max 20 FPS updates
      lastUpdateTime = now;
      
      // Ignore timeupdate events shortly after pausing to prevent drift
      if (now - lastPauseTimeRef.current < 200) return;
      
      // Only update frame counter during active playback
      // Check both React state and actual video element state
      if (isPlaying && !video.paused && !video.ended) {
        const newFrame = Math.floor(video.currentTime * fps);
        const clampedFrame = Math.max(0, Math.min(newFrame, totalFrames - 1));
        
        // Only update if frame actually changed to avoid unnecessary re-renders
        if (clampedFrame !== currentFrame) {
          setCurrentFrame(clampedFrame);
          
          // Also update tracker frame
          if (trackerRef.current) {
            trackerRef.current.setCurrentFrame(clampedFrame);
          }
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [isPlaying, fps, totalFrames, currentFrame]);

  return {
    // Video state
    videoSrc,
    setVideoSrc,
    videoFile,
    setVideoFile,
    duration,
    currentFrame,
    setCurrentFrame,
    totalFrames,
    isPlaying,
    fps,
    
    // Tracking state
    trackingPoints,
    setTrackingPoints,
    isTracking,
    setIsTracking,
    trackingProgress,
    setTrackingProgress,
    trackingCancelledRef,
    
    // Refs
    trackerRef,
    videoRef,
    
    // Handlers
    handleVideoUpload,
    handleVideoLoaded,
    handlePlayPause,
    handleFrameChange,
    handleAddTrackingPoint,
    handleRemoveTrackingPoint,
    handleClearAllPoints,
    handleUpdateSearchRadius,
    handleStopTracking,
  };
};
