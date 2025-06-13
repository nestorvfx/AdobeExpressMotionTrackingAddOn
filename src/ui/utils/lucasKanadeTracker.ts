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

// Debug logging interface
export interface DebugLogEntry {
  timestamp: number;
  frameNumber: number;
  operation: string;
  pointId?: string;
  data: any;
  level: 'info' | 'warn' | 'error';
}

export class DebugLogger {
  private logs: DebugLogEntry[] = [];
  private maxLogs: number = 1000;

  log(frameNumber: number, operation: string, data: any, level: 'info' | 'warn' | 'error' = 'info', pointId?: string) {
    const entry: DebugLogEntry = {
      timestamp: Date.now(),
      frameNumber,
      operation,
      pointId,
      data,
      level
    };
    
    this.logs.push(entry);
    
    // Keep logs manageable
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Also log to console for immediate visibility
    const prefix = `[Frame ${frameNumber}${pointId ? `, Point ${pointId.substring(0, 6)}` : ''}] ${operation}:`;
    if (level === 'error') {
      console.error(prefix, data);
    } else if (level === 'warn') {
      console.warn(prefix, data);
    } else {
      console.log(prefix, data);
    }
  }

  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  getFormattedLogs(): string {
    return this.logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const pointInfo = log.pointId ? ` [Point: ${log.pointId.substring(0, 6)}]` : '';
      return `[${time}] Frame ${log.frameNumber}${pointInfo} - ${log.operation}: ${JSON.stringify(log.data, null, 2)}`;
    }).join('\n\n');
  }

  clear() {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
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
  private debugLogger: DebugLogger = new DebugLogger();

  constructor(options?: Partial<TrackingOptions>) {
    this.options = {
      winSize: { width: 15, height: 15 }, // Smaller window for better precision
      maxLevel: 2, // Fewer pyramid levels for stability
      criteria: {
        type: 0, // Will be set properly after OpenCV initialization
        maxCount: 20, // Fewer iterations for better performance
        epsilon: 0.03 // Looser convergence for more robust tracking
      },
      minEigThreshold: 0.01, // Higher threshold for better feature quality
      qualityLevel: 0.01, // Lower quality threshold to find more features
      minDistance: 10, // Increased distance between features
      blockSize: 3, // Smaller block size for better feature detection
      useHarrisDetector: false,
      k: 0.04,
      ...options
    };
  }

  async initialize(): Promise<boolean> {
    // If already initialized, return immediately
    if (this.isInitialized && this.cv) {
      this.debugLogger.log(this.frameCount, 'INIT_ALREADY_READY', { status: 'already initialized' });
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
          
          // Set proper OpenCV constants after initialization
          this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
          
          this.debugLogger.log(this.frameCount, 'INIT_SUCCESS', { 
            status: 'OpenCV already loaded',
            criteriaType: this.options.criteria.type 
          });
          resolve(true);
          return;
        }

        // If OpenCV isn't loaded yet, wait for the custom event
        this.debugLogger.log(this.frameCount, 'INIT_WAITING', { status: 'waiting for OpenCV' });
        
        const handleOpenCvLoaded = () => {
          if ((window as any).cv && (window as any).cv.imread) {
            this.cv = (window as any).cv;
            this.isInitialized = true;
            
            // Set proper OpenCV constants after initialization
            this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
            
            this.debugLogger.log(this.frameCount, 'INIT_SUCCESS', { 
              status: 'OpenCV loaded via event',
              criteriaType: this.options.criteria.type 
            });
            window.removeEventListener('opencv-loaded', handleOpenCvLoaded);
            resolve(true);
          } else {
            this.debugLogger.log(this.frameCount, 'INIT_ERROR', { error: 'OpenCV event fired but cv object not available' }, 'error');
            resolve(false);
          }
        };

        window.addEventListener('opencv-loaded', handleOpenCvLoaded);

        // Set a timeout to prevent hanging indefinitely
        setTimeout(() => {
          if (!this.isInitialized) {
            this.debugLogger.log(this.frameCount, 'INIT_TIMEOUT', { error: 'OpenCV initialization timeout' }, 'error');
            window.removeEventListener('opencv-loaded', handleOpenCvLoaded);
            resolve(false);
          }
        }, 10000); // 10 second timeout

      } catch (error) {
        this.debugLogger.log(this.frameCount, 'INIT_EXCEPTION', { error: error.toString() }, 'error');
        resolve(false);
      }
    });

    return this.initializationPromise;
  }

  async processFrame(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<TrackingPoint[]> {
    if (!this.isInitialized || !this.cv) {
      this.debugLogger.log(this.frameCount, 'PROCESS_FRAME_FAILED', { 
        reason: 'Not initialized', 
        isInitialized: this.isInitialized, 
        hasCv: !!this.cv 
      }, 'error');
      return this.points;
    }

    this.debugLogger.log(this.frameCount, 'PROCESS_FRAME_START', {
      pointCount: this.points.length,
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
      videoCurrentTime: videoElement.currentTime,
      videoReadyState: videoElement.readyState,
      videoNetworkState: videoElement.networkState,
      hasPrevGray: !!this.prevGray,
      hasCurrGray: !!this.currGray
    });

    // Critical fix: Ensure video frame is actually rendered before capturing
    return new Promise<TrackingPoint[]>((resolve) => {
      requestAnimationFrame(() => {
        const ctx = canvas.getContext('2d')!;
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);
        
        this.debugLogger.log(this.frameCount, 'CANVAS_DRAWN', {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          videoCurrentTime: videoElement.currentTime
        });
        
        resolve(this.processFrameInternal(canvas));
      });
    });
  }

  private processFrameInternal(canvas: HTMLCanvasElement): TrackingPoint[] {
    try {
      const ctx = canvas.getContext('2d')!;
      
      // Convert canvas to OpenCV Mat
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = this.cv.matFromImageData(imageData);
      
      this.debugLogger.log(this.frameCount, 'IMAGE_DATA_EXTRACTED', {
        width: canvas.width,
        height: canvas.height,
        dataLength: imageData.data.length,
        pixelSample: Array.from(imageData.data.slice(0, 20)) // First 20 pixels
      });
      
      // Convert to grayscale
      let newGray: any = null;
      try {
        newGray = new this.cv.Mat();
        this.cv.cvtColor(src, newGray, this.cv.COLOR_RGBA2GRAY);
        
        this.debugLogger.log(this.frameCount, 'GRAYSCALE_CONVERTED', {
          rows: newGray.rows,
          cols: newGray.cols,
          type: newGray.type(),
          channels: newGray.channels(),
          graySample: Array.from(new Uint8Array(newGray.data, 0, 20)) // First 20 gray pixels
        });
        
        // Handle frame transitions
        if (!this.prevGray) {
          this.prevGray = newGray.clone();
          this.currGray = newGray.clone();
          this.debugLogger.log(this.frameCount, 'FIRST_FRAME_INITIALIZED', {
            prevGrayCreated: !!this.prevGray,
            currGrayCreated: !!this.currGray
          });
        } else if (this.points.length > 0) {
          // Check frame difference for tracking
          const diff = new this.cv.Mat();
          this.cv.absdiff(this.prevGray, newGray, diff);
          const diffSum = this.cv.sum(diff);
          diff.delete();
          
          this.debugLogger.log(this.frameCount, 'FRAME_DIFFERENCE_CALCULATED', {
            diffSum: diffSum,
            activePoints: this.points.filter(p => p.isActive).length,
            totalPoints: this.points.length
          });
          
          // Update frames safely
          if (this.currGray) {
            this.currGray.delete();
          }
          this.currGray = newGray.clone();
          
          // Perform tracking
          this.trackPoints();
          
          // Update previous frame
          if (this.prevGray) {
            this.prevGray.delete();
          }
          this.prevGray = this.currGray.clone();
        } else {
          // No points to track, just update frames
          if (this.prevGray) {
            this.prevGray.delete();
          }
          if (this.currGray) {
            this.currGray.delete();
          }
          this.prevGray = newGray.clone();
          this.currGray = newGray.clone();
          
          this.debugLogger.log(this.frameCount, 'FRAMES_UPDATED_NO_POINTS', {
            prevGrayUpdated: !!this.prevGray,
            currGrayUpdated: !!this.currGray
          });
        }
      } finally {
        if (newGray) {
          newGray.delete();
        }
      }
      
      src.delete();
      this.frameCount++;

      const activePoints = this.points.filter(p => p.isActive);
      this.debugLogger.log(this.frameCount - 1, 'PROCESS_FRAME_COMPLETE', {
        totalPoints: this.points.length,
        activePoints: activePoints.length,
        pointStates: this.points.map(p => ({
          id: p.id.substring(0, 6),
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
          confidence: Math.round(p.confidence * 1000) / 1000,
          isActive: p.isActive,
          trajectoryLength: p.trajectory.length
        }))
      });

      return this.points.filter(p => p.isActive);
    } catch (error) {
      this.debugLogger.log(this.frameCount, 'PROCESS_FRAME_ERROR', { 
        error: error.toString(), 
        stack: error.stack 
      }, 'error');
      return this.points;
    }
  }

  private trackPoints(): void {
    if (!this.cv || !this.prevGray || !this.currGray || this.points.length === 0) {
      this.debugLogger.log(this.frameCount, 'TRACK_POINTS_SKIPPED', {
        hasCv: !!this.cv,
        hasPrevGray: !!this.prevGray,
        hasCurrGray: !!this.currGray,
        pointCount: this.points.length
      }, 'warn');
      return;
    }

    // Validate frame continuity
    if (this.lastProcessedFrame !== null && Math.abs(this.frameCount - this.lastProcessedFrame) > 1) {
      this.debugLogger.log(this.frameCount, 'FRAME_DISCONTINUITY', {
        lastFrame: this.lastProcessedFrame,
        currentFrame: this.frameCount,
        gap: Math.abs(this.frameCount - this.lastProcessedFrame)
      }, 'warn');
      
      this.points.forEach(point => {
        if (point.isActive) {
          point.confidence = Math.max(0.3, point.confidence * 0.7);
        }
      });
    }
    this.lastProcessedFrame = this.frameCount;

    const activePoints = this.points.filter(p => p.isActive);
    if (activePoints.length === 0) {
      this.debugLogger.log(this.frameCount, 'NO_ACTIVE_POINTS', { totalPoints: this.points.length });
      return;
    }

    this.debugLogger.log(this.frameCount, 'TRACK_POINTS_START', {
      activePointCount: activePoints.length,
      totalPointCount: this.points.length,
      frameSize: { rows: this.currGray.rows, cols: this.currGray.cols }
    });

    for (let i = 0; i < activePoints.length; i++) {
      const point = activePoints[i];
      const pointIndex = this.points.findIndex(p => p.id === point.id);
      if (pointIndex === -1) continue;

      let p0: any = null;
      let p1: any = null;
      let status: any = null;
      let err: any = null;
      
      try {
        // Create OpenCV matrices
        p0 = new this.cv.Mat(1, 1, this.cv.CV_32FC2);
        p0.data32F[0] = point.x;
        p0.data32F[1] = point.y;

        p1 = new this.cv.Mat();
        status = new this.cv.Mat();
        err = new this.cv.Mat();

        this.debugLogger.log(this.frameCount, 'POINT_TRACKING_INPUT', {
          pointId: point.id.substring(0, 6),
          inputX: point.x,
          inputY: point.y,
          confidence: point.confidence,
          searchRadius: point.searchRadius
        }, 'info', point.id);

        // Adaptive window size
        const adaptiveWinSize = Math.max(11, Math.min(25, this.options.winSize.width * (0.5 + point.confidence)));
        const winSize = new this.cv.Size(adaptiveWinSize, adaptiveWinSize);
        
        const criteria = new this.cv.TermCriteria(
          this.options.criteria.type,
          this.options.criteria.maxCount,
          this.options.criteria.epsilon
        );
        
        // Perform optical flow
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

        const isTracked = status.data8U[0] === 1;
        const trackingError = err.data32F[0];
        const newX = p1.data32F[0];
        const newY = p1.data32F[1];
        
        this.debugLogger.log(this.frameCount, 'OPTICAL_FLOW_RESULT', {
          pointId: point.id.substring(0, 6),
          isTracked,
          trackingError,
          newX,
          newY,
          adaptiveWinSize,
          movement: Math.sqrt((newX - point.x) ** 2 + (newY - point.y) ** 2)
        }, 'info', point.id);
        
        // Validate tracking result
        const maxError = 50 + (point.searchRadius * 0.5);
        if (isTracked && trackingError < maxError) {
          if (newX >= 0 && newX < this.currGray.cols && 
              newY >= 0 && newY < this.currGray.rows) {
            
            const distance = Math.sqrt((newX - point.x) ** 2 + (newY - point.y) ** 2);
            const maxMovement = point.searchRadius * (0.8 + point.confidence * 0.4);
            
            if (distance <= maxMovement) {
              // Successful tracking
              const oldX = this.points[pointIndex].x;
              const oldY = this.points[pointIndex].y;
              const oldConfidence = this.points[pointIndex].confidence;
              
              this.points[pointIndex].x = newX;
              this.points[pointIndex].y = newY;
              this.points[pointIndex].confidence = Math.min(1.0, point.confidence * 1.05 + 0.05);
              
              this.points[pointIndex].trajectory.push({
                x: newX,
                y: newY,
                frame: this.frameCount
              });

              if (this.points[pointIndex].trajectory.length > 100) {
                this.points[pointIndex].trajectory.shift();
              }
              
              this.debugLogger.log(this.frameCount, 'POINT_TRACKED_SUCCESS', {
                pointId: point.id.substring(0, 6),
                oldPosition: { x: oldX, y: oldY },
                newPosition: { x: newX, y: newY },
                distance,
                maxMovement,
                oldConfidence,
                newConfidence: this.points[pointIndex].confidence,
                trajectoryLength: this.points[pointIndex].trajectory.length
              }, 'info', point.id);
            } else {
              this.debugLogger.log(this.frameCount, 'POINT_MOVED_TOO_FAR', {
                pointId: point.id.substring(0, 6),
                distance,
                maxMovement
              }, 'warn', point.id);
              this.points[pointIndex].confidence *= 0.5;
              if (this.points[pointIndex].confidence < 0.1) {
                this.points[pointIndex].isActive = false;
              }
            }
          } else {
            this.debugLogger.log(this.frameCount, 'POINT_OUT_OF_BOUNDS', {
              pointId: point.id.substring(0, 6),
              newX, newY,
              bounds: { width: this.currGray.cols, height: this.currGray.rows }
            }, 'warn', point.id);
            this.points[pointIndex].confidence *= 0.3;
            if (this.points[pointIndex].confidence < 0.1) {
              this.points[pointIndex].isActive = false;
            }
          }
        } else {
          this.debugLogger.log(this.frameCount, 'POINT_TRACKING_FAILED', {
            pointId: point.id.substring(0, 6),
            isTracked,
            trackingError,
            maxError
          }, 'warn', point.id);
          this.points[pointIndex].confidence *= 0.6;
          if (this.points[pointIndex].confidence < 0.1) {
            this.points[pointIndex].isActive = false;
          }
        }
      } catch (error) {
        this.debugLogger.log(this.frameCount, 'POINT_TRACKING_EXCEPTION', {
          pointId: point.id.substring(0, 6),
          error: error.toString()
        }, 'error', point.id);
        this.points[pointIndex].confidence *= 0.4;
        if (this.points[pointIndex].confidence < 0.1) {
          this.points[pointIndex].isActive = false;
        }
      } finally {
        if (p0) p0.delete();
        if (p1) p1.delete();
        if (status) status.delete();
        if (err) err.delete();
      }
    }

    this.debugLogger.log(this.frameCount, 'TRACK_POINTS_COMPLETE', {
      totalPointsAfter: this.points.length,
      activePointsAfter: this.points.filter(p => p.isActive).length,
      pointSummary: this.points.map(p => ({
        id: p.id.substring(0, 6),
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        confidence: Math.round(p.confidence * 1000) / 1000,
        isActive: p.isActive
      }))
    });
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
    this.debugLogger.log(this.frameCount, 'ADD_TRACKING_POINT', { pointId, x, y });
    
    if (this.currGray && !this.prevGray) {
      this.prevGray = this.currGray.clone();
    }
    
    return pointId;
  }

  removeTrackingPoint(pointId: string): boolean {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      this.points.splice(index, 1);
      this.debugLogger.log(this.frameCount, 'REMOVE_TRACKING_POINT', { pointId });
      return true;
    }
    return false;
  }

  clearAllPoints(): void {
    this.points = [];
    this.debugLogger.log(this.frameCount, 'CLEAR_ALL_POINTS', {});
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
    this.debugLogger.log(this.frameCount, 'RESET_TRACKER', {});
  }

  setCurrentFrame(frameNumber: number): void {
    this.frameCount = frameNumber;
    this.debugLogger.log(this.frameCount, 'SET_CURRENT_FRAME', { frameNumber });
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
    this.debugLogger.log(this.frameCount, 'HANDLE_SEEK', {});
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

  // Debug logging methods
  getDebugLogs(): DebugLogEntry[] {
    return this.debugLogger.getLogs();
  }

  getFormattedDebugLogs(): string {
    return this.debugLogger.getFormattedLogs();
  }

  exportDebugLogs(): string {
    return this.debugLogger.exportLogs();
  }

  clearDebugLogs(): void {
    this.debugLogger.clear();
  }
}

export default LucasKanadeTracker;
