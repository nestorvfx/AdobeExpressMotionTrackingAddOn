// Lucas-Kanade Optical Flow Tracker using OpenCV.js
// Simplified version without debug logging

export interface TrackingPoint {
  id: string;
  x: number;
  y: number;
  confidence: number;
  isActive: boolean;
  trajectory: Array<{ x: number; y: number; frame: number }>;
  searchRadius: number;
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
  private lastProcessedFrame: number | null = null;
  private options: TrackingOptions;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;
  private logger: MinimalDebugger = new MinimalDebugger();
  private debugger: MinimalDebugger | null = null; // Debugger instance

  constructor(options?: Partial<TrackingOptions>) {
    this.options = {
      winSize: { width: 15, height: 15 },
      maxLevel: 2,
      criteria: {
        type: 0, // Will be set properly after OpenCV initialization
        maxCount: 10,
        epsilon: 0.03
      },
      minEigThreshold: 0.01,
      qualityLevel: 0.3,
      minDistance: 7,
      blockSize: 7,
      useHarrisDetector: false,
      k: 0.04,
      ...options
    };
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.cv) {
      return true;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = new Promise<boolean>(async (resolve) => {
      try {
        if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.imread) {
          this.cv = (window as any).cv;
          this.isInitialized = true;
          this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
          resolve(true);
          return;
        }

        const handleOpenCvLoaded = () => {
          if ((window as any).cv && (window as any).cv.imread) {
            this.cv = (window as any).cv;
            this.isInitialized = true;
            this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
            window.removeEventListener('opencv-loaded', handleOpenCvLoaded);
            resolve(true);
          } else {
            resolve(false);
          }
        };

        window.addEventListener('opencv-loaded', handleOpenCvLoaded);

        setTimeout(() => {
          if (!this.isInitialized) {
            window.removeEventListener('opencv-loaded', handleOpenCvLoaded);
            resolve(false);
          }
        }, 10000);

      } catch (error) {
        resolve(false);
      }
    });

