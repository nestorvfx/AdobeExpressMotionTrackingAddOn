import React from 'react';
import { TrackingMode } from '../utils/tracking/TrackingTypes';
import './TrackingModeSelector.css';

interface TrackingModeSelectorProps {
  mode: TrackingMode;
  onModeChange: (mode: TrackingMode) => void;
  disabled?: boolean;
}

export const TrackingModeSelector: React.FC<TrackingModeSelectorProps> = ({
  mode,
  onModeChange,
  disabled = false
}) => {
  return (
    <div className="tracking-mode-selector">
      <button
        className={`tracking-mode-btn ${mode === 'point' ? 'active' : ''}`}
        onClick={() => onModeChange('point')}
        disabled={disabled}
        title="Point Tracking - Click to add individual tracking points"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="3" />
          <circle cx="8" cy="8" r="1" fill="white" />
        </svg>
      </button>
      <button
        className={`tracking-mode-btn ${mode === 'planar' ? 'active' : ''}`}
        onClick={() => onModeChange('planar')}
        disabled={disabled}
        title="Planar Tracking - Click to add surface tracking"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2,2" />
          <polygon points="3,3 5,3 5,5 3,5" transform="rotate(45 4 4)" />
          <polygon points="11,3 13,3 13,5 11,5" transform="rotate(45 12 4)" />
          <polygon points="11,11 13,11 13,13 11,13" transform="rotate(45 12 12)" />
          <polygon points="3,11 5,11 5,13 3,13" transform="rotate(45 4 12)" />
        </svg>
      </button>
    </div>
  );
};
