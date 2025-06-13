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
    trackingCancelledRef: { current: boolean }
  ): Promise<void> {
    if (!tracker || !videoRef || trackingPoints.length === 0) {
      this.config.showToast('Please add tracking points first', 'error');
      return;
    }

    // Ensure tracker is initialized
    const isInitialized = await tracker.initialize();
    if (!isInitialized) {
      this.config.showToast('Failed to initialize tracker', 'error');
      return;
    }

    // Reset tracker state for new tracking session
    tracker.resetTracker();
    tracker.setCurrentFrame(currentFrame);

    try {
      const framesToTrack = totalFrames - currentFrame - 1;
      let trackedFrames = 0;

      for (let i = currentFrame + 1; i < totalFrames && !trackingCancelledRef.current; i++) {
        // Seek to the new frame and wait for it to complete with better timing
        const targetTime = i / this.config.fps;
        videoRef.currentTime = targetTime;
        
        // Enhanced frame synchronization - wait for proper frame rendering
        await new Promise<void>((resolve) => {
          let resolved = false;
          
          const handleSeeked = () => {
            if (!resolved) {
              videoRef.removeEventListener('seeked', handleSeeked);
              // Additional delay to ensure frame is properly rendered in DOM
              setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  console.log(`Frame ${i}: Seeked to ${targetTime}s, actual: ${videoRef.currentTime}s`);
                  resolve();
                }
              }, 150); // Increased delay for frame stability
            }
          };
          
          videoRef.addEventListener('seeked', handleSeeked);
          
          // Longer timeout for more reliable seeking
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              videoRef.removeEventListener('seeked', handleSeeked);
              console.log(`Frame ${i}: Timeout - target: ${targetTime}s, actual: ${videoRef.currentTime}s`);
              resolve();
            }
          }, 500); // Much longer timeout
        });

        // Additional delay to ensure frame is fully rendered
        await new Promise(resolve => setTimeout(resolve, 50));

        // Process the frame
        const canvasElement = document.createElement('canvas');
        console.log(`Tracking frame ${i}, video time: ${videoRef.currentTime}`);
        tracker.setCurrentFrame(i);
        await tracker.processFrame(videoRef, canvasElement);
        const updatedPoints = tracker.getTrackingPoints();
        
        trackedFrames++;
        onProgress(trackedFrames / framesToTrack);
        onFrameUpdate(i, [...updatedPoints]);
        
        // Small delay to allow UI updates and cancellation checks
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      if (trackingCancelledRef.current) {
        this.config.showToast('Forward tracking stopped', 'info');
      } else {
        this.config.showToast('Forward tracking completed', 'success');
      }
    } catch (error) {
      console.error('Error during forward tracking:', error);
      this.config.showToast('Tracking failed', 'error');
    }
  }

  async trackBackward(
    tracker: LucasKanadeTracker,
    videoRef: HTMLVideoElement,
    currentFrame: number,
    trackingPoints: TrackingPoint[],
    onProgress: (progress: number) => void,
    onFrameUpdate: (frame: number, points: TrackingPoint[]) => void,
    trackingCancelledRef: { current: boolean }
  ): Promise<void> {
    if (!tracker || !videoRef || trackingPoints.length === 0) {
      this.config.showToast('Please add tracking points first', 'error');
      return;
    }

    // Ensure tracker is initialized
    const isInitialized = await tracker.initialize();
    if (!isInitialized) {
      this.config.showToast('Failed to initialize tracker', 'error');
      return;
    }

    try {
      const framesToTrack = currentFrame;
      let trackedFrames = 0;

      for (let i = currentFrame - 1; i >= 0 && !trackingCancelledRef.current; i--) {
        // Seek to the new frame and wait for it to complete with better timing
        const targetTime = i / this.config.fps;
        videoRef.currentTime = targetTime;
        
        // Enhanced frame synchronization - wait for proper frame rendering
        await new Promise<void>((resolve) => {
          let resolved = false;
          
          const handleSeeked = () => {
            if (!resolved) {
              videoRef.removeEventListener('seeked', handleSeeked);
              // Additional delay to ensure frame is properly rendered in DOM
              setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  console.log(`Frame ${i}: Seeked to ${targetTime}s, actual: ${videoRef.currentTime}s`);
                  resolve();
                }
              }, 150); // Increased delay for frame stability
            }
          };
          
          videoRef.addEventListener('seeked', handleSeeked);
          
          // Longer timeout for more reliable seeking
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              videoRef.removeEventListener('seeked', handleSeeked);
              console.log(`Frame ${i}: Timeout - target: ${targetTime}s, actual: ${videoRef.currentTime}s`);
              resolve();
            }
          }, 500); // Much longer timeout
        });

        // Additional delay to ensure frame is fully rendered
        await new Promise(resolve => setTimeout(resolve, 50));

        // Process the frame
        const canvasElement = document.createElement('canvas');
        console.log(`Tracking frame ${i}, video time: ${videoRef.currentTime}`);
        tracker.setCurrentFrame(i);
        await tracker.processFrame(videoRef, canvasElement);
        const updatedPoints = tracker.getTrackingPoints();

        trackedFrames++;
        onProgress(trackedFrames / framesToTrack);
        onFrameUpdate(i, [...updatedPoints]);
        
        // Small delay to allow UI updates and cancellation checks
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      if (trackingCancelledRef.current) {
        this.config.showToast('Backward tracking stopped', 'info');
      } else {
        this.config.showToast('Backward tracking completed', 'success');
      }
    } catch (error) {
      console.error('Error during backward tracking:', error);
      this.config.showToast('Tracking failed', 'error');
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
    await new Promise(resolve => setTimeout(resolve, 30));

    const canvasElement = document.createElement('canvas');
    tracker.setCurrentFrame(nextFrame);
    await tracker.processFrame(videoRef, canvasElement);
    const updatedPoints = tracker.getTrackingPoints();
    onFrameUpdate(nextFrame, [...updatedPoints]);
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
