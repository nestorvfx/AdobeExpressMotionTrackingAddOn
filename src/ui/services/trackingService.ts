import { LucasKanadeTracker, TrackingPoint } from '../utils/lucasKanadeTracker';

export interface TrackingServiceConfig {
  fps: number;
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export class TrackingService {
  private config: TrackingServiceConfig;

  constructor(config: TrackingServiceConfig) {
    this.config = config;
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

  // Consolidated tracking logic for both forward and backward directions
  private async trackDirection(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    totalFrames: number,
    trackingPoints: TrackingPoint[],
    onProgress: (progress: number) => void,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void,
    trackingCancelledRef: { current: boolean },
    direction: 'forward' | 'backward',
    specificPointId?: string,
    maxFramesToTrack?: number
  ): Promise<void> {
    if (!tracker || !videoRef || trackingPoints.length === 0) {
      this.config.showToast('Please add tracking points first', 'error');
      return;
    }

    const isInitialized = await tracker.initialize();
    if (!isInitialized) {
      this.config.showToast('Failed to initialize tracker', 'error');
      return;
    }

    tracker.enableContinuousTracking();
    
    if (!specificPointId) {
      tracker.resetTracker();
    }
    tracker.setCurrentFrame(currentFrame);

    try {
      const isForward = direction === 'forward';
      const maxFrame = isForward 
        ? (maxFramesToTrack ? Math.min(totalFrames, currentFrame + maxFramesToTrack + 1) : totalFrames)
        : (maxFramesToTrack ? Math.max(0, currentFrame - maxFramesToTrack) : 0);
      
      const framesToTrack = isForward ? maxFrame - currentFrame - 1 : currentFrame - maxFrame;
      let trackedFrames = 0;

      const startFrame = isForward ? currentFrame + 1 : currentFrame - 1;
      const endCondition = isForward ? (i: number) => i < maxFrame : (i: number) => i >= maxFrame;
      const step = isForward ? 1 : -1;

      for (let i = startFrame; endCondition(i) && !trackingCancelledRef.current; i += step) {
        await this.seekAndWaitForFrame(videoRef, i, i / this.config.fps, `continuous_${direction}`);

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
        }
        
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const action = direction === 'forward' ? 'Forward' : 'Backward';
      if (trackingCancelledRef.current) {
        this.config.showToast(`${action} tracking stopped`, 'info');
      } else {
        this.config.showToast(`${action} tracking completed`, 'success');
      }
    } catch (error) {
      console.error(`Error during ${direction} tracking:`, error);
      this.config.showToast('Tracking failed', 'error');
    } finally {
      tracker.disableContinuousTracking();
    }
  }

  // Utility method for video seek and frame waiting
  private async seekAndWaitForFrame(videoRef: HTMLVideoElement, targetFrame: number, targetTime: number, operation: string): Promise<void> {
    await this.verifyVideoSeek(videoRef, targetFrame, targetTime, operation);
    
    return new Promise(resolve => {
      const checkFrameReady = () => {
        if (videoRef.readyState >= 2) {
          resolve(undefined);
        } else {
          setTimeout(checkFrameReady, 10);
        }
      };
      checkFrameReady();
    });
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
    specificPointId?: string,
    maxFramesToTrack?: number
  ): Promise<void> {
    return this.trackDirection(tracker, videoRef, currentFrame, totalFrames, trackingPoints, onProgress, onFrameUpdate, trackingCancelledRef, 'forward', specificPointId, maxFramesToTrack);
  }  async trackBackward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    totalFrames: number,
    trackingPoints: TrackingPoint[],
    onProgress: (progress: number) => void,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void,
    trackingCancelledRef: { current: boolean },
    specificPointId?: string,
    maxFramesToTrack?: number
  ): Promise<void> {
    return this.trackDirection(tracker, videoRef, currentFrame, totalFrames, trackingPoints, onProgress, onFrameUpdate, trackingCancelledRef, 'backward', specificPointId, maxFramesToTrack);
  }  async stepForward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    totalFrames: number,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void
  ): Promise<void> {
    if (!tracker || !videoRef || currentFrame >= totalFrames - 1) return;

    const nextFrame = currentFrame + 1;
    await this.seekAndWaitForFrame(videoRef, nextFrame, nextFrame / this.config.fps, 'step_forward');

    // Use the same processing as continuous tracking - unified approach
    const canvasElement = document.createElement('canvas');
    tracker.setCurrentFrame(nextFrame);
    await tracker.processFrame(videoRef, canvasElement); // Unified method
    
    const updatedPoints = tracker.getTrackingPoints();
    onFrameUpdate(nextFrame, [...updatedPoints]);
  }  async stepBackward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void
  ): Promise<void> {
    if (!tracker || !videoRef || currentFrame <= 0) return;

    const prevFrame = currentFrame - 1;
    await this.seekAndWaitForFrame(videoRef, prevFrame, prevFrame / this.config.fps, 'step_backward');

    // Use the same processing as continuous tracking - unified approach
    const canvasElement = document.createElement('canvas');
    tracker.setCurrentFrame(prevFrame);
    await tracker.processFrame(videoRef, canvasElement); // Unified method
    
    const updatedPoints = tracker.getTrackingPoints();
    onFrameUpdate(prevFrame, [...updatedPoints]);
  }
}
