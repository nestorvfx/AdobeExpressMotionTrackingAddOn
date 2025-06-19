import { TrackingPoint, TrackingOptions, PlanarTracker } from './TrackingTypes';
import { FrameProcessor } from './FrameProcessor';
import { TrajectoryManager } from './TrajectoryManager';
import { OpticalFlowEngine } from './OpticalFlowEngine';
import { StateManager } from './StateManager';
import { PlanarTrackerManager } from './PlanarTrackerManager';

export class TrackerOrchestrator {
  private cv: any = null;
  private options: TrackingOptions;
  private frameProcessor: FrameProcessor;
  private trajectoryManager: TrajectoryManager;
  private opticalFlowEngine: OpticalFlowEngine | null = null;
  private stateManager: StateManager;
  private planarTrackerManager: PlanarTrackerManager;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;

  constructor(options?: Partial<TrackingOptions>) {
    this.options = {
      winSize: { width: 29, height: 29 },
      maxLevel: 3,
      criteria: {
        type: 0,
        maxCount: 30,
        epsilon: 0.01
      },
      minEigThreshold: 1e-4,
      qualityLevel: 0.3,
      minDistance: 7,
      blockSize: 7,
      useHarrisDetector: false,
      k: 0.04,
      ...options
    };
    this.stateManager = new StateManager();
    this.frameProcessor = new FrameProcessor();
    this.trajectoryManager = new TrajectoryManager();
    this.planarTrackerManager = new PlanarTrackerManager();
  }
  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.cv) {
      return true;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = new Promise<boolean>(async (resolve) => {
      try {
        if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.imread) {
          this.cv = (window as any).cv;
          this.isInitialized = true;
          this.stateManager.setInitialized(true);
          this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
          this.frameProcessor.setOpenCV(this.cv);
          this.planarTrackerManager.setOpenCV(this.cv);
          this.opticalFlowEngine = new OpticalFlowEngine(this.cv, this.options);
          resolve(true);
          return;
        }

        const handleOpenCvLoaded = () => {
          if ((window as any).cv && (window as any).cv.imread) {
            this.cv = (window as any).cv;
            this.isInitialized = true;
            this.stateManager.setInitialized(true);
            this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
            this.frameProcessor.setOpenCV(this.cv);
            this.planarTrackerManager.setOpenCV(this.cv);
            this.opticalFlowEngine = new OpticalFlowEngine(this.cv, this.options);
            window.removeEventListener('opencv-loaded', handleOpenCvLoaded);
            resolve(true);
          } else {
            resolve(false);
          }
        };

        window.addEventListener('opencv-loaded', handleOpenCvLoaded);

        setTimeout(() => {
          if (!this.isInitialized) {
            window.removeEventListener('opencv-loaded', handleOpenCvLoaded);
            resolve(false);
          }
        }, 10000);

      } catch (error) {
        resolve(false);
      }
    });

    return this.initializationPromise;
  }
  async processFrame(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<TrackingPoint[]> {
    if (!this.isInitialized || !this.cv) {
      return this.stateManager.getPoints();
    }

    return new Promise<TrackingPoint[]>((resolve) => {
      requestAnimationFrame(() => {
        const ctx = canvas.getContext('2d')!;
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0);
        resolve(this.processFrameInternal(canvas));
      });
    });
  }

  /**
   * Internal frame processing logic
   */
  private processFrameInternal(canvas: HTMLCanvasElement): TrackingPoint[] {
    try {
      const frameCount = this.stateManager.getFrameCount();
      const points = this.stateManager.getPoints();
      
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = this.cv.matFromImageData(imageData);

      let newGray: any = null;
      try {
        newGray = new this.cv.Mat();
        this.cv.cvtColor(src, newGray, this.cv.COLOR_RGBA2GRAY);

        const beforeState = {
          frameCount,
          hasPrevGray: this.frameProcessor.hasPrevGray(),
          hasCurrGray: this.frameProcessor.hasCurrGray(),
          totalPoints: points.length,
          activePoints: points.filter(p => p.isActive).length,
          imageSize: `${canvas.width}x${canvas.height}`
        };        if (!this.frameProcessor.hasPrevGray()) {
          this.frameProcessor.initializeFrames(newGray);
        } else if (points.length > 0) {
          const activePointsBeforeTracking = points.filter(p => p.isActive);
            if (activePointsBeforeTracking.length > 0) {
            this.frameProcessor.updateCurrentFrame(newGray);
            this.performTracking(activePointsBeforeTracking);
            this.frameProcessor.swapFrames();
          }
        } else {
          this.frameProcessor.resetFrames(newGray);
        }
      } finally {
        if (newGray) {
          newGray.delete();
        }
      }      src.delete();

      // Process planar tracking after point tracking
      this.processPlanarTracking(null as any, canvas); // We already have the processed frame

      this.stateManager.incrementFrameCount();
      const activePointsAfter = this.stateManager.getActivePoints();
      return activePointsAfter;
    } catch (error) {
      return this.stateManager.getPoints();
    }
  }
  private performTracking(activePoints: TrackingPoint[]): void {
    if (!this.opticalFlowEngine || !this.frameProcessor.hasPrevGray() || !this.frameProcessor.hasCurrGray()) {
      return;
    }

    this.stateManager.applyFrameSkipPenalty();

    const frameCount = this.stateManager.getFrameCount();
    const isContinuousTracking = this.stateManager.isContinuousTrackingEnabled();    if (activePoints.length === 0) {
      return;
    }

    try {
      // Perform optical flow tracking
      const trackingResults = this.opticalFlowEngine.trackPoints(
        activePoints,
        this.frameProcessor.getPrevGray(),
        this.frameProcessor.getCurrGray(),
        frameCount,
        isContinuousTracking
      );      this.processTrackingResults(trackingResults.results, frameCount);

    } catch (error) {
      this.stateManager.applyTrackingErrorPenalty(activePoints);
    }
  }

  /**
   * Processes tracking results and updates point positions
   */
  private processTrackingResults(
    results: Array<{
      point: TrackingPoint;
      success: boolean;
      newX?: number;
      newY?: number;
      trackingError?: number;
      reason?: string;
    }>,
    frameCount: number
  ): void {
    const points = this.stateManager.getPoints();
      results.forEach(result => {
      const pointIndex = this.stateManager.findPointIndex(result.point.id);
      if (pointIndex === -1) {
        return;
      }

      const point = points[pointIndex];
        if (result.success && result.newX !== undefined && result.newY !== undefined) {
        // Always update tracked position - no manual move protection
        this.trajectoryManager.updateTrackedPosition(
          point, 
          result.newX, 
          result.newY, 
          frameCount, 
          result.trackingError || 0
        );      } else {
        // Handle tracking failure
        const wasDeactivated = this.trajectoryManager.handleTrackingFailure(
          point,
          frameCount,
          result.reason || 'unknown_failure'
        );
      }
    });
  }

  // Public API methods
  addTrackingPoint(x: number, y: number): string {
    const frameCount = this.stateManager.getFrameCount();
    const newPoint = this.trajectoryManager.createTrackingPoint(x, y, frameCount);
    this.stateManager.addPoint(newPoint);
    
    if (this.frameProcessor.hasCurrGray() && !this.frameProcessor.hasPrevGray()) {
      const currGray = this.frameProcessor.getCurrGray();
      if (currGray) {
        this.frameProcessor.initializeFromCurrent();
      }
    }
    
    return newPoint.id;
  }

  /**
   * Remove a tracking point
   */
  removeTrackingPoint(pointId: string): boolean {
    return this.stateManager.removePoint(pointId);
  }

  /**
   * Clear all tracking points
   */
  clearAllPoints(): void {
    this.stateManager.clearAllPoints();
  }  updatePointPosition(pointId: string, newX: number, newY: number): boolean {
    const point = this.stateManager.findPoint(pointId);
    if (!point) {
      return false;
    }

    const frameCount = this.stateManager.getFrameCount();
    
    this.trajectoryManager.updateManualPosition(point, newX, newY, frameCount);
    
    // After manual move, prepare the current frame as the reference for future tracking
    // This ensures that when user tracks forward, it will use this manually adjusted frame as prevGray
    // Note: We'll call this when tracking starts, not here, to avoid processing the frame unnecessarily
    
    return true;
  }

  /**
   * Get all tracking points
   */
  getTrackingPoints(): TrackingPoint[] {
    return this.stateManager.getPoints();
  }
  /**
   * Get trajectory paths for visualization
   */
  getTrajectoryPaths(currentFrame: number, range: number = 5): Array<{
    pointId: string;
    path: Array<{ x: number; y: number; frame: number }>;
  }> {
    const points = this.stateManager.getPoints();
    return this.trajectoryManager.getTrajectoryPaths(points, currentFrame, range);
  }

  /**
   * Get authoritative position for a point at a specific frame
   */
  public getPointPositionAtFramePublic(pointId: string, frame: number): { x: number; y: number } | null {
    const point = this.stateManager.findPoint(pointId);
    if (!point) return null;
    
    return this.trajectoryManager.getPositionAtFrame(point, frame);
  }

  /**
   * Update point search radius
   */
  updatePointSearchRadius(pointId: string, radius: number): boolean {
    const point = this.stateManager.findPoint(pointId);
    if (!point) return false;

    this.trajectoryManager.updateSearchRadius(point, radius);
    return true;
  }
  /**
   * Manually move point to position (legacy method)
   */
  movePointToPosition(pointId: string, x: number, y: number): boolean {
    const point = this.stateManager.findPoint(pointId);
    if (!point) return false;

    const frameCount = this.stateManager.getFrameCount();
    this.trajectoryManager.updateManualPosition(point, x, y, frameCount);
    return true;
  }  /**
   * Set current frame number (no sync during tracking, only during scrubbing)
   */  setCurrentFrame(frameNumber: number): void {
    this.stateManager.setCurrentFrame(frameNumber);
  }  /**
   * Sync points to frame positions (for scrubbing only)
   */  syncPointsToFrameForScrubbing(frame: number): void {
    console.log(`[TRACKING ADDON] Syncing points and planar trackers to frame ${frame}`);
    
    // Sync ALL tracking points (including feature points) to their trajectory positions
    const allPoints = this.stateManager.getPoints();
    this.trajectoryManager.syncAllPointsToFrame(allPoints, frame);
    console.log(`[TRACKING ADDON] Synced ${allPoints.length} tracking points to frame ${frame}`);
    
    // Sync planar tracker corners and centers to their trajectory positions for this frame
    const planarTrackers = this.stateManager.getPlanarTrackers();
    this.planarTrackerManager.syncAllPlanarTrackersToFrame(planarTrackers, frame);
    console.log(`[TRACKING ADDON] Synced ${planarTrackers.length} planar trackers to frame ${frame}`);
    
    // Reset optical flow buffers so tracking starts fresh from this scrubbed position
    this.frameProcessor.resetFrameBuffers();
    console.log(`[TRACKING ADDON] Reset optical flow buffers - tracking will start fresh from frame ${frame}`);
    
    console.log(`[TRACKING ADDON] Completed scrubbing sync to frame ${frame}`);
  }
  /**
   * Handle video seek
   */
  handleSeek(): void {
    // Don't reset frame buffers on every seek - this breaks tracking continuity
    // Frame buffers should only be reset when explicitly starting fresh tracking
    // or when doing "Track All" operations
    this.stateManager.handleSeek();
  }

  /**
   * Reset the tracker
   */
  resetTracker(): void {
    this.frameProcessor.dispose();
    this.stateManager.reset();
  }

  /**
   * Reset frame buffers
   */
  resetFrameBuffers(): void {
    this.frameProcessor.resetFrameBuffers();
    this.stateManager.resetFrameBuffers();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.frameProcessor.dispose();
    this.stateManager.dispose();
    this.isInitialized = false;
  }

  /**
   * Prepare for tracking from current frame (after manual moves)
   */
  prepareForTrackingFromCurrentFrame(canvas: HTMLCanvasElement): void {
    // Convert current video frame to grayscale
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const grayMat = new this.cv.Mat(canvas.height, canvas.width, this.cv.CV_8UC1);
    
    // Convert to grayscale
    const srcMat = this.cv.matFromImageData(imageData);
    this.cv.cvtColor(srcMat, grayMat, this.cv.COLOR_RGBA2GRAY);
    
    this.frameProcessor.prepareForTrackingFromCurrentFrame(grayMat);
    
    // Clean up
    srcMat.delete();
    grayMat.delete();
  }


  // Continuous tracking methods
  enableContinuousTracking(): void {
    this.stateManager.enableContinuousTracking();
  }

  disableContinuousTracking(): void {
    this.stateManager.disableContinuousTracking();  }

  getTrackerState(): any {
    const state = this.stateManager.getTrackerState();
    return {
      ...state,
      hasPrevGray: this.frameProcessor.hasPrevGray(),
      hasCurrGray: this.frameProcessor.hasCurrGray(),
      hasOpenCV: !!this.cv
    };
  }

  getDiagnosticInfo(): any {
    const info = this.stateManager.getDiagnosticInfo();
    return {
      ...info,
      frameCount: this.stateManager.getFrameCount(),
      hasOpenCV: !!this.cv,
      hasFrames: { 
        prev: this.frameProcessor.hasPrevGray(), 
        curr: this.frameProcessor.hasCurrGray() 
      }
    };
  }

  reactivatePoints(): void {
    const points = this.stateManager.getPoints();
    const frameCount = this.stateManager.getFrameCount();
    this.trajectoryManager.reactivatePoints(points, frameCount);
  }

  forceTrackingTest(): string {
    const report = [];
    const frameCount = this.stateManager.getFrameCount();
    report.push(`=== FORCED TRACKING TEST - Frame ${frameCount} ===`);
    
    if (!this.cv || !this.frameProcessor.hasPrevGray() || !this.frameProcessor.hasCurrGray()) {
      report.push('ERROR: Missing OpenCV or frame data');
      return report.join('\n');
    }
    
    // Reactivate all points
    const points = this.stateManager.getPoints();
    points.forEach((point, index) => {
      if (!point.isActive) {
        point.isActive = true;
        point.confidence = 0.8;
        report.push(`Reactivated point ${point.id.substring(0, 8)}`);
      }
    });
    
    // Try tracking
    try {
      const activePoints = this.stateManager.getActivePoints();
      this.performTracking(activePoints);
      report.push('Tracking completed');
    } catch (error) {
      report.push(`ERROR: ${error.toString()}`);
    }
    
    report.push('=== END TEST ===');
    return report.join('\n');  }

  /**
   * Process frame for single-step tracking - uses the same core logic as continuous tracking
   * Both continuous and frame-by-frame use identical frame processing logic
   */
  async processFrameByFrame(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<TrackingPoint[]> {
    // Use the exact same logic as processFrame - no need for separate implementation
    return this.processFrame(videoElement, canvas);
  }

  // Planar Tracking Methods
  addPlanarTracker(centerX: number, centerY: number, videoWidth: number, videoHeight: number, color: string): string {
    const frameCount = this.stateManager.getFrameCount();
    const planarTracker = this.planarTrackerManager.createPlanarTracker(
      centerX, centerY, videoWidth, videoHeight, color, frameCount
    );
    
    // Generate feature points for the planar tracker
    const featurePoints = this.planarTrackerManager.generateFeaturePoints(planarTracker, frameCount);
    planarTracker.featurePoints = featurePoints;
    
    // Add feature points to the main tracking system
    featurePoints.forEach(point => {
      this.stateManager.addPoint(point);
    });
    
    // Store planar tracker in state manager
    this.stateManager.addPlanarTracker(planarTracker);
    
    return planarTracker.id;
  }

  removePlanarTracker(trackerId: string): boolean {
    const planarTracker = this.stateManager.findPlanarTracker(trackerId);
    if (!planarTracker) {
      return false;
    }
    
    // Remove all associated feature points
    planarTracker.featurePoints.forEach(point => {
      this.stateManager.removePoint(point.id);
    });
    
    // Remove the planar tracker itself
    return this.stateManager.removePlanarTracker(trackerId);
  }

  updatePlanarTrackerCorner(trackerId: string, cornerIndex: number, newX: number, newY: number): boolean {
    const planarTracker = this.stateManager.findPlanarTracker(trackerId);
    if (!planarTracker) {
      return false;
    }
    
    this.planarTrackerManager.updateCornerPosition(planarTracker, cornerIndex, newX, newY);
    return true;
  }

  getPlanarTrackers(): PlanarTracker[] {
    return this.stateManager.getPlanarTrackers();
  }

  clearAllPlanarTrackers(): void {
    const planarTrackers = this.stateManager.getPlanarTrackers();
    planarTrackers.forEach(tracker => {
      this.removePlanarTracker(tracker.id);
    });
  }
  processPlanarTracking(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): void {
    if (!this.isInitialized || !this.cv) {
      return;
    }

    const planarTrackers = this.stateManager.getActivePlanarTrackers();
    const frameCount = this.stateManager.getFrameCount();
    
    console.log('[TRACKING ADDON] Processing planar tracking, frame:', frameCount, 'trackers:', planarTrackers.length);
    
    planarTrackers.forEach(planarTracker => {
      // Track feature points using existing optical flow
      const activeFeatures = planarTracker.featurePoints.filter(p => p.isActive);
      
      console.log('[TRACKING ADDON] Planar tracker', planarTracker.id, 'has', activeFeatures.length, 'active features');
      
      if (activeFeatures.length >= 4) {
        // Update homography based on tracked features
        const homographyData = this.planarTrackerManager.updatePlanarTrackerFromFeatures(
          planarTracker, activeFeatures, frameCount
        );
        
        if (homographyData && homographyData.confidence > 0.3) {
          planarTracker.isActive = true;
          planarTracker.confidence = homographyData.confidence;
          console.log('[TRACKING ADDON] Planar tracker updated successfully, confidence:', homographyData.confidence);
        } else {
          // Disable planar tracker if tracking quality is poor
          planarTracker.isActive = false;
          planarTracker.confidence = 0;
          console.log('[TRACKING ADDON] Planar tracker disabled - low confidence');
        }
      } else {
        // Not enough feature points for reliable tracking
        planarTracker.isActive = false;
        planarTracker.confidence = 0;
        console.log('[TRACKING ADDON] Planar tracker disabled - insufficient features');
      }
    });
  }
}
