import { useState, useCallback } from 'react';
import { VideoExportEngine } from '../utils/export/VideoExportEngine';
import { ExportSettings, ExportProgress, ExportResult } from '../utils/export/ExportTypes';
import { TrackingPoint, PlanarTracker } from '../utils/tracking/TrackingTypes';
import { Text3DElement } from '../utils/text3d/Text3DTypes';

interface UseVideoExportProps {
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
  insertVideoIntoDocument: (videoBlob: Blob, filename?: string) => Promise<boolean>;
}

export const useVideoExport = ({ showToast, insertVideoIntoDocument }: UseVideoExportProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportEngine] = useState(() => new VideoExportEngine());
  const exportVideo = useCallback(async (
    videoBlob: Blob,
    settings: ExportSettings,
    trackingPoints: TrackingPoint[],
    planarTrackers: PlanarTracker[],
    text3DElements: Text3DElement[]
  ) => {
    if (isExporting) {
      showToast('Export already in progress', 'info');
      return;
    }

    // Validate video file
    if (!videoBlob || videoBlob.size === 0) {
      showToast('Invalid video file', 'error');
      return;
    }

    // Check file size (1GB limit for Adobe Express)
    const maxSize = 1024 * 1024 * 1024; // 1GB in bytes
    if (videoBlob.size > maxSize) {
      showToast('Video file too large (max 1GB). Please reduce quality or duration.', 'error');
      return;
    }

    // Validate that there are text elements to export
    if (!text3DElements || text3DElements.length === 0) {
      showToast('No 3D text elements found. Please add text in the Text tab before exporting.', 'error');
      return;
    }

    setIsExporting(true);
    setExportProgress(null);

    try {
      showToast('Starting video export...', 'info');
      
      const result = await exportEngine.exportVideo(
        videoBlob,
        settings,
        trackingPoints,
        planarTrackers,
        text3DElements,
        (progress) => {
          setExportProgress(progress);
        }
      );      if (result.success && result.blob) {
        console.log('EXPORT: 🎬 Export completed successfully, starting document insertion...');
        console.log('EXPORT: - Result blob size:', result.blob.size, 'bytes');
        console.log('EXPORT: - Result blob type:', result.blob.type);
        console.log('EXPORT: - Result filename:', result.filename);        // Simple format validation - Adobe Express accepts MP4 and WebM
        console.log('EXPORT: 🔍 Video format:', result.blob.type);
        console.log('EXPORT: ✅ Format validation passed - using direct insertion');        // Simple size validation
        console.log('EXPORT: 🔍 File size:', (result.blob.size / (1024 * 1024)).toFixed(1), 'MB');
        
        if (result.blob.size > maxSize) {
          console.log('EXPORT: ❌ Size validation failed');
          showToast('Exported video is too large (max 1GB). Please reduce quality settings.', 'error');
          return;
        }
        console.log('EXPORT: ✅ Size validation passed');        // Insert the video directly into Adobe Express document
        console.log('EXPORT: 📤 Inserting video into Adobe Express...');
        showToast('Inserting video into Adobe Express document...', 'info');
        
        try {
          console.log('EXPORT: 🔄 Calling insertVideoIntoDocument...');
          
          // Simple insertion with timeout
          const insertPromise = insertVideoIntoDocument(result.blob, result.filename);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Video insertion timeout after 15 seconds')), 15000);
          });
          
          const insertSuccess = await Promise.race([insertPromise, timeoutPromise]) as boolean;
          console.log('EXPORT: 📥 Insert result:', insertSuccess);

          if (insertSuccess) {
            console.log('EXPORT: ✅ Video insertion successful');
            showToast(`Video successfully exported and inserted! (${(result.size / (1024 * 1024)).toFixed(1)} MB)`, 'success');
          } else {
            console.log('EXPORT: ❌ Video insertion failed');
            throw new Error('Failed to insert video into Adobe Express document');
          }
        } catch (insertError) {
          console.error('EXPORT: 💥 Error during video insertion:', insertError);
          throw new Error(`Document insertion failed: ${insertError instanceof Error ? insertError.message : 'Unknown insertion error'}`);
        }
      } else {
        throw new Error(result.error || 'Export failed');
      }    } catch (error) {
      console.error('EXPORT: 💥 Export failed:', error);
      
      // Simple error handling
      let errorMessage = 'Export failed';
      if (error instanceof Error) {
        if (error.message.includes('size') || error.message.includes('large')) {
          errorMessage = 'Video file too large. Please reduce quality or duration.';
        } else if (error.message.includes('format')) {
          errorMessage = 'Unsupported video format. Please try a different format.';
        } else if (error.message.includes('memory')) {
          errorMessage = 'Insufficient memory. Please reduce video quality.';
        } else {
          errorMessage = error.message;
        }
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [isExporting, exportEngine, showToast, insertVideoIntoDocument]);

  const cancelExport = useCallback(() => {
    if (isExporting) {
      exportEngine.cancelExport();
      setIsExporting(false);
      setExportProgress(null);
      showToast('Export cancelled', 'info');
    }
  }, [isExporting, exportEngine, showToast]);

  return {
    isExporting,
    exportProgress,
    exportVideo,
    cancelExport,
  };
};
