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
   * Calculate a simple hash for frame content verification
   */
  private calculateFrameHash(mat: any): string {
    if (!mat || !this.cv) return 'null';
    try {
      const data = mat.data;
      if (!data || data.length === 0) return 'empty';
      
      // Sample pixels from corners and center for hash
      const h = mat.rows, w = mat.cols;
      const samples = [
        data[0], data[w-1], data[(h-1)*w], data[h*w-1], // corners
        data[Math.floor(h/2)*w + Math.floor(w/2)] // center
      ];
      return samples.join('-');
    } catch (e) {
      return 'error';
    }
  }

  /**
   * Log current buffer state with frame hashes
   */
  private logBufferState(operation: string, frameNumber?: number): void {
    const prevHash = this.buffers.prevGray ? this.calculateFrameHash(this.buffers.prevGray) : 'null';
    const currHash = this.buffers.currGray ? this.calculateFrameHash(this.buffers.currGray) : 'null';
    
    this.logger.log(frameNumber || 0, 'FRAME_BUFFER_STATE', {
      operation,
      prevGray: this.buffers.prevGray ? 'exists' : 'null',
      currGray: this.buffers.currGray ? 'exists' : 'null',
      prevHash,
      currHash,
      timestamp: Date.now()
    });
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
    this.logBufferState('before_initialize');
    
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
    }
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
    }
    this.buffers.prevGray = grayFrame.clone();
    this.buffers.currGray = grayFrame.clone();
    
    this.logBufferState('after_initialize');
  }

  /**
   * Update current frame
   */
  updateCurrentFrame(grayFrame: any): void {
    this.logBufferState('before_update_current');
    
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
    }
    this.buffers.currGray = grayFrame.clone();
    
    this.logBufferState('after_update_current');
  }

  /**
   * Swap frames (move current to previous)
   */
  swapFrames(): void {
    this.logBufferState('before_swap');
    
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
    }
    this.buffers.prevGray = this.buffers.currGray ? this.buffers.currGray.clone() : null;
    
    this.logBufferState('after_swap');
  }
  /**
   * Reset frames with new frame
   */
  resetFrames(grayFrame: any): void {
    this.logBufferState('before_reset');
    
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
    }
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
    }
    this.buffers.prevGray = grayFrame.clone();
    this.buffers.currGray = grayFrame.clone();
    
    this.logBufferState('after_reset');
  }

  /**
   * Initialize previous frame from current
   */
  initializeFromCurrent(): void {
    this.logBufferState('before_init_from_current');
    
    if (this.buffers.currGray) {
      if (this.buffers.prevGray) {
        this.buffers.prevGray.delete();
      }
      this.buffers.prevGray = this.buffers.currGray.clone();
    }
    
    this.logBufferState('after_init_from_current');
  }

  /**
   * Reset frame buffers but prepare for immediate tracking from current frame
   */
  resetFrameBuffers(): void {
    this.logBufferState('before_reset_buffers');
    
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
      this.buffers.prevGray = null;
    }
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
      this.buffers.currGray = null;
    }
    
    this.logBufferState('after_reset_buffers');
  }

  /**
   * Prepare frame buffer for tracking from current frame
   */
  prepareForTrackingFromCurrentFrame(currentFrame: any): void {
    this.logBufferState('before_prepare_tracking');
    
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
    
    this.logBufferState('after_prepare_tracking');
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

      const frameHash = this.calculateFrameHash(gray);
      this.logger.log(frameNumber, 'FRAME_PROCESSED', {
        width: canvas.width,
        height: canvas.height,
        matType: gray.type(),
        channels: gray.channels(),
        frameHash,
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
   * Reset frame buffers
   */
  resetBuffers(): void {
    this.logBufferState('before_reset_buffers_final');
    
    if (this.buffers.prevGray) {
      this.buffers.prevGray.delete();
      this.buffers.prevGray = null;
    }
    if (this.buffers.currGray) {
      this.buffers.currGray.delete();
      this.buffers.currGray = null;
    }
    
    this.logBufferState('after_reset_buffers_final');
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.resetBuffers();
  }
}
