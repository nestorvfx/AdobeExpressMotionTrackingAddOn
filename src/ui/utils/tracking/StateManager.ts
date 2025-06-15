import { TrackingPoint } from './TrackingTypes';
import { MinimalDebugger } from './MinimalDebugger';

/**
 * StateManager handles the overall state of the tracking system,
 * including frame management, point collection, and initialization state.
 */
export class StateManager {
  private logger: MinimalDebugger;
  private frameCount: number = 0;
  private lastProcessedFrame: number | null = null;
  private points: TrackingPoint[] = [];
  private isInitialized: boolean = false;
  private isContinuousTracking: boolean = false;

  constructor(logger: MinimalDebugger) {
    this.logger = logger;
  }

  // Frame management
  getFrameCount(): number {
    return this.frameCount;
  }

  setFrameCount(frame: number): void {
    this.frameCount = frame;
  }

  incrementFrameCount(): void {
    this.frameCount++;
  }

  getLastProcessedFrame(): number | null {
    return this.lastProcessedFrame;
  }

  setLastProcessedFrame(frame: number): void {
    this.lastProcessedFrame = frame;
  }

  // Point management
  getPoints(): TrackingPoint[] {
    return [...this.points];
  }

  setPoints(points: TrackingPoint[]): void {
    this.points = points;
  }

  addPoint(point: TrackingPoint): void {
    this.points.push(point);
  }

  removePoint(pointId: string): boolean {
    const index = this.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      this.points.splice(index, 1);
      return true;
    }
    return false;
  }

  findPoint(pointId: string): TrackingPoint | undefined {
    return this.points.find(p => p.id === pointId);
  }

  findPointIndex(pointId: string): number {
    return this.points.findIndex(p => p.id === pointId);
  }

  getActivePoints(): TrackingPoint[] {
    return this.points.filter(p => p.isActive);
  }

  getInactivePoints(): TrackingPoint[] {
    return this.points.filter(p => !p.isActive);
  }

  clearAllPoints(): void {
    this.points = [];
  }

  getTotalPointCount(): number {
    return this.points.length;
  }

  getActivePointCount(): number {
    return this.points.filter(p => p.isActive).length;
  }

  // Initialization state
  isTrackerInitialized(): boolean {
    return this.isInitialized;
  }

  setInitialized(initialized: boolean): void {
    this.isInitialized = initialized;
  }

  // Continuous tracking mode
  isContinuousTrackingEnabled(): boolean {
    return this.isContinuousTracking;
  }

  enableContinuousTracking(): void {
    this.isContinuousTracking = true;
    this.logger.log(this.frameCount, 'CONTINUOUS_TRACKING_ENABLED', {
      mode: 'fresh_detection_forced',
      activePoints: this.getActivePointCount()
    });
  }

  disableContinuousTracking(): void {
    this.isContinuousTracking = false;    this.logger.log(this.frameCount, 'CONTINUOUS_TRACKING_DISABLED', {
      mode: 'normal_operation'
    });  }

  // Frame scrubbing
  setCurrentFrame(frameNumber: number): void {
    const oldFrame = this.frameCount;
    this.frameCount = frameNumber;
    
    // Removed scrubbing logs to reduce noise - tracking logs will show positions
  }

  // Frame skip penalty handling
  applyFrameSkipPenalty(): void {
    // Less aggressive frame skip penalty
    if (this.lastProcessedFrame !== null && Math.abs(this.frameCount - this.lastProcessedFrame) > 2) { // Changed from 1
      this.points.forEach(point => {
        if (point.isActive) {
          point.confidence = Math.max(0.4, point.confidence * 0.85); // Less aggressive: 0.85 vs 0.7, min 0.4 vs 0.3
        }
      });
    }
    this.lastProcessedFrame = this.frameCount;
  }

  // Error handling for tracking failures
  applyTrackingErrorPenalty(activePoints: TrackingPoint[]): void {
    // Less aggressive confidence degradation on error
    activePoints.forEach(point => {
      const pointIndex = this.findPointIndex(point.id);
      if (pointIndex !== -1) {
        this.points[pointIndex].confidence *= 0.85; // Changed from 0.7
        if (this.points[pointIndex].confidence < 0.05) { // Lowered threshold from 0.1
          this.points[pointIndex].isActive = false;
        }
      }
    });
  }

  // Diagnostic methods
  getTrackerState(): any {
    const activePoints = this.getActivePoints();
    const inactivePoints = this.getInactivePoints();
    const totalConfidence = this.points.reduce((sum, p) => sum + p.confidence, 0);
    const averageConfidence = this.points.length > 0 ? totalConfidence / this.points.length : 0;

    return {
      isInitialized: this.isInitialized,
      frameCount: this.frameCount,
      hasFrames: this.frameCount > 0,
      pointCount: this.points.length,
      activePointCount: activePoints.length,
      lastProcessedFrame: this.lastProcessedFrame,
      // Additional properties expected by DebugModal
      totalPoints: this.points.length,
      activePoints: activePoints.length,
      inactivePoints: inactivePoints.length,
      averageConfidence: averageConfidence,
      pointDetails: this.points.map(p => ({
        id: p.id.substring(0, 8),
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        confidence: Math.round(p.confidence * 1000) / 1000,
        isActive: p.isActive,
        trajectoryLength: p.trajectory.length
      }))
    };
  }

  getDiagnosticInfo(): any {
    return {
      frameCount: this.frameCount,
      points: {
        total: this.points.length,
        active: this.getActivePointCount(),
        inactive: this.getInactivePoints().length,
        details: this.points.map(p => ({
          id: p.id.substring(0, 8),
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
          confidence: Math.round(p.confidence * 1000) / 1000,
          isActive: p.isActive,
          trajectoryLength: p.trajectory.length
        }))
      }
    };
  }

  // Reset methods
  reset(): void {
    this.frameCount = 0;
    this.lastProcessedFrame = null;
    this.isContinuousTracking = false;
  }

  resetFrameBuffers(): void {
    this.lastProcessedFrame = null;
  }

  handleSeek(): void {
    this.lastProcessedFrame = null;
    // Disable continuous tracking mode during seeks to prevent interference
    this.isContinuousTracking = false;
  }

  dispose(): void {
    this.points = [];
    this.isInitialized = false;
    this.frameCount = 0;
    this.lastProcessedFrame = null;
    this.isContinuousTracking = false;
  }
}
