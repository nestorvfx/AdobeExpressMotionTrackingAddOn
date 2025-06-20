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
      );

      if (result.success && result.blob) {
        // Validate exported video format
        const supportedFormats = ['video/mp4', 'video/quicktime', 'video/webm', 'video/avi'];
        if (!supportedFormats.includes(result.blob.type)) {
          showToast(`Unsupported video format: ${result.blob.type}. Please try a different format.`, 'error');
          return;
        }

        // Check exported video size
        if (result.blob.size > maxSize) {
          showToast('Exported video is too large (max 1GB). Please reduce quality settings.', 'error');
          return;
        }

        // Insert the video directly into Adobe Express document
        showToast('Inserting video into Adobe Express document...', 'info');
        
        const insertSuccess = await insertVideoIntoDocument(result.blob, result.filename);
        
        if (insertSuccess) {
          showToast(
            `Video successfully exported and inserted into Adobe Express! (${(result.size / (1024 * 1024)).toFixed(1)} MB)`,
            'success'
          );
        } else {
          throw new Error('Failed to insert video into Adobe Express document');
        }
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error) {
      let errorMessage = 'Unknown export error';
      
      // Provide specific error messages for common issues
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          errorMessage = 'Permission denied. Please check add-on permissions.';
        } else if (error.message.includes('size') || error.message.includes('large')) {
          errorMessage = 'Video file too large. Please reduce quality or duration.';
        } else if (error.message.includes('format') || error.message.includes('codec')) {
          errorMessage = 'Unsupported video format. Please try MP4 or WebM.';
        } else if (error.message.includes('browser') || error.message.includes('support')) {
          errorMessage = 'Browser does not support video export. Please use Chrome or Edge.';
        } else if (error.message.includes('memory')) {
          errorMessage = 'Insufficient memory. Please reduce video quality or duration.';
        } else {
          errorMessage = error.message;
        }
      }
      
      showToast(`Export failed: ${errorMessage}`, 'error');
      console.error('Export error:', error);
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
