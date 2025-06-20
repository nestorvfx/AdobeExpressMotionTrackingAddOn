import { PlanarTracker, PlanarCorner, TrackingPoint, Position, HomographyData } from './TrackingTypes';

interface GridPoint {
  x: number;
  y: number;
  confidence: number;
  textureScore: number;
}

export class PlanarTrackerManager {
  private cv: any = null;
  private readonly GRID_SIZE = 26; // 26 internal points + 4 corners = 30 total
  private readonly MIN_TRACKING_POINTS = 15;
  private readonly TEXTURE_SEARCH_RADIUS = 10;
  private readonly CONFIDENCE_THRESHOLD = 0.3;

  constructor(cv?: any) {
    this.cv = cv;
  }

  setOpenCV(cv: any): void {
    this.cv = cv;
  }  /**
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
   * Generate fixed grid of feature points within the planar tracker region
   * Uses texture analysis to snap grid points to high-texture areas
   */
  generateFeaturePoints(planarTracker: PlanarTracker, frameCount: number, imageData?: ImageData): TrackingPoint[] {
    const { corners } = planarTracker;
    const featurePoints: TrackingPoint[] = [];
    
    
    
    // Generate uniform grid within the quadrilateral
    const gridPoints = this.generateUniformGrid(corners);
    
    // If we have image data, snap grid points to high-texture areas
    const finalPoints = imageData ? 
      this.snapGridPointsToTexture(gridPoints, imageData) : 
      gridPoints;
    
    // Convert grid points to TrackingPoint objects
    finalPoints.forEach((point, index) => {
      const featurePoint: TrackingPoint = {
        id: `${planarTracker.id}_grid_${index}`,
        x: point.x,
        y: point.y,
        confidence: point.confidence,
        isActive: true,
        trajectory: [{ x: point.x, y: point.y, frame: frameCount }],
        searchRadius: 30,
        framePositions: new Map([[frameCount, { x: point.x, y: point.y }]]),
        adaptiveWindowSize: 15
      };
      
      featurePoints.push(featurePoint);
    });
    
    
    return featurePoints;
  }

  /**
   * Generate uniform grid within quadrilateral bounds
   */
  private generateUniformGrid(corners: [PlanarCorner, PlanarCorner, PlanarCorner, PlanarCorner]): GridPoint[] {
    const gridPoints: GridPoint[] = [];
    
    // Create a roughly square grid that fills the quadrilateral
    const gridDim = Math.ceil(Math.sqrt(this.GRID_SIZE));
    const actualPoints = Math.min(this.GRID_SIZE, gridDim * gridDim);
    
    for (let i = 0; i < actualPoints; i++) {
      const row = Math.floor(i / gridDim);
      const col = i % gridDim;
      
      // Normalized coordinates within grid (0 to 1)
      const u = (col + 0.5) / gridDim; // Add 0.5 to center points in grid cells
      const v = (row + 0.5) / gridDim;
      
      // Bilinear interpolation within the quadrilateral
      const topX = corners[0].x + u * (corners[1].x - corners[0].x);
      const topY = corners[0].y + u * (corners[1].y - corners[0].y);
      const bottomX = corners[3].x + u * (corners[2].x - corners[3].x);
      const bottomY = corners[3].y + u * (corners[2].y - corners[3].y);
      
      const x = topX + v * (bottomX - topX);
      const y = topY + v * (bottomY - topY);
      
      gridPoints.push({
        x,
        y,
        confidence: 1.0,
        textureScore: 0.5 // Default texture score
      });
    }
    
    return gridPoints;
  }

