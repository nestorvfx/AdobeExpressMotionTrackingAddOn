// Modular Lucas-Kanade Optical Flow Tracker using OpenCV.js
// This is the new decoupled version that maintains 100% API compatibility with the original

import { TrackingPoint, TrackingOptions } from './tracking/TrackingTypes';
import { TrackerOrchestrator } from './tracking/TrackerOrchestrator';

/**
 * LucasKanadeTracker - Main class that provides the same API as the original monolithic version
 * but now uses a modular architecture with separate components for different responsibilities.
 * 
 * This class maintains 100% API compatibility with the original implementation.
 */
export class LucasKanadeTracker {
  private orchestrator: TrackerOrchestrator;

  constructor(options?: Partial<TrackingOptions>) {
    this.orchestrator = new TrackerOrchestrator(options);
  }
  // Core API methods - direct delegation
  async initialize(): Promise<boolean> { return this.orchestrator.initialize(); }
  async processFrame(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<TrackingPoint[]> { return this.orchestrator.processFrame(videoElement, canvas); }
  addTrackingPoint(x: number, y: number): string { return this.orchestrator.addTrackingPoint(x, y); }
  removeTrackingPoint(pointId: string): boolean { return this.orchestrator.removeTrackingPoint(pointId); }
  clearAllPoints(): void { this.orchestrator.clearAllPoints(); }
  updatePointPosition(pointId: string, newX: number, newY: number): boolean { return this.orchestrator.updatePointPosition(pointId, newX, newY); }
  getTrackingPoints(): TrackingPoint[] { return this.orchestrator.getTrackingPoints(); }

  /**
   * Get points with their authoritative positions for a specific frame
   */  // Trajectory and frame management methods
  getTrajectoryPaths(currentFrame: number, range: number = 5): Array<{ pointId: string; path: Array<{ x: number; y: number; frame: number }>; }> { return this.orchestrator.getTrajectoryPaths(currentFrame, range); }
  getPointPositionAtFramePublic(pointId: string, frame: number): { x: number; y: number } | null { return this.orchestrator.getPointPositionAtFramePublic(pointId, frame); }
  updatePointSearchRadius(pointId: string, radius: number): boolean { return this.orchestrator.updatePointSearchRadius(pointId, radius); }
  movePointToPosition(pointId: string, x: number, y: number): boolean { return this.orchestrator.movePointToPosition(pointId, x, y); }
  resetTracker(): void { this.orchestrator.resetTracker(); }
  resetFrameBuffers(): void { this.orchestrator.resetFrameBuffers(); }
  setCurrentFrame(frameNumber: number): void { this.orchestrator.setCurrentFrame(frameNumber); }
  handleSeek(): void { this.orchestrator.handleSeek(); }
  dispose(): void { this.orchestrator.dispose(); }
  syncPointsToFrameForScrubbing(frame: number): void { this.orchestrator.syncPointsToFrameForScrubbing(frame); }
  // Frame processing and diagnostic methods
  async processFrameByFrame(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<TrackingPoint[]> { return this.orchestrator.processFrameByFrame(videoElement, canvas); }
  getTrackerState(): any { return this.orchestrator.getTrackerState(); }
  reactivatePoints(): void { this.orchestrator.reactivatePoints(); }
  getDiagnosticInfo(): any { return this.orchestrator.getDiagnosticInfo(); }
  forceTrackingTest(): string { return this.orchestrator.forceTrackingTest(); }
  enableContinuousTracking(): void { this.orchestrator.enableContinuousTracking(); }
  disableContinuousTracking(): void { this.orchestrator.disableContinuousTracking(); }
}

export { TrackingPoint, TrackingOptions };

export default LucasKanadeTracker;
