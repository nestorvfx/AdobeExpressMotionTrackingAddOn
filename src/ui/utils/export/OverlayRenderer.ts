import { TrackingPoint, PlanarTracker } from '../tracking/TrackingTypes';
import { Text3DElement } from '../text3d/Text3DTypes';
import { ExportSettings } from './ExportTypes';

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
   * Renders 3D text elements with all user-defined styling and tracking motion
   * Preserves exactly what the user created in the text tab - no modifications
   */
  private renderText3DElements(
    frameNumber: number,
    settings: ExportSettings,
    text3DElements: Text3DElement[],
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[]
  ) {
    text3DElements.forEach(textElement => {
      // Skip if text hasn't been created yet
      if (textElement.createdFrame > frameNumber) return;

      // Get attachment position (this is where the text follows the tracker)
      const position = this.getTextPosition(textElement, frameNumber, trackingPoints, planarTrackers);
      if (!position) return;

      // Apply text styling - preserve ALL user settings exactly as they were created
      this.ctx.save();
      
      // Set font - preserve user's original font settings
      const fontSize = textElement.style.fontSize || 24;
      const fontFamily = textElement.style.fontFamily || 'Arial';
      const fontWeight = textElement.style.fontWeight || 'normal';
      const fontStyle = textElement.style.fontStyle || 'normal';
      
      this.ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
      this.ctx.textAlign = textElement.style.textAlign || 'center';
      this.ctx.textBaseline = textElement.style.textBaseline || 'middle';

      // Calculate final position with user's transform
      const finalX = position.x + textElement.transform.position.x;
      const finalY = position.y + textElement.transform.position.y;

      // Apply rotation if the user set it
      if (textElement.transform.rotation.z !== 0) {
        this.ctx.translate(finalX, finalY);
        this.ctx.rotate((textElement.transform.rotation.z * Math.PI) / 180);
        this.ctx.translate(-finalX, -finalY);
      }

      // Apply scale if the user set it
      const scaleX = textElement.transform.scale.x;
      const scaleY = textElement.transform.scale.y;
      if (scaleX !== 1 || scaleY !== 1) {
        this.ctx.scale(scaleX, scaleY);
      }

      // Render the text exactly as the user created it
      // Use the user's original color and styling
      this.ctx.fillStyle = textElement.style.color || 'white';
      
      // Draw the main text
      this.ctx.fillText(textElement.content, finalX, finalY);

      this.ctx.restore();
    });
  }

  /**
   * Gets the position where the text should be rendered based on its tracking attachment
   */
  private getTextPosition(
    textElement: Text3DElement,
    frameNumber: number,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[]
  ): { x: number; y: number } | null {
    // If attached to a point tracker, follow that point
    if (textElement.attachedToPointId) {
      const point = trackingPoints.find(p => p.id === textElement.attachedToPointId);
      if (!point) return null;

      const pos = point.framePositions?.get(frameNumber) || { x: point.x, y: point.y };
      return pos;
    }

    // If attached to a planar tracker, follow that tracker's center
    if (textElement.attachedToTrackerId) {
      const tracker = planarTrackers.find(t => t.id === textElement.attachedToTrackerId);
      if (!tracker) return null;

      // Get center position for current frame
      let center = tracker.center;
      if (tracker.trajectory && tracker.trajectory.length > 0) {
        const frameEntry = tracker.trajectory.find(t => t.frame === frameNumber);
        if (frameEntry) {
          center = frameEntry.center;
        }
      }

      return center;
    }

    // If not attached to any tracker, return static position
    return { x: textElement.transform.position.x, y: textElement.transform.position.y };
  }

  /**
   * Releases resources
   */
  dispose() {
    // Canvas cleanup is handled by GC
  }
}
