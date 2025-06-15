import { LucasKanadeTracker, TrackingPoint } from '../utils/lucasKanadeTracker';

export interface TrackingServiceConfig {
  fps: number;
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export class TrackingService {
  private config: TrackingServiceConfig;

  constructor(config: TrackingServiceConfig) {
    this.config = config;
  }
  async trackForward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    totalFrames: number,
    trackingPoints: TrackingPoint[],
    onProgress: (progress: number) => void,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void,
    trackingCancelledRef: { current: boolean },
    specificPointId?: string, // Optional: track only this point
    maxFramesToTrack?: number // Optional: limit number of frames to track
  ): Promise<void> {
    if (!tracker || !videoRef || trackingPoints.length === 0) {
      this.config.showToast('Please add tracking points first', 'error');
      return;
    }    // Ensure tracker is initialized
    const isInitialized = await tracker.initialize();
    if (!isInitialized) {
      this.config.showToast('Failed to initialize tracker', 'error');
      return;
    }    // Enable continuous tracking mode to ensure fresh detection for every frame
    tracker.enableContinuousTracking();
      // Only completely reset tracker state if we're starting a fresh "Track All" session
    // For specific point tracking, preserve frame buffers to maintain context from manual moves
    if (!specificPointId) {
      tracker.resetTracker(); // Full reset for "Track All"
    }
    // Note: We don't reset frame buffers for specific point tracking to preserve 
    // the context from manual moves or previous tracking state
    tracker.setCurrentFrame(currentFrame);    try {
      // First, ensure the current frame is set up as the reference frame
      const currentTime = currentFrame / this.config.fps;
      videoRef.currentTime = currentTime;
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Process current frame to establish it as the reference (prevGray)
      const canvasElement = document.createElement('canvas');
      tracker.setCurrentFrame(currentFrame);
      await tracker.processFrame(videoRef, canvasElement);
      
      // Calculate frames to track with optional limit
      const maxFrame = maxFramesToTrack ? Math.min(totalFrames, currentFrame + maxFramesToTrack + 1) : totalFrames;
      const framesToTrack = maxFrame - currentFrame - 1;
      let trackedFrames = 0;for (let i = currentFrame + 1; i < maxFrame && !trackingCancelledRef.current; i++) {
        // Seek to the new frame with improved timing and better error handling
        const targetTime = i / this.config.fps;
        videoRef.currentTime = targetTime;
        
        // Simplified frame synchronization with faster timeouts
        await new Promise<void>((resolve) => {
          let resolved = false;
          
          const handleSeeked = () => {
            if (!resolved) {
              resolved = true;
              videoRef.removeEventListener('seeked', handleSeeked);
              resolve();
            }
          };
          
          videoRef.addEventListener('seeked', handleSeeked);
          
          // Shorter timeout to prevent freezing
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              videoRef.removeEventListener('seeked', handleSeeked);
              resolve();
            }
          }, 300); // Reduced timeout
        });

        // Minimal delay for frame stability
        await new Promise(resolve => setTimeout(resolve, 20));

        // Process the frame with error handling
        try {
          const canvasElement = document.createElement('canvas');
          tracker.setCurrentFrame(i);
          await tracker.processFrame(videoRef, canvasElement);
          const updatedPoints = tracker.getTrackingPoints();
          
          trackedFrames++;
          onProgress(trackedFrames / framesToTrack);
          onFrameUpdate(i, [...updatedPoints]);
        } catch (frameError) {
          console.warn(`Error processing frame ${i}:`, frameError);
          // Continue with next frame rather than breaking
        }
        
