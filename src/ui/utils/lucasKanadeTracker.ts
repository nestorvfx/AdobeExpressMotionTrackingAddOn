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
      winSize: { width: 21, height: 21 }, // Increased from 15x15 for better robustness
      maxLevel: 3, // Increased from 2 for multi-scale tracking
      criteria: {
        type: 0, // Will be set properly after OpenCV initialization
        maxCount: 30, // Increased from 10 for better convergence
        epsilon: 0.01 // Reduced from 0.03 for better precision
      },
      minEigThreshold: 1e-4, // Standard OpenCV default
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

        const beforeState = {
          frameCount: this.frameCount,
          hasPrevGray: !!this.prevGray,
          hasCurrGray: !!this.currGray,
          totalPoints: this.points.length,
          activePoints: this.points.filter(p => p.isActive).length,
          imageSize: `${canvas.width}x${canvas.height}`
        };

        if (!this.prevGray) {
          this.prevGray = newGray.clone();
          this.currGray = newGray.clone();
          this.logger.log(this.frameCount, 'FRAME_INITIALIZATION', {
            ...beforeState,
            action: 'first_frame_setup'
          });
        } else if (this.points.length > 0) {
          const activePointsBeforeTracking = this.points.filter(p => p.isActive);
          
          if (this.currGray) {
            this.currGray.delete();
          }
          this.currGray = newGray.clone();
          
          this.logger.log(this.frameCount, 'FRAME_PROCESSING', {
            ...beforeState,
            action: 'updating_frames',
            willTrack: activePointsBeforeTracking.length > 0
          });
          
          if (activePointsBeforeTracking.length > 0) {
            this.trackPoints();
          } else {
            this.logger.log(this.frameCount, 'TRACKING_SKIPPED', {
              reason: 'no_active_points',
              inactivePoints: this.points.map(p => ({
                id: p.id.substring(0, 6),
                confidence: p.confidence,
                isActive: p.isActive
              }))
            }, 'warn');
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
          this.logger.log(this.frameCount, 'FRAME_PROCESSING', {
            ...beforeState,
            action: 'no_points_reset_frames'
          });
        }
      } finally {
        if (newGray) {
          newGray.delete();
        }
      }
      
      src.delete();
      this.frameCount++;

      const activePointsAfter = this.points.filter(p => p.isActive);
      this.logger.log(this.frameCount - 1, 'FRAME_COMPLETE', {
        activePointsReturned: activePointsAfter.length,
        totalPoints: this.points.length
      });

      return activePointsAfter;
    } catch (error) {
      this.logger.log(this.frameCount, 'FRAME_PROCESSING_ERROR', {
        error: error.toString(),
        stack: error.stack
      }, 'error');
      return this.points;
    }
  }  private trackPoints(): void {
    if (!this.cv || !this.prevGray || !this.currGray || this.points.length === 0) {
      this.logger.log(this.frameCount, 'TRACKING_PREREQUISITES_FAILED', {
        hasOpenCV: !!this.cv,
        hasPrevGray: !!this.prevGray,
        hasCurrGray: !!this.currGray,
        pointCount: this.points.length
      }, 'error');
      return;
    }

    // Less aggressive frame skip penalty
    if (this.lastProcessedFrame !== null && Math.abs(this.frameCount - this.lastProcessedFrame) > 2) { // Changed from 1
      this.points.forEach(point => {
        if (point.isActive) {
          point.confidence = Math.max(0.4, point.confidence * 0.85); // Less aggressive: 0.85 vs 0.7, min 0.4 vs 0.3
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

    this.logger.log(this.frameCount, 'TRACKING_START', {
      activePointCount: activePoints.length,
      frameSize: `${this.currGray.cols}x${this.currGray.rows}`,
      winSize: `${this.options.winSize.width}x${this.options.winSize.height}`,
      maxLevel: this.options.maxLevel,
      activePointsDetails: activePoints.map(p => ({
        id: p.id.substring(0, 6),
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        confidence: Math.round(p.confidence * 1000) / 1000,
        searchRadius: p.searchRadius
      }))
    });

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

      this.logger.log(this.frameCount, 'OPTICAL_FLOW_PARAMS', {
        pointsToTrack: activePoints.length,
        winSize: `${this.options.winSize.width}x${this.options.winSize.height}`,
        maxLevel: this.options.maxLevel,
        criteriaType: this.options.criteria.type,
        maxCount: this.options.criteria.maxCount,
        epsilon: this.options.criteria.epsilon      });
        // Perform optical flow for all points at once
      try {
        this.logger.log(this.frameCount, 'OPTICAL_FLOW_CALLING', {
          aboutToCall: true,
          hasAllParams: true
        });

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
        );        this.logger.log(this.frameCount, 'OPTICAL_FLOW_SUCCESS', {
          completed: true
        });
      } catch (opticalFlowError) {
        this.logger.log(this.frameCount, 'OPTICAL_FLOW_FAILED', {
          error: opticalFlowError.toString(),
          errorType: typeof opticalFlowError,
          errorName: opticalFlowError.name || 'unknown'
        }, 'error');
        throw opticalFlowError;
      }      // Test matrix access before proceeding
      try {
        this.logger.log(this.frameCount, 'TESTING_MATRIX_ACCESS', {
          hasStatus: !!status,
          hasErr: !!err,
          hasP1: !!p1,
          statusType: status ? status.type() : 'null',
          errType: err ? err.type() : 'null',
          p1Type: p1 ? p1.type() : 'null',
          statusRows: status ? status.rows : 'null',
          statusCols: status ? status.cols : 'null',
          statusChannels: status ? status.channels() : 'null'
        });

        // Test accessing the data arrays using proper OpenCV.js methods
        let testStatusArray, testErrorArray, testPositionArray;
        
        // For status (CV_8UC1) - single channel unsigned char
        if (status.data8U) {
          testStatusArray = Array.from(status.data8U);
        } else {
          // Alternative access method for OpenCV.js
          testStatusArray = [];
          for (let i = 0; i < status.rows; i++) {
            testStatusArray.push(status.ucharAt(i, 0));
          }
        }

        // For error (CV_32FC1) - single channel float
        if (err.data32F) {
          testErrorArray = Array.from(err.data32F);
        } else {
          testErrorArray = [];
          for (let i = 0; i < err.rows; i++) {
            testErrorArray.push(err.floatAt(i, 0));
          }
        }

        // For positions (CV_32FC2) - two channel float
        if (p1.data32F) {
          testPositionArray = Array.from(p1.data32F);
        } else {
          testPositionArray = [];
          for (let i = 0; i < p1.rows; i++) {
            testPositionArray.push(p1.floatAt(i, 0)); // x
            testPositionArray.push(p1.floatAt(i, 1)); // y
          }
        }

        this.logger.log(this.frameCount, 'MATRIX_ACCESS_SUCCESS', {
          statusLength: testStatusArray.length,
          errorLength: testErrorArray.length, 
          positionLength: testPositionArray.length,
          statusValues: testStatusArray,
          errorValues: testErrorArray.map((e: number) => Math.round(e * 100) / 100),
          positionValues: testPositionArray.map((v: number) => Math.round(v * 100) / 100)
        });

        this.logger.log(this.frameCount, 'OPTICAL_FLOW_COMPLETE', {
          inputPoints: activePoints.length,
          statusArray: testStatusArray,
          errorArray: testErrorArray.map((e: number) => Math.round(e * 100) / 100),
          outputPositions: testPositionArray.map((v: number) => Math.round(v * 100) / 100)
        });
      } catch (matrixError) {
        this.logger.log(this.frameCount, 'MATRIX_ACCESS_FAILED', {
          error: matrixError.toString(),
          errorType: typeof matrixError,
          errorName: matrixError.name || 'unknown',
          errorMessage: matrixError.message || 'no message'
        }, 'error');
        throw matrixError;
      }let successCount = 0;
      let failureCount = 0;
      let deactivationCount = 0;
      let outOfBoundsCount = 0;
      let tooFarCount = 0;

      this.logger.log(this.frameCount, 'PROCESSING_RESULTS', {
        pointsToProcess: activePoints.length,
        aboutToStartLoop: true
      });      // Process results for each point
      for (let i = 0; i < activePoints.length; i++) {
        const point = activePoints[i];
        const pointIndex = this.points.findIndex(p => p.id === point.id);
        if (pointIndex === -1) {
          this.logger.log(this.frameCount, 'POINT_NOT_FOUND', {
            pointId: point.id.substring(0, 6),
            searchIndex: i
          }, 'warn');
          continue;
        }

        // Use proper OpenCV.js matrix access methods
        let isTracked, trackingError, newX, newY;
        
        if (status.data8U) {
          isTracked = status.data8U[i] === 1;
        } else {
          isTracked = status.ucharAt(i, 0) === 1;
        }
        
        if (err.data32F) {
          trackingError = err.data32F[i];
        } else {
          trackingError = err.floatAt(i, 0);
        }
        
        if (p1.data32F) {
          newX = p1.data32F[i * 2];
          newY = p1.data32F[i * 2 + 1];
        } else {
          newX = p1.floatAt(i, 0);
          newY = p1.floatAt(i, 1);
        }
        
        this.logger.log(this.frameCount, 'POINT_PROCESSING', {
          pointId: point.id.substring(0, 6),
          index: i,
          isTracked,
          trackingError: Math.round(trackingError * 100) / 100,
          oldPos: { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 },
          newPos: { x: Math.round(newX * 100) / 100, y: Math.round(newY * 100) / 100 }
        });
        
        // Check if position is reasonable (within bounds and not NaN)
        const isPositionValid = !isNaN(newX) && !isNaN(newY) && 
                               newX >= 0 && newX < this.currGray.cols && 
                               newY >= 0 && newY < this.currGray.rows;
        
        // Calculate movement distance
        const distance = isPositionValid ? Math.sqrt((newX - point.x) ** 2 + (newY - point.y) ** 2) : Infinity;
        const maxMovement = point.searchRadius;
          // Stricter tracking criteria to avoid following random features
        const maxError = 15; // Much stricter error threshold (was 100)
        const maxReasonableMovement = Math.min(point.searchRadius * 0.5, 50); // Max half of search radius, capped at 50px
        
        // Accept tracking only if ALL criteria are met:
        // 1. OpenCV status indicates success (isTracked = true)
        // 2. Position is valid (within bounds, not NaN)
        // 3. Movement is reasonable (not too far)
        // 4. Tracking error is low (high confidence)
        const shouldAcceptTracking = isTracked && // Must have OpenCV success
                                   isPositionValid && 
                                   distance <= maxReasonableMovement && 
                                   trackingError < maxError;
          this.logger.log(this.frameCount, 'TRACKING_DECISION', {
          pointId: point.id.substring(0, 6),
          isTracked,
          isPositionValid,
          distance: Math.round(distance * 100) / 100,
          maxMovement: maxReasonableMovement,
          trackingError: Math.round(trackingError * 100) / 100,
          maxError,
          shouldAcceptTracking,
          decision: shouldAcceptTracking ? 'ACCEPT' : 'REJECT',
          stricterCriteria: 'requiring_opencv_success_and_low_error'
        });
        
        if (shouldAcceptTracking) {
          // Successful tracking - update position
          this.points[pointIndex].x = newX;
          this.points[pointIndex].y = newY;
          this.points[pointIndex].confidence = Math.min(1.0, point.confidence + 0.1); // Increase confidence
          
          this.points[pointIndex].trajectory.push({
            x: newX,
            y: newY,
            frame: this.frameCount
          });

          if (this.points[pointIndex].trajectory.length > 100) {
            this.points[pointIndex].trajectory.shift();
          }
          
          successCount++;
          this.logger.log(this.frameCount, 'POINT_TRACKED_SUCCESS', {
            pointId: point.id.substring(0, 6),
            newX: Math.round(newX * 100) / 100,
            newY: Math.round(newY * 100) / 100,
            oldX: Math.round(point.x * 100) / 100,
            oldY: Math.round(point.y * 100) / 100,
            confidence: Math.round(this.points[pointIndex].confidence * 1000) / 1000,
            trajectoryLength: this.points[pointIndex].trajectory.length,
            distance: Math.round(distance * 100) / 100,
            trackingError: Math.round(trackingError * 100) / 100,
            openCvStatus: isTracked
          });        } else {
          // Failed tracking - more aggressive confidence reduction with stricter criteria
          const oldConfidence = this.points[pointIndex].confidence;
          this.points[pointIndex].confidence *= 0.75; // More aggressive reduction (was 0.95)
          failureCount++;
          
          this.logger.log(this.frameCount, 'POINT_TRACKING_FAILED', {
            pointId: point.id.substring(0, 6),
            reason: !isTracked ? 'opencv_status_failed' :
                   !isPositionValid ? 'invalid_position' : 
                   distance > maxReasonableMovement ? 'moved_too_far' : 'high_error',
            isTracked,
            trackingError: Math.round(trackingError * 100) / 100,
            distance: Math.round(distance * 100) / 100,
            maxMovement: maxReasonableMovement,
            oldConfidence: Math.round(oldConfidence * 1000) / 1000,
            newConfidence: Math.round(this.points[pointIndex].confidence * 1000) / 1000,
            stricterCriteria: true
          }, 'warn');
          
          // Deactivate more quickly with stricter criteria
          if (this.points[pointIndex].confidence < 0.1) { // Higher threshold (was 0.02)
            this.points[pointIndex].isActive = false;
            deactivationCount++;
            this.logger.log(this.frameCount, 'POINT_DEACTIVATED', {
              pointId: point.id.substring(0, 6),
              reason: 'confidence_too_low_strict',
              finalConfidence: this.points[pointIndex].confidence
            }, 'warn');
          }
        }}

      this.logger.log(this.frameCount, 'TRACKING_SUMMARY', {
        processedPoints: activePoints.length,
        successCount,
        failureCount,
        deactivationCount,
        remainingActivePoints: this.points.filter(p => p.isActive).length,
        totalPoints: this.points.length
      });

    } catch (error) {
      // Less aggressive confidence degradation on error
      activePoints.forEach(point => {
        const pointIndex = this.points.findIndex(p => p.id === point.id);
        if (pointIndex !== -1) {
          this.points[pointIndex].confidence *= 0.85; // Changed from 0.7
          if (this.points[pointIndex].confidence < 0.05) { // Lowered threshold from 0.1
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
      searchRadius: 100 // Increased from 75 for better tracking tolerance
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

  // Get points at their positions for a specific frame
  getPointsAtFrame(targetFrame: number): Array<TrackingPoint & { framePosition?: { x: number; y: number } }> {
    return this.points.map(point => {
      // Find the closest trajectory point to the target frame
      const trajectoryPoint = this.findTrajectoryPointAtFrame(point, targetFrame);
      
      return {
        ...point,
        framePosition: trajectoryPoint
      };
    });
  }

  // Get trajectory paths for a frame range (±frameRange around target frame)
  getTrajectoryPaths(targetFrame: number, frameRange: number = 5): Array<{
    pointId: string;
    path: Array<{ x: number; y: number; frame: number }>;
  }> {
    const minFrame = Math.max(0, targetFrame - frameRange);
    const maxFrame = targetFrame + frameRange;
    
    return this.points.map(point => ({
      pointId: point.id,
      path: point.trajectory.filter(t => t.frame >= minFrame && t.frame <= maxFrame)
    })).filter(pathData => pathData.path.length > 0);
  }

  private findTrajectoryPointAtFrame(point: TrackingPoint, targetFrame: number): { x: number; y: number } | undefined {
    if (!point.trajectory || point.trajectory.length === 0) {
      return undefined;
    }

    // Find exact frame match
    const exactMatch = point.trajectory.find(t => t.frame === targetFrame);
    if (exactMatch) {
      return { x: exactMatch.x, y: exactMatch.y };
    }

    // Find closest frame
    let closestPoint = point.trajectory[0];
    let minDistance = Math.abs(closestPoint.frame - targetFrame);

    for (const trajPoint of point.trajectory) {
      const distance = Math.abs(trajPoint.frame - targetFrame);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = trajPoint;
      }
    }

    // Only return if within reasonable range (e.g., within 10 frames)
    if (minDistance <= 10) {
      return { x: closestPoint.x, y: closestPoint.y };
    }

    return undefined;
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
    const activePoints = this.points.filter(p => p.isActive);
    const inactivePoints = this.points.filter(p => !p.isActive);
    const totalConfidence = this.points.reduce((sum, p) => sum + p.confidence, 0);
    const averageConfidence = this.points.length > 0 ? totalConfidence / this.points.length : 0;

    return {
      isInitialized: this.isInitialized,
      frameCount: this.frameCount,
      hasFrames: this.frameCount > 0,
      hasPrevGray: !!this.prevGray,
      hasCurrGray: !!this.currGray,
      pointCount: this.points.length,
      activePointCount: activePoints.length,
      lastProcessedFrame: this.lastProcessedFrame,
      hasOpenCV: !!this.cv,
      // Additional properties expected by DebugModal
      totalPoints: this.points.length,
      activePoints: activePoints.length,
      inactivePoints: inactivePoints.length,
      averageConfidence: averageConfidence,
      pointDetails: this.points.map(p => ({
        id: p.id.substring(0, 8),
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        confidence: Math.round(p.confidence * 1000) / 1000,
        isActive: p.isActive,
        trajectoryLength: p.trajectory.length
      }))
    };
  }
  // Reactivate points for testing (app expects this)
  reactivatePoints(): void {
    let reactivatedCount = 0;
    this.points.forEach((point, index) => {
      if (!point.isActive && point.confidence > 0.02) { // Lower threshold
        this.points[index].confidence = Math.max(0.3, point.confidence * 2); // Better starting confidence
        this.points[index].isActive = true;
        reactivatedCount++;
        this.logger.log(this.frameCount, 'POINT_REACTIVATED', {
          pointId: point.id.substring(0, 6),
          newConfidence: this.points[index].confidence
        }, 'info');
      }
    });
    
    if (reactivatedCount > 0) {
      this.logger.log(this.frameCount, 'REACTIVATION_SUMMARY', {
        reactivatedCount,
        totalPoints: this.points.length,
        activeAfter: this.points.filter(p => p.isActive).length
      });
    }
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
  private maxLogs: number = 100; // Increased for better diagnosis

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
    
    // Enhanced console logging for critical issues
    if (level === 'error' || level === 'warn') {
      console.warn(`🔍 [Frame ${frameNumber}] ${operation}:`, data);
    } else if (operation.includes('TRACKING_SUMMARY') || operation.includes('OPTICAL_FLOW')) {
      console.log(`📊 [Frame ${frameNumber}] ${operation}:`, data);
    }
  }

  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  getFormattedLogs(): string {
    if (this.logs.length === 0) {
      return 'No tracking logs available yet. Add tracking points and scrub the video to see tracking data.';
    }

    const recentLogs = this.logs.slice(-50); // Show recent logs for UI
    return recentLogs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const emoji = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : '✅';
      return `${emoji} [${time}] Frame ${log.frameNumber} - ${log.operation}:\n${JSON.stringify(log.data, null, 2)}`;
    }).join('\n\n');
  }

  clear() {
    this.logs = [];
    console.log('🧹 Debug logs cleared');
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export default LucasKanadeTracker;
