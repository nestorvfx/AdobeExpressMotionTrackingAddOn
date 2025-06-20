import { TrackingPoint, PlanarTracker } from '../tracking/TrackingTypes';
import { Text3DElement } from '../text3d/Text3DTypes';
import { ExportSettings, ExportProgress, ExportResult, QUALITY_PRESETS, FORMAT_CONFIGS, VideoMetadata } from './ExportTypes';
import { CapabilityDetector } from './CapabilityDetector';
import { OverlayRenderer } from './OverlayRenderer';

/**
 * Main video export engine supporting WebCodecs and FFmpeg.wasm
 */
export class VideoExportEngine {
  private capabilities: CapabilityDetector;
  private progressCallback?: (progress: ExportProgress) => void;
  private abortController: AbortController | null = null;

  constructor() {
    this.capabilities = CapabilityDetector.getInstance();
  }

  /**
   * Exports video with tracking overlays and 3D text
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
      // Detect capabilities and choose strategy
      const strategy = await this.capabilities.getRecommendedStrategy();
      
      this.reportProgress({
        stage: 'initializing',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        timeRemaining: 0,
        message: 'Initializing export...',
      });      // Apply quality preset
      const finalSettings = await this.applyQualityPreset(settings, videoBlob);

      // Choose export method based on capabilities
      switch (strategy) {
        case 'webcodecs':
          return await this.exportWithWebCodecs(videoBlob, finalSettings, trackingPoints, planarTrackers, text3DElements);
        
        case 'ffmpeg':
          return await this.exportWithFFmpeg(videoBlob, finalSettings, trackingPoints, planarTrackers, text3DElements);
        
        case 'canvas':
          return await this.exportWithCanvas(videoBlob, finalSettings, trackingPoints, planarTrackers, text3DElements);
        
        default:
          throw new Error('No suitable export method available');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown export error';
      
      this.reportProgress({
        stage: 'error',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        timeRemaining: 0,
        message: 'Export failed',
        error: errorMessage,
      });

      return {
        success: false,
        filename: '',
        size: 0,
        duration: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Cancels ongoing export operation
   */
  cancelExport() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
  private async applyQualityPreset(settings: ExportSettings, videoBlob?: Blob): Promise<ExportSettings> {
    const preset = QUALITY_PRESETS[settings.quality];
    const finalSettings = { ...settings, ...preset };
    
    // For "best" quality, try to match input video properties
    if (settings.quality === 'best' && videoBlob) {
      try {
        const videoMetadata = await this.extractVideoMetadata(videoBlob);
        if (videoMetadata) {
          // Use input video's bitrate if available, otherwise use high default
          const estimatedBitrate = this.estimateBitrate(videoMetadata);
          if (estimatedBitrate > 0) {
            finalSettings.bitrate = estimatedBitrate;
          }
          
          // Match input framerate exactly
          finalSettings.framerate = videoMetadata.framerate;
          
          // Use conservative keyframe interval for best quality
          finalSettings.keyframeInterval = Math.max(5, Math.floor(videoMetadata.framerate / 2));
        }
      } catch (error) {
        console.warn('Could not extract video metadata for best quality, using defaults:', error);
      }
    }
    
    return finalSettings;
  }

  private async extractVideoMetadata(videoBlob: Blob): Promise<VideoMetadata | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(videoBlob);
      
