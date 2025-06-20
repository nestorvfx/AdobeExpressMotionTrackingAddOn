import React, { useState, useEffect } from 'react';
import { ExportSettings, ExportProgress, QUALITY_PRESETS, FORMAT_CONFIGS } from '../../utils/export/ExportTypes';
import { CapabilityDetector } from '../../utils/export/CapabilityDetector';
import './ExportPanel.css';

interface ExportPanelProps {
  videoSrc: string;
  videoWidth: number;
  videoHeight: number;
  videoDuration: number;
  videoFramerate: number;
  hasTracking: boolean;
  hasText3D: boolean;
  onExport: (settings: ExportSettings) => void;
  isExporting: boolean;
  exportProgress?: ExportProgress;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  videoSrc,
  videoWidth,
  videoHeight,
  videoDuration,
  videoFramerate,
  hasTracking,
  hasText3D,
  onExport,
  isExporting,
  exportProgress,
}) => {  const [settings, setSettings] = useState<ExportSettings>({
    format: 'webm', // WebM is now default for better Adobe Express compatibility
    codec: 'vp09.00.50.08',
    bitrate: 8000000, // Will be overridden by "best" quality
    quality: 'best', // Default to best quality (matches input)
    width: videoWidth,
    height: videoHeight,
    maintainAspectRatio: true,
    framerate: videoFramerate,
    includeTexts: hasText3D,
    keyframeInterval: 10,
    audioIncluded: false, // Will be supported in future versions
  });

  const [browserCapabilities, setBrowserCapabilities] = useState<any>(null);
  const [isCapabilityLoading, setIsCapabilityLoading] = useState(true);

  // Detect browser capabilities on mount
  useEffect(() => {
    const detectCapabilities = async () => {
      try {
        const detector = CapabilityDetector.getInstance();
        const capabilities = await detector.detectCapabilities();
        setBrowserCapabilities(capabilities);
        
        // Update codec based on capabilities
        if (capabilities.supportedCodecs.length > 0) {
          const bestCodec = detector.getBestCodec(settings.format, capabilities.supportedCodecs);
          setSettings(prev => ({ ...prev, codec: bestCodec }));
        }
      } catch (error) {
        console.error('Failed to detect browser capabilities:', error);
      } finally {
        setIsCapabilityLoading(false);
      }
    };

    detectCapabilities();
  }, [settings.format]);

  // Update dimensions when video changes
  useEffect(() => {
    setSettings(prev => ({
      ...prev,
      width: videoWidth,
      height: videoHeight,
      framerate: videoFramerate,
      includeTexts: hasText3D,
    }));
  }, [videoWidth, videoHeight, videoFramerate, hasText3D]);

  const handleSettingChange = <K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      
      // Auto-update related settings
      if (key === 'quality') {
        const preset = QUALITY_PRESETS[value as ExportSettings['quality']];
        Object.assign(newSettings, preset);
      }
      
      if (key === 'maintainAspectRatio' && value === true) {
        // Reset to original dimensions
        newSettings.width = videoWidth;
        newSettings.height = videoHeight;
      }
      
      return newSettings;
    });
  };

  const handleExport = () => {
    if (!browserCapabilities?.webCodecsSupported && !browserCapabilities?.webAssemblySupported) {
      alert('Your browser does not support video export. Please use a WebCodecs-compatible browser like Chrome 94+.');
      return;
    }
    
    onExport(settings);
  };

  const getEstimatedFileSize = () => {
    const durationSeconds = videoDuration;
    const bitsPerSecond = settings.bitrate;
    const estimatedBytes = (durationSeconds * bitsPerSecond) / 8;
    return formatFileSize(estimatedBytes);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (isCapabilityLoading) {
    return (
      <div className="export-panel loading">
        <div className="capability-check">
          <div className="spinner"></div>
          <p>Detecting browser capabilities...</p>
        </div>
      </div>
    );
  }

  if (!browserCapabilities?.webCodecsSupported && !browserCapabilities?.webAssemblySupported) {
    return (
      <div className="export-panel incompatible">
        <div className="incompatible-browser">
          <div className="icon">⚠️</div>
          <h3>Browser Not Supported</h3>
          <p>Video export requires a WebCodecs-compatible browser.</p>
          <div className="browser-recommendations">
            <h4>Recommended Browsers:</h4>
            <ul>
              <li>✅ Chrome 94+</li>
              <li>✅ Edge 94+</li>
              <li>✅ Opera 80+</li>
              <li>❌ Firefox (limited support)</li>
              <li>❌ Safari (not supported)</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="export-panel">
      {/* Export Progress Overlay */}
      {isExporting && exportProgress && (
        <div className="export-progress-overlay">
          <div className="progress-modal">
            <h3>Exporting Video</h3>
            <div className="progress-info">
              <div className="stage-info">
                <span className="stage">{exportProgress.stage}</span>
                <span className="message">{exportProgress.message}</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${exportProgress.progress}%` }}
                ></div>
              </div>
              <div className="progress-details">
                <span>{Math.round(exportProgress.progress)}%</span>
                {exportProgress.timeRemaining > 0 && (
                  <span>{Math.round(exportProgress.timeRemaining)}s remaining</span>
                )}
              </div>
              {exportProgress.totalFrames > 0 && (
                <div className="frame-progress">
                  Frame {exportProgress.currentFrame} of {exportProgress.totalFrames}
                </div>
              )}
            </div>
            {exportProgress.error && (
              <div className="error-message">
                ❌ {exportProgress.error}
              </div>
            )}
          </div>
        </div>
      )}      {/* Main Export Panel - Simplified */}
      <div className="export-content-flat">
        {/* Quality & Format Settings - Essential Only */}        {/* Quality & Format Settings - Essential Only */}
        <div className="settings-section">          
          <div className="setting-group">
            <label>Quality Preset</label>            <select 
              value={settings.quality}
              onChange={(e) => handleSettingChange('quality', e.target.value as ExportSettings['quality'])}
            >
              <option value="best">Best (Same as input)</option>
              <option value="high">High (3 Mbps)</option>
              <option value="medium">Medium (1.5 Mbps)</option>
            </select>
          </div>          <div className="setting-group">
            <label>Format</label>
            <select 
              value={settings.format}
              onChange={(e) => handleSettingChange('format', e.target.value as ExportSettings['format'])}
            >
              <option value="webm">WebM (Recommended for Adobe Express)</option>
              <option value="mp4">MP4 (Fallback)</option>
            </select>
          </div>
        </div>        {/* Content Settings - Always include text if present */}
        {hasText3D && (
          <div className="text-info">
            ✓ 3D text elements will be included with original styling
          </div>
        )}

        {/* Export Actions */}
        <div className="export-actions">
          <button 
            className="export-btn primary"
            onClick={handleExport}
            disabled={isExporting || !hasText3D || !videoSrc}
          >
            {isExporting ? 'Exporting...' : 'Export to Adobe Express'}
          </button>
          
          {!hasText3D && (
            <p className="export-hint">
              Add 3D text elements in the Text tab to enable export
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
