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
   */  updatePlanarTrackerFromFeatures(
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
      }      // Get previous frame feature positions (or original if no previous frame)
      const previousPoints = trackedFeatures
        .filter(f => f.trajectory.length > 1)
        .map(f => f.trajectory[f.trajectory.length - 2]) // Second to last frame
        .map(t => ({ x: t.x, y: t.y }));
      
      // If we don't have previous frame data, fall back to original positions
      const sourcePoints = previousPoints.length === currentPoints.length ? 
        previousPoints : 
        trackedFeatures
          .filter(f => f.trajectory.length > 0)
          .map(f => f.trajectory[0])
          .map(t => ({ x: t.x, y: t.y }));

      if (sourcePoints.length !== currentPoints.length) {
        return null;
      }      // Calculate homography from previous frame to current frame (incremental transformation)
      const srcPointsFlat: number[] = [];
      sourcePoints.forEach(p => { srcPointsFlat.push(p.x, p.y); });
      const dstPointsFlat: number[] = [];
      currentPoints.forEach(p => { dstPointsFlat.push(p.x, p.y); });
      
      const srcPoints = this.cv.matFromArray(sourcePoints.length, 1, this.cv.CV_32FC2, srcPointsFlat);
      const dstPoints = this.cv.matFromArray(currentPoints.length, 1, this.cv.CV_32FC2, dstPointsFlat);

      console.log('[TRACKING ADDON] Computing homography with', currentPoints.length, 'points');
      console.log('[TRACKING ADDON] Feature point movements:');
      const isIncremental = previousPoints.length === currentPoints.length;
      console.log('[TRACKING ADDON] Using', isIncremental ? 'incremental (prev->curr)' : 'absolute (orig->curr)', 'tracking');
      for (let i = 0; i < Math.min(4, sourcePoints.length); i++) {
        console.log(`[TRACKING ADDON]   Point ${i}: (${sourcePoints[i].x.toFixed(1)}, ${sourcePoints[i].y.toFixed(1)}) -> (${currentPoints[i].x.toFixed(1)}, ${currentPoints[i].y.toFixed(1)})`);
      }
      if (sourcePoints.length > 4) {
        console.log(`[TRACKING ADDON]   ... and ${sourcePoints.length - 4} more points`);
      }

      const mask = new this.cv.Mat();

      // Use RANSAC for robust homography estimation  
      // In OpenCV.js, findHomography returns the homography matrix directly
      const homography = this.cv.findHomography(srcPoints, dstPoints, this.cv.RANSAC, 3.0, mask, 2000, 0.995);

      if (!homography || homography.empty()) {
        console.log('[TRACKING ADDON] Homography calculation failed - empty result');
        // Cleanup and return null if homography calculation failed
        srcPoints.delete();
        dstPoints.delete();
        if (homography) homography.delete();
        mask.delete();
        return null;
      }

      // Count inliers
      const inlierCount = this.cv.countNonZero(mask);
      const confidence = inlierCount / currentPoints.length;

      // Only proceed if we have reasonable confidence
      if (confidence < 0.3) {
        srcPoints.delete();
        dstPoints.delete();
        homography.delete();
        mask.delete();
        return null;
      }      // Get homography matrix as flat array
      const homographyArray: number[] = Array.from(homography.data64F || homography.data32F) as number[];      console.log('[TRACKING ADDON] Homography matrix:');
      console.log(`[TRACKING ADDON]   [${homographyArray[0].toFixed(3)}, ${homographyArray[1].toFixed(3)}, ${homographyArray[2].toFixed(3)}]`);
      console.log(`[TRACKING ADDON]   [${homographyArray[3].toFixed(3)}, ${homographyArray[4].toFixed(3)}, ${homographyArray[5].toFixed(3)}]`);
      console.log(`[TRACKING ADDON]   [${homographyArray[6].toFixed(3)}, ${homographyArray[7].toFixed(3)}, ${homographyArray[8].toFixed(3)}]`);
      console.log('[TRACKING ADDON] Confidence:', confidence, 'Inliers:', inlierCount, '/', currentPoints.length);      // Apply homography to corners (incremental or absolute based on what we computed)
      this.updateCornersFromHomography(planarTracker, homographyArray, frameCount, isIncremental);

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
    frameCount: number,
    isIncremental: boolean = false
  ): void {
    if (!this.cv || homographyMatrix.length !== 9) {
      console.log('[TRACKING ADDON] Invalid homography matrix:', homographyMatrix.length, 'elements');
      return;
    }    try {
      // Check if this tracker has been manually adjusted
      const hasManualAdjustment = (planarTracker as any).hasManualAdjustment;
      
      // Choose source corners based on tracking mode
      let sourceCorners;
      let shouldUseIncremental = isIncremental || hasManualAdjustment;
      
      if (shouldUseIncremental && planarTracker.trajectory.length > 0) {
        // For incremental tracking or after manual adjustment, use current corner positions
        sourceCorners = planarTracker.corners.map(c => ({ x: c.x, y: c.y }));
        console.log('[TRACKING ADDON] Using INCREMENTAL tracking (current->new corners)' + 
                   (hasManualAdjustment ? ' [AFTER MANUAL ADJUSTMENT]' : ''));
        
        // Clear the manual adjustment flag after first use
        if (hasManualAdjustment) {
          delete (planarTracker as any).hasManualAdjustment;
          console.log('[TRACKING ADDON] Cleared manual adjustment flag');
        }
      } else {
        // For absolute tracking, use original corner positions
        if (planarTracker.trajectory.length > 0) {
          sourceCorners = planarTracker.trajectory[0].corners;
        } else {
          sourceCorners = planarTracker.corners.map(c => ({ x: c.x, y: c.y }));
        }
        console.log('[TRACKING ADDON] Using ABSOLUTE tracking (original->new corners)');
      }

      console.log('[TRACKING ADDON] Source corners:', sourceCorners.map((c, i) => `[${i}]: (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`));
      console.log('[TRACKING ADDON] Current corners before update:', planarTracker.corners.map((c, i) => `[${i}]: (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`));// Apply homography transformation to each corner
      const homMat = this.cv.matFromArray(3, 3, this.cv.CV_64FC1, homographyMatrix);
      
      sourceCorners.forEach((sourceCorner, index) => {
        // Convert point to homogeneous coordinates
        const point = this.cv.matFromArray(1, 1, this.cv.CV_64FC2, [sourceCorner.x, sourceCorner.y]);
        const transformedPoint = new this.cv.Mat();
        
        // Apply transformation
        this.cv.perspectiveTransform(point, transformedPoint, homMat);
        
        // Extract transformed coordinates
        const transformed = transformedPoint.data64F;
        const newX = transformed[0];
        const newY = transformed[1];
        
        console.log(`[TRACKING ADDON] Corner ${index}: (${sourceCorner.x.toFixed(1)}, ${sourceCorner.y.toFixed(1)}) -> (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
        
        planarTracker.corners[index].x = newX;
        planarTracker.corners[index].y = newY;
        
        // Cleanup
        point.delete();
        transformedPoint.delete();
      });// Update center point
      const centerX = planarTracker.corners.reduce((sum, c) => sum + c.x, 0) / 4;
      const centerY = planarTracker.corners.reduce((sum, c) => sum + c.y, 0) / 4;
      planarTracker.center = { x: centerX, y: centerY };      console.log('[TRACKING ADDON] Updated corners:', planarTracker.corners.map((c, i) => `[${i}]: (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`));
      console.log('[TRACKING ADDON] New center:', `(${planarTracker.center.x.toFixed(1)}, ${planarTracker.center.y.toFixed(1)})`);

      // Check for unreasonable corner positions (likely indicates a bad homography)
      const hasUnreasonableCorners = planarTracker.corners.some(corner => 
        Math.abs(corner.x) > 10000 || Math.abs(corner.y) > 10000 || 
        isNaN(corner.x) || isNaN(corner.y)
      );
      
      if (hasUnreasonableCorners) {
        console.warn('[TRACKING ADDON] WARNING: Corners have unreasonable values, homography may be unstable');
      }

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
      
      console.log(`[TRACKING ADDON] Manual corner ${cornerIndex} update: (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
      console.log('[TRACKING ADDON] All corners after manual adjustment:', planarTracker.corners.map((c, i) => `[${i}]: (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`));
      
      // CRITICAL: Reset the tracking reference to the current corners
      // This ensures that future tracking uses these manually adjusted corners as the baseline
      if (planarTracker.trajectory.length > 0) {
        // Update the most recent trajectory entry to reflect the manual adjustment
        const lastTrajectoryEntry = planarTracker.trajectory[planarTracker.trajectory.length - 1];
        lastTrajectoryEntry.corners = planarTracker.corners.map(c => ({ x: c.x, y: c.y }));
        lastTrajectoryEntry.center = { x: centerX, y: centerY };
        
        console.log('[TRACKING ADDON] Updated trajectory reference to manual adjustment');
      }
      
      // Mark that this tracker has been manually adjusted
      // We'll use this flag to ensure proper incremental tracking on the next frame
      (planarTracker as any).hasManualAdjustment = true;
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
