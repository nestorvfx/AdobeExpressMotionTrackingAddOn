import React, { useState, useEffect } from 'react';
import { Button } from "@swc-react/button";
import './TrackingPanel.css';
import { TrackingPoint } from '../utils/lucasKanadeTracker';

interface TrackingPanelProps {
    trackingPoints: TrackingPoint[];
    onRemovePoint: (id: string) => void;
    onTrackForward: (pointId: string, frames: number) => void;
    onTrackBackward: (pointId: string, frames: number) => void;
    onClearAll: () => void;
    onExportData: () => void;
    isTracking: boolean;
    trackingProgress?: number;
}

export const TrackingPanel: React.FC<TrackingPanelProps> = ({
    trackingPoints,
    onRemovePoint,
    onTrackForward,
    onTrackBackward,
    onClearAll,
    onExportData,
    isTracking,
    trackingProgress = 0
}) => {
    const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
    const [trackingFrames, setTrackingFrames] = useState<number>(30);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [sortBy, setSortBy] = useState<'id' | 'confidence'>('id');
    
    // Auto-select the first point when points are added
    useEffect(() => {
        if (trackingPoints.length > 0 && !selectedPointId) {
            setSelectedPointId(trackingPoints[0].id);
        } else if (trackingPoints.length === 0) {
            setSelectedPointId(null);
        } else {
            // Ensure the selected point still exists
            if (selectedPointId && !trackingPoints.some(p => p.id === selectedPointId)) {
                setSelectedPointId(trackingPoints[0].id);
            }
        }
    }, [trackingPoints, selectedPointId]);

    const handleTrackForward = () => {
        if (selectedPointId) {
            onTrackForward(selectedPointId, trackingFrames);
        }
    };

    const handleTrackBackward = () => {
        if (selectedPointId) {
            onTrackBackward(selectedPointId, trackingFrames);
        }
    };

    const handleTrackAllForward = () => {
        // Track each point in sequence
        trackingPoints.forEach((point) => {
            if (point.isActive) {
                onTrackForward(point.id, trackingFrames);
            }
        });
    };

    const handleTrackAllBackward = () => {
        // Track each point in sequence
        trackingPoints.forEach((point) => {
            if (point.isActive) {
                onTrackBackward(point.id, trackingFrames);
            }
        });
    };

    const getPointColor = (index: number) => {
        return `hsl(${(index * 60) % 360}, 80%, 60%)`;
    };

    // Filter and sort points
    const filteredPoints = trackingPoints
        .filter(point => {
            if (!searchTerm) return true;
            return point.id.includes(searchTerm);
        })
        .sort((a, b) => {
            if (sortBy === 'confidence') {
                return b.confidence - a.confidence;
            }
            return a.id.localeCompare(b.id);
        });

    // Get currently selected point details
    const selectedPoint = selectedPointId 
        ? trackingPoints.find(p => p.id === selectedPointId) 
        : null;

    return (
        <div className="tracking-panel">
            <div className="panel-header">
                <h3>Tracking Points ({trackingPoints.length})</h3>
                <div className="panel-actions">
                    <Button 
                        size="s" 
                        variant="negative" 
                        onClick={onClearAll}
                        disabled={trackingPoints.length === 0 || isTracking}
                        title="Remove all tracking points"
                    >
                        Clear All
                    </Button>
                    <Button 
                        size="s" 
                        variant="secondary" 
                        onClick={onExportData}
                        disabled={trackingPoints.length === 0}
                        title="Export tracking data as JSON"
                    >
                        Export
                    </Button>
                </div>
            </div>

            {trackingPoints.length === 0 ? (
                <div className="empty-state">
                    <p>Click on the video to add tracking points</p>
                </div>
            ) : (
                <>
                    <div className="search-and-sort">
                        <input
                            type="text"
                            placeholder="Search points..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                        <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value as 'id' | 'confidence')}
                            className="sort-select"
                        >
                            <option value="id">Sort by ID</option>
                            <option value="confidence">Sort by Confidence</option>
                        </select>
                    </div>

                    <div className="tracking-points-list">
                        {filteredPoints.map((point, index) => (
                            <div 
                                key={point.id} 
                                className={`tracking-point-item ${selectedPointId === point.id ? 'selected' : ''} ${point.isActive ? 'active' : 'inactive'}`}
                                onClick={() => setSelectedPointId(point.id)}
                            >
                                <div className="point-info">
                                    <div 
                                        className="point-color-indicator"
                                        style={{ backgroundColor: getPointColor(index) }}
                                    ></div>
                                    <div className="point-details">
                                        <div className="point-id">Point {point.id.substring(0, 6)}</div>
                                        <div className="point-coords">
                                            X: {point.x.toFixed(1)}, Y: {point.y.toFixed(1)}
                                        </div>
                                        <div className="point-status">
                                            <span 
                                                className={`status-indicator ${point.isActive ? 'active' : 'inactive'}`}
                                                title={point.isActive ? 'Point is being tracked' : 'Point has been lost'}
                                            >
                                                {point.isActive ? 'Active' : 'Lost'}
                                            </span>
                                            <div className="confidence-bar">
                                                <div 
                                                    className="confidence-fill"
                                                    style={{ 
                                                        width: `${point.confidence * 100}%`,
                                                        backgroundColor: point.confidence > 0.7 
                                                            ? '#4caf50' 
                                                            : point.confidence > 0.4 
                                                            ? '#ff9800' 
                                                            : '#f44336'
                                                    }}
                                                    title={`Confidence: ${(point.confidence * 100).toFixed(1)}%`}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Button 
                                    size="s" 
                                    variant="negative" 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemovePoint(point.id);
                                        if (selectedPointId === point.id) {
                                            setSelectedPointId(null);
                                        }
                                    }}
                                    disabled={isTracking}
                                    title="Remove this tracking point"
                                >
                                    ✕
                                </Button>
                            </div>
                        ))}
                    </div>

                    {selectedPoint && (
                        <div className="tracking-controls">
                            <div className="selected-point-info">
                                <h4>Selected Point: {selectedPoint.id.substring(0, 6)}</h4>
                                {!selectedPoint.isActive && (
                                    <div className="lost-point-warning">
                                        This point is no longer being tracked. 
                                        You may need to reposition it manually.
                                    </div>
                                )}
                            </div>

                            <div className="control-group">
                                <label htmlFor="tracking-frames">Tracking Duration (frames):</label>
                                <input
                                    id="tracking-frames"
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={trackingFrames}
                                    onChange={(e) => setTrackingFrames(parseInt(e.target.value) || 1)}
                                    disabled={isTracking}
                                />
                            </div>
                              <div className="tracking-buttons">
                                <Button 
                                    size="s" 
                                    variant="primary"
                                    onClick={handleTrackBackward}
                                    disabled={isTracking || !selectedPoint.isActive}
                                    title="Track this point backward through video"
                                >
                                    ← Track Backward
                                </Button>
                                <Button 
                                    size="s" 
                                    variant="primary"
                                    onClick={handleTrackForward}
                                    disabled={isTracking || !selectedPoint.isActive}
                                    title="Track this point forward through video"
                                >
                                    Track Forward →
                                </Button>                                <Button 
                                    size="s" 
                                    variant="secondary"
                                    onClick={handleTrackAllBackward}
                                    disabled={isTracking || trackingPoints.filter(p => p.isActive).length === 0}
                                    title="Track all active points backward through video"
                                >
                                    ← All Back
                                </Button>
                                <Button 
                                    size="s" 
                                    variant="secondary"
                                    onClick={handleTrackAllForward}
                                    disabled={isTracking || trackingPoints.filter(p => p.isActive).length === 0}
                                    title="Track all active points forward through video"
                                >
                                    All Forward →
                                </Button>
                            </div>

                            {isTracking && (
                                <div className="tracking-progress">
                                    <div className="progress-label">
                                        Tracking... {Math.round(trackingProgress * 100)}%
                                    </div>
                                    <div className="progress-bar">
                                        <div 
                                            className="progress-fill"
                                            style={{ width: `${trackingProgress * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            <div className="instructions">
                <h4>Instructions:</h4>
                <ul>
                    <li>Click on the video to add tracking points</li>
                    <li>Drag points to manually adjust their position</li>
                    <li>Select a point to track it forward or backward in the video</li>
                    <li>Use keyboard shortcuts: Space (play/pause), Arrow keys (step)</li>
                </ul>
            </div>
        </div>
    );
};
