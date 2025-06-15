// Frame processing and buffer management - exact logic from original

import { MinimalDebugger } from './MinimalDebugger';

export interface FrameData {
  mat: any; // OpenCV Mat
  width: number;
  height: number;
  timestamp: number;
}

export interface FrameBuffers {
  prevGray: any | null;
  currGray: any | null;
}

export class FrameProcessor {
  private cv: any = null;
  private logger: MinimalDebugger;
  private buffers: FrameBuffers = {
    prevGray: null,
    currGray: null
  };

  constructor(logger: MinimalDebugger, cv?: any) {
    this.logger = logger;
    this.cv = cv;
  }

  /**
   * Sets the OpenCV instance
   */
  setOpenCV(cv: any): void {
    this.cv = cv;
  }

  /**
   * Check if previous frame exists
   */
  hasPrevGray(): boolean {
    return !!this.buffers.prevGray;
  }

  /**
   * Check if current frame exists
   */
  hasCurrGray(): boolean {
    return !!this.buffers.currGray;
  }

  /**
   * Get previous frame
   */
  getPrevGray(): any {
    return this.buffers.prevGray;
  }

  /**
   * Get current frame
   */
  getCurrGray(): any {
    return this.buffers.currGray;
  }

  /**
   * Initialize frames with first frame
   */
  initializeFrames(grayFrame: any): void {
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
    }
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
    }
    this.buffers.prevGray = grayFrame.clone();
    this.buffers.currGray = grayFrame.clone();
  }

  /**
   * Update current frame
   */
  updateCurrentFrame(grayFrame: any): void {
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
    }
    this.buffers.currGray = grayFrame.clone();
  }

  /**
   * Swap frames (move current to previous)
   */
  swapFrames(): void {
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
    }
    this.buffers.prevGray = this.buffers.currGray ? this.buffers.currGray.clone() : null;
  }

  /**
   * Reset frames with new frame
   */
  resetFrames(grayFrame: any): void {
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
    }
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
    }
    this.buffers.prevGray = grayFrame.clone();
    this.buffers.currGray = grayFrame.clone();
  }

  /**
   * Initialize previous frame from current
   */
  initializeFromCurrent(): void {
    if (this.buffers.currGray) {
      if (this.buffers.prevGray) {
        this.buffers.prevGray.delete();
      }
      this.buffers.prevGray = this.buffers.currGray.clone();
    }
  }
  /**
   * Reset frame buffers but prepare for immediate tracking from current frame
   */
  resetFrameBuffers(): void {
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
      this.buffers.prevGray = null;
    }
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
      this.buffers.currGray = null;
    }
  }

  /**
   * Prepare frame buffer for tracking from current frame
   */
  prepareForTrackingFromCurrentFrame(currentFrame: any): void {
    // Set current frame as prevGray so tracking can start from this frame
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
    }
    this.buffers.prevGray = currentFrame.clone();
    
    // Clear currGray so next frame will be set as currGray for tracking
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
      this.buffers.currGray = null;
    }
  }

  /**
   * Process video frame exactly as original
   */
  async processVideoFrame(
    videoElement: HTMLVideoElement, 
    canvas: HTMLCanvasElement, 
    frameNumber: number
  ): Promise<FrameData> {
    return new Promise<FrameData>((resolve) => {
      requestAnimationFrame(() => {
        const ctx = canvas.getContext('2d')!;
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);
        
        const frameData = this.processCanvasFrame(canvas, frameNumber);
        resolve(frameData);
      });
    });
  }

  /**
   * Convert canvas to grayscale OpenCV matrix exactly as original
   */
  processCanvasFrame(canvas: HTMLCanvasElement, frameNumber: number): FrameData {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = this.cv.matFromImageData(imageData);

    let gray: any = null;
    try {
      gray = new this.cv.Mat();
      this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY);

      this.logger.log(frameNumber, 'FRAME_PROCESSED', {
        width: canvas.width,
        height: canvas.height,
        matType: gray.type(),
        channels: gray.channels(),
        timestamp: Date.now()
      });

      return {
        mat: gray,
        width: canvas.width,
        height: canvas.height,
        timestamp: Date.now()
      };
    } finally {
      src.delete();
    }
  }

  /**
   * Update frame buffers exactly as original - THREE scenarios:
   * 1. First frame (!prevGray): Initialize both buffers  
   * 2. Has points: Update currGray only (tracking happens, then rotate)
   * 3. No points: Reset both buffers
   */
  updateFrameBuffers(newFrame: FrameData, frameNumber: number, hasPoints: boolean): void {
    const beforeState = {
      hasPrevGray: !!this.buffers.prevGray,
      hasCurrGray: !!this.buffers.currGray
    };    if (!this.buffers.prevGray) {
      // Initialize both buffers with current frame so tracking can start immediately
      this.buffers.prevGray = newFrame.mat.clone();
      this.buffers.currGray = newFrame.mat.clone();
      
      this.logger.log(frameNumber, 'FRAME_INITIALIZATION', {
        ...beforeState,
        action: 'first_frame_setup'
      });
    } else if (hasPoints) {
      // Scenario 2: Has points - update currGray only (exactly as original)
      if (this.buffers.currGray) {
        this.buffers.currGray.delete();
      }
      this.buffers.currGray = newFrame.mat.clone();
      
      // NOTE: Rotation happens AFTER tracking in rotateBuffers()
    } else {
      // Scenario 3: No points - reset both buffers (exactly as original)
      if (this.buffers.prevGray) {
        this.buffers.prevGray.delete();
      }
      if (this.buffers.currGray) {
        this.buffers.currGray.delete();
      }
      this.buffers.prevGray = newFrame.mat.clone();
      this.buffers.currGray = newFrame.mat.clone();
    }

    // Clean up input frame
    newFrame.mat.delete();
  }

  /**
   * Rotate buffers AFTER tracking (exactly as original)
   */
  rotateBuffers(): void {
    if (this.buffers.prevGray && this.buffers.currGray) {
      this.buffers.prevGray.delete();
      this.buffers.prevGray = this.buffers.currGray.clone();
    }
  }

  /**
   * Check if buffers are ready for tracking
   */
  areBuffersReady(): boolean {
    return !!(this.buffers.prevGray && this.buffers.currGray);
  }

  /**
   * Get frame buffers for tracking
   */
  getFrameBuffers(): FrameBuffers {
    return this.buffers;
  }

  /**
   * Reset frame buffers
   */
  resetBuffers(): void {
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
      this.buffers.prevGray = null;
    }
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
      this.buffers.currGray = null;
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.resetBuffers();
  }
}
