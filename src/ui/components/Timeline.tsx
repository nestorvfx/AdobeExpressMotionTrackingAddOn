import React, { useCallback, useRef, useEffect } from 'react';
import { Button } from "@swc-react/button";
import './Timeline.css';

interface TimelineProps {
    currentFrame: number;
    totalFrames: number;
    isPlaying: boolean;
    onPlayPause: () => void;
    onSeek: (frame: number) => void;
    onStepForward: () => void;
    onStepBackward: () => void;
    fps?: number;
}

export const Timeline: React.FC<TimelineProps> = ({
    currentFrame,
    totalFrames,
    isPlaying,
    onPlayPause,
    onSeek,
    onStepForward,
    onStepBackward,
    fps = 30
}) => {
    const sliderRef = useRef<HTMLInputElement>(null);
    const isDraggingRef = useRef(false);

    const handleSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const frame = parseInt(event.target.value, 10);
        onSeek(frame);
    }, [onSeek]);    const handleSliderMouseDown = useCallback(() => {
        isDraggingRef.current = true;
    }, []);

    const handleSliderMouseUp = useCallback(() => {
        isDraggingRef.current = false;
    }, []);

    // Format time as MM:SS:FF (minutes, seconds, frames)
    const formatTime = useCallback((frame: number) => {
        const seconds = frame / fps;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        const frames = frame % fps;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }, [fps]);

    // Handle keyboard shortcuts for timeline navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT') return;
            
            switch (e.key) {
                case ' ': // Space bar for play/pause
                    e.preventDefault();
                    onPlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    onStepBackward();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    onStepForward();
                    break;
                case 'Home':
                    e.preventDefault();
                    onSeek(0);
                    break;
                case 'End':
                    e.preventDefault();
                    onSeek(totalFrames - 1);
                    break;
                default:
                    break;
            }
        };        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onPlayPause, onStepBackward, onStepForward, onSeek, totalFrames]);

    return (
        <div className="timeline-container">
            <div className="timeline-controls">
                <div className="playback-controls">
                    <Button 
                        size="s" 
                        onClick={onStepBackward}
                        disabled={currentFrame <= 0}
                        variant="secondary"
                        title="Previous frame (Left Arrow)"
                    >
                        ⏮
                    </Button>
                    <Button 
                        size="s" 
                        onClick={onPlayPause}
                        variant="primary"
                        title="Play/Pause (Space)"
                    >
                        {isPlaying ? '⏸' : '▶️'}
                    </Button>
                    <Button 
                        size="s" 
                        onClick={onStepForward}
                        disabled={currentFrame >= totalFrames - 1}
                        variant="secondary"
                        title="Next frame (Right Arrow)"
                    >
                        ⏭
                    </Button>
                </div>
                
                <div className="frame-display">
                    <span>Frame: {currentFrame + 1} / {totalFrames}</span>
                </div>
            </div>
            
            <div className="timeline-slider-container">
                <input
                    ref={sliderRef}
                    type="range"
                    min="0"
                    max={Math.max(0, totalFrames - 1)}
                    value={currentFrame}
                    onChange={handleSliderChange}
                    onMouseDown={handleSliderMouseDown}
                    onMouseUp={handleSliderMouseUp}
                    onTouchStart={handleSliderMouseDown}
                    onTouchEnd={handleSliderMouseUp}
                    className="timeline-slider"
                    disabled={totalFrames <= 1}
                    title="Drag to scrub through timeline"
                />
                <div className="timeline-ticks">                    {/* Generate tick marks for start and end only */}
                    {Array.from({ length: 2 }, (_, i) => {
                        const frame = i === 0 ? 0 : totalFrames - 1;
                        const position = totalFrames > 1 ? (frame / (totalFrames - 1)) * 100 : 0;
                        const label = i === 0 ? 'Start' : 'End';
                        return (
                            <div 
                                key={i} 
                                className="timeline-tick" 
                                style={{ left: `${position}%` }}
                                onClick={() => onSeek(frame)}
                            >
                                <div className="tick-mark"></div>
                                <div className="tick-label">{label}</div>
                            </div>
                        );
                    })}                </div>
            </div>
        </div>
    );
};
