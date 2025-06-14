import { TrackingPoint, TrackingOptions } from './TrackingTypes';
import { MinimalDebugger } from './MinimalDebugger';

/**
 * OpticalFlowEngine handles the core OpenCV optical flow tracking operations.
 * Responsible for Lucas-Kanade optical flow calculations and result processing.
 */
export class OpticalFlowEngine {
  private cv: any = null;
  private options: TrackingOptions;
  private logger: MinimalDebugger;

  constructor(cv: any, options: TrackingOptions, logger: MinimalDebugger) {
    this.cv = cv;
    this.options = options;
    this.logger = logger;
  }

  /**
   * Performs optical flow tracking on active points
   */
  trackPoints(
    activePoints: TrackingPoint[],
    prevGray: any,
    currGray: any,
    frameCount: number,
    isContinuousTracking: boolean
  ): {
    successCount: number;
    failureCount: number;
    deactivationCount: number;
    results: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      reason?: string;
    }>;
  } {
    if (!this.cv || !prevGray || !currGray || activePoints.length === 0) {
      this.logger.log(frameCount, 'OPTICAL_FLOW_PREREQUISITES_FAILED', {
        hasOpenCV: !!this.cv,
        hasPrevGray: !!prevGray,
        hasCurrGray: !!currGray,
        activePointCount: activePoints.length
      }, 'error');
      return {
        successCount: 0,
        failureCount: 0,
        deactivationCount: 0,
        results: []
      };
    }

    // Force fresh tracking detection for all active points only during continuous tracking
    if (isContinuousTracking) {
      this.forcePointTracking(activePoints, frameCount);
    }

    this.logger.log(frameCount, 'TRACKING_START', {
      activePointCount: activePoints.length,
      frameSize: `${currGray.cols}x${currGray.rows}`,
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

      this.logger.log(frameCount, 'OPTICAL_FLOW_PARAMS', {
        pointsToTrack: activePoints.length,
        winSize: `${this.options.winSize.width}x${this.options.winSize.height}`,
        maxLevel: this.options.maxLevel,
        criteriaType: this.options.criteria.type,
        maxCount: this.options.criteria.maxCount,
        epsilon: this.options.criteria.epsilon
      });

      // Perform optical flow for all points at once
      try {
        this.logger.log(frameCount, 'OPTICAL_FLOW_CALLING', {
          aboutToCall: true,
          hasAllParams: true,
          ...(isContinuousTracking && { freshTrackingForced: true }),
          activePointsCount: activePoints.length
        });

        this.cv.calcOpticalFlowPyrLK(
          prevGray,
          currGray,
          p0,
          p1,
          status,
          err,
          winSize,
          this.options.maxLevel,
          criteria
        );

        this.logger.log(frameCount, 'OPTICAL_FLOW_SUCCESS', {
          completed: true
        });
      } catch (opticalFlowError) {
        this.logger.log(frameCount, 'OPTICAL_FLOW_FAILED', {
          error: opticalFlowError.toString(),
          errorType: typeof opticalFlowError,
          errorName: opticalFlowError.name || 'unknown'
        }, 'error');
        throw opticalFlowError;
      }

      // Test matrix access before proceeding
      this.testMatrixAccess(status, err, p1, frameCount);

      // Process results for each point
      const results = this.processOpticalFlowResults(
        activePoints,
        status,
        err,
        p1,
        currGray,
        frameCount
      );

      return results;

    } catch (error) {
      this.logger.log(frameCount, 'OPTICAL_FLOW_ERROR', {
        error: error.toString(),
        errorType: typeof error,
        errorName: error.name || 'unknown'
      }, 'error');

      return {
        successCount: 0,
        failureCount: activePoints.length,
        deactivationCount: 0,
        results: activePoints.map(point => ({
          point,
          success: false,
          reason: 'optical_flow_exception'
        }))
      };
    } finally {
      if (p0) p0.delete();
      if (p1) p1.delete();
      if (status) status.delete();
      if (err) err.delete();
    }
  }

  /**
   * Tests matrix access using proper OpenCV.js methods
   */
  private testMatrixAccess(status: any, err: any, p1: any, frameCount: number): void {
    try {
      this.logger.log(frameCount, 'TESTING_MATRIX_ACCESS', {
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

      this.logger.log(frameCount, 'MATRIX_ACCESS_SUCCESS', {
        statusLength: testStatusArray.length,
        errorLength: testErrorArray.length, 
        positionLength: testPositionArray.length,
        statusValues: testStatusArray,
        errorValues: testErrorArray.map((e: number) => Math.round(e * 100) / 100),
        positionValues: testPositionArray.map((v: number) => Math.round(v * 100) / 100)
      });

      this.logger.log(frameCount, 'OPTICAL_FLOW_COMPLETE', {
        inputPoints: status.rows,
        statusArray: testStatusArray,
        errorArray: testErrorArray.map((e: number) => Math.round(e * 100) / 100),
        outputPositions: testPositionArray.map((v: number) => Math.round(v * 100) / 100)
      });
    } catch (matrixError) {
      this.logger.log(frameCount, 'MATRIX_ACCESS_FAILED', {
        error: matrixError.toString(),
        errorType: typeof matrixError,
        errorName: matrixError.name || 'unknown',
        errorMessage: matrixError.message || 'no message'
      }, 'error');
      throw matrixError;
    }
  }

  /**
   * Processes the optical flow results for each point
   */
  private processOpticalFlowResults(
    activePoints: TrackingPoint[],
    status: any,
    err: any,
    p1: any,
    currGray: any,
    frameCount: number
  ): {
    successCount: number;
    failureCount: number;
    deactivationCount: number;
    results: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      reason?: string;
    }>;
  } {
    let successCount = 0;
    let failureCount = 0;
    let deactivationCount = 0;
    const results: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      reason?: string;
    }> = [];

    this.logger.log(frameCount, 'PROCESSING_RESULTS', {
      pointsToProcess: activePoints.length,
      aboutToStartLoop: true
    });

    // Process results for each point
    for (let i = 0; i < activePoints.length; i++) {
      const point = activePoints[i];

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
      
      this.logger.log(frameCount, 'POINT_PROCESSING', {
        pointId: point.id.substring(0, 6),
        index: i,
        isTracked,
        trackingError: Math.round(trackingError * 100) / 100,
        oldPos: { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 },
        newPos: { x: Math.round(newX * 100) / 100, y: Math.round(newY * 100) / 100 }
      });
      
      // Check if position is reasonable (within bounds and not NaN)
      const isPositionValid = !isNaN(newX) && !isNaN(newY) && 
                             newX >= 0 && newX < currGray.cols && 
                             newY >= 0 && newY < currGray.rows;
      
      // Calculate movement distance
      const distance = isPositionValid ? Math.sqrt((newX - point.x) ** 2 + (newY - point.y) ** 2) : Infinity;

      // Check if point was recently manually repositioned (within last 2 frames)
      const wasRecentlyManual = point.lastManualMoveFrame !== undefined && 
                               (frameCount - point.lastManualMoveFrame) <= 2;
      
      // Determine if tracking should be accepted
      const trackingDecision = this.evaluateTrackingQuality(
        point, 
        isTracked, 
        trackingError, 
        distance, 
        isPositionValid, 
        wasRecentlyManual,
        frameCount
      );
      
      if (trackingDecision.shouldAccept) {
        results.push({
          point,
          success: true,
          newX,
          newY,
          trackingError
        });
        successCount++;
      } else {
        results.push({
          point,
          success: false,
          reason: trackingDecision.reason
        });
        failureCount++;
      }
    }

    this.logger.log(frameCount, 'TRACKING_SUMMARY', {
      processedPoints: activePoints.length,
      successCount,
      failureCount,
      deactivationCount
    });

    return {
      successCount,
      failureCount,
      deactivationCount,
      results
    };
  }

  /**
   * Evaluates tracking quality using intelligent criteria
   */
  private evaluateTrackingQuality(
    point: TrackingPoint,
    isTracked: boolean,
    trackingError: number,
    distance: number,
    isPositionValid: boolean,
    wasRecentlyManual: boolean,
    frameCount: number
  ): { shouldAccept: boolean; reason?: string } {
    // Intelligent tracking criteria that prioritizes tracking error over OpenCV status
    const baseMaxError = 15;
    const veryLowErrorThreshold = 5; // If error is this low, trust it regardless of OpenCV status
    const maxReasonableMovement = Math.min(point.searchRadius * 0.6, 60); // Slightly more lenient movement
    
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
    );

    let reason = '';
    if (!shouldAcceptTracking) {
      if (!isPositionValid) {
        reason = 'invalid_position';
      } else if (!isVeryLowError && !isTracked) {
        reason = 'opencv_status_failed_and_moderate_error';
      } else if (distance > maxReasonableMovement) {
        reason = 'moved_too_far';
      } else {
        reason = 'error_too_high';
      }
    }

    this.logger.log(frameCount, 'TRACKING_DECISION', {
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
      reason,
      intelligentCriteria: isVeryLowError ? 'accepted_for_very_low_error' : 
                          (isTracked && isModerateError) ? 'accepted_for_opencv_success_and_moderate_error' : 'rejected'
    });

    return {
      shouldAccept: shouldAcceptTracking,
      reason
    };
  }

  /**
   * Force fresh optical flow tracking regardless of existing trajectory data
   */
  private forcePointTracking(activePoints: TrackingPoint[], frameCount: number): void {
    // During continuous tracking, we always perform fresh optical flow detection
    // We don't rely on existing trajectory data or cached positions
    // The point's current x,y coordinates will be used as starting position for optical flow
    
    this.logger.log(frameCount, 'FORCING_FRESH_TRACKING', {
      activePointsCount: activePoints.length,
      continuousTrackingMode: true,
      frameNumber: frameCount,
      willPerformOpticalFlow: true
    });
  }
}
