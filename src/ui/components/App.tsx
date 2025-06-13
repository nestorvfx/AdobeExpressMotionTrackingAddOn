import React from 'react';
import { VideoPlayer } from './VideoPlayer';
import { Timeline } from './Timeline';
import { VideoUpload } from './VideoUpload';
import { TrackingControls } from './TrackingControls';
import { TrackingPanel } from './TrackingPointsPanel';
import { DebugModal } from './DebugModal';
import { Toast } from './Toast';
import { useToast } from '../hooks/useToast';
import { useVideoTracking } from '../hooks/useVideoTracking';
import { useTrackingOperations } from '../hooks/useTrackingOperations';
import { useDebugLog } from '../hooks/useDebugLog';
import { DocumentSandboxApi } from '../../models/DocumentSandboxApi';
import './App.css';

interface AppProps {
    addOnUISdk: any;
    sandboxProxy: DocumentSandboxApi;
}

export const App: React.FC<AppProps> = ({ addOnUISdk, sandboxProxy }) => {
    // Custom hooks
    const { toast, showToast } = useToast();
    const videoTracking = useVideoTracking({ showToast });
    const trackingOperations = useTrackingOperations({ videoTracking, showToast });
    const debugLog = useDebugLog();

    const getPointColor = (index: number) => `hsl(${(index * 60) % 360}, 70%, 50%)`;

    return (
        <div className="app">
            <header className="app-header">
                <div className="app-title">
                    <div className="app-icon">🎯</div>
                    <h1>Motion Tracker</h1>
                </div>
            </header>

            <main className="app-main">
                <section className="video-section">
                    {!videoTracking.videoSrc ? (
                        <VideoUpload onVideoUpload={videoTracking.handleVideoUpload} />
                    ) : (                        <VideoPlayer
                            ref={videoTracking.videoRef}
                            src={videoTracking.videoSrc}
                            currentFrame={videoTracking.currentFrame}
                            isPlaying={videoTracking.isPlaying}
                            trackingPoints={videoTracking.trackingPoints}
                            onMetadataLoaded={videoTracking.handleVideoLoaded}
                            onAddTrackingPoint={videoTracking.handleAddTrackingPoint}
                            onUpdateSearchRadius={videoTracking.handleUpdateSearchRadius}
                            getPointColor={getPointColor}
                            getPointsAtFrame={(frame) => 
                                videoTracking.trackerRef.current?.getPointsAtFrame(frame) || []
                            }
                            getTrajectoryPaths={(frame, range) =>
                                videoTracking.trackerRef.current?.getTrajectoryPaths(frame, range) || []
                            }
                        />
                    )}
                </section>

                {videoTracking.videoSrc && (
                    <section className="controls-section">
                        <div className="scrubber-container">
                            <Timeline
                                currentFrame={videoTracking.currentFrame}
                                totalFrames={videoTracking.totalFrames}
                                isPlaying={videoTracking.isPlaying}
                                onPlayPause={videoTracking.handlePlayPause}
                                onSeek={videoTracking.handleFrameChange}
                                onStepForward={() => videoTracking.handleFrameChange(videoTracking.currentFrame + 1)}
                                onStepBackward={() => videoTracking.handleFrameChange(videoTracking.currentFrame - 1)}
                            />
                        </div>

                        <TrackingControls
                            isTracking={videoTracking.isTracking}
                            trackingProgress={videoTracking.trackingProgress}
                            trackingPoints={videoTracking.trackingPoints}
                            currentFrame={videoTracking.currentFrame}
                            totalFrames={videoTracking.totalFrames}
                            onTrackBackward={trackingOperations.handleTrackBackward}
                            onTrackForward={trackingOperations.handleTrackForward}
                            onStepBackward={trackingOperations.handleStepBackward}
                            onStepForward={trackingOperations.handleStepForward}
                            onStopTracking={videoTracking.handleStopTracking}
                        />
                    </section>
                )}                {videoTracking.videoSrc && (
                    <TrackingPanel
                        trackingPoints={videoTracking.trackingPoints}
                        isTracking={videoTracking.isTracking}
                        onRemovePoint={videoTracking.handleRemoveTrackingPoint}
                        onClearAllPoints={videoTracking.handleClearAllPoints}
                        onExportDebugLogs={() => debugLog.handleExportDebugLogs(videoTracking.trackerRef.current)}
                        onClearDebugLogs={() => debugLog.handleClearDebugLogs(videoTracking.trackerRef.current, showToast)}
                        onReactivatePoints={() => {
                            if (videoTracking.trackerRef.current) {
                                videoTracking.trackerRef.current.reactivatePoints();
                                showToast('Points reactivated for testing', 'info');
                            }
                        }}
                        onForceTracking={() => {
                            if (videoTracking.trackerRef.current) {
                                const result = videoTracking.trackerRef.current.forceTrackingTest();
                                console.log('Force tracking test result:', result);
                                showToast('Force tracking test completed - check console', 'info');
                            }
                        }}
                        onGetDiagnostics={() => {
                            if (videoTracking.trackerRef.current) {
                                const diagnostics = videoTracking.trackerRef.current.getDiagnosticInfo();
                                console.log('Tracker diagnostics:', diagnostics);
                                showToast('Diagnostics logged to console', 'info');
                            }
                        }}
                        getPointColor={getPointColor}
                    />
                )}
            </main>

            {toast && <Toast toast={toast} />}

            <DebugModal
                isOpen={debugLog.showDebugLogs}
                debugLogs={debugLog.debugLogs}
                trackingSummary={debugLog.trackingSummary}
                onClose={() => debugLog.setShowDebugLogs(false)}
                onRefresh={() => debugLog.handleExportDebugLogs(videoTracking.trackerRef.current)}
                onCopyLogs={() => debugLog.handleCopyLogs(showToast)}
            />
        </div>
    );
};
