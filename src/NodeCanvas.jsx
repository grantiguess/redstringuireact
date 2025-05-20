import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './NodeCanvas.css';
import { X } from 'lucide-react';
import Header from './Header.jsx';
import DebugOverlay from './DebugOverlay.jsx';
import { useCanvasWorker } from './useCanvasWorker.js';
import Node from './Node.jsx';
import PlusSign from './PlusSign.jsx'; // Import the new PlusSign component
import PieMenu from './PieMenu.jsx'; // Import the PieMenu component
import { getNodeDimensions } from './utils.js';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator
import { Edit3, Trash2, Link, Maximize2, Minimize2 } from 'lucide-react'; // Example icons, Maximize2 for expand, Minimize2 for contract

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

function NodeCanvas() {
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  // <<< Define storeActions using useMemo >>>
  const storeActions = useMemo(() => {
    const state = useGraphStore.getState();
    return {
      updateNode: state.updateNode,
      addEdge: state.addEdge,
      addNode: state.addNode,
      removeNode: state.removeNode,
      updateGraph: state.updateGraph,
      createNewGraph: state.createNewGraph,
      setActiveGraph: state.setActiveGraph,
      setActiveDefinitionNode: state.setActiveDefinitionNode,
      openRightPanelNodeTab: state.openRightPanelNodeTab,
      createAndAssignGraphDefinition: state.createAndAssignGraphDefinition,
      closeRightPanelTab: state.closeRightPanelTab,
      activateRightPanelTab: state.activateRightPanelTab,
      openGraphTab: state.openGraphTab,
      moveRightPanelTab: state.moveRightPanelTab,
      closeGraph: state.closeGraph,
      toggleGraphExpanded: state.toggleGraphExpanded,
      toggleSavedNode: state.toggleSavedNode,
      updateMultipleNodePositions: state.updateMultipleNodePositions,
    };
  }, []); // Empty dependency array means actions are stable (typical for Zustand)

  // <<< SELECT STATE DIRECTLY >>>
  const activeGraphId = useGraphStore(state => state.activeGraphId);
  const activeDefinitionNodeId = useGraphStore(state => state.activeDefinitionNodeId);
  const graphsMap = useGraphStore(state => state.graphs);
  const nodesMap = useGraphStore(state => state.nodes);
  const edgesMap = useGraphStore(state => state.edges);
  const savedNodeIds = useGraphStore(state => state.savedNodeIds);
  // Get open graph IDs needed for initial check
  const openGraphIds = useGraphStore(state => state.openGraphIds);

  // <<< Derive active graph data directly >>>
  const activeGraphData = useMemo(() => {
      return activeGraphId ? graphsMap.get(activeGraphId) : null;
  }, [activeGraphId, graphsMap]);
  const activeGraphName = activeGraphData?.name ?? 'Loading...';
  const activeGraphDescription = activeGraphData?.description ?? '';

  // <<< Initial Graph Creation Logic (Revised) >>>
  useEffect(() => {
      // Check if graph maps are loaded and if there's no active graph AND no open graphs
      if (graphsMap.size > 0 && activeGraphId === null && openGraphIds.length === 0) {
           //console.log('[Effect: Initial Check] No active or open graphs found, creating default "New Thing".');
           storeActions.createNewGraph({ name: 'New Thing' });
      } else if (graphsMap.size === 0 && localStorage.getItem('graphsMap') === null) {
          // Handle the very first load case where localStorage is empty
          //console.log('[Effect: Initial Check] First load (no persisted graphs), creating default "New Thing".');
          storeActions.createNewGraph({ name: 'New Thing' });
      }
  }, [graphsMap, activeGraphId, openGraphIds, storeActions]); // Depend on relevant state

  // Derive nodes and edges using useMemo (Update dependency array)
  const nodes = useMemo(() => { 
    if (!activeGraphId) return [];
    // const state = useGraphStore.getState(); // No longer need getState
    const currentGraphData = activeGraphId ? graphsMap.get(activeGraphId) : null; // Use selected map
    const nodeIds = currentGraphData?.nodeIds;
    if (!nodeIds) return [];
    // const currentNodesMap = state.nodes; // Use selected map
    const derivedNodes = nodeIds.map(id => nodesMap.get(id)).filter(Boolean);
    return derivedNodes;
  // }, [localActiveGraphId, renderTrigger]); // Depend on local state AND renderTrigger
  }, [activeGraphId, graphsMap, nodesMap]); // <<< UPDATE DEPENDENCIES

  const edges = useMemo(() => { 
    if (!activeGraphId) return [];
    // const state = useGraphStore.getState(); // No longer need getState
    const currentGraphData = activeGraphId ? graphsMap.get(activeGraphId) : null; // Use selected map
    const edgeIds = currentGraphData?.edgeIds;
    if (!edgeIds) return [];
    // const currentEdgesMap = state.edges; // Use selected map
    return edgeIds.map(id => edgesMap.get(id)).filter(Boolean);
  // }, [localActiveGraphId, renderTrigger]); // Depend on local state AND renderTrigger
  }, [activeGraphId, graphsMap, edgesMap]); // <<< UPDATE DEPENDENCIES

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
  const [isPieMenuRendered, setIsPieMenuRendered] = useState(false); // Controls if PieMenu is in DOM for animation
  const [currentPieMenuData, setCurrentPieMenuData] = useState(null); // Holds { node, buttons, nodeDimensions }
  const [editingNodeIdOnCanvas, setEditingNodeIdOnCanvas] = useState(null); // For panel-less editing

  // New states for PieMenu transition
  const [selectedNodeIdForPieMenu, setSelectedNodeIdForPieMenu] = useState(null);
  const [isTransitioningPieMenu, setIsTransitioningPieMenu] = useState(false);

  // Use the local state values populated by subscribe
  const projectTitle = activeGraphName ?? 'Loading...';
  const projectBio = activeGraphDescription ?? '';

  const [previewingNodeId, setPreviewingNodeId] = useState(null);

  // --- Saved Nodes Management ---
  const bookmarkActive = useMemo(() => {
    // Directly use activeDefinitionNodeId - store ensures it's set
    return activeDefinitionNodeId ? savedNodeIds.has(activeDefinitionNodeId) : false;
  }, [activeDefinitionNodeId, savedNodeIds]);

  const handleToggleBookmark = useCallback(() => {
    // Get current state for logging
    const currentState = useGraphStore.getState();
    //console.log('[Bookmark Click State] activeGraphId:', currentState.activeGraphId, 'activeDefinitionNodeId:', currentState.activeDefinitionNodeId);

    if (currentState.activeDefinitionNodeId) {
      // Toggle the active definition node
      //console.log('[Bookmark] Toggling saved state for active definition node:', currentState.activeDefinitionNodeId);
      storeActions.toggleSavedNode(currentState.activeDefinitionNodeId);
    } else {
      //console.warn('[Bookmark] No active definition node found. Cannot toggle.');
    }
  }, [storeActions]); // Dependency only on storeActions as we read fresh state inside

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
  const CLICK_DELAY = 180; // Reduced milliseconds to wait for a potential double-click

  // Ref to track initial mount completion
  const isMountedRef = useRef(false);

  // Pie Menu Button Configuration - now targetPieMenuButtons and dynamic
  const targetPieMenuButtons = useMemo(() => {
    const selectedNode = selectedNodeIdForPieMenu ? nodes.find(n => n.id === selectedNodeIdForPieMenu) : null;

    if (selectedNode && previewingNodeId === selectedNode.id) {
      // If the selected node for the pie menu is the one being previewed, show only Contract
      return [
        {
          id: 'contract-preview',
          label: 'Contract',
          icon: Minimize2,
          action: (nodeId) => {
            console.log(`[PieMenu Action] Contract clicked for node: ${nodeId}. Starting transition.`);
            setIsTransitioningPieMenu(true); // Start transition, current menu will hide
            // setPreviewingNodeId(null); // This will be set after animation
          }
        }
      ];
    } else {
      // Default buttons: Edit, Delete, Connect, Expand (if not previewing THIS node)
      return [
        { id: 'edit', label: 'Edit', icon: Edit3, action: (nodeId) => {
            console.log(`[PieMenu Action] Edit clicked for node: ${nodeId}. Setting editingNodeIdOnCanvas.`);
            setEditingNodeIdOnCanvas(nodeId);
        } },
        { id: 'delete', label: 'Delete', icon: Trash2, action: (nodeId) => {
          storeActions.removeNode(nodeId);
          setSelectedNodeIds(new Set()); // Deselect after deleting
          setSelectedNodeIdForPieMenu(null); // Ensure pie menu hides
        } },
        { id: 'connect', label: 'Connect', icon: Link, action: (nodeId) => console.log('Connect node:', nodeId) },
        {
          id: 'expand-preview',
          label: 'Expand',
          icon: Maximize2,
          action: (nodeId) => {
            console.log(`[PieMenu Action] Expand clicked for node: ${nodeId}. Starting transition.`);
            setIsTransitioningPieMenu(true); // Start transition, current menu will hide
            // setPreviewingNodeId(prev => prev === nodeId ? null : nodeId); // This will be set after animation
          }
        }
      ];
    }
  }, [storeActions, setSelectedNodeIds, setPreviewingNodeId, selectedNodeIdForPieMenu, previewingNodeId, nodes, Minimize2, Maximize2, Edit3, Trash2, Link]);

  // Effect to center view on graph load/change
  useEffect(() => {
    // Ensure we have valid sizes and an active graph
    if (activeGraphId && viewportSize.width > 0 && viewportSize.height > 0 && canvasSize.width > 0 && canvasSize.height > 0 && zoomLevel > 0) {

      // Target the center of the canvas
      const targetCanvasX = canvasSize.width / 2;
      const targetCanvasY = canvasSize.height / 2;

      // Use the CURRENT zoom level state
      const currentZoom = zoomLevel;

      // Calculate pan needed to place targetCanvas coords at viewport center
      const initialPanX = viewportSize.width / 2 - targetCanvasX * currentZoom;
      const initialPanY = viewportSize.height / 2 - targetCanvasY * currentZoom;

      // Clamp the initial pan to valid bounds based on current canvas/viewport/zoom
      const maxX = 0;
      const maxY = 0;
      const minX = viewportSize.width - canvasSize.width * currentZoom;
      const minY = viewportSize.height - canvasSize.height * currentZoom;
      const clampedX = Math.min(Math.max(initialPanX, minX), maxX);
      const clampedY = Math.min(Math.max(initialPanY, minY), maxY);

      // Apply the calculated and clamped pan offset
      setPanOffset({ x: clampedX, y: clampedY });

      // Avoid resetting zoom here, let user control persist
    }
    // If activeGraphId becomes null, we might optionally reset pan/zoom
    // else if (activeGraphId === null) {
    //   setPanOffset({ x: 0, y: 0 });
    //   setZoomLevel(1);
    // }
    // REMOVE zoomLevel from dependencies to prevent recentering on zoom
  }, [activeGraphId, viewportSize, canvasSize]);

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
    if (isPaused || !activeGraphId) return; // Check local state

    const nodeId = nodeData.id;

    // --- Double-click ---
    if (e.detail === 2) {
      e.preventDefault();
      if (clickTimeoutIdRef.current) { clearTimeout(clickTimeoutIdRef.current); clickTimeoutIdRef.current = null; }
      potentialClickNodeRef.current = null;
      // Open node tab in the right panel
      // console.log(`Double-click on node ${nodeId}. Opening in panel.`);
      storeActions.openRightPanelNodeTab(nodeId, nodeData.name);
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
                    // Update showPieMenu based on selection
                    if (newSelected.size === 1) {
                      // Prepare to show pie menu - will be handled by useEffect on selectedNodeIds
                    } else if (newSelected.size !== 1 && isPieMenuRendered) {
                      // If deselecting all or selecting multiple, PieMenu will be told to hide via its isVisible prop
                    }
                    return newSelected;
                });
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

            // FIX: Compare against the nodeId captured in the closure, not the state variable
            if (mouseInsideNode.current && !mouseMoved.current /* && longPressingNodeId === nodeId */) { 
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
                    //console.log("[handleNodeMouseDown] Setting up multi-node drag:", { primaryId: nodeId, offsets: initialPositions }); // ADD Log
                    setDraggingNodeInfo({
                        initialMouse: { x: e.clientX, y: e.clientY },
                        initialPrimaryPos,
                        relativeOffsets: initialPositions,
                        primaryId: nodeId
                    });
                    // Use localStoreActions
                    selectedNodeIds.forEach(id => {
                        storeActions.updateNode(id, draft => { draft.scale = 1.1; });
                    });

                } else {
                    // Single node drag setup
                    const offset = { x: e.clientX - nodeData.x * zoomLevel - panOffset.x, y: e.clientY - nodeData.y * zoomLevel - panOffset.y };
                    //console.log("[handleNodeMouseDown] Setting up single-node drag:", { nodeId, offset }); // ADD Log
                    setDraggingNodeInfo({ nodeId: nodeId, offset });
                    // Use localStoreActions
                    storeActions.updateNode(nodeId, draft => { draft.scale = 1.1; });
                }
            }
            setLongPressingNodeId(null); // Clear after processing
        }, LONG_PRESS_DURATION);
    }
  };

  const handleSaveNodeData = (nodeId, newData) => {
    if (!activeGraphId) return; // Check local state
    // Use localStoreActions
    storeActions.updateNode(nodeId, draft => {
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

    // --- Revised Heuristic-Based Wheel Logic --- 

    // 1. Mac Pinch-to-Zoom (Ctrl key pressed)
    if (isMac && e.ctrlKey) {
        const zoomDelta = deltaY * TRACKPAD_ZOOM_SENSITIVITY;
        const currentZoomForWorker = zoomLevel;
        const currentPanOffsetForWorker = panOffset;
        try {
          const result = await canvasWorker.calculateZoom({
            deltaY: zoomDelta, 
            currentZoom: currentZoomForWorker,
            mousePos: { x: mouseX, y: mouseY },
            panOffset: currentPanOffsetForWorker, 
            viewportSize, canvasSize, MIN_ZOOM, MAX_ZOOM,
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
        return; // Processed
    }

    // 2. Mac Trackpad Two-Finger Pan (No Ctrl key, any movement)
    // This implies !e.ctrlKey due to falling through the first block.
    if (isMac && (deltaX !== 0 || deltaY !== 0)) { 
        const dx = -deltaX * PAN_DRAG_SENSITIVITY;
        const dy = -deltaY * PAN_DRAG_SENSITIVITY; // Pan with both components
        
        const currentCanvasWidth = canvasSize.width * zoomLevel;
        const currentCanvasHeight = canvasSize.height * zoomLevel;
        const minX = viewportSize.width - currentCanvasWidth;
        const minY = viewportSize.height - currentCanvasHeight;
        const maxX = 0;
        const maxY = 0;

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
            deltaX: deltaX.toFixed(2), // Report original deltaX from event
            deltaY: deltaY.toFixed(2), // Report original deltaY from event
            panOffsetX: newX.toFixed(2),
            panOffsetY: newY.toFixed(2),
            zoomLevel: zoomLevel.toFixed(2),
          }));
          return { x: newX, y: newY };
        });
        return; // Processed
    }
    
    // 3. Non-Mac Mouse Wheel Zoom (or other non-Mac scroll devices)
    // This block is reached if not a Mac, or if it's a Mac event not caught above 
    // (e.g., no ctrlKey, and both deltaX and deltaY are 0 - unlikely for trackpad).
    // We'll primarily gate this on !isMac and deltaY for zoom.
    if (!isMac && deltaY !== 0) { 
        const zoomDelta = deltaY * SMOOTH_MOUSE_WHEEL_ZOOM_SENSITIVITY; 
        const currentZoomForWorker = zoomLevel;
        const currentPanOffsetForWorker = panOffset;
        try {
            const result = await canvasWorker.calculateZoom({
                deltaY: zoomDelta, 
                currentZoom: currentZoomForWorker,
                mousePos: { x: mouseX, y: mouseY },
                panOffset: currentPanOffsetForWorker, 
                viewportSize, canvasSize, MIN_ZOOM, MAX_ZOOM,
            });
            setPanOffset(result.panOffset);
            setZoomLevel(result.zoomLevel);
            setDebugData((prev) => ({
                ...prev,
                inputDevice: 'Mouse Wheel', // Or 'Other Scroll Device'
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
            console.error('Non-Mac zoom calculation failed:', error);
            setDebugData((prev) => ({ ...prev, info: 'Wheel zoom error (non-Mac)', error: error.message }));
        }
        return; // Processed
    }

    // If the event hasn't been handled by any of the specific cases above, 
    // update debug data to reflect it's unhandled by this logic.
    // This helps in identifying if any wheel events are slipping through.
    // (This assumes e.stopPropagation() and e.preventDefault() are handled elsewhere if needed for unhandled cases)
    // No explicit 'return' here if we want to allow default browser behavior for unhandled wheel events,
    // but given we have a preventDefault on the container, most will be stopped.
    // For now, we can assume if it's not caught, it's not an intended canvas interaction.
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
    if (isPaused || !activeGraphId) return;
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

                // --- BATCH UPDATE --- 
                const positionUpdates = [];

                // Add primary node update
                positionUpdates.push({ nodeId: primaryNodeId, x: newPrimaryX, y: newPrimaryY });

                // Add other selected nodes relative to primary
                Object.keys(draggingNodeInfo.relativeOffsets).forEach(nodeId => {
                    const relativeOffset = draggingNodeInfo.relativeOffsets[nodeId];
                    positionUpdates.push({
                        nodeId: nodeId,
                        x: newPrimaryX + relativeOffset.offsetX,
                        y: newPrimaryY + relativeOffset.offsetY
                    });
                });

                // Dispatch single batch update action
                storeActions.updateMultipleNodePositions(positionUpdates);
                // --- END BATCH UPDATE ---

            } else {
                // Single node drag
                const { nodeId, offset } = draggingNodeInfo;
                const currentAdjustedX = (e.clientX - panOffset.x) / zoomLevel;
                const currentAdjustedY = (e.clientY - panOffset.y) / zoomLevel;
                const newX = currentAdjustedX - (offset.x / zoomLevel);
                const newY = currentAdjustedY - (offset.y / zoomLevel);
                storeActions.updateNode(nodeId, draft => {
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
    if (isPaused || !activeGraphId) return;
    // Clear any pending single click on a node
    if (clickTimeoutIdRef.current) {
        clearTimeout(clickTimeoutIdRef.current);
        clickTimeoutIdRef.current = null;
        potentialClickNodeRef.current = null;
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
    if (isPaused || !activeGraphId) return;
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
                const newEdgeData = { id: newEdgeId, sourceId, destinationId: destId };
                 // Use localStoreActions
                storeActions.addEdge(activeGraphId, newEdgeData);
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
                storeActions.updateNode(id, draft => { draft.scale = 1; });
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
    if (isPaused || !activeGraphId) return;
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
      if (isPaused || draggingNodeInfo || drawingConnectionFrom || mouseMoved.current || recentlyPanned || nodeNamePrompt.visible || !activeGraphId) {
          setLastInteractionType('blocked_click');
          return;
      }
      if (ignoreCanvasClick.current) { ignoreCanvasClick.current = false; return; }

      if (selectedNodeIds.size > 0) {
          setSelectedNodeIds(new Set());
          // Pie menu will be handled by useEffect on selectedNodeIds, no direct setShowPieMenu here
          return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      // Prevent plus sign if pie menu is active or about to become active
      if (!plusSign && selectedNodeIds.size === 0) {
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
      if (!plusSign || !plusSign.tempName || !activeGraphId) return;
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
      //console.log(`[handleMorphDone] About to add node:`, { graphId: activeGraphId, nodeData: newNodeData }); // Log before action
      storeActions.addNode(activeGraphId, newNodeData);
      setPlusSign(null);
  };

  const keysPressed = useKeyboardShortcuts();

  // Effect to mark component as mounted
  useEffect(() => {
    isMountedRef.current = true;
  }, []); // Runs once after initial mount

  useEffect(() => {
    // Restore effect body
    let animationFrameId;
    const keyboardLoop = async () => {
      // --- Wait for initial mount before processing --- 
      if (!isMountedRef.current) {
        animationFrameId = requestAnimationFrame(keyboardLoop);
        return;
      }
      // --- End Wait --- 

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
        if (zoomResult) {
            // FIX: Round zoom level to prevent float issues triggering dependency loop
            const roundedZoom = parseFloat(zoomResult.zoomLevel.toFixed(4)); // Round to 4 decimal places
            setZoomLevel(roundedZoom);
        }

        // Update Pan Offset Functionally
        setPanOffset(prevPan => {
          // Determine the target zoom level for clamping
          // Use the rounded zoom if available, otherwise current state zoom
          const targetZoomLevel = zoomResult ? parseFloat(zoomResult.zoomLevel.toFixed(4)) : zoomLevel;

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

          // FIX: Round final pan values and compare rounded values to prevent float issues
          const roundedX = parseFloat(finalX.toFixed(2)); // Round to 2 decimal places
          const roundedY = parseFloat(finalY.toFixed(2));
          const roundedPrevX = parseFloat(prevPan.x.toFixed(2));
          const roundedPrevY = parseFloat(prevPan.y.toFixed(2));

          // Return the new state only if it has actually changed (after rounding)
          if (roundedX !== roundedPrevX || roundedY !== roundedPrevY) {
            return { x: roundedX, y: roundedY }; // Set rounded values
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

  const handleLeftPanelFocusChange = useCallback((isFocused) => {
    //console.log(`[Left Panel Focus Change] Setting isLeftPanelInputFocused to: ${isFocused}`);
    setIsLeftPanelInputFocused(isFocused);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInputActive = isHeaderEditing || isRightPanelInputFocused || isLeftPanelInputFocused || nodeNamePrompt.visible;
      if (isInputActive || !activeGraphId) { return; }

      const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace';
      const nodesSelected = selectedNodeIds.size > 0;

      if (isDeleteKey && nodesSelected) {
        e.preventDefault();
        const idsToDelete = new Set(selectedNodeIds); // Use local selection state

        // Call removeNode action for each selected ID (Use localStoreActions)
        idsToDelete.forEach(id => {
            storeActions.removeNode(id);
        });

        // Clear local selection state AFTER dispatching actions
        setSelectedNodeIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, isHeaderEditing, isRightPanelInputFocused, isLeftPanelInputFocused, nodeNamePrompt.visible, activeGraphId, storeActions.removeNode]);

  const handleProjectTitleChange = (newTitle) => {
    // Get CURRENT activeGraphId directly from store
    const currentActiveId = useGraphStore.getState().activeGraphId;
    if (currentActiveId) { 
        // Use localStoreActions
        storeActions.updateGraph(currentActiveId, draft => { draft.name = newTitle || 'Untitled'; });
    } else {
        console.warn("handleProjectTitleChange: No active graph ID found in store.");
    }
  };

  const handleProjectBioChange = (newBio) => {
     // Get CURRENT activeGraphId directly from store
     const currentActiveId = useGraphStore.getState().activeGraphId;
     if (currentActiveId) { 
         // Use localStoreActions
        storeActions.updateGraph(currentActiveId, draft => { draft.description = newBio; });
    }
  };

  // Effect to manage PieMenu visibility and data for animations
  useEffect(() => {
    console.log(`[NodeCanvas] useEffect[selectedNodeIds]: Running. selectedNodeIds.size = ${selectedNodeIds.size}, isTransitioningPieMenu = ${isTransitioningPieMenu}, selectedNodeIdForPieMenu = ${selectedNodeIdForPieMenu}`);
    if (selectedNodeIds.size === 1) {
      const nodeId = [...selectedNodeIds][0];
      if (!isTransitioningPieMenu) {
        // If not transitioning, this selection intends to show a menu for this node.
        console.log(`[NodeCanvas] Single node selected (${nodeId}), not transitioning. Setting selectedNodeIdForPieMenu.`);
        setSelectedNodeIdForPieMenu(nodeId);
      } else {
        // If transitioning, do nothing here. The onExitAnimationComplete will handle showing the *next* menu.
        console.log(`[NodeCanvas] Single node selected (${nodeId}), but IS transitioning. Waiting for exit animation.`);
      }
    } else {
      // Not a single selection (0 or multiple)
      console.log("[NodeCanvas] No single node selected (or multiple). Setting selectedNodeIdForPieMenu to null.");
      setSelectedNodeIdForPieMenu(null); // This will trigger the other useEffect to hide the menu if visible.
    }
  }, [selectedNodeIds, isTransitioningPieMenu]); // Only react to selection changes and transition state

  // Effect to prepare and render PieMenu when selectedNodeIdForPieMenu changes and not transitioning
  useEffect(() => {
    console.log(`[NodeCanvas] useEffect[selectedNodeIdForPieMenu, nodes, previewingNodeId, targetPieMenuButtons, isTransitioningPieMenu]: Running. selectedNodeIdForPieMenu = ${selectedNodeIdForPieMenu}, isTransitioning = ${isTransitioningPieMenu}`);
    if (selectedNodeIdForPieMenu && !isTransitioningPieMenu) {
      const node = nodes.find(n => n.id === selectedNodeIdForPieMenu);
      if (node) {
        const dimensions = getNodeDimensions(node, previewingNodeId === node.id);
        console.log(`[NodeCanvas] Preparing pie menu for node ${selectedNodeIdForPieMenu}. Not transitioning. Buttons:`, targetPieMenuButtons.map(b => b.id));
        setCurrentPieMenuData({ node, buttons: targetPieMenuButtons, nodeDimensions: dimensions });
        setIsPieMenuRendered(true); // Ensure PieMenu is in DOM to animate in
      } else {
        console.log(`[NodeCanvas] Node ${selectedNodeIdForPieMenu} not found, but was set for pie menu. Hiding.`);
        setCurrentPieMenuData(null);
        // isPieMenuRendered will be set to false by onExitAnimationComplete if it was visible
      }
    } else if (!selectedNodeIdForPieMenu) {
        // If no node is targeted for pie menu (e.g., deselected, or during transition end before new one shows)
        console.log("[NodeCanvas] selectedNodeIdForPieMenu is null. Ensuring currentPieMenuData is null.");
        setCurrentPieMenuData(null); // This effectively tells an already rendered PieMenu to hide (via its isVisible prop)
    }
    // If isTransitioningPieMenu is true, we don't change currentPieMenuData or isPieMenuRendered here.
    // The existing menu plays its exit animation.
  }, [selectedNodeIdForPieMenu, nodes, previewingNodeId, targetPieMenuButtons, isTransitioningPieMenu]);

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
         bookmarkActive={bookmarkActive}
         onBookmarkToggle={handleToggleBookmark}
      />

      <div style={{ display: 'flex', flexGrow: 1, position: 'relative', overflow: 'hidden' }}> 
        <Panel
          key="left-panel"
          ref={leftPanelRef}
          side="left"
          isExpanded={leftPanelExpanded}
          onToggleExpand={handleToggleLeftPanel}
          onFocusChange={handleLeftPanelFocusChange}
          activeGraphId={activeGraphId}
          storeActions={storeActions}
          graphName={activeGraphName}
          graphDescription={activeGraphDescription}
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
          {!activeGraphId ? ( // Check local state
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

                {isPieMenuRendered && currentPieMenuData && (
                  <PieMenu
                    node={currentPieMenuData.node}
                    buttons={currentPieMenuData.buttons}
                    nodeDimensions={currentPieMenuData.nodeDimensions}
                    // isVisible controls animation within PieMenu. It should only be true if the menu
                    // is for the currently targeted node AND we are not in a transition phase.
                    isVisible={currentPieMenuData?.node?.id === selectedNodeIdForPieMenu && !isTransitioningPieMenu}
                    onExitAnimationComplete={() => {
                      console.log("[NodeCanvas] PieMenu onExitAnimationComplete: Resetting transition and render state.");
                      setIsPieMenuRendered(false); // Unmount after animation
                      setCurrentPieMenuData(null); // Clear data
                      const wasTransitioning = isTransitioningPieMenu;
                      setIsTransitioningPieMenu(false); // Transition finished

                      // If a transition just finished (e.g., from expand to contract, or vice-versa)
                      // and a node is still selected, we need to show the *new* pie menu.
                      if (wasTransitioning) {
                        // Update previewingNodeId based on the action that triggered the transition
                        // The actual selected node for menu (selectedNodeIdForPieMenu) might be the same or different
                        // We need to find the button that was clicked. This is tricky without more state.
                        // For now, let's assume the expand/contract action was on the selectedNodeIdForPieMenu.
                        const currentlySelectedNodeId = [...selectedNodeIds][0]; // Get current single selection if any

                        if (currentlySelectedNodeId) {
                            const selectedNodeIsPreviewing = previewingNodeId === currentlySelectedNodeId;
                            if (selectedNodeIsPreviewing) { // If it was previewing, the action was to contract
                                console.log("[NodeCanvas] Post-transition: Node was previewing, now contracting.");
                                setPreviewingNodeId(null);
                            } else { // If it was not previewing, the action was to expand
                                console.log("[NodeCanvas] Post-transition: Node was not previewing, now expanding.");
                                setPreviewingNodeId(currentlySelectedNodeId);
                            }
                            // Re-set selectedNodeIdForPieMenu to trigger the useEffect to show the new menu state
                            console.log(`[NodeCanvas] Post-transition: Re-setting selectedNodeIdForPieMenu to ${currentlySelectedNodeId} to show new menu.`);
                            setSelectedNodeIdForPieMenu(currentlySelectedNodeId);
                        } else {
                             console.log("[NodeCanvas] Post-transition: No node selected. Clearing preview.");
                             setPreviewingNodeId(null); // Safety clear if no node is selected
                        }
                      }
                    }}
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
                             isEditingOnCanvas={node.id === editingNodeIdOnCanvas}
                             onCommitCanvasEdit={(nodeId, newName) => { storeActions.updateNode(nodeId, draft => { draft.name = newName; }); setEditingNodeIdOnCanvas(null); }}
                             onCancelCanvasEdit={() => setEditingNodeIdOnCanvas(null)}
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
                             isEditingOnCanvas={node.id === editingNodeIdOnCanvas}
                             onCommitCanvasEdit={(nodeId, newName) => { storeActions.updateNode(nodeId, draft => { draft.name = newName; }); setEditingNodeIdOnCanvas(null); }}
                             onCancelCanvasEdit={() => setEditingNodeIdOnCanvas(null)}
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
          onFocusChange={(isFocused) => {
            //console.log(`[Right Panel Focus Change] Setting isRightPanelInputFocused to: ${isFocused}`);
            setIsRightPanelInputFocused(isFocused);
          }}
          activeGraphId={activeGraphId}
          storeActions={storeActions}
          graphName={activeGraphName}
          graphDescription={activeGraphDescription}
        />
      </div>
      
      {/* <div>NodeCanvas Simplified - Testing Loop</div> */}
    </div>
  );
}

export default NodeCanvas;