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
      // Calculate frames to track with optional limit
      const maxFrame = maxFramesToTrack ? Math.min(totalFrames, currentFrame + maxFramesToTrack + 1) : totalFrames;
      const framesToTrack = maxFrame - currentFrame - 1;
      let trackedFrames = 0;for (let i = currentFrame + 1; i < maxFrame && !trackingCancelledRef.current; i++) {        // Verify video seeking with detailed logging        const seekVerification = await this.verifyVideoSeek(videoRef, i, i / this.config.fps, 'continuous_forward');

        // Wait for frame to actually load before processing
        await new Promise(resolve => {
          const checkFrameReady = () => {
            if (videoRef.readyState >= 2) { // HAVE_CURRENT_DATA or better
              resolve(undefined);
            } else {
              setTimeout(checkFrameReady, 10);
            }
          };
          checkFrameReady();
        });

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
      let trackedFrames = 0;      for (let i = currentFrame - 1; i >= minFrame && !trackingCancelledRef.current; i--) {        // Verify video seeking with detailed logging        const seekVerification = await this.verifyVideoSeek(videoRef, i, i / this.config.fps, 'continuous_backward');

        // Wait for frame to actually load before processing
        await new Promise(resolve => {
          const checkFrameReady = () => {
            if (videoRef.readyState >= 2) { // HAVE_CURRENT_DATA or better
              resolve(undefined);
            } else {
              setTimeout(checkFrameReady, 10);
            }
          };
          checkFrameReady();
        });

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
  }  async stepForward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    totalFrames: number,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void
  ): Promise<void> {
    if (!tracker || !videoRef || currentFrame >= totalFrames - 1) return;    const nextFrame = currentFrame + 1;
      // Verify video seeking with detailed logging    const seekVerification = await this.verifyVideoSeek(videoRef, nextFrame, nextFrame / this.config.fps, 'step_forward');

    // Wait for frame to actually load before processing
    await new Promise(resolve => {
      const checkFrameReady = () => {
        if (videoRef.readyState >= 2) { // HAVE_CURRENT_DATA or better
          resolve(undefined);
        } else {
          setTimeout(checkFrameReady, 10);
        }
      };
      checkFrameReady();
    });

    // Use the same processing as continuous tracking - unified approach
    const canvasElement = document.createElement('canvas');
    tracker.setCurrentFrame(nextFrame);
    await tracker.processFrame(videoRef, canvasElement); // Unified method
    
    const updatedPoints = tracker.getTrackingPoints();
    onFrameUpdate(nextFrame, [...updatedPoints]);
  }
  async stepBackward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void
  ): Promise<void> {
    if (!tracker || !videoRef || currentFrame <= 0) return;    const prevFrame = currentFrame - 1;
      // Verify video seeking with detailed logging    const seekVerification = await this.verifyVideoSeek(videoRef, prevFrame, prevFrame / this.config.fps, 'step_backward');

    // Wait for frame to actually load before processing
    await new Promise(resolve => {
      const checkFrameReady = () => {
        if (videoRef.readyState >= 2) { // HAVE_CURRENT_DATA or better
          resolve(undefined);
        } else {
          setTimeout(checkFrameReady, 10);
        }
      };
      checkFrameReady();
    });

    // Use the same processing as continuous tracking - unified approach
    const canvasElement = document.createElement('canvas');
    tracker.setCurrentFrame(prevFrame);
    await tracker.processFrame(videoRef, canvasElement); // Unified method
    
    const updatedPoints = tracker.getTrackingPoints();
    onFrameUpdate(prevFrame, [...updatedPoints]);
  } /**
   * Verify video seeking accuracy
   */
  private async verifyVideoSeek(
    videoRef: HTMLVideoElement, 
    targetFrame: number, 
    targetTime: number,
    operation: string
  ): Promise<any> {
    const beforeSeek = {
      currentTime: Math.round(videoRef.currentTime * 1000) / 1000,
      readyState: videoRef.readyState,
      frame: Math.round(videoRef.currentTime * this.config.fps)
    };

    // Set the target time
    videoRef.currentTime = targetTime;
    
    // Wait for seek completion
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const afterSeek = {
      currentTime: Math.round(videoRef.currentTime * 1000) / 1000,
      readyState: videoRef.readyState,
      actualFrame: Math.round(videoRef.currentTime * this.config.fps),
      timeDiff: Math.abs(videoRef.currentTime - targetTime),
      frameDiff: Math.abs(Math.round(videoRef.currentTime * this.config.fps) - targetFrame)
    };

    const seekVerification = {
      operation,
      target: { frame: targetFrame, time: Math.round(targetTime * 1000) / 1000 },
      beforeSeek,
      afterSeek,
      seekAccuracy: {
        timeAccurate: afterSeek.timeDiff < 0.05, // Within 50ms
        frameAccurate: afterSeek.frameDiff === 0,
        seekSuccessful: afterSeek.readyState >= 2
      }
    };

    return seekVerification;
  }
}
