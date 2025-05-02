import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './NodeCanvas.css';
import { X } from 'lucide-react';
import Header from './Header.jsx';
import DebugOverlay from './DebugOverlay.jsx';
import { useCanvasWorker } from './useCanvasWorker.js';
import Node from './Node.jsx';
import { getNodeDimensions } from './utils.js';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator

// Import Zustand store and selectors/actions
import useGraphStore, {
    getActiveGraphId,
    getNodesForGraph,
    getEdgesForGraph,
} from './store/graphStore.js';
import { shallow } from 'zustand/shallow';

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

import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Panel from './Panel'; // This is now used for both sides

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

function NodeCanvas() {
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  // --- Local State for Subscribed Zustand Data ---
  const [localActiveGraphId, setLocalActiveGraphId] = useState(null);
  const [localActiveGraphName, setLocalActiveGraphName] = useState('Loading...');
  const [localActiveGraphDescription, setLocalActiveGraphDescription] = useState('');
  // Store actions in state as well, assuming they are stable
  const [localStoreActions, setLocalStoreActions] = useState(() => ({
    updateNode: (id, fn) => console.log('Initial dummy updateNode', id, fn),
    addEdge: (graphId, edge) => console.log('Initial dummy addEdge', graphId, edge),
    addNode: (graphId, node) => console.log('Initial dummy addNode', graphId, node),
    removeNode: (id) => console.log('Initial dummy removeNode', id),
    updateGraph: (id, fn) => console.log('Initial dummy updateGraph', id, fn),
  }));

  // Ref to track the last subscribed state to prevent unnecessary updates
  const lastSubscribedStateRef = useRef({ id: null, name: null, description: null });

  // --- Subscribe to Zustand Store Manually ---
  useEffect(() => {
    console.log('[Effect: Subscribe] Setting up Zustand subscription.');
    const unsubscribe = useGraphStore.subscribe(
      (state) => {
        const currentActiveGraphId = getActiveGraphId(state);
        const currentGraphData = currentActiveGraphId ? state.graphs.get(currentActiveGraphId) : null;
        const currentName = currentGraphData?.name ?? 'Loading...';
        const currentDescription = currentGraphData?.description ?? '';

        // Compare with last seen state to avoid loops if data is the same
        if (
          currentActiveGraphId !== lastSubscribedStateRef.current.id ||
          currentName !== lastSubscribedStateRef.current.name ||
          currentDescription !== lastSubscribedStateRef.current.description
        ) {
          console.log('[Subscribe Callback] State change detected, updating local state:', {
            id: currentActiveGraphId,
            name: currentName,
            description: currentDescription,
          });
          setLocalActiveGraphId(currentActiveGraphId);
          setLocalActiveGraphName(currentName);
          setLocalActiveGraphDescription(currentDescription);
          // Actions are likely stable, but update them just in case
          // If actions *are* guaranteed stable, this could be optimized
          setLocalStoreActions({
            updateNode: state.updateNode,
            addEdge: state.addEdge,
            addNode: state.addNode,
            removeNode: state.removeNode,
            updateGraph: state.updateGraph,
          });

          // Update the ref with the latest state
          lastSubscribedStateRef.current = {
            id: currentActiveGraphId,
            name: currentName,
            description: currentDescription,
          };
        } else {
           console.log('[Subscribe Callback] State unchanged, skipping local update.');
        }
      }
    );

    // Initial sync: Call the listener once manually after subscribing
    const initialState = useGraphStore.getState();
    const initialActiveGraphId = getActiveGraphId(initialState);
    const initialGraphData = initialActiveGraphId ? initialState.graphs.get(initialActiveGraphId) : null;
    const initialName = initialGraphData?.name ?? 'Loading...';
    const initialDescription = initialGraphData?.description ?? '';

    setLocalActiveGraphId(initialActiveGraphId);
    setLocalActiveGraphName(initialName);
    setLocalActiveGraphDescription(initialDescription);
    setLocalStoreActions({
      updateNode: initialState.updateNode,
      addEdge: initialState.addEdge,
      addNode: initialState.addNode,
      removeNode: initialState.removeNode,
      updateGraph: initialState.updateGraph,
    });
    lastSubscribedStateRef.current = {
      id: initialActiveGraphId,
      name: initialName,
      description: initialDescription,
    };
    console.log('[Effect: Subscribe] Initial state synced:', lastSubscribedStateRef.current);


    return () => {
      console.log('[Effect: Subscribe] Cleaning up subscription.');
      unsubscribe();
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  /*
  // --- Original Consolidated Zustand State Selection (COMMENTED OUT FOR REFERENCE) ---
  const stateSelector = useCallback((state) => {
    const currentActiveGraphId = getActiveGraphId(state);
    const currentActiveGraphData = currentActiveGraphId ? state.graphs.get(currentActiveGraphId) : null;
    return {
        activeGraphId: currentActiveGraphId,
        activeGraphName: currentActiveGraphData?.name, // Select primitive
        activeGraphDescription: currentActiveGraphData?.description, // Select primitive
        // Actions (assuming these are stable references)
        updateNode: state.updateNode,
        addEdge: state.addEdge,
        addNode: state.addNode,
        removeNode: state.removeNode,
        updateGraph: state.updateGraph,
    };
  }, []);

  const {
    activeGraphId,
    activeGraphName, // Destructure new primitives
    activeGraphDescription, // Destructure new primitives
    updateNode,
    addEdge,
    addNode,
    removeNode,
    updateGraph
  } = useGraphStore(stateSelector, shallow);
  */


  /*
  // Previous constant selector test - REMOVED
  // Use a constant selector to test the subscription mechanism
  useGraphStore(() => 0);

  // Provide dummy/placeholder values since we are not selecting real state/actions
  const activeGraphId = null;
  const activeGraphName = 'Loading...';
  const activeGraphDescription = '';
  const storeActions = useMemo(() => ({ // Keep actions structure, but functions do nothing or log
    updateNode: (id, fn) => console.log('Dummy updateNode called', id, fn),
    addEdge: (graphId, edge) => console.log('Dummy addEdge called', graphId, edge),
    addNode: (graphId, node) => console.log('Dummy addNode called', graphId, node),
    removeNode: (id) => console.log('Dummy removeNode called', id),
    updateGraph: (id, fn) => console.log('Dummy updateGraph called', id, fn),
  }), []);
  */

  // Group actions for easier passing if needed elsewhere (use localStoreActions now)
  // const storeActions = useMemo(() => ({ // Original using destructured actions
  //   updateNode,
  //   addEdge,
  //   addNode,
  //   removeNode,
  //   updateGraph
  // }), [updateNode, addEdge, addNode, removeNode, updateGraph]);

  // Derive nodes and edges using useMemo (Update to use localActiveGraphId)
  const nodes = useMemo(() => {
    if (!localActiveGraphId) return []; // Use local state
    const state = useGraphStore.getState();
    const currentGraphData = state.graphs.get(localActiveGraphId); // Use local state
    const nodeIds = currentGraphData?.nodeIds;
    if (!nodeIds) return [];
    const currentNodesMap = state.nodes;

    console.log(`[NodeCanvas] Memoizing nodes for graph ${localActiveGraphId}`); // Use local state
    return nodeIds.map(id => currentNodesMap.get(id)).filter(Boolean);
  }, [localActiveGraphId]); // Depend on local state

  const edges = useMemo(() => {
    if (!localActiveGraphId) return []; // Use local state
    const state = useGraphStore.getState();
    const currentGraphData = state.graphs.get(localActiveGraphId); // Use local state
    const edgeIds = currentGraphData?.edgeIds;
    if (!edgeIds) return [];
    const currentEdgesMap = state.edges;

    console.log(`[NodeCanvas] Memoizing edges for graph ${localActiveGraphId}`); // Use local state
    return edgeIds.map(id => currentEdgesMap.get(id)).filter(Boolean);
  }, [localActiveGraphId]); // Depend on local state

  // --- Local UI State (Keep these) ---
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set()); // Changed to store IDs
  const [draggingNodeInfo, setDraggingNodeInfo] = useState(null); // Renamed, structure might change
  const [longPressingNodeId, setLongPressingNodeId] = useState(null); // Store ID
  const [drawingConnectionFrom, setDrawingConnectionFrom] = useState(null); // Structure might change (store source ID)

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

  const [plusSign, setPlusSign] = useState(null);
  const [nodeNamePrompt, setNodeNamePrompt] = useState({ visible: false, name: '' });
  const [rightPanelExpanded, setRightPanelExpanded] = useState(true); // Default to open?
  const [isHeaderEditing, setIsHeaderEditing] = useState(false);
  const [isRightPanelInputFocused, setIsRightPanelInputFocused] = useState(false);
  const [leftPanelExpanded, setLeftPanelExpanded] = useState(true); // Default to open?
  const [isLeftPanelInputFocused, setIsLeftPanelInputFocused] = useState(false);

  // Use the local state values populated by subscribe
  const projectTitle = localActiveGraphName ?? 'Loading...';
  const projectBio = localActiveGraphDescription ?? '';

  const [previewingNodeId, setPreviewingNodeId] = useState(null);

  // --- Refs (Keep these) ---
  const containerRef = useRef(null);
  const isMouseDown = useRef(false);
  const ignoreCanvasClick = useRef(false);
  const mouseDownPosition = useRef({ x: 0, y: 0 });
  const mouseMoved = useRef(false);
  const startedOnNode = useRef(false);
  const longPressTimeout = useRef(null);
  const mouseInsideNode = useRef(true);
  const panelRef = useRef(null); // Ref for Right Panel (if needed for openNodeTab)
  const leftPanelRef = useRef(null); // Ref for Left Panel

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

  // Ref to track initial mount completion
  const isMountedRef = useRef(false);

  // --- Utility Functions ---
  const lerp = (a, b, t) => a + (b - a) * t;
  const clampCoordinates = (x, y) => {
    const boundedX = Math.min(Math.max(x, 0), canvasSize.width);
    const boundedY = Math.min(Math.max(y, 0), canvasSize.height);
    return { x: boundedX, y: boundedY };
  };

  const isInsideNode = (nodeData, clientX, clientY) => {
     if (!containerRef.current || !nodeData) return false;
     const rect = containerRef.current.getBoundingClientRect();
     const scaledX = (clientX - rect.left - panOffset.x) / zoomLevel;
     const scaledY = (clientY - rect.top - panOffset.y) / zoomLevel;

     // TODO: Adapt getNodeDimensions or get dimensions directly
     // For now, use fixed size as placeholder
     const { currentWidth, currentHeight } = getNodeDimensions(nodeData, previewingNodeId === nodeData.id); // Pass NodeData
     // const currentWidth = NODE_WIDTH; // Placeholder
     // const currentHeight = NODE_HEIGHT; // Placeholder

     const nodeX = nodeData.x;
     const nodeY = nodeData.y;

     return (
       scaledX >= nodeX &&
       scaledX <= nodeX + currentWidth &&
       scaledY >= nodeY &&
       scaledY <= nodeY + currentHeight
     );
  };

  const handleNodeMouseDown = (nodeData, e) => { // Takes nodeData now
    e.stopPropagation();
    if (isPaused || !localActiveGraphId) return; // Check local state

    const nodeId = nodeData.id;

    // --- Double-click ---
    if (e.detail === 2) {
      e.preventDefault();
      if (clickTimeoutIdRef.current) { clearTimeout(clickTimeoutIdRef.current); clickTimeoutIdRef.current = null; }
      potentialClickNodeRef.current = null;
      // Use Panel ref to call openNodeTab (assuming Panel exposes it)
      // panelRef.current?.openNodeTab(nodeId, nodeData.name); // TODO: Re-enable later
      // For now, just toggle preview
      setPreviewingNodeId(prev => prev === nodeId ? null : nodeId);
      return;
    }

    // --- Single click initiation & Long press ---
    if (e.detail === 1) {
        isMouseDown.current = true;
        mouseDownPosition.current = { x: e.clientX, y: e.clientY };
        mouseMoved.current = false;
        mouseInsideNode.current = true;
        startedOnNode.current = true;

        // --- Handle Click vs Double Click Timing ---
        if (clickTimeoutIdRef.current) { clearTimeout(clickTimeoutIdRef.current); }
        potentialClickNodeRef.current = nodeData; // Store nodeData

        clickTimeoutIdRef.current = setTimeout(() => {
            if (potentialClickNodeRef.current?.id === nodeId && !mouseMoved.current && !isMouseDown.current) {
                // --- Execute Selection Logic ---
                const wasSelected = selectedNodeIds.has(nodeId);
                setSelectedNodeIds(prev => {
                    const newSelected = new Set(prev);
                    if (wasSelected) {
                       if (nodeId !== previewingNodeId) { newSelected.delete(nodeId); }
                    } else {
                       newSelected.add(nodeId);
                    }
                    return newSelected;
                });
                console.log(`[Single Click] Timeout executed for node ${nodeId}`);
            } else {
                console.log(`[Single Click] Timeout skipped for node ${nodeId}.`);
            }
            clickTimeoutIdRef.current = null;
            potentialClickNodeRef.current = null;
        }, CLICK_DELAY);

        // --- Setup Long Press for Drag/Connection ---
        clearTimeout(longPressTimeout.current);
        setLongPressingNodeId(nodeId); // Store ID
        longPressTimeout.current = setTimeout(() => {
            if (clickTimeoutIdRef.current) { clearTimeout(clickTimeoutIdRef.current); clickTimeoutIdRef.current = null; }
            potentialClickNodeRef.current = null;

            if (mouseInsideNode.current && !mouseMoved.current && longPressingNodeId === nodeId) { // Check against stored ID
                const canvasRect = containerRef.current.getBoundingClientRect();
                const adjustedX = (e.clientX - canvasRect.left - panOffset.x) / zoomLevel;
                const adjustedY = (e.clientY - canvasRect.top - panOffset.y) / zoomLevel;

                if (selectedNodeIds.has(nodeId)) {
                    // Multi-node drag setup
                    const initialPositions = {};
                    const primaryNodeData = nodes.find(n => n.id === nodeId);
                    if (!primaryNodeData) return;
                    const initialPrimaryPos = { x: primaryNodeData.x, y: primaryNodeData.y };

                    nodes.forEach(n => {
                        if (selectedNodeIds.has(n.id) && n.id !== nodeId) {
                            initialPositions[n.id] = { offsetX: n.x - initialPrimaryPos.x, offsetY: n.y - initialPrimaryPos.y };
                        }
                    });
                    setDraggingNodeInfo({
                        initialMouse: { x: e.clientX, y: e.clientY },
                        initialPrimaryPos,
                        relativeOffsets: initialPositions,
                        primaryId: nodeId
                    });
                    // Use localStoreActions
                    selectedNodeIds.forEach(id => {
                        localStoreActions.updateNode(id, draft => { draft.scale = 1.1; });
                    });

                } else {
                    // Single node drag setup
                    const offset = { x: e.clientX - nodeData.x * zoomLevel - panOffset.x, y: e.clientY - nodeData.y * zoomLevel - panOffset.y };
                    setDraggingNodeInfo({ nodeId: nodeId, offset });
                    // Use localStoreActions
                    localStoreActions.updateNode(nodeId, draft => { draft.scale = 1.1; });
                }
            }
            setLongPressingNodeId(null); // Clear after processing
        }, LONG_PRESS_DURATION);
    }
  };

  const handleSaveNodeData = (nodeId, newData) => {
    console.log('Saving node data for ID:', nodeId, 'Data:', newData);
    if (!localActiveGraphId) return; // Check local state
    // Use localStoreActions
    localStoreActions.updateNode(nodeId, draft => {
        Object.assign(draft, newData); // Simple merge for now
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
    if (isPaused || !localActiveGraphId) return;
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
        nodes.forEach(nd => {
          if (!(selectionRes.x > nd.x + NODE_WIDTH ||
                selectionRes.x + selectionRes.width < nd.x ||
                selectionRes.y > nd.y + NODE_HEIGHT ||
                selectionRes.y + selectionRes.height < nd.y)) {
            currentIds.add(nd.id);
          }
        });
        const finalSelection = new Set([...selectionBaseRef.current]);
        nodes.forEach(nd => {
          if (!selectionBaseRef.current.has(nd.id)) {
            if (currentIds.has(nd.id)) finalSelection.add(nd.id);
            else finalSelection.delete(nd.id);
          }
        });
        setSelectedNodeIds(finalSelection);
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
        if (clickTimeoutIdRef.current) { clearTimeout(clickTimeoutIdRef.current); clickTimeoutIdRef.current = null; potentialClickNodeRef.current = null;}

        // Start drawing connection
        if (longPressingNodeId && !draggingNodeInfo) { // Check longPressingNodeId
             const longPressNodeData = nodes.find(n => n.id === longPressingNodeId); // Get data
             if (longPressNodeData && !isInsideNode(longPressNodeData, e.clientX, e.clientY)) {
                 clearTimeout(longPressTimeout.current);
                 mouseInsideNode.current = false;
                 const startNodeDims = getNodeDimensions(longPressNodeData, previewingNodeId === longPressNodeData.id);
                 const startPt = { x: longPressNodeData.x + startNodeDims.currentWidth / 2, y: longPressNodeData.y + startNodeDims.currentHeight / 2 };
                 const rect = containerRef.current.getBoundingClientRect();
                 const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
                 const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
                 const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);
                 setDrawingConnectionFrom({ sourceNodeId: longPressingNodeId, startX: startPt.x, startY: startPt.y, currentX, currentY });
                 setLongPressingNodeId(null); // Clear ID
             }
        } else if (!draggingNodeInfo && !drawingConnectionFrom && !isPanning && !startedOnNode.current) {
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
        }
      }
    }

    // Dragging Node Logic
    if (draggingNodeInfo) {
        requestAnimationFrame(() => { // Keep RAF
            // Multi-node drag
            if (draggingNodeInfo.relativeOffsets) {
                const primaryNodeId = draggingNodeInfo.primaryId;
                const dx = (e.clientX - draggingNodeInfo.initialMouse.x) / zoomLevel;
                const dy = (e.clientY - draggingNodeInfo.initialMouse.y) / zoomLevel;
                const newPrimaryX = draggingNodeInfo.initialPrimaryPos.x + dx;
                const newPrimaryY = draggingNodeInfo.initialPrimaryPos.y + dy;

                // Update primary node position via store (use localStoreActions)
                localStoreActions.updateNode(primaryNodeId, draft => {
                    draft.x = newPrimaryX;
                    draft.y = newPrimaryY;
                });

                // Update other selected nodes relative to primary (use localStoreActions)
                Object.keys(draggingNodeInfo.relativeOffsets).forEach(nodeId => {
                    const relativeOffset = draggingNodeInfo.relativeOffsets[nodeId];
                    localStoreActions.updateNode(nodeId, draft => {
                        draft.x = newPrimaryX + relativeOffset.offsetX;
                        draft.y = newPrimaryY + relativeOffset.offsetY;
                    });
                });
            } else {
                // Single node drag
                const { nodeId, offset } = draggingNodeInfo;
                const currentAdjustedX = (e.clientX - panOffset.x) / zoomLevel;
                const currentAdjustedY = (e.clientY - panOffset.y) / zoomLevel;
                const newX = currentAdjustedX - (offset.x / zoomLevel);
                const newY = currentAdjustedY - (offset.y / zoomLevel);
                // Update single node position via store (use localStoreActions)
                localStoreActions.updateNode(nodeId, draft => {
                    draft.x = newX;
                    draft.y = newY;
                });
            }
        });
    } else if (drawingConnectionFrom) {
        const bounded = clampCoordinates(currentX, currentY);
        setDrawingConnectionFrom(prev => prev && ({ ...prev, currentX: bounded.x, currentY: bounded.y }));
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
    if (isPaused || !localActiveGraphId) return;
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
      selectionBaseRef.current = new Set([...selectedNodeIds]);
      return;
    }
    setPanStart({ x: e.clientX, y: e.clientY });
    setIsPanning(true);
  };

  const handleMouseUp = (e) => {
    if (isPaused || !localActiveGraphId) return;
    clearTimeout(longPressTimeout.current);
    setLongPressingNodeId(null); // Clear ID
    mouseInsideNode.current = false;

    // Finalize drawing connection
    if (drawingConnectionFrom) {
        const targetNodeData = nodes.find(n => isInsideNode(n, e.clientX, e.clientY)); // Use nodes from store

        if (targetNodeData && targetNodeData.id !== drawingConnectionFrom.sourceNodeId) {
            const sourceId = drawingConnectionFrom.sourceNodeId;
            const destId = targetNodeData.id;

            // Check for existing edge in store's edges
            const exists = edges.some(edge => // Use edges from store
                (edge.sourceId === sourceId && edge.destinationId === destId) ||
                (edge.sourceId === destId && edge.destinationId === sourceId)
            );

            if (!exists) {
                // Create new edge data and add via store action
                const newEdgeId = uuidv4();
                const newEdgeData = { id: newEdgeId, sourceId, destinationId }; // Add other default properties if needed
                 // Use localStoreActions
                localStoreActions.addEdge(localActiveGraphId, newEdgeData);
            }
        }
        setDrawingConnectionFrom(null);
    }

    // Reset scale for dragged nodes
    if (draggingNodeInfo) {
        const nodeIdsToReset = new Set();
        if (draggingNodeInfo.relativeOffsets) {
            nodeIdsToReset.add(draggingNodeInfo.primaryId);
            Object.keys(draggingNodeInfo.relativeOffsets).forEach(id => nodeIdsToReset.add(id));
        } else if (draggingNodeInfo.nodeId) {
            nodeIdsToReset.add(draggingNodeInfo.nodeId);
        }
        nodeIdsToReset.forEach(id => {
            const nodeExists = nodes.some(n => n.id === id); // nodes uses localActiveGraphId
            if(nodeExists) {
                 // Use localStoreActions
                localStoreActions.updateNode(id, draft => { draft.scale = 1; });
            }
        });
        setDraggingNodeInfo(null);
    }

    // Finalize selection box
    if (selectionStart) {
        const rect = containerRef.current.getBoundingClientRect();
        const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
        const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
        const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);
        canvasWorker.calculateSelection({ selectionStart, currentX, currentY })
          .then(selectionRes => {
            const finalSelectedIds = nodes
              .filter(nd => !(selectionRes.x > nd.x + getNodeDimensions(nd, previewingNodeId === nd.id).currentWidth ||
                                selectionRes.x + selectionRes.width < nd.x ||
                                selectionRes.y > nd.y + getNodeDimensions(nd, previewingNodeId === nd.id).currentHeight ||
                                selectionRes.y + selectionRes.height < nd.y))
              .map(nd => nd.id);
            setSelectedNodeIds(prev => new Set([...prev, ...finalSelectedIds]));
          })
          .catch(error => console.error("Final selection calc failed:", error));
        ignoreCanvasClick.current = true;
        setSelectionStart(null);
        setSelectionRect(null);
    }

    // Finalize panning state
    setIsPanning(false);
    isMouseDown.current = false;
    setTimeout(() => { mouseMoved.current = false; }, 0);
  };

  const handleMouseUpCanvas = (e) => {
    if (isPaused || !localActiveGraphId) return;
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
    setDraggingNodeInfo(null);
    setDrawingConnectionFrom(null);
    isMouseDown.current = false;
  };

  const handleCanvasClick = (e) => {
      if (wasDrawingConnection.current) {
          wasDrawingConnection.current = false;
          return;
      }
      if (e.target.closest('g[data-plus-sign="true"]')) return;
      if (e.target.tagName !== 'svg' || !e.target.classList.contains('canvas')) return;
      if (isPaused || draggingNodeInfo || drawingConnectionFrom || mouseMoved.current || recentlyPanned || nodeNamePrompt.visible || !localActiveGraphId) {
          setLastInteractionType('blocked_click');
          return;
      }
      if (ignoreCanvasClick.current) { ignoreCanvasClick.current = false; return; }

      if (selectedNodeIds.size > 0) {
          setSelectedNodeIds(new Set());
          return;
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
      if (!plusSign || !plusSign.tempName || !localActiveGraphId) return;
      const name = plusSign.tempName;
      const newNodeId = uuidv4();
      const newNodeData = {
          id: newNodeId,
          name: name,
          description: '',
          picture: null,
          color: 'maroon', // Default color?
          data: null,
          x: plusSign.x - NODE_WIDTH / 2,
          y: plusSign.y - NODE_HEIGHT / 2,
          scale: 1,
          imageSrc: null,
          thumbnailSrc: null,
          imageAspectRatio: null,
          parentDefinitionNodeId: null,
          edgeIds: [],
          definitionGraphIds: [],
      };
      localStoreActions.addNode(localActiveGraphId, newNodeData);
      setPlusSign(null);
  };

  const keysPressed = useKeyboardShortcuts();

  // Effect to mark component as mounted
  useEffect(() => {
    isMountedRef.current = true;
    // Optional: Cleanup function if needed, though likely not for a simple flag
    // return () => { isMountedRef.current = false; }; 
  }, []); // Runs once after initial mount

  useEffect(() => {
    // Restore effect body
    let animationFrameId;
    const keyboardLoop = async () => {
      // --- Wait for initial mount before processing --- 
      if (!isMountedRef.current) {
        console.log("[Keyboard Loop] Waiting for mount...");
        animationFrameId = requestAnimationFrame(keyboardLoop);
        return;
      }
      // --- End Wait --- 

      console.log("[Keyboard Loop] Running frame..."); // Log start of frame
      if (nodeNamePrompt.visible || isHeaderEditing || isRightPanelInputFocused) {
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
        console.log("[Keyboard Loop] Applying state updates..."); // Log before setState
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

      // Continue the loop ONLY if keys are actively being pressed
      if (panDx !== 0 || panDy !== 0 || zoomDelta !== 0) {
          animationFrameId = requestAnimationFrame(keyboardLoop);
      } else {
         // Otherwise, let the effect rest until a dependency changes or keys are pressed again
         // (The useKeyboardShortcuts hook likely handles waking the component)
         console.log("[Keyboard Loop] No active keys, resting.");
      }
    };

    // Only run the keyboard loop in a browser environment, not JSDOM
    if (typeof window !== 'undefined' && !window.navigator.userAgent?.includes('jsdom')) {
        keyboardLoop();
    }
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [viewportSize, canvasSize, zoomLevel, panOffset, canvasWorker, nodeNamePrompt.visible, isHeaderEditing, isRightPanelInputFocused, isLeftPanelInputFocused]);

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

  const handleToggleRightPanel = useCallback(() => {
    setRightPanelExpanded(prev => !prev);
  }, []);

  const handleToggleLeftPanel = useCallback(() => {
    setLeftPanelExpanded(prev => !prev);
  }, []);

  const handleRightPanelFocusChange = useCallback((isFocused) => {
    console.log(`[Right Panel Focus Change] Setting isRightPanelInputFocused to: ${isFocused}`);
    setIsRightPanelInputFocused(isFocused);
  }, []);

  const handleLeftPanelFocusChange = useCallback((isFocused) => {
    console.log(`[Left Panel Focus Change] Setting isLeftPanelInputFocused to: ${isFocused}`);
    setIsLeftPanelInputFocused(isFocused);
  }, []);

  useEffect(() => {
    console.log(`[Right Panel Focus State] isRightPanelInputFocused is now: ${isRightPanelInputFocused}`);
  }, [isRightPanelInputFocused]);
  useEffect(() => {
    console.log(`[Left Panel Focus State] isLeftPanelInputFocused is now: ${isLeftPanelInputFocused}`);
  }, [isLeftPanelInputFocused]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInputActive = isHeaderEditing || isRightPanelInputFocused || isLeftPanelInputFocused || nodeNamePrompt.visible;
      if (isInputActive || !localActiveGraphId) { return; }

      const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace';
      const nodesSelected = selectedNodeIds.size > 0;

      if (isDeleteKey && nodesSelected) {
        e.preventDefault();
        const idsToDelete = new Set(selectedNodeIds); // Use local selection state
        console.log('[Delete KeyDown] Deleting nodes:', Array.from(idsToDelete));

        // Call removeNode action for each selected ID (Use localStoreActions)
        idsToDelete.forEach(id => {
            localStoreActions.removeNode(id);
        });

        // Clear local selection state AFTER dispatching actions
        setSelectedNodeIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, isHeaderEditing, isRightPanelInputFocused, isLeftPanelInputFocused, nodeNamePrompt.visible, localActiveGraphId, localStoreActions.removeNode]);

  const handleProjectTitleChange = (newTitle) => {
    if (localActiveGraphId) { // Use local state
         // Use localStoreActions
        localStoreActions.updateGraph(localActiveGraphId, draft => { draft.name = newTitle || 'Untitled'; });
    }
  };

  const handleProjectBioChange = (newBio) => {
     if (localActiveGraphId) { // Use local state
         // Use localStoreActions
        localStoreActions.updateGraph(localActiveGraphId, draft => { draft.description = newBio; });
    }
  };

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
      {/* Main content uncommented */}
      
      <Header
         projectTitle={projectTitle} // Uses local state via variable
         onTitleChange={handleProjectTitleChange} // Uses local state/actions
         onEditingStateChange={setIsHeaderEditing}
         debugMode={debugMode}
         setDebugMode={setDebugMode}
      />

      <div style={{ display: 'flex', flexGrow: 1, position: 'relative', overflow: 'hidden' }}> 
        <Panel
          key="left-panel"
          ref={leftPanelRef}
          side="left"
          isExpanded={leftPanelExpanded}
          onToggleExpand={handleToggleLeftPanel}
          onFocusChange={handleLeftPanelFocusChange}
          activeGraphId={localActiveGraphId}
          storeActions={localStoreActions}
        />

        <div
          ref={containerRef}
          className="canvas-area"
          style={{
            flexGrow: 1,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#bdb5b5',
          }}
          // Event handlers uncommented
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUpCanvas}
          onClick={handleCanvasClick}
        >
          {!localActiveGraphId ? ( // Check local state
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
              No graph selected. Open or create a graph from the left panel.
            </div>
          ) : (
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
              onMouseUp={handleMouseUp} // Uncommented
            >
             
              <g className="base-layer">
                {edges.map((edge, idx) => {
                  const sourceNode = nodes.find(n => n.id === edge.sourceId);
                  const destNode = nodes.find(n => n.id === edge.destinationId);

                  if (!sourceNode || !destNode) {
                     console.warn(`Could not find source/dest node for edge ${edge.id}`, edge);
                     return null;
                  }
                  const sNodeDims = getNodeDimensions(sourceNode);
                  const eNodeDims = getNodeDimensions(destNode);
                  const isSNodePreviewing = previewingNodeId === sourceNode.id;
                  const isENodePreviewing = previewingNodeId === destNode.id;
                  const x1 = sourceNode.x + sNodeDims.currentWidth / 2;
                  const y1 = sourceNode.y + (isSNodePreviewing ? NODE_HEIGHT / 2 : sNodeDims.currentHeight / 2);
                  const x2 = destNode.x + eNodeDims.currentWidth / 2;
                  const y2 = destNode.y + (isENodePreviewing ? NODE_HEIGHT / 2 : eNodeDims.currentHeight / 2);

                  return (
                    <line
                      key={`edge-${edge.id}-${idx}`}
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
                   if (draggingNodeInfo) {
                     if (draggingNodeInfo.relativeOffsets) {
                       draggingNodeIds = new Set([
                           draggingNodeInfo.primaryId, 
                           ...Object.keys(draggingNodeInfo.relativeOffsets)
                       ]);
                     } else if (draggingNodeInfo.nodeId) {
                       draggingNodeIds = new Set([draggingNodeInfo.nodeId]);
                     }
                   }

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
                             isSelected={selectedNodeIds.has(node.id)}
                             isDragging={false}
                             onMouseDown={(e) => handleNodeMouseDown(node, e)}
                             isPreviewing={isPreviewing}
                             allNodes={nodes}
                             connections={edges}
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
                             isSelected={selectedNodeIds.has(node.id)}
                             isDragging={true}
                             onMouseDown={(e) => handleNodeMouseDown(node, e)}
                             isPreviewing={isPreviewing}
                             allNodes={nodes}
                             connections={edges}
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
          )}

          {renderCustomPrompt()}
          {debugMode && (
            <DebugOverlay 
              debugData={debugData}
              hideOverlay={() => setDebugMode(false)}
            />
          )}
        </div>

        <Panel
          key="right-panel"
          side="right"
          ref={panelRef}
          isExpanded={rightPanelExpanded}
          onToggleExpand={handleToggleRightPanel}
          onFocusChange={handleRightPanelFocusChange}
          activeGraphId={localActiveGraphId}
          storeActions={localStoreActions}
        />
      </div>
      
      {/* <div>NodeCanvas Simplified - Testing Loop</div> */}
    </div>
  );
}

export default NodeCanvas;