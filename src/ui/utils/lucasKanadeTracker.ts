// Lucas-Kanade Optical Flow Tracker using OpenCV.js
// This implements proper computer vision algorithms for motion tracking

export interface TrackingPoint {
  id: string;
  x: number;
  y: number;
  confidence: number;
  isActive: boolean;
  trajectory: Array<{ x: number; y: number; frame: number }>;
  searchRadius: number; // Radius of the search area
}

export interface TrackingOptions {
  winSize: { width: number; height: number };
  maxLevel: number;
  criteria: {
    type: number;
    maxCount: number;
    epsilon: number;
  };
  minEigThreshold: number;
  qualityLevel: number;
  minDistance: number;
  blockSize: number;
  useHarrisDetector: boolean;
  k: number;
}

export class LucasKanadeTracker {
  private cv: any = null;
  private prevGray: any = null;
  private currGray: any = null;
  private points: TrackingPoint[] = [];
  private frameCount: number = 0;
  private options: TrackingOptions;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;  constructor(options?: Partial<TrackingOptions>) {
    this.options = {
      winSize: { width: 21, height: 21 }, // Larger window for better feature tracking
      maxLevel: 3, // More pyramid levels for better tracking
      criteria: {
        type: 0, // Will be set properly after OpenCV initialization
        maxCount: 30, // More iterations for better convergence
        epsilon: 0.01 // Tighter convergence criteria
      },
      minEigThreshold: 0.001,
      qualityLevel: 0.3,
      minDistance: 7,
      blockSize: 7,
      useHarrisDetector: false,
      k: 0.04,
      ...options
    };
  }

  async initialize(): Promise<boolean> {
    // If already initialized, return immediately
    if (this.isInitialized && this.cv) {
      return true;
    }

    // If initialization is already in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization process
    this.initializationPromise = new Promise<boolean>(async (resolve) => {
      try {        // Check if OpenCV is already loaded
        if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.imread) {
          this.cv = (window as any).cv;
          this.isInitialized = true;
          
          // Set proper OpenCV constants after initialization
          this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
          
          console.log('OpenCV.js is already loaded and ready to use');
          console.log('Set termination criteria type to:', this.options.criteria.type);
          resolve(true);
          return;
        }

        // If OpenCV isn't loaded yet, wait for the custom event
        console.log('Waiting for OpenCV.js to load...');        const handleOpenCvLoaded = () => {
          if ((window as any).cv && (window as any).cv.imread) {
            this.cv = (window as any).cv;
            this.isInitialized = true;
            
            // Set proper OpenCV constants after initialization
            this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
            
            console.log('OpenCV.js is now loaded and ready to use');
            console.log('Set termination criteria type to:', this.options.criteria.type);
            window.removeEventListener('opencv-loaded', handleOpenCvLoaded);
            resolve(true);
          } else {
            console.error('OpenCV.js loaded event fired but cv object is not available');
            resolve(false);
          }
        };

        window.addEventListener('opencv-loaded', handleOpenCvLoaded);

        // Set a timeout to prevent hanging indefinitely
        setTimeout(() => {
          if (!this.isInitialized) {
            console.error('Timed out waiting for OpenCV.js to load');
            window.removeEventListener('opencv-loaded', handleOpenCvLoaded);
            resolve(false);
          }
        }, 10000); // 10 second timeout

      } catch (error) {
        console.error('Failed to initialize OpenCV:', error);
        resolve(false);
      }
    });

