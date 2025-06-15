import { TrackingPoint } from './TrackingTypes';

export class TrajectoryManager {  createTrackingPoint(x: number, y: number, frameCount: number): TrackingPoint {
    const pointId = `point_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPoint: TrackingPoint = {
      id: pointId,
      x,
      y,
      confidence: 1.0,
      isActive: true,
      trajectory: [{ x, y, frame: frameCount }],
      searchRadius: 100,
      framePositions: new Map([[frameCount, { x, y }]]),
      adaptiveWindowSize: 22
    };

    return newPoint;
  }  setPositionAtFrame(point: TrackingPoint, x: number, y: number, frame: number): void {
    point.framePositions.set(frame, { x, y });
    
    point.x = x;
    point.y = y;
    
    const existingFrameIndex = point.trajectory.findIndex(t => t.frame === frame);
    if (existingFrameIndex !== -1) {
      point.trajectory[existingFrameIndex] = { x, y, frame };
    } else {
      point.trajectory.push({ x, y, frame });
    }
    
    if (point.trajectory.length > 100) {
      point.trajectory.shift();
    }
  }  getPositionAtFrame(point: TrackingPoint, frame: number): { x: number; y: number } {
    const exactPosition = point.framePositions.get(frame);
    if (exactPosition) {
      return exactPosition;
    }
    
    let mostRecentFrame = -1;
    for (const [f] of point.framePositions) {
      if (f < frame && f > mostRecentFrame) {
        mostRecentFrame = f;
      }
    }
    
    if (mostRecentFrame >= 0) {
      return point.framePositions.get(mostRecentFrame)!;
    }
    
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
  }  syncPointToFrame(point: TrackingPoint, frame: number): void {
    const storedPosition = this.getPositionAtFrame(point, frame);
    point.x = storedPosition.x;
    point.y = storedPosition.y;
  }
  updateTrackedPosition(
    point: TrackingPoint,
    newX: number,
    newY: number,
    frameCount: number,
    trackingError: number
  ): void {
    this.setPositionAtFrame(point, newX, newY, frameCount);
    point.confidence = Math.min(1.0, point.confidence + 0.1);
  }  handleTrackingFailure(
    point: TrackingPoint,
    frameCount: number,
    reason: string
  ): boolean {
    point.confidence *= 0.75;
    
    if (point.confidence < 0.1) {
      point.isActive = false;
      return true;
    }
    
    return false;
  }  updateSearchRadius(point: TrackingPoint, radius: number): void {
    point.searchRadius = Math.max(25, Math.min(300, radius));
    point.adaptiveWindowSize = Math.max(9, Math.min(41, Math.round(radius * 0.22)));
  }  updateManualPosition(
    point: TrackingPoint, 
    newX: number, 
    newY: number, 
    frameCount: number
  ): void {
    this.setPositionAtFrame(point, newX, newY, frameCount);
    point.confidence = 1.0;
    point.isActive = true;
  }
  reactivatePoints(points: TrackingPoint[], frameCount: number): number {
    let reactivatedCount = 0;
    points.forEach((point) => {
      if (!point.isActive && point.confidence > 0.02) {
        point.confidence = Math.max(0.3, point.confidence * 2);
        point.isActive = true;
        reactivatedCount++;
      }
    });

    return reactivatedCount;
  }  getTrajectoryPaths(
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
      
      const startFrame = Math.max(0, currentFrame - range);
      const endFrame = currentFrame + range;
      
      for (let frame = startFrame; frame <= endFrame; frame++) {
        if (point.framePositions.has(frame)) {
          const position = point.framePositions.get(frame)!;
          path.push({
            x: position.x,
            y: position.y,
            frame: frame
          });
        }
      }
      
      path.sort((a, b) => a.frame - b.frame);
      
      if (path.length > 0) {
        trajectories.push({
          pointId: point.id,
          path: path
        });
      }
    });

    return trajectories;
  }  syncAllPointsToFrame(points: TrackingPoint[], frame: number): void {
    points.forEach(point => {
      this.syncPointToFrame(point, frame);
    });
  }
}
