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
   */
  createTrackingPoint(x: number, y: number, frameCount: number): TrackingPoint {
    const pointId = `point_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPoint: TrackingPoint = {
      id: pointId,
      x,
      y,
      confidence: 1.0,
      isActive: true,
      trajectory: [{ x, y, frame: frameCount }],
      searchRadius: 100,
      manualPositions: new Map(),
      trackedPositions: new Map(),
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
   * Sets the position for a point at a specific frame (manual or tracked - doesn't matter)
   * This is the ONLY way positions should be stored - one position per frame
   */
  setPositionAtFrame(point: TrackingPoint, x: number, y: number, frame: number, source: 'manual' | 'tracked'): void {
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
      source,
      totalPositions: point.framePositions.size
    });
  }
  /**
   * Gets the position for a point at a specific frame
   * Rule: Use exact frame data if available, otherwise use most recent data from before that frame
   */
  getPositionAtFrame(point: TrackingPoint, frame: number): { x: number; y: number } {
    // Check if we have exact data for this frame
    const exactPosition = point.framePositions.get(frame);
    if (exactPosition) {
      this.logger.log(frame, 'POSITION_EXACT_MATCH', {
        pointId: point.id.substring(0, 6),
        frame,
        position: exactPosition,
        source: 'exact'
      });
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
      const position = point.framePositions.get(mostRecentFrame)!;
      this.logger.log(frame, 'POSITION_FALLBACK', {
        pointId: point.id.substring(0, 6),
        frame,
        position,
        source: 'fallback',
        fallbackFrame: mostRecentFrame,
        totalFramePositions: point.framePositions.size
      });
      return position;
    }
    
    // Last resort: use current point position
    const currentPos = { x: point.x, y: point.y };
    this.logger.log(frame, 'POSITION_CURRENT_FALLBACK', {
      pointId: point.id.substring(0, 6),
      frame,
      position: currentPos,
      source: 'current_fallback',
      totalFramePositions: point.framePositions.size
    });
    return currentPos;
  }

  /**
   * Updates a point's current visual position to match the authoritative position for the given frame
   * This should be called when scrubbing between frames
   */
  syncPointToFrame(point: TrackingPoint, frame: number): void {
    const framePosition = this.getPositionAtFrame(point, frame);
    
    // Only update if position actually changed
    if (Math.abs(point.x - framePosition.x) > 0.01 || Math.abs(point.y - framePosition.y) > 0.01) {
      point.x = framePosition.x;
      point.y = framePosition.y;
      
      this.logger.log(frame, 'POINT_SYNCED_TO_FRAME', {
        pointId: point.id.substring(0, 6),
        frame,
        position: { x: Math.round(framePosition.x * 100) / 100, y: Math.round(framePosition.y * 100) / 100 }
      });
    }
  }

  /**
   * Syncs all points to their positions for the given frame
   */
  syncAllPointsToFrame(points: TrackingPoint[], frame: number): void {
    points.forEach(point => {
      this.syncPointToFrame(point, frame);
    });
  }  /**
   * Updates point position based on successful tracking
   */
  updateTrackedPosition(
    point: TrackingPoint,
    newX: number,
    newY: number,
    frameCount: number,
    trackingError: number
  ): void {
    // Store the new tracked position - this overwrites any existing position for this frame
    this.setPositionAtFrame(point, newX, newY, frameCount, 'tracked');
    
    // Increase confidence for successful tracking
    point.confidence = Math.min(1.0, point.confidence + 0.1);
    
    this.logger.log(frameCount, 'POINT_TRACKED_SUCCESS', {
      pointId: point.id.substring(0, 6),
      newX: Math.round(newX * 100) / 100,
      newY: Math.round(newY * 100) / 100,
      confidence: Math.round(point.confidence * 1000) / 1000,
      trackingError: Math.round(trackingError * 100) / 100
    });
  }

  /**
   * Handles tracking failure by adjusting confidence
   */
  handleTrackingFailure(
    point: TrackingPoint,
    frameCount: number,
    reason: string,
    wasRecentlyManual: boolean
  ): boolean {
    const oldConfidence = point.confidence;
    
    // Be more lenient with recently manually positioned points
    const confidenceReduction = wasRecentlyManual ? 0.9 : 0.75; // Less aggressive for manual points
    point.confidence *= confidenceReduction;
    
    this.logger.log(frameCount, 'POINT_TRACKING_FAILED', {
      pointId: point.id.substring(0, 6),
      reason,
      wasRecentlyManual,
      confidenceReduction,
      oldConfidence: Math.round(oldConfidence * 1000) / 1000,
      newConfidence: Math.round(point.confidence * 1000) / 1000,
      intelligentCriteria: true
    }, 'warn');
    
    // Deactivate with different thresholds based on context
    const deactivationThreshold = wasRecentlyManual ? 0.05 : 0.1; // More lenient for manual points
    if (point.confidence < deactivationThreshold) {
      point.isActive = false;
      this.logger.log(frameCount, 'POINT_DEACTIVATED', {
        pointId: point.id.substring(0, 6),
        reason: wasRecentlyManual ? 'confidence_too_low_after_manual_move' : 'confidence_too_low_intelligent',
        finalConfidence: point.confidence,
        deactivationThreshold,
        wasRecentlyManual
      }, 'warn');
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
   * Manually moves a point to a new position
   */
  movePointToPosition(point: TrackingPoint, x: number, y: number, frameCount: number): void {
    // Use the new unified position setting method
    this.setPositionAtFrame(point, x, y, frameCount, 'manual');
    
    // Mark as recently manually moved
    point.lastManualMoveFrame = frameCount;
    
    // Boost confidence when manually positioned
    point.confidence = Math.min(1.0, point.confidence + 0.2);
    point.isActive = true; // Reactivate if inactive

    this.logger.log(frameCount, 'POINT_MANUALLY_MOVED', {
      pointId: point.id.substring(0, 6),
      newX: Math.round(x * 100) / 100,
      newY: Math.round(y * 100) / 100,
      newConfidence: Math.round(point.confidence * 1000) / 1000,
      reactivated: true,
      markedFrame: frameCount
    });
  }

  /**
   * Updates a point's position from manual movement
   */  updateManualPosition(
    point: TrackingPoint, 
    newX: number, 
    newY: number, 
    frameCount: number
  ): void {
    // Store the new manual position - this overwrites any existing position for this frame
    this.setPositionAtFrame(point, newX, newY, frameCount, 'manual');
    
    // IMPORTANT: Update the point's current position to match the manual position
    point.x = newX;
    point.y = newY;
    
    // Fully reactivate point when manually positioned
    point.confidence = 1.0;
    point.isActive = true;
    point.lastManualMoveFrame = frameCount;
    
    this.logger.log(frameCount, 'POINT_MANUALLY_MOVED', {
      pointId: point.id.substring(0, 6),
      newX: Math.round(newX * 100) / 100,
      newY: Math.round(newY * 100) / 100,
      frame: frameCount,
      confidence: point.confidence,
      updatedPointPosition: true
    });
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
  }

  /**
   * Gets points with their positions for a specific frame
   */
  getPointsAtFrame(
    points: TrackingPoint[], 
    frame: number
  ): Array<TrackingPoint & { framePosition?: { x: number; y: number } }> {
    return points.map(point => ({
      ...point,
      framePosition: this.getPositionAtFrame(point, frame)
    }));  }
}
