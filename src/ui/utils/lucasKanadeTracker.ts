// Lucas-Kanade Optical Flow Tracker using OpenCV.js

export interface TrackingPoint {
  id: string;
  x: number;
  y: number;
  confidence: number;
  isActive: boolean;
  trajectory: Array<{ x: number; y: number; frame: number }>;
  searchRadius: number;
  lastManualMoveFrame?: number; // Track when point was last manually positioned
  manualPositions: Map<number, { x: number; y: number }>; // Manual positions by frame number
  trackedPositions: Map<number, { x: number; y: number }>; // Tracked positions by frame number
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
  private isContinuousTracking: boolean = false; // Flag to ensure fresh detection during tracking
  constructor(options?: Partial<TrackingOptions>) {    this.options = {
      winSize: { width: 29, height: 29 }, // Increased by 40% from 21x21 for better feature detection
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
            willTrack: activePointsBeforeTracking.length > 0,
            pointPositions: this.points.map(p => ({
              id: p.id.substring(0, 8),
              currentPos: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 },
              authoritativePos: this.getPointPositionAtFrame(p, this.frameCount),
              hasManualForFrame: p.manualPositions.has(this.frameCount),
              hasTrackedForFrame: p.trackedPositions.has(this.frameCount),
              authority: p.manualPositions.has(this.frameCount) ? 'manual' : 
                        (p.trackedPositions.has(this.frameCount) ? 'tracked' : 'fallback'),
              isActive: p.isActive,
              confidence: p.confidence
            }))
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
          this.currGray = newGray.clone();          this.logger.log(this.frameCount, 'FRAME_PROCESSING', {
            ...beforeState,
            action: 'no_points_reset_frames',
            pointPositions: this.points.map(p => ({
              id: p.id.substring(0, 8),
              currentPos: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 },
              authoritativePos: this.getPointPositionAtFrame(p, this.frameCount),
              hasManualForFrame: p.manualPositions.has(this.frameCount),
              hasTrackedForFrame: p.trackedPositions.has(this.frameCount),
              authority: p.manualPositions.has(this.frameCount) ? 'manual' : 
                        (p.trackedPositions.has(this.frameCount) ? 'tracked' : 'fallback'),
              isActive: p.isActive,
              confidence: p.confidence
            }))
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
    this.lastProcessedFrame = this.frameCount;    const activePoints = this.points.filter(p => p.isActive);
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
    }    // Force fresh tracking detection for all active points only during continuous tracking
    if (this.isContinuousTracking) {
      this.forcePointTracking();
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
      try {        this.logger.log(this.frameCount, 'OPTICAL_FLOW_CALLING', {
          aboutToCall: true,
          hasAllParams: true,
          ...(this.isContinuousTracking && { freshTrackingForced: true }),
          activePointsCount: activePoints.length
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
        const maxMovement = point.searchRadius;        // Intelligent tracking criteria that prioritizes tracking error over OpenCV status
        const baseMaxError = 15;
        const veryLowErrorThreshold = 5; // If error is this low, trust it regardless of OpenCV status
        const maxReasonableMovement = Math.min(point.searchRadius * 0.6, 60); // Slightly more lenient movement
          // Check if point was recently manually repositioned (within last 2 frames)
        const wasRecentlyManual = point.lastManualMoveFrame !== undefined && 
                                 (this.frameCount - point.lastManualMoveFrame) <= 2;
        
        // Adaptive error threshold based on confidence and recent manual positioning
        let maxError = baseMaxError;
        if (point.confidence >= 0.8) {
          maxError = baseMaxError * 1.5; // More lenient for high confidence points
        }
        if (wasRecentlyManual) {
          maxError = baseMaxError * 2; // Very lenient for recently repositioned points
        }
        
        // Smart acceptance criteria:
        // 1. Always accept if tracking error is very low (excellent template match)
        // 2. For moderate errors, require OpenCV success AND reasonable movement
        // 3. Position must always be valid
        const isVeryLowError = trackingError < veryLowErrorThreshold;
        const isModerateError = trackingError < maxError;
        const isMovementReasonable = distance <= maxReasonableMovement;
        
        const shouldAcceptTracking = isPositionValid && (
          isVeryLowError || // Trust very low error regardless of OpenCV status
          (isTracked && isModerateError && isMovementReasonable) // Traditional criteria for moderate errors
        );        this.logger.log(this.frameCount, 'TRACKING_DECISION', {
          pointId: point.id.substring(0, 6),
          isTracked,
          isPositionValid,
          distance: Math.round(distance * 100) / 100,
          maxMovement: maxReasonableMovement,
          trackingError: Math.round(trackingError * 100) / 100,
          baseMaxError,
          adaptiveMaxError: maxError,
          veryLowErrorThreshold,
          isVeryLowError,
          wasRecentlyManual,
          shouldAcceptTracking,
          decision: shouldAcceptTracking ? 'ACCEPT' : 'REJECT',
          intelligentCriteria: isVeryLowError ? 'accepted_for_very_low_error' : 
                              (isTracked && isModerateError) ? 'accepted_for_opencv_success_and_moderate_error' : 'rejected'
        });
          if (shouldAcceptTracking) {
          // Successful tracking - store as tracked position (only if not manually overridden)
          if (!this.points[pointIndex].manualPositions.has(this.frameCount)) {
            this.points[pointIndex].x = newX;
            this.points[pointIndex].y = newY;
            
            // Store as tracked position
            this.setTrackedPosition(point.id, newX, newY, this.frameCount);
          }
          
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
            openCvStatus: isTracked,
            hasManualOverride: this.points[pointIndex].manualPositions.has(this.frameCount)
          });} else {
          // Failed tracking - adjust confidence reduction based on context
          const oldConfidence = this.points[pointIndex].confidence;
          
          // Be more lenient with recently manually positioned points
          const confidenceReduction = wasRecentlyManual ? 0.9 : 0.75; // Less aggressive for manual points
          this.points[pointIndex].confidence *= confidenceReduction;
          failureCount++;
          
          this.logger.log(this.frameCount, 'POINT_TRACKING_FAILED', {
            pointId: point.id.substring(0, 6),
            reason: !isPositionValid ? 'invalid_position' :
                   !isVeryLowError && !isTracked ? 'opencv_status_failed_and_moderate_error' :
                   distance > maxReasonableMovement ? 'moved_too_far' : 'error_too_high',
            isTracked,
            trackingError: Math.round(trackingError * 100) / 100,
            distance: Math.round(distance * 100) / 100,
            maxMovement: maxReasonableMovement,
            wasRecentlyManual,
            confidenceReduction,
            oldConfidence: Math.round(oldConfidence * 1000) / 1000,
            newConfidence: Math.round(this.points[pointIndex].confidence * 1000) / 1000,
            intelligentCriteria: true          }, 'warn');
          
          // Deactivate with different thresholds based on context
          const deactivationThreshold = wasRecentlyManual ? 0.05 : 0.1; // More lenient for manual points
          if (this.points[pointIndex].confidence < deactivationThreshold) {
            this.points[pointIndex].isActive = false;
            deactivationCount++;
            this.logger.log(this.frameCount, 'POINT_DEACTIVATED', {
              pointId: point.id.substring(0, 6),
              reason: wasRecentlyManual ? 'confidence_too_low_after_manual_move' : 'confidence_too_low_intelligent',
              finalConfidence: this.points[pointIndex].confidence,
              deactivationThreshold,
              wasRecentlyManual
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
      searchRadius: 100, // Increased from 75 for better tracking tolerance
      manualPositions: new Map(), // Initialize manual positions map
      trackedPositions: new Map()  // Initialize tracked positions map
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
  }  // Method to manually update a point's position at current frame
  updatePointPosition(pointId: string, newX: number, newY: number): boolean {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      // Set manual position with absolute authority
      this.setManualPosition(pointId, newX, newY, this.frameCount);
      
      // Fully reactivate point when manually positioned
      this.points[index].confidence = 1.0;
      this.points[index].isActive = true;
      this.points[index].lastManualMoveFrame = this.frameCount; // Mark as recently manually moved
      
      // Add to trajectory for this frame (replace if same frame exists)
      const existingFrameIndex = this.points[index].trajectory.findIndex(t => t.frame === this.frameCount);
      if (existingFrameIndex !== -1) {
        this.points[index].trajectory[existingFrameIndex] = {
          x: newX,
          y: newY,
          frame: this.frameCount
        };
      } else {
        this.points[index].trajectory.push({
          x: newX,
          y: newY,
          frame: this.frameCount
        });
      }

      // Keep trajectory length manageable
      if (this.points[index].trajectory.length > 100) {
        this.points[index].trajectory.shift();
      }
      
      this.logger.log(this.frameCount, 'POINT_MANUALLY_MOVED', {
        pointId: pointId.substring(0, 6),
        newX: Math.round(newX * 100) / 100,
        newY: Math.round(newY * 100) / 100,
        frame: this.frameCount,
        newConfidence: this.points[index].confidence,
        wasReactivated: !this.points[index].isActive,
        authority: 'manual_absolute'
      });
      
      return true;
    }
    return false;
  }
  getTrackingPoints(): TrackingPoint[] {
    return [...this.points];
  }

  // Get points with their authoritative positions for a specific frame
  getPointsAtFrame(frame: number): Array<TrackingPoint & { framePosition?: { x: number; y: number } }> {
    return this.points.map(point => ({
      ...point,
      framePosition: this.getPointPositionAtFrame(point, frame)
    }));
  }

  // Get trajectory paths for visualization (shows both manual and tracked positions)
  getTrajectoryPaths(currentFrame: number, range: number = 5): Array<{
    pointId: string;
    path: Array<{ x: number; y: number; frame: number }>;
  }> {
    const trajectories: Array<{
      pointId: string;
      path: Array<{ x: number; y: number; frame: number }>;
    }> = [];

    this.points.forEach(point => {
      const path: Array<{ x: number; y: number; frame: number }> = [];
      
      // Collect positions from both manual and tracked maps within the range
      const startFrame = Math.max(0, currentFrame - range);
      const endFrame = currentFrame + range;
      
      for (let frame = startFrame; frame <= endFrame; frame++) {
        const position = this.getPointPositionAtFrame(point, frame);
        
        // Only add if we have a meaningful position (not just the default current position)
        if (point.manualPositions.has(frame) || point.trackedPositions.has(frame)) {
          path.push({
            x: position.x,
            y: position.y,
            frame: frame
          });
        }
      }
      
      // Sort by frame number
      path.sort((a, b) => a.frame - b.frame);
      
      if (path.length > 0) {
        trajectories.push({
          pointId: point.id,
          path: path
        });
      }
    });

    return trajectories;
  }

  // Public method to get authoritative position for UI components
  public getPointPositionAtFramePublic(pointId: string, frame: number): { x: number; y: number } | null {
    const point = this.points.find(p => p.id === pointId);
    if (!point) return null;
    
    return this.getPointPositionAtFrame(point, frame);
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
  // Manually move a point to a new position
  movePointToPosition(pointId: string, x: number, y: number): boolean {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      this.points[index].x = x;
      this.points[index].y = y;
      this.points[index].lastManualMoveFrame = this.frameCount; // Mark as recently manually moved
      
      // Add this manual position to trajectory
      this.points[index].trajectory.push({
        x,
        y,
        frame: this.frameCount
      });

      if (this.points[index].trajectory.length > 100) {
        this.points[index].trajectory.shift();
      }

      // Boost confidence when manually positioned
      this.points[index].confidence = Math.min(1.0, this.points[index].confidence + 0.2);
      this.points[index].isActive = true; // Reactivate if inactive

      this.logger.log(this.frameCount, 'POINT_MANUALLY_MOVED', {
        pointId: pointId.substring(0, 6),
        newX: Math.round(x * 100) / 100,
        newY: Math.round(y * 100) / 100,
        newConfidence: Math.round(this.points[index].confidence * 1000) / 1000,
        reactivated: true,
        markedFrame: this.frameCount
      });

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
    
    // Reset continuous tracking mode when resetting tracker
    this.isContinuousTracking = false;
  }

  resetFrameBuffers(): void {
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
  setCurrentFrame(frameNumber: number): void {
    const oldFrame = this.frameCount;
    this.frameCount = frameNumber;
    
    // Log frame change with current point positions
    if (oldFrame !== frameNumber) {
      this.logger.log(frameNumber, 'FRAME_SCRUBBED', {
        fromFrame: oldFrame,
        toFrame: frameNumber,
        totalPoints: this.points.length,
        activePoints: this.points.filter(p => p.isActive).length,
        pointPositions: this.points.map(p => ({
          id: p.id.substring(0, 8),
          position: this.getPointPositionAtFrame(p, frameNumber),
          hasManualForFrame: p.manualPositions.has(frameNumber),
          hasTrackedForFrame: p.trackedPositions.has(frameNumber),
          authority: p.manualPositions.has(frameNumber) ? 'manual' : 
                    (p.trackedPositions.has(frameNumber) ? 'tracked' : 'fallback')
        }))
      });
    }
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
    
    // Disable continuous tracking mode during seeks to prevent interference
    this.isContinuousTracking = false;
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
  }  // Force fresh optical flow tracking regardless of existing trajectory data
  private forcePointTracking(): void {
    // During continuous tracking, we always perform fresh optical flow detection
    // We don't rely on existing trajectory data or cached positions
    // The point's current x,y coordinates will be used as starting position for optical flow
    const activeCount = this.points.filter(p => p.isActive).length;
    
    this.logger.log(this.frameCount, 'FORCING_FRESH_TRACKING', {
      activePointsCount: activeCount,
      continuousTrackingMode: this.isContinuousTracking,
      frameNumber: this.frameCount,
      willPerformOpticalFlow: true
    });
  }

  // Enable continuous tracking mode - ensures fresh optical flow detection for every frame
  enableContinuousTracking(): void {
    this.isContinuousTracking = true;
    this.logger.log(this.frameCount, 'CONTINUOUS_TRACKING_ENABLED', {
      mode: 'fresh_detection_forced',
      activePoints: this.points.filter(p => p.isActive).length
    });
  }

  // Disable continuous tracking mode
  disableContinuousTracking(): void {
    this.isContinuousTracking = false;
    this.logger.log(this.frameCount, 'CONTINUOUS_TRACKING_DISABLED', {
      mode: 'normal_operation'
    });
  }

  // Get the authoritative position for a point at a specific frame
  // Manual positions always take precedence over tracked positions
  private getPointPositionAtFrame(point: TrackingPoint, frame: number): { x: number; y: number } {
    // Manual position has absolute authority
    const manualPos = point.manualPositions.get(frame);
    if (manualPos) {
      return manualPos;
    }
    
    // Fall back to tracked position
    const trackedPos = point.trackedPositions.get(frame);
    if (trackedPos) {
      return trackedPos;
    }
    
    // Fall back to current point position
    return { x: point.x, y: point.y };
  }
  // Set a manual position for a point at the current frame
  private setManualPosition(pointId: string, x: number, y: number, frame: number): void {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      const point = this.points[index];
      const oldPos = { x: point.x, y: point.y };
      const wasTrackedForThisFrame = point.trackedPositions.has(frame);
      const trackedPosForFrame = point.trackedPositions.get(frame);
      
      // Set manual position for this frame
      point.manualPositions.set(frame, { x, y });
      
      // Update current position
      point.x = x;
      point.y = y;
      
      // Calculate movement distance
      const distance = Math.sqrt(Math.pow(x - oldPos.x, 2) + Math.pow(y - oldPos.y, 2));
      
      this.logger.log(frame, 'MANUAL_POSITION_SET', {
        pointId: pointId.substring(0, 6),
        frame,
        position: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 },
        oldPosition: { x: Math.round(oldPos.x * 100) / 100, y: Math.round(oldPos.y * 100) / 100 },
        distance: Math.round(distance * 100) / 100,
        authority: 'manual',
        overridingTracked: wasTrackedForThisFrame,
        trackedPositionOverridden: trackedPosForFrame ? {
          x: Math.round(trackedPosForFrame.x * 100) / 100,
          y: Math.round(trackedPosForFrame.y * 100) / 100
        } : null,
        manualOverridesCount: point.manualPositions.size,
        trackedPositionsCount: point.trackedPositions.size
      });
    }
  }
  // Set a tracked position for a point at the current frame
  private setTrackedPosition(pointId: string, x: number, y: number, frame: number): void {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      const point = this.points[index];
      const oldPos = { x: point.x, y: point.y };
      
      // Only set tracked position if no manual position exists for this frame
      if (!point.manualPositions.has(frame)) {
        point.trackedPositions.set(frame, { x, y });
        
        // Update current position only if not manually overridden
        point.x = x;
        point.y = y;
        
        // Calculate movement distance
        const distance = Math.sqrt(Math.pow(x - oldPos.x, 2) + Math.pow(y - oldPos.y, 2));
        
        this.logger.log(frame, 'TRACKED_POSITION_SET', {
          pointId: pointId.substring(0, 6),
          frame,
          position: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 },
          oldPosition: { x: Math.round(oldPos.x * 100) / 100, y: Math.round(oldPos.y * 100) / 100 },
          distance: Math.round(distance * 100) / 100,
          authority: 'tracked',
          manualOverridesCount: point.manualPositions.size,
          trackedPositionsCount: point.trackedPositions.size
        });
      } else {
        this.logger.log(frame, 'TRACKED_POSITION_SKIPPED', {
          pointId: pointId.substring(0, 6),
          frame,
          reason: 'manual_override_exists',
          manualPosition: point.manualPositions.get(frame),
          attemptedTrackedPosition: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }
        });
      }
    }
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