    return this.initializationPromise;
  }

  async processFrame(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<TrackingPoint[]> {
    if (!this.isInitialized || !this.cv) {
      return this.points;
    }

    return new Promise<TrackingPoint[]>((resolve) => {
      requestAnimationFrame(() => {
        const ctx = canvas.getContext('2d')!;
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);
        resolve(this.processFrameInternal(canvas));
      });
    });
  }

  private processFrameInternal(canvas: HTMLCanvasElement): TrackingPoint[] {
    try {
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = this.cv.matFromImageData(imageData);

      let newGray: any = null;
      try {
        newGray = new this.cv.Mat();
        this.cv.cvtColor(src, newGray, this.cv.COLOR_RGBA2GRAY);

        if (!this.prevGray) {
          this.prevGray = newGray.clone();
          this.currGray = newGray.clone();
        } else if (this.points.length > 0) {
          const activePointsBeforeTracking = this.points.filter(p => p.isActive);
          
          if (this.currGray) {
            this.currGray.delete();
          }
          this.currGray = newGray.clone();
          
          if (activePointsBeforeTracking.length > 0) {
            this.trackPoints();
          }
          
          if (this.prevGray) {
            this.prevGray.delete();
          }
          this.prevGray = this.currGray.clone();
        } else {
          if (this.prevGray) {
            this.prevGray.delete();
          }
          if (this.currGray) {
            this.currGray.delete();
          }
          this.prevGray = newGray.clone();
          this.currGray = newGray.clone();
        }
      } finally {
        if (newGray) {
          newGray.delete();
        }
      }
      
      src.delete();
      this.frameCount++;

      return this.points.filter(p => p.isActive);
    } catch (error) {
      return this.points;
    }
  }
  private trackPoints(): void {
    if (!this.cv || !this.prevGray || !this.currGray || this.points.length === 0) {
      return;
    }

    if (this.lastProcessedFrame !== null && Math.abs(this.frameCount - this.lastProcessedFrame) > 1) {
      this.points.forEach(point => {
        if (point.isActive) {
          point.confidence = Math.max(0.3, point.confidence * 0.7);
        }
      });
    }
    this.lastProcessedFrame = this.frameCount;

    const activePoints = this.points.filter(p => p.isActive);
    if (activePoints.length === 0) {
      this.logger.log(this.frameCount, 'NO_ACTIVE_POINTS', { 
        totalPoints: this.points.length,
        inactivePoints: this.points.filter(p => !p.isActive).map(p => ({
          id: p.id.substring(0, 6),
          confidence: p.confidence,
          isActive: p.isActive
        }))
      }, 'warn');
      return;
    }

    let p0: any = null;
    let p1: any = null;
    let status: any = null;
    let err: any = null;

    try {
      // Create input matrix for all active points
      p0 = new this.cv.Mat(activePoints.length, 1, this.cv.CV_32FC2);
      
      for (let i = 0; i < activePoints.length; i++) {
        p0.data32F[i * 2] = activePoints[i].x;
        p0.data32F[i * 2 + 1] = activePoints[i].y;
      }

      // Initialize output matrices
      p1 = new this.cv.Mat(activePoints.length, 1, this.cv.CV_32FC2);
      status = new this.cv.Mat(activePoints.length, 1, this.cv.CV_8UC1);
      err = new this.cv.Mat(activePoints.length, 1, this.cv.CV_32FC1);

      const winSize = new this.cv.Size(this.options.winSize.width, this.options.winSize.height);
      const criteria = new this.cv.TermCriteria(
        this.options.criteria.type,
        this.options.criteria.maxCount,
        this.options.criteria.epsilon
      );
      
      // Perform optical flow for all points at once
      this.cv.calcOpticalFlowPyrLK(
        this.prevGray,
        this.currGray,
        p0,
        p1,
        status,
        err,
        winSize,
        this.options.maxLevel,
        criteria
      );

      // Process results for each point
      for (let i = 0; i < activePoints.length; i++) {
        const point = activePoints[i];
        const pointIndex = this.points.findIndex(p => p.id === point.id);
        if (pointIndex === -1) continue;

        const isTracked = status.data8U[i] === 1;
        const trackingError = err.data32F[i];
        const newX = p1.data32F[i * 2];
        const newY = p1.data32F[i * 2 + 1];
        
        const maxError = 30;
        if (isTracked && trackingError < maxError) {
          if (newX >= 0 && newX < this.currGray.cols && 
              newY >= 0 && newY < this.currGray.rows) {
            
            const distance = Math.sqrt((newX - point.x) ** 2 + (newY - point.y) ** 2);
            const maxMovement = point.searchRadius;
              if (distance <= maxMovement) {
              // Successful tracking
              this.points[pointIndex].x = newX;
              this.points[pointIndex].y = newY;
              this.points[pointIndex].confidence = Math.min(1.0, point.confidence * 1.1);
              
              this.points[pointIndex].trajectory.push({
                x: newX,
                y: newY,
                frame: this.frameCount
              });

              if (this.points[pointIndex].trajectory.length > 100) {
                this.points[pointIndex].trajectory.shift();
              }
              
              this.logger.log(this.frameCount, 'POINT_TRACKED_SUCCESS', {
                pointId: point.id.substring(0, 6),
                newX: Math.round(newX * 100) / 100,
                newY: Math.round(newY * 100) / 100,
                confidence: Math.round(this.points[pointIndex].confidence * 1000) / 1000,
                trajectoryLength: this.points[pointIndex].trajectory.length
              });
            } else {
              this.points[pointIndex].confidence *= 0.8;
              if (this.points[pointIndex].confidence < 0.1) {
                this.points[pointIndex].isActive = false;
                this.logger.log(this.frameCount, 'POINT_DEACTIVATED', {
                  pointId: point.id.substring(0, 6),
                  reason: 'moved too far',
                  distance: Math.round(distance * 100) / 100,
                  maxMovement,
                  finalConfidence: this.points[pointIndex].confidence
                }, 'warn');
              }
            }          } else {
            this.points[pointIndex].confidence *= 0.7;
            if (this.points[pointIndex].confidence < 0.1) {
              this.points[pointIndex].isActive = false;
              this.logger.log(this.frameCount, 'POINT_DEACTIVATED', {
                pointId: point.id.substring(0, 6),
                reason: 'out of bounds',
                newX: Math.round(newX * 100) / 100,
                newY: Math.round(newY * 100) / 100,
                finalConfidence: this.points[pointIndex].confidence
              }, 'warn');
            }
          }
        } else {
          this.points[pointIndex].confidence *= 0.8;
          if (this.points[pointIndex].confidence < 0.1) {
            this.points[pointIndex].isActive = false;
            this.logger.log(this.frameCount, 'POINT_DEACTIVATED', {
              pointId: point.id.substring(0, 6),
              reason: 'tracking failed',
              isTracked,
              trackingError: Math.round(trackingError * 100) / 100,
              finalConfidence: this.points[pointIndex].confidence
            }, 'warn');
          }
        }
      }

    } catch (error) {
      // Degrade confidence for all points on error
      activePoints.forEach(point => {
        const pointIndex = this.points.findIndex(p => p.id === point.id);
        if (pointIndex !== -1) {
          this.points[pointIndex].confidence *= 0.7;
          if (this.points[pointIndex].confidence < 0.1) {
            this.points[pointIndex].isActive = false;
          }
        }
      });
    } finally {
      if (p0) p0.delete();
      if (p1) p1.delete();
      if (status) status.delete();
      if (err) err.delete();
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
      searchRadius: 75
    };

    this.points.push(newPoint);
    this.logger.log(this.frameCount, 'ADD_TRACKING_POINT', { 
      pointId: pointId.substring(0, 12), 
      x, 
      y, 
      totalPoints: this.points.length 
    });
    
    if (this.currGray && !this.prevGray) {
      this.prevGray = this.currGray.clone();
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

  updatePointSearchRadius(pointId: string, radius: number): boolean {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      this.points[index].searchRadius = Math.max(25, Math.min(140, radius));
      return true;
    }
    return false;
  }

  resetTracker(): void {
    if (this.prevGray) {
      this.prevGray.delete();
      this.prevGray = null;
    }
    if (this.currGray) {
      this.currGray.delete();
      this.currGray = null;
    }
    
    this.frameCount = 0;
    this.lastProcessedFrame = null;
  }

  setCurrentFrame(frameNumber: number): void {
    this.frameCount = frameNumber;
  }

  handleSeek(): void {
    if (this.prevGray) {
      this.prevGray.delete();
      this.prevGray = null;
    }
    if (this.currGray) {
      this.currGray.delete();
      this.currGray = null;
    }
    this.lastProcessedFrame = null;
  }

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

  // Essential debug methods for app compatibility
  getDebugLogs(): DebugLogEntry[] {
    return this.logger.getLogs();
  }

  getFormattedDebugLogs(): string {
    return this.logger.getFormattedLogs();
  }

  exportDebugLogs(): string {
    return this.logger.exportLogs();
  }

  clearDebugLogs(): void {
    this.logger.clear();
  }

  // Diagnostic method for testing
  getTrackerState() {
    return {
      isInitialized: this.isInitialized,
      frameCount: this.frameCount,
      hasFrames: this.frameCount > 0,
      hasPrevGray: !!this.prevGray,
      hasCurrGray: !!this.currGray,
      pointCount: this.points.length,
      activePointCount: this.points.filter(p => p.isActive).length,
      lastProcessedFrame: this.lastProcessedFrame,
      hasOpenCV: !!this.cv
    };
  }

  // Reactivate points for testing (app expects this)
  reactivatePoints(): void {
    this.points.forEach((point, index) => {
      if (!point.isActive && point.confidence > 0.05) {
        this.points[index].confidence = 0.5;
        this.points[index].isActive = true;
        this.logger.log(this.frameCount, 'POINT_REACTIVATED', {
          pointId: point.id.substring(0, 6),
          newConfidence: 0.5
        }, 'info');
      }
    });
  }

  // Diagnostic info method (app expects this)
  getDiagnosticInfo() {
    return {
      frameCount: this.frameCount,
      hasOpenCV: !!this.cv,
      hasFrames: { prev: !!this.prevGray, curr: !!this.currGray },
      points: {
        total: this.points.length,
        active: this.points.filter(p => p.isActive).length,
        inactive: this.points.filter(p => !p.isActive).length,
        details: this.points.map(p => ({
          id: p.id.substring(0, 8),
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
          confidence: Math.round(p.confidence * 1000) / 1000,
          isActive: p.isActive,
          trajectoryLength: p.trajectory.length
        }))
      }
    };
  }

  // Force tracking test method (app expects this)
  forceTrackingTest(): string {
    const report = [];
    report.push(`=== FORCED TRACKING TEST - Frame ${this.frameCount} ===`);
    
    if (!this.cv || !this.prevGray || !this.currGray) {
      report.push('ERROR: Missing OpenCV or frame data');
      return report.join('\n');
    }
    
    // Reactivate all points
    this.points.forEach((point, index) => {
      if (!point.isActive) {
        this.points[index].isActive = true;
        this.points[index].confidence = 0.8;
        report.push(`Reactivated point ${point.id.substring(0, 8)}`);
      }
    });
    
    // Try tracking
    try {
      this.trackPoints();
      report.push('Tracking completed');
    } catch (error) {
      report.push(`ERROR: ${error.toString()}`);
    }
    
    report.push('=== END TEST ===');
    return report.join('\n');
  }
}

// Minimal debug interface for essential app functionality
export interface DebugLogEntry {
  timestamp: number;
  frameNumber: number;
  operation: string;
  data: any;
  level: 'info' | 'warn' | 'error';
}

class MinimalDebugger {
  private logs: DebugLogEntry[] = [];
  private maxLogs: number = 50; // Keep it small

  log(frameNumber: number, operation: string, data: any, level: 'info' | 'warn' | 'error' = 'info') {
    this.logs.push({
      timestamp: Date.now(),
      frameNumber,
      operation,
      data,
      level
    });
    
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Console log for immediate visibility
    console.log(`[Frame ${frameNumber}] ${operation}:`, data);
  }

  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  getFormattedLogs(): string {
    return this.logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      return `[${time}] Frame ${log.frameNumber} - ${log.operation}: ${JSON.stringify(log.data)}`;
    }).join('\n\n');
  }

  clear() {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export default LucasKanadeTracker;
