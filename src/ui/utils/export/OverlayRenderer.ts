import { TrackingPoint, PlanarTracker } from '../tracking/TrackingTypes';
import { Text3DElement, Vector3 } from '../text3d/Text3DTypes';
import { ExportSettings } from './ExportTypes';
import { Math3D } from '../text3d/Math3D';

/**
 * Renders only 3D text overlays onto video frames (no tracking visualizations)
 * Text follows trackers but no tracking points, paths or overlays are shown
 */
export class OverlayRenderer {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(width: number, height: number, useOffscreen = true) {
    if (useOffscreen && typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
      this.ctx = this.canvas.getContext('2d')!;
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext('2d')!;
    }
  }

  /**
   * Renders a video frame with tracked 3D text only (no tracking overlays)
   */
  renderFrame(
    videoFrame: VideoFrame | HTMLVideoElement | HTMLCanvasElement,
    frameNumber: number,
    settings: ExportSettings,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    text3DElements: Text3DElement[]
  ): VideoFrame | HTMLCanvasElement {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw video frame
    this.ctx.drawImage(videoFrame as any, 0, 0, this.canvas.width, this.canvas.height);

    // Render 3D text only (preserving all user styling and tracking motion)
    if (settings.includeTexts) {
      this.renderText3DElements(frameNumber, settings, text3DElements, trackingPoints, planarTrackers);
    }

    // Return as VideoFrame for WebCodecs or canvas for other methods
    if (this.canvas instanceof OffscreenCanvas) {
      return new VideoFrame(this.canvas, { timestamp: frameNumber * (1000000 / settings.framerate) });
    } else {
      return this.canvas;
    }
  }
  /**
   * Renders 3D text elements using the same algorithm as the preview
   */
  private renderText3DElements(
    frameNumber: number,
    settings: ExportSettings,
    text3DElements: Text3DElement[],
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[]
  ) {    text3DElements.forEach(textElement => {
      // Text should appear throughout the entire video once created
      // (matches preview behavior where text follows tracker across all frames)
      if (!textElement.isVisible) return;

      // Get attachment position using the same algorithm as preview
      const screenPos = this.getTextPosition(textElement, frameNumber, trackingPoints, planarTrackers);
      if (!screenPos) return;

      // Render using the same sophisticated approach as preview
      this.renderTextAtPosition(textElement, screenPos, textElement.transform.position.z);
    });
  }

  /**
   * Render text at a specific screen position (same as preview renderer)
   */
  private renderTextAtPosition(
    text: Text3DElement,
    screenPos: { x: number; y: number },
    depth: number
  ): void {
    // Check if position is within canvas bounds
    const inBounds = screenPos.x >= 0 && screenPos.x <= this.canvas.width && 
                     screenPos.y >= 0 && screenPos.y <= this.canvas.height;
    
    if (!inBounds) return;
    
    this.ctx.save();

    // Apply text styling (same as preview)
    this.applyTextStyle(text, depth);

    // Apply 2D transformations (same as preview)
    this.ctx.translate(screenPos.x, screenPos.y);
    
    // Apply Z-rotation
    if (text.transform.rotation.z !== 0) {
      this.ctx.rotate((text.transform.rotation.z * Math.PI) / 180);
    }

    // Apply 2D scale
    this.ctx.scale(text.transform.scale.x, text.transform.scale.y);

    // Apply Z-depth perspective scaling (same as preview)
    const cameraZ = 500;
    const distance = cameraZ - depth;
    const perspectiveScale = distance > 0 ? cameraZ / distance : 1.0;
    this.ctx.scale(perspectiveScale, perspectiveScale);

    // Apply 3D rotation effects (same as preview)
    const rotationEffect = this.calculate3DRotationEffect(text.transform.rotation);
    this.ctx.scale(rotationEffect.scaleX, rotationEffect.scaleY);

    // Calculate opacity for this depth (same as preview)
    const depthOpacity = this.calculateDepthOpacity(depth);

    // Render the actual text with stroke for better visibility (same as preview)
    this.ctx.fillStyle = this.applyOpacityToColor(text.style.color, depthOpacity);
    this.ctx.strokeStyle = '#000000'; // Black stroke for contrast
    this.ctx.lineWidth = 2;
    
    // Draw stroke first (behind fill)
    this.ctx.strokeText(text.content, 0, 0);
    
    // Draw fill on top
    this.ctx.fillText(text.content, 0, 0);

    this.ctx.restore();
  }

