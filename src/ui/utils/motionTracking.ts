import { LucasKanadeTracker, TrackingPoint, TrackingOptions } from './lucasKanadeTracker';

export interface VideoTrackingSession {
  videoSrc: string;
  fps: number;
  totalFrames: number;
  currentFrame: number;
  tracker: LucasKanadeTracker;
  trackingPoints: TrackingPoint[];
}

export interface TrackingMetadata {
  id: string;
  videoSrc: string;
  fps: number;
  totalFrames: number;
  dateCreated: string;
  dateModified: string;
}

/**
 * Higher-level motion tracking API that manages tracking sessions
 * and provides additional functionality beyond the LucasKanadeTracker
 */
export class MotionTrackingManager {
  private sessions: Map<string, VideoTrackingSession> = new Map();
  private activeSessionId: string | null = null;

  /**
   * Create a new tracking session for a video
   * @param videoSrc Video source URL
   * @param fps Frames per second
   * @param totalFrames Total number of frames
   * @param options Tracking options
   * @returns Session ID
   */
  async createTrackingSession(
    videoSrc: string, 
    fps: number, 
    totalFrames: number, 
    options?: Partial<TrackingOptions>
  ): Promise<string> {
    const sessionId = `session_${Date.now()}`;
    const tracker = new LucasKanadeTracker(options);
    await tracker.initialize();
    
    const session: VideoTrackingSession = {
      videoSrc,
      fps,
      totalFrames,
      currentFrame: 0,
      tracker,
      trackingPoints: []
    };
    
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;
    
    return sessionId;
  }

  /**
   * Get the active tracking session
   * @returns The active tracking session or null if none exists
   */
  getActiveSession(): VideoTrackingSession | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  /**
   * Switch to a different tracking session
   * @param sessionId The session ID to make active
   * @returns True if successful, false if the session doesn't exist
   */
  setActiveSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.activeSessionId = sessionId;
      return true;
    }
    return false;
  }

  /**
   * Add a tracking point to the active session
   * @param x X coordinate (normalized 0-1 or pixel)
   * @param y Y coordinate (normalized 0-1 or pixel)
   * @param frame Current frame number
   * @param canvasWidth Canvas width for coordinate conversion
   * @param canvasHeight Canvas height for coordinate conversion
   * @returns Point ID if successful, null otherwise
   */
  addTrackingPoint(
    x: number, 
    y: number, 
    frame: number,
    canvasWidth?: number,
    canvasHeight?: number
  ): string | null {
    const session = this.getActiveSession();
    if (!session) return null;
    
    // Convert normalized coordinates to pixels if needed
    let pixelX = x;
    let pixelY = y;
    
    if (x <= 1 && canvasWidth) {
      pixelX = x * canvasWidth;
    }
    
    if (y <= 1 && canvasHeight) {
      pixelY = y * canvasHeight;
    }
    
    const pointId = session.tracker.addTrackingPoint(pixelX, pixelY);
    
    // Update tracking points list
    session.trackingPoints = session.tracker.getTrackingPoints();
    
    return pointId;
  }

  /**
   * Process a video frame for tracking
   * @param videoElement Video element
   * @param canvas Canvas element
   * @param frameNumber Current frame number
   * @returns Updated tracking points
   */
  processFrame(
    videoElement: HTMLVideoElement, 
    canvas: HTMLCanvasElement,
    frameNumber?: number
  ): TrackingPoint[] {
    const session = this.getActiveSession();
    if (!session) return [];
    
    if (typeof frameNumber === 'number') {
      session.currentFrame = frameNumber;
    }
    
    const updatedPoints = session.tracker.processFrame(videoElement, canvas);
    session.trackingPoints = updatedPoints;
    
    return updatedPoints;
  }

  /**
   * Remove a tracking point
   * @param pointId Point ID to remove
   * @returns True if successful, false otherwise
   */
  removeTrackingPoint(pointId: string): boolean {
    const session = this.getActiveSession();
    if (!session) return false;
    
    const result = session.tracker.removeTrackingPoint(pointId);
    
    if (result) {
      session.trackingPoints = session.tracker.getTrackingPoints();
    }
    
    return result;
  }

  /**
   * Clear all tracking points
   * @returns True if successful, false if no active session
   */
  clearAllPoints(): boolean {
    const session = this.getActiveSession();
    if (!session) return false;
    
    session.tracker.clearAllPoints();
    session.trackingPoints = [];
    
    return true;
  }

  /**
   * Auto-detect features to track
   * @param maxCorners Maximum number of corners to detect
   * @returns The newly detected tracking points
   */
  autoDetectFeatures(maxCorners: number = 100): TrackingPoint[] {
    const session = this.getActiveSession();
    if (!session) return [];
    
    const newPoints = session.tracker.autoDetectFeatures(maxCorners);
    session.trackingPoints = session.tracker.getTrackingPoints();
    
    return newPoints;
  }

  /**
   * Save tracking data to a JSON object
   * @param sessionId Optional session ID (uses active session if not provided)
   * @returns JSON-serializable tracking data object
   */
  saveTrackingData(sessionId?: string): any {
    const id = sessionId || this.activeSessionId;
    if (!id) return null;
    
    const session = this.sessions.get(id);
    if (!session) return null;
    
    return {
      metadata: {
        id,
        videoSrc: session.videoSrc,
        fps: session.fps,
        totalFrames: session.totalFrames,
        dateCreated: new Date().toISOString(),
        dateModified: new Date().toISOString()
      },
      trackingPoints: session.trackingPoints.map(p => ({
        id: p.id,
        isActive: p.isActive,
        confidence: p.confidence,
        trajectory: p.trajectory
      }))
    };
  }

  /**
   * Load tracking data from a JSON object
   * @param data Tracking data object
   * @returns Session ID if successful, null otherwise
   */
  async loadTrackingData(data: any): Promise<string | null> {
    if (!data?.metadata?.videoSrc || !Array.isArray(data?.trackingPoints)) {
      return null;
    }
    
    try {
      const { metadata, trackingPoints } = data;
      
      // Create a new session
      const sessionId = await this.createTrackingSession(
        metadata.videoSrc,
        metadata.fps || 30,
        metadata.totalFrames || 0
      );
      
      const session = this.sessions.get(sessionId);
      if (!session) return null;
      
      // Restore tracking points
      for (const point of trackingPoints) {
        if (point.trajectory && point.trajectory.length > 0) {
          const firstPoint = point.trajectory[0];
          const pointId = session.tracker.addTrackingPoint(firstPoint.x, firstPoint.y);
          
          // This is a simplified approach - in a real implementation,
          // you would need to properly restore the full trajectory data
        }
      }
      
      session.trackingPoints = session.tracker.getTrackingPoints();
      
      return sessionId;
    } catch (error) {
      console.error('Error loading tracking data:', error);
      return null;
    }
  }

  /**
   * Dispose of a tracking session and its resources
   * @param sessionId Session ID to dispose (uses active session if not provided)
   * @returns True if successful, false otherwise
   */
  disposeSession(sessionId?: string): boolean {
    const id = sessionId || this.activeSessionId;
    if (!id) return false;
    
    const session = this.sessions.get(id);
    if (!session) return false;
    
    session.tracker.dispose();
    this.sessions.delete(id);
    
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
    
    return true;
  }

  /**
   * Dispose all tracking sessions and resources
   */
  disposeAll(): void {
    for (const session of this.sessions.values()) {
      session.tracker.dispose();
    }
    
    this.sessions.clear();
    this.activeSessionId = null;
  }
}

export default MotionTrackingManager;
