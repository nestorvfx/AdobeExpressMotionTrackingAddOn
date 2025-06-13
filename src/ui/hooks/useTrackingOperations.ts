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
  });
  const handleTrackForward = useCallback(async (pointId?: string, frames?: number) => {
    if (!videoTracking.trackerRef.current || !videoTracking.videoRef.current) return;

    videoTracking.setIsTracking(true);
    videoTracking.setTrackingProgress(0);
    videoTracking.trackingCancelledRef.current = false;

    try {      await trackingService.trackForward(
        videoTracking.trackerRef.current,
        videoTracking.videoRef.current,
        videoTracking.currentFrame,
        videoTracking.totalFrames,
        videoTracking.trackingPoints,
        (progress) => videoTracking.setTrackingProgress(progress),        (frame, points) => {
          videoTracking.setTrackingPoints(points);
          videoTracking.setCurrentFrame(frame);
        },
        videoTracking.trackingCancelledRef,
        pointId, // Pass pointId to limit tracking to specific point
        frames // Pass frame count limit
      );
    } finally {
      videoTracking.setIsTracking(false);
      videoTracking.setTrackingProgress(0);
      videoTracking.trackingCancelledRef.current = false;
    }
  }, [trackingService, videoTracking]);

  const handleTrackBackward = useCallback(async (pointId?: string, frames?: number) => {
    if (!videoTracking.trackerRef.current || !videoTracking.videoRef.current) return;

    videoTracking.setIsTracking(true);
    videoTracking.setTrackingProgress(0);
    videoTracking.trackingCancelledRef.current = false;

    try {      await trackingService.trackBackward(
        videoTracking.trackerRef.current,
        videoTracking.videoRef.current,
        videoTracking.currentFrame,
        videoTracking.trackingPoints,
        (progress) => videoTracking.setTrackingProgress(progress),
        (frame, points) => {
          videoTracking.setTrackingPoints(points);
          videoTracking.setCurrentFrame(frame);
        },
        videoTracking.trackingCancelledRef,
        pointId, // Pass pointId to limit tracking to specific point
        frames // Pass frame count limit
      );
    } finally {
      videoTracking.setIsTracking(false);
      videoTracking.setTrackingProgress(0);
      videoTracking.trackingCancelledRef.current = false;
    }
  }, [trackingService, videoTracking]);

  const handleStepForward = useCallback(async () => {
    if (!videoTracking.trackerRef.current || !videoTracking.videoRef.current) return;    await trackingService.stepForward(
      videoTracking.trackerRef.current,
      videoTracking.videoRef.current,
      videoTracking.currentFrame,
      videoTracking.totalFrames,
      (frame, points) => {
        videoTracking.setTrackingPoints(points);
        videoTracking.setCurrentFrame(frame);
      }
    );
  }, [trackingService, videoTracking]);

  const handleStepBackward = useCallback(async () => {
    if (!videoTracking.trackerRef.current || !videoTracking.videoRef.current) return;    await trackingService.stepBackward(
      videoTracking.trackerRef.current,
      videoTracking.videoRef.current,
      videoTracking.currentFrame,
      (frame, points) => {
        videoTracking.setTrackingPoints(points);
        videoTracking.setCurrentFrame(frame);
      }
    );
  }, [trackingService, videoTracking]);

  return {
    handleTrackForward,
    handleTrackBackward,
    handleStepForward,
    handleStepBackward,
  };
};
