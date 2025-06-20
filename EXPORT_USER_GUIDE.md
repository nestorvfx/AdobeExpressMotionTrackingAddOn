# Adobe Express Motion Tracking Add-on - Export Guide

## Overview

The Export tab allows you to export your motion-tracked video with 3D text overlays directly into your Adobe Express document. The exported video contains only your 3D text elements positioned and animated according to the tracking data - no tracking visualizations or debug overlays are included.

## Prerequisites

Before you can export a video:

1. **Video Upload**: Upload a video file in the Upload tab
2. **3D Text Elements**: Create at least one 3D text element in the Text tab
3. **Compatible Browser**: Use Chrome 94+, Edge 94+, or Opera 80+ for best performance

## Export Process

### Step 1: Review Export Readiness
The Export Readiness section shows the status of all requirements:
- ✅ **Video loaded**: Your video is ready for processing
- ✅ **3D text elements present**: You have text elements to include
- ✅ **Browser compatibility**: Your browser supports video export
- ✅ **Adobe Express integration ready**: Direct document insertion is available

### Step 2: Configure Export Settings

#### Quality Presets
- **Best (Recommended)**: Matches your input video quality for optimal results
- **Ultra (6 Mbps)**: Excellent quality for high-resolution content
- **High (3 Mbps)**: Good quality for most use cases
- **Medium (1.5 Mbps)**: Balanced quality and file size
- **Low (500 kbps)**: Fastest export with smaller file size

#### Format Options
- **MP4 (H.264)**: Recommended format, widely compatible
- **WebM (VP9)**: Web-optimized format
- **MOV (QuickTime)**: Apple-compatible format

#### Resolution Settings
- **Maintain Aspect Ratio**: Enabled by default to prevent distortion
- **Custom Dimensions**: Manually adjust width/height if needed (disabled when maintaining aspect ratio)

### Step 3: Export Video
Click "🎬 Export to Adobe Express" to start the export process.

## Export Process Details

### What Gets Exported
- **Original video content**: Your uploaded video serves as the background
- **3D text elements**: All text created in the Text tab with their properties:
  - Text content and styling
  - 3D positioning and rotation
  - Motion tracking applied to text position
  - Text color, size, and font settings

### What Does NOT Get Exported
- Tracking point visualizations (dots, lines, markers)
- Debug overlays or tracking indicators
- UI elements or controls
- Tracking analysis data

### Export Stages
1. **Initializing**: Setting up export parameters
2. **Decoding**: Processing input video frames
3. **Processing**: Rendering 3D text overlays on each frame
4. **Encoding**: Creating the final video file
5. **Finalizing**: Preparing for Adobe Express insertion

## Technical Specifications

### Supported Input Formats
- MP4, WebM, MOV, AVI, WMV
- Maximum file size: 1GB
- Maximum resolution: 4K (3840×2160)

### Export Capabilities
- **Hardware Acceleration**: Uses WebCodecs API when available
- **Software Fallback**: Canvas-based processing for unsupported browsers
- **Frame-accurate**: Preserves exact timing and positioning

### Adobe Express Integration
- **Direct Insertion**: Exported video is automatically inserted into your document
- **No Downloads**: Video goes directly to Adobe Express, not your device
- **Format Validation**: Ensures compatibility with Adobe Express requirements

## Quality Settings Guide

### Choosing the Right Quality

**For Professional Work:**
- Use "Best" quality to match your input video
- Ensures no quality loss during export
- Larger file sizes but optimal visual quality

**For Social Media:**
- "High" or "Ultra" quality provides excellent results
- Good balance of quality and file size
- Suitable for most online platforms

**For Quick Testing:**
- "Medium" or "Low" quality for faster export
- Smaller file sizes for quicker processing
- Good for previewing results before final export

### Bitrate Reference
- **Best**: Automatically matches input video (typically 8-50 Mbps)
- **Ultra**: 6 Mbps - Excellent for 1080p content
- **High**: 3 Mbps - Good for 720p-1080p content
- **Medium**: 1.5 Mbps - Balanced for web content
- **Low**: 500 kbps - Minimal quality, fast export

## Troubleshooting

### Common Issues

**"No 3D text elements found" Error**
- Solution: Add text elements in the Text tab before exporting

**"Video file too large" Error**
- Solution: Reduce quality setting or video duration
- Adobe Express has a 1GB file limit

**Browser Compatibility Issues**
- Solution: Use Chrome 94+, Edge 94+, or Opera 80+
- Firefox and Safari have limited support

**Export Fails or Crashes**
- Check available system memory
- Try reducing video resolution or quality
- Close other browser tabs to free resources

**Adobe Express Insertion Fails**
- Verify add-on permissions in Adobe Express
- Check internet connection
- Try exporting again

### Performance Tips

1. **Optimize Browser Performance:**
   - Close unnecessary tabs and applications
   - Ensure sufficient RAM (4GB+ recommended)
   - Use latest browser version

2. **Video Optimization:**
   - Use videos under 2 minutes for best performance
   - Consider reducing input resolution if not needed
   - MP4 format typically performs best

3. **Export Settings:**
   - Start with "Medium" quality for testing
   - Use "Best" quality only for final exports
   - Enable hardware acceleration in browser settings

## Browser Compatibility

### Fully Supported
- ✅ Chrome 94+ (Recommended)
- ✅ Microsoft Edge 94+
- ✅ Opera 80+

### Limited Support
- ⚠️ Firefox (software processing only)

### Not Supported
- ❌ Safari (WebCodecs not available)
- ❌ Internet Explorer

## File Size Considerations

### Estimated Export Sizes (1-minute 1080p video)
- **Best**: 50-200 MB (matches input)
- **Ultra**: ~45 MB
- **High**: ~22 MB
- **Medium**: ~11 MB
- **Low**: ~4 MB

### Adobe Express Limits
- Maximum file size: 1GB
- Recommended: Under 500 MB for best performance
- Large files may take longer to process in Adobe Express

## Support and Feedback

For technical issues or feature requests:
1. Check this guide for common solutions
2. Verify browser compatibility
3. Test with different quality settings
4. Report persistent issues to the development team

---

*This export feature provides seamless integration between motion tracking analysis and Adobe Express document creation, enabling professional video content with tracked 3D text overlays.*
