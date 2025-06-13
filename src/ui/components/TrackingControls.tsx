import React from 'react';
import { TrackingPoint } from '../utils/lucasKanadeTracker';

interface TrackingControlsProps {
  isTracking: boolean;
  trackingProgress: number;
  trackingPoints: TrackingPoint[];
  currentFrame: number;
  totalFrames: number;
  onTrackBackward: () => void;
  onTrackForward: () => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  onStopTracking: () => void;
}

export const TrackingControls: React.FC<TrackingControlsProps> = ({
  isTracking,
  trackingProgress,
  trackingPoints,
  currentFrame,
  totalFrames,
  onTrackBackward,
  onTrackForward,
  onStepBackward,
  onStepForward,
  onStopTracking,
}) => {
  return (
    <div className="tracking-controls">
      <div className="control-row">
        <button 
          onClick={onTrackBackward}
          disabled={isTracking || trackingPoints.length === 0}
          className="primary"
        >
          Track All Backward
        </button>
        <button 
          onClick={onTrackForward}
          disabled={isTracking || trackingPoints.length === 0}
          className="primary"
        >
          Track All Forward
        </button>
      </div>
      <div className="control-row">
        <button 
          onClick={onStepBackward}
          disabled={isTracking || currentFrame <= 0}
        >
          ← Step Back
        </button>
        <button 
          onClick={onStepForward}
          disabled={isTracking || currentFrame >= totalFrames - 1}
        >
          Step Forward →
        </button>
      </div>

      {isTracking && (
        <div className="tracking-progress">
          <div className="progress-text">
            Tracking... {Math.round(trackingProgress * 100)}%
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${trackingProgress * 100}%` }}
            />
          </div>
          <button 
            onClick={onStopTracking}
            className="stop-tracking-btn"
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              border: '1px solid #ef4444',
              background: '#ef4444',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              width: '100%'
            }}
          >
            Stop Tracking
          </button>
        </div>
      )}
    </div>
  );
};
