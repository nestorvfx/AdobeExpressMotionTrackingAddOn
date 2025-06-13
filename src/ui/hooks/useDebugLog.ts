import { useState } from 'react';
import { LucasKanadeTracker } from '../utils/lucasKanadeTracker';

export const useDebugLog = () => {
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string>('');
  const [trackingSummary, setTrackingSummary] = useState<any>(null);  const handleExportDebugLogs = (tracker: LucasKanadeTracker | null) => {
    if (!tracker) return;
    
    // Use the correct method names from the tracker
    const logs = tracker.getFormattedDebugLogs();
    const summary = tracker.getTrackerState(); // Use getTrackerState instead of getTrackingSummary
    
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
