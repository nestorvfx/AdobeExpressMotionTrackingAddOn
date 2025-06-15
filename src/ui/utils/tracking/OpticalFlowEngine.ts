import { TrackingPoint, TrackingOptions } from './TrackingTypes';

export class OpticalFlowEngine {
  private cv: any = null;
  private options: TrackingOptions;

  constructor(cv: any, options: TrackingOptions) {
    this.cv = cv;
    this.options = options;
  }

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
      originalIndex: number;
    }>;
  } {
    if (!this.cv || activePoints.length === 0) {
      return { 
        successCount: 0, 
        failureCount: 0, 
        deactivationCount: 0,
        results: []
      };
    }

    if (isContinuousTracking) {
      this.forcePointTracking(activePoints, frameCount);
    }

    return this.performBidirectionalTracking(
      activePoints,
      prevGray,
      currGray,
      frameCount
    );
  }

  private getOptimalPyramidLevel(searchRadius: number): number {
    if (searchRadius < 40) return 1;
    if (searchRadius < 80) return 2;
    if (searchRadius < 150) return 3;
    return Math.min(4, this.options.maxLevel);
  }

  private getAdaptiveWindowSize(point: TrackingPoint): { width: number; height: number } {
    const size = point.adaptiveWindowSize || this.options.winSize.width;
    return { width: size, height: size };
  }

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
      originalIndex: number;
    }>;
  } {
    const forwardResults = this.performAdaptiveTracking(
      activePoints,
      prevGray,
      currGray,
      frameCount,
      'forward'
    );

    const backwardResults = this.performAdaptiveTracking(
      forwardResults.filter(r => r.success).map(r => ({
        ...r.point,
        x: r.newX!,
        y: r.newY!
      })),
      currGray,
      prevGray,
      frameCount,
      'backward'
    );

    const mergedResults = this.mergeTrackingResults(forwardResults, backwardResults, activePoints, frameCount);
    
    let successCount = 0;
    let failureCount = 0;
    let deactivationCount = 0;

    mergedResults.forEach(result => {
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        if (!result.point.isActive) {
          deactivationCount++;
        }
      }
    });

    return { 
      successCount, 
      failureCount, 
      deactivationCount,
      results: mergedResults
    };
  }

  private performAdaptiveTracking(
    activePoints: TrackingPoint[],
    prevGray: any,
    currGray: any,
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
    const results: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
    }> = [];

    const pointGroups = this.groupPointsByPyramidLevel(activePoints);

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
    const results: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
    }> = [];

    if (pointGroup.length === 0) {
      return results;
    }

    const prevPts = new this.cv.Mat(pointGroup.length, 1, this.cv.CV_32FC2);
    const nextPts = new this.cv.Mat();
    const status = new this.cv.Mat();
    const error = new this.cv.Mat();

    try {
      pointGroup.forEach(({ point }, idx) => {
        prevPts.data32F[idx * 2] = point.x;
        prevPts.data32F[idx * 2 + 1] = point.y;
      });

      this.cv.calcOpticalFlowPyrLK(
        prevGray,
        currGray,
        prevPts,
        nextPts,
        status,
        error,
        this.options.winSize,
        maxLevel,
        this.options.criteria,
        0,
        this.options.minEigThreshold
      );

      pointGroup.forEach(({ point, index }, idx) => {
        const isTracked = status.data[idx] === 1;
        const trackingError = error.data32F[idx];
        
        if (isTracked) {
          const newX = nextPts.data32F[idx * 2];
          const newY = nextPts.data32F[idx * 2 + 1];
          
          results.push({
            point,
            success: true,
            newX,
            newY,
            trackingError,
            originalIndex: index
          });
        } else {
          results.push({
            point,
            success: false,
            trackingError,
            originalIndex: index
          });
        }
      });

    } catch (error) {
      pointGroup.forEach(({ point, index }) => {
        results.push({
          point,
          success: false,
          originalIndex: index
        });
      });
    } finally {
      prevPts.delete();
      nextPts.delete();
      status.delete();
      error.delete();
    }

    return results;
  }

  private mergeTrackingResults(
    forwardResults: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
    }>,
    backwardResults: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
    }>,
    originalPoints: TrackingPoint[],
    frameCount: number
  ) {
    const mergedResults: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      originalIndex: number;
    }> = [];

    forwardResults.forEach(forwardResult => {
      if (!forwardResult.success) {
        mergedResults.push(forwardResult);
        return;
      }

      const correspondingBackward = backwardResults.find(
        br => br.originalIndex === forwardResult.originalIndex
      );

      if (!correspondingBackward || !correspondingBackward.success) {
        mergedResults.push({
          ...forwardResult,
          success: false
        });
        return;
      }

      const originalX = originalPoints[forwardResult.originalIndex].x;
      const originalY = originalPoints[forwardResult.originalIndex].y;
      const backX = correspondingBackward.newX!;
      const backY = correspondingBackward.newY!;

      const consistencyError = Math.sqrt(
        Math.pow(originalX - backX, 2) + Math.pow(originalY - backY, 2)
      );
      
      const consistencyThreshold = Math.min(
        originalPoints[forwardResult.originalIndex].searchRadius * 0.15,
        8.0
      );

      if (consistencyError > consistencyThreshold) {
        mergedResults.push({
          ...forwardResult,
          success: false
        });
      } else {
        mergedResults.push(forwardResult);
      }
    });

    return mergedResults;
  }

  private forcePointTracking(activePoints: TrackingPoint[], frameCount: number): void {
    activePoints.forEach(point => {
      if (point.searchRadius < 50) {
        point.searchRadius = Math.min(point.searchRadius * 1.2, 100);
      }
      point.adaptiveWindowSize = Math.max(15, Math.min(35, Math.round(point.searchRadius * 0.25)));
    });
  }
}