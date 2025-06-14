// Debug interfaces exactly as in original

export interface DebugLogEntry {
  timestamp: number;
  frameNumber: number;
  operation: string;
  data: any;
  level: 'info' | 'warn' | 'error';
}

export interface TrackerState {
  isInitialized: boolean;
  frameCount: number;
  hasFrames: boolean;
  hasPrevGray: boolean;
  hasCurrGray: boolean;
  pointCount: number;
  activePointCount: number;
  lastProcessedFrame: number | null;
  hasOpenCV: boolean;
  totalPoints: number;
  activePoints: number;
  inactivePoints: number;
  averageConfidence: number;
  pointDetails: Array<{
    id: string;
    x: number;
    y: number;
    confidence: number;
    isActive: boolean;
    trajectoryLength: number;
  }>;
}

export interface DiagnosticInfo {
  frameCount: number;
  hasOpenCV: boolean;
  hasFrames: { prev: boolean; curr: boolean };
  points: {
    total: number;
    active: number;
    inactive: number;
    details: Array<{
      id: string;
      x: number;
      y: number;
      confidence: number;
      isActive: boolean;
      trajectoryLength: number;
    }>;
  };
}