  /**
   * Snap grid points to nearby high-texture areas for better tracking
   */
  private snapGridPointsToTexture(gridPoints: GridPoint[], imageData: ImageData): GridPoint[] {
    if (!this.cv) {
      return gridPoints; // Return original points if OpenCV not available
    }

    try {
      // Convert ImageData to OpenCV Mat
      const imageWidth = imageData.width;
      const imageHeight = imageData.height;
      const mat = this.cv.matFromArray(imageHeight, imageWidth, this.cv.CV_8UC4, imageData.data);
      
      // Convert to grayscale for texture analysis
      const gray = new this.cv.Mat();
      this.cv.cvtColor(mat, gray, this.cv.COLOR_RGBA2GRAY);
      
      // Calculate gradient magnitude for texture detection
      const gradX = new this.cv.Mat();
      const gradY = new this.cv.Mat();
      this.cv.Sobel(gray, gradX, this.cv.CV_32F, 1, 0, 3);
      this.cv.Sobel(gray, gradY, this.cv.CV_32F, 0, 1, 3);
      
      const gradMag = new this.cv.Mat();
      this.cv.magnitude(gradX, gradY, gradMag);
      
      const snappedPoints = gridPoints.map(point => {
        const bestPoint = this.findBestTexturePoint(point, gradMag, imageWidth, imageHeight);
        return bestPoint;
      });
      
      // Cleanup
      mat.delete();
      gray.delete();
      gradX.delete();
      gradY.delete();
      gradMag.delete();
      
      return snappedPoints;
      
    } catch (error) {
      console.warn('[FIXED-GRID] Texture analysis failed, using original grid:', error);
      return gridPoints;
    }
  }