  /**
   * Apply text styling including depth-based effects (same as preview)
   */
  private applyTextStyle(text: Text3DElement, depth: number): void {
    const style = text.style;
    
    // Build font string (same as preview)
    const fontString = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    this.ctx.font = fontString;
    
    // Apply text alignment (same as preview)
    this.ctx.textAlign = style.textAlign || 'center';
    this.ctx.textBaseline = style.textBaseline || 'middle';
  }

  /**
   * Calculate 3D rotation effect (same as preview)
   */
  private calculate3DRotationEffect(rotation: { x: number; y: number; z: number }): { scaleX: number; scaleY: number } {
    // Simplified 3D rotation effect for 2D canvas
    const xRad = (rotation.x * Math.PI) / 180;
    const yRad = (rotation.y * Math.PI) / 180;
    
    return {
      scaleX: Math.cos(yRad), // Y rotation affects X scale
      scaleY: Math.cos(xRad)  // X rotation affects Y scale
    };
  }

  /**
   * Calculate depth-based opacity (same as preview)
   */
  private calculateDepthOpacity(depth: number): number {
    // Objects further away are more transparent
    const maxDepth = 1000;
    const minOpacity = 0.3;
    const opacity = 1.0 - (depth / maxDepth) * (1.0 - minOpacity);
    return Math.max(minOpacity, Math.min(1.0, opacity));
  }

  /**
   * Apply opacity to a color string (same as preview)
   */
  private applyOpacityToColor(color: string, opacity: number): string {
    // Simple opacity application - could be more sophisticated
    if (color.includes('rgb')) {
      return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
    }
    return color; // Fallback for hex colors
  }
  /**
   * Gets the position where the text should be rendered using the same algorithm as the preview
   */
  private getTextPosition(
    textElement: Text3DElement,
    frameNumber: number,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[]
  ): { x: number; y: number } | null {
    // If attached to a point tracker, follow that point with proper frame interpolation
    if (textElement.attachedToPointId) {
      const point = trackingPoints.find(p => p.id === textElement.attachedToPointId);
      if (!point) return null;

      // Get point position for this specific frame (same as preview)
      const pointPos = this.getPointPositionForFrame(point, frameNumber);
      if (!pointPos) return null;

      // Calculate 3D world position
      const worldPosition: Vector3 = {
        x: pointPos.x + textElement.transform.position.x,
        y: pointPos.y + textElement.transform.position.y,
        z: textElement.transform.position.z
      };

      // Project to 2D screen coordinates (same as preview)
      const screenPos = Math3D.projectToScreen(
        worldPosition,
        this.canvas.width,
        this.canvas.height
      );

      return screenPos;
    }

    // If attached to a planar tracker, follow that tracker with homography transformation
    if (textElement.attachedToTrackerId) {
      const tracker = planarTrackers.find(t => t.id === textElement.attachedToTrackerId);
      if (!tracker) return null;

      // Get tracker center position
      const trackerCenter = tracker.center;

      // Apply 3D transformation (same as preview)
      let transformedPosition = {
        x: trackerCenter.x + textElement.transform.position.x,
        y: trackerCenter.y + textElement.transform.position.y,
        z: textElement.transform.position.z
      };

      // Apply homography transformation if available (same as preview)
      if (tracker.homographyMatrix) {
        transformedPosition = Math3D.applyPlanarHomography(
          transformedPosition,
          tracker.homographyMatrix
        );
      }

      // Project to 2D screen coordinates
      const screenPos = Math3D.projectToScreen(
        transformedPosition,
        this.canvas.width,
        this.canvas.height
      );

      return screenPos;
    }

    // If not attached to any tracker, return static position
    return { x: textElement.transform.position.x, y: textElement.transform.position.y };
  }  /**
   * Get point position for a specific frame (exact same logic as preview)
   */
  private getPointPositionForFrame(point: TrackingPoint, frameNumber: number): { x: number; y: number } | null {
    // Use framePositions map for frame-specific position (exact same as preview)
    const framePos = point.framePositions.get(frameNumber);
    if (framePos) {
      return framePos;
    }

    // Fallback to current position (exact same as preview)
    return { x: point.x, y: point.y };
  }

  /**
   * Releases resources
   */
  dispose() {
    // Canvas cleanup is handled by GC
  }
}
