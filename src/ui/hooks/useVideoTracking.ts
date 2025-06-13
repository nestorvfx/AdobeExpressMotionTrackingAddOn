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
  const [fps] = useState(30);

  // Tracking state
  const [trackingPoints, setTrackingPoints] = useState<TrackingPoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingProgress, setTrackingProgress] = useState(0);
  const trackingCancelledRef = useRef(false);

  // Refs
  const trackerRef = useRef<LucasKanadeTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
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

  const handleVideoLoaded = async (videoDuration: number, width: number, height: number) => {
    setDuration(videoDuration);
    setTotalFrames(Math.floor(videoDuration * fps));
    setCurrentFrame(0);
    
    if (trackerRef.current) {
      await trackerRef.current.initialize();
    }
  };

  const handlePlayPause = () => {
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
