// 3D Text system types and interfaces

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Transform3D {
  position: Vector3;
  rotation: Vector3; // Euler angles in degrees
  scale: Vector2; // 2D scale for text
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  fontStyle: 'normal' | 'italic';
  color: string;
  textAlign: 'left' | 'center' | 'right';
  textBaseline: 'top' | 'middle' | 'bottom' | 'alphabetic';
}

export interface Text3DElement {
  id: string;
  content: string;
  transform: Transform3D;
  style: TextStyle;
  isSelected: boolean;
  isVisible: boolean;
  attachedToTrackerId: string; // ID of the tracker this text is attached to
  attachedToPointId?: string; // Optional: ID of specific point if attached to single point tracker
  createdFrame: number;
  name: string; // Auto-generated name like "Text 1", "Text 2"
}

export interface Text3DManager {
  // Core operations
  createText(trackerId: string, pointId?: string): Text3DElement;
  updateText(textId: string, updates: Partial<Text3DElement>): void;
  deleteText(textId: string): void;
  
  // Selection management
  selectText(textId: string): void;
  deselectAll(): void;
  getSelectedText(): Text3DElement | null;
  
  // Retrieval
  getAllTexts(): Text3DElement[];
  getTextsForTracker(trackerId: string): Text3DElement[];
  getTextById(textId: string): Text3DElement | null;
  
  // Transform operations
  updateTransform(textId: string, transform: Partial<Transform3D>): void;
  updateStyle(textId: string, style: Partial<TextStyle>): void;
  updateContent(textId: string, content: string): void;
}

export interface GizmoType {
  position: boolean;
  rotation: boolean;
  scale: boolean;
}

export interface GizmoInteraction {
  isActive: boolean;
  type: 'position' | 'rotation' | 'scale' | null;
  axis: 'x' | 'y' | 'z' | null;
  startValue: number;
  currentValue: number;
}

export interface Text3DRenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  videoElement: HTMLVideoElement;
  currentFrame: number;
  isPlaying: boolean;
}

// Default values
export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Arial',  fontSize: 38, // Reduced from 64 (40% smaller)
  fontWeight: 'bold',
  fontStyle: 'normal',
  color: '#ffffff',
  textAlign: 'center',
  textBaseline: 'middle'
};

export const DEFAULT_TRANSFORM: Transform3D = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1.2, y: 1.2 } // Reduced from 2.0 (40% smaller)
};

// Gizmo visual configuration
export const GIZMO_CONFIG = {
  size: 80, // Moderate gizmo size for better usability
  lineWidth: 3, // Good visibility without being too thick
  colors: {
    x: '#ff4444', // Red
    y: '#44ff44', // Green
    z: '#4444ff', // Blue
    selected: '#ffff44', // Yellow
    hover: '#ff8844' // Orange
  },
  opacity: {
    normal: 0.8, // Good visibility
    hover: 0.9,
    selected: 1.0
  }
};