        // Very small delay to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 5));
      }      if (trackingCancelledRef.current) {
        this.config.showToast('Forward tracking stopped', 'info');
      } else {
        this.config.showToast('Forward tracking completed', 'success');
      }
    } catch (error) {
      console.error('Error during forward tracking:', error);
      this.config.showToast('Tracking failed', 'error');
    } finally {
      // Disable continuous tracking mode when done
      tracker.disableContinuousTracking();
    }
  }
  async trackBackward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    trackingPoints: TrackingPoint[],
    onProgress: (progress: number) => void,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void,
    trackingCancelledRef: { current: boolean },
    specificPointId?: string, // Optional: track only this point
    maxFramesToTrack?: number // Optional: limit number of frames to track
  ): Promise<void> {
    if (!tracker || !videoRef || trackingPoints.length === 0) {
      this.config.showToast('Please add tracking points first', 'error');
      return;
    }    // Ensure tracker is initialized
    const isInitialized = await tracker.initialize();
    if (!isInitialized) {
      this.config.showToast('Failed to initialize tracker', 'error');
      return;
    }

    // Enable continuous tracking mode to ensure fresh detection for every frame
    tracker.enableContinuousTracking();

    try {
      // Calculate frames to track with optional limit
      const minFrame = maxFramesToTrack ? Math.max(0, currentFrame - maxFramesToTrack) : 0;
      const framesToTrack = currentFrame - minFrame;
      let trackedFrames = 0;

      for (let i = currentFrame - 1; i >= minFrame && !trackingCancelledRef.current; i--) {        // Seek to the new frame with improved timing and better error handling
        const targetTime = i / this.config.fps;
        videoRef.currentTime = targetTime;
        
        // Simplified frame synchronization with faster timeouts
        await new Promise<void>((resolve) => {
          let resolved = false;
          
          const handleSeeked = () => {
            if (!resolved) {
              resolved = true;
              videoRef.removeEventListener('seeked', handleSeeked);
              resolve();
            }
          };
          
          videoRef.addEventListener('seeked', handleSeeked);
          
          // Shorter timeout to prevent freezing
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              videoRef.removeEventListener('seeked', handleSeeked);
              resolve();
            }
          }, 300); // Reduced timeout
        });

        // Minimal delay for frame stability
        await new Promise(resolve => setTimeout(resolve, 20));

        // Process the frame with error handling
        try {
          const canvasElement = document.createElement('canvas');
          tracker.setCurrentFrame(i);
          await tracker.processFrame(videoRef, canvasElement);
          const updatedPoints = tracker.getTrackingPoints();

          trackedFrames++;
          onProgress(trackedFrames / framesToTrack);
          onFrameUpdate(i, [...updatedPoints]);
        } catch (frameError) {
          console.warn(`Error processing frame ${i}:`, frameError);
          // Continue with next frame rather than breaking
        }
        
        // Very small delay to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 5));
      }      if (trackingCancelledRef.current) {
        this.config.showToast('Backward tracking stopped', 'info');
      } else {
        this.config.showToast('Backward tracking completed', 'success');
      }
    } catch (error) {
      console.error('Error during backward tracking:', error);
      this.config.showToast('Tracking failed', 'error');
    } finally {
      // Disable continuous tracking mode when done
      tracker.disableContinuousTracking();
    }
  }
  async stepForward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    totalFrames: number,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void
  ): Promise<void> {
    if (!tracker || !videoRef || currentFrame >= totalFrames - 1) return;

    const nextFrame = currentFrame + 1;
    
    // Log the step forward operation start
    console.log(`🔄 STEP_FORWARD_START: Frame ${currentFrame} → ${nextFrame}`);
    
    // Get points before frame change
    const pointsBeforeStep = tracker.getTrackingPoints();
    console.log(`📍 POINTS_BEFORE_STEP:`, pointsBeforeStep.map(p => ({
      id: p.id.substring(0, 8),
      position: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 },
      lastManualFrame: undefined,
      framePositionsCount: p.framePositions.size,
      hasPositionForNextFrame: p.framePositions.has(nextFrame)
    })));
    
    // Enhanced frame synchronization for single step
    const targetTime = nextFrame / this.config.fps;
    videoRef.currentTime = targetTime;
    
    // Wait for proper frame rendering
    await new Promise<void>((resolve) => {
      let resolved = false;
      
      const handleSeeked = () => {
        if (!resolved) {
          videoRef.removeEventListener('seeked', handleSeeked);
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.log(`Step forward to frame ${nextFrame}: ${targetTime}s, actual: ${videoRef.currentTime}s`);
              resolve();
            }
          }, 100); // Slightly shorter delay for single steps
        }
      };
      
      videoRef.addEventListener('seeked', handleSeeked);
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          videoRef.removeEventListener('seeked', handleSeeked);
          console.log(`Step forward timeout - target: ${targetTime}s, actual: ${videoRef.currentTime}s`);
          resolve();
        }
      }, 300);
    });

    // Additional delay to ensure frame is fully rendered
    await new Promise(resolve => setTimeout(resolve, 30));    const canvasElement = document.createElement('canvas');
    
    // Set frame BEFORE processing (this no longer triggers sync, just sets frame number)
    console.log(`🎯 SETTING_FRAME_BEFORE_PROCESSING: ${nextFrame}`);
    tracker.setCurrentFrame(nextFrame);
    
    // Points will calculate their positions from previous frames during processing
    const pointsBeforeProcessing = tracker.getTrackingPoints();
    console.log(`📍 POINTS_BEFORE_PROCESSING:`, pointsBeforeProcessing.map(p => ({
      id: p.id.substring(0, 8),
      position: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 },
      lastManualFrame: undefined
    })));
    
    // Process the frame (this calculates positions from previous frames and does tracking)
    console.log(`🔬 PROCESSING_FRAME: ${nextFrame}`);
    await tracker.processFrame(videoRef, canvasElement);
    
    // Get final points after processing
    const updatedPoints = tracker.getTrackingPoints();
    console.log(`📍 POINTS_AFTER_PROCESSING:`, updatedPoints.map(p => ({
      id: p.id.substring(0, 8),
      position: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 },
      confidence: Math.round(p.confidence * 1000) / 1000
    })));
    
    onFrameUpdate(nextFrame, [...updatedPoints]);
    console.log(`✅ STEP_FORWARD_COMPLETE: Frame ${nextFrame}`);
  }

  async stepBackward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void
  ): Promise<void> {
    if (!tracker || !videoRef || currentFrame <= 0) return;

    const prevFrame = currentFrame - 1;
    // Enhanced frame synchronization for single step
    const targetTime = prevFrame / this.config.fps;
    videoRef.currentTime = targetTime;
    
    // Wait for proper frame rendering
    await new Promise<void>((resolve) => {
      let resolved = false;
      
      const handleSeeked = () => {
        if (!resolved) {
          videoRef.removeEventListener('seeked', handleSeeked);
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.log(`Step backward to frame ${prevFrame}: ${targetTime}s, actual: ${videoRef.currentTime}s`);
              resolve();
            }
          }, 100); // Slightly shorter delay for single steps
        }
      };
      
      videoRef.addEventListener('seeked', handleSeeked);
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          videoRef.removeEventListener('seeked', handleSeeked);
          console.log(`Step backward timeout - target: ${targetTime}s, actual: ${videoRef.currentTime}s`);
          resolve();
        }
      }, 300);
    });

    // Additional delay to ensure frame is fully rendered
    await new Promise(resolve => setTimeout(resolve, 30));

    const canvasElement = document.createElement('canvas');
    tracker.setCurrentFrame(prevFrame);
    await tracker.processFrame(videoRef, canvasElement);
    const updatedPoints = tracker.getTrackingPoints();
    onFrameUpdate(prevFrame, [...updatedPoints]);
  }
}
