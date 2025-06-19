import React, { useState, useRef, useEffect } from 'react';
import { Text3DElement, Vector3, TextStyle } from '../utils/text3d/Text3DTypes';
import { Text3DManagerImpl } from '../utils/text3d/Text3DManager';
import { Text3DRenderer } from '../utils/text3d/Text3DRenderer';
import { GizmoRenderer } from '../utils/text3d/GizmoRenderer';
import { TrackingPoint, PlanarTracker } from '../utils/tracking/TrackingTypes';
import { Timeline } from './Timeline';

interface Text3DEditorProps {
  videoSrc: string;
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  trackingPoints: TrackingPoint[];
  planarTrackers: PlanarTracker[];
  onTextCreate?: (text: Text3DElement) => void;
  onTextUpdate?: (text: Text3DElement) => void;
  onTextDelete?: (textId: string) => void;
  onPlayPause?: () => void;
  onSeek?: (frame: number) => void;
  onStepForward?: () => void;
  onStepBackward?: () => void;
}

export const Text3DEditor: React.FC<Text3DEditorProps> = ({
  videoSrc,
  currentFrame,
  totalFrames,
  isPlaying,
  trackingPoints,
  planarTrackers,
  onTextCreate,
  onTextUpdate,
  onTextDelete,
  onPlayPause,
  onSeek,
  onStepForward,
  onStepBackward
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const text3DManagerRef = useRef<Text3DManagerImpl>(new Text3DManagerImpl());
  const text3DRendererRef = useRef<Text3DRenderer | null>(null);
  const gizmoRendererRef = useRef<GizmoRenderer | null>(null);

  const [texts, setTexts] = useState<Text3DElement[]>([]);
  const [selectedText, setSelectedText] = useState<Text3DElement | null>(null);
  const [selectedTracker, setSelectedTracker] = useState<string | null>(null);

  // Initialize renderers when canvas is ready
  useEffect(() => {
    if (canvasRef.current) {
      text3DRendererRef.current = new Text3DRenderer(canvasRef.current);
      gizmoRendererRef.current = new GizmoRenderer(canvasRef.current);
    }
  }, []);

  // Update texts list when manager changes
  useEffect(() => {
    setTexts(text3DManagerRef.current.getAllTexts());
  }, [text3DManagerRef.current]);

  // Sync selected text
  useEffect(() => {
    setSelectedText(text3DManagerRef.current.getSelectedText());
  }, [texts]);
  // Handle video load and canvas setup
  useEffect(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
        const handleVideoLoad = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Set initial video time to current frame
        if (video.duration && totalFrames > 0) {
          const time = (currentFrame / totalFrames) * video.duration;
          video.currentTime = Math.min(time, video.duration);
        }
        
        renderFrame();
      };

      video.addEventListener('loadedmetadata', handleVideoLoad);
      video.addEventListener('seeked', renderFrame);
      
      return () => {
        video.removeEventListener('loadedmetadata', handleVideoLoad);
        video.removeEventListener('seeked', renderFrame);
      };
    }
  }, [videoSrc]);
  // Update video time when current frame changes
  useEffect(() => {
    if (videoRef.current && videoRef.current.duration) {
      const frameTime = currentFrame / 30; // Assuming 30fps, should be passed as prop
      videoRef.current.currentTime = Math.min(frameTime, videoRef.current.duration);
    }
  }, [currentFrame]);

  // Sync video to current frame and force re-render
  useEffect(() => {
    if (videoRef.current && !isPlaying) {
      const video = videoRef.current;
      if (video.duration) {
        const time = (currentFrame / totalFrames) * video.duration;
        video.currentTime = time;
        
        // Force immediate re-render after seek
        const handleSeeked = () => {
          // Double render to ensure tracking data is synced
          renderFrame();
          requestAnimationFrame(() => {
            renderFrame();
          });
        };
        
        video.addEventListener('seeked', handleSeeked, { once: true });
      }
    }
    
    // Always render frame when currentFrame changes
    renderFrame();
    
    // Additional render after a small delay to catch any async updates
    const timeoutId = setTimeout(() => {
      renderFrame();
    }, 50); // Increased delay to 50ms for better sync
    
    return () => clearTimeout(timeoutId);
  }, [currentFrame, totalFrames, isPlaying]);

  // Render frame when dependencies change
  useEffect(() => {
    renderFrame();
  }, [texts, selectedText, trackingPoints, planarTrackers]);

  const renderFrame = () => {
    if (!canvasRef.current || !videoRef.current || !text3DRendererRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d')!;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Render tracking points (optional debug)
    renderTrackingPoints(ctx);

    // Render planar trackers (optional debug)
    renderPlanarTrackers(ctx);

    // Render all 3D texts
    text3DRendererRef.current.renderAllTexts(
      texts,
      trackingPoints,
      planarTrackers,
      currentFrame
    );

    // Render gizmo for selected text
    if (selectedText && gizmoRendererRef.current) {
      const textScreenPos = getTextScreenPosition(selectedText);
      if (textScreenPos) {
        gizmoRendererRef.current.renderGizmo(
          textScreenPos,
          selectedText.transform.rotation,
          true, // Show position
          true, // Show rotation
          false // Don't show scale handles (they're in corner handles)
        );
      }
    }
  };
  const renderTrackingPoints = (ctx: CanvasRenderingContext2D) => {
    trackingPoints.forEach((point, index) => {
      // Skip feature points from planar trackers
      const isFeaturePoint = planarTrackers.some(tracker => 
        tracker.featurePoints?.some(fp => fp.id === point.id)
      );
      
      if (isFeaturePoint || !point.isActive) return;
      
      // Get position for current frame or fallback to current position
      const pos = point.framePositions?.get(currentFrame) || { x: point.x, y: point.y };
      const color = `hsl(${(index * 60) % 360}, 70%, 50%)`;
      
      // Draw point with larger size and border
      ctx.fillStyle = color;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Draw search radius
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, point.searchRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });
  };  const renderPlanarTrackers = (ctx: CanvasRenderingContext2D) => {
    planarTrackers.forEach((tracker, index) => {
      if (!tracker.isActive) return;
      
      const color = `hsl(${(index * 60) % 360}, 70%, 50%)`;
      
      // Get current frame position from trajectory or use current position
      let corners = [...tracker.corners]; // Copy the corners array
      let center = { ...tracker.center }; // Copy center
      
      if (tracker.trajectory && tracker.trajectory.length > 0) {
        // Find exact frame match first
        const exactFrameEntry = tracker.trajectory.find(t => t.frame === currentFrame);
        if (exactFrameEntry && exactFrameEntry.corners.length === 4) {
          corners = exactFrameEntry.corners.map((c, i) => ({
            ...tracker.corners[i],
            x: c.x,
            y: c.y
          }));
          center = exactFrameEntry.center;
        } else {
          // Find closest frame (prefer previous frame for stability)
          const sortedEntries = tracker.trajectory
            .filter(t => t.frame <= currentFrame)
            .sort((a, b) => b.frame - a.frame); // Sort descending to get most recent
          
          if (sortedEntries.length > 0) {
            const closestEntry = sortedEntries[0];
            if (closestEntry.corners.length === 4) {
              corners = closestEntry.corners.map((c, i) => ({
                ...tracker.corners[i],
                x: c.x,
                y: c.y
              }));
              center = closestEntry.center;
            }
          }
        }
      }
      
      // Draw tracker outline with thicker lines
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      
      corners.forEach((corner, i) => {
        if (i === 0) {
          ctx.moveTo(corner.x, corner.y);
        } else {
          ctx.lineTo(corner.x, corner.y);
        }
      });
      ctx.closePath();
      ctx.stroke();
      
      // Draw corner handles larger
      corners.forEach(corner => {
        ctx.fillStyle = color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.fillRect(corner.x - 5, corner.y - 5, 10, 10);
        ctx.strokeRect(corner.x - 5, corner.y - 5, 10, 10);
      });
      
      // Draw center point using trajectory center if available
      ctx.fillStyle = color;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  };  const getTextScreenPosition = (text: Text3DElement) => {
    if (text.attachedToPointId) {
      const point = trackingPoints.find(p => p.id === text.attachedToPointId);
      if (point) {
        // Get position for current frame or fallback to current position
        const pos = point.framePositions?.get(currentFrame) || { x: point.x, y: point.y };
        return {
          x: pos.x + text.transform.position.x,
          y: pos.y + text.transform.position.y
        };
      }
    } else {
      const tracker = planarTrackers.find(t => t.id === text.attachedToTrackerId);
      if (tracker) {
        // Get center position for current frame from trajectory or use current center
        let center = { ...tracker.center };
        
        if (tracker.trajectory && tracker.trajectory.length > 0) {
          // Find exact frame match first
          const exactFrameEntry = tracker.trajectory.find(t => t.frame === currentFrame);
          if (exactFrameEntry) {
            center = exactFrameEntry.center;
          } else {
            // Find closest previous frame (more stable)
            const sortedEntries = tracker.trajectory
              .filter(t => t.frame <= currentFrame)
              .sort((a, b) => b.frame - a.frame); // Sort descending
            
            if (sortedEntries.length > 0) {
              center = sortedEntries[0].center;
            }
          }
        }
        
        return {
          x: center.x + text.transform.position.x,
          y: center.y + text.transform.position.y
        };
      }
    }
    return null;
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !text3DRendererRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Scale coordinates to canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    // Test if any text was clicked
    for (const text of texts) {
      if (text3DRendererRef.current.hitTestText(
        text,
        { x: canvasX, y: canvasY },
        trackingPoints,
        planarTrackers,
        currentFrame
      )) {
        selectText(text.id);
        return;
      }
    }

    // If no text was clicked, deselect
    text3DManagerRef.current.deselectAll();
    setTexts([...text3DManagerRef.current.getAllTexts()]);
  };

  const selectText = (textId: string) => {
    text3DManagerRef.current.selectText(textId);
    setTexts([...text3DManagerRef.current.getAllTexts()]);
  };

  const addTextToTracker = (trackerId: string, isPoint: boolean = false) => {
    const pointId = isPoint ? trackerId : undefined;
    const actualTrackerId = isPoint ? trackingPoints.find(p => p.id === trackerId)?.id || trackerId : trackerId;
    
    const newText = text3DManagerRef.current.createText(actualTrackerId, pointId);
    newText.createdFrame = currentFrame;
    
    setTexts([...text3DManagerRef.current.getAllTexts()]);
    selectText(newText.id);
    
    if (onTextCreate) {
      onTextCreate(newText);
    }
  };

  const updateSelectedText = (updates: Partial<Text3DElement>) => {
    if (!selectedText) return;
    
    text3DManagerRef.current.updateText(selectedText.id, updates);
    setTexts([...text3DManagerRef.current.getAllTexts()]);
    
    const updated = text3DManagerRef.current.getTextById(selectedText.id);
    if (updated && onTextUpdate) {
      onTextUpdate(updated);
    }
  };

  const deleteSelectedText = () => {
    if (!selectedText) return;
    
    text3DManagerRef.current.deleteText(selectedText.id);
    setTexts([...text3DManagerRef.current.getAllTexts()]);
    
    if (onTextDelete) {
      onTextDelete(selectedText.id);
    }
  };
  return (
    <div className="text3d-editor">
      {/* Video Section */}
      <section className="text3d-video-section">
        <div className="text3d-video-container">
          <div className="text3d-video-preview">
            <video
              ref={videoRef}
              src={videoSrc}
              style={{ display: 'none' }}
              muted
              playsInline
            />
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              style={{
                width: '100%',
                height: 'auto',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>      </section>

      {/* Timeline Section */}
      {onSeek && (
        <section className="text3d-timeline-section">
          <div className="scrubber-container">
            <Timeline
              currentFrame={currentFrame}
              totalFrames={totalFrames}
              isPlaying={isPlaying}
              onPlayPause={onPlayPause || (() => {})}
              onSeek={onSeek}
              onStepForward={onStepForward || (() => {})}
              onStepBackward={onStepBackward || (() => {})}
            />
          </div>
        </section>
      )}

      {/* Text Controls Section */}
      <section className="text3d-controls-section">
        <div className="text3d-section-header">
          <h3>3D Text Elements</h3>
          <span className="text-count">{texts.length}</span>
        </div>        <Text3DPropertyPanel
          selectedText={selectedText}
          trackingPoints={trackingPoints}
          planarTrackers={planarTrackers}
          onTextUpdate={updateSelectedText}
          onAddText={addTextToTracker}
          onDeleteText={deleteSelectedText}
          onSelectText={selectText}
          allTexts={texts}
        />
      </section>
    </div>
  );
};

// Property panel component
interface Text3DPropertyPanelProps {
  selectedText: Text3DElement | null;
  trackingPoints: TrackingPoint[];
  planarTrackers: PlanarTracker[];
  onTextUpdate: (updates: Partial<Text3DElement>) => void;
  onAddText: (trackerId: string, isPoint?: boolean) => void;
  onDeleteText: () => void;
  onSelectText: (textId: string) => void;
  allTexts: Text3DElement[];
}

const Text3DPropertyPanel: React.FC<Text3DPropertyPanelProps> = ({
  selectedText,
  trackingPoints,
  planarTrackers,
  onTextUpdate,
  onAddText,
  onDeleteText,
  onSelectText,
  allTexts
}) => {
  const updateContent = (content: string) => {
    onTextUpdate({ content });
  };

  const updateTransform = (transform: Partial<Vector3>, type: 'position' | 'rotation') => {
    if (!selectedText) return;
    
    const newTransform = { ...selectedText.transform };
    newTransform[type] = { ...newTransform[type], ...transform };
    onTextUpdate({ transform: newTransform });
  };

  const updateScale = (scale: Partial<{ x: number; y: number }>) => {
    if (!selectedText) return;
    
    const newTransform = { ...selectedText.transform };
    newTransform.scale = { ...newTransform.scale, ...scale };
    onTextUpdate({ transform: newTransform });
  };

  const updateStyle = (style: Partial<TextStyle>) => {
    if (!selectedText) return;
    
    const newStyle = { ...selectedText.style, ...style };
    onTextUpdate({ style: newStyle });
  };
  return (
    <div className="text3d-property-panel">
      {/* Show existing texts if any */}
      {allTexts.length > 0 && (
        <div className="existing-texts-section">
          <h4>Existing Texts</h4>
          {allTexts.map(text => (            <div 
              key={text.id} 
              className={`text-item ${text.isSelected ? 'selected' : ''}`}
              onClick={() => onSelectText(text.id)}
            >
              <div className="text-item-info">
                <div className="text-item-name">{text.name}</div>
                <div className="text-item-content">"{text.content}"</div>
                <div className="text-item-tracker">
                  {text.attachedToPointId ? 
                    `Point: ${text.attachedToPointId.slice(-8)}` : 
                    `Planar: ${text.attachedToTrackerId.slice(-8)}`
                  }
                </div>
              </div>
            </div>
          ))}
        </div>
      )}      {/* Add Text Section */}
      <div className="add-text-section">
        {allTexts.length === 0 && (
          <div className="text3d-empty-state">
            <div className="empty-icon">✨</div>
            <p>Create stunning 3D text elements that follow your tracking points</p>
          </div>
        )}
        
        {planarTrackers.length > 0 && (
          <div>
            <h4>📐 Attach Text to Planar Trackers</h4>
            <p className="section-description">Text will follow the plane's movement, rotation, and perspective</p>
            {planarTrackers.map(tracker => (
              <button
                key={tracker.id}
                onClick={() => onAddText(tracker.id, false)}
                className="add-text-btn"
              >
                📐 Planar Tracker #{tracker.id.slice(-6)}
              </button>
            ))}
          </div>
        )}
        
        {trackingPoints.length > 0 && (
          <div>
            <h4>📍 Attach Text to Point Trackers</h4>
            <p className="section-description">Text will follow individual point movement</p>
            {trackingPoints
              .filter(point => !planarTrackers.some(tracker => 
                tracker.featurePoints?.some(fp => fp.id === point.id)
              ))
              .map(point => (
                <button
                  key={point.id}
                  onClick={() => onAddText(point.id, true)}
                  className="add-text-btn"
                >
                  📍 Point Tracker #{point.id.slice(-6)}
                </button>
              ))}
          </div>
        )}

        {planarTrackers.length === 0 && trackingPoints.length === 0 && (
          <div className="text3d-empty-state">
            <div className="empty-icon">🎯</div>
            <p>Create tracking points or planar trackers in the Tracking tab first</p>
            <p className="helper-text">Switch to the Tracking tab to set up motion tracking</p>
          </div>
        )}
      </div>

      {/* Text Property Editing */}
      {selectedText && (        <div className="text-properties">
          <h3>Edit Text Element: {selectedText.name}</h3>
          
          <div className="property-section-title">Content</div>
          <div className="property-group">
            <label>📝 Text Content</label>
            <input
              type="text"
              value={selectedText.content}
              onChange={(e) => updateContent(e.target.value)}
              className="text-input"
              placeholder="Enter your text here..."
            />          </div>

          <div className="property-section-title">Transform</div>
          <div className="property-group">
            <label>📍 Position Offset</label>
            <div className="vector-inputs">
              <input
                type="number"
                value={selectedText.transform.position.x}
                onChange={(e) => updateTransform({ x: parseFloat(e.target.value) || 0 }, 'position')}
                placeholder="X"
                step="1"
              />
              <input
                type="number"
                value={selectedText.transform.position.y}
                onChange={(e) => updateTransform({ y: parseFloat(e.target.value) || 0 }, 'position')}
                placeholder="Y"
                step="1"
              />
              <input
                type="number"
                value={selectedText.transform.position.z}
                onChange={(e) => updateTransform({ z: parseFloat(e.target.value) || 0 }, 'position')}
                placeholder="Z"
                step="1"
              />
            </div>
          </div>

          {/* Rotation */}
          <div className="property-group">
            <label>🔄 Rotation</label>
            <div className="vector-inputs">
              <input
                type="number"
                value={selectedText.transform.rotation.x}
                onChange={(e) => updateTransform({ x: parseFloat(e.target.value) || 0 }, 'rotation')}
                placeholder="X°"
                step="1"
              />
              <input
                type="number"
                value={selectedText.transform.rotation.y}
                onChange={(e) => updateTransform({ y: parseFloat(e.target.value) || 0 }, 'rotation')}
                placeholder="Y°"
                step="1"
              />
              <input
                type="number"
                value={selectedText.transform.rotation.z}
                onChange={(e) => updateTransform({ z: parseFloat(e.target.value) || 0 }, 'rotation')}
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
                onChange={(e) => updateScale({ x: parseFloat(e.target.value) || 1 })}
                placeholder="Width"
                step="0.1"
                min="0.1"
              />
              <input
                type="number"
                value={selectedText.transform.scale.y}
                onChange={(e) => updateScale({ y: parseFloat(e.target.value) || 1 })}
                placeholder="Height"
                step="0.1"
                min="0.1"
              />
              <div></div> {/* Empty div for grid layout */}
            </div>          </div>

          <div className="property-section-title">Typography</div>
          <div className="property-group">
            <label>🎨 Font Family</label>
            <select
              value={selectedText.style.fontFamily}
              onChange={(e) => updateStyle({ fontFamily: e.target.value })}
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
            <label>� Font Size</label>
            <input
              type="number"
              value={selectedText.style.fontSize}
              onChange={(e) => updateStyle({ fontSize: parseInt(e.target.value) || 12 })}
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
              onChange={(e) => updateStyle({ color: e.target.value })}
            />
          </div>

          <div className="property-group">
            <label>💪 Font Weight</label>
            <select
              value={selectedText.style.fontWeight}
              onChange={(e) => updateStyle({ fontWeight: e.target.value as any })}
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
            <label>� Font Style</label>
            <select
              value={selectedText.style.fontStyle}
              onChange={(e) => updateStyle({ fontStyle: e.target.value as any })}
            >
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
            </select>          </div>

          <div className="property-separator"></div>
          <button onClick={onDeleteText} className="delete-text-btn">
            🗑️ Delete Text Element
          </button>
        </div>
      )}
    </div>
  );
};
