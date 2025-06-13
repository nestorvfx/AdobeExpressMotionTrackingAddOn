import { useState } from 'react';
import { LucasKanadeTracker } from '../utils/lucasKanadeTracker';

export const useDebugLog = () => {
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string>('');
  const [trackingSummary, setTrackingSummary] = useState<any>(null);
  const handleExportDebugLogs = (tracker: LucasKanadeTracker | null) => {
    if (!tracker) return;
    
    const logs = tracker.getFormattedDebugLogs();
    // Create a simple summary from tracking points
    const trackingPoints = tracker.getTrackingPoints();
    const summary = {
      totalPoints: trackingPoints.length,
      activePoints: trackingPoints.filter(p => p.isActive).length,
      inactivePoints: trackingPoints.filter(p => !p.isActive).length,
      averageConfidence: trackingPoints.length > 0 
        ? trackingPoints.reduce((sum, p) => sum + p.confidence, 0) / trackingPoints.length 
        : 0,
      pointDetails: trackingPoints.map(p => ({
        id: p.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        isActive: p.isActive,
        confidence: p.confidence,
        trajectoryLength: p.trajectory.length
      }))
    };
    
    setDebugLogs(logs);
    setTrackingSummary(summary);
    setShowDebugLogs(true);
  };

  const handleClearDebugLogs = (tracker: LucasKanadeTracker | null, showToast: (message: string, type: 'info' | 'success' | 'error') => void) => {
    if (!tracker) return;
    tracker.clearDebugLogs();
    setDebugLogs('');
    showToast('Debug logs cleared', 'info');
  };

  const handleCopyLogs = (showToast: (message: string, type: 'info' | 'success' | 'error') => void) => {
    navigator.clipboard.writeText(debugLogs);
    showToast('Debug logs copied to clipboard!', 'success');
  };

  return {
    showDebugLogs,
    setShowDebugLogs,
    debugLogs,
    trackingSummary,
    handleExportDebugLogs,
    handleClearDebugLogs,
    handleCopyLogs,
  };
};
