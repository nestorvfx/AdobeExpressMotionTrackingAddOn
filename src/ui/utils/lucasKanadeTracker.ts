// Lucas-Kanade Optical Flow Tracker using OpenCV.js
// This implements proper computer vision algorithms for motion tracking

export interface TrackingPoint {
  id: string;
  x: number;
  y: number;
  confidence: number;
  isActive: boolean;
  trajectory: Array<{ x: number; y: number; frame: number }>;
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
  private initializationPromise: Promise<boolean> | null = null;

  constructor(options?: Partial<TrackingOptions>) {
    this.options = {
      winSize: { width: 15, height: 15 },
      maxLevel: 2,
      criteria: {
        type: 1 | 2, // cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT
        maxCount: 10,
        epsilon: 0.03
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
      try {
        // Check if OpenCV is already loaded
        if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.imread) {
          this.cv = (window as any).cv;
          this.isInitialized = true;
          console.log('OpenCV.js is already loaded and ready to use');
          resolve(true);
          return;
        }

        // If OpenCV isn't loaded yet, wait for the custom event
        console.log('Waiting for OpenCV.js to load...');
        const handleOpenCvLoaded = () => {
          if ((window as any).cv && (window as any).cv.imread) {
            this.cv = (window as any).cv;
            this.isInitialized = true;
            console.log('OpenCV.js is now loaded and ready to use');
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
    }

    const ctx = canvas.getContext('2d')!;
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0);

    try {
      // Convert canvas to OpenCV Mat
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = this.cv.matFromImageData(imageData);
      
      // Convert to grayscale
      this.currGray = new this.cv.Mat();
      this.cv.cvtColor(src, this.currGray, this.cv.COLOR_RGBA2GRAY);

      if (this.prevGray && this.points.length > 0) {
        // Track existing points using Lucas-Kanade
        this.trackPoints();
      }

      // Update previous frame
      if (this.prevGray) {
        this.prevGray.delete();
      }
      this.prevGray = this.currGray.clone();
      
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

    // Prepare point arrays for OpenCV
    const activePoints = this.points.filter(p => p.isActive);
    if (activePoints.length === 0) return;

    // Convert tracking points to OpenCV format
    const p0 = new this.cv.Mat(activePoints.length, 1, this.cv.CV_32FC2);
    for (let i = 0; i < activePoints.length; i++) {
      p0.data32F[i * 2] = activePoints[i].x;
      p0.data32F[i * 2 + 1] = activePoints[i].y;
    }

    // Initialize output arrays
    const p1 = new this.cv.Mat();
    const status = new this.cv.Mat();
    const err = new this.cv.Mat();

    // Lucas-Kanade optical flow
    const criteria = new this.cv.TermCriteria(
      this.options.criteria.type,
      this.options.criteria.maxCount,
      this.options.criteria.epsilon
    );

    this.cv.calcOpticalFlowPyrLK(
      this.prevGray,
      this.currGray,
      p0,
      p1,
      status,
      err,
      new this.cv.Size(this.options.winSize.width, this.options.winSize.height),
      this.options.maxLevel,
      criteria
    );

    // Update tracking points
    for (let i = 0; i < activePoints.length; i++) {
      const pointIndex = this.points.findIndex(p => p.id === activePoints[i].id);
      if (pointIndex === -1) continue;

      const isTracked = status.data[i] === 1;
      const trackingError = err.data32F[i];
      
      if (isTracked && trackingError < 50) { // Error threshold
        // Update point position
        const newX = p1.data32F[i * 2];
        const newY = p1.data32F[i * 2 + 1];
        
        // Validate new position is within bounds
        if (newX >= 0 && newX < this.currGray.cols && 
            newY >= 0 && newY < this.currGray.rows) {
          
          this.points[pointIndex].x = newX;
          this.points[pointIndex].y = newY;
          this.points[pointIndex].confidence = Math.max(0, 1 - (trackingError / 50));
          
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
        } else {
          this.points[pointIndex].isActive = false;
        }
      } else {
        // Mark point as lost
        this.points[pointIndex].isActive = false;
        this.points[pointIndex].confidence = 0;
      }
    }

    // Clean up OpenCV objects
    p0.delete();
    p1.delete();
    status.delete();
    err.delete();
  }

  addTrackingPoint(x: number, y: number): string {
    const pointId = `point_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newPoint: TrackingPoint = {
      id: pointId,
      x,
      y,
      confidence: 1.0,
      isActive: true,
      trajectory: [{ x, y, frame: this.frameCount }]
    };

    this.points.push(newPoint);
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
}

export default LucasKanadeTracker;
