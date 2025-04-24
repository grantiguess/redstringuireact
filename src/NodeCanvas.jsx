import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './NodeCanvas.css';
import { X } from 'lucide-react';
import Header from './Header.jsx';
import DebugOverlay from './DebugOverlay.jsx';
import { useCanvasWorker } from './useCanvasWorker.js';
import Node from './Node.jsx';
import { getNodeDimensions } from './utils.js';

// Import core graph classes
import Graph from './core/Graph.js';
import { default as CoreNode } from './core/Node.js'; // Alias core Node class
import Edge from './core/Edge.js';

import {
  NODE_WIDTH,
  NODE_HEIGHT,
  LONG_PRESS_DURATION,
  LERP_SPEED,
  HEADER_HEIGHT,
  MAX_ZOOM,
  MOVEMENT_THRESHOLD,
  SCROLL_SENSITIVITY,
  PLUS_SIGN_SIZE,
  PLUS_SIGN_ANIMATION_DURATION,
  NODE_PADDING,
  NODE_CORNER_RADIUS,
  NAME_AREA_FACTOR,
  EXPANDED_NODE_WIDTH,
  AVERAGE_CHAR_WIDTH,
  WRAPPED_NODE_HEIGHT,
  LINE_HEIGHT_ESTIMATE,
  EDGE_MARGIN,
  TRACKPAD_ZOOM_SENSITIVITY,
  PAN_DRAG_SENSITIVITY,
  SMOOTH_MOUSE_WHEEL_ZOOM_SENSITIVITY
} from './constants';

import LeftPanel from './LeftPanel'; // Left-side library panel
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Panel from './Panel'; // Renamed from RightPanel

// Check if user's on a Mac using userAgent as platform is deprecated
const isMac = /Mac/i.test(navigator.userAgent);

// Sensitivity constants
const MOUSE_WHEEL_ZOOM_SENSITIVITY = 1;        // Sensitivity for standard mouse wheel zooming
const KEYBOARD_PAN_SPEED = 0.115;                // for keyboard panning
const KEYBOARD_ZOOM_SPEED = 0.15;               // for keyboard zooming

/**
 * PlusSign component
 */
const PlusSign = ({
  plusSign,
  onClick,
  onMorphDone,
  onDisappearDone
}) => {
  const animationFrameRef = useRef(null);
  const plusRef = useRef({
    rotation: -90,
    width: 0,
    height: 0,
    cornerRadius: 40,
    color: '#DEDADA',
    lineOpacity: 1,
    textOpacity: 0,
  });
  const [, forceUpdate] = React.useReducer((s) => s + 1, 0);

  useEffect(() => {
    runAnimation();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [plusSign.mode]);

  const lerp = (a, b, t) => a + (b - a) * t;

  const runAnimation = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    const startTime = performance.now();
    const { mode } = plusSign;
    const appearDisappearDuration = PLUS_SIGN_ANIMATION_DURATION || 200;
    const morphDuration = 300;
    const duration = mode === 'morph' ? morphDuration : appearDisappearDuration;

    const {
      rotation: startRot,
      width: startW,
      height: startH,
      cornerRadius: startCorner,
      color: startColor,
      lineOpacity: startLineOp,
      textOpacity: startTextOp,
    } = plusRef.current;

    let endRot = 0;
    let endWidth = PLUS_SIGN_SIZE;
    let endHeight = PLUS_SIGN_SIZE;
    let endCorner = 40;
    let endColor = '#DEDADA';
    let endLineOp = 1;
    let endTextOp = 0;

    if (mode === 'appear') {
      endRot = 0;
      endWidth = PLUS_SIGN_SIZE;
      endHeight = PLUS_SIGN_SIZE;
      endCorner = 40;
      endColor = '#DEDADA';
      endLineOp = 1;
      endTextOp = 0;
    } else if (mode === 'disappear') {
      endRot = -90;
      endWidth = 0;
      endHeight = 0;
      endCorner = 40;
      endColor = '#DEDADA';
      endLineOp = 1;
      endTextOp = 0;
    } else if (mode === 'morph') {
      endRot = 0;
      endWidth = NODE_WIDTH;
      endHeight = NODE_HEIGHT;
      endCorner = 40;
      endColor = 'maroon';
      endLineOp = 0;
      endTextOp = 1;
    }

    const animateFrame = (currentTime) => {
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / duration, 1);
      const easeT = t * t * (3 - 2 * t);

      plusRef.current = {
        rotation: lerp(startRot, endRot, easeT),
        width: lerp(startW, endWidth, easeT),
        height: lerp(startH, endHeight, easeT),
        cornerRadius: lerp(startCorner, endCorner, easeT),
        color: mode === 'morph'
          ? (easeT < 0.5 ? startColor : endColor)
          : '#DEDADA',
        lineOpacity: mode === 'morph'
          ? lerp(startLineOp, endLineOp, Math.min(easeT * 3, 1))
          : lerp(startLineOp, endLineOp, easeT),
        textOpacity: mode === 'morph'
          ? lerp(startTextOp, endTextOp, easeT)
          : 0,
      };

      forceUpdate();

      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(animateFrame);
      } else {
        animationFrameRef.current = null;
        if (mode === 'disappear') {
          onDisappearDone?.();
        } else if (mode === 'morph') {
          onMorphDone?.();
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(animateFrame);
  };

  const { rotation, width, height, cornerRadius, color, lineOpacity, textOpacity } = plusRef.current;
  const { mode, tempName } = plusSign;
  const halfCross = width / 4;

  return (
    <g
      data-plus-sign="true"
      transform={`translate(${plusSign.x}, ${plusSign.y}) rotate(${rotation})`}
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick?.();
      }}
    >
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={cornerRadius}
        ry={cornerRadius}
        fill={color}
        stroke="maroon"
        strokeWidth={3}
      />
      <line
        x1={-halfCross}
        y1={0}
        x2={halfCross}
        y2={0}
        stroke="maroon"
        strokeWidth={3}
        opacity={lineOpacity}
      />
      <line
        x1={0}
        y1={-halfCross}
        x2={0}
        y2={halfCross}
        stroke="maroon"
        strokeWidth={3}
        opacity={lineOpacity}
      />
      {tempName && mode === 'morph' && (
        <text
          x="0"
          y="5"
          textAnchor="middle"
          fontSize="16"
          fontWeight="bold"
          fontFamily="Helvetica"
          fill="maroon"
          opacity={textOpacity}
          pointerEvents="none"
        >
          {tempName}
        </text>
      )}
    </g>
  );
};

