import { BrowserCapabilities, FORMAT_CONFIGS } from './ExportTypes';

/**
 * Detects browser capabilities for video processing
 */
export class CapabilityDetector {
  private static instance: CapabilityDetector;
  private capabilities: BrowserCapabilities | null = null;

  static getInstance(): CapabilityDetector {
    if (!CapabilityDetector.instance) {
      CapabilityDetector.instance = new CapabilityDetector();
    }
    return CapabilityDetector.instance;
  }

  async detectCapabilities(): Promise<BrowserCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    const capabilities: BrowserCapabilities = {
      webCodecsSupported: this.isWebCodecsSupported(),
      webAssemblySupported: this.isWebAssemblySupported(),
      offscreenCanvasSupported: this.isOffscreenCanvasSupported(),
      supportedCodecs: await this.detectSupportedCodecs(),
      hardwareAcceleration: await this.detectHardwareAcceleration(),
    };

    this.capabilities = capabilities;
    return capabilities;
  }

  private isWebCodecsSupported(): boolean {
    return (
      typeof VideoEncoder !== 'undefined' &&
      typeof VideoDecoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined' &&
      typeof EncodedVideoChunk !== 'undefined'
    );
  }

  private isWebAssemblySupported(): boolean {
    return typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function';
  }

  private isOffscreenCanvasSupported(): boolean {
    return typeof OffscreenCanvas !== 'undefined';
  }

  private async detectSupportedCodecs(): Promise<string[]> {
    const codecs = [
      'avc1.42E01F', // H.264 baseline
      'avc1.42E01E', // H.264 baseline
      'avc1.4D401F', // H.264 main
      'vp09.00.50.08', // VP9
      'vp8', // VP8
      'av01.0.05M.08', // AV1
    ];

    const supportedCodecs: string[] = [];

    if (!this.isWebCodecsSupported()) {
      return supportedCodecs;
    }

    for (const codec of codecs) {
      try {
        const encoderSupported = await VideoEncoder.isConfigSupported({
          codec,
          width: 1920,
          height: 1080,
          bitrate: 1000000,
          framerate: 30,
        });

        const decoderSupported = await VideoDecoder.isConfigSupported({
          codec,
        });

        if (encoderSupported.supported && decoderSupported.supported) {
          supportedCodecs.push(codec);
        }
      } catch (error) {
        // Codec not supported
        console.debug(`Codec ${codec} not supported:`, error);
      }
    }

    return supportedCodecs;
  }

  private async detectHardwareAcceleration(): Promise<boolean> {
    if (!this.isWebCodecsSupported()) {
      return false;
    }

    try {
      // Try to create a hardware-accelerated encoder
      const encoder = new VideoEncoder({
        output: () => {},
        error: () => {},
      });

      await encoder.configure({
        codec: 'avc1.42E01F',
        width: 1920,
        height: 1080,
        bitrate: 1000000,
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware',
      });

      encoder.close();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets the best available codec for the given format
   */
  getBestCodec(format: keyof typeof FORMAT_CONFIGS, supportedCodecs: string[]): string {
    const formatConfig = FORMAT_CONFIGS[format];
    const preferredCodec = formatConfig.codec;

    // If preferred codec is supported, use it
    if (supportedCodecs.includes(preferredCodec)) {
      return preferredCodec;
    }

    // Fallback based on format
    switch (format) {
      case 'mp4':
        // Prefer H.264 variants for MP4
        const h264Codecs = supportedCodecs.filter(codec => codec.startsWith('avc1'));
        return h264Codecs[0] || supportedCodecs[0] || 'avc1.42E01F';
      
      case 'webm':
        // Prefer VP9, fallback to VP8
        if (supportedCodecs.includes('vp09.00.50.08')) return 'vp09.00.50.08';
        if (supportedCodecs.includes('vp8')) return 'vp8';
        return supportedCodecs[0] || 'vp09.00.50.08';
      
      case 'mov':
        // Same as MP4, prefer H.264
        const h264CodecsForMov = supportedCodecs.filter(codec => codec.startsWith('avc1'));
        return h264CodecsForMov[0] || supportedCodecs[0] || 'avc1.42E01F';
      
      default:
        return supportedCodecs[0] || preferredCodec;
    }
  }

  /**
   * Checks if the browser can handle the specified export settings
   */
  async canExportWithSettings(format: keyof typeof FORMAT_CONFIGS, width: number, height: number): Promise<boolean> {
    const capabilities = await this.detectCapabilities();
    
    if (!capabilities.webCodecsSupported && !capabilities.webAssemblySupported) {
      return false;
    }

    // Check resolution limits (rough estimates)
    const maxPixels = width * height;
    const is4K = maxPixels > 3840 * 2160;
    const isFullHD = maxPixels > 1920 * 1080;

    // If it's 4K, we need hardware acceleration or it will be very slow
    if (is4K && !capabilities.hardwareAcceleration && !capabilities.webAssemblySupported) {
      return false;
    }

    return true;
  }

  /**
   * Gets recommended export strategy based on capabilities
   */
  async getRecommendedStrategy(): Promise<'webcodecs' | 'ffmpeg' | 'canvas'> {
    const capabilities = await this.detectCapabilities();

    if (capabilities.webCodecsSupported && capabilities.supportedCodecs.length > 0) {
      return 'webcodecs';
    }

    if (capabilities.webAssemblySupported) {
      return 'ffmpeg';
    }

    return 'canvas';
  }
}
