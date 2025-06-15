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
      trajectory: [{ x, y, frame: frameCount }],      searchRadius: 100,
      // Store the initial position
      framePositions: new Map([[frameCount, { x, y }]]),
      // Initialize adaptive window size
      adaptiveWindowSize: 22 // Default for 100px search radius
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
  }  /**
   * Gets the position for a point at a specific frame (for scrubbing display)
   * Rule: Use exact frame data if available, otherwise prefer previous frames, then future frames
   */
  getPositionAtFrame(point: TrackingPoint, frame: number): { x: number; y: number } {
    // Check if we have exact data for this frame
    const exactPosition = point.framePositions.get(frame);
    if (exactPosition) {
      return exactPosition;
    }
    
    // Find the most recent frame before this one that has data (prefer previous)
    let mostRecentFrame = -1;
    for (const [f] of point.framePositions) {
      if (f < frame && f > mostRecentFrame) {
        mostRecentFrame = f;
      }
    }
    
    if (mostRecentFrame >= 0) {
      return point.framePositions.get(mostRecentFrame)!;
    }
    
    // If no previous frames, look for the nearest future frame (for frame 0 case)
    let nearestFutureFrame = Number.MAX_SAFE_INTEGER;
    for (const [f] of point.framePositions) {
      if (f > frame && f < nearestFutureFrame) {
        nearestFutureFrame = f;
      }
    }
    
    if (nearestFutureFrame < Number.MAX_SAFE_INTEGER) {
      return point.framePositions.get(nearestFutureFrame)!;
    }
    
    // Final fallback to current point position
    return { x: point.x, y: point.y };
  }  /**
   * Updates a point's current visual position to match stored position for the given frame (scrubbing only)
   * Always updates to show stored position for frame (or most recent previous frame)
   */
  syncPointToFrame(point: TrackingPoint, frame: number): void {
    // Get the stored position for this frame (exact, previous, or future fallback)
    const storedPosition = this.getPositionAtFrame(point, frame);
    const hadExactData = point.framePositions.has(frame);
    
    // Determine fallback type for better debugging
    let fallbackType = 'EXACT';
    if (!hadExactData) {
      // Check if we used previous or future fallback
      const hasPreviousData = Array.from(point.framePositions.keys()).some(f => f < frame);
      fallbackType = hasPreviousData ? 'PREVIOUS' : 'FUTURE';
    }
    
    // Enhanced logging for debugging scrubbing issues, especially at frame 0
    const positionChanged = point.x !== storedPosition.x || point.y !== storedPosition.y;
    if (positionChanged && (frame % 10 === 0 || frame === 0 || frame === 1)) {
      console.log(`Point ${point.id.substring(0, 6)} sync frame ${frame}: (${Math.round(point.x)},${Math.round(point.y)}) → (${Math.round(storedPosition.x)},${Math.round(storedPosition.y)}) [${fallbackType}]`);
      
      // For frame 0, show additional debug info
      if (frame === 0) {
        const availableFrames = Array.from(point.framePositions.keys()).sort((a,b) => a-b);
        console.log(`  Frame 0 debug - Available frames: [${availableFrames.slice(0,5).join(',')}${availableFrames.length > 5 ? '...' : ''}] (${availableFrames.length} total)`);
      }
    }
    
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
    point.searchRadius = Math.max(25, Math.min(300, radius));
    // Calculate adaptive window size based on search radius
    point.adaptiveWindowSize = Math.max(9, Math.min(41, Math.round(radius * 0.22)));
  }/**
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
    // Log sync operation for controlled synchronization debugging
    const pointsWithData = points.filter(p => p.framePositions.has(frame));
    const pointsWithoutData = points.filter(p => !p.framePositions.has(frame));
    
    // Only log every 10th frame during continuous sync to reduce noise
    if (frame % 10 === 0 && (pointsWithData.length > 0 || pointsWithoutData.length > 0)) {
      console.log(`CONTROLLED SYNC Frame ${frame}: ${pointsWithData.length}/${points.length} points have exact data`);
    }
    
    points.forEach(point => {
      this.syncPointToFrame(point, frame);
    });
  }
}
