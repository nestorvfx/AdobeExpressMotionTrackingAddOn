import { Vector2, Vector3, GizmoInteraction, GIZMO_CONFIG } from './Text3DTypes';
import { Math3D } from './Math3D';

/**
 * Handles 3D gizmo rendering and interaction for text elements
 */
export class GizmoRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentInteraction: GizmoInteraction | null = null;
  private hoveredAxis: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /**
   * Render 3D transform gizmo for a text element
   */
  renderGizmo(
    textCenter: Vector2, 
    textRotation: Vector3, 
    showPosition: boolean = true, 
    showRotation: boolean = true, 
    showScale: boolean = false
  ): void {
    this.ctx.save();
    
    // Move to text center
    this.ctx.translate(textCenter.x, textCenter.y);
    
    if (showPosition) {
      this.renderPositionGizmo();
    }
    
    if (showRotation) {
      this.renderRotationGizmo(textRotation);
    }
    
    if (showScale) {
      this.renderScaleHandles(textCenter);
    }
    
    this.ctx.restore();
  }

  /**
   * Render position gizmo (3 colored arrows for X, Y, Z axes)
   */
  private renderPositionGizmo(): void {
    const size = GIZMO_CONFIG.size;
    const lineWidth = GIZMO_CONFIG.lineWidth;
    
    // X-axis (Red)
    this.ctx.strokeStyle = this.getAxisColor('x');
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(size, 0);
    this.ctx.stroke();
    
    // Arrow head for X
    this.ctx.fillStyle = this.getAxisColor('x');
    this.ctx.beginPath();
    this.ctx.moveTo(size, 0);
    this.ctx.lineTo(size - 8, -4);
    this.ctx.lineTo(size - 8, 4);
    this.ctx.closePath();
    this.ctx.fill();
    
    // Y-axis (Green)
    this.ctx.strokeStyle = this.getAxisColor('y');
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(0, -size); // Negative Y for screen coordinates
    this.ctx.stroke();
    
    // Arrow head for Y
    this.ctx.fillStyle = this.getAxisColor('y');
    this.ctx.beginPath();
    this.ctx.moveTo(0, -size);
    this.ctx.lineTo(-4, -size + 8);
    this.ctx.lineTo(4, -size + 8);
    this.ctx.closePath();
    this.ctx.fill();
    
    // Z-axis (Blue) - diagonal for visual representation
    this.ctx.strokeStyle = this.getAxisColor('z');
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(-size * 0.7, -size * 0.7);
    this.ctx.stroke();
    
    // Arrow head for Z
    this.ctx.fillStyle = this.getAxisColor('z');
    this.ctx.beginPath();
    this.ctx.moveTo(-size * 0.7, -size * 0.7);
    this.ctx.lineTo(-size * 0.7 + 6, -size * 0.7 + 2);
    this.ctx.lineTo(-size * 0.7 + 2, -size * 0.7 + 6);
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Render rotation gizmo (3 colored rings for X, Y, Z rotation)
   */
  private renderRotationGizmo(rotation: Vector3): void {
    const radius = GIZMO_CONFIG.size * 0.8;
    const lineWidth = GIZMO_CONFIG.lineWidth;
    
    // Position rotation gizmo above the position gizmo
    this.ctx.translate(0, -GIZMO_CONFIG.size - 20);
    
    // X-axis rotation ring (Red)
    this.ctx.strokeStyle = this.getAxisColor('x-rot');
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, radius, radius * 0.3, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    
    // Y-axis rotation ring (Green)
    this.ctx.strokeStyle = this.getAxisColor('y-rot');
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, radius * 0.3, radius, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    
    // Z-axis rotation ring (Blue)
    this.ctx.strokeStyle = this.getAxisColor('z-rot');
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  /**
   * Render scale handles at text bounding box corners
   */
  private renderScaleHandles(textCenter: Vector2): void {
    // This would be rendered relative to the text bounding box
    // For now, simplified version
    const handleSize = 8;
    const offset = GIZMO_CONFIG.size;
    
    this.ctx.fillStyle = GIZMO_CONFIG.colors.selected;
    
    // Corner handles
    const corners = [
      { x: -offset, y: -offset },
      { x: offset, y: -offset },
      { x: offset, y: offset },
      { x: -offset, y: offset }
    ];
    
    corners.forEach(corner => {
      this.ctx.fillRect(
        corner.x - handleSize / 2,
        corner.y - handleSize / 2,
        handleSize,
        handleSize
      );
    });
  }

  /**
   * Get color for specific axis based on hover/selection state
   */
  private getAxisColor(axis: string): string {
    if (this.hoveredAxis === axis) {
      return GIZMO_CONFIG.colors.hover;
    }
    
    if (this.currentInteraction?.axis === axis.split('-')[0]) {
      return GIZMO_CONFIG.colors.selected;
    }
    
    switch (axis.split('-')[0]) {
      case 'x': return GIZMO_CONFIG.colors.x;
      case 'y': return GIZMO_CONFIG.colors.y;
      case 'z': return GIZMO_CONFIG.colors.z;
      default: return GIZMO_CONFIG.colors.x;
    }
  }

  /**
   * Test if mouse position hits a gizmo axis
   */
  hitTestGizmo(
    mousePos: Vector2, 
    textCenter: Vector2
  ): { type: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z' } | null {
    const relativePos = {
      x: mousePos.x - textCenter.x,
      y: mousePos.y - textCenter.y
    };
    
    const hitRadius = 10; // Pixel tolerance for hit testing
    const size = GIZMO_CONFIG.size;
    
    // Test position gizmo axes
    if (Math.abs(relativePos.y) < hitRadius) {
      if (relativePos.x > 0 && relativePos.x < size) {
        return { type: 'position', axis: 'x' };
      }
    }
    
    if (Math.abs(relativePos.x) < hitRadius) {
      if (relativePos.y < 0 && relativePos.y > -size) {
        return { type: 'position', axis: 'y' };
      }
    }
    
    // Test Z-axis (diagonal)
    const zAxisDist = Math3D.distance2D(
      relativePos,
      { x: -size * 0.7, y: -size * 0.7 }
    );
    if (zAxisDist < hitRadius) {
      return { type: 'position', axis: 'z' };
    }
    
    // Test rotation rings
    const rotationCenter = { x: 0, y: -size - 20 };
    const rotRelativePos = {
      x: relativePos.x - rotationCenter.x,
      y: relativePos.y - rotationCenter.y
    };
    
    const distFromCenter = Math3D.distance2D(rotRelativePos, { x: 0, y: 0 });
    const rotRadius = size * 0.8;
    
    if (Math.abs(distFromCenter - rotRadius) < hitRadius) {
      // Determine which rotation axis based on position
      if (Math.abs(rotRelativePos.x) > Math.abs(rotRelativePos.y)) {
        return { type: 'rotation', axis: 'y' };
      } else {
        return { type: 'rotation', axis: 'x' };
      }
    }
    
    return null;
  }

  /**
   * Start gizmo interaction
   */
  startInteraction(
    type: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    startValue: number
  ): void {
    this.currentInteraction = {
      isActive: true,
      type,
      axis,
      startValue,
      currentValue: startValue
    };
  }

  /**
   * Update interaction value
   */
  updateInteraction(newValue: number): void {
    if (this.currentInteraction) {
      this.currentInteraction.currentValue = newValue;
    }
  }

  /**
   * End interaction
   */
  endInteraction(): void {
    this.currentInteraction = null;
    this.hoveredAxis = null;
  }

  /**
   * Set hovered axis for visual feedback
   */
  setHoveredAxis(axis: string | null): void {
    this.hoveredAxis = axis;
  }

  /**
   * Get current interaction state
   */
  getCurrentInteraction(): GizmoInteraction | null {
    return this.currentInteraction;
  }
}
