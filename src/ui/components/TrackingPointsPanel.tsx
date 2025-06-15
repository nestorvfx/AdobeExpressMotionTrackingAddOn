import React from 'react';
import { TrackingPoint } from '../utils/lucasKanadeTracker';

interface TrackingPanelProps {
  trackingPoints: TrackingPoint[];
  isTracking: boolean;
  onRemovePoint: (pointId: string) => void;
  onClearAllPoints: () => void;
  onForceTracking?: () => void;
  onReactivatePoints?: () => void;
  onGetDiagnostics?: () => void;
  getPointColor: (index: number) => string;
}

export const TrackingPanel: React.FC<TrackingPanelProps> = ({
  trackingPoints,
  isTracking,
  onRemovePoint,
  onClearAllPoints,
  onForceTracking,
  onReactivatePoints,
  onGetDiagnostics,
  getPointColor,
}) => {
  return (
    <section className="tracking-points-section">
      <div className="section-header">
        <h3>Tracking Points</h3>
        <span className="point-count">{trackingPoints.length}</span>
      </div>      {trackingPoints.length === 0 ? (
        <div className="empty-state">
          <p>Click on the video to add tracking points</p>
        </div>
      ) : (
        <div className="tracking-points-list">
          {trackingPoints.map((point, index) => (
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
        </div>
      )}
        {trackingPoints.length > 0 && (
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
              cursor: trackingPoints.length > 0 ? 'pointer' : 'not-allowed',
              opacity: isTracking ? 0.5 : 1,
              marginBottom: '8px'
            }}
          >
            Clear All Points          </button>
        </div>      )}
    </section>
  );
};
