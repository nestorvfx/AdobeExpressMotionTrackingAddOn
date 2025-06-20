import React, { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { Timeline } from './Timeline';
import { VideoUpload } from './VideoUpload';
import { TrackingControls } from './TrackingControls';
import { TrackingPanel } from './TrackingPointsPanel';
import { InteractionModeSelector } from './InteractionModeSelector';
import { TrackingModeSelector } from './TrackingModeSelector';
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
    const trackingOperations = useTrackingOperations({ videoTracking, showToast });    const [interactionMode, setInteractionMode] = React.useState<InteractionMode>('scale');    const [currentTab, setCurrentTab] = useState<AppTab>('tracking');
    const [text3DElements, setText3DElements] = useState<Text3DElement[]>([]);
    
    // Text3D state management
    const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
    const [selectedTrackerId, setSelectedTrackerId] = useState<string | null>(null);
    const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);
    const [hoveredTrackerId, setHoveredTrackerId] = useState<string | null>(null);
    
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
    };    const handleText3DDelete = (textId: string) => {
        setText3DElements(prev => prev.filter(t => t.id !== textId));
        showToast('Text deleted', 'info');
    };

    // Text3D interaction handlers
    const handleTextSelect = (textId: string | null) => {
        setSelectedTextId(textId);
        if (textId) {
            text3DManagerRef.current.selectText(textId);
        } else {
            text3DManagerRef.current.deselectAll();
        }
        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
    };

    const handleTrackerSelect = (trackerId: string | null, isPoint: boolean) => {
        setSelectedTrackerId(trackerId);
        setSelectedTextId(null); // Deselect text when tracker is selected
        text3DManagerRef.current.deselectAll();
        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
    };    const addTextToTracker = (trackerId: string, isPoint: boolean = false) => {
        // Prevent multiple clicks by checking if we're already processing
        if (!trackerId) return;
        
        const pointId = isPoint ? trackerId : undefined;
        const actualTrackerId = isPoint ? videoTracking.trackingPoints.find(p => p.id === trackerId)?.id || trackerId : trackerId;
        
        const newText = text3DManagerRef.current.createText(actualTrackerId, pointId);
        newText.createdFrame = videoTracking.currentFrame;
        
        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
        handleTextSelect(newText.id);
        
        showToast(`Added 3D text to ${isPoint ? 'point' : 'planar'} tracker`, 'success');
    };// Sync text3DElements state with manager whenever texts change
    React.useEffect(() => {
        setText3DElements(text3DManagerRef.current.getAllTexts());
    }, [currentTab]); // Re-sync when switching tabs    // Handle tab switching while preserving video state
    const handleTabSwitch = (newTab: AppTab) => {
        setCurrentTab(newTab);
        // Preserve the current frame when switching tabs - no need to reset video state
    };

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
                    <div className="text3d-tab">
                        {/* Video Player in Text3D Mode */}
                        <section className="video-section">
                            <div className="video-container-with-controls">
                                <VideoPlayer
                                    ref={videoTracking.videoRef}
                                    src={videoTracking.videoSrc}
                                    currentFrame={videoTracking.currentFrame}
                                    isPlaying={videoTracking.isPlaying}
                                    trackingPoints={videoTracking.trackingPoints}
                                    planarTrackers={videoTracking.planarTrackers}
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
                                    renderMode="text3d"
                                    text3DElements={text3DElements}
                                    onTextSelect={handleTextSelect}
                                    onTrackerSelect={handleTrackerSelect}
                                    selectedTextId={selectedTextId}
                                    selectedTrackerId={selectedTrackerId}                                    hoveredTextId={hoveredTextId}
                                    hoveredTrackerId={hoveredTrackerId}
                                    onTextHover={setHoveredTextId}
                                    onTrackerHover={setHoveredTrackerId}
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
                        </section>                        {/* Text Controls Section */}
                        <section className="text3d-controls-section">
                            <div className="text3d-section-header">
                                <h3>3D Text Elements</h3>
                                <span className="text-count">{text3DElements.length}</span>
                            </div>
                            
                            {/* Simplified property panel */}
                            <div className="text3d-property-panel">
                                {/* Show existing texts if any */}
                                {text3DElements.length > 0 && (
                                    <div className="existing-texts-section">
                                        <h4>Text Layers <span className="texts-count">{text3DElements.length}</span></h4>
                                        {text3DElements.map(text => (
                                            <div 
                                                key={text.id} 
                                                className={`text-item ${selectedTextId === text.id ? 'selected' : ''}`}
                                                onClick={() => handleTextSelect(text.id)}
                                                title={`"${text.content}" - ${text.attachedToPointId ? 'Point Tracker' : 'Planar Tracker'}`}
                                            >
                                                <div className="text-item-info">
                                                    <div className="text-item-content">{text.content}</div>
                                                    <div className="text-item-tracker">
                                                        {text.attachedToPointId ? 'Point' : 'Planar'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* No text elements state */}
                                {text3DElements.length === 0 && (
                                    <div className="text3d-empty-state">
                                        <div className="empty-icon">🎯</div>
                                        <p>Select a tracker and click + to add text</p>
                                    </div>
                                )}                                {/* Selected text properties - Full Original Panel */}
                                {selectedTextId && (() => {
                                    const selectedText = text3DManagerRef.current.getTextById(selectedTextId);
                                    if (!selectedText) return null;
                                    
                                    return (
                                        <div className="text-properties">
                                            <h3>Text Properties: {selectedText.name || selectedText.content}</h3>
                                            
                                            {/* Content */}
                                            <div className="property-group">
                                                <label>📝 Text Content</label>
                                                <input
                                                    type="text"
                                                    value={selectedText.content}
                                                    onChange={(e) => {
                                                        text3DManagerRef.current.updateText(selectedTextId, { content: e.target.value });
                                                        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                    }}
                                                    className="text-input"
                                                    placeholder="Enter your text here..."
                                                />
                                            </div>

                                            {/* Position */}
                                            <div className="property-group">
                                                <label>📍 Position Offset</label>
                                                <div className="vector-inputs">
                                                    <input
                                                        type="number"
                                                        value={selectedText.transform.position.x}
                                                        onChange={(e) => {
                                                            text3DManagerRef.current.updateText(selectedTextId, {
                                                                transform: {
                                                                    ...selectedText.transform,
                                                                    position: { ...selectedText.transform.position, x: parseFloat(e.target.value) || 0 }
                                                                }
                                                            });
                                                            setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                        }}
                                                        placeholder="X"
                                                        step="1"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={selectedText.transform.position.y}
                                                        onChange={(e) => {
                                                            text3DManagerRef.current.updateText(selectedTextId, {
                                                                transform: {
                                                                    ...selectedText.transform,
                                                                    position: { ...selectedText.transform.position, y: parseFloat(e.target.value) || 0 }
                                                                }
                                                            });
                                                            setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                        }}
                                                        placeholder="Y"
                                                        step="1"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={selectedText.transform.position.z}
                                                        onChange={(e) => {
                                                            text3DManagerRef.current.updateText(selectedTextId, {
                                                                transform: {
                                                                    ...selectedText.transform,
                                                                    position: { ...selectedText.transform.position, z: parseFloat(e.target.value) || 0 }
                                                                }
                                                            });
                                                            setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                        }}
                                                        placeholder="Z"
                                                        step="1"
                                                    />
                                                </div>
                                            </div>

                                            {/* Rotation */}
                                            <div className="property-group">
                                                <label>🔄 Rotation (Degrees)</label>
                                                <div className="vector-inputs">
                                                    <input
                                                        type="number"
                                                        value={selectedText.transform.rotation.x}
                                                        onChange={(e) => {
                                                            text3DManagerRef.current.updateText(selectedTextId, {
                                                                transform: {
                                                                    ...selectedText.transform,
                                                                    rotation: { ...selectedText.transform.rotation, x: parseFloat(e.target.value) || 0 }
                                                                }
                                                            });
                                                            setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                        }}
                                                        placeholder="X°"
                                                        step="1"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={selectedText.transform.rotation.y}
                                                        onChange={(e) => {
                                                            text3DManagerRef.current.updateText(selectedTextId, {
                                                                transform: {
                                                                    ...selectedText.transform,
                                                                    rotation: { ...selectedText.transform.rotation, y: parseFloat(e.target.value) || 0 }
                                                                }
                                                            });
                                                            setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                        }}
                                                        placeholder="Y°"
                                                        step="1"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={selectedText.transform.rotation.z}
                                                        onChange={(e) => {
                                                            text3DManagerRef.current.updateText(selectedTextId, {
                                                                transform: {
                                                                    ...selectedText.transform,
                                                                    rotation: { ...selectedText.transform.rotation, z: parseFloat(e.target.value) || 0 }
                                                                }
                                                            });
                                                            setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                        }}
                                                        placeholder="Z°"
                                                        step="1"
                                                    />
                                                </div>
                                            </div>

                                            {/* Scale */}
                                            <div className="property-group">
                                                <label>📏 Scale</label>
                                                <div className="vector-inputs">
                                                    <input
                                                        type="number"
                                                        value={selectedText.transform.scale.x}
                                                        onChange={(e) => {
                                                            text3DManagerRef.current.updateText(selectedTextId, {
                                                                transform: {
                                                                    ...selectedText.transform,
                                                                    scale: { ...selectedText.transform.scale, x: parseFloat(e.target.value) || 1 }
                                                                }
                                                            });
                                                            setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                        }}
                                                        placeholder="Width"
                                                        step="0.1"
                                                        min="0.1"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={selectedText.transform.scale.y}
                                                        onChange={(e) => {
                                                            text3DManagerRef.current.updateText(selectedTextId, {
                                                                transform: {
                                                                    ...selectedText.transform,
                                                                    scale: { ...selectedText.transform.scale, y: parseFloat(e.target.value) || 1 }
                                                                }
                                                            });
                                                            setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                        }}
                                                        placeholder="Height"
                                                        step="0.1"
                                                        min="0.1"
                                                    />
                                                    <div></div> {/* Empty div for grid layout */}
                                                </div>
                                            </div>

                                            {/* Typography */}
                                            <div className="property-group">
                                                <label>🎨 Font Family</label>
                                                <select
                                                    value={selectedText.style.fontFamily}
                                                    onChange={(e) => {
                                                        text3DManagerRef.current.updateText(selectedTextId, {
                                                            style: { ...selectedText.style, fontFamily: e.target.value }
                                                        });
                                                        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                    }}
                                                >
                                                    <option value="Arial">Arial</option>
                                                    <option value="Times New Roman">Times New Roman</option>
                                                    <option value="Helvetica">Helvetica</option>
                                                    <option value="Georgia">Georgia</option>
                                                    <option value="Verdana">Verdana</option>
                                                    <option value="Impact">Impact</option>
                                                    <option value="Comic Sans MS">Comic Sans MS</option>
                                                </select>
                                            </div>

                                            <div className="property-group">
                                                <label>📏 Font Size</label>
                                                <input
                                                    type="number"
                                                    value={selectedText.style.fontSize}
                                                    onChange={(e) => {
                                                        text3DManagerRef.current.updateText(selectedTextId, {
                                                            style: { ...selectedText.style, fontSize: parseInt(e.target.value) || 12 }
                                                        });
                                                        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                    }}
                                                    min="8"
                                                    max="300"
                                                    step="2"
                                                />
                                            </div>

                                            <div className="property-group">
                                                <label>🎨 Text Color</label>
                                                <input
                                                    type="color"
                                                    value={selectedText.style.color}
                                                    onChange={(e) => {
                                                        text3DManagerRef.current.updateText(selectedTextId, {
                                                            style: { ...selectedText.style, color: e.target.value }
                                                        });
                                                        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                    }}
                                                />
                                            </div>

                                            <div className="property-group">
                                                <label>💪 Font Weight</label>
                                                <select
                                                    value={selectedText.style.fontWeight}
                                                    onChange={(e) => {
                                                        text3DManagerRef.current.updateText(selectedTextId, {
                                                            style: { ...selectedText.style, fontWeight: e.target.value as any }
                                                        });
                                                        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                    }}
                                                >
                                                    <option value="100">Thin (100)</option>
                                                    <option value="300">Light (300)</option>
                                                    <option value="normal">Regular (400)</option>
                                                    <option value="500">Medium (500)</option>
                                                    <option value="600">Semi-Bold (600)</option>
                                                    <option value="bold">Bold (700)</option>
                                                    <option value="800">Extra Bold (800)</option>
                                                    <option value="900">Black (900)</option>
                                                </select>
                                            </div>

                                            <div className="property-group">
                                                <label>📐 Font Style</label>
                                                <select
                                                    value={selectedText.style.fontStyle}
                                                    onChange={(e) => {
                                                        text3DManagerRef.current.updateText(selectedTextId, {
                                                            style: { ...selectedText.style, fontStyle: e.target.value as any }
                                                        });
                                                        setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                    }}
                                                >
                                                    <option value="normal">Normal</option>
                                                    <option value="italic">Italic</option>
                                                </select>
                                            </div>

                                            {/* Delete Button */}
                                            <button 
                                                onClick={() => {
                                                    text3DManagerRef.current.deleteText(selectedTextId);
                                                    setText3DElements([...text3DManagerRef.current.getAllTexts()]);
                                                    setSelectedTextId(null);
                                                    showToast('Text deleted', 'info');
                                                }} 
                                                className="delete-text-btn"
                                            >
                                                Delete Text
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </section>

                        {/* Fixed Add Text Button */}
                        <button
                            className={`fixed-add-text-btn ${selectedTrackerId ? 'active' : 'inactive'}`}
                            onClick={() => selectedTrackerId && addTextToTracker(selectedTrackerId, videoTracking.trackingPoints.some(p => p.id === selectedTrackerId))}
                            disabled={!selectedTrackerId}
                            data-tooltip={selectedTrackerId ? "Add 3D Text" : "Select a tracker first"}
                        > 
                            +
                        </button>
                    </div>
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
        <div className="app">            {/* Tab Navigation */}
            {videoTracking.videoSrc && (
                <div className="tab-navigation">
                    <button
                        className={`tab-button ${currentTab === 'tracking' ? 'active' : ''}`}
                        onClick={() => handleTabSwitch('tracking')}
                    >
                        Tracking
                    </button>
                    <button
                        className={`tab-button ${currentTab === 'text3d' ? 'active' : ''}`}
                        onClick={() => handleTabSwitch('text3d')}
                        disabled={videoTracking.trackingPoints.length === 0 && videoTracking.planarTrackers.length === 0}
                    >
                        3D Text
                    </button>
                    <button
                        className={`tab-button ${currentTab === 'export' ? 'active' : ''}`}
                        onClick={() => handleTabSwitch('export')}
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
