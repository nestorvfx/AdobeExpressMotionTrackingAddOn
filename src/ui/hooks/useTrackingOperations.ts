import { useCallback } from 'react';
import { TrackingService } from '../services/trackingService';
import { useVideoTracking } from './useVideoTracking';
import { LucasKanadeTracker, TrackingPoint } from '../utils/lucasKanadeTracker';

interface UseTrackingOperationsProps {
  videoTracking: ReturnType<typeof useVideoTracking>;
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const useTrackingOperations = ({ videoTracking, showToast }: UseTrackingOperationsProps) => {
  const trackingService = new TrackingService({
    fps: videoTracking.fps,
    showToast,
  });  // Generic tracking handler factory
  const createTrackingHandler = useCallback((direction: 'forward' | 'backward') => 
    async (pointId?: string, frames?: number) => {
      if (!videoTracking.trackerRef.current || !videoTracking.videoRef.current) return;

      videoTracking.setIsTracking(true);
      videoTracking.setTrackingProgress(0);
      videoTracking.trackingCancelledRef.current = false;

      try {
        const trackMethod = direction === 'forward' ? 'trackForward' : 'trackBackward';
        await trackingService[trackMethod](
          videoTracking.trackerRef.current,
          videoTracking.videoRef.current,
          videoTracking.currentFrame,
          videoTracking.totalFrames,
          videoTracking.trackingPoints,
          (progress) => videoTracking.setTrackingProgress(progress),
          (frame, points) => {
            videoTracking.setTrackingPoints(points);
            videoTracking.setCurrentFrame(frame);
          },
          videoTracking.trackingCancelledRef,
          pointId,
          frames
        );
      } finally {
        videoTracking.setIsTracking(false);
        videoTracking.setTrackingProgress(0);
        videoTracking.trackingCancelledRef.current = false;
      }
    }, [trackingService, videoTracking]);

  const handleTrackForward = createTrackingHandler('forward');
  const handleTrackBackward = createTrackingHandler('backward');  // Generic step handler factory
  const createStepHandler = useCallback((direction: 'forward' | 'backward') => 
    async () => {
      if (!videoTracking.trackerRef.current || !videoTracking.videoRef.current) return;

      const updateHandler = (frame: number, points: TrackingPoint[]) => {
        videoTracking.setTrackingPoints(points);
        videoTracking.setCurrentFrame(frame);
      };

      if (direction === 'forward') {
        await trackingService.stepForward(
          videoTracking.trackerRef.current,
          videoTracking.videoRef.current,
          videoTracking.currentFrame,
          videoTracking.totalFrames,
          updateHandler
        );
      } else {
        await trackingService.stepBackward(
          videoTracking.trackerRef.current,
          videoTracking.videoRef.current,
          videoTracking.currentFrame,
          updateHandler
        );
      }
    }, [trackingService, videoTracking]);

  const handleStepForward = createStepHandler('forward');
  const handleStepBackward = createStepHandler('backward');

  return {
    handleTrackForward,
    handleTrackBackward,
    handleStepForward,
    handleStepBackward,
  };
};
