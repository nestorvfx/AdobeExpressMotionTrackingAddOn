import React from 'react';
import { TrackingPoint, PlanarTracker } from '../utils/tracking/TrackingTypes';

interface TrackingPanelProps {
  trackingPoints: TrackingPoint[];
  planarTrackers?: PlanarTracker[];
  isTracking: boolean;
  onRemovePoint: (pointId: string) => void;
  onRemovePlanarTracker?: (trackerId: string) => void;
  onClearAllPoints: () => void;
  onForceTracking?: () => void;
  onReactivatePoints?: () => void;
  onGetDiagnostics?: () => void;
  getPointColor: (index: number) => string;
  getPlanarTrackerColor?: (index: number) => string;
}

export const TrackingPanel: React.FC<TrackingPanelProps> = ({
  trackingPoints,
  planarTrackers = [],
  isTracking,
  onRemovePoint,
  onRemovePlanarTracker,
  onClearAllPoints,
  onForceTracking,  onReactivatePoints,
  onGetDiagnostics,
  getPointColor,
  getPlanarTrackerColor = (index) => `hsl(${(index * 60) % 360}, 70%, 50%)`,
}) => {
  // Filter out feature points that belong to planar trackers
  const visibleTrackingPoints = trackingPoints.filter(point => {
    const isFeaturePoint = planarTrackers.some(tracker => 
      tracker.featurePoints?.some(featurePoint => featurePoint.id === point.id)
    );
    return !isFeaturePoint;
  });

  const totalItems = visibleTrackingPoints.length + planarTrackers.length;

  return (
    <section className="tracking-points-section">
      <div className="section-header">
        <h3>Tracking Items</h3>
        <span className="point-count">{totalItems}</span>
      </div>      {totalItems === 0 ? (
        <div className="empty-state">
          <p>Click on the video to add tracking points or planar trackers</p>
        </div>
      ) : (
        <div className="tracking-points-list">
          {/* Render visible tracking points */}
          {visibleTrackingPoints.map((point, index) => (
            <div key={point.id} className="tracking-point-item">
              <div className="point-info">
                <div 
                  className="point-color"
                  style={{ 
                    backgroundColor: getPointColor(index)
                  }}
                />
                <div className="point-details">
                  <div className="point-id">
                    Point {point.id.substring(0, 6)} • X: {Math.round(point.x)}, Y: {Math.round(point.y)}
                  </div>
                  <div className="point-meta">
                    Search: {Math.round(point.searchRadius)}px • {point.isActive ? 'Active' : 'Lost'}
                  </div>
                </div>
              </div>
              <button 
                className="point-remove"
                onClick={() => onRemovePoint(point.id)}
                disabled={isTracking}
              >
                ✕
              </button>
            </div>
          ))}

          {/* Render planar trackers */}
          {planarTrackers.map((tracker, index) => (
            <div key={tracker.id} className="tracking-point-item">
              <div className="point-info">
                <div 
                  className="point-color"
                  style={{ 
                    backgroundColor: getPlanarTrackerColor(index),
                    borderRadius: '2px' // Square for planar trackers
                  }}
                />
                <div className="point-details">
                  <div className="point-id">
                    Planar {tracker.id.substring(0, 6)} • {Math.round(tracker.width)}×{Math.round(tracker.height)}
                  </div>
                  <div className="point-meta">
                    Features: {tracker.featurePoints?.length || 0} • {tracker.isActive ? `Active (${Math.round(tracker.confidence * 100)}%)` : 'Lost'}
                  </div>
                </div>
              </div>
              {onRemovePlanarTracker && (
                <button 
                  className="point-remove"
                  onClick={() => onRemovePlanarTracker(tracker.id)}
                  disabled={isTracking}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}        {totalItems > 0 && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6' }}>
          <button 
            onClick={onClearAllPoints}
            disabled={isTracking}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ef4444',
              background: 'white',
              color: '#ef4444',
              borderRadius: '6px',
              cursor: totalItems > 0 ? 'pointer' : 'not-allowed',
              opacity: isTracking ? 0.5 : 1,
              marginBottom: '8px'
            }}
          >
            Clear All Items</button>
        </div>      )}
    </section>
  );
};