  /**
   * Find the best texture point within search radius
   */
  private findBestTexturePoint(originalPoint: GridPoint, gradMag: any, imageWidth: number, imageHeight: number): GridPoint {
    const searchRadius = this.TEXTURE_SEARCH_RADIUS;
    let bestX = originalPoint.x;
    let bestY = originalPoint.y;
    let bestScore = 0;
    
    // Search in a small radius around the original point
    for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
      for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
        const testX = Math.round(originalPoint.x + dx);
        const testY = Math.round(originalPoint.y + dy);
        
        // Ensure point is within image bounds
        if (testX >= 0 && testX < imageWidth && testY >= 0 && testY < imageHeight) {
          try {
            const score = gradMag.floatAt(testY, testX);
            if (score > bestScore) {
              bestScore = score;
              bestX = testX;
              bestY = testY;
            }
          } catch (e) {
            // Skip invalid points
          }
        }
      }
    }
    
    return {
      x: bestX,
      y: bestY,
      confidence: Math.min(1.0, bestScore / 50.0), // Normalize score to 0-1
      textureScore: bestScore
    };
  }
  /**
   * Update planar tracker corners based on feature point tracking results
   * Uses robust homography estimation with the fixed grid approach
   */
  updatePlanarTrackerFromFeatures(
    planarTracker: PlanarTracker, 
    trackedFeatures: TrackingPoint[], 
    frameCount: number
  ): HomographyData | null {
    if (!this.cv) {
      
      return null;
    }

    // Filter active and confident points
    const activePoints = trackedFeatures.filter(f => 
      f.isActive && f.confidence > this.CONFIDENCE_THRESHOLD
    );

    

    // Check minimum point threshold
    if (activePoints.length < this.MIN_TRACKING_POINTS) {
      
      
      // Regenerate grid if we have too few good points
      this.regenerateFailedPoints(planarTracker, trackedFeatures, frameCount);
      return null;
    }    try {
      // Get current and previous frame positions
      const currentPoints = activePoints.map(f => ({ x: f.x, y: f.y }));
      const previousPoints = this.getPreviousFramePositions(activePoints, frameCount);

      if (previousPoints.length !== currentPoints.length) {
        
        return null;
      }

      // Special case: if previous and current points are identical (after scrubbing),
      // skip homography calculation to avoid division by zero
      const pointsAreIdentical = currentPoints.every((curr, i) => {
        const prev = previousPoints[i];
        return Math.abs(curr.x - prev.x) < 0.1 && Math.abs(curr.y - prev.y) < 0.1;
      });

      if (pointsAreIdentical) {
        
        // Add current positions to trajectory without homography transformation
        this.addTrajectoryEntry(planarTracker, frameCount);
        return {
          matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], // Identity matrix
          confidence: 1.0,
          inlierCount: activePoints.length,
          totalFeatures: activePoints.length
        };
      }

      // Calculate homography
      const homographyData = this.calculateRobustHomography(
        previousPoints, 
        currentPoints, 
        planarTracker.id
      );

      if (!homographyData) {
        
        return null;
      }

      // Update corners using homography
      this.updateCornersFromHomography(planarTracker, homographyData.matrix, frameCount);

      // Store results
      planarTracker.frameHomographies.set(frameCount, homographyData.matrix);
      planarTracker.homographyMatrix = homographyData.matrix;
      planarTracker.confidence = homographyData.confidence;

      
      return homographyData;

    } catch (error) {
      console.warn('[FIXED-GRID] Error in updatePlanarTrackerFromFeatures:', error);
      return null;
    }
  }  /**
   * Get previous frame positions for tracking points
   * Uses framePositions map to get the actual previous frame, not just trajectory order
   */
  private getPreviousFramePositions(points: TrackingPoint[], currentFrame?: number): Position[] {
    return points.map(point => {
      // If we have framePositions map, use it for accurate frame-based lookup
      if (point.framePositions && point.framePositions.size > 0 && currentFrame !== undefined) {
        // Look for the exact previous frame first
        const prevFramePos = point.framePositions.get(currentFrame - 1);
        if (prevFramePos) {
          
          return prevFramePos;
        }
        
        // If no exact previous frame, use the most recent frame position
        const frameEntries = Array.from(point.framePositions.entries())
          .filter(([frame]) => frame < currentFrame)
          .sort((a, b) => b[0] - a[0]);
          
        if (frameEntries.length > 0) {
          const mostRecentPosition = frameEntries[0][1];
          
          return mostRecentPosition;
        }
      }
      
      // Fallback to trajectory-based approach
      if (point.trajectory.length > 1) {
        // Use previous frame position from trajectory
        const prevPos = point.trajectory[point.trajectory.length - 2];
        
        return prevPos;
      } else {
        // Use current position as reference for first frame or after scrubbing
        const currentPos = { x: point.x, y: point.y };
        
        return currentPos;
      }
    });
  }

  /**
   * Calculate robust homography using RANSAC
   */
  private calculateRobustHomography(
    sourcePoints: Position[], 
    targetPoints: Position[], 
    trackerId: string
  ): HomographyData | null {
    try {
      // Convert to OpenCV format
      const srcFlat: number[] = [];
      sourcePoints.forEach(p => { srcFlat.push(p.x, p.y); });
      const dstFlat: number[] = [];
      targetPoints.forEach(p => { dstFlat.push(p.x, p.y); });

      const srcMat = this.cv.matFromArray(sourcePoints.length, 1, this.cv.CV_32FC2, srcFlat);
      const dstMat = this.cv.matFromArray(targetPoints.length, 1, this.cv.CV_32FC2, dstFlat);
      const mask = new this.cv.Mat();

      

      // Use RANSAC for robust estimation
      const homography = this.cv.findHomography(
        srcMat, 
        dstMat, 
        this.cv.RANSAC, 
        3.0, // Reprojection threshold
        mask, 
        2000, // Max iterations
        0.995 // Confidence
      );

      if (!homography || homography.empty()) {
        
        srcMat.delete();
        dstMat.delete();
        mask.delete();
        if (homography) homography.delete();
        return null;
      }

      // Calculate confidence from inliers
      const inlierCount = this.cv.countNonZero(mask);
      const confidence = inlierCount / sourcePoints.length;

      // Check confidence threshold
      if (confidence < this.CONFIDENCE_THRESHOLD) {
        
        srcMat.delete();
        dstMat.delete();
        mask.delete();
        homography.delete();
        return null;
      }

      // Extract homography matrix
      const matrixArray: number[] = Array.from(homography.data64F || homography.data32F);

      

      // Cleanup
      srcMat.delete();
      dstMat.delete();
      mask.delete();
      homography.delete();

      return {
        matrix: matrixArray,
        confidence,
        inlierCount,
        totalFeatures: sourcePoints.length
      };

    } catch (error) {
      console.warn('[FIXED-GRID] Homography calculation error:', error);
      return null;
    }
  }

  /**
   * Regenerate failed tracking points in sparse areas
   */
  private regenerateFailedPoints(
    planarTracker: PlanarTracker, 
    existingPoints: TrackingPoint[], 
    frameCount: number
  ): void {
    

    // Preserve high-confidence points
    const goodPoints = existingPoints.filter(p => 
      p.isActive && p.confidence > this.CONFIDENCE_THRESHOLD
    );

    // Deactivate failed points but keep their trajectory data
    existingPoints.forEach(point => {
      if (point.confidence <= this.CONFIDENCE_THRESHOLD) {
        point.isActive = false;
        
      }
    });

    // Generate new grid points to fill gaps
    const neededPoints = this.GRID_SIZE - goodPoints.length;
    if (neededPoints > 0) {
      const newGridPoints = this.generateUniformGrid(planarTracker.corners);
      
      // Convert to tracking points and add to existing array
      for (let i = 0; i < Math.min(neededPoints, newGridPoints.length); i++) {
        const gridPoint = newGridPoints[i];
        const newPoint: TrackingPoint = {
          id: `${planarTracker.id}_regen_${frameCount}_${i}`,
          x: gridPoint.x,
          y: gridPoint.y,
          confidence: gridPoint.confidence,
          isActive: true,
          trajectory: [{ x: gridPoint.x, y: gridPoint.y, frame: frameCount }],
          searchRadius: 30,
          framePositions: new Map([[frameCount, { x: gridPoint.x, y: gridPoint.y }]]),
          adaptiveWindowSize: 15
        };
        
        existingPoints.push(newPoint);
      }
      
      
    }
  }  /**
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
      // Use current corner positions as source (incremental tracking)
      const sourceCorners = planarTracker.corners.map(c => ({ x: c.x, y: c.y }));
      
      
      

      // Apply homography transformation to each corner
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
        
        // Check for reasonable values
        if (isNaN(newX) || isNaN(newY) || Math.abs(newX) > 10000 || Math.abs(newY) > 10000) {
          console.warn(`[FIXED-GRID] Unreasonable corner ${index} transformation: (${newX}, ${newY})`);
          // Keep original position if transformation is unreasonable
        } else {
          planarTracker.corners[index].x = newX;
          planarTracker.corners[index].y = newY;
          
        }
        
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
      console.warn('[FIXED-GRID] Failed to update corners from homography:', error);
    }
  }  /**
   * Update corner position manually (when user drags a corner)
   * Triggers regeneration of feature points after drag is complete
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
      
      
      
      
      // Update the most recent trajectory entry to reflect the manual adjustment
      if (planarTracker.trajectory.length > 0) {
        const lastTrajectoryEntry = planarTracker.trajectory[planarTracker.trajectory.length - 1];
        lastTrajectoryEntry.corners = planarTracker.corners.map(c => ({ x: c.x, y: c.y }));
        lastTrajectoryEntry.center = { x: centerX, y: centerY };
        
        
      }
      
      // Mark for feature point regeneration on next tracking frame
      (planarTracker as any).needsFeatureRegeneration = true;
      
    }
  }

  /**
   * Regenerate feature points after manual corner adjustment
   * Preserves high-confidence existing points that are still within bounds
   */
  regenerateFeaturePointsAfterAdjustment(
    planarTracker: PlanarTracker, 
    frameCount: number, 
    imageData?: ImageData
  ): TrackingPoint[] {
    
    
    // Preserve existing points that are still within the new boundary and have good confidence
    const preservedPoints = planarTracker.featurePoints.filter(point => {
      const withinBounds = this.isPointInsideTracker(planarTracker, point.x, point.y);
      const goodConfidence = point.confidence > this.CONFIDENCE_THRESHOLD;
      
      if (withinBounds && goodConfidence) {
        
        return true;
      } else {
        // Deactivate but preserve trajectory data
        point.isActive = false;
        
        return false;
      }
    });

    // Generate new grid points to fill gaps
    const neededPoints = this.GRID_SIZE - preservedPoints.length;
    const newPoints: TrackingPoint[] = [];

    if (neededPoints > 0) {
      // Generate new grid within updated corners
      const gridPoints = this.generateUniformGrid(planarTracker.corners);
      
      // Apply texture snapping if image data is available
      const finalGridPoints = imageData ? 
        this.snapGridPointsToTexture(gridPoints, imageData) : 
        gridPoints;

      // Avoid placing new points too close to preserved points
      const minDistance = 20; // Minimum distance between points
      let addedCount = 0;

      for (const gridPoint of finalGridPoints) {
        if (addedCount >= neededPoints) break;

        // Check distance to existing preserved points
        const tooClose = preservedPoints.some(existingPoint => {
          const distance = Math.sqrt(
            (gridPoint.x - existingPoint.x) ** 2 + 
            (gridPoint.y - existingPoint.y) ** 2
          );
          return distance < minDistance;
        });

        if (!tooClose) {
          const newPoint: TrackingPoint = {
            id: `${planarTracker.id}_regen_${frameCount}_${addedCount}`,
            x: gridPoint.x,
            y: gridPoint.y,
            confidence: gridPoint.confidence,
            isActive: true,
            trajectory: [{ x: gridPoint.x, y: gridPoint.y, frame: frameCount }],
            searchRadius: 30,
            framePositions: new Map([[frameCount, { x: gridPoint.x, y: gridPoint.y }]]),
            adaptiveWindowSize: 15
          };
          
          newPoints.push(newPoint);
          addedCount++;
        }
      }

      
    }

    // Combine preserved and new points
    const allPoints = [...preservedPoints, ...newPoints];
    
    // Update the planar tracker's feature points
    planarTracker.featurePoints = [...planarTracker.featurePoints.filter(p => !p.isActive), ...allPoints];
    
    // Clear the regeneration flag
    delete (planarTracker as any).needsFeatureRegeneration;
    
    
    
    return allPoints;
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
  }  /**
   * Sync planar tracker to its trajectory position for a given frame
   * This is used during timeline scrubbing to ensure trackers appear at their correct positions
   */
  syncPlanarTrackerToFrame(planarTracker: PlanarTracker, frame: number): void {
    
    if (planarTracker.trajectory.length === 0) {
      
      return;
    }

    // Look for exact frame match first
    const exactMatch = planarTracker.trajectory.find(entry => entry.frame === frame);
    if (exactMatch) {
      
      // Update corners and center to exact frame position
      planarTracker.center = { x: exactMatch.center.x, y: exactMatch.center.y };
      exactMatch.corners.forEach((corner, index) => {
        planarTracker.corners[index].x = corner.x;
        planarTracker.corners[index].y = corner.y;
      });
      
      return;
    }

    // If no exact match, find the most recent previous frame
    let mostRecentFrame = -1;
    let mostRecentEntry = null;
    for (const entry of planarTracker.trajectory) {
      if (entry.frame < frame && entry.frame > mostRecentFrame) {
        mostRecentFrame = entry.frame;
        mostRecentEntry = entry;
      }
    }

    if (mostRecentEntry) {
      
      // Use most recent previous frame position
      planarTracker.center = { x: mostRecentEntry.center.x, y: mostRecentEntry.center.y };
      mostRecentEntry.corners.forEach((corner, index) => {
        planarTracker.corners[index].x = corner.x;
        planarTracker.corners[index].y = corner.y;
      });
      
      return;
    }

    // If no previous frame, find the nearest future frame
    let nearestFutureFrame = Number.MAX_SAFE_INTEGER;
    let nearestFutureEntry = null;
    for (const entry of planarTracker.trajectory) {
      if (entry.frame > frame && entry.frame < nearestFutureFrame) {
        nearestFutureFrame = entry.frame;
        nearestFutureEntry = entry;
      }
    }

    if (nearestFutureEntry) {
      
      // Use nearest future frame position
      planarTracker.center = { x: nearestFutureEntry.center.x, y: nearestFutureEntry.center.y };
      nearestFutureEntry.corners.forEach((corner, index) => {
        planarTracker.corners[index].x = corner.x;
        planarTracker.corners[index].y = corner.y;
      });
      
    }
    // If no trajectory data at all, keep current positions (fallback)
  }

  /**
   * Sync all planar trackers to their trajectory positions for a given frame
   */
  syncAllPlanarTrackersToFrame(planarTrackers: PlanarTracker[], frame: number): void {
    planarTrackers.forEach(tracker => {
      this.syncPlanarTrackerToFrame(tracker, frame);
    });  } /**
   * Add trajectory entry without homography transformation
   */
  private addTrajectoryEntry(planarTracker: PlanarTracker, frameCount: number): void {
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

    
  }
}
