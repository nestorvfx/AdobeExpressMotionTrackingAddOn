# Video Export Implementation

## Overview

The export functionality allows users to create a video file with their tracking overlays and 3D text elements rendered directly onto the video frames. This bypasses Adobe Express SDK limitations by pre-rendering the motion tracking data into a standard video file that can be imported into Adobe Express.

## Architecture

### Core Components

1. **VideoExportEngine** - Main export orchestrator
2. **CapabilityDetector** - Browser feature detection
3. **OverlayRenderer** - Frame-by-frame overlay rendering
4. **ExportPanel** - UI for export settings and controls

### Export Strategies

The system automatically selects the best available export method:

1. **WebCodecs API** (Primary) - Hardware-accelerated, high-performance
2. **FFmpeg.wasm** (Fallback) - Software-based, universal compatibility
3. **Canvas + MediaRecorder** (Emergency) - Basic compatibility

## Browser Support

### WebCodecs Support (Recommended)
- ✅ Chrome 94+
- ✅ Edge 94+  
- ✅ Opera 80+
- ⚠️ Firefox 118+ (partial support)
- ❌ Safari (not supported)

### Fallback Support
- All modern browsers with WebAssembly support
- Consistent behavior across platforms

## Features

### Video Processing
- Frame-accurate video decoding and encoding
- Hardware acceleration when available
- Multiple output formats (MP4, WebM, MOV)
- Quality presets (Low, Medium, High, Ultra)
- Custom resolution and bitrate settings

### Tracking Overlays
- Point tracker visualization with search radius
- Planar tracker boundaries and corners
- Trajectory paths with configurable length
- Color-coded tracking elements

### 3D Text Rendering
- Motion-tracked text positioning
- Font, size, and color customization
- Text effects (shadow, outline, background)
- Transform support (position, rotation, scale)

### Export Options
- Quality presets for different use cases
- Format selection based on browser capabilities
- Progress tracking with time estimates
- Error handling and recovery

## Usage

### Basic Export Flow

1. User completes motion tracking and/or adds 3D text
2. Switches to Export tab
3. Configures export settings (quality, format, content)
4. Clicks "Export Video"
5. System processes video with overlays
6. Downloads completed video file
7. User imports video into Adobe Express

### Export Settings

```typescript
interface ExportSettings {
  // Output format
  format: 'mp4' | 'webm' | 'mov';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  
  // Resolution
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  
  // Content
  includeTexts: boolean;
  showTrackingPoints: boolean;
  showTrackingPaths: boolean;
  
  // Effects
  textShadow: boolean;
  textOutline: boolean;
  textBackgroundOpacity: number;
}
```

## Implementation Details

### WebCodecs Pipeline

1. **Video Decoding**: Extract frames using VideoDecoder API
2. **Frame Processing**: Render overlays using OffscreenCanvas
3. **Video Encoding**: Re-encode frames using VideoEncoder API
4. **File Creation**: Package chunks into downloadable blob

### Overlay Rendering

The OverlayRenderer class handles frame-by-frame composition:

```typescript
renderFrame(
  videoFrame: VideoFrame,
  frameNumber: number,
  settings: ExportSettings,
  trackingPoints: TrackingPoint[],
  planarTrackers: PlanarTracker[],
  text3DElements: Text3DElement[]
): VideoFrame
```

### Performance Optimizations

- Hardware acceleration preference
- Efficient memory management
- Progress reporting with estimates
- Abort capability for long operations
- Background processing to prevent UI blocking

## Quality Presets

| Preset | Bitrate | Use Case | File Size |
|--------|---------|----------|-----------|
| Low | 500 kbps | Quick previews, small files | Smallest |
| Medium | 1.5 Mbps | Balanced quality/size | Moderate |
| High | 3 Mbps | Good quality for sharing | Large |
| Ultra | 6 Mbps | Maximum quality | Largest |

## Error Handling

The system handles various error conditions:

- Browser incompatibility
- Insufficient memory
- Codec configuration failures
- File system errors
- User cancellation

## Future Enhancements

### Planned Features
- Audio preservation and processing
- Batch export for multiple videos
- Advanced text animations
- Custom codec selection
- Export templates and presets

### Performance Improvements
- Multi-threaded processing
- Streaming export for large files
- Progressive quality encoding
- Memory usage optimization

## Adobe Express Integration

### Import Workflow
1. Export video from motion tracking add-on
2. Open new Adobe Express project
3. Upload exported video file
4. Apply additional effects and transitions
5. Export final project

### Recommended Settings
- Use MP4 format for best compatibility
- Medium or High quality for optimal balance
- Maintain original aspect ratio
- Include text overlays if needed in Express

This implementation provides a robust foundation for video export functionality while maintaining compatibility with Adobe Express workflows and modern web standards.