    return this.initializationPromise;
  }
  processFrame(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): TrackingPoint[] {
    if (!this.isInitialized || !this.cv) {
      console.warn('Tracker not initialized');
      return this.points;
    }    console.log('Processing frame:', this.frameCount, 'Points:', this.points.length);
    console.log('Video dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight, 'currentTime:', videoElement.currentTime);

    const ctx = canvas.getContext('2d')!;
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0);

    try {      // Convert canvas to OpenCV Mat
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = this.cv.matFromImageData(imageData);
      
      // Convert to grayscale - properly manage previous currGray matrix
      if (this.currGray) {
        this.currGray.delete(); // Clean up previous matrix
      }
      this.currGray = new this.cv.Mat();
      this.cv.cvtColor(src, this.currGray, this.cv.COLOR_RGBA2GRAY);
      
      console.log('Created grayscale image:', this.currGray.rows, 'x', this.currGray.cols);// If this is the first frame, or if we don't have a previous frame, just store the current frame
      if (!this.prevGray) {
        this.prevGray = this.currGray.clone();
        console.log('Initialized first frame for tracking');
      } else if (this.points.length > 0) {
        // Check if frames are different enough for tracking
        const diff = new this.cv.Mat();
        this.cv.absdiff(this.prevGray, this.currGray, diff);
        const diffSum = this.cv.sum(diff);
        console.log('Frame difference sum:', diffSum[0], diffSum[1], diffSum[2], diffSum[3]);
        diff.delete();
        
        // Track existing points using Lucas-Kanade
        this.trackPoints();
        
        // Update previous frame for next iteration
        this.prevGray.delete();
        this.prevGray = this.currGray.clone();
      } else {
        // No points to track, just update the previous frame
        this.prevGray.delete();
        this.prevGray = this.currGray.clone();
      }
      
      src.delete();
      this.frameCount++;

      return this.points.filter(p => p.isActive);
    } catch (error) {
      console.error('Error processing frame:', error);
      return this.points;
    }
  }
  private trackPoints(): void {
    if (!this.cv || !this.prevGray || !this.currGray || this.points.length === 0) {
      return;
    }

    // Track each point individually with its own search radius
    const activePoints = this.points.filter(p => p.isActive);
    if (activePoints.length === 0) return;

    for (let i = 0; i < activePoints.length; i++) {
      const point = activePoints[i];
      const pointIndex = this.points.findIndex(p => p.id === point.id);
      if (pointIndex === -1) continue;

      // Create single point arrays for OpenCV
      const p0 = new this.cv.Mat(1, 1, this.cv.CV_32FC2);
      p0.data32F[0] = point.x;
      p0.data32F[1] = point.y;      const p1 = new this.cv.Mat();
      const status = new this.cv.Mat();
      const err = new this.cv.Mat();

      // Use proper window size from options, not calculated featureWindowSize
      const winSize = new this.cv.Size(this.options.winSize.width, this.options.winSize.height);
      
      const criteria = new this.cv.TermCriteria(
        this.options.criteria.type,
        this.options.criteria.maxCount,
        this.options.criteria.epsilon
      );

      try {
        console.log(`Tracking point ${point.id} at (${point.x}, ${point.y}) with winSize ${this.options.winSize.width}x${this.options.winSize.height}`);
        
        this.cv.calcOpticalFlowPyrLK(
          this.prevGray,
          this.currGray,
          p0,
          p1,
          status,
          err,
          winSize, // Use proper window size
          this.options.maxLevel,
          criteria
        );        const isTracked = status.data8U[0] === 1; // Use correct data type
        const trackingError = err.data32F[0];
        
        console.log(`Point ${point.id}: tracked=${isTracked}, error=${trackingError}, winSize=${this.options.winSize.width}`);
        
        if (isTracked && trackingError < 100) { // More lenient error threshold (was 50)
          const newX = p1.data32F[0];
          const newY = p1.data32F[1];
          
          // Validate new position is within bounds
          if (newX >= 0 && newX < this.currGray.cols && 
              newY >= 0 && newY < this.currGray.rows) {
            
            // More lenient movement validation based on search radius
            const distance = Math.sqrt((newX - point.x) ** 2 + (newY - point.y) ** 2);
            const maxMovement = point.searchRadius; // Allow movement up to search radius
            
            if (distance <= maxMovement) {
              this.points[pointIndex].x = newX;
              this.points[pointIndex].y = newY;
              this.points[pointIndex].confidence = Math.max(0.1, 1 - (trackingError / 100));
              
              // Add to trajectory
              this.points[pointIndex].trajectory.push({
                x: newX,
                y: newY,
                frame: this.frameCount
              });

              // Keep trajectory history manageable
              if (this.points[pointIndex].trajectory.length > 100) {
                this.points[pointIndex].trajectory.shift();
              }
              
              console.log(`Point ${point.id} successfully tracked to (${newX.toFixed(2)}, ${newY.toFixed(2)}), distance: ${distance.toFixed(2)}`);
            } else {
              console.log(`Point ${point.id} moved too far: ${distance.toFixed(2)} > ${maxMovement}, marking as lost`);
              this.points[pointIndex].isActive = false;
              this.points[pointIndex].confidence = 0;
            }
          } else {
            console.log(`Point ${point.id} moved out of bounds: (${newX}, ${newY})`);
            this.points[pointIndex].isActive = false;
            this.points[pointIndex].confidence = 0;
          }        } else {
          console.log(`Point ${point.id} tracking failed: tracked=${isTracked}, error=${trackingError}`);
          // Mark point as lost
          this.points[pointIndex].isActive = false;
          this.points[pointIndex].confidence = 0;
        }
      } catch (error) {
        console.error('Error tracking point:', point.id, error);
        this.points[pointIndex].isActive = false;
        this.points[pointIndex].confidence = 0;
      }

      // Clean up OpenCV objects
      p0.delete();
      p1.delete();
      status.delete();
      err.delete();
    }
  }
  addTrackingPoint(x: number, y: number): string {
    const pointId = `point_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPoint: TrackingPoint = {
      id: pointId,
      x,
      y,
      confidence: 1.0,
      isActive: true,
      trajectory: [{ x, y, frame: this.frameCount }],
      searchRadius: 75 // Default search radius of 75 pixels
    };

    this.points.push(newPoint);
    console.log(`Added tracking point ${pointId} at (${x}, ${y}) on frame ${this.frameCount}`);
    
    // If we have a current frame, make sure we have it as reference for next tracking
    if (this.currGray && !this.prevGray) {
      this.prevGray = this.currGray.clone();
      console.log('Captured current frame as reference for new tracking point');
    }
    
    return pointId;
  }

  removeTrackingPoint(pointId: string): boolean {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      this.points.splice(index, 1);
      return true;
    }
    return false;
  }

  clearAllPoints(): void {
    this.points = [];
  }

  getTrackingPoints(): TrackingPoint[] {
    return [...this.points];
  }

  getActivePoints(): TrackingPoint[] {
    return this.points.filter(p => p.isActive);
  }

  // Auto-detect good features to track using Shi-Tomasi corner detector
  autoDetectFeatures(maxCorners: number = 100): TrackingPoint[] {
    if (!this.cv || !this.currGray) {
      return [];
    }

    try {
      const corners = new this.cv.Mat();
      const mask = new this.cv.Mat();

      this.cv.goodFeaturesToTrack(
        this.currGray,
        corners,
        maxCorners,
        this.options.qualityLevel,
        this.options.minDistance,
        mask,
        this.options.blockSize,
        this.options.useHarrisDetector,
        this.options.k
      );

      const newPoints: TrackingPoint[] = [];
      for (let i = 0; i < corners.rows; i++) {
        const x = corners.data32F[i * 2];
        const y = corners.data32F[i * 2 + 1];
        
        const pointId = this.addTrackingPoint(x, y);
        const point = this.points.find(p => p.id === pointId);
        if (point) {
          newPoints.push(point);
        }
      }

      corners.delete();
      mask.delete();
      
      return newPoints;
    } catch (error) {
      console.error('Error detecting features:', error);
      return [];
    }
  }

  // Update tracking parameters
  updateTrackingOptions(newOptions: Partial<TrackingOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  // Get tracking statistics
  getTrackingStats(): {
    totalPoints: number;
    activePoints: number;
    averageConfidence: number;
    frameCount: number;
  } {
    const activePoints = this.getActivePoints();
    const avgConfidence = activePoints.length > 0 
      ? activePoints.reduce((sum, p) => sum + p.confidence, 0) / activePoints.length 
      : 0;

    return {
      totalPoints: this.points.length,
      activePoints: activePoints.length,
      averageConfidence: avgConfidence,
      frameCount: this.frameCount
    };
  }

  // Clean up resources
  dispose(): void {
    if (this.prevGray) {
      this.prevGray.delete();
      this.prevGray = null;
    }
    if (this.currGray) {
      this.currGray.delete();
      this.currGray = null;
    }
    this.points = [];
    this.isInitialized = false;
  }
  updatePointSearchRadius(pointId: string, radius: number): boolean {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      this.points[index].searchRadius = Math.max(25, Math.min(140, radius)); // Clamp between 25-140 pixels
      return true;
    }
    return false;
  }
  resetTracker(): void {
    // Clean up previous OpenCV matrices
    if (this.prevGray) {
      this.prevGray.delete();
      this.prevGray = null;
    }
    if (this.currGray) {
      this.currGray.delete();
      this.currGray = null;
    }
    
    // Reset frame count
    this.frameCount = 0;
    
    console.log('Tracker state reset');
  }
  setCurrentFrame(frameNumber: number): void {
    this.frameCount = frameNumber;
    console.log('Set current frame to:', frameNumber);
  }
  handleSeek(): void {
    // When user seeks to a different frame, we need to reset tracking state
    // because optical flow requires consecutive frames
    if (this.prevGray) {
      this.prevGray.delete();
      this.prevGray = null;
    }
    if (this.currGray) {
      this.currGray.delete();
      this.currGray = null;
    }
    console.log('Tracking state reset due to seek');
  }
}

export default LucasKanadeTracker;