function NodeCanvas({ graphId, initialGraphData, initialNodes, initialEdges, onGraphUpdate, readOnly = false, _initialGraphForTest, _setGraphForTest }) {
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);
  // --- State and Refs ---
  const [graph, internalSetGraph] = useState(() => {
    if (_initialGraphForTest) return _initialGraphForTest;
    // ... existing initialization logic ...
    return new Graph(); // Fallback if nothing else is provided
  });

  // Allow overriding setGraph for testing purposes
  const setGraph = _setGraphForTest || internalSetGraph;

  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const [draggingNode, setDraggingNode] = useState(null);
  const [longPressingNode, setLongPressingNode] = useState(null);
  const [drawingConnectionFrom, setDrawingConnectionFrom] = useState(null);

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [recentlyPanned, setRecentlyPanned] = useState(false);

  const [selectionRect, setSelectionRect] = useState(null);
  const [selectionStart, setSelectionStart] = useState(null);

  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight - HEADER_HEIGHT,
  });
  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth * 4,
    height: (window.innerHeight - HEADER_HEIGHT) * 4,
  });
  const [zoomLevel, setZoomLevel] = useState(1);
  const MIN_ZOOM = Math.max(
    viewportSize.width / canvasSize.width,
    viewportSize.height / canvasSize.height
  );

  const [debugMode, setDebugMode] = useState(false);
  const [debugData, setDebugData] = useState({
    inputDevice: 'Unknown',
    gesture: 'none',
    deltaX: '0',
    deltaY: '0',
    panOffsetX: '0',
    panOffsetY: '0',
    zoomLevel: '1.00',
    localSelectedNodeId_debug: 'N/A', // Add to debug state
  });
  const [isPaused, setIsPaused] = useState(false);
  const [lastInteractionType, setLastInteractionType] = useState(null);

  // Restore necessary state removed during manual deletion
  const [plusSign, setPlusSign] = useState(null);
  const [nodeNamePrompt, setNodeNamePrompt] = useState({ visible: false, name: '' });
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [isHeaderEditing, setIsHeaderEditing] = useState(false);
  const [isPanelInputFocused, setIsPanelInputFocused] = useState(false);
  // END Restore

  const [projectTitle, setProjectTitle] = useState('New Thing');
  const [projectBio, setProjectBio] = useState('');

  // --- Add Preview State ---
  const [previewingNodeId, setPreviewingNodeId] = useState(null);

  // --- Refs ---
  const containerRef = useRef(null); 
  const isMouseDown = useRef(false);
  const ignoreCanvasClick = useRef(false);
  const mouseDownPosition = useRef({ x: 0, y: 0 });
  const mouseMoved = useRef(false);
  const startedOnNode = useRef(false);
  const longPressTimeout = useRef(null);
  const mouseInsideNode = useRef(true);
  const panelRef = useRef(null);
  const canvasWorker = useCanvasWorker();
  const isKeyboardZooming = useRef(false);
  const resizeTimeoutRef = useRef(null);
  const selectionBaseRef = useRef(new Set());
  const wasSelectionBox = useRef(false);
  const wasDrawingConnection = useRef(false);
  // Add refs for click vs double-click detection
  const clickTimeoutIdRef = useRef(null);
  const potentialClickNodeRef = useRef(null);
  const CLICK_DELAY = 250; // milliseconds to wait for a potential double-click

  // --- Utility Functions ---
  const lerp = (a, b, t) => a + (b - a) * t;
  const clampCoordinates = (x, y) => {
    const boundedX = Math.min(Math.max(x, 0), canvasSize.width);
    const boundedY = Math.min(Math.max(y, 0), canvasSize.height);
    return { x: boundedX, y: boundedY };
  };

  const isInsideNode = (node, clientX, clientY) => {
    if (!containerRef.current) return false; // Guard against null ref
    const rect = containerRef.current.getBoundingClientRect();
    const scaledX = (clientX - rect.left - panOffset.x) / zoomLevel;
    const scaledY = (clientY - rect.top - panOffset.y) / zoomLevel;

    // Get current dimensions for the node
    const { currentWidth, currentHeight } = getNodeDimensions(node); // Assumes getNodeDimensions handles CoreNode
    const nodeX = node.getX(); // Use getter
    const nodeY = node.getY(); // Use getter

    return (
      scaledX >= nodeX &&
      scaledX <= nodeX + currentWidth &&
      scaledY >= nodeY &&
      scaledY <= nodeY + currentHeight
    );
  };

  const handleNodeMouseDown = (node, e) => {
    e.stopPropagation();
    if (isPaused) return;

    // --- Double-click --- 
    if (e.detail === 2) {
      e.preventDefault();
      // Clear the pending single-click timeout
      if (clickTimeoutIdRef.current) {
          clearTimeout(clickTimeoutIdRef.current);
          clickTimeoutIdRef.current = null;
      }
      potentialClickNodeRef.current = null; // Clear potential click target
      
      // Toggle preview state ONLY
      setPreviewingNodeId(prev => prev === node.id ? null : node.id);
      return;
    }

    // --- Single click initiation & Long press --- 
    if (e.detail === 1) {
        isMouseDown.current = true; // Still needed for dragging checks
        mouseDownPosition.current = { x: e.clientX, y: e.clientY };
        mouseMoved.current = false;
        mouseInsideNode.current = true;
        startedOnNode.current = true;

        // --- Handle Click vs Double Click Timing --- 
        // Clear previous timeout just in case
        if (clickTimeoutIdRef.current) {
            clearTimeout(clickTimeoutIdRef.current);
        }
        potentialClickNodeRef.current = node; // Store node for potential single click

        clickTimeoutIdRef.current = setTimeout(() => {
            // If this timeout runs, it's a potential single click
            // Check if the node is still the target AND the mouse is UP
            if (potentialClickNodeRef.current?.id === node.id && !mouseMoved.current && !isMouseDown.current) {
                // --- Execute Selection Logic --- 
                const wasSelected = selectedNodes.has(node.id);
                const newSelectedNodes = new Set([...selectedNodes]);
                if (wasSelected) {
                    // If it was selected, deselect it (unless it's the one being previewed)
                    if (node.id !== previewingNodeId) { 
                        newSelectedNodes.delete(node.id);
                    }
                } else {
                    // If it wasn't selected, select it
                    newSelectedNodes.add(node.id);
                }
                setSelectedNodes(newSelectedNodes);
                console.log(`[Single Click] Timeout executed for node ${node.id}`);
            } else {
                // Log why it didn't select if needed
                console.log(`[Single Click] Timeout skipped for node ${node.id}. Reason:`, {
                    targetMatch: potentialClickNodeRef.current?.id === node.id,
                    mouseMoved: mouseMoved.current,
                    isMouseDown: isMouseDown.current
                });
            }
            clickTimeoutIdRef.current = null;
            potentialClickNodeRef.current = null;
        }, CLICK_DELAY);

        // --- Setup Long Press for Drag/Connection --- 
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = setTimeout(() => {
            // Long press activates: clear potential single click
            if (clickTimeoutIdRef.current) {
                clearTimeout(clickTimeoutIdRef.current);
                clickTimeoutIdRef.current = null;
            }
            potentialClickNodeRef.current = null;
            
            // Existing long press logic
            if (mouseInsideNode.current && !mouseMoved.current) {
                const canvasRect = containerRef.current.getBoundingClientRect();
                const adjustedX = (e.clientX - canvasRect.left - panOffset.x) / zoomLevel;
                const adjustedY = (e.clientY - canvasRect.top - panOffset.y) / zoomLevel;
                const offset = { x: adjustedX - node.x, y: adjustedY - node.y };
                if (selectedNodes.has(node.id)) {
                    // For selected nodes, calculate initial positions relative to the primary dragged node
                    const initialPositions = {};
                    const primaryNode = graph.getNodes().find(n => n.id === node.id);
                    if (!primaryNode) return; // Should not happen

                    const initialPrimaryPos = { x: primaryNode.getX(), y: primaryNode.getY() }; // Store initial primary pos
                    graph.getNodes().forEach(n => {
                        if (selectedNodes.has(n.id) && n.id !== primaryNode.id) { // Store only relative offsets for others
                            initialPositions[n.id] = {
                                offsetX: n.getX() - initialPrimaryPos.x,
                                offsetY: n.getY() - initialPrimaryPos.y,
                            };
                        }
                    });
                    setDraggingNode({ 
                        initialMouse: { x: e.clientX, y: e.clientY }, 
                        initialPrimaryPos, // Add initial primary position to state
                        relativeOffsets: initialPositions, // Rename for clarity
                        primaryId: node.id 
                    });
                    // Update scale for selected nodes immutably
                    setGraph(currentGraph => {
                        const newGraph = currentGraph.clone();
                        let changed = false;
                        selectedNodes.forEach(id => {
                            const nodeToUpdate = newGraph.getNodeById(id); // Assuming getNodeById exists or we add it
                            if (nodeToUpdate && nodeToUpdate.scale !== 1.1) {
                                const clonedNode = nodeToUpdate.clone(); // Clone the node
                                clonedNode.setScale(1.1); // Update the cloned node
                                newGraph.updateNode(clonedNode); // Assuming updateNode exists or we add it
                                changed = true;
                            }
                        });
                        return changed ? newGraph : currentGraph; // Return new graph only if changed
                    });
                } else {
                    // Single node drag
                    const offset = { x: e.clientX - node.x * zoomLevel - panOffset.x, y: e.clientY - node.y * zoomLevel - panOffset.y };
                    setDraggingNode({ nodeId: node.id, offset });
                    // Update scale for single node immutably
                    setGraph(currentGraph => {
                        const newGraph = currentGraph.clone();
                        const nodeToUpdate = newGraph.getNodeById(node.id);
                        if (nodeToUpdate && nodeToUpdate.scale !== 1.1) {
                            const clonedNode = nodeToUpdate.clone();
                            clonedNode.setScale(1.1);
                            newGraph.updateNode(clonedNode);
                            return newGraph;
                        }
                        return currentGraph; // No change
                    });
                }
            }
        }, LONG_PRESS_DURATION);
        setLongPressingNode(node); // Keep setting this for mouseMove checks
    }
  };

  const handleSaveNodeData = (nodeId, newData) => {
    console.log('Saving node data for ID:', nodeId, 'Data:', newData);
    setGraph(currentGraph => {
        const newGraph = currentGraph.clone();
        const nodeToUpdate = newGraph.getNodeById(nodeId); // Use getNodeById
        if (nodeToUpdate) {
            const clonedNode = nodeToUpdate.clone(); // Clone the node
            // Update properties from newData
            Object.keys(newData).forEach(key => {
                // Handle specific properties with setters first
                if (key === 'name') {
                    clonedNode.setName(newData[key]);
                } else if (key === 'description' || key === 'bio') {
                    clonedNode.setDescription(newData[key]);
                } else if (key === 'imageSrc') { // Handle full image source
                    clonedNode.setImageSrc(newData[key]);
                } else if (key === 'thumbnailSrc') { // Handle thumbnail source
                    clonedNode.setThumbnailSrc(newData[key]);
                } else if (key === 'imageAspectRatio') { // Handle aspect ratio
                    clonedNode.setImageAspectRatio(newData[key]);
                } else if (key in clonedNode) {
                    clonedNode[key] = newData[key];
                }
            });
            newGraph.updateNode(clonedNode); // Use updateNode
            return newGraph;
        }
        return currentGraph; // Return old graph if node not found
    });
  };

  const handleWheel = async (e) => {
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let deltaY = e.deltaY;
    if (e.deltaMode === 1) { deltaY *= 33; } 
    else if (e.deltaMode === 2) { deltaY *= window.innerHeight; }
    // Also handle deltaX normalization if needed for panning
    let deltaX = e.deltaX;
    if (e.deltaMode === 1) { deltaX *= 33; }
    else if (e.deltaMode === 2) { deltaX *= window.innerWidth; } 

    setDebugData((prev) => ({
      ...prev,
      info: 'Wheel event',
      rawDeltaX: e.deltaX.toFixed(2),
      rawDeltaY: e.deltaY.toFixed(2),
      ctrlKey: e.ctrlKey.toString(),
      isMac: isMac.toString(),
    }));

    // --- Heuristic-Based Wheel Logic --- 
    
    // 1. Check for macOS Pinch-to-Zoom first
    if (isMac && e.ctrlKey) {
        const zoomDelta = deltaY * TRACKPAD_ZOOM_SENSITIVITY;
        try {
          const result = await canvasWorker.calculateZoom({
            deltaY: zoomDelta, 
            currentZoom: zoomLevel,
            mousePos: { x: mouseX, y: mouseY },
            panOffset, viewportSize, canvasSize, MIN_ZOOM, MAX_ZOOM,
          });
          setPanOffset(result.panOffset);
          setZoomLevel(result.zoomLevel);
          setDebugData((prev) => ({
            ...prev,
            inputDevice: 'Trackpad (Mac)',
            gesture: 'pinch-zoom',
            zooming: true,
            panning: false,
            sensitivity: TRACKPAD_ZOOM_SENSITIVITY,
            zoomLevel: result.zoomLevel.toFixed(2),
            panOffsetX: result.panOffset.x.toFixed(2),
            panOffsetY: result.panOffset.y.toFixed(2),
          }));
        } catch (error) {
          console.error('Mac pinch zoom calculation failed:', error);
          setDebugData((prev) => ({ ...prev, info: 'Mac pinch zoom error', error: error.message }));
        }
    // 2. Check for Mac Trackpad Pan (heuristic: non-zero deltaX)
    } else if (isMac && deltaX !== 0) { 
        // Use normalized deltaX and deltaY for panning
        const dx = -deltaX * PAN_DRAG_SENSITIVITY;
        const dy = -deltaY * PAN_DRAG_SENSITIVITY; // Still include vertical pan component
        const maxX = 0;
        const maxY = 0;
        const minX = viewportSize.width - canvasSize.width * zoomLevel;
        const minY = viewportSize.height - canvasSize.height * zoomLevel;

        setPanOffset((prev) => {
          const newX = Math.min(Math.max(prev.x + dx, minX), maxX);
          const newY = Math.min(Math.max(prev.y + dy, minY), maxY);
          setDebugData((prevData) => ({
            ...prevData,
            inputDevice: 'Trackpad (Mac)',
            gesture: 'two-finger pan',
            zooming: false,
            panning: true,
            sensitivity: PAN_DRAG_SENSITIVITY,
            deltaX: deltaX.toFixed(2),
            deltaY: deltaY.toFixed(2),
            panOffsetX: newX.toFixed(2),
            panOffsetY: newY.toFixed(2),
            zoomLevel: zoomLevel.toFixed(2),
          }));
          return { x: newX, y: newY };
        });
    // 3. Handle all other vertical scrolls as standard zoom 
    //    (Non-Mac OR Mac with deltaX === 0, likely mouse wheel)
    } else if (deltaY !== 0) { 
        const zoomDelta = deltaY * SMOOTH_MOUSE_WHEEL_ZOOM_SENSITIVITY; 
        try {
            const result = await canvasWorker.calculateZoom({
                // Direction: scroll up/forward = zoom in (natural)
                deltaY: zoomDelta, 
                // OR: scroll up/forward = zoom out (inverted)
                // deltaY: -zoomDelta, 
                currentZoom: zoomLevel,
                mousePos: { x: mouseX, y: mouseY },
                panOffset, viewportSize, canvasSize, MIN_ZOOM, MAX_ZOOM,
            });
            setPanOffset(result.panOffset);
            setZoomLevel(result.zoomLevel);
            setDebugData((prev) => ({
                ...prev,
                inputDevice: 'Mouse Wheel or Trackpad Scroll',
                gesture: 'wheel-zoom',
                zooming: true,
                panning: false,
                sensitivity: SMOOTH_MOUSE_WHEEL_ZOOM_SENSITIVITY,
                deltaY: deltaY.toFixed(2),
                zoomLevel: result.zoomLevel.toFixed(2),
                panOffsetX: result.panOffset.x.toFixed(2),
                panOffsetY: result.panOffset.y.toFixed(2),
            }));
        } catch (error) {
            console.error('Zoom calculation failed:', error);
            setDebugData((prev) => ({ ...prev, info: 'Wheel zoom error', error: error.message }));
        }
    }
    // Note: Mac scrolls with deltaY === 0 and deltaX === 0 won't trigger anything here.
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const preventDefaultWheel = (e) => { e.preventDefault(); };
      container.addEventListener('wheel', preventDefaultWheel, { passive: false });
      return () => container.removeEventListener('wheel', preventDefaultWheel);
    }
  }, []);

  // --- Mouse Drag Panning (unchanged) ---
  const handleMouseMove = async (e) => {
    if (isPaused) return;
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
    const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
    const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);

    // Selection Box Logic
    if (selectionStart && isMouseDown.current) {
      e.preventDefault();
      try {
        const selectionRes = await canvasWorker.calculateSelection({ selectionStart, currentX, currentY });
        setSelectionRect(selectionRes);
        const currentIds = new Set();
        graph.getNodes().forEach(nd => {
          if (!(selectionRes.x > nd.x + NODE_WIDTH ||
                selectionRes.x + selectionRes.width < nd.x ||
                selectionRes.y > nd.y + NODE_HEIGHT ||
                selectionRes.y + selectionRes.height < nd.y)) {
            currentIds.add(nd.id);
          }
        });
        const finalSelection = new Set([...selectionBaseRef.current]);
        graph.getNodes().forEach(nd => {
          if (!selectionBaseRef.current.has(nd.id)) {
            if (currentIds.has(nd.id)) finalSelection.add(nd.id);
            else finalSelection.delete(nd.id);
          }
        });
        setSelectedNodes(finalSelection);
      } catch (error) {
        console.error("Selection calc failed:", error);
      }
      return;
    }

    if (isMouseDown.current) {
      const dx = e.clientX - mouseDownPosition.current.x;
      const dy = e.clientY - mouseDownPosition.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MOVEMENT_THRESHOLD) {
        mouseMoved.current = true;
        // If mouse moves significantly, it's not a click -> cancel timeout
        if (clickTimeoutIdRef.current) {
            clearTimeout(clickTimeoutIdRef.current);
            clickTimeoutIdRef.current = null;
            potentialClickNodeRef.current = null;
            console.log('[MouseMove] Click timeout cancelled due to movement.');
        }
        // Keep existing logic for starting connection line or panning
        if (longPressingNode && !draggingNode) { 
            // ... start drawing connection ...
             const inside = isInsideNode(longPressingNode, e.clientX, e.clientY);
             if (!inside) {
                 clearTimeout(longPressTimeout.current); // Ensure long press drag doesn't start
                 mouseInsideNode.current = false;
                 const startNodeDims = getNodeDimensions(longPressingNode, previewingNodeId === longPressingNode.id);
                 const startPt = { x: longPressingNode.getX() + startNodeDims.currentWidth / 2, y: longPressingNode.getY() + startNodeDims.currentHeight / 2 }; // Use getters
                 const rect = containerRef.current.getBoundingClientRect();
                 const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
                 const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
                 const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);
                 // Store node ID using the getter method
                 setDrawingConnectionFrom({ sourceNodeId: longPressingNode.getId(), startX: startPt.x, startY: startPt.y, currentX, currentY });
                 setLongPressingNode(null);
             }
        } else if (!draggingNode && !drawingConnectionFrom && !isPanning && !startedOnNode.current) {
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
        }
      }
    }

    if (draggingNode) {
      // --- Multi-node drag --- //
      if (draggingNode.relativeOffsets) {
        const primaryNodeId = draggingNode.primaryId;
        const dx = (e.clientX - draggingNode.initialMouse.x) / zoomLevel;
        const dy = (e.clientY - draggingNode.initialMouse.y) / zoomLevel;

        // Wrap state update in requestAnimationFrame
        requestAnimationFrame(() => {
          setGraph(currentGraph => {
              const newGraph = currentGraph.clone();
              let changed = false;

              // Calculate new primary node position first
              const primaryNodeToUpdate = newGraph.getNodeById(primaryNodeId);
              if (!primaryNodeToUpdate) return currentGraph; // Should not happen

              const clonedPrimary = primaryNodeToUpdate.clone();
              const newPrimaryX = draggingNode.initialPrimaryPos.x + dx;
              const newPrimaryY = draggingNode.initialPrimaryPos.y + dy;
              clonedPrimary.setX(newPrimaryX);
              clonedPrimary.setY(newPrimaryY);
              newGraph.updateNode(clonedPrimary);
              changed = true;

              // Calculate positions for other selected nodes based on the new primary position and relative offsets
              Object.keys(draggingNode.relativeOffsets).forEach(nodeId => {
                  const nodeToUpdate = newGraph.getNodeById(nodeId);
                  if (nodeToUpdate) {
                      const clonedNode = nodeToUpdate.clone();
                      const relativeOffset = draggingNode.relativeOffsets[nodeId];
                      clonedNode.setX(newPrimaryX + relativeOffset.offsetX);
                      clonedNode.setY(newPrimaryY + relativeOffset.offsetY);
                      newGraph.updateNode(clonedNode);
                      changed = true;
                  }
              });
              return changed ? newGraph : currentGraph;
          });
        }); // End requestAnimationFrame
      } else {
        // --- Single node drag --- //
        const currentAdjustedX = (e.clientX - panOffset.x) / zoomLevel;
        const currentAdjustedY = (e.clientY - panOffset.y) / zoomLevel;
        const newX = currentAdjustedX - (draggingNode.offset.x / zoomLevel);
        const newY = currentAdjustedY - (draggingNode.offset.y / zoomLevel);

        // Wrap state update in requestAnimationFrame
        requestAnimationFrame(() => {
          setGraph(currentGraph => {
              const newGraph = currentGraph.clone();
              const nodeToUpdate = newGraph.getNodeById(draggingNode.nodeId);
              if (nodeToUpdate) {
                  const clonedNode = nodeToUpdate.clone();
                  clonedNode.setX(newX);
                  clonedNode.setY(newY);
                  newGraph.updateNode(clonedNode);
                  return newGraph;
              }
              return currentGraph;
          });
        }); // End requestAnimationFrame
      }
    } else if (drawingConnectionFrom) {
      const bounded = clampCoordinates(currentX, currentY);
      setDrawingConnectionFrom(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentX: bounded.x,
          currentY: bounded.y,
        };
      });
    } else if (isPanning) {
      requestAnimationFrame(() => {
        if (!panStart?.x || !panStart?.y) return;
        const dx = (e.clientX - panStart.x) * PAN_DRAG_SENSITIVITY;
        const dy = (e.clientY - panStart.y) * PAN_DRAG_SENSITIVITY;
        const maxX = 0;
        const maxY = 0;
        const minX = viewportSize.width - canvasSize.width * zoomLevel;
        const minY = viewportSize.height - canvasSize.height * zoomLevel;
        setPanOffset(prev => {
          const newX = Math.min(Math.max(prev.x + dx, minX), maxX);
          const newY = Math.min(Math.max(prev.y + dy, minY), maxY);
          if (newX !== prev.x || newY !== prev.y) {
            setPanStart({ x: e.clientX, y: e.clientY });
          }
          return { x: newX, y: newY };
        });
      });
    }
  };

  const handleMouseDown = (e) => {
    // Canvas background mouse down
    if (isPaused) return;

    // Clear any pending single click on a node
    if (clickTimeoutIdRef.current) {
        clearTimeout(clickTimeoutIdRef.current);
        clickTimeoutIdRef.current = null;
        potentialClickNodeRef.current = null;
        console.log('[CanvasMouseDown] Cleared pending node click timeout.');
    }

    isMouseDown.current = true;
    mouseDownPosition.current = { x: e.clientX, y: e.clientY };
    startedOnNode.current = false;
    mouseMoved.current = false;
    setLastInteractionType('mouse_down');

    if ((isMac && e.metaKey) || (!isMac && e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      const rect = containerRef.current.getBoundingClientRect();
      const startX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const startY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      setSelectionStart({ x: startX, y: startY });
      setSelectionRect({ x: startX, y: startY, width: 0, height: 0 });
      selectionBaseRef.current = new Set([...selectedNodes]);
      return;
    }
    setPanStart({ x: e.clientX, y: e.clientY });
    setIsPanning(true);
  };

  const handleMouseUp = (e) => {
    if (isPaused) return;
    clearTimeout(longPressTimeout.current); // Clear long press timer
    // Timeout for single click (`clickTimeoutIdRef`) should clear itself or be cleared by other actions.

    mouseInsideNode.current = false; 

    // Finalize drawing connection
    if (drawingConnectionFrom) {
        // Find target node using its geometry
        const targetNode = graph.getNodes().find(n => isInsideNode(n, e.clientX, e.clientY));
        const targetNodeId = targetNode?.getId(); // Get ID using getter

        // Ensure target node exists and is not the same as source
        if (targetNodeId && targetNodeId !== drawingConnectionFrom.sourceNodeId) {
            setGraph(currentGraph => {
                const newGraph = currentGraph.clone();

                // Check for existing edge using IDs
                const exists = newGraph.getEdges().some(edge =>
                    (edge.getSourceId() === drawingConnectionFrom.sourceNodeId && edge.getDestinationId() === targetNodeId) ||
                    (edge.getSourceId() === targetNodeId && edge.getDestinationId() === drawingConnectionFrom.sourceNodeId)
                );
                
                if (!exists) {
                    // Pass the STRING IDs to addEdge
                    try {
                        const sourceId = drawingConnectionFrom.sourceNodeId;
                        const destId = targetNodeId;

                        // --- DEBUGGING: Check IDs before calling addEdge ---
                        console.log(`Attempting addEdge: Source=${sourceId} (Type: ${typeof sourceId}), Target=${destId} (Type: ${typeof destId})`);
                        if (typeof sourceId !== 'string' || !sourceId) {
                            console.error('CRITICAL: Invalid sourceId before addEdge call!', sourceId);
                            return currentGraph; // Prevent crash
                        }
                        if (typeof destId !== 'string' || !destId) {
                            console.error('CRITICAL: Invalid destId before addEdge call!', destId);
                            return currentGraph; // Prevent crash
                        }
                        // --- END DEBUGGING ---

                        newGraph.addEdge(sourceId, destId);
                        return newGraph;
                    } catch (error) {
                        console.error("Error adding edge in graph:", error); 
                    }
                }
                // If edge exists or addEdge failed, return original graph
                return currentGraph;
            });
        }
        // Clear drawing state regardless of success
        setDrawingConnectionFrom(null);
    }

    // Reset scale for dragged/selected nodes
    if (draggingNode) {
      setGraph(currentGraph => {
          const newGraph = currentGraph.clone();
          let changed = false;
          const nodeIdsToReset = new Set();
          if (draggingNode.relativeOffsets) {
              // Use the string keys directly
              Object.keys(draggingNode.relativeOffsets).forEach(id => nodeIdsToReset.add(id));
          } else if (draggingNode.nodeId) {
              nodeIdsToReset.add(draggingNode.nodeId);
          }

          nodeIdsToReset.forEach(id => { // Now iterating with correct string IDs
              const nodeToUpdate = newGraph.getNodeById(id);
              if (nodeToUpdate && nodeToUpdate.scale !== 1) {
                  const clonedNode = nodeToUpdate.clone();
                  clonedNode.setScale(1);
                  newGraph.updateNode(clonedNode);
                  changed = true;
              }
          });
          return changed ? newGraph : currentGraph;
      });
      setDraggingNode(null);
    }

    // Finalize selection box
    if (selectionStart) {
        const rect = containerRef.current.getBoundingClientRect();
        const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
        const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
        const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);
        canvasWorker.calculateSelection({ selectionStart, currentX, currentY })
          .then(selectionRes => {
            const finalSelectedIds = graph.getNodes()
              .filter(nd => !(selectionRes.x > nd.x + getNodeDimensions(nd, previewingNodeId === nd.id).currentWidth ||
                                selectionRes.x + selectionRes.width < nd.x ||
                                selectionRes.y > nd.y + getNodeDimensions(nd, previewingNodeId === nd.id).currentHeight ||
                                selectionRes.y + selectionRes.height < nd.y))
              .map(nd => nd.id);
            setSelectedNodes(prev => new Set([...prev, ...finalSelectedIds]));
          })
          .catch(error => console.error("Final selection calc failed:", error));
        ignoreCanvasClick.current = true;
        setSelectionStart(null);
        setSelectionRect(null);
    }

    // Finalize panning state
    setIsPanning(false);
    isMouseDown.current = false;
    // Reset mouseMoved ref *after* potential single click timeout has run or been cancelled
    // Doing it here prevents the timeout check from failing if mouseup happens quickly
    // mouseMoved.current = false; 
    // Let's reset it slightly later to ensure timeout logic completes
    setTimeout(() => { mouseMoved.current = false; }, 0); 
  };

  const handleMouseUpCanvas = (e) => {
    if (isPaused) return;
    if (isPanning) {
      const dx = e.clientX - mouseDownPosition.current.x;
      const dy = e.clientY - mouseDownPosition.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MOVEMENT_THRESHOLD) {
        setRecentlyPanned(true);
        setTimeout(() => setRecentlyPanned(false), 100);
      }
      const maxX = 0;
      const maxY = 0;
      const minX = viewportSize.width - canvasSize.width * zoomLevel;
      const minY = viewportSize.height - canvasSize.height * zoomLevel;
      setPanOffset(prev => ({
        x: Math.min(Math.max(prev.x, minX), maxX),
        y: Math.min(Math.max(prev.y, minY), maxY),
      }));
    }
    if (selectionStart) {
      setSelectionStart(null);
      setSelectionRect(null);
    }
    setIsPanning(false);
    setDraggingNode(null);
    setDrawingConnectionFrom(null);
    isMouseDown.current = false;
  };

  // --- handleCanvasClick ---
  const handleCanvasClick = (e) => {
      if (wasDrawingConnection.current) {
          wasDrawingConnection.current = false;
          return;
      }
      if (e.target.closest('g[data-plus-sign="true"]')) return;
      if (e.target.tagName !== 'svg' || !e.target.classList.contains('canvas')) return;

      if (isPaused || draggingNode || drawingConnectionFrom || mouseMoved.current || recentlyPanned || nodeNamePrompt.visible) {
          setLastInteractionType('blocked_click');
          return;
      }
      if (ignoreCanvasClick.current) {
          ignoreCanvasClick.current = false;
          return;
      }

      if (selectedNodes.size > 0) {
          setSelectedNodes(new Set());
          return; // Don't show plus sign if we just cleared selection
      }

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      if (!plusSign) {
          setPlusSign({ x: mouseX, y: mouseY, mode: 'appear', tempName: '' });
          setLastInteractionType('plus_sign_shown');
      } else {
          if (nodeNamePrompt.visible) return;
          setPlusSign(ps => ps && { ...ps, mode: 'disappear' });
          setLastInteractionType('plus_sign_hidden');
      }
  };

  const handlePlusSignClick = () => {
    if (!plusSign) return;
    if (plusSign.mode === 'morph') return;
    setNodeNamePrompt({ visible: true, name: '' });
  };

  const handleClosePrompt = () => {
    if (!nodeNamePrompt.name.trim()) {
      setPlusSign(ps => ps && { ...ps, mode: 'disappear' });
    }
    setNodeNamePrompt({ visible: false, name: '' });
  };

  const handlePromptSubmit = () => {
    const name = nodeNamePrompt.name.trim();
    if (name && plusSign) {
      setPlusSign(ps => ps && { ...ps, mode: 'morph', tempName: name });
    } else {
      setPlusSign(ps => ps && { ...ps, mode: 'disappear' });
    }
    setNodeNamePrompt({ visible: false, name: '' });
  };

  const handleMorphDone = () => {
      if (!plusSign || !plusSign.tempName) return;

      setGraph(currentGraph => {
          const newGraph = currentGraph.clone();
          const newNode = new CoreNode(
              null, // data
              plusSign.tempName, // name
              undefined, // description
              undefined, // picture
              undefined, // color
              null, // id <-- Pass null to trigger UUID generation in constructor
              plusSign.x - NODE_WIDTH / 2, // x
              plusSign.y - NODE_HEIGHT / 2, // y
              1 // scale
          );
          newGraph.addNode(newNode);
          return newGraph;
      });
      setPlusSign(null);
  };

  // --- Keyboard Controls ---
  // Remove manual keysPressed ref and useEffect for listeners
  // const keysPressed = useRef({});
  // useEffect(() => {
  //   const handleKeyDown = (e) => { keysPressed.current[e.key] = true; };
  //   const handleKeyUp = (e) => { keysPressed.current[e.key] = false; };
  //   window.addEventListener('keydown', handleKeyDown);
  //   window.addEventListener('keyup', handleKeyUp);
  //   return () => {
  //     window.removeEventListener('keydown', handleKeyDown);
  //     window.removeEventListener('keyup', handleKeyUp);
  //   };
  // }, []);

  // Use the hook instead
  const keysPressed = useKeyboardShortcuts();

  useEffect(() => {
    let animationFrameId;
    const keyboardLoop = async () => {
      if (nodeNamePrompt.visible || isHeaderEditing || isPanelInputFocused) {
        animationFrameId = requestAnimationFrame(keyboardLoop);
        return;
      }

      // 1. Calculate desired pan delta
      let panDx = 0, panDy = 0;
      if (keysPressed.current['ArrowLeft'] || keysPressed.current['a'] || keysPressed.current['A']) { panDx += KEYBOARD_PAN_SPEED; }
      if (keysPressed.current['ArrowRight'] || keysPressed.current['d'] || keysPressed.current['D']) { panDx -= KEYBOARD_PAN_SPEED; }
      if (keysPressed.current['ArrowUp'] || keysPressed.current['w'] || keysPressed.current['W']) { panDy += KEYBOARD_PAN_SPEED; }
      if (keysPressed.current['ArrowDown'] || keysPressed.current['s'] || keysPressed.current['S']) { panDy -= KEYBOARD_PAN_SPEED; }

      // 2. Calculate desired zoom delta
      let zoomDelta = 0;
      if (keysPressed.current[' ']) { zoomDelta = KEYBOARD_ZOOM_SPEED; }
      if (keysPressed.current['Shift']) { zoomDelta = -KEYBOARD_ZOOM_SPEED; }

      // 3. Perform Zoom Calculation (if needed)
      let zoomResult = null;
      if (zoomDelta !== 0 && !isKeyboardZooming.current) {
        isKeyboardZooming.current = true;
        try {
          const mousePos = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
          zoomResult = await canvasWorker.calculateZoom({
            deltaY: -zoomDelta, // Negated for keyboard
            currentZoom: zoomLevel,
            mousePos,
            panOffset,
            viewportSize, canvasSize, MIN_ZOOM, MAX_ZOOM
          });
        } catch (error) {
          console.error('Keyboard zoom calculation failed:', error);
        } finally {
          isKeyboardZooming.current = false;
        }
      }

      // 4. Apply Updates Functionally if needed
      if (zoomResult || panDx !== 0 || panDy !== 0) {
        // Update Zoom Level Functionally
        if (zoomResult) {
            setZoomLevel(zoomResult.zoomLevel); // Can set directly as it depends only on worker result
        }

        // Update Pan Offset Functionally
        setPanOffset(prevPan => {
          // Determine the target zoom level for clamping
          const targetZoomLevel = zoomResult ? zoomResult.zoomLevel : zoomLevel;

          // Start with the pan offset from zoom result (includes centering) or previous pan state
          const basePan = zoomResult ? zoomResult.panOffset : prevPan;

          // Apply keyboard pan delta to the base pan
          let finalX = basePan.x + panDx;
          let finalY = basePan.y + panDy;

          // Clamp using the target zoom level
          const maxX = 0, maxY = 0;
          const minX = viewportSize.width - canvasSize.width * targetZoomLevel;
          const minY = viewportSize.height - canvasSize.height * targetZoomLevel;
          finalX = Math.min(Math.max(finalX, minX), maxX);
          finalY = Math.min(Math.max(finalY, minY), maxY);

          // Return the new state only if it has actually changed
          if (finalX !== prevPan.x || finalY !== prevPan.y) {
            return { x: finalX, y: finalY };
          }

          // Otherwise, return the previous state to prevent unnecessary re-renders
          return prevPan;
        });
      }

      // Continue the loop
      animationFrameId = requestAnimationFrame(keyboardLoop);
    };

    // Only run the keyboard loop in a browser environment, not JSDOM
    if (typeof window !== 'undefined' && !window.navigator.userAgent?.includes('jsdom')) {
        keyboardLoop();
    }
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [viewportSize, canvasSize, zoomLevel, panOffset, canvasWorker, nodeNamePrompt.visible, isHeaderEditing, isPanelInputFocused]);

  const renderCustomPrompt = () => {
    if (!nodeNamePrompt.visible) return null;
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 999 }} />
        <div
          style={{
            position: 'fixed',
            top: HEADER_HEIGHT + 25,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#bdb5b5',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: 1000,
            width: '300px',
          }}
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', cursor: 'pointer' }}>
            <X size={20} color="#999" onClick={handleClosePrompt} />
          </div>
          <div style={{ textAlign: 'center', marginBottom: '15px', color: 'black' }}>
            <strong style={{ fontSize: '18px' }}>Name Your Thing</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              id="node-name-prompt-input" // Add id
              name="nodeNamePromptInput" // Add name
              value={nodeNamePrompt.name}
              onChange={(e) => setNodeNamePrompt({ ...nodeNamePrompt, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePromptSubmit(); }}
              style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', marginRight: '10px' }}
              autoFocus
            />
            <button
              onClick={handlePromptSubmit}
              style={{ padding: '10px 20px', backgroundColor: 'maroon', color: '#bdb5b5', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
              Enter
            </button>
          </div>
        </div>
      </>
    );
  };

  const handleTogglePanel = () => { setPanelExpanded(prev => !prev); };

  const handleHoverView = () => {
    setDebugMode(true);
  };

  // Callback for Header component
  const handleHeaderEditingChange = (isEditing) => {
    setIsHeaderEditing(isEditing);
  };

  // Callback for Panel component
  const handlePanelFocusChange = (isFocused) => {
    console.log(`[Panel Focus Change] Setting isPanelInputFocused to: ${isFocused}`);
    setIsPanelInputFocused(isFocused);
  };

  // --- Log Panel Focus State ---
  useEffect(() => {
    console.log(`[Panel Focus State] isPanelInputFocused is now: ${isPanelInputFocused}`);
  }, [isPanelInputFocused]);

  // --- Delete Node Logic ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      console.log(`[Delete KeyDown] Key pressed: ${e.key}`);

      // Check if any input field is focused or prompt is visible
      const isInputActive = isHeaderEditing || isPanelInputFocused || nodeNamePrompt.visible;
      console.log(`[Delete KeyDown] Is Input Active? ${isInputActive}`);
      if (isInputActive) {
        return; // Don't interfere with typing
      }

      // Check for Delete or Backspace keys and if nodes are selected
      const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace';
      const nodesSelected = selectedNodes.size > 0;
      console.log(`[Delete KeyDown] Is Delete Key? ${isDeleteKey}, Nodes Selected: ${nodesSelected} (size: ${selectedNodes.size})`);

      if (isDeleteKey && nodesSelected) {
        console.log('[Delete KeyDown] Deleting nodes:', Array.from(selectedNodes));
        e.preventDefault(); // Prevent default Backspace behavior (like browser back)

        // Capture IDs before clearing selection
        const idsToDelete = new Set(selectedNodes);

        // Filter out selected nodes using immutable update
        setGraph(prevGraph => {
            const newGraph = prevGraph.clone();
            let changed = false;
            idsToDelete.forEach(id => {
                const nodeToRemove = newGraph.getNodeById(id); // Find node in the clone
                if (nodeToRemove) {
                    newGraph.removeNode(nodeToRemove); // Use graph's removeNode method
                    changed = true;
                }
            });

            if (changed) {
                console.log(`[Delete KeyDown] Nodes remaining: ${newGraph.getNodes().length}`);
                return newGraph; // Return the modified clone
            }
            return prevGraph; // Return original graph if no changes made
        });

        // Clear selection state AFTER updating the graph
        setSelectedNodes(new Set()); 
      }
    };

    console.log('[Delete KeyDown] Adding keydown listener');
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup listener on component unmount
    return () => {
      console.log('[Delete KeyDown] Removing keydown listener');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHeaderEditing, isPanelInputFocused, nodeNamePrompt.visible]);

  // --- Callbacks for Lifted State ---
  const handleProjectTitleChange = (newTitle) => {
    setProjectTitle(newTitle || 'Untitled'); // Ensure it doesn't become empty
  };

  const handleProjectBioChange = (newBio) => {
    setProjectBio(newBio);
  };

  // Memoize the nodes array
  const memoizedNodes = useMemo(() => graph.getNodes(), [graph]);

  return (
    <div
      className="node-canvas-container"
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'transparent',
        transition: 'background-color 0.3s ease',
      }}
      tabIndex="0"
      onBlur={() => keysPressed.current = {}}
    >
      <Header
         projectTitle={projectTitle}
         onTitleChange={handleProjectTitleChange}
         onEditingStateChange={handleHeaderEditingChange}
         debugMode={debugMode}
         setDebugMode={setDebugMode}
      />

      {/* Main content: left panel, canvas, right panel */}
      <div style={{ display: 'flex', flexGrow: 1 }}>        
        <LeftPanel />

        <div
          ref={containerRef}
          className="canvas-area"
          style={{
            flexGrow: 1,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#bdb5b5',
          }}
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUpCanvas}
          onClick={handleCanvasClick}
        >
          <svg
            className="canvas"
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                transformOrigin: '0 0',
                backgroundColor: '#bdb5b5',
                opacity: 1,
                pointerEvents: 'auto',
            }}
            onMouseUp={handleMouseUp}
          >
            <g className="base-layer">
              {graph.getEdges().map((edge, idx) => {
                // Use the new methods that return string IDs directly
                const sourceId = edge.getSourceId(); 
                const destId = edge.getDestinationId();

                if (sourceId === undefined || destId === undefined) {
                  console.warn(`Edge at index ${idx} has undefined source/dest ID`, edge);
                  return null;
                }

                const sNode = graph.getNodeById(sourceId);
                const eNode = graph.getNodeById(destId);

                if (!sNode || !eNode) {
                   console.warn(`Could not find source/dest node for edge ${edge.getId()}`, { sourceId, destId });
                   return null;
                }

                // Get dynamic dimensions based on node state (default, image, or preview)
                const sNodeDims = getNodeDimensions(sNode);
                const eNodeDims = getNodeDimensions(eNode);

                // Determine if source/dest nodes are the one being previewed
                const isSNodePreviewing = previewingNodeId === sNode.getId();
                const isENodePreviewing = previewingNodeId === eNode.getId();

                // Calculate endpoints, adjusting Y for previewing node
                const x1 = sNode.getX() + sNodeDims.currentWidth / 2;
                const y1 = sNode.getY() + (isSNodePreviewing ? NODE_HEIGHT / 2 : sNodeDims.currentHeight / 2);
                const x2 = eNode.getX() + eNodeDims.currentWidth / 2;
                const y2 = eNode.getY() + (isENodePreviewing ? NODE_HEIGHT / 2 : eNodeDims.currentHeight / 2);

                return (
                  <line
                    key={`edge-${sNode.getId()}-${eNode.getId()}-${idx}`}
                    x1={x1} 
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="black"
                    strokeWidth="8"
                  />
                );
              })}
              {drawingConnectionFrom && (
                <line
                  x1={drawingConnectionFrom.startX}
                  y1={drawingConnectionFrom.startY}
                  x2={drawingConnectionFrom.currentX}
                  y2={drawingConnectionFrom.currentY}
                  stroke="black"
                  strokeWidth="8"
                />
              )}

              {(() => {
                 let draggingNodeIds = new Set();
                 if (draggingNode) {
                   if (draggingNode.relativeOffsets) {
                     draggingNodeIds = new Set([
                         draggingNode.primaryId, 
                         ...Object.keys(draggingNode.relativeOffsets)
                     ]);
                   } else if (draggingNode.nodeId) {
                     draggingNodeIds = new Set([draggingNode.nodeId]);
                   }
                 }

                 const nodes = graph.getNodes();
                 const nonDraggingNodes = nodes.filter(node => !draggingNodeIds.has(node.id));
                 const draggingNodes = nodes.filter(node => draggingNodeIds.has(node.id));

                 return (
                   <>
                     {nonDraggingNodes.map((node) => {
                       const isPreviewing = previewingNodeId === node.id;
                       const dimensions = getNodeDimensions(node, isPreviewing);
                       return (
                         <Node
                           key={node.id}
                           node={node}
                           currentWidth={dimensions.currentWidth}
                           currentHeight={dimensions.currentHeight}
                           textAreaHeight={dimensions.textAreaHeight}
                           imageWidth={dimensions.imageWidth}
                           imageHeight={dimensions.calculatedImageHeight}
                           innerNetworkWidth={dimensions.innerNetworkWidth}
                           innerNetworkHeight={dimensions.innerNetworkHeight}
                           isSelected={selectedNodes.has(node.id)}
                           isDragging={false}
                           onMouseDown={(e) => handleNodeMouseDown(node, e)}
                           isPreviewing={isPreviewing}
                           allNodes={nodes}
                           connections={graph.getEdges()}
                         />
                       );
                     })}

                     {draggingNodes.map((node) => {
                       const isPreviewing = previewingNodeId === node.id;
                       const dimensions = getNodeDimensions(node, isPreviewing);
                       return (
                         <Node
                           key={node.id}
                           node={node}
                           currentWidth={dimensions.currentWidth}
                           currentHeight={dimensions.currentHeight}
                           textAreaHeight={dimensions.textAreaHeight}
                           imageWidth={dimensions.imageWidth}
                           imageHeight={dimensions.calculatedImageHeight}
                           innerNetworkWidth={dimensions.innerNetworkWidth}
                           innerNetworkHeight={dimensions.innerNetworkHeight}
                           isSelected={selectedNodes.has(node.id)}
                           isDragging={true}
                           onMouseDown={(e) => handleNodeMouseDown(node, e)}
                           isPreviewing={isPreviewing}
                           allNodes={nodes}
                           connections={graph.getEdges()}
                         />
                       );
                     })}
                   </>
                 );
               })()}
            </g>

             {selectionRect && (
               <rect
                 x={selectionRect.x}
                 y={selectionRect.y}
                 width={selectionRect.width}
                 height={selectionRect.height}
                 fill="rgba(255, 0, 0, 0.1)"
                 stroke="red"
                 strokeWidth={1}
               />
             )}

             {plusSign && (
               <PlusSign
                 plusSign={plusSign}
                 onClick={handlePlusSignClick}
                 onMorphDone={handleMorphDone}
                 onDisappearDone={() => setPlusSign(null)}
               />
             )}
          </svg>

          {renderCustomPrompt()}
          {debugMode && (
            <DebugOverlay 
              debugData={debugData}
              hideOverlay={() => setDebugMode(false)}
            />
          )}
        </div>

        {/* Right-side details panel */}
        <Panel
          ref={panelRef}
          isExpanded={panelExpanded}
          onToggleExpand={handleTogglePanel}
          onFocusChange={handlePanelFocusChange}
          nodes={memoizedNodes}
          onSaveNodeData={handleSaveNodeData}
          projectTitle={projectTitle}
          projectBio={projectBio}
          onProjectTitleChange={handleProjectTitleChange}
          onProjectBioChange={handleProjectBioChange}
        />
      </div>
    </div>
  );
}

export default NodeCanvas;