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
  const isPlayingRef = useRef(false); // Ref to track playing state for animation loop
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
    setDuration(videoDuration);    setTotalFrames(Math.floor(videoDuration * actualFps));
    setCurrentFrame(0);
    
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
  };  const handleFrameChange = (frame: number) => {
    const newFrame = Math.max(0, Math.min(frame, totalFrames - 1));
    
    setCurrentFrame(newFrame);
    setIsPlaying(false);
    
    // Ensure video element is also seeked to the correct position during manual scrubbing
    const video = videoRef.current;
    if (video) {
      video.currentTime = newFrame / fps;
    }
    
    // Reset tracking state when seeking to ensure optical flow consistency
    if (trackerRef.current) {
      trackerRef.current.handleSeek();      trackerRef.current.setCurrentFrame(newFrame);
      
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

  // Controlled continuous playback with perfect frame/point synchronization
  useEffect(() => {
    const video = videoRef.current;
    if (!video || fps === 0) return;

    // Only create the loop machinery when actually playing
    if (!isPlaying) {
      return;
    }

    let animationFrameId: number | null = null;
    let isVideoReady = false;
    
    let targetFrame = currentFrame;
    
    // Ensure ref is synchronized at the start of this effect
    isPlayingRef.current = isPlaying;
    
    // CONTROLLED SYNCHRONIZATION APPROACH:
    // Only display frames when both video and point data are perfectly synchronized
    // Uses requestAnimationFrame loop similar to frame-by-frame approach
    
    const seekToFrame = async (frameNumber: number): Promise<void> => {
      return new Promise((resolve) => {
        const targetTime = frameNumber / fps;
        
        const handleSeeked = () => {
          video.removeEventListener('seeked', handleSeeked);
          isVideoReady = true;
          resolve();
        };
        
        video.addEventListener('seeked', handleSeeked);
        video.currentTime = targetTime;
      });
    };    const synchronizedPlaybackLoop = async () => {
      // Check current playing state using ref (always up-to-date)
      
      if (!isPlayingRef.current || targetFrame >= totalFrames - 1) {
        // Stop the loop cleanly
        if (animationFrameId) {          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        return;
      }

      try {
        // Seek video to target frame and wait for it to be ready
        isVideoReady = false;
        await seekToFrame(targetFrame);
          // Double-check we're still playing after async seek using ref
        if (!isPlayingRef.current) {
          return;
        }
        
        // Sync point positions to this frame (with fallback to previous frames)
        if (trackerRef.current) {
          trackerRef.current.setCurrentFrame(targetFrame);
          trackerRef.current.syncPointsToFrameForScrubbing(targetFrame);
        }
        
        // Update React state to trigger re-render (display synchronized frame + points)
        setCurrentFrame(targetFrame);
        
        // Advance to next frame for next iteration
        targetFrame = Math.min(targetFrame + 1, totalFrames - 1);
        
        // Schedule next frame update only if still playing
        if (isPlayingRef.current && targetFrame < totalFrames - 1) {
          animationFrameId = requestAnimationFrame(synchronizedPlaybackLoop);
        } else {          animationFrameId = null;
        }
        
      } catch (error) {
        console.error('Synchronized playback error:', error);
        setIsPlaying(false);
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    };    // Start the controlled playbook loop
    video.pause(); // Keep video paused - we control frame advancement manually
    targetFrame = currentFrame;
    synchronizedPlaybackLoop();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, fps, totalFrames, currentFrame]); // isPlaying back in dependencies to restart loop

  // Separate effect to handle play/pause state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;    if (isPlaying) {
      // When starting playback, ensure video is paused since we control it manually
      video.pause();
    }
  }, [isPlaying]);

  // Keep isPlayingRef synchronized with isPlaying state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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
