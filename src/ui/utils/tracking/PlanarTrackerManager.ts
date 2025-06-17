import { PlanarTracker, PlanarCorner, TrackingPoint, Position, HomographyData } from './TrackingTypes';

export class PlanarTrackerManager {
  private cv: any = null;

  constructor(cv?: any) {
    this.cv = cv;
  }

  setOpenCV(cv: any): void {
    this.cv = cv;
  }

  /**
   * Create a new planar tracker at the specified position
   */
  createPlanarTracker(
    centerX: number, 
    centerY: number, 
    videoWidth: number, 
    videoHeight: number, 
    color: string,
    frameCount: number
  ): PlanarTracker {
    const trackerId = `planar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate square size as 20% of smaller dimension
    const size = Math.min(videoWidth, videoHeight) * 0.2;
    const halfSize = size / 2;

    // Create 4 corners as a square centered at click position
    const corners: [PlanarCorner, PlanarCorner, PlanarCorner, PlanarCorner] = [
      { // Top-left
        id: `${trackerId}_tl`,
        x: centerX - halfSize,
        y: centerY - halfSize,
        isActive: true
      },
      { // Top-right
        id: `${trackerId}_tr`,
        x: centerX + halfSize,
        y: centerY - halfSize,
        isActive: true
      },
      { // Bottom-right
        id: `${trackerId}_br`,
        x: centerX + halfSize,
        y: centerY + halfSize,
        isActive: true
      },
      { // Bottom-left
        id: `${trackerId}_bl`,
        x: centerX - halfSize,
        y: centerY + halfSize,
        isActive: true
      }
    ];

    const planarTracker: PlanarTracker = {
      id: trackerId,
      corners,
      center: { x: centerX, y: centerY },
      width: size,
      height: size,
      color,
      isActive: true,
      confidence: 1.0,
      homographyMatrix: null,
      featurePoints: [],
      frameHomographies: new Map(),
      trajectory: [{
        center: { x: centerX, y: centerY },
        corners: corners.map(c => ({ x: c.x, y: c.y })),
        frame: frameCount
      }]
    };

    return planarTracker;
  }

  /**
   * Generate feature points within the planar tracker region
   */
  generateFeaturePoints(planarTracker: PlanarTracker, frameCount: number): TrackingPoint[] {
    const { corners } = planarTracker;
    const featurePoints: TrackingPoint[] = [];
    
    // Create a 3x4 grid of feature points within the quadrilateral
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const u = (col + 1) / 5; // Normalized position (0.2, 0.4, 0.6, 0.8)
        const v = (row + 1) / 4; // Normalized position (0.25, 0.5, 0.75)
        
        // Bilinear interpolation within the quadrilateral
        const topX = corners[0].x + u * (corners[1].x - corners[0].x);
        const topY = corners[0].y + u * (corners[1].y - corners[0].y);
        const bottomX = corners[3].x + u * (corners[2].x - corners[3].x);
        const bottomY = corners[3].y + u * (corners[2].y - corners[3].y);
        
        const x = topX + v * (bottomX - topX);
        const y = topY + v * (bottomY - topY);
        
        const featurePoint: TrackingPoint = {
          id: `${planarTracker.id}_feature_${row}_${col}`,
          x,
          y,
          confidence: 1.0,
          isActive: true,
          trajectory: [{ x, y, frame: frameCount }],
          searchRadius: 50, // Smaller search radius for feature points
          framePositions: new Map([[frameCount, { x, y }]]),
          adaptiveWindowSize: 15
        };
        
        featurePoints.push(featurePoint);
      }
    }
    
    return featurePoints;
  }

  /**
   * Update planar tracker corners based on feature point tracking results
   */
  updatePlanarTrackerFromFeatures(
    planarTracker: PlanarTracker, 
    trackedFeatures: TrackingPoint[], 
    frameCount: number
  ): HomographyData | null {
    if (!this.cv || trackedFeatures.length < 4) {
      return null;
    }

    try {
      // Get current feature positions
      const currentPoints = trackedFeatures
        .filter(f => f.isActive && f.confidence > 0.3)
        .map(f => ({ x: f.x, y: f.y }));

      if (currentPoints.length < 4) {
        return null;
      }

      // Get original feature positions (from frame 0 or first frame)
      const originalPoints = trackedFeatures
        .filter(f => f.trajectory.length > 0)
        .map(f => f.trajectory[0])
        .map(t => ({ x: t.x, y: t.y }));

      if (originalPoints.length !== currentPoints.length) {
        return null;
      }      // Calculate homography using RANSAC
      const srcPointsFlat: number[] = [];
      originalPoints.forEach(p => { srcPointsFlat.push(p.x, p.y); });
      const dstPointsFlat: number[] = [];
      currentPoints.forEach(p => { dstPointsFlat.push(p.x, p.y); });
      
      const srcPoints = this.cv.matFromArray(originalPoints.length, 1, this.cv.CV_32FC2, srcPointsFlat);
      const dstPoints = this.cv.matFromArray(currentPoints.length, 1, this.cv.CV_32FC2, dstPointsFlat);

      const homography = new this.cv.Mat();
      const mask = new this.cv.Mat();

      // Use RANSAC for robust homography estimation
      this.cv.findHomography(srcPoints, dstPoints, this.cv.RANSAC, 3.0, mask, 2000, 0.995);

      // Count inliers
      const inlierCount = this.cv.countNonZero(mask);
      const confidence = inlierCount / currentPoints.length;      // Get homography matrix as flat array
      const homographyArray: number[] = Array.from(homography.data64F || homography.data32F) as number[];

      // Apply homography to original corners to get new positions
      this.updateCornersFromHomography(planarTracker, homographyArray, frameCount);

      // Store homography for this frame
      planarTracker.frameHomographies.set(frameCount, homographyArray);
      planarTracker.homographyMatrix = homographyArray;
      planarTracker.confidence = confidence;

      // Cleanup
      srcPoints.delete();
      dstPoints.delete();
      homography.delete();
      mask.delete();

      return {
        matrix: homographyArray,
        confidence,
        inlierCount,
        totalFeatures: currentPoints.length
      };

    } catch (error) {
      console.warn('Homography calculation failed:', error);
      return null;
    }
  }

  /**
   * Update corner positions based on homography transformation
   */
  private updateCornersFromHomography(
    planarTracker: PlanarTracker, 
    homographyMatrix: number[], 
    frameCount: number
  ): void {
    if (!this.cv || homographyMatrix.length !== 9) {
      return;
    }

    try {
      // Get original corner positions (first frame)
      const originalCorners = planarTracker.trajectory[0]?.corners || 
        planarTracker.corners.map(c => ({ x: c.x, y: c.y }));

      // Apply homography transformation to each corner
      const homMat = this.cv.matFromArray(3, 3, this.cv.CV_64FC1, homographyMatrix);
      
      originalCorners.forEach((originalCorner, index) => {
        // Convert point to homogeneous coordinates
        const point = this.cv.matFromArray(1, 1, this.cv.CV_64FC2, [originalCorner.x, originalCorner.y]);
        const transformedPoint = new this.cv.Mat();
        
        // Apply transformation
        this.cv.perspectiveTransform(point, transformedPoint, homMat);
        
        // Extract transformed coordinates
        const transformed = transformedPoint.data64F;
        planarTracker.corners[index].x = transformed[0];
        planarTracker.corners[index].y = transformed[1];
        
        // Cleanup
        point.delete();
        transformedPoint.delete();
      });

      // Update center point
      const centerX = planarTracker.corners.reduce((sum, c) => sum + c.x, 0) / 4;
      const centerY = planarTracker.corners.reduce((sum, c) => sum + c.y, 0) / 4;
      planarTracker.center = { x: centerX, y: centerY };

      // Add to trajectory
      planarTracker.trajectory.push({
        center: { x: centerX, y: centerY },
        corners: planarTracker.corners.map(c => ({ x: c.x, y: c.y })),
        frame: frameCount
      });

      // Cleanup
      homMat.delete();

    } catch (error) {
      console.warn('Failed to update corners from homography:', error);
    }
  }

  /**
   * Update corner position manually (when user drags a corner)
   */
  updateCornerPosition(
    planarTracker: PlanarTracker, 
    cornerIndex: number, 
    newX: number, 
    newY: number
  ): void {
    if (cornerIndex >= 0 && cornerIndex < 4) {
      planarTracker.corners[cornerIndex].x = newX;
      planarTracker.corners[cornerIndex].y = newY;
      
      // Update center
      const centerX = planarTracker.corners.reduce((sum, c) => sum + c.x, 0) / 4;
      const centerY = planarTracker.corners.reduce((sum, c) => sum + c.y, 0) / 4;
      planarTracker.center = { x: centerX, y: centerY };
    }
  }

  /**
   * Check if a point is inside the planar tracker region
   */
  isPointInsideTracker(planarTracker: PlanarTracker, x: number, y: number): boolean {
    // Simple point-in-quadrilateral test using cross products
    const { corners } = planarTracker;
    let inside = true;
    
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const cross = (corners[j].x - corners[i].x) * (y - corners[i].y) - 
                   (corners[j].y - corners[i].y) * (x - corners[i].x);
      if (cross < 0) {
        inside = false;
        break;
      }
    }
    
    return inside;
  }

  /**
   * Get corner index if point is near a corner handle
   */
  getCornerIndexAtPoint(planarTracker: PlanarTracker, x: number, y: number, threshold: number = 15): number {
    for (let i = 0; i < 4; i++) {
      const corner = planarTracker.corners[i];
      const distance = Math.sqrt((corner.x - x) ** 2 + (corner.y - y) ** 2);
      if (distance <= threshold) {
        return i;
      }
    }
    return -1;
  }
}
