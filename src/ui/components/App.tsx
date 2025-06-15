import React, { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { Timeline } from './Timeline';
import { VideoUpload } from './VideoUpload';
import { TrackingControls } from './TrackingControls';
import { TrackingPanel } from './TrackingPointsPanel';
import { InteractionModeSelector } from './InteractionModeSelector';
import { Toast } from './Toast';
import { useToast } from '../hooks/useToast';
import { useVideoTracking } from '../hooks/useVideoTracking';
import { useTrackingOperations } from '../hooks/useTrackingOperations';
import { DocumentSandboxApi } from '../../models/DocumentSandboxApi';
import './App.css';

interface AppProps {
    addOnUISdk: any;
    sandboxProxy: DocumentSandboxApi;
}

export const App: React.FC<AppProps> = ({ addOnUISdk, sandboxProxy }) => {
    const { toast, showToast } = useToast();
    const videoTracking = useVideoTracking({ showToast });
    const trackingOperations = useTrackingOperations({ videoTracking, showToast });

    const [interactionMode, setInteractionMode] = React.useState<'scale' | 'move'>('scale');

    const getPointColor = (index: number) => `hsl(${(index * 60) % 360}, 70%, 50%)`;    const handleMovePoint = (pointId: string, x: number, y: number) => {
        if (videoTracking.trackerRef.current) {
            videoTracking.trackerRef.current.updatePointPosition(pointId, x, y);
        }
    };

    return (
        <div className="app">
            <main className="app-main"><section className="video-section">
                    {!videoTracking.videoSrc ? (
                        <VideoUpload onVideoUpload={videoTracking.handleVideoUpload} />
                    ) : (                        <div className="video-container-with-controls">
                            <VideoPlayer
                                ref={videoTracking.videoRef}
                                src={videoTracking.videoSrc}
                                currentFrame={videoTracking.currentFrame}
                                isPlaying={videoTracking.isPlaying}
                                trackingPoints={videoTracking.trackingPoints}                                onMetadataLoaded={videoTracking.handleVideoLoaded}
                                onAddTrackingPoint={videoTracking.handleAddTrackingPoint}
                                onUpdateSearchRadius={videoTracking.handleUpdateSearchRadius}
                                onMovePoint={handleMovePoint}
                                getPointColor={getPointColor}
                                getTrajectoryPaths={(frame, range) =>
                                    videoTracking.trackerRef.current?.getTrajectoryPaths(frame, range) || []
                                }
                                interactionMode={interactionMode}
                            />
                            <div className="video-external-controls">
                                <InteractionModeSelector
                                    mode={interactionMode}
                                    onModeChange={setInteractionMode}
                                />
                            </div>
                        </div>
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
                        </div>                        <TrackingControls
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
                            interactionMode={interactionMode}
                            onInteractionModeChange={setInteractionMode}
                        />
                    </section>
                )}                {videoTracking.videoSrc && (
                    <TrackingPanel
                        trackingPoints={videoTracking.trackingPoints}
                        isTracking={videoTracking.isTracking}
                        onRemovePoint={videoTracking.handleRemoveTrackingPoint}
                        onClearAllPoints={videoTracking.handleClearAllPoints}
                        onReactivatePoints={() => {
                            if (videoTracking.trackerRef.current) {
                                videoTracking.trackerRef.current.reactivatePoints();
                                showToast('Points reactivated for testing', 'info');
                            }
                        }}                        onForceTracking={() => {
                            if (videoTracking.trackerRef.current) {
                                const result = videoTracking.trackerRef.current.forceTrackingTest();
                                showToast('Force tracking test completed', 'info');
                            }
                        }}                        onGetDiagnostics={() => {
                            if (videoTracking.trackerRef.current) {
                                const diagnostics = videoTracking.trackerRef.current.getDiagnosticInfo();
                                showToast('Diagnostics generated', 'info');
                            }
                        }}
                        getPointColor={getPointColor}
                    />
                )}            </main>

            {toast && <Toast toast={toast} />}
        </div>
    );
};
