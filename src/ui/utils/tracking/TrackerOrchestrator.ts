import { TrackingPoint, TrackingOptions } from './TrackingTypes';
import { MinimalDebugger } from './MinimalDebugger';
import { FrameProcessor } from './FrameProcessor';
import { TrajectoryManager } from './TrajectoryManager';
import { OpticalFlowEngine } from './OpticalFlowEngine';
import { StateManager } from './StateManager';

/**
 * TrackerOrchestrator is the main coordinator that brings together all tracking modules.
 * It manages the high-level tracking workflow and coordinates between different components.
 */
export class TrackerOrchestrator {
  private cv: any = null;
  private options: TrackingOptions;
  private logger: MinimalDebugger;
  private frameProcessor: FrameProcessor;
  private trajectoryManager: TrajectoryManager;
  private opticalFlowEngine: OpticalFlowEngine | null = null;
  private stateManager: StateManager;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;

  constructor(options?: Partial<TrackingOptions>) {
    this.options = {
      winSize: { width: 29, height: 29 }, // Increased by 40% from 21x21 for better feature detection
      maxLevel: 3, // Increased from 2 for multi-scale tracking
      criteria: {
        type: 0, // Will be set properly after OpenCV initialization
        maxCount: 30, // Increased from 10 for better convergence
        epsilon: 0.01 // Reduced from 0.03 for better precision
      },
      minEigThreshold: 1e-4, // Standard OpenCV default
      qualityLevel: 0.3,
      minDistance: 7,
      blockSize: 7,
      useHarrisDetector: false,
      k: 0.04,
      ...options
    };    this.logger = new MinimalDebugger();
    this.stateManager = new StateManager(this.logger);
    this.frameProcessor = new FrameProcessor(this.logger);
    this.trajectoryManager = new TrajectoryManager(this.logger);
  }

