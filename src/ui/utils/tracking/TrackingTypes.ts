// Core tracking types and interfaces

export interface TrackingPoint {
  id: string;
  x: number;
  y: number;
  confidence: number;
  isActive: boolean;
  trajectory: Array<{ x: number; y: number; frame: number }>;
  searchRadius: number;
  lastManualMoveFrame?: number; // Track when point was last manually positioned
  // Legacy maps - keeping for compatibility but will not be used in new logic
  manualPositions: Map<number, { x: number; y: number }>;
  trackedPositions: Map<number, { x: number; y: number }>;
  // NEW: Single source of truth for positions - ONE position per frame
  framePositions: Map<number, { x: number; y: number }>;
}

export interface TrackingOptions {
  winSize: { width: number; height: number };
  maxLevel: number;
  criteria: {
    type: number;
    maxCount: number;
    epsilon: number;
  };
  minEigThreshold: number;
  qualityLevel: number;
  minDistance: number;
  blockSize: number;
  useHarrisDetector: boolean;
  k: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  frame: number;
}

export interface PointWithFramePosition extends TrackingPoint {
  framePosition?: Position;
}

export interface TrajectoryPath {
  pointId: string;
  path: Array<TrajectoryPoint>;
}

// Default tracking options exactly as in original
export const DEFAULT_TRACKING_OPTIONS: TrackingOptions = {
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
  k: 0.04
};
