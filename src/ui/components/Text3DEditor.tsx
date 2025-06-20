import React, { useRef, useEffect, useState } from 'react';
import { Timeline } from './Timeline';
import { Text3DElement, Text3DManager as Text3DManagerType, Transform3D, TextStyle, Vector3 } from '../utils/text3d/Text3DTypes';
import { Text3DRenderer } from '../utils/text3d/Text3DRenderer';
import { Text3DManagerImpl } from '../utils/text3d/Text3DManager';
import { TrackingPoint, PlanarTracker } from '../utils/tracking/TrackingTypes';
import './Text3DEditor.css';

interface Text3DEditorProps {
  videoRef?: React.RefObject<HTMLVideoElement>; // Accept shared video ref
  videoSrc: string;
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  trackingPoints: TrackingPoint[];
  planarTrackers: PlanarTracker[];
  text3DManager?: Text3DManagerImpl; // Accept shared manager
  onTextCreate?: (text: Text3DElement) => void;
  onTextUpdate?: (text: Text3DElement) => void;
  onTextDelete?: (textId: string) => void;
  onPlayPause?: () => void;
  onSeek?: (frame: number) => void;
  onStepForward?: () => void;
  onStepBackward?: () => void;
}

export const Text3DEditor: React.FC<Text3DEditorProps> = ({
  videoRef: sharedVideoRef,
  videoSrc,
  currentFrame,
  totalFrames,
  isPlaying,
  trackingPoints,
  planarTrackers,
  text3DManager: sharedText3DManager,
  onTextCreate,
  onTextUpdate,
  onTextDelete,
  onPlayPause,
  onSeek,
  onStepForward,
  onStepBackward
}) => {  const localVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use shared manager if provided, otherwise create local one
  const text3DManagerRef = useRef<Text3DManagerImpl>(
    sharedText3DManager || new Text3DManagerImpl()
  );
  
  // Use shared video ref if provided, otherwise use local one
  const videoRef = sharedVideoRef || localVideoRef;
  const text3DRendererRef = useRef<Text3DRenderer | null>(null);

  const [texts, setTexts] = useState<Text3DElement[]>([]);
  const [selectedText, setSelectedText] = useState<Text3DElement | null>(null);
  const [selectedTracker, setSelectedTracker] = useState<string | null>(null);
  const [hoveredTrackerId, setHoveredTrackerId] = useState<string | null>(null);
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);  // Initialize renderers when canvas is ready
  useEffect(() => {
    if (canvasRef.current) {
      text3DRendererRef.current = new Text3DRenderer(canvasRef.current);
    }
  }, []);

  // Update the manager reference if shared one is provided
  useEffect(() => {
    if (sharedText3DManager) {
      text3DManagerRef.current = sharedText3DManager;
    }
  }, [sharedText3DManager]);
  // Update texts list when manager changes or when component mounts/unmounts
  useEffect(() => {
    const updateTexts = () => {
      const allTexts = text3DManagerRef.current.getAllTexts();
      setTexts(allTexts);
      console.log(`[TEXT3D_DEBUG] Updated text list: ${allTexts.length} texts loaded`);
    };
    
    updateTexts();
    
    // Also refresh when this component becomes active
    const interval = setInterval(updateTexts, 100); // Check every 100ms for updates
    
    return () => clearInterval(interval);
  }, [sharedText3DManager]);

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

      const handleSeeked = () => {
        renderFrame();
      };

      if (video.readyState >= 2) {
        handleVideoLoad();
      } else {
        video.addEventListener('loadedmetadata', handleVideoLoad);
        video.addEventListener('seeked', handleSeeked);

        return () => {
          video.removeEventListener('loadedmetadata', handleVideoLoad);
          video.removeEventListener('seeked', handleSeeked);
        };
      }
    }
  }, [videoSrc]);
  // Sync video to current frame and force re-render
  useEffect(() => {
    const updateVideoFrame = () => {
      if (videoRef.current && !isPlaying) {
        const video = videoRef.current;
        if (video.duration && totalFrames > 0) {
          const time = (currentFrame / totalFrames) * video.duration;
          video.currentTime = Math.min(time, video.duration);
          
          // Wait for video to seek to correct position before rendering
          const handleSeeked = () => {
            renderFrame();
            video.removeEventListener('seeked', handleSeeked);
          };
          video.addEventListener('seeked', handleSeeked);
        }
      }
      
      // Also render immediately for responsiveness
      renderFrame();
    };

    updateVideoFrame();
  }, [currentFrame, totalFrames]);  // Handle video playback
  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      
      console.log(`[TEXT3D_DEBUG] Video playback state changed: isPlaying=${isPlaying}, video.paused=${video.paused}`);
      
      if (isPlaying && video.paused) {
        console.log(`[TEXT3D_DEBUG] Starting video playback`);
        video.play().catch(console.error);
      } else if (!isPlaying && !video.paused) {
        console.log(`[TEXT3D_DEBUG] Pausing video playback`);
        video.pause();
      }
    }
  }, [isPlaying]);

  // Render frame when dependencies change (but not during playback)
  useEffect(() => {
    if (!isPlaying) {
      renderFrame();
    }
  }, [texts, selectedText, trackingPoints, planarTrackers]);
  const renderFrame = () => {
    if (!canvasRef.current || !videoRef.current || !text3DRendererRef.current) {
      console.log(`[TEXT3D_DEBUG] renderFrame called but missing references:`, {
        canvas: !!canvasRef.current,
        video: !!videoRef.current,
        renderer: !!text3DRendererRef.current
      });
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d')!;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Debug: Log canvas and video info
    console.log(`[TEXT3D_DEBUG] ==================== RENDER FRAME ====================`);
    console.log(`[TEXT3D_DEBUG] Canvas: ${canvas.width}x${canvas.height}, Video: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
    console.log(`[TEXT3D_DEBUG] Current Frame: ${currentFrame}, Total Frames: ${totalFrames}`);

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Render tracking points (optional debug)
    renderTrackingPoints(ctx);

    // Render planar trackers (optional debug)
    renderPlanarTrackers(ctx);

    // Debug: Log text rendering
    console.log(`[TEXT3D_DEBUG] About to render ${texts.length} texts`);
    texts.forEach((text, index) => {
      console.log(`[TEXT3D_DEBUG] Text ${index + 1}:`, {
        id: text.id,
        content: text.content,
        visible: text.isVisible,
        selected: text.isSelected,
        position: text.transform.position,
        scale: text.transform.scale,
        color: text.style.color,
        fontSize: text.style.fontSize,
        attachedTo: text.attachedToPointId ? `Point: ${text.attachedToPointId}` : `Planar: ${text.attachedToTrackerId}`
      });
    });    // Render all 3D texts
    text3DRendererRef.current.renderAllTexts(
      texts,
      trackingPoints,
      planarTrackers,
      currentFrame,
      hoveredTextId
    );

    console.log(`[TEXT3D_DEBUG] Text rendering completed`);

    // Note: Gizmos removed - using properties panel for transforms
    
    console.log(`[TEXT3D_DEBUG] ==================== END RENDER FRAME ====================`);
  };
  const renderTrackingPoints = (ctx: CanvasRenderingContext2D) => {
    trackingPoints.forEach((point, index) => {
      // Skip feature points from planar trackers
      const isFeaturePoint = planarTrackers.some(tracker => 
        tracker.featurePoints?.some(fp => fp.id === point.id)
      );
      
      if (isFeaturePoint || !point.isActive) return;
      
      const isHovered = hoveredTrackerId === point.id;
      const isSelected = selectedTracker === point.id;
      
      // Get position for current frame or fallback to current position
      const pos = point.framePositions?.get(currentFrame) || { x: point.x, y: point.y };
      const color = `hsl(${(index * 60) % 360}, 70%, 50%)`;
      
      // Draw hover/selection glow effect
      if (isHovered || isSelected) {
        ctx.fillStyle = color;
        ctx.globalAlpha = isSelected ? 0.3 : 0.2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isSelected ? 20 : 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        
        // Add outer glow ring for hover effect
        if (isHovered) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      }
      
      // Draw point with hover/selection effects
      const pointSize = isSelected ? 9 : isHovered ? 8 : 6;
      ctx.fillStyle = color;
      ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : '#ffffff';
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 2;
      ctx.globalAlpha = isSelected ? 1.0 : isHovered ? 0.95 : 0.8;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pointSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Draw search radius with enhanced visibility for selection/hover
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2 : isHovered ? 1.5 : 1;
      ctx.globalAlpha = isSelected ? 0.5 : isHovered ? 0.4 : 0.25;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, point.searchRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });
  };

  const renderPlanarTrackers = (ctx: CanvasRenderingContext2D) => {
    planarTrackers.forEach((tracker, index) => {
      if (!tracker.isActive) return;
      
      const isHovered = hoveredTrackerId === tracker.id;
      const isSelected = selectedTracker === tracker.id;
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
        // Draw hover/selection fill with enhanced visibility
      if (isHovered || isSelected) {
        ctx.fillStyle = color;
        ctx.globalAlpha = isSelected ? 0.2 : 0.12;
        ctx.beginPath();
        corners.forEach((corner, i) => {
          if (i === 0) {
            ctx.moveTo(corner.x, corner.y);
          } else {
            ctx.lineTo(corner.x, corner.y);
          }
        });
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1.0;
        
        // Add outer glow effect for hover
        if (isHovered) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 6;
          ctx.globalAlpha = 0.3;
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
          ctx.globalAlpha = 1.0;
        }
      }
      
      // Draw tracker outline with enhanced hover/selection effects
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 5 : isHovered ? 4 : 2;
      ctx.globalAlpha = isSelected ? 1.0 : isHovered ? 0.95 : 0.7;
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
      
      // Draw corner handles with enhanced visibility
      const handleSize = isSelected ? 7 : isHovered ? 6 : 4;
      ctx.globalAlpha = 1.0;
      corners.forEach(corner => {
        ctx.fillStyle = color;
        ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : 'white';
        ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 2;
        ctx.fillRect(corner.x - handleSize, corner.y - handleSize, handleSize * 2, handleSize * 2);
        ctx.strokeRect(corner.x - handleSize, corner.y - handleSize, handleSize * 2, handleSize * 2);
      });
      
      // Draw center point with enhanced visibility
      const centerSize = isSelected ? 6 : isHovered ? 5 : 3;
      ctx.fillStyle = color;
      ctx.strokeStyle = isSelected ? '#ffffff' : isHovered ? '#ffffff' : 'white';
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, centerSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  };

  const getTextScreenPosition = (text: Text3DElement) => {
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
        setSelectedTracker(null); // Deselect tracker when text is selected
        return;
      }
    }

    // Test if any tracker was clicked
    const clickedTracker = getTrackerAtPosition(canvasX, canvasY);
    if (clickedTracker) {
      setSelectedTracker(clickedTracker.id);
      setSelectedText(null); // Deselect text when tracker is selected
      text3DManagerRef.current.deselectAll();
      setTexts([...text3DManagerRef.current.getAllTexts()]);
      return;
    }

    // If nothing was clicked, deselect everything
    setSelectedTracker(null);
    setSelectedText(null);
    text3DManagerRef.current.deselectAll();
    setTexts([...text3DManagerRef.current.getAllTexts()]);
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Scale coordinates to canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    // Check for text hover
    let hoveredText: string | null = null;
    if (text3DRendererRef.current) {
      for (const text of texts) {
        if (text3DRendererRef.current.hitTestText(
          text,
          { x: canvasX, y: canvasY },
          trackingPoints,
          planarTrackers,
          currentFrame
        )) {
          hoveredText = text.id;
          break;
        }
      }
    }

    // Check for tracker hover
    let hoveredTracker: string | null = null;
    const tracker = getTrackerAtPosition(canvasX, canvasY);
    if (tracker) {
      hoveredTracker = tracker.id;
    }

    setHoveredTextId(hoveredText);
    setHoveredTrackerId(hoveredTracker);

    // Update cursor
    const cursor = hoveredText || hoveredTracker ? 'pointer' : 'default';
    canvas.style.cursor = cursor;
  };

  const getTrackerAtPosition = (x: number, y: number) => {
    // Check planar trackers first
    for (const tracker of planarTrackers) {
      if (!tracker.isActive) continue;
      
      // Get current frame corners
      let corners = [...tracker.corners];
      if (tracker.trajectory && tracker.trajectory.length > 0) {
        const frameEntry = tracker.trajectory.find(t => t.frame === currentFrame);
        if (frameEntry && frameEntry.corners.length === 4) {
          corners = frameEntry.corners.map((c, i) => ({
            ...tracker.corners[i],
            x: c.x,
            y: c.y
          }));
        } else {
          const validEntries = tracker.trajectory.filter(t => t.frame <= currentFrame);
          if (validEntries.length > 0) {
            const closestEntry = validEntries[validEntries.length - 1];
            if (closestEntry.corners.length === 4) {
              corners = closestEntry.corners.map((c, i) => ({
                ...tracker.corners[i],
                x: c.x,
                y: c.y
              }));
            }
          }
        }
      }
      
      // Check if point is inside polygon
      if (isPointInPolygon(x, y, corners)) {
        return { id: tracker.id, type: 'planar' as const };
      }
    }

    // Check point trackers
    for (const point of trackingPoints) {
      if (!point.isActive) continue;
      
      // Skip feature points from planar trackers
      const isFeaturePoint = planarTrackers.some(tracker => 
        tracker.featurePoints?.some(fp => fp.id === point.id)
      );
      if (isFeaturePoint) continue;
      
      const pos = point.framePositions?.get(currentFrame) || { x: point.x, y: point.y };
      const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
      
      if (distance <= 12) { // 12px hit radius
        return { id: point.id, type: 'point' as const };
      }
    }

    return null;
  };

  const isPointInPolygon = (x: number, y: number, polygon: { x: number; y: number }[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (((polygon[i].y > y) !== (polygon[j].y > y)) &&
          (x < (polygon[j].x - polygon[i].x) * (y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
        inside = !inside;
      }
    }
    return inside;
  };

  const selectText = (textId: string) => {
    text3DManagerRef.current.selectText(textId);
    setTexts([...text3DManagerRef.current.getAllTexts()]);
  };

  const addTextToTracker = (trackerId: string, isPoint: boolean = false) => {
    console.log(`[TEXT3D_DEBUG] ==================== ADDING TEXT TO TRACKER ====================`);
    console.log(`[TEXT3D_DEBUG] Tracker ID: ${trackerId}, Is Point: ${isPoint}, Current Frame: ${currentFrame}`);
    
    const pointId = isPoint ? trackerId : undefined;
    const actualTrackerId = isPoint ? trackingPoints.find(p => p.id === trackerId)?.id || trackerId : trackerId;
    
    console.log(`[TEXT3D_DEBUG] Point ID: ${pointId}, Actual Tracker ID: ${actualTrackerId}`);
    
    // Verify tracker exists
    if (isPoint) {
      const point = trackingPoints.find(p => p.id === trackerId);
      if (point) {
        console.log(`[TEXT3D_DEBUG] Found point tracker - Position: (${point.x}, ${point.y}), Active: ${point.isActive}`);
        const framePos = point.framePositions?.get(currentFrame);
        if (framePos) {
          console.log(`[TEXT3D_DEBUG] Point has frame position for frame ${currentFrame}: (${framePos.x}, ${framePos.y})`);
        } else {
          console.log(`[TEXT3D_DEBUG] Point has no frame position for frame ${currentFrame}, using current position`);
        }
      } else {
        console.log(`[TEXT3D_DEBUG] ERROR: Point tracker not found!`);
        return;
      }
    } else {
      const tracker = planarTrackers.find(t => t.id === trackerId);
      if (tracker) {
        console.log(`[TEXT3D_DEBUG] Found planar tracker - Center: (${tracker.center.x}, ${tracker.center.y}), Active: ${tracker.isActive}`);
        console.log(`[TEXT3D_DEBUG] Planar tracker corners:`, tracker.corners.map(c => `(${c.x}, ${c.y})`));
        if (tracker.trajectory && tracker.trajectory.length > 0) {
          console.log(`[TEXT3D_DEBUG] Planar tracker has ${tracker.trajectory.length} trajectory entries`);
          const frameEntry = tracker.trajectory.find(t => t.frame === currentFrame);
          if (frameEntry) {
            console.log(`[TEXT3D_DEBUG] Found trajectory entry for frame ${currentFrame}: center (${frameEntry.center.x}, ${frameEntry.center.y})`);
          } else {
            console.log(`[TEXT3D_DEBUG] No trajectory entry for frame ${currentFrame}`);
          }
        } else {
          console.log(`[TEXT3D_DEBUG] Planar tracker has no trajectory data`);
        }
      } else {
        console.log(`[TEXT3D_DEBUG] ERROR: Planar tracker not found!`);
        return;
      }
    }
    
    const newText = text3DManagerRef.current.createText(actualTrackerId, pointId);
    newText.createdFrame = currentFrame;
    
    console.log(`[TEXT3D_DEBUG] Created text element:`, {
      id: newText.id,
      content: newText.content,
      position: newText.transform.position,
      scale: newText.transform.scale,
      color: newText.style.color,
      fontSize: newText.style.fontSize,
      isVisible: newText.isVisible,
      createdFrame: newText.createdFrame
    });
    
    setTexts([...text3DManagerRef.current.getAllTexts()]);
    selectText(newText.id);
    
    console.log(`[TEXT3D_DEBUG] Total texts after creation: ${text3DManagerRef.current.getAllTexts().length}`);
    console.log(`[TEXT3D_DEBUG] ==================== END ADDING TEXT ====================`);
    
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
              onMouseMove={handleCanvasMouseMove}
              style={{
                width: '100%',
                height: 'auto',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>
      </section>

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
        </div>
        <Text3DPropertyPanel
          selectedText={selectedText}
          selectedTracker={selectedTracker}
          trackingPoints={trackingPoints}
          planarTrackers={planarTrackers}
          onTextUpdate={updateSelectedText}
          onAddText={addTextToTracker}
          onDeleteText={deleteSelectedText}
          onSelectText={selectText}
          allTexts={texts}
        />      </section>

      {/* Fixed Add Text Button */}
      <button
        className={`fixed-add-text-btn ${selectedTracker ? 'active' : 'inactive'}`}
        onClick={() => selectedTracker && addTextToTracker(selectedTracker, trackingPoints.some(p => p.id === selectedTracker))}
        disabled={!selectedTracker}
        data-tooltip={selectedTracker ? "Add 3D Text" : "Select a tracker first"}
      >
        +
      </button>
    </div>
  );
};

// Property panel component
interface Text3DPropertyPanelProps {
  selectedText: Text3DElement | null;
  selectedTracker: string | null;
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
  selectedTracker,
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
    <div className="text3d-property-panel">      {/* Show existing texts if any */}
      {allTexts.length > 0 && (
        <div className="existing-texts-section">
          <h4>
            Text Layers
            <span className="texts-count">{allTexts.length}</span>
          </h4>
          {allTexts.map(text => (
            <div 
              key={text.id} 
              className={`text-item ${text.isSelected ? 'selected' : ''}`}
              onClick={() => onSelectText(text.id)}
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

      {/* Simplified instructions */}
      {allTexts.length === 0 && (
        <div className="text3d-empty-state">
          <div className="empty-icon">🎯</div>
          <p>Select a tracker and click + to add text</p>
        </div>
      )}      {/* No trackers available state */}
      {allTexts.length === 0 && (planarTrackers.length === 0 && trackingPoints.filter(p => 
        !planarTrackers.some(tracker => tracker.featurePoints?.some(fp => fp.id === p.id))
      ).length === 0) && (
        <div className="text3d-empty-state">
          <div className="empty-icon">🎯</div>
          <p>Create trackers in the Tracking tab first</p>
        </div>
      )}

      {/* Text Property Editing */}
      {selectedText && (
        <div className="text-properties">
          <h3>Text Properties: {selectedText.name}</h3>
          
          {/* Content */}
          <div className="property-group">
            <label>📝 Text Content</label>
            <input
              type="text"
              value={selectedText.content}
              onChange={(e) => updateContent(e.target.value)}
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
            <label>🔄 Rotation (Degrees)</label>
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
            </div>
          </div>

          {/* Typography */}
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
            <label>📏 Font Size</label>
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
            <label>📐 Font Style</label>
            <select
              value={selectedText.style.fontStyle}
              onChange={(e) => updateStyle({ fontStyle: e.target.value as any })}
            >
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
            </select>
          </div>

          {/* Delete Button */}
          <button onClick={onDeleteText} className="delete-text-btn">
            Delete Text
          </button>
        </div>
      )}
    </div>
  );
};