  /**
   * Initialize OpenCV and set up the tracker
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.cv) {
      return true;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = new Promise<boolean>(async (resolve) => {
      try {        if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.imread) {
          this.cv = (window as any).cv;
          this.isInitialized = true;
          this.stateManager.setInitialized(true);
          this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
          this.frameProcessor.setOpenCV(this.cv);
          this.opticalFlowEngine = new OpticalFlowEngine(this.cv, this.options, this.logger);
          resolve(true);
          return;
        }        const handleOpenCvLoaded = () => {
          if ((window as any).cv && (window as any).cv.imread) {
            this.cv = (window as any).cv;
            this.isInitialized = true;
            this.stateManager.setInitialized(true);
            this.options.criteria.type = this.cv.TERM_CRITERIA_EPS | this.cv.TERM_CRITERIA_COUNT;
            this.frameProcessor.setOpenCV(this.cv);
            this.opticalFlowEngine = new OpticalFlowEngine(this.cv, this.options, this.logger);
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

  /**
   * Main frame processing method
   */
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
        };

        if (!this.frameProcessor.hasPrevGray()) {
          this.frameProcessor.initializeFrames(newGray);
          this.logger.log(frameCount, 'FRAME_INITIALIZATION', {
            ...beforeState,
            action: 'first_frame_setup'
          });        } else if (points.length > 0) {
          const activePointsBeforeTracking = points.filter(p => p.isActive);
          
          this.frameProcessor.updateCurrentFrame(newGray);
          
          // Points already have their correct positions from scrubbing/previous operations
          // No need to calculate - use current visual positions as tracking input
          
          this.logger.log(frameCount, 'FRAME_PROCESSING', {
            ...beforeState,
            action: 'updating_frames_using_current_positions',
            willTrack: activePointsBeforeTracking.length > 0,            pointPositions: points.map(p => ({
              id: p.id.substring(0, 8),
              currentPos: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 },
              hasPositionForFrame: p.framePositions.has(frameCount),
              isActive: p.isActive,
              confidence: p.confidence
            }))
          });
          
          if (activePointsBeforeTracking.length > 0) {
            this.performTracking(activePointsBeforeTracking);
          } else {
            this.logger.log(frameCount, 'TRACKING_SKIPPED', {
              reason: 'no_active_points',
              inactivePoints: points.map(p => ({
                id: p.id.substring(0, 6),
                confidence: p.confidence,
                isActive: p.isActive
              }))
            }, 'warn');
          }
          
          this.frameProcessor.swapFrames();
        } else {
          this.frameProcessor.resetFrames(newGray);
          this.logger.log(frameCount, 'FRAME_PROCESSING', {
            ...beforeState,
            action: 'no_points_reset_frames'
          });
        }
      } finally {
        if (newGray) {
          newGray.delete();
        }
      }      src.delete();      this.stateManager.incrementFrameCount();

      const activePointsAfter = this.stateManager.getActivePoints();
      const finalFrameCount = this.stateManager.getFrameCount() - 1;
      
      this.logger.log(finalFrameCount, 'FRAME_COMPLETE', {
        activePointsReturned: activePointsAfter.length,
        totalPoints: this.stateManager.getTotalPointCount()
      });

      return activePointsAfter;
    } catch (error) {
      this.logger.log(this.stateManager.getFrameCount(), 'FRAME_PROCESSING_ERROR', {
        error: error.toString(),
        stack: error.stack
      }, 'error');
      return this.stateManager.getPoints();
    }
  }

  /**
   * Performs optical flow tracking on active points
   */
  private performTracking(activePoints: TrackingPoint[]): void {
    if (!this.opticalFlowEngine || !this.frameProcessor.hasPrevGray() || !this.frameProcessor.hasCurrGray()) {
      this.logger.log(this.stateManager.getFrameCount(), 'TRACKING_PREREQUISITES_FAILED', {
        hasOpticalFlowEngine: !!this.opticalFlowEngine,
        hasPrevGray: this.frameProcessor.hasPrevGray(),
        hasCurrGray: this.frameProcessor.hasCurrGray(),
        pointCount: activePoints.length
      }, 'error');
      return;
    }

    // Apply frame skip penalty
    this.stateManager.applyFrameSkipPenalty();

    const frameCount = this.stateManager.getFrameCount();
    const isContinuousTracking = this.stateManager.isContinuousTrackingEnabled();

    if (activePoints.length === 0) {
      this.logger.log(frameCount, 'NO_ACTIVE_POINTS', { 
        totalPoints: this.stateManager.getTotalPointCount(),
        inactivePoints: this.stateManager.getInactivePoints().map(p => ({
          id: p.id.substring(0, 6),
          confidence: p.confidence,
          isActive: p.isActive
        }))
      }, 'warn');
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
      );

      // Process the results and update points
      this.processTrackingResults(trackingResults.results, frameCount);

    } catch (error) {
      this.logger.log(frameCount, 'TRACKING_ERROR', {
        error: error.toString(),
        activePointCount: activePoints.length
      }, 'error');

      // Apply error penalty
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
        this.logger.log(frameCount, 'POINT_NOT_FOUND', {
          pointId: result.point.id.substring(0, 6)
        }, 'warn');
        return;
      }      const point = points[pointIndex];
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

  /**
   * Add a new tracking point
   */
  addTrackingPoint(x: number, y: number): string {
    const frameCount = this.stateManager.getFrameCount();
    const newPoint = this.trajectoryManager.createTrackingPoint(x, y, frameCount);
    this.stateManager.addPoint(newPoint);
    
    this.logger.log(frameCount, 'ADD_TRACKING_POINT', { 
      pointId: newPoint.id.substring(0, 12), 
      x, 
      y, 
      totalPoints: this.stateManager.getTotalPointCount()
    });
    
    // Initialize previous frame if needed
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
  }  /**
   * Update point position manually
   */
  updatePointPosition(pointId: string, newX: number, newY: number): boolean {
    const point = this.stateManager.findPoint(pointId);
    if (!point) {
      this.logger.log(this.stateManager.getFrameCount(), 'MANUAL_MOVE_FAILED', {
        pointId: pointId.substring(0, 6),
        reason: 'POINT_NOT_FOUND',
        requestedPosition: { x: Math.round(newX * 100) / 100, y: Math.round(newY * 100) / 100 }
      }, 'error');
      return false;
    }

    const frameCount = this.stateManager.getFrameCount();
    
    // Log the manual move initiation at orchestrator level
    this.logger.log(frameCount, 'MANUAL_MOVE_INITIATED', {
      pointId: point.id.substring(0, 6),
      currentPosition: { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 },
      targetPosition: { x: Math.round(newX * 100) / 100, y: Math.round(newY * 100) / 100 },
      frame: frameCount
    });
    
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
   */
  syncPointsToFrameForScrubbing(frame: number): void {
    const points = this.stateManager.getPoints();
    this.trajectoryManager.syncAllPointsToFrame(points, frame);
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
    this.stateManager.disableContinuousTracking();
  }

  // Debug and diagnostic methods
  getDebugLogs(): any[] {
    return this.logger.getLogs();
  }

  getFormattedDebugLogs(): string {
    return this.logger.getFormattedLogs();
  }

  exportDebugLogs(): string {
    return this.logger.exportLogs();
  }

  clearDebugLogs(): void {
    this.logger.clear();
  }

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
}
