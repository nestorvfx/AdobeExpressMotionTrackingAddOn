// Position authority system - exact implementation from original

import { TrackingPoint, Position } from './TrackingTypes';
import { MinimalDebugger } from './MinimalDebugger';

export class PositionAuthority {
  private logger: MinimalDebugger;

  constructor(logger: MinimalDebugger) {
    this.logger = logger;
  }

  /**
   * Get authoritative position for a point at specific frame (exactly as original)
   * Manual positions always take precedence over tracked positions
   */
  getPointPositionAtFrame(point: TrackingPoint, frame: number): Position {
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
    
    // IMPROVED FALLBACK: Find nearest available position instead of using stale point.x, point.y
    // This fixes the coordinate system desynchronization issue
    
    // First try to find the nearest tracked position
    let nearestTrackedPos = this.findNearestTrackedPosition(point, frame);
    if (nearestTrackedPos) {
      this.logger.log(frame, 'FALLBACK_NEAREST_TRACKED', {
        pointId: point.id.substring(0, 6),
        requestedFrame: frame,
        foundFrame: nearestTrackedPos.frame,
        position: nearestTrackedPos.position,
        authority: 'nearest_tracked'
      });
      return nearestTrackedPos.position;
    }
    
    // Try to find the nearest manual position
    let nearestManualPos = this.findNearestManualPosition(point, frame);
    if (nearestManualPos) {
      this.logger.log(frame, 'FALLBACK_NEAREST_MANUAL', {
        pointId: point.id.substring(0, 6),
        requestedFrame: frame,
        foundFrame: nearestManualPos.frame,
        position: nearestManualPos.position,
        authority: 'nearest_manual'
      });
      return nearestManualPos.position;
    }
    
    // Last resort: use current point position but log this as a potential issue
    this.logger.log(frame, 'FALLBACK_CURRENT_POSITION', {
      pointId: point.id.substring(0, 6),
      requestedFrame: frame,
      position: { x: point.x, y: point.y },
      authority: 'current_position_fallback',
      warning: 'no_tracked_or_manual_data_available'
    }, 'warn');
    
    return { x: point.x, y: point.y };
  }

  /**
   * Set manual position for a point (exactly as original)
   */
  setManualPosition(point: TrackingPoint, x: number, y: number, frame: number): void {
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
      pointId: point.id.substring(0, 6),
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

  /**
   * Set tracked position for a point (exactly as original)
   */
  setTrackedPosition(point: TrackingPoint, x: number, y: number, frame: number, currentFrame: number): void {
    const oldPos = { x: point.x, y: point.y };
    
    // Only set tracked position if no manual position exists for this frame
    if (!point.manualPositions.has(frame)) {
      point.trackedPositions.set(frame, { x, y });
      
      // Update current position ONLY if this is for the current frame to maintain coordinate sync
      if (frame === currentFrame) {
        point.x = x;
        point.y = y;
      }
      
      // Calculate movement distance
      const distance = Math.sqrt(Math.pow(x - oldPos.x, 2) + Math.pow(y - oldPos.y, 2));
      
      this.logger.log(frame, 'TRACKED_POSITION_SET', {
        pointId: point.id.substring(0, 6),
        frame,
        position: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 },
        oldPosition: { x: Math.round(oldPos.x * 100) / 100, y: Math.round(oldPos.y * 100) / 100 },
        distance: Math.round(distance * 100) / 100,
        authority: 'tracked',
        coordinateUpdated: frame === currentFrame,
        manualOverridesCount: point.manualPositions.size,
        trackedPositionsCount: point.trackedPositions.size
      });
    } else {
      this.logger.log(frame, 'TRACKED_POSITION_SKIPPED', {
        pointId: point.id.substring(0, 6),
        frame,
        reason: 'manual_override_exists',
        manualPosition: point.manualPositions.get(frame),
        attemptedTrackedPosition: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }
      });
    }
  }

  /**
   * Check if point was recently manually moved (exactly as original)
   */
  wasRecentlyManuallyMoved(point: TrackingPoint, currentFrame: number, frameThreshold: number = 2): boolean {
    return point.lastManualMoveFrame !== undefined && 
           (currentFrame - point.lastManualMoveFrame) <= frameThreshold;
  }

  /**
   * Find nearest tracked position (exactly as original)
   */
  private findNearestTrackedPosition(point: TrackingPoint, targetFrame: number): { frame: number; position: Position } | null {
    let nearestFrame = -1;
    let minDistance = Infinity;
    
    for (const [frame] of point.trackedPositions) {
      const distance = Math.abs(frame - targetFrame);
      if (distance < minDistance) {
        minDistance = distance;
        nearestFrame = frame;
      }
    }
    
    if (nearestFrame >= 0) {
      const position = point.trackedPositions.get(nearestFrame)!;
      return { frame: nearestFrame, position };
    }
    
    return null;
  }

  /**
   * Find nearest manual position (exactly as original)
   */
  private findNearestManualPosition(point: TrackingPoint, targetFrame: number): { frame: number; position: Position } | null {
    let nearestFrame = -1;
    let minDistance = Infinity;
    
    for (const [frame] of point.manualPositions) {
      const distance = Math.abs(frame - targetFrame);
      if (distance < minDistance) {
        minDistance = distance;
        nearestFrame = frame;
      }
    }
    
    if (nearestFrame >= 0) {
      const position = point.manualPositions.get(nearestFrame)!;
      return { frame: nearestFrame, position };
    }
    
    return null;
  }
}
