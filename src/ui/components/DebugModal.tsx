import React, { useState } from 'react';

interface DebugModalProps {
  isOpen: boolean;
  debugLogs: string;
  trackingSummary: any;
  onClose: () => void;
  onRefresh: () => void;
  onCopyLogs: () => void;
}

export const DebugModal: React.FC<DebugModalProps> = ({
  isOpen,
  debugLogs,
  trackingSummary,
  onClose,
  onRefresh,
  onCopyLogs,
}) => {
  const [debugViewMode, setDebugViewMode] = useState<'summary' | 'logs'>('summary');

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        maxWidth: '90%',
        maxHeight: '90%',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Tracking Debug Info</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ✕
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button 
            onClick={() => setDebugViewMode('summary')}
            style={{
              padding: '8px 12px',
              border: '1px solid #3b82f6',
              background: debugViewMode === 'summary' ? '#3b82f6' : 'white',
              color: debugViewMode === 'summary' ? 'white' : '#3b82f6',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Summary
          </button>
          <button 
            onClick={() => setDebugViewMode('logs')}
            style={{
              padding: '8px 12px',
              border: '1px solid #3b82f6',
              background: debugViewMode === 'logs' ? '#3b82f6' : 'white',
              color: debugViewMode === 'logs' ? 'white' : '#3b82f6',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Full Logs
          </button>
          <button 
            onClick={onRefresh}
            style={{
              padding: '8px 12px',
              border: '1px solid #10b981',
              background: '#10b981',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Refresh
          </button>
          {debugViewMode === 'logs' && (
            <button 
              onClick={onCopyLogs}
              style={{
                padding: '8px 12px',
                border: '1px solid #8b5cf6',
                background: '#8b5cf6',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Copy Logs
            </button>
          )}
        </div>
        
        {debugViewMode === 'summary' ? (
          <div style={{
            width: '600px',
            height: '400px',
            padding: '12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            backgroundColor: '#f9fafb',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '13px'
          }}>
            {trackingSummary ? (
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontFamily: 'sans-serif' }}>Tracking Status</h4>
                <div style={{ marginBottom: '16px' }}>
                  <div><strong>Frame Count:</strong> {trackingSummary.frameCount}</div>
                  <div><strong>Initialized:</strong> {trackingSummary.isInitialized ? '✅ Yes' : '❌ No'}</div>
                  <div><strong>Has Frames:</strong> {trackingSummary.hasFrames ? '✅ Yes' : '❌ No'}</div>
                </div>
                  <h4 style={{ margin: '16px 0 8px 0', fontFamily: 'sans-serif' }}>Point Statistics</h4>
                <div style={{ marginBottom: '16px' }}>
                  <div><strong>Total Points:</strong> {trackingSummary.totalPoints || 0}</div>
                  <div><strong>Active Points:</strong> {trackingSummary.activePoints || 0}</div>
                  <div><strong>Inactive Points:</strong> {trackingSummary.inactivePoints || 0}</div>
                  <div><strong>Average Confidence:</strong> {((trackingSummary.averageConfidence || 0) * 100).toFixed(1)}%</div>
                </div>
                
                {trackingSummary.pointDetails && trackingSummary.pointDetails.length > 0 && (
                  <>
                    <h4 style={{ margin: '16px 0 8px 0', fontFamily: 'sans-serif' }}>Point Details</h4>
                    {trackingSummary.pointDetails.map((point: any, index: number) => (
                      <div key={index} style={{ 
                        marginBottom: '8px', 
                        padding: '8px', 
                        backgroundColor: point.isActive ? '#f0f9ff' : '#fef2f2',
                        borderRadius: '4px',
                        border: point.isActive ? '1px solid #bfdbfe' : '1px solid #fecaca'
                      }}>
                        <div><strong>{point.isActive ? '🟢' : '🔴'} Point {point.id}</strong></div>
                        <div>Position: ({point.x}, {point.y})</div>
                        <div>Confidence: {(point.confidence * 100).toFixed(1)}%</div>
                        <div>Trajectory: {point.trajectoryLength} points</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div style={{ color: '#6b7280' }}>Click "Refresh" to load tracking summary...</div>
            )}
          </div>        ) : (
          <div style={{
            width: '600px',
            height: '400px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Showing most recent debug logs (limited for performance)
            </div>
            <textarea
              value={debugLogs}
              readOnly
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '11px',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                resize: 'both',
                backgroundColor: '#f9fafb'
              }}
              placeholder="Debug logs will appear here after tracking operations..."
            />
          </div>
        )}
        
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          <strong>Instructions:</strong>
          <br />• <strong>Summary:</strong> Shows current tracking status and point details
          <br />• <strong>Full Logs:</strong> Detailed technical logs for debugging tracking issues
          <br />• Add tracking points and scrub the video to see tracking in action
        </div>
      </div>
    </div>
  );
};
