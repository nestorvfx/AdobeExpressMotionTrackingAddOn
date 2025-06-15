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
      </div>
      
      {trackingPoints.length === 0 ? (
        <div className="empty-state">
          <p>Click on the video to add tracking points</p>
          <p style={{ fontSize: '10px', marginTop: '8px', color: '#9ca3af' }}>
            Click and drag on points to adjust search area
          </p>
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

      {!trackingPoints.length && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6' }}>
          {/* Diagnostic Controls */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {onReactivatePoints && (
              <button 
                onClick={onReactivatePoints}
                style={{
                  flex: 1,
                  padding: '6px',
                  border: '1px solid #f59e0b',
                  background: 'white',
                  color: '#f59e0b',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Reactivate Points
              </button>
            )}
            {onForceTracking && (
              <button 
                onClick={onForceTracking}
                style={{
                  flex: 1,
                  padding: '6px',
                  border: '1px solid #ef4444',
                  background: 'white',
                  color: '#ef4444',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Force Track Test
              </button>
            )}
          </div>
          
          {onGetDiagnostics && (
            <div style={{ marginTop: '8px' }}>
              <button 
                onClick={onGetDiagnostics}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #10b981',
                  background: 'white',
                  color: '#10b981',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Get Diagnostics
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
