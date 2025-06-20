import React, { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { Timeline } from './Timeline';
import { VideoUpload } from './VideoUpload';
import { TrackingControls } from './TrackingControls';
import { TrackingPanel } from './TrackingPointsPanel';
import { InteractionModeSelector } from './InteractionModeSelector';
import { TrackingModeSelector } from './TrackingModeSelector';
import { Text3DEditor } from './Text3DEditor';
import { Toast } from './Toast';
import { useToast } from '../hooks/useToast';
import { useVideoTracking } from '../hooks/useVideoTracking';
import { useTrackingOperations } from '../hooks/useTrackingOperations';
import { DocumentSandboxApi } from '../../models/DocumentSandboxApi';
import { InteractionMode } from '../utils/tracking/TrackingTypes';
import { Text3DElement } from '../utils/text3d/Text3DTypes';
import { Text3DManagerImpl } from '../utils/text3d/Text3DManager';
import './App.css';
import './Text3DEditor.css';

interface AppProps {
    addOnUISdk: any;
    sandboxProxy: DocumentSandboxApi;
}

type AppTab = 'tracking' | 'text3d' | 'export';

export const App: React.FC<AppProps> = ({ addOnUISdk, sandboxProxy }) => {
    const { toast, showToast } = useToast();
    const videoTracking = useVideoTracking({ showToast });
    const trackingOperations = useTrackingOperations({ videoTracking, showToast });

    const [interactionMode, setInteractionMode] = React.useState<InteractionMode>('scale');
    const [currentTab, setCurrentTab] = useState<AppTab>('tracking');
    const [text3DElements, setText3DElements] = useState<Text3DElement[]>([]);
    
    // Shared Text3D Manager instance that persists across tab switches
    const text3DManagerRef = React.useRef<Text3DManagerImpl>(new Text3DManagerImpl());

    const getPointColor = (index: number) => `hsl(${(index * 60) % 360}, 70%, 50%)`;

    const handleMovePoint = (pointId: string, x: number, y: number) => {
        if (videoTracking.trackerRef.current) {
            videoTracking.trackerRef.current.updatePointPosition(pointId, x, y);
        }
    };    const handleText3DCreate = (text: Text3DElement) => {
        setText3DElements(prev => [...prev, text]);
        showToast(`Created text: ${text.name}`, 'success');
    };

    const handleText3DUpdate = (text: Text3DElement) => {
        setText3DElements(prev => prev.map(t => t.id === text.id ? text : t));
    };

    const handleText3DDelete = (textId: string) => {
        setText3DElements(prev => prev.filter(t => t.id !== textId));
        showToast('Text deleted', 'info');
    };

    // Sync text3DElements state with manager whenever texts change
    React.useEffect(() => {
        setText3DElements(text3DManagerRef.current.getAllTexts());
    }, [currentTab]); // Re-sync when switching tabs

    const renderTabContent = () => {
        if (!videoTracking.videoSrc) {
            return <VideoUpload onVideoUpload={videoTracking.handleVideoUpload} />;
        }

        switch (currentTab) {
            case 'tracking':
                return (
                    <div className="tracking-tab">
                        {/* Tracking Controls Above Video */}
                        <div className="video-controls-above">
                            <div className="tracking-controls">
                                <TrackingModeSelector
                                    mode={videoTracking.trackingMode}
                                    onModeChange={videoTracking.setTrackingMode}
                                    disabled={videoTracking.isTracking}
                                />
                            </div>
                            <div className="interaction-controls">
                                <InteractionModeSelector
                                    mode={interactionMode}
                                    onModeChange={setInteractionMode}
                                />
                            </div>
                        </div>

                        {/* Video Player */}
                        <section className="video-section">
                            <div className="video-container-with-controls">
                                <VideoPlayer
                                    ref={videoTracking.videoRef}
                                    src={videoTracking.videoSrc}
                                    currentFrame={videoTracking.currentFrame}
                                    isPlaying={videoTracking.isPlaying}
                                    trackingPoints={videoTracking.trackingPoints}
                                    planarTrackers={videoTracking.planarTrackers}
                                    trackingMode={videoTracking.trackingMode}
                                    onMetadataLoaded={videoTracking.handleVideoLoaded}
                                    onAddTrackingPoint={videoTracking.handleAddTrackingPoint}
                                    onAddPlanarTracker={videoTracking.handleAddPlanarTracker}
                                    onUpdateSearchRadius={videoTracking.handleUpdateSearchRadius}
                                    onMovePoint={handleMovePoint}
                                    onMovePlanarCorner={videoTracking.handleMovePlanarCorner}
                                    getPointColor={getPointColor}
                                    getTrajectoryPaths={(frame, range) =>
                                        videoTracking.trackerRef.current?.getTrajectoryPaths(frame, range) || []
                                    }
                                    interactionMode={interactionMode}
                                />
                            </div>
                        </section>

                        {/* Timeline and Controls */}
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
                                interactionMode={interactionMode}
                                onInteractionModeChange={setInteractionMode}
                            />
                        </section>

                        {/* Tracking Panel */}
                        <TrackingPanel
                            trackingPoints={videoTracking.trackingPoints}
                            planarTrackers={videoTracking.planarTrackers}
                            isTracking={videoTracking.isTracking}
                            onRemovePoint={videoTracking.handleRemoveTrackingPoint}
                            onRemovePlanarTracker={videoTracking.handleRemovePlanarTracker}
                            onClearAllPoints={videoTracking.handleClearAllPoints}
                            onReactivatePoints={() => {
                                if (videoTracking.trackerRef.current) {
                                    videoTracking.trackerRef.current.reactivatePoints();
                                    showToast('Points reactivated for testing', 'info');
                                }
                            }}
                            onForceTracking={() => {
                                if (videoTracking.trackerRef.current) {
                                    const result = videoTracking.trackerRef.current.forceTrackingTest();
                                    showToast('Force tracking test completed', 'info');
                                }
                            }}
                            onGetDiagnostics={() => {
                                if (videoTracking.trackerRef.current) {
                                    const diagnostics = videoTracking.trackerRef.current.getDiagnosticInfo();
                                    showToast('Diagnostics generated', 'info');
                                }
                            }}
                            getPointColor={getPointColor}
                            getPlanarTrackerColor={(index) => `hsl(${(index * 60) % 360}, 70%, 50%)`}
                        />
                    </div>
                );            case 'text3d':
                return (
                    <Text3DEditor
                        videoRef={videoTracking.videoRef}
                        videoSrc={videoTracking.videoSrc}
                        currentFrame={videoTracking.currentFrame}
                        totalFrames={videoTracking.totalFrames}
                        isPlaying={videoTracking.isPlaying}
                        trackingPoints={videoTracking.trackingPoints}
                        planarTrackers={videoTracking.planarTrackers}
                        text3DManager={text3DManagerRef.current}
                        onTextCreate={handleText3DCreate}
                        onTextUpdate={handleText3DUpdate}
                        onTextDelete={handleText3DDelete}
                        onPlayPause={videoTracking.handlePlayPause}
                        onSeek={videoTracking.handleFrameChange}
                        onStepForward={() => videoTracking.handleFrameChange(videoTracking.currentFrame + 1)}
                        onStepBackward={() => videoTracking.handleFrameChange(videoTracking.currentFrame - 1)}
                    />
                );

            case 'export':
                return (
                    <div className="export-tab">
                        <h2>Export (Coming Soon)</h2>
                        <p>Export functionality will be implemented here.</p>
                        <p>Current texts: {text3DElements.length}</p>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="app">
            {/* Tab Navigation */}
            {videoTracking.videoSrc && (
                <div className="tab-navigation">
                    <button
                        className={`tab-button ${currentTab === 'tracking' ? 'active' : ''}`}
                        onClick={() => setCurrentTab('tracking')}
                    >
                        Tracking
                    </button>
                    <button
                        className={`tab-button ${currentTab === 'text3d' ? 'active' : ''}`}
                        onClick={() => setCurrentTab('text3d')}
                        disabled={videoTracking.trackingPoints.length === 0 && videoTracking.planarTrackers.length === 0}
                    >
                        3D Text
                    </button>
                    <button
                        className={`tab-button ${currentTab === 'export' ? 'active' : ''}`}
                        onClick={() => setCurrentTab('export')}
                        disabled={text3DElements.length === 0}
                    >
                        Export
                    </button>
                </div>
            )}

            <main className="app-main">
                {renderTabContent()}
            </main>

            {toast && <Toast toast={toast} />}
        </div>
    );
};