      video.onloadedmetadata = () => {        const metadata: VideoMetadata = {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          framerate: 30, // Default, will try to detect actual framerate
          codec: '',
          hasAudio: true, // Assume audio present, will be refined in future versions
          fileSize: videoBlob.size,
        };
        
        // Try to estimate framerate from video properties
        if (video.duration > 0) {
          // This is an approximation, real framerate detection would need more complex analysis
          metadata.framerate = 30; // Most common, could be enhanced with more sophisticated detection
        }
        
        URL.revokeObjectURL(url);
        resolve(metadata);
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      
      video.src = url;
    });
  }

  private estimateBitrate(metadata: VideoMetadata): number {
    if (!metadata.duration || metadata.duration <= 0) {
      return 8000000; // 8 Mbps default
    }
    
    // Estimate bitrate from file size and duration
    const estimatedBitrate = (metadata.fileSize * 8) / metadata.duration;
    
    // Clamp to reasonable ranges (0.5 Mbps to 50 Mbps)
    const minBitrate = 500000;
    const maxBitrate = 50000000;
    
    return Math.max(minBitrate, Math.min(maxBitrate, estimatedBitrate));
  }

  private async exportWithWebCodecs(
    videoBlob: Blob,
    settings: ExportSettings,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    text3DElements: Text3DElement[]
  ): Promise<ExportResult> {
    const startTime = Date.now();
    
    // Create video element for frame extraction
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;
    
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });

    const totalFrames = Math.floor(video.duration * settings.framerate);
    const outputChunks: Uint8Array[] = [];
    let processedFrames = 0;

    // Initialize overlay renderer
    const renderer = new OverlayRenderer(settings.width, settings.height, true);

    // Set up WebCodecs encoder
    const encoder = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        outputChunks.push(data);
      },
      error: (error) => {
        throw new Error(`Encoding error: ${error.message}`);
      }
    });

    // Configure encoder
    const formatConfig = FORMAT_CONFIGS[settings.format];
    const codec = await this.capabilities.getBestCodec(settings.format, await this.capabilities.detectCapabilities().then(c => c.supportedCodecs));    await encoder.configure({
      codec,
      width: settings.width,
      height: settings.height,
      bitrate: settings.bitrate,
      framerate: settings.framerate,
      hardwareAcceleration: 'prefer-hardware',
    });

    this.reportProgress({
      stage: 'processing',
      progress: 0,
      currentFrame: 0,
      totalFrames,
      timeRemaining: 0,
      message: 'Processing video frames...',
    });

    // Process each frame
    for (let frameNumber = 0; frameNumber < totalFrames; frameNumber++) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Export cancelled');
      }

      // Seek to frame
      const timeSeconds = frameNumber / settings.framerate;
      video.currentTime = timeSeconds;
      
      await new Promise(resolve => {
        video.onseeked = resolve;
      });

      // Create video frame from current video position
      const videoFrame = new VideoFrame(video, {
        timestamp: frameNumber * (1000000 / settings.framerate)
      });

      // Render overlays
      const overlayFrame = renderer.renderFrame(
        videoFrame,
        frameNumber,
        settings,
        trackingPoints,
        planarTrackers,
        text3DElements
      ) as VideoFrame;

      // Encode frame
      encoder.encode(overlayFrame, { keyFrame: frameNumber % settings.keyframeInterval === 0 });

      // Cleanup
      videoFrame.close();
      overlayFrame.close();

      processedFrames++;

      // Update progress
      const progress = (processedFrames / totalFrames) * 100;
      const elapsed = Date.now() - startTime;
      const estimatedTotal = elapsed / (processedFrames / totalFrames);
      const timeRemaining = Math.max(0, (estimatedTotal - elapsed) / 1000);

      this.reportProgress({
        stage: 'encoding',
        progress,
        currentFrame: frameNumber,
        totalFrames,
        timeRemaining,
        message: `Encoding frame ${frameNumber + 1} of ${totalFrames}...`,
      });
    }

    // Finalize encoding
    this.reportProgress({
      stage: 'finalizing',
      progress: 95,
      currentFrame: totalFrames,
      totalFrames,
      timeRemaining: 0,
      message: 'Finalizing video...',
    });

    await encoder.flush();
    encoder.close();
    renderer.dispose();

    // Create final blob
    const totalSize = outputChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const finalData = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const chunk of outputChunks) {
      finalData.set(chunk, offset);
      offset += chunk.length;
    }

    const outputBlob = new Blob([finalData], { type: formatConfig.mimeType });
    const filename = `motion-tracked-video_${Date.now()}${formatConfig.extension}`;

    // Cleanup
    URL.revokeObjectURL(video.src);

    this.reportProgress({
      stage: 'complete',
      progress: 100,
      currentFrame: totalFrames,
      totalFrames,
      timeRemaining: 0,
      message: 'Export complete!',
    });

    return {
      success: true,
      blob: outputBlob,
      filename,
      size: outputBlob.size,
      duration: video.duration,
    };
  }

  private async exportWithFFmpeg(
    videoBlob: Blob,
    settings: ExportSettings,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    text3DElements: Text3DElement[]
  ): Promise<ExportResult> {
    // FFmpeg.wasm implementation would go here
    // This is a fallback for browsers without WebCodecs support
    throw new Error('FFmpeg export not yet implemented - use WebCodecs compatible browser');
  }

  private async exportWithCanvas(
    videoBlob: Blob,
    settings: ExportSettings,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    text3DElements: Text3DElement[]
  ): Promise<ExportResult> {
    // Canvas + MediaRecorder implementation would go here
    // This is a basic fallback for maximum compatibility
    throw new Error('Canvas export not yet implemented - use WebCodecs compatible browser');
  }

  private reportProgress(progress: ExportProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}
