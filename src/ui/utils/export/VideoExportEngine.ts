import { TrackingPoint, PlanarTracker } from '../tracking/TrackingTypes';
import { Text3DElement } from '../text3d/Text3DTypes';
import { ExportSettings, ExportProgress, ExportResult, QUALITY_PRESETS } from './ExportTypes';
import { OverlayRenderer } from './OverlayRenderer';

/**
 * Simple video export engine optimized for Adobe Express compatibility
 */
export class VideoExportEngine {
  private progressCallback?: (progress: ExportProgress) => void;
  private abortController: AbortController | null = null;

  /**
   * Exports video with tracking overlays and 3D text
   * Uses the most compatible approach for Adobe Express
   */
  async exportVideo(
    videoBlob: Blob,
    settings: ExportSettings,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    text3DElements: Text3DElement[],
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    this.progressCallback = onProgress;
    this.abortController = new AbortController();

    try {
      this.reportProgress({
        stage: 'initializing',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        timeRemaining: 0,
        message: 'Starting video export...',
      });

      // Apply quality preset
      const finalSettings = this.applyQualityPreset(settings, videoBlob);

      // Export with MediaRecorder - simple and Adobe Express compatible
      return await this.exportWithMediaRecorder(videoBlob, finalSettings, trackingPoints, planarTrackers, text3DElements);
    } catch (error) {
      console.error('Export failed:', error);      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown export error',
        filename: '',
        size: 0,
        duration: 0,
      };
    }
  }

  /**
   * Cancel ongoing export
   */
  cancelExport() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Apply quality preset to settings
   */
  private applyQualityPreset(settings: ExportSettings, videoBlob?: Blob): ExportSettings {
    const preset = QUALITY_PRESETS[settings.quality];
    return { ...settings, ...preset };
  }

  /**
   * Export using MediaRecorder with Adobe Express optimized settings
   */
  private async exportWithMediaRecorder(
    videoBlob: Blob,
    settings: ExportSettings,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    text3DElements: Text3DElement[]
  ): Promise<ExportResult> {
    const startTime = Date.now();

    // Create video element
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    
    await new Promise(resolve => {
      video.onloadedmetadata = resolve;
    });

    const totalFrames = Math.floor(video.duration * settings.framerate);
    
    // Create canvas for compositing
    const canvas = document.createElement('canvas');
    canvas.width = settings.width;
    canvas.height = settings.height;
    const ctx = canvas.getContext('2d')!;
    
    // Initialize overlay renderer
    const renderer = new OverlayRenderer(settings.width, settings.height, false);

    // Set up MediaRecorder with Adobe Express compatible settings
    const stream = canvas.captureStream(settings.framerate);
    
    // Use the most compatible codec for Adobe Express
    let mimeType = 'video/mp4';
    let fileExtension = 'mp4';
    
    // Try to find the best supported codec
    const codecOptions = [
      'video/mp4; codecs="avc1.42E01E,mp4a.40.2"', // H.264 + AAC (most compatible)
      'video/mp4; codecs="avc1.42E01E"',            // H.264 only
      'video/mp4',                                   // Generic MP4
      'video/webm; codecs="vp9,opus"',              // WebM fallback
      'video/webm'                                   // Generic WebM
    ];

    for (const codec of codecOptions) {
      if (MediaRecorder.isTypeSupported(codec)) {
        mimeType = codec;
        fileExtension = codec.startsWith('video/mp4') ? 'mp4' : 'webm';
        break;
      }
    }

    console.log('Using codec:', mimeType);

    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: settings.bitrate,
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const recordingPromise = new Promise<Blob>((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(chunks, { type: mimeType });
        resolve(finalBlob);
      };
      
      mediaRecorder.onerror = (event) => {
        reject(new Error('MediaRecorder error: ' + event));
      };

      // Handle abort
      this.abortController?.signal.addEventListener('abort', () => {
        mediaRecorder.stop();
        reject(new Error('Export cancelled'));
      });
    });

    // Start recording
    mediaRecorder.start();

    // Render frames
    let currentFrame = 0;
    const frameTime = 1 / settings.framerate;
      this.reportProgress({
      stage: 'processing',
      progress: 0,
      currentFrame: 0,
      totalFrames,
      timeRemaining: 0,
      message: 'Rendering video frames...',
    });

    for (let time = 0; time < video.duration; time += frameTime) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Export cancelled');
      }

      // Seek to current time
      video.currentTime = time;
      await new Promise(resolve => {
        video.onseeked = resolve;
        if (video.readyState >= 2) resolve(undefined); // Already seeked
      });

      // Clear canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);      // Render 3D text overlays
      if (text3DElements.length > 0) {
        // Use the OverlayRenderer's renderFrame method to get the frame
        const renderedFrame = renderer.renderFrame(video, currentFrame, settings, trackingPoints, planarTrackers, text3DElements);
        
        // Draw the rendered frame back to our canvas
        if (renderedFrame instanceof HTMLCanvasElement) {
          ctx.drawImage(renderedFrame, 0, 0, canvas.width, canvas.height);
        }
      }

      currentFrame++;
      
      // Update progress
      const progress = (currentFrame / totalFrames) * 100;
      const elapsed = Date.now() - startTime;
      const estimated = elapsed / progress * 100;
      const remaining = Math.max(0, estimated - elapsed);
        this.reportProgress({
        stage: 'processing',
        progress,
        currentFrame,
        totalFrames,
        timeRemaining: remaining,
        message: `Rendering frame ${currentFrame} of ${totalFrames}...`,
      });

      // Allow browser to update
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Stop recording and finalize
    this.reportProgress({
      stage: 'finalizing',
      progress: 95,
      currentFrame: totalFrames,
      totalFrames,
      timeRemaining: 0,
      message: 'Finalizing video...',
    });

    mediaRecorder.stop();
    const resultBlob = await recordingPromise;

    // Clean up
    URL.revokeObjectURL(video.src);
    
    const duration = Date.now() - startTime;
    const filename = `motion-tracking-export.${fileExtension}`;

    this.reportProgress({
      stage: 'complete',
      progress: 100,
      currentFrame: totalFrames,
      totalFrames,
      timeRemaining: 0,
      message: 'Export complete!',
    });    return {
      success: true,
      blob: resultBlob,
      filename,
      size: resultBlob.size,
      duration: Math.round(duration / 1000),
    };
  }

  /**
   * Report progress to callback
   */
  private reportProgress(progress: ExportProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}
