// Core tracking types and interfaces

export interface TrackingPoint {
  id: string;
  x: number;
  y: number;
  confidence: number;
  isActive: boolean;
  trajectory: Array<{ x: number; y: number; frame: number }>;
  searchRadius: number;
  // Single source of truth for positions - ONE position per frame
  framePositions: Map<number, { x: number; y: number }>;
  // Adaptive window size based on search radius
  adaptiveWindowSize?: number;
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

// Planar Tracking Types
export interface PlanarCorner {
  id: string;
  x: number;
  y: number;
  isActive: boolean;
}

export interface PlanarTracker {
  id: string;
  corners: [PlanarCorner, PlanarCorner, PlanarCorner, PlanarCorner]; // Top-left, top-right, bottom-right, bottom-left
  center: Position;
  width: number;
  height: number;
  color: string;
  isActive: boolean;
  confidence: number;
  homographyMatrix: number[] | null; // 3x3 transformation matrix (flattened)
  featurePoints: TrackingPoint[]; // Internal feature points for tracking
  frameHomographies: Map<number, number[]>; // Homography per frame
  trajectory: Array<{ center: Position; corners: Position[]; frame: number }>;
}

export interface HomographyData {
  matrix: number[];
  confidence: number;
  inlierCount: number;
  totalFeatures: number;
}

export type TrackingMode = 'point' | 'planar';
export type InteractionMode = 'scale' | 'move';

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
