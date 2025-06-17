import React from 'react';
import { InteractionMode } from '../utils/tracking/TrackingTypes';
import './InteractionModeSelector.css';

interface InteractionModeSelectorProps {
    mode: InteractionMode;
    onModeChange: (mode: InteractionMode) => void;
    disabled?: boolean;
}

export const InteractionModeSelector: React.FC<InteractionModeSelectorProps> = ({
    mode,
    onModeChange,
    disabled = false
}) => {
    return (
        <div className="interaction-mode-selector">
            <button
                type="button"
                className={`mode-button ${mode === 'scale' ? 'active' : ''}`}
                onClick={() => onModeChange('scale')}
                title="Scale search area"
                disabled={disabled}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 8v6m-3-3h6"/>
                </svg>
            </button>
            <button
                type="button"
                className={`mode-button ${mode === 'move' ? 'active' : ''}`}
                onClick={() => onModeChange('move')}
                title="Move tracking point"
                disabled={disabled}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
                </svg>
            </button>
        </div>
    );
};
