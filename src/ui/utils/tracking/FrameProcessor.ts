import { } from './TrackingTypes';

export interface FrameData {
  mat: any;
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
  private buffers: FrameBuffers = {
    prevGray: null,
    currGray: null
  };

  constructor(cv?: any) {
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
  }  /**
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
  }  /**
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
    try {      gray = new this.cv.Mat();
      this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY);

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
