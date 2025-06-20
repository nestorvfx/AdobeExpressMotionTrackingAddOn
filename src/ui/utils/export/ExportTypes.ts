// Video export types and interfaces
export interface ExportSettings {
  // Output format - WebM prioritized for Adobe Express compatibility and MediaRecorder native support
  format: 'webm' | 'mp4' | 'mov';
  codec: string;
    // Quality settings
  bitrate: number;
  quality: 'low' | 'medium' | 'high';
  
  // Resolution settings
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  
  // Frame rate
  framerate: number;
  
  // Content settings - simplified, no tracking visualizations or text effects
  includeTexts: boolean;
  
  // Advanced settings
  keyframeInterval: number;
  audioIncluded: boolean;
}

export interface ExportProgress {
  stage: 'initializing' | 'decoding' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error';
  progress: number; // 0-100
  currentFrame: number;
  totalFrames: number;
  timeRemaining: number; // seconds
  message: string;
  error?: string;
}

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  filename: string;
  size: number; // bytes
  duration: number; // seconds
  error?: string;
}

export interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  framerate: number;
  codec: string;
  hasAudio: boolean;
  fileSize: number;
}

// Quality presets
export const QUALITY_PRESETS: Record<ExportSettings['quality'], Partial<ExportSettings>> = {
  low: {
    bitrate: 1000000, // 1 Mbps
    keyframeInterval: 60,
  },
  medium: {
    bitrate: 3000000, // 3 Mbps
    keyframeInterval: 30,
  },
  high: {
    bitrate: 8000000, // 8 Mbps
    keyframeInterval: 15,
  },
};

// Format configurations - WebM prioritized as it works best with MediaRecorder and Adobe Express
export const FORMAT_CONFIGS = {
  webm: {
    codec: 'vp09.00.50.08', // VP9 - excellent compression and quality
    container: 'webm',
    mimeType: 'video/webm',
    extension: '.webm',
  },
  mp4: {
    codec: 'avc1.42E01F', // H.264 baseline - fallback option
    container: 'mp4',
    mimeType: 'video/mp4',
    extension: '.mp4',
  },
  mov: {
    codec: 'avc1.42E01F', // H.264 in MOV - rare use case
    container: 'mov',
    mimeType: 'video/quicktime',
    extension: '.mov',
  },
};

// Browser capability detection
export interface BrowserCapabilities {
  webCodecsSupported: boolean;
  webAssemblySupported: boolean;
  offscreenCanvasSupported: boolean;
  supportedCodecs: string[];
  hardwareAcceleration: boolean;
}
