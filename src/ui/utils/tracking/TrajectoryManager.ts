import { TrackingPoint } from './TrackingTypes';
import { MinimalDebugger } from './MinimalDebugger';

/**
 * TrajectoryManager handles point management and position tracking.
 * Simple rule: ONE position per point per frame.
 */
export class TrajectoryManager {
  private logger: MinimalDebugger;

  constructor(logger: MinimalDebugger) {
    this.logger = logger;
  }
  /**
   * Creates a new tracking point with default settings
   */  createTrackingPoint(x: number, y: number, frameCount: number): TrackingPoint {
    const pointId = `point_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPoint: TrackingPoint = {
      id: pointId,
      x,
      y,
      confidence: 1.0,
      isActive: true,
      trajectory: [{ x, y, frame: frameCount }],
      searchRadius: 100,
      // Store the initial position
      framePositions: new Map([[frameCount, { x, y }]])
    };

    this.logger.log(frameCount, 'CREATE_TRACKING_POINT', { 
      pointId: pointId.substring(0, 12), 
      x, 
      y,
      frame: frameCount
    });

    return newPoint;
  }  /**
   * Sets the position for a point at a specific frame
   * This is the ONLY way positions should be stored - one position per frame
   */
  setPositionAtFrame(point: TrackingPoint, x: number, y: number, frame: number): void {
    // Store the position for this frame - overwrites any existing position
    point.framePositions.set(frame, { x, y });
    
    // Update point's current visual position
    point.x = x;
    point.y = y;
    
    // Update trajectory (keep for visualization)
    const existingFrameIndex = point.trajectory.findIndex(t => t.frame === frame);
    if (existingFrameIndex !== -1) {
      point.trajectory[existingFrameIndex] = { x, y, frame };
    } else {
      point.trajectory.push({ x, y, frame });
    }
    
    // Keep trajectory manageable
    if (point.trajectory.length > 100) {
      point.trajectory.shift();
    }
    
    this.logger.log(frame, 'POSITION_SET', {
      pointId: point.id.substring(0, 6),
      frame,
      position: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 },
      visualPosition: { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 },
      totalPositions: point.framePositions.size,
      isOverwrite: point.framePositions.has(frame)
    });
  }/**
   * Gets the position for a point at a specific frame (for scrubbing display)
   * Simple rule: Use exact frame data if available, otherwise use most recent previous frame
   */
  getPositionAtFrame(point: TrackingPoint, frame: number): { x: number; y: number } {
    // Check if we have exact data for this frame
    const exactPosition = point.framePositions.get(frame);
    if (exactPosition) {
      return exactPosition;
    }
    
    // Find the most recent frame before this one that has data
    let mostRecentFrame = -1;
    for (const [f] of point.framePositions) {
      if (f < frame && f > mostRecentFrame) {
        mostRecentFrame = f;
      }
    }
    
    if (mostRecentFrame >= 0) {
      return point.framePositions.get(mostRecentFrame)!;
    }
    
    // Fallback to current point position
    return { x: point.x, y: point.y };
  }  /**
   * Updates a point's current visual position to match stored position for the given frame (scrubbing only)
   * Always updates to show stored position for frame (or most recent previous frame)
   */
  syncPointToFrame(point: TrackingPoint, frame: number): void {
    // Get the stored position for this frame (exact or most recent previous)
    const storedPosition = this.getPositionAtFrame(point, frame);
    
    // Removed sync detail logs to reduce noise - tracking logs will show positions
    
    // Always update visual position to match stored position during scrubbing
    point.x = storedPosition.x;
    point.y = storedPosition.y;
  }

  /**
   * Syncs all points to their positions for the given frame (scrubbing only)
   */  /**
   * Updates point position after successful tracking
   */
  updateTrackedPosition(
    point: TrackingPoint,
    newX: number,
    newY: number,
    frameCount: number,
    trackingError: number
  ): void {
    // Store the new tracked position for this frame
    this.setPositionAtFrame(point, newX, newY, frameCount);
    
    // Increase confidence for successful tracking
    point.confidence = Math.min(1.0, point.confidence + 0.1);
  }  /**
   * Handles tracking failure by adjusting confidence
   */
  handleTrackingFailure(
    point: TrackingPoint,
    frameCount: number,
    reason: string
  ): boolean {
    // Standard confidence reduction
    point.confidence *= 0.75;
    
    // Standard deactivation threshold
    if (point.confidence < 0.1) {
      point.isActive = false;
      return true; // Point was deactivated
    }
    
    return false; // Point is still active
  }

  /**
   * Updates a point's search radius within bounds
   */
  updateSearchRadius(point: TrackingPoint, radius: number): void {
    point.searchRadius = Math.max(25, Math.min(140, radius));
  }  /**
   * Updates a point's position from manual movement
   */
  updateManualPosition(
    point: TrackingPoint, 
    newX: number, 
    newY: number, 
    frameCount: number
  ): void {
    // Store the new manual position for this frame and update visual position
    this.setPositionAtFrame(point, newX, newY, frameCount);
    
    // Fully reactivate point when manually positioned
    point.confidence = 1.0;
    point.isActive = true;
  }

  /**
   * Reactivates inactive points with low confidence threshold
   */
  reactivatePoints(points: TrackingPoint[], frameCount: number): number {
    let reactivatedCount = 0;
    points.forEach((point) => {
      if (!point.isActive && point.confidence > 0.02) { // Lower threshold
        point.confidence = Math.max(0.3, point.confidence * 2); // Better starting confidence
        point.isActive = true;
        reactivatedCount++;
        this.logger.log(frameCount, 'POINT_REACTIVATED', {
          pointId: point.id.substring(0, 6),
          newConfidence: point.confidence
        }, 'info');
      }
    });
    
    if (reactivatedCount > 0) {
      this.logger.log(frameCount, 'REACTIVATION_SUMMARY', {
        reactivatedCount,
        totalPoints: points.length,
        activeAfter: points.filter(p => p.isActive).length
      });
    }

    return reactivatedCount;
  }
  /**
   * Gets trajectory paths for visualization
   */
  getTrajectoryPaths(
    points: TrackingPoint[],
    currentFrame: number, 
    range: number = 5
  ): Array<{
    pointId: string;
    path: Array<{ x: number; y: number; frame: number }>;
  }> {
    const trajectories: Array<{
      pointId: string;
      path: Array<{ x: number; y: number; frame: number }>;
    }> = [];

    points.forEach(point => {
      const path: Array<{ x: number; y: number; frame: number }> = [];
      
      // Collect positions from framePositions within the range
      const startFrame = Math.max(0, currentFrame - range);
      const endFrame = currentFrame + range;
      
      for (let frame = startFrame; frame <= endFrame; frame++) {
        // Only add if we have a position for this frame
        if (point.framePositions.has(frame)) {
          const position = point.framePositions.get(frame)!;          path.push({
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
  }  /**
   * Syncs all points to their positions for the given frame (used for scrubbing)
   */
  syncAllPointsToFrame(points: TrackingPoint[], frame: number): void {
    // Removed scrubbing sync logs to reduce noise - tracking logs will show positions
    
    points.forEach(point => {
      this.syncPointToFrame(point, frame);
    });
  }
}
