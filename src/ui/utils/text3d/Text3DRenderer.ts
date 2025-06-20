import { Text3DElement, Text3DRenderContext, Vector2, Vector3 } from './Text3DTypes';
import { Math3D } from './Math3D';
import { TrackingPoint, PlanarTracker } from '../tracking/TrackingTypes';

/**
 * Renders 3D text elements on the canvas with proper tracking integration
 */
export class Text3DRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }
  /**
   * Render all text elements attached to trackers
   */  renderAllTexts(
    texts: Text3DElement[],
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    currentFrame: number,
    hoveredTextId?: string | null  ): void {
    // Reduced logging to prevent spam
    
    texts.forEach((text, index) => {
      if (!text.isVisible) return;      const isHovered = hoveredTextId === text.id;

      if (text.attachedToPointId) {
        const point = trackingPoints.find(p => p.id === text.attachedToPointId);
        if (point) {
          this.renderTextForPoint(text, point, currentFrame, isHovered);
        } else {
          console.log(`[TEXT3D_RENDERER] ERROR: Point tracker not found: ${text.attachedToPointId}`);
        }
      } else {
        const tracker = planarTrackers.find(t => t.id === text.attachedToTrackerId);
        if (tracker) {
          this.renderTextForPlanarTracker(text, tracker, currentFrame, isHovered);
        } else {
          console.log(`[TEXT3D_RENDERER] ERROR: Planar tracker not found: ${text.attachedToTrackerId}`);
        }
      }
    });
  }
  /**
   * Render text attached to a single point tracker
   */
  private renderTextForPoint(
    text: Text3DElement,
    point: TrackingPoint,
    currentFrame: number,
    isHovered: boolean = false
  ): void {
    // Get point position (use current position or frame-specific position)
    const pointPos = this.getPointPositionForFrame(point, currentFrame);
    if (!pointPos) return;

    // Calculate final text position
    const worldPosition: Vector3 = {
      x: pointPos.x + text.transform.position.x,
      y: pointPos.y + text.transform.position.y,
      z: text.transform.position.z
    };

    // Project 3D position to 2D screen coordinates
    const screenPos = Math3D.projectToScreen(
      worldPosition,
      this.ctx.canvas.width,
      this.ctx.canvas.height
    );

    // Render the text
    this.renderTextAtPosition(text, screenPos, worldPosition.z, isHovered);
  }

  /**
   * Render text attached to a planar tracker
   */
  private renderTextForPlanarTracker(
    text: Text3DElement,
    tracker: PlanarTracker,
    currentFrame: number,
    isHovered: boolean = false
  ): void {
    // Get tracker center position
    const trackerCenter = tracker.center;

    // Apply homography transformation if available
    let transformedPosition = {
      x: trackerCenter.x + text.transform.position.x,
      y: trackerCenter.y + text.transform.position.y,
      z: text.transform.position.z
    };

    // Apply current homography if available
    if (tracker.homographyMatrix) {
      transformedPosition = Math3D.applyPlanarHomography(
        transformedPosition,
        tracker.homographyMatrix
      );
    }

    // Project to screen coordinates
    const screenPos = Math3D.projectToScreen(
      transformedPosition,
      this.ctx.canvas.width,
      this.ctx.canvas.height
    );

    // Render the text
    this.renderTextAtPosition(text, screenPos, transformedPosition.z, isHovered);
  }
  /**
   * Render text at a specific screen position
   */  private renderTextAtPosition(
    text: Text3DElement,
    screenPos: Vector2,
    depth: number,
    isHovered: boolean = false
  ): void {
    // Check if position is within canvas bounds
    const canvas = this.ctx.canvas;
    const inBounds = screenPos.x >= 0 && screenPos.x <= canvas.width && screenPos.y >= 0 && screenPos.y <= canvas.height;
    
    if (!inBounds) {
      console.log(`[TEXT3D_RENDERER] Text "${text.content}" outside canvas bounds`);
      return;
    }
    
    this.ctx.save();

    // Apply text styling
    this.applyTextStyle(text, depth);

    // Apply 2D transformations (rotation and scale)
    this.ctx.translate(screenPos.x, screenPos.y);
    
    // Apply Z-rotation
    if (text.transform.rotation.z !== 0) {
      this.ctx.rotate(Math3D.degreesToRadians(text.transform.rotation.z));
    }

    // Apply 2D scale
    this.ctx.scale(text.transform.scale.x, text.transform.scale.y);

    // Apply Z-depth perspective scaling
    const cameraZ = 500;
    const distance = cameraZ - depth;
    const perspectiveScale = distance > 0 ? cameraZ / distance : 1.0;
    this.ctx.scale(perspectiveScale, perspectiveScale);

    // Apply 3D rotation effects (simplified 2D representation)
    const rotationEffect = this.calculate3DRotationEffect(text.transform.rotation);
    this.ctx.scale(rotationEffect.scaleX, rotationEffect.scaleY);

    // Calculate opacity for this depth
    const depthOpacity = this.calculateDepthOpacity(depth);

    // Render text with selection outline if needed
    if (text.isSelected) {
      this.renderSelectionOutline(text);
    }

    // Add hover glow effect
    if (isHovered) {
      this.renderHoverGlow(text, depthOpacity);
    }

    // Render the actual text with stroke for better visibility
    this.ctx.fillStyle = this.applyOpacityToColor(text.style.color, depthOpacity);
    this.ctx.strokeStyle = '#000000'; // Black stroke for contrast
    this.ctx.lineWidth = 2;
    
    console.log(`[TEXT3D_RENDERER] About to draw text "${text.content}"`);    
    // Draw stroke first (behind fill)
    this.ctx.strokeText(text.content, 0, 0);
    
    // Draw fill on top
    this.ctx.fillText(text.content, 0, 0);

    // Add selection outline if selected
    if (text.isSelected) {
      this.ctx.strokeStyle = '#ffff00'; // Yellow outline
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(text.content, 0, 0);
    }

    this.ctx.restore();
  }

  /**
   * Apply text styling including depth-based effects
   */
  private applyTextStyle(text: Text3DElement, depth: number): void {
    const style = text.style;
    
    // Build font string
    const fontString = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    this.ctx.font = fontString;
    
    // Apply text alignment
    this.ctx.textAlign = style.textAlign;
    this.ctx.textBaseline = style.textBaseline;
    
    // Apply color with depth-based opacity
    const depthOpacity = this.calculateDepthOpacity(depth);
    this.ctx.fillStyle = this.applyOpacityToColor(style.color, depthOpacity);
  }

  /**
   * Calculate 3D rotation effect as 2D scale factors
   */
  private calculate3DRotationEffect(rotation: Vector3): { scaleX: number; scaleY: number } {
    // Simplified 3D rotation effect using cosine for foreshortening
    const xRotRad = Math3D.degreesToRadians(rotation.x);
    const yRotRad = Math3D.degreesToRadians(rotation.y);
    
    return {
      scaleX: Math.cos(yRotRad), // Y rotation affects X scale
      scaleY: Math.cos(xRotRad)  // X rotation affects Y scale
    };
  }

  /**
   * Calculate opacity based on depth (further = more transparent)
   */  private calculateDepthOpacity(depth: number): number {
    // Opacity based on distance from camera (at Z=500)
    const cameraZ = 500;
    const distance = Math.abs(cameraZ - depth);
    
    // Keep full opacity for reasonable distances, fade only for extreme distances
    const fadeStartDistance = 300;
    const fadeEndDistance = 800;
    
    if (distance <= fadeStartDistance) {
      return 1.0; // Full opacity
    } else if (distance >= fadeEndDistance) {
      return 0.3; // Minimum opacity
    } else {
      // Linear fade between start and end
      const fadeProgress = (distance - fadeStartDistance) / (fadeEndDistance - fadeStartDistance);
      return Math3D.lerp(1.0, 0.3, fadeProgress);
    }
  }

  /**
   * Apply opacity to a color string
   */
  private applyOpacityToColor(color: string, opacity: number): string {
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    
    // Handle rgb/rgba colors
    if (color.startsWith('rgb')) {
      // Simple approach: replace 'rgb' with 'rgba' and add opacity
      return color.replace('rgb(', `rgba(`).replace(')', `, ${opacity})`);
    }
    
    // Fallback
    return color;
  }

  /**
   * Render selection outline around text
   */
  private renderSelectionOutline(text: Text3DElement): void {
    // Get text metrics for bounding box
    const metrics = this.ctx.measureText(text.content);
    const width = metrics.width;
    const height = text.style.fontSize;
    
    // Draw selection rectangle
    this.ctx.strokeStyle = '#ffff00'; // Yellow
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 3]); // Dashed line
    
    this.ctx.strokeRect(
      -width / 2,
      -height / 2,
      width,
      height
    );
    
    this.ctx.setLineDash([]); // Reset line dash
  }

  /**
   * Render hover glow effect for text
   */
  private renderHoverGlow(text: Text3DElement, depthOpacity: number): void {
    // Create a glow effect by drawing the text multiple times with increasing size and decreasing opacity
    const glowColor = '#ffffff'; // White glow
    const glowLayers = 3;
    
    this.ctx.save();
    
    for (let i = glowLayers; i > 0; i--) {
      const glowSize = i * 2;
      const glowOpacity = (depthOpacity * 0.3) / i; // Fade out each layer
      
      this.ctx.strokeStyle = this.applyOpacityToColor(glowColor, glowOpacity);
      this.ctx.lineWidth = glowSize;
      this.ctx.strokeText(text.content, 0, 0);
    }
    
    this.ctx.restore();
  }

  /**
   * Get point position for a specific frame
   */
  private getPointPositionForFrame(point: TrackingPoint, frame: number): Vector2 | null {
    // Use framePositions map for frame-specific position
    const framePos = point.framePositions.get(frame);
    if (framePos) {
      return framePos;
    }

    // Fallback to current position
    return { x: point.x, y: point.y };
  }

  /**
   * Get text bounds for hit testing
   */
  getTextBounds(text: Text3DElement, screenPos: Vector2): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    this.ctx.save();
    this.applyTextStyle(text, 0); // Use depth 0 for measuring
    
    const metrics = this.ctx.measureText(text.content);
    const width = metrics.width * text.transform.scale.x;
    const height = text.style.fontSize * text.transform.scale.y;
    
    this.ctx.restore();
    
    return {
      x: screenPos.x - width / 2,
      y: screenPos.y - height / 2,
      width,
      height
    };
  }

  /**
   * Test if a mouse position hits a text element
   */
  hitTestText(
    text: Text3DElement,
    mousePos: Vector2,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    currentFrame: number
  ): boolean {
    if (!text.isVisible) return false;

    // Get text screen position
    let screenPos: Vector2;

    if (text.attachedToPointId) {
      const point = trackingPoints.find(p => p.id === text.attachedToPointId);
      if (!point) return false;
      
      const pointPos = this.getPointPositionForFrame(point, currentFrame);
      if (!pointPos) return false;
      
      screenPos = {
        x: pointPos.x + text.transform.position.x,
        y: pointPos.y + text.transform.position.y
      };
    } else {
      const tracker = planarTrackers.find(t => t.id === text.attachedToTrackerId);
      if (!tracker) return false;
      
      screenPos = {
        x: tracker.center.x + text.transform.position.x,
        y: tracker.center.y + text.transform.position.y
      };
    }

    // Get text bounds and test hit
    const bounds = this.getTextBounds(text, screenPos);
    
    return (
      mousePos.x >= bounds.x &&
      mousePos.x <= bounds.x + bounds.width &&
      mousePos.y >= bounds.y &&
      mousePos.y <= bounds.y + bounds.height
    );
  }
}
