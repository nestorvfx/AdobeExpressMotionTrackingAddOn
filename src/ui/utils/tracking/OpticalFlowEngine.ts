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
   * Performs optical flow tracking on active points with bidirectional verification and adaptive pyramid levels
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
    }>;  } {
    if (!this.cv || !prevGray || !currGray || activePoints.length === 0) {
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
      activePointsDetails: activePoints.map(p => ({
        id: p.id.substring(0, 6),
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        confidence: Math.round(p.confidence * 1000) / 1000,
        searchRadius: p.searchRadius,
        adaptiveWindowSize: p.adaptiveWindowSize || this.options.winSize.width
      }))
    });    // Perform bidirectional tracking with adaptive parameters
    return this.performBidirectionalTracking(
      activePoints,
      prevGray,
      currGray,
      frameCount
    );
  }
  /**
   * Calculates optimal pyramid level based on user's search radius
   * Maps search radius 25-300px to pyramid levels 0-4 for optimal tracking
   */
  private getOptimalPyramidLevel(searchRadius: number): number {
    // Enhanced mapping for better coverage:
    // 25-50px -> level 0 (fine details)
    // 51-100px -> level 1 (small motion)
    // 101-150px -> level 2 (medium motion)
    // 151-225px -> level 3 (large motion)
    // 226-300px -> level 4 (very large motion)
    
    if (searchRadius <= 50) return 0;
    if (searchRadius <= 100) return 1;
    if (searchRadius <= 150) return 2;
    if (searchRadius <= 225) return 3;
    return 4;
  }

  /**
   * Gets adaptive window size for a tracking point
   */
  private getAdaptiveWindowSize(point: TrackingPoint): { width: number; height: number } {
    const size = point.adaptiveWindowSize || this.options.winSize.width;
    return { width: size, height: size };
  }

  /**
   * Performs bidirectional tracking with consistency verification
   */
  private performBidirectionalTracking(
    activePoints: TrackingPoint[],
    prevGray: any,
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
    // Step 1: Forward tracking (prev → curr)
    const forwardResults = this.performAdaptiveTracking(
      activePoints,
      prevGray,
      currGray,
      frameCount,
      'forward'
    );

    // Step 2: Backward tracking (curr → prev) for consistency check
    const backwardResults = this.performConsistencyCheck(
      activePoints,
      forwardResults,
      currGray,
      prevGray,
      frameCount
    );

    // Step 3: Filter results based on bidirectional consistency
    const finalResults = this.filterByConsistency(
      activePoints,
      forwardResults,
      backwardResults,
      frameCount
    );

    return finalResults;
  }

  /**
   * Performs adaptive tracking with user-driven pyramid levels
   */
  private performAdaptiveTracking(
    activePoints: TrackingPoint[],
    prevGray: any,
    currGray: any,
    frameCount: number,
    direction: 'forward' | 'backward'  ): Array<{
    point: TrackingPoint;
    success: boolean;
    newX?: number;
    newY?: number;
    trackingError?: number;
    originalIndex: number;
  }> {
    const results: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
    }> = [];

    // Group points by their optimal pyramid level for batch processing
    const pointGroups = this.groupPointsByPyramidLevel(activePoints);

    this.logger.log(frameCount, `ADAPTIVE_TRACKING_${direction.toUpperCase()}`, {
      totalPoints: activePoints.length,
      pyramidGroups: Object.keys(pointGroups).map(level => ({
        level: parseInt(level),
        pointCount: pointGroups[parseInt(level)].length,
        avgSearchRadius: pointGroups[parseInt(level)].reduce((sum, p) => sum + p.point.searchRadius, 0) / pointGroups[parseInt(level)].length
      }))
    });

    // Process each pyramid level group
    for (const [levelStr, pointGroup] of Object.entries(pointGroups)) {
      const level = parseInt(levelStr);
      const groupResults = this.trackPointsAtLevel(
        pointGroup,
        prevGray,
        currGray,
        level,
        frameCount,
        direction
      );
      results.push(...groupResults);
    }

    return results;
  }

  /**
   * Groups points by their optimal pyramid level based on search radius
   */
  private groupPointsByPyramidLevel(activePoints: TrackingPoint[]): { [level: number]: Array<{ point: TrackingPoint; index: number }> } {
    const groups: { [level: number]: Array<{ point: TrackingPoint; index: number }> } = {};

    activePoints.forEach((point, index) => {
      const level = this.getOptimalPyramidLevel(point.searchRadius);
      if (!groups[level]) {
        groups[level] = [];
      }
      groups[level].push({ point, index });
    });

    return groups;
  }

  /**
   * Tracks a group of points at a specific pyramid level
   */
  private trackPointsAtLevel(
    pointGroup: Array<{ point: TrackingPoint; index: number }>,
    prevGray: any,
    currGray: any,
    maxLevel: number,
    frameCount: number,
    direction: string
  ): Array<{
    point: TrackingPoint;
    success: boolean;
    newX?: number;
    newY?: number;
    trackingError?: number;
    originalIndex: number;
  }> {
    if (pointGroup.length === 0) return [];

    let p0: any = null;
    let p1: any = null;
    let status: any = null;
    let err: any = null;

    try {
      // Create input matrices
      p0 = new this.cv.Mat(pointGroup.length, 1, this.cv.CV_32FC2);
      p1 = new this.cv.Mat(pointGroup.length, 1, this.cv.CV_32FC2);
      status = new this.cv.Mat(pointGroup.length, 1, this.cv.CV_8UC1);
      err = new this.cv.Mat(pointGroup.length, 1, this.cv.CV_32FC1);

      // Fill input points
      for (let i = 0; i < pointGroup.length; i++) {
        const point = pointGroup[i].point;
        p0.data32F[i * 2] = point.x;
        p0.data32F[i * 2 + 1] = point.y;
      }

      // Use adaptive window size (average for the group, or first point's window)
      const representativePoint = pointGroup[0].point;
      const windowSize = this.getAdaptiveWindowSize(representativePoint);
      const winSize = new this.cv.Size(windowSize.width, windowSize.height);

      const criteria = new this.cv.TermCriteria(
        this.options.criteria.type,
        this.options.criteria.maxCount,
        this.options.criteria.epsilon
      );

      this.logger.log(frameCount, `OPTICAL_FLOW_LEVEL_${maxLevel}`, {
        direction,
        pointCount: pointGroup.length,
        windowSize: `${windowSize.width}x${windowSize.height}`,
        maxLevel,
        avgSearchRadius: pointGroup.reduce((sum, p) => sum + p.point.searchRadius, 0) / pointGroup.length
      });

      // Perform optical flow at this pyramid level
      this.cv.calcOpticalFlowPyrLK(
        prevGray,
        currGray,
        p0,
        p1,
        status,
        err,
        winSize,
        maxLevel,
        criteria
      );

      // Process results
      const results: Array<{
        point: TrackingPoint;
        success: boolean;
        newX?: number;
        newY?: number;
        trackingError?: number;
        originalIndex: number;
      }> = [];

      for (let i = 0; i < pointGroup.length; i++) {
        const pointData = pointGroup[i];
        const isTracked = status.data8U ? status.data8U[i] === 1 : status.ucharAt(i, 0) === 1;
        const trackingError = err.data32F ? err.data32F[i] : err.floatAt(i, 0);
        const newX = p1.data32F ? p1.data32F[i * 2] : p1.floatAt(i, 0);
        const newY = p1.data32F ? p1.data32F[i * 2 + 1] : p1.floatAt(i, 1);

        // Check if position is valid
        const isPositionValid = !isNaN(newX) && !isNaN(newY) && 
                               newX >= 0 && newX < currGray.cols && 
                               newY >= 0 && newY < currGray.rows;

        results.push({
          point: pointData.point,
          success: isTracked && isPositionValid,
          newX: isPositionValid ? newX : undefined,
          newY: isPositionValid ? newY : undefined,
          trackingError,
          originalIndex: pointData.index
        });
      }

      return results;

    } catch (error) {
      this.logger.log(frameCount, `TRACKING_ERROR_LEVEL_${maxLevel}`, {
        direction,
        error: error.toString(),
        pointCount: pointGroup.length
      }, 'error');

      // Return failure results for all points in this group
      return pointGroup.map(pointData => ({
        point: pointData.point,
        success: false,
        originalIndex: pointData.index,
        trackingError: 999
      }));

    } finally {
      // Clean up matrices
      if (p0) p0.delete();
      if (p1) p1.delete();
      if (status) status.delete();
      if (err) err.delete();
    }
  }

  /**
   * Performs backward tracking for consistency verification
   */
  private performConsistencyCheck(
    originalPoints: TrackingPoint[],
    forwardResults: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
    }>,
    currGray: any,
    prevGray: any,
    frameCount: number
  ): Array<{
    point: TrackingPoint;
    success: boolean;
    newX?: number;
    newY?: number;
    trackingError?: number;
    originalIndex: number;
    backX?: number;
    backY?: number;
  }> {
    // Only perform backward tracking on successfully forward-tracked points
    const successfulForward = forwardResults.filter(r => r.success && r.newX !== undefined && r.newY !== undefined);
    
    if (successfulForward.length === 0) {
      return forwardResults.map(r => ({ ...r, backX: undefined, backY: undefined }));
    }

    // Create temporary points for backward tracking
    const tempPoints: TrackingPoint[] = successfulForward.map(result => ({
      ...result.point,
      x: result.newX!,
      y: result.newY!
    }));

    // Perform backward tracking
    const backwardResults = this.performAdaptiveTracking(
      tempPoints,
      currGray,
      prevGray,
      frameCount,
      'backward'
    );

    // Merge forward and backward results
    const mergedResults = forwardResults.map(forwardResult => {
      if (!forwardResult.success) {
        return { ...forwardResult, backX: undefined, backY: undefined };
      }

      const correspondingBackward = backwardResults.find(
        br => br.point.id === forwardResult.point.id
      );

      return {
        ...forwardResult,
        backX: correspondingBackward?.newX,
        backY: correspondingBackward?.newY
      };
    });

    return mergedResults;
  }

  /**
   * Filters tracking results based on bidirectional consistency
   */
  private filterByConsistency(
    originalPoints: TrackingPoint[],
    forwardResults: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
    }>,
    mergedResults: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
      backX?: number;
      backY?: number;
    }>,
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
    const consistencyThreshold = 2.0; // pixels

    const finalResults = mergedResults.map(result => {
      if (!result.success || result.newX === undefined || result.newY === undefined) {
        failureCount++;
        return {
          point: result.point,
          success: false,
          reason: 'forward_tracking_failed'
        };
      }

      // Check bidirectional consistency
      if (result.backX !== undefined && result.backY !== undefined) {
        const originalX = result.point.x;
        const originalY = result.point.y;
        const consistencyError = Math.sqrt(
          Math.pow(result.backX - originalX, 2) + 
          Math.pow(result.backY - originalY, 2)
        );

        if (consistencyError > consistencyThreshold) {
          failureCount++;
          this.logger.log(frameCount, 'CONSISTENCY_FAILURE', {
            pointId: result.point.id.substring(0, 6),
            originalPos: { x: originalX, y: originalY },
            forwardPos: { x: result.newX, y: result.newY },
            backwardPos: { x: result.backX, y: result.backY },
            consistencyError: Math.round(consistencyError * 100) / 100,
            threshold: consistencyThreshold
          });

          return {
            point: result.point,
            success: false,
            reason: 'bidirectional_inconsistency'
          };
        }
      }

      // Apply user's search radius validation with enhanced limits
      const distance = Math.sqrt(
        Math.pow(result.newX - result.point.x, 2) + 
        Math.pow(result.newY - result.point.y, 2)
      );

      const maxAllowedMovement = result.point.searchRadius * 0.85; // Allow 85% of user's setting

      if (distance > maxAllowedMovement) {
        failureCount++;
        return {
          point: result.point,
          success: false,
          reason: 'movement_too_large'
        };
      }

      successCount++;
      return {
        point: result.point,
        success: true,
        newX: result.newX,
        newY: result.newY,
        trackingError: result.trackingError
      };
    });

    this.logger.log(frameCount, 'BIDIRECTIONAL_RESULTS', {
      totalProcessed: mergedResults.length,
      successCount,
      failureCount,
      consistencyThreshold,
      avgSearchRadius: originalPoints.reduce((sum, p) => sum + p.searchRadius, 0) / originalPoints.length    });

    return {
      successCount,
      failureCount,
      deactivationCount: 0,
      results: finalResults
    };
  }

  /**
   * Forces tracking to happen for all active points (used in continuous tracking mode)
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
