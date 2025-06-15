// Debug logging system - exact implementation from original

import { DebugLogEntry } from './DebugTypes';

export class MinimalDebugger {
  private logs: DebugLogEntry[] = [];
  private maxLogs: number = 100; // Increased for better diagnosis

  log(frameNumber: number, operation: string, data: any, level: 'info' | 'warn' | 'error' = 'info') {
    this.logs.push({
      timestamp: Date.now(),
      frameNumber,
      operation,
      data,
      level
    });
    
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }    // Enhanced console logging for critical issues
    if (level === 'error' || level === 'warn') {
      console.warn(`🔍 [Frame ${frameNumber}] ${operation}:`, data);
    } else if (operation.includes('TRACKING_SUMMARY')) {
      console.log(`📊 [Frame ${frameNumber}] ${operation}:`, data);
    } else if (operation.includes('MANUAL')) {
      // Special console logging for manual operations to make them highly visible
      console.log(`🖱️ [Frame ${frameNumber}] ${operation}:`, data);
    }
  }

  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  getFormattedLogs(): string {
    if (this.logs.length === 0) {
      return 'No tracking logs available yet. Add tracking points and scrub the video to see tracking data.';
    }

    const recentLogs = this.logs.slice(-50); // Show recent logs for UI
    return recentLogs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const emoji = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : '✅';
      return `${emoji} [${time}] Frame ${log.frameNumber} - ${log.operation}:\n${JSON.stringify(log.data, null, 2)}`;
    }).join('\n\n');
  }

  clear() {
    this.logs = [];
    console.log('🧹 Debug logs cleared');
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}
