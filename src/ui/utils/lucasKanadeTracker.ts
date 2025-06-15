// Modular Lucas-Kanade Optical Flow Tracker using OpenCV.js
// This is the new decoupled version that maintains 100% API compatibility with the original

import { TrackingPoint, TrackingOptions } from './tracking/TrackingTypes';
import { DebugLogEntry } from './tracking/DebugTypes';
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

  /**
   * Initialize OpenCV and set up the tracker
   */
  async initialize(): Promise<boolean> {
    return this.orchestrator.initialize();
  }

  /**
   * Process a video frame and return active tracking points
   */
  async processFrame(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<TrackingPoint[]> {
    return this.orchestrator.processFrame(videoElement, canvas);
  }

  /**
   * Add a new tracking point at the specified coordinates
   */
  addTrackingPoint(x: number, y: number): string {
    return this.orchestrator.addTrackingPoint(x, y);
  }

  /**
   * Remove a tracking point by ID
   */
  removeTrackingPoint(pointId: string): boolean {
    return this.orchestrator.removeTrackingPoint(pointId);
  }

  /**
   * Clear all tracking points
   */
  clearAllPoints(): void {
    this.orchestrator.clearAllPoints();
  }
  /**
   * Update a point's position manually
   */
  updatePointPosition(pointId: string, newX: number, newY: number): boolean {
    return this.orchestrator.updatePointPosition(pointId, newX, newY);
  }

  /**
   * Get all tracking points
   */
  getTrackingPoints(): TrackingPoint[] {
    return this.orchestrator.getTrackingPoints();
  }

  /**
   * Get points with their authoritative positions for a specific frame
   */  /**
   * Get trajectory paths for visualization
   */
  getTrajectoryPaths(currentFrame: number, range: number = 5): Array<{
    pointId: string;
    path: Array<{ x: number; y: number; frame: number }>;
  }> {
    return this.orchestrator.getTrajectoryPaths(currentFrame, range);
  }

  /**
   * Get authoritative position for a point at a specific frame (public API)
   */
  public getPointPositionAtFramePublic(pointId: string, frame: number): { x: number; y: number } | null {
    return this.orchestrator.getPointPositionAtFramePublic(pointId, frame);
  }

  /**
   * Update a point's search radius
   */
  updatePointSearchRadius(pointId: string, radius: number): boolean {
    return this.orchestrator.updatePointSearchRadius(pointId, radius);
  }

  /**
   * Manually move a point to a new position (legacy method)
   */
  movePointToPosition(pointId: string, x: number, y: number): boolean {
    return this.orchestrator.movePointToPosition(pointId, x, y);
  }

  /**
   * Reset the entire tracker state
   */
  resetTracker(): void {
    this.orchestrator.resetTracker();
  }

  /**
   * Reset frame buffers (useful after video seeks)
   */
  resetFrameBuffers(): void {
    this.orchestrator.resetFrameBuffers();
  }

  /**
   * Set the current frame number
   */
  setCurrentFrame(frameNumber: number): void {
    this.orchestrator.setCurrentFrame(frameNumber);
  }

  /**
   * Handle video seek operations
   */
  handleSeek(): void {
    this.orchestrator.handleSeek();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.orchestrator.dispose();
  }

  /**
   * Sync points to frame positions (for scrubbing operations only)
   */
  syncPointsToFrameForScrubbing(frame: number): void {
    this.orchestrator.syncPointsToFrameForScrubbing(frame);
  }

  // Debug and diagnostic methods (essential for app compatibility)

  /**
   * Get debug logs
   */
  getDebugLogs(): DebugLogEntry[] {
    return this.orchestrator.getDebugLogs();
  }

  /**
   * Get formatted debug logs as string
   */
  getFormattedDebugLogs(): string {
    return this.orchestrator.getFormattedDebugLogs();
  }

  /**
   * Export debug logs as JSON string
   */
  exportDebugLogs(): string {
    return this.orchestrator.exportDebugLogs();
  }

  /**
   * Clear all debug logs
   */
  clearDebugLogs(): void {
    this.orchestrator.clearDebugLogs();
  }

  /**
   * Get tracker state for debugging
   */
  getTrackerState(): any {
    return this.orchestrator.getTrackerState();
  }

  /**
   * Reactivate inactive points
   */
  reactivatePoints(): void {
    this.orchestrator.reactivatePoints();
  }

  /**
   * Get diagnostic information
   */
  getDiagnosticInfo(): any {
    return this.orchestrator.getDiagnosticInfo();
  }

  /**
   * Force tracking test (for debugging)
   */
  forceTrackingTest(): string {
    return this.orchestrator.forceTrackingTest();
  }

  /**
   * Enable continuous tracking mode
   */
  enableContinuousTracking(): void {
    this.orchestrator.enableContinuousTracking();
  }

  /**
   * Disable continuous tracking mode
   */
  disableContinuousTracking(): void {
    this.orchestrator.disableContinuousTracking();
  }
}

// Export types for compatibility
export { TrackingPoint, TrackingOptions, DebugLogEntry };

// Export the MinimalDebugger class for compatibility
export { MinimalDebugger } from './tracking/MinimalDebugger';

export default LucasKanadeTracker;
