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
  // New interaction mode props
  interactionMode?: 'scale' | 'move';
  onInteractionModeChange?: (mode: 'scale' | 'move') => void;
}

interface ControlButton {
  onClick: () => void;
  disabled: boolean;
  className?: string;
  children: React.ReactNode;
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
  interactionMode = 'scale',
  onInteractionModeChange,
}) => {
  const trackingButtons: ControlButton[] = [
    { onClick: onTrackBackward, disabled: isTracking || trackingPoints.length === 0, className: 'primary', children: 'Track All Backward' },
    { onClick: onTrackForward, disabled: isTracking || trackingPoints.length === 0, className: 'primary', children: 'Track All Forward' }
  ];

  const stepButtons: ControlButton[] = [
    { onClick: onStepBackward, disabled: isTracking || currentFrame <= 0, children: '← Step Back' },
    { onClick: onStepForward, disabled: isTracking || currentFrame >= totalFrames - 1, children: 'Step Forward →' }
  ];
  return (
    <div className="tracking-controls">      
      <div className="control-row">
        {trackingButtons.map((btn, index) => (
          <button key={index} onClick={btn.onClick} disabled={btn.disabled} className={btn.className}>
            {btn.children}
          </button>
        ))}
      </div>
      <div className="control-row">
        {stepButtons.map((btn, index) => (
          <button key={index} onClick={btn.onClick} disabled={btn.disabled}>
            {btn.children}
          </button>
        ))}
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
