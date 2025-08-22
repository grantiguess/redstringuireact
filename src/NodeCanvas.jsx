import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Lethargy } from 'lethargy';
import './NodeCanvas.css';
import { X } from 'lucide-react';
import Header from './Header.jsx';
import DebugOverlay from './DebugOverlay.jsx';
import { useCanvasWorker } from './useCanvasWorker.js';
import Node from './Node.jsx';
import PlusSign from './PlusSign.jsx'; // Import the new PlusSign component
import PieMenu from './PieMenu.jsx'; // Import the PieMenu component
import AbstractionCarousel from './AbstractionCarousel.jsx'; // Import the AbstractionCarousel component
import ConnectionControlPanel from './ConnectionControlPanel.jsx'; // Import the ConnectionControlPanel component
import AbstractionControlPanel from './AbstractionControlPanel.jsx'; // Import the AbstractionControlPanel component
import { getNodeDimensions } from './utils.js';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator
import { Edit3, Trash2, Link, Package, PackageOpen, Expand, ArrowUpFromDot, Triangle, Layers, ArrowLeft, SendToBack, ArrowBigRightDash, Palette, MoreHorizontal, Bookmark, Plus, CornerUpLeft, CornerDownLeft } from 'lucide-react'; // Icons for PieMenu
import ColorPicker from './ColorPicker';
import { useDrop } from 'react-dnd';

// Import Zustand store and selectors/actions
import useGraphStore, {
    getActiveGraphId,
    getHydratedNodesForGraph, // New selector
    getEdgesForGraph,
    getNodePrototypeById, // New selector for prototypes
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
  SMOOTH_MOUSE_WHEEL_ZOOM_SENSITIVITY,
  NODE_DEFAULT_COLOR,
  MODAL_CLOSE_ICON_SIZE
} from './constants';

import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Panel from './Panel'; // This is now used for both sides
import TypeList from './TypeList'; // Re-add TypeList component
import NodeSelectionGrid from './NodeSelectionGrid'; // Import the new node selection grid
import UnifiedSelector from './UnifiedSelector'; // Import the new unified selector


const SPAWNABLE_NODE = 'spawnable_node';

// Check if user's on a Mac using userAgent as platform is deprecated
const isMac = /Mac/i.test(navigator.userAgent);

// Sensitivity constants
const MOUSE_WHEEL_ZOOM_SENSITIVITY = 1;        // Sensitivity for standard mouse wheel zooming
const KEYBOARD_PAN_SPEED = 12;                  // for keyboard panning (much faster)
const KEYBOARD_ZOOM_SPEED = 0.01;               // for keyboard zooming (extra smooth)

function NodeCanvas() {
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  // <<< Access store actions individually to avoid creating new objects >>>
  const updateNodePrototype = useGraphStore((state) => state.updateNodePrototype);
  const updateNodeInstance = useGraphStore((state) => state.updateNodeInstance);
  const updateEdge = useGraphStore((state) => state.updateEdge);
  const addEdge = useGraphStore((state) => state.addEdge);
  const addNodePrototype = useGraphStore((state) => state.addNodePrototype);
  const addNodeInstance = useGraphStore((state) => state.addNodeInstance);
  const removeNodeInstance = useGraphStore((state) => state.removeNodeInstance);
  const removeEdge = useGraphStore((state) => state.removeEdge);
  const updateGraph = useGraphStore((state) => state.updateGraph);
  const createNewGraph = useGraphStore((state) => state.createNewGraph);
  const setActiveGraph = useGraphStore((state) => state.setActiveGraph);
  const setActiveDefinitionNode = useGraphStore((state) => state.setActiveDefinitionNode);
  const setSelectedEdgeId = useGraphStore((state) => state.setSelectedEdgeId);
  const setSelectedEdgeIds = useGraphStore((state) => state.setSelectedEdgeIds);
  const addSelectedEdgeId = useGraphStore((state) => state.addSelectedEdgeId);
  const removeSelectedEdgeId = useGraphStore((state) => state.removeSelectedEdgeId);
  const clearSelectedEdgeIds = useGraphStore((state) => state.clearSelectedEdgeIds);
  const setNodeType = useGraphStore((state) => state.setNodeType);
  const openRightPanelNodeTab = useGraphStore((state) => state.openRightPanelNodeTab);
  const createAndAssignGraphDefinition = useGraphStore((state) => state.createAndAssignGraphDefinition);
  const createAndAssignGraphDefinitionWithoutActivation = useGraphStore((state) => state.createAndAssignGraphDefinitionWithoutActivation);
  const closeRightPanelTab = useGraphStore((state) => state.closeRightPanelTab);
  const activateRightPanelTab = useGraphStore((state) => state.activateRightPanelTab);
  const openGraphTab = useGraphStore((state) => state.openGraphTab);
  const moveRightPanelTab = useGraphStore((state) => state.moveRightPanelTab);
  const closeGraph = useGraphStore((state) => state.closeGraph);
  const toggleGraphExpanded = useGraphStore((state) => state.toggleGraphExpanded);
  const toggleSavedNode = useGraphStore((state) => state.toggleSavedNode);
  const toggleSavedGraph = useGraphStore((state) => state.toggleSavedGraph);
  const toggleShowConnectionNames = useGraphStore((state) => state.toggleShowConnectionNames);
  const updateMultipleNodeInstancePositions = useGraphStore((state) => state.updateMultipleNodeInstancePositions);
  const removeDefinitionFromNode = useGraphStore((state) => state.removeFromDefinitionFromNode);
  const openGraphTabAndBringToTop = useGraphStore((state) => state.openGraphTabAndBringToTop);
  const cleanupOrphanedData = useGraphStore((state) => state.cleanupOrphanedData);
  const restoreFromSession = useGraphStore((state) => state.restoreFromSession);
  const loadUniverseFromFile = useGraphStore((state) => state.loadUniverseFromFile);
  const setUniverseError = useGraphStore((state) => state.setUniverseError);
  const clearUniverse = useGraphStore((state) => state.clearUniverse);
  const setUniverseConnected = useGraphStore((state) => state.setUniverseConnected);
  const addToAbstractionChain = useGraphStore((state) => state.addToAbstractionChain);
  const removeFromAbstractionChain = useGraphStore((state) => state.removeFromAbstractionChain);
  const updateGraphView = useGraphStore((state) => state.updateGraphView);
  const setTypeListMode = useGraphStore((state) => state.setTypeListMode);
  const toggleEnableAutoRouting = useGraphStore((state) => state.toggleEnableAutoRouting);
  const setRoutingStyle = useGraphStore((state) => state.setRoutingStyle);

  // Panel overlay resizers rendered in canvas (do not overlap panel DOM)
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('panelWidth_left') || '280'); } catch { return 280; }
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('panelWidth_right') || '280'); } catch { return 280; }
  });
  // Track last touch coordinates for touchend where touches are empty
  const lastTouchRef = useRef({ x: 0, y: 0 });
  const touchMultiPanRef = useRef(false);
  const pinchRef = useRef({
    active: false,
    startDist: 0,
    startZoom: 1,
    centerClient: { x: 0, y: 0 },
    centerWorld: { x: 0, y: 0 },
  });
  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);
  const dragStartXRef = useRef(0);
  const startWidthRef = useRef(0);
  const [isHoveringLeftResizer, setIsHoveringLeftResizer] = useState(false);
  const [isHoveringRightResizer, setIsHoveringRightResizer] = useState(false);
  // Track latest widths in refs to avoid stale closures in global listeners
  const leftWidthRef = useRef(leftPanelWidth);
  const rightWidthRef = useRef(rightPanelWidth);
  useEffect(() => { leftWidthRef.current = leftPanelWidth; }, [leftPanelWidth]);
  useEffect(() => { rightWidthRef.current = rightPanelWidth; }, [rightPanelWidth]);

  useEffect(() => {
    const onPanelChanged = (e) => {
      const { side, width } = e.detail || {};
      if (side === 'left' && typeof width === 'number') setLeftPanelWidth(width);
      if (side === 'right' && typeof width === 'number') setRightPanelWidth(width);
    };
    window.addEventListener('panelWidthChanged', onPanelChanged);
    return () => window.removeEventListener('panelWidthChanged', onPanelChanged);
  }, []);

  const MIN_WIDTH = 180;
  const MAX_WIDTH = Math.max(240, Math.round(window.innerWidth / 2));

  const beginDrag = (side, clientX) => {
    if (side === 'left') {
      isDraggingLeft.current = true;
      dragStartXRef.current = clientX;
      startWidthRef.current = leftPanelWidth;
    } else {
      isDraggingRight.current = true;
      dragStartXRef.current = clientX;
      startWidthRef.current = rightPanelWidth;
    }
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    // Prevent page overscroll while resizing
    try { document.body.style.overscrollBehavior = 'none'; } catch {}
  };

  const onDragMove = (e) => {
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    if (isDraggingLeft.current) {
      const dx = clientX - dragStartXRef.current;
      const w = Math.max(MIN_WIDTH, Math.min(startWidthRef.current + dx, MAX_WIDTH));
      setLeftPanelWidth(w);
      try { window.dispatchEvent(new CustomEvent('panelWidthChanging', { detail: { side: 'left', width: w } })); } catch {}
    } else if (isDraggingRight.current) {
      const dx = clientX - dragStartXRef.current;
      const w = Math.max(MIN_WIDTH, Math.min(startWidthRef.current - dx, MAX_WIDTH));
      setRightPanelWidth(w);
      try { window.dispatchEvent(new CustomEvent('panelWidthChanging', { detail: { side: 'right', width: w } })); } catch {}
    }
  };

  const endDrag = () => {
    if (isDraggingLeft.current) {
      isDraggingLeft.current = false;
      try {
        // Persist and broadcast
        const finalLeftWidth = leftWidthRef.current;
        localStorage.setItem('panelWidth_left', JSON.stringify(finalLeftWidth));
        window.dispatchEvent(new CustomEvent('panelWidthChanged', { detail: { side: 'left', width: finalLeftWidth } }));
      } catch {}
    }
    if (isDraggingRight.current) {
      isDraggingRight.current = false;
      try {
        // Persist and broadcast
        const finalRightWidth = rightWidthRef.current;
        localStorage.setItem('panelWidth_right', JSON.stringify(finalRightWidth));
        window.dispatchEvent(new CustomEvent('panelWidthChanged', { detail: { side: 'right', width: finalRightWidth } }));
      } catch {}
    }
    // Clear any hover state at the end of a drag (helps on touch devices)
    setIsHoveringLeftResizer(false);
    setIsHoveringRightResizer(false);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    try { document.body.style.overscrollBehavior = ''; } catch {}
  };

  // Render overlay resizer bars that sit just outside panels
  const renderPanelResizers = () => {
    const barHeightPct = 0.25;
    const barHeight = `${Math.round(barHeightPct * 100)}%`;
    const HITBOX_WIDTH = 28; // wider invisible hitbox
    const VISIBLE_WIDTH = 6; // thin visible bar
    const extraHitboxPx = 24; // slightly taller than the visual bar
    const wrapperHeight = `calc(${barHeight} + ${extraHitboxPx}px)`;
    const wrapperMinHeight = 60 + extraHitboxPx;
    const wrapperMaxHeight = 280 + extraHitboxPx;
    const wrapperCommon = {
      position: 'fixed',
      top: '50%',
      transform: 'translateY(-50%)',
      height: wrapperHeight,
      minHeight: wrapperMinHeight,
      maxHeight: wrapperMaxHeight,
      width: HITBOX_WIDTH,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'col-resize',
      zIndex: 10002,
      touchAction: 'none',
      pointerEvents: 'auto',
      backgroundColor: 'transparent'
    };
    const handleVisualCommon = {
      width: VISIBLE_WIDTH,
      height: barHeight,
      minHeight: 60,
      maxHeight: 280,
      borderRadius: 999,
      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      transition: 'background-color 120ms ease, opacity 160ms ease'
    };
    const inset = 14; // spacing inside from panel edges
    const leftActive = isDraggingLeft.current || isHoveringLeftResizer;
    const rightActive = isDraggingRight.current || isHoveringRightResizer;
    const baseColor = (active) => `rgba(38,0,0,${active ? 1 : 0.18})`;
    const leftWrapperLeft = Math.max(0, (leftPanelWidth + inset) - (HITBOX_WIDTH / 2));
    const rightWrapperRight = Math.max(0, (rightPanelWidth + inset) - (HITBOX_WIDTH / 2));
    // Use optional chaining with defaults so we don't depend on early state initialization
    const leftCollapsed = !(typeof leftPanelExpanded === 'boolean' ? leftPanelExpanded : true);
    const rightCollapsed = !(typeof rightPanelExpanded === 'boolean' ? rightPanelExpanded : true);
    return (
      <>
        {/* Left resizer wrapper (full-height hitbox) */}
        <div
          style={{
            ...wrapperCommon,
            left: leftWrapperLeft,
            pointerEvents: leftCollapsed ? 'none' : 'auto'
          }}
          onMouseDown={(e) => {
            // prevent canvas panning on resizer mouse down
            e.stopPropagation();
            beginDrag('left', e.clientX);
          }}
          onTouchStart={(e) => {
            if (e && e.cancelable) { e.preventDefault(); }
            e.stopPropagation();
            if (e.touches?.[0]) beginDrag('left', e.touches[0].clientX);
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') {
              e.preventDefault();
              e.stopPropagation();
              beginDrag('left', e.clientX);
            }
          }}
          onWheel={(e) => {
            // Only block scroll when actively dragging to avoid interfering with canvas scrolling
            if ((isDraggingLeft.current || isDraggingRight.current) && e && e.cancelable) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onTouchMove={(e) => {
            if ((isDraggingLeft.current || isDraggingRight.current) && e && e.cancelable) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onMouseEnter={() => setIsHoveringLeftResizer(true)}
          onMouseLeave={() => setIsHoveringLeftResizer(false)}
        >
          <div style={{ ...handleVisualCommon, backgroundColor: baseColor(leftActive), opacity: leftCollapsed ? 0 : 1 }} />
        </div>
        {/* Right resizer wrapper (full-height hitbox) */}
        <div
          style={{
            ...wrapperCommon,
            right: rightWrapperRight,
            pointerEvents: rightCollapsed ? 'none' : 'auto'
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            beginDrag('right', e.clientX);
          }}
          onTouchStart={(e) => {
            if (e && e.cancelable) { e.preventDefault(); }
            e.stopPropagation();
            if (e.touches?.[0]) beginDrag('right', e.touches[0].clientX);
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') {
              e.preventDefault();
              e.stopPropagation();
              beginDrag('right', e.clientX);
            }
          }}
          onWheel={(e) => {
            if ((isDraggingLeft.current || isDraggingRight.current) && e && e.cancelable) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onTouchMove={(e) => {
            if ((isDraggingLeft.current || isDraggingRight.current) && e && e.cancelable) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onMouseEnter={() => setIsHoveringRightResizer(true)}
          onMouseLeave={() => setIsHoveringRightResizer(false)}
        >
          <div style={{ ...handleVisualCommon, backgroundColor: baseColor(rightActive), opacity: rightCollapsed ? 0 : 1 }} />
        </div>
      </>
    );
  };

  // --- Touch helpers for canvas interactions (pan, node drag, connections) ---
  const normalizeTouchEvent = (e) => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = t?.clientX ?? lastTouchRef.current.x;
    const clientY = t?.clientY ?? lastTouchRef.current.y;
    return { clientX, clientY };
  };

  const handleTouchStartCanvas = (e) => {
    if (e && e.cancelable) {
      e.preventDefault();
      e.stopPropagation();
    }
    // One-finger pan by default on touch, but also synthesize a mousedown for node hit-testing/long-press
    if (e.touches && e.touches.length === 1) {
      const t = e.touches[0];
      lastTouchRef.current = { x: t.clientX, y: t.clientY };
      isMouseDown.current = true;
      startedOnNode.current = false;
      mouseMoved.current = false;
      setPanStart({ x: t.clientX, y: t.clientY });
      const synthetic = {
        clientX: t.clientX,
        clientY: t.clientY,
        detail: 1,
        preventDefault: () => { try { e.preventDefault(); } catch {} },
        stopPropagation: () => { try { e.stopPropagation(); } catch {} }
      };
      handleMouseDown(synthetic);
    }
    if (e.touches && e.touches.length >= 2) {
      // Pinch-to-zoom setup
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;
      const rect = containerRef.current.getBoundingClientRect();
      const worldX = (centerX - rect.left - panOffset.x) / zoomLevel;
      const worldY = (centerY - rect.top - panOffset.y) / zoomLevel;
      pinchRef.current = {
        active: true,
        startDist: dist,
        startZoom: zoomLevel,
        centerClient: { x: centerX, y: centerY },
        centerWorld: { x: worldX, y: worldY },
      };
      return;
    }
    const { clientX, clientY } = normalizeTouchEvent(e);
    lastTouchRef.current = { x: clientX, y: clientY };
    // Synthesize minimal mouse-like event for existing handlers
    const synthetic = {
      clientX,
      clientY,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => { try { e.preventDefault(); } catch {} },
      stopPropagation: () => { try { e.stopPropagation(); } catch {} }
    };
    handleMouseDown(synthetic);
  };

  const handleTouchMoveCanvas = (e) => {
    if (e && e.cancelable) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.touches && e.touches.length >= 2 && pinchRef.current.active) {
      // Pinch-to-zoom update
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = dist / (pinchRef.current.startDist || 1);
      let newZoom = pinchRef.current.startZoom * ratio;
      newZoom = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);
      // Recompute center (allow pinch centroid to move)
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;
      const rect = containerRef.current.getBoundingClientRect();
      // Keep the original world point under the fingers stable in screen space
      const newPanX = centerX - rect.left - pinchRef.current.centerWorld.x * newZoom;
      const newPanY = centerY - rect.top - pinchRef.current.centerWorld.y * newZoom;
      // Clamp pan within bounds
      const currentCanvasWidth = canvasSize.width * newZoom;
      const currentCanvasHeight = canvasSize.height * newZoom;
      const minX = viewportSize.width - currentCanvasWidth;
      const minY = viewportSize.height - currentCanvasHeight;
      const maxX = 0;
      const maxY = 0;
      const clampedPan = {
        x: Math.min(Math.max(newPanX, minX), maxX),
        y: Math.min(Math.max(newPanY, minY), maxY),
      };
      setZoomLevel(newZoom);
      setPanOffset(clampedPan);
      return;
    }
    const { clientX, clientY } = normalizeTouchEvent(e);
    lastTouchRef.current = { x: clientX, y: clientY };
    const synthetic = {
      clientX,
      clientY,
      preventDefault: () => { try { e.preventDefault(); } catch {} },
      stopPropagation: () => { try { e.stopPropagation(); } catch {} }
    };
    handleMouseMove(synthetic);
  };

  const handleTouchEndCanvas = (e) => {
    if (e && e.cancelable) {
      e.preventDefault();
      e.stopPropagation();
    }
    // End pinch if active
    if (pinchRef.current.active) {
      pinchRef.current.active = false;
    }
    const { clientX, clientY } = normalizeTouchEvent(e);
    const synthetic = {
      clientX,
      clientY,
      preventDefault: () => { try { e.preventDefault(); } catch {} },
      stopPropagation: () => { try { e.stopPropagation(); } catch {} }
    };
    // Use existing mouse-up canvas handler to finalize panning/selection
    handleMouseUpCanvas(synthetic);
    touchMultiPanRef.current = false;
  };

  // Create a stable actions object only when needed for props
  const storeActions = useMemo(() => ({
    updateNodePrototype,
    updateNodeInstance,
    addEdge,
    addNodePrototype,
    addNodeInstance,
    removeNodeInstance,
    removeEdge,
    updateGraph,
    createNewGraph,
    setActiveGraph,
    setActiveDefinitionNode,
    setNodeType,
    openRightPanelNodeTab,
    createAndAssignGraphDefinition,
    createAndAssignGraphDefinitionWithoutActivation,
    closeRightPanelTab,
    activateRightPanelTab,
    openGraphTab,
    moveRightPanelTab,
    closeGraph,
    toggleGraphExpanded,
    toggleSavedNode,
    toggleSavedGraph,
    updateMultipleNodeInstancePositions,
    removeDefinitionFromNode,
    openGraphTabAndBringToTop,
    cleanupOrphanedData,
    restoreFromSession,
    loadUniverseFromFile,
    setUniverseError,
    clearUniverse,
    setUniverseConnected,
    setSelectedEdgeIds,
    addSelectedEdgeId,
    removeSelectedEdgeId,
    clearSelectedEdgeIds,
    toggleShowConnectionNames,
    toggleEnableAutoRouting,
    setRoutingStyle,
    updateGraphView,
  }), [
    updateNodePrototype, updateNodeInstance, addEdge, addNodePrototype, addNodeInstance, removeNodeInstance, removeEdge, updateGraph, createNewGraph,
    setActiveGraph, setActiveDefinitionNode, setNodeType, openRightPanelNodeTab,
    createAndAssignGraphDefinition, createAndAssignGraphDefinitionWithoutActivation, closeRightPanelTab, activateRightPanelTab,
    openGraphTab, moveRightPanelTab, closeGraph, toggleGraphExpanded,
    toggleSavedNode, toggleSavedGraph, toggleShowConnectionNames, updateMultipleNodeInstancePositions, removeDefinitionFromNode,
    openGraphTabAndBringToTop, cleanupOrphanedData, restoreFromSession,
    loadUniverseFromFile, setUniverseError, clearUniverse, setUniverseConnected,
    setSelectedEdgeIds, addSelectedEdgeId, removeSelectedEdgeId, clearSelectedEdgeIds, toggleShowConnectionNames,
    toggleEnableAutoRouting, setRoutingStyle, updateGraphView
  ]);

  // <<< SELECT STATE DIRECTLY >>>
  const activeGraphId = useGraphStore(state => state.activeGraphId);
  const activeDefinitionNodeId = useGraphStore(state => state.activeDefinitionNodeId);
  const selectedEdgeId = useGraphStore(state => state.selectedEdgeId);
  const selectedEdgeIds = useGraphStore(state => state.selectedEdgeIds);
  const typeListMode = useGraphStore(state => state.typeListMode);
  const graphsMap = useGraphStore(state => state.graphs);
  const nodePrototypesMap = useGraphStore(state => state.nodePrototypes);
  const edgePrototypesMap = useGraphStore(state => state.edgePrototypes);
  const showConnectionNames = useGraphStore(state => state.showConnectionNames);
  const gridMode = useGraphStore(state => state.gridSettings?.mode || 'off');
  const gridSize = useGraphStore(state => state.gridSettings?.size || 200);
  const enableAutoRouting = useGraphStore(state => state.autoLayoutSettings?.enableAutoRouting);
  const routingStyle = useGraphStore(state => state.autoLayoutSettings?.routingStyle || 'straight');
  const manhattanBends = useGraphStore(state => state.autoLayoutSettings?.manhattanBends || 'auto');
  const cleanLaneSpacing = useGraphStore(state => state.autoLayoutSettings?.cleanLaneSpacing || 24);
  const edgesMap = useGraphStore(state => state.edges);
  const savedNodeIds = useGraphStore(state => state.savedNodeIds);
  const savedGraphIds = useGraphStore(state => state.savedGraphIds);
  // Get open graph IDs needed for initial check
  const openGraphIds = useGraphStore(state => state.openGraphIds);
  // Universe file state
  const isUniverseLoaded = useGraphStore(state => state.isUniverseLoaded);
  const isUniverseLoading = useGraphStore(state => state.isUniverseLoading);
  const universeLoadingError = useGraphStore(state => state.universeLoadingError);
  const hasUniverseFile = useGraphStore(state => state.hasUniverseFile);

  // <<< Derive active graph data directly >>>
  const activeGraphData = useMemo(() => {
      return activeGraphId ? graphsMap.get(activeGraphId) : null;
  }, [activeGraphId, graphsMap]);
  const activeGraphName = activeGraphData?.name ?? 'Loading...';
  const activeGraphDescription = activeGraphData?.description ?? '';

  const headerGraphs = useMemo(() => {
    return openGraphIds.map(graphId => {
        const graph = graphsMap.get(graphId);
        if (!graph) return null;

        const definingNodeId = graph.definingNodeIds?.[0];
        const definingNode = definingNodeId ? nodePrototypesMap.get(definingNodeId) : null;
        
        // Ensure color is a string
        let nodeColor = NODE_DEFAULT_COLOR || '#800000'; // Default fallback
        if (definingNode?.color) {
          if (typeof definingNode.color === 'string') {
            nodeColor = definingNode.color;
          } else if (typeof definingNode.color === 'object' && definingNode.color.hex) {
            // Handle case where color is an object with hex property
            nodeColor = definingNode.color.hex;
          } else if (typeof definingNode.color === 'object' && definingNode.color.toString) {
            // Try to convert object to string
            nodeColor = definingNode.color.toString();
          }
        }

        return {
            id: graph.id,
            name: graph.name || 'Untitled Graph',
            color: nodeColor,
            isActive: graph.id === activeGraphId,
            definingNodeId,
        };
    }).filter(Boolean);
  }, [openGraphIds, activeGraphId, graphsMap, nodePrototypesMap]);

  // console.log("[NodeCanvas] Derived activeGraphId:", activeGraphId, "Name:", activeGraphName);

  // <<< Universe File Loading >>>
  useEffect(() => {
    const tryUniverseRestore = async () => {
      try {
        console.log('[NodeCanvas] Attempting universe file restoration...');
        const result = await storeActions.restoreFromSession();
        
        console.log('[NodeCanvas] Universe restoration result:', result);
        
        if (result && result.success) {
          // Load the restored state using new universe actions
          storeActions.loadUniverseFromFile(result.storeState);
          
          // Import auto-save functions
          const { enableAutoSave } = await import('./store/fileStorage.js');
          
          console.log('[NodeCanvas] Universe restore result:', { 
            autoConnected: result.autoConnected, 
            hasStoreState: !!result.storeState 
          });
          
          if (result.autoConnected) {
            // Auto-connected to universe file - enable auto-save
            enableAutoSave(() => useGraphStore.getState());
            console.log('[NodeCanvas] Auto-connected to universe file with auto-save enabled');
          }
        } else {
          // No universe file found - set error state
          const message = result?.message || 'No universe file found. Please create a new universe or open an existing one.';
          console.log('[NodeCanvas] No universe file found:', message);
          storeActions.setUniverseError(message);
        }
      } catch (error) {
        console.error('[NodeCanvas] Universe restoration failed:', error);
        storeActions.setUniverseError(`Universe restore failed: ${error.message}`);
      }
    };

    tryUniverseRestore();
  }, []); // Run once on mount

  // <<< Prevent Page Zoom >>>
  useEffect(() => {
    const preventPageZoom = (e) => {
      // Detect zoom keyboard shortcuts
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isZoomKey = e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0';
      const isNumpadZoom = e.key === 'Add' || e.key === 'Subtract';
      
      // Prevent keyboard zoom shortcuts
      if (isCtrlOrCmd && (isZoomKey || isNumpadZoom)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // Prevent F11 fullscreen (can interfere with zoom perception)
      if (e.key === 'F11') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const preventWheelZoom = (e) => {
      // Prevent Ctrl+wheel zoom (both Mac and Windows)
      if (e.ctrlKey || e.metaKey) {
        // Only prevent if this wheel event is NOT over our canvas or panel tab bar
        const isOverCanvas = e.target.closest('.canvas-area') || e.target.closest('.canvas');
        const isOverPanelTabBar = e.target.closest('[data-panel-tabs="true"]');
        if (!isOverCanvas && !isOverPanelTabBar) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    };

    const preventGestureZoom = (e) => {
      // Prevent gesture-based zoom on touch devices
      if (e.scale && e.scale !== 1) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    // Add global event listeners
    document.addEventListener('keydown', preventPageZoom, { passive: false, capture: true });
    document.addEventListener('wheel', preventWheelZoom, { passive: false, capture: true });
    document.addEventListener('gesturestart', preventGestureZoom, { passive: false, capture: true });
    document.addEventListener('gesturechange', preventGestureZoom, { passive: false, capture: true });
    document.addEventListener('gestureend', preventGestureZoom, { passive: false, capture: true });

    return () => {
      document.removeEventListener('keydown', preventPageZoom, { capture: true });
      document.removeEventListener('wheel', preventWheelZoom, { capture: true });
      document.removeEventListener('gesturestart', preventGestureZoom, { capture: true });
      document.removeEventListener('gesturechange', preventGestureZoom, { capture: true });
      document.removeEventListener('gestureend', preventGestureZoom, { capture: true });
    };
  }, []); // Run once on mount

  // <<< Initial Graph Creation Logic (Revised) >>>
  useEffect(() => {
      // Only run graph creation logic after universe has been loaded and we have a universe file
      if (!isUniverseLoaded || !hasUniverseFile) return;
      
      // Check if graph maps are loaded and if there's no active graph AND no open graphs
      if (graphsMap.size > 0 && activeGraphId === null && openGraphIds.length === 0) {
           console.log('[Effect: Initial Check] No active or open graphs found, creating default "New Thing".');
           storeActions.createNewGraph({ name: 'New Thing' });
      } else if (graphsMap.size === 0) {
          // Handle the case where universe is loaded but empty
          console.log('[Effect: Initial Check] Universe loaded but empty, creating default "New Thing".');
          storeActions.createNewGraph({ name: 'New Thing' });
      }
  }, [graphsMap, activeGraphId, openGraphIds, storeActions, isUniverseLoaded, hasUniverseFile]); // Include universe states

  // Get raw data from store for memoization
  const instances = useGraphStore(useCallback(state => state.graphs.get(activeGraphId)?.instances, [activeGraphId]));
  const graphEdgeIds = useGraphStore(useCallback(state => state.graphs.get(activeGraphId)?.edgeIds, [activeGraphId]));

  // Derive nodes and edges using useMemo for stable references
  const nodes = useMemo(() => {
    if (!instances || !nodePrototypesMap) return [];
    return Array.from(instances.values()).map(instance => {
        const prototype = nodePrototypesMap.get(instance.prototypeId);
        if (!prototype) return null;
        return {
            ...prototype,
            ...instance,
        };
    }).filter(Boolean);
  }, [instances, nodePrototypesMap]);

  const edges = useMemo(() => {
    if (!graphEdgeIds || !edgesMap) return [];
    return graphEdgeIds.map(id => edgesMap.get(id)).filter(Boolean);
  }, [graphEdgeIds, edgesMap]);

  // --- Performance: Precompute reusable maps and viewport bounds ---
  const nodeById = useMemo(() => {
    const map = new Map();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  // Base dimensions for nodes (non-preview) for fast edge math and visibility checks
  const baseDimsById = useMemo(() => {
    const map = new Map();
    for (const n of nodes) {
      // Use non-preview dimensions for consistent edge center calculations
      map.set(n.id, getNodeDimensions(n, false, null));
    }
    return map;
  }, [nodes]);

  // Defer viewport-dependent culling until pan/zoom state is initialized below
  const [visibleNodeIds, setVisibleNodeIds] = useState(() => new Set());
  const [visibleEdges, setVisibleEdges] = useState(() => []);

  

  // --- Local UI State (Keep these) ---
  const [selectedInstanceIds, setSelectedInstanceIds] = useState(new Set());
  const [draggingNodeInfo, setDraggingNodeInfo] = useState(null); // Renamed, structure might change
  const [longPressingInstanceId, setLongPressingInstanceId] = useState(null); // Store ID
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
  // Hover state for grid when mode is 'hover'


  // --- Grid Snapping Helpers ---
  const snapToGrid = (mouseX, mouseY, nodeWidth, nodeHeight) => {
    if (gridMode === 'off') {
      console.log('[Grid Snap] Grid mode is off, no snapping');
      return { x: mouseX, y: mouseY };
    }
    
    // Snap to grid vertices - use Math.floor to ensure mouse snaps to grid line above
    const nearestGridX = Math.floor(mouseX / gridSize) * gridSize;
    const nearestGridY = Math.floor(mouseY / gridSize) * gridSize;
    
    // Calculate snapped position - center the node on the grid vertex
    // This ensures the node's center (where text is) aligns with grid intersections
    const snappedX = nearestGridX - (nodeWidth / 2);
    const snappedY = nearestGridY - (nodeHeight / 2);
    
    console.log('[Grid Snap] Input:', { mouseX, mouseY, nodeWidth, nodeHeight, gridMode, gridSize });
    console.log('[Grid Snap] Snapped to grid vertex:', { nearestGridX, nearestGridY, snappedX, snappedY });
    
    return { x: snappedX, y: snappedY };
  };

    // Grid snapping - instant in grid mode, animated in off mode
  const snapToGridAnimated = (mouseX, mouseY, nodeWidth, nodeHeight, currentPos) => {
    if (gridMode === 'off') {
      return { x: mouseX, y: mouseY };
    }
    
    const snapped = snapToGrid(mouseX, mouseY, nodeWidth, nodeHeight);
    
    // In grid mode, always snap instantly for precise positioning
    if (gridMode === 'hover' || gridMode === 'always') {
      return snapped;
    }
    
    // Only apply animation in off mode if we have a current position
    if (currentPos && gridMode === 'off') {
      const snapAnimationFactor = 0.4; // Quick snap (0.3 = slower, 0.6 = faster)
      const animatedX = currentPos.x + (snapped.x - currentPos.x) * snapAnimationFactor;
      const animatedY = currentPos.y + (snapped.y - currentPos.y) * snapAnimationFactor;
      
      return { x: animatedX, y: animatedY };
    }
    
    return snapped;
  };
  const MIN_ZOOM = Math.max(
    viewportSize.width / canvasSize.width,
    viewportSize.height / canvasSize.height
  );

  // Compute and update culling sets when pan/zoom or graph state changes (batch to next frame)
  useEffect(() => {
    // Guard until basic view state is present
    if (!viewportSize || !canvasSize) return;
    let rafId = null;
    const compute = () => {
      // Derive canvas-space viewport
      const minX = (-panOffset.x) / zoomLevel;
      const minY = (-panOffset.y) / zoomLevel;
      const maxX = minX + viewportSize.width / zoomLevel;
      const maxY = minY + viewportSize.height / zoomLevel;
      const padding = 400;
      const expanded = {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding,
      };

      // Visible nodes
      const nextVisibleNodeIds = new Set();
      for (const n of nodes) {
        const dims = baseDimsById.get(n.id);
        if (!dims) continue;
        const nx1 = n.x;
        const ny1 = n.y;
        const nx2 = n.x + dims.currentWidth;
        const ny2 = n.y + dims.currentHeight;
        if (!(nx2 < expanded.minX || nx1 > expanded.maxX || ny2 < expanded.minY || ny1 > expanded.maxY)) {
          nextVisibleNodeIds.add(n.id);
        }
      }

      // Visible edges
      const nextVisibleEdges = [];
      for (const edge of edges) {
        const s = nodeById.get(edge.sourceId);
        const d = nodeById.get(edge.destinationId);
        if (!s || !d) continue;
        const sDims = baseDimsById.get(s.id);
        const dDims = baseDimsById.get(d.id);
        if (!sDims || !dDims) continue;
        if (enableAutoRouting && routingStyle === 'manhattan') {
          // Approximate Manhattan path bbox using snapped ports and midpoints
          const sCenterX = s.x + sDims.currentWidth / 2;
          const sCenterY = s.y + sDims.currentHeight / 2;
          const dCenterX = d.x + dDims.currentWidth / 2;
          const dCenterY = d.y + dDims.currentHeight / 2;
          const sPorts = {
            top: { x: sCenterX, y: s.y },
            bottom: { x: sCenterX, y: s.y + sDims.currentHeight },
            left: { x: s.x, y: sCenterY },
            right: { x: s.x + sDims.currentWidth, y: sCenterY },
          };
          const dPorts = {
            top: { x: dCenterX, y: d.y },
            bottom: { x: dCenterX, y: d.y + dDims.currentHeight },
            left: { x: d.x, y: dCenterY },
            right: { x: d.x + dDims.currentWidth, y: dCenterY },
          };
          const relDx = dCenterX - sCenterX;
          const relDy = dCenterY - sCenterY;
          let sPort, dPort;
          if (Math.abs(relDx) >= Math.abs(relDy)) {
            sPort = relDx >= 0 ? sPorts.right : sPorts.left;
            dPort = relDx >= 0 ? dPorts.left : dPorts.right;
          } else {
            sPort = relDy >= 0 ? sPorts.bottom : sPorts.top;
            dPort = relDy >= 0 ? dPorts.top : dPorts.bottom;
          }
          const start = sPort, end = dPort;
          const sSide = (Math.abs(start.y - s.y) < 0.5) ? 'top' : (Math.abs(start.y - (s.y + sDims.currentHeight)) < 0.5) ? 'bottom' : (Math.abs(start.x - s.x) < 0.5) ? 'left' : 'right';
          const dSide = (Math.abs(end.y - d.y) < 0.5) ? 'top' : (Math.abs(end.y - (d.y + dDims.currentHeight)) < 0.5) ? 'bottom' : (Math.abs(end.x - d.x) < 0.5) ? 'left' : 'right';
          const initOrient = (sSide === 'left' || sSide === 'right') ? 'H' : 'V';
          const finalOrient = (dSide === 'left' || dSide === 'right') ? 'H' : 'V';
          const eff = (manhattanBends === 'auto') ? (initOrient === finalOrient ? 'two' : 'one') : manhattanBends;
          let pts;
          if (eff === 'two' && initOrient === finalOrient) {
            if (initOrient === 'H') {
              const midX = (start.x + end.x) / 2;
              pts = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
            } else {
              const midY = (start.y + end.y) / 2;
              pts = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
            }
          } else {
            pts = initOrient === 'H' ? [start, { x: end.x, y: start.y }, end] : [start, { x: start.x, y: end.y }, end];
          }
          const minX = Math.min(...pts.map(p => p.x));
          const maxX = Math.max(...pts.map(p => p.x));
          const minY = Math.min(...pts.map(p => p.y));
          const maxY = Math.max(...pts.map(p => p.y));
          const intersects = !(maxX < expanded.minX || minX > expanded.maxX || maxY < expanded.minY || minY > expanded.maxY);
          if (intersects) nextVisibleEdges.push(edge);
        } else {
        const sx = s.x + sDims.currentWidth / 2;
        const sy = s.y + sDims.currentHeight / 2;
        const dx = d.x + dDims.currentWidth / 2;
        const dy = d.y + dDims.currentHeight / 2;
        const sIn = sx >= expanded.minX && sx <= expanded.maxX && sy >= expanded.minY && sy <= expanded.maxY;
        const dIn = dx >= expanded.minX && dx <= expanded.maxX && dy >= expanded.minY && dy <= expanded.maxY;
        if (sIn || dIn || lineIntersectsRect(sx, sy, dx, dy, expanded)) {
          nextVisibleEdges.push(edge);
          }
        }
      }

        setVisibleNodeIds(nextVisibleNodeIds);
        setVisibleEdges(nextVisibleEdges);
    };

    rafId = requestAnimationFrame(compute);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [panOffset, zoomLevel, viewportSize, canvasSize, nodes, edges, baseDimsById, nodeById]);

  // Helper: Get base port position on a node side (respecting rounded corners)
  const getPortPosition = (node, dims, side, cornerRadius) => {
    // Ensure we respect the actual corner radius (40px) and don't allow ports too close to corners
    const r = Math.min(cornerRadius, Math.min(dims.currentWidth, dims.currentHeight) / 2);
    const cornerBuffer = 8; // Additional buffer beyond the corner radius for visual clarity
    const effectiveCornerSize = r + cornerBuffer;
    
    // Position ports on the straight edge segments, with comprehensive corner avoidance
    switch (side) {
      case 'top':
        return { 
          x: node.x + dims.currentWidth / 2, 
          y: node.y,
          // Available segment excludes corners with buffer
          segmentStart: node.x + effectiveCornerSize,
          segmentEnd: node.x + dims.currentWidth - effectiveCornerSize
        };
      case 'bottom':
        return { 
          x: node.x + dims.currentWidth / 2, 
          y: node.y + dims.currentHeight,
          segmentStart: node.x + effectiveCornerSize,
          segmentEnd: node.x + dims.currentWidth - effectiveCornerSize
        };
      case 'left':
        return { 
          x: node.x, 
          y: node.y + dims.currentHeight / 2,
          segmentStart: node.y + effectiveCornerSize,
          segmentEnd: node.y + dims.currentHeight - effectiveCornerSize
        };
      case 'right':
        return { 
          x: node.x + dims.currentWidth, 
          y: node.y + dims.currentHeight / 2,
          segmentStart: node.y + effectiveCornerSize,
          segmentEnd: node.y + dims.currentHeight - effectiveCornerSize
        };
      default:
        return { x: node.x + dims.currentWidth / 2, y: node.y + dims.currentHeight / 2 };
    }
  };

  // Helper: Calculate staggered position along an edge to distribute connections
  const calculateStaggeredPosition = (basePort, side, edgeUsageIndex, dims, cornerRadius) => {
    // Calculate available straight-edge space (avoiding rounded corners)
    const segmentLength = basePort.segmentEnd - basePort.segmentStart;
    const safeMargin = 12; // Additional margin from corners for visual clarity
    const usableLength = segmentLength - (safeMargin * 2);
    
    if (usableLength <= 0) {
      // Not enough space for distribution, use center
      return basePort;
    }
    
    // Use user spacing preference but adapt to available space
    const preferredSpacing = Math.max(100, cleanLaneSpacing);
    
    // Calculate how many ports can fit with preferred spacing
    const idealPortCount = Math.floor(usableLength / preferredSpacing) + 1;
    const actualPortCount = Math.max(1, idealPortCount);
    
    // If we have multiple ports, distribute them evenly across available space
    let position;
    if (actualPortCount === 1) {
      // Single port - use center
      position = 0;
    } else {
      // Multiple ports - distribute evenly with slight variations to prevent perfect overlap
      const evenSpacing = usableLength / (actualPortCount - 1);
      const basePosition = (edgeUsageIndex % actualPortCount) * evenSpacing;
      
      // Add small deterministic variation based on port position to prevent perfect alignment
      // Use port coordinates for stable hash regardless of edge order
      const portHash = Math.abs((basePort.x * 23 + basePort.y * 19) % 7); // 0-6
      const variation = (portHash - 3) * 2; // -6 to +6 pixel variation
      
      position = basePosition + variation;
    }
    
    // Convert relative position to absolute coordinates
    const offsetFromStart = Math.max(0, Math.min(usableLength, position));
    
    switch (side) {
      case 'top':
      case 'bottom':
        return {
          x: basePort.segmentStart + safeMargin + offsetFromStart,
          y: basePort.y
        };
      case 'left':
      case 'right':
        return {
          x: basePort.x,
          y: basePort.segmentStart + safeMargin + offsetFromStart
        };
      default:
        return basePort;
    }
  };



  // Helper: Generate consistent Manhattan routing path for an edge (used by hover, click, and rendering)
  const generateManhattanRoutingPath = (edge, sourceNode, destNode, sDims, dDims) => {
    const sCenterX = sourceNode.x + sDims.currentWidth / 2;
    const sCenterY = sourceNode.y + sDims.currentHeight / 2;
    const dCenterX = destNode.x + dDims.currentWidth / 2;
    const dCenterY = destNode.y + dDims.currentHeight / 2;

    const sPorts = {
      top: { x: sCenterX, y: sourceNode.y },
      bottom: { x: sCenterX, y: sourceNode.y + sDims.currentHeight },
      left: { x: sourceNode.x, y: sCenterY },
      right: { x: sourceNode.x + sDims.currentWidth, y: sCenterY },
    };
    const dPorts = {
      top: { x: dCenterX, y: destNode.y },
      bottom: { x: dCenterX, y: destNode.y + dDims.currentHeight },
      left: { x: destNode.x, y: dCenterY },
      right: { x: destNode.x + dDims.currentWidth, y: dCenterY },
    };

    const relDx = dCenterX - sCenterX;
    const relDy = dCenterY - sCenterY;
    let sPort, dPort;
    if (Math.abs(relDx) >= Math.abs(relDy)) {
      sPort = relDx >= 0 ? sPorts.right : sPorts.left;
      dPort = relDx >= 0 ? dPorts.left : dPorts.right;
    } else {
      sPort = relDy >= 0 ? sPorts.bottom : sPorts.top;
      dPort = relDy >= 0 ? dPorts.top : dPorts.bottom;
    }
    
    const startX = sPort.x;
    const startY = sPort.y;
    const endX = dPort.x;
    const endY = dPort.y;

    // Determine sides for perpendicular entry/exit (same logic as rendering)
    const sSide = (Math.abs(startY - sourceNode.y) < 0.5) ? 'top'
                    : (Math.abs(startY - (sourceNode.y + sDims.currentHeight)) < 0.5) ? 'bottom'
                    : (Math.abs(startX - sourceNode.x) < 0.5) ? 'left' : 'right';
    const dSide = (Math.abs(endY - destNode.y) < 0.5) ? 'top'
                    : (Math.abs(endY - (destNode.y + dDims.currentHeight)) < 0.5) ? 'bottom'
                    : (Math.abs(endX - destNode.x) < 0.5) ? 'left' : 'right';
    const initOrient = (sSide === 'left' || sSide === 'right') ? 'H' : 'V';
    const finalOrient = (dSide === 'left' || dSide === 'right') ? 'H' : 'V';

    // Use the same bend logic as rendering
    const effectiveBends = (manhattanBends === 'auto')
      ? (initOrient === finalOrient ? 'two' : 'one')
      : manhattanBends;

    // Generate path points based on bend type
    let pathPoints;
    if (effectiveBends === 'two' && initOrient === finalOrient) {
      if (initOrient === 'H') {
        // HVH pattern
        const midX = (startX + endX) / 2;
        pathPoints = [
          { x: startX, y: startY },
          { x: midX, y: startY },
          { x: midX, y: endY },
          { x: endX, y: endY }
        ];
      } else {
        // VHV pattern
        const midY = (startY + endY) / 2;
        pathPoints = [
          { x: startX, y: startY },
          { x: startX, y: midY },
          { x: endX, y: midY },
          { x: endX, y: endY }
        ];
      }
    } else {
      // Simple L-path
      if (initOrient === 'H') {
        pathPoints = [
          { x: startX, y: startY },
          { x: endX, y: startY },
          { x: endX, y: endY }
        ];
      } else {
        pathPoints = [
          { x: startX, y: startY },
          { x: startX, y: endY },
          { x: endX, y: endY }
        ];
      }
    }
    
    return pathPoints;
  };

  // Helper: Generate consistent clean routing path for an edge (used by hover, click, and rendering)
  const generateCleanRoutingPath = (edge, sourceNode, destNode, sDims, dDims) => {
    const x1 = sourceNode.x + sDims.currentWidth / 2;
    const y1 = sourceNode.y + sDims.currentHeight / 2;
    const x2 = destNode.x + dDims.currentWidth / 2;
    const y2 = destNode.y + dDims.currentHeight / 2;
    
    const portAssignment = cleanLaneOffsets.get(edge.id);
    if (portAssignment) {
      const { sourcePort, destPort, sourceSide, destSide } = portAssignment;
      
      // Check if this edge has directional arrows
      const arrowsToward = edge.directionality?.arrowsToward instanceof Set 
        ? edge.directionality.arrowsToward 
        : new Set(Array.isArray(edge.directionality?.arrowsToward) ? edge.directionality.arrowsToward : []);
      const hasSourceArrow = arrowsToward.has(sourceNode.id);
      const hasDestArrow = arrowsToward.has(destNode.id);
      
      // For non-directional connections, route to node centers
      const effectiveStart = hasSourceArrow ? sourcePort : { x: x1, y: y1 };
      const effectiveEnd = hasDestArrow ? destPort : { x: x2, y: y2 };
      const effectiveStartSide = hasSourceArrow ? sourceSide : null;
      const effectiveEndSide = hasDestArrow ? destSide : null;
      
      return computeCleanPolylineFromPorts(
        effectiveStart, 
        effectiveEnd, 
        [], 
        cleanLaneSpacing, 
        effectiveStartSide, 
        effectiveEndSide
      );
    } else {
      // Fallback to simple L-path from node centers
      const startPt = { x: x1, y: y1 };
      const endPt = { x: x2, y: y2 };
      return computeCleanPolylineFromPorts(startPt, endPt, [], cleanLaneSpacing);
    }
  };

  // Port-based routing with intelligent edge distribution - inspired by circuit board routing
  const cleanLaneOffsets = useMemo(() => {
    const portAssignments = new Map(); // edgeId -> { sourcePort, destPort }
    if (!enableAutoRouting || routingStyle !== 'clean' || !visibleEdges?.length) return portAssignments;
    
    try {
      // Step 1: Group edges by node pairs and assign ports intelligently
      const nodePortUsage = new Map(); // nodeId -> { top: [], bottom: [], left: [], right: [] }
      
      // Initialize port usage tracking for all nodes
      for (const node of nodes) {
        nodePortUsage.set(node.id, { top: [], bottom: [], left: [], right: [] });
      }
      
      // Step 2: Assign ports for each edge based on direction and avoid clustering
      for (const edge of visibleEdges) {
        const s = nodeById.get(edge.sourceId);
        const d = nodeById.get(edge.destinationId);
        if (!s || !d) continue;
        
        const sDims = baseDimsById.get(s.id);
        const dDims = baseDimsById.get(d.id);
        if (!sDims || !dDims) continue;
        
        // Calculate node centers
        const sCenterX = s.x + sDims.currentWidth / 2;
        const sCenterY = s.y + sDims.currentHeight / 2;
        const dCenterX = d.x + dDims.currentWidth / 2;
        const dCenterY = d.y + dDims.currentHeight / 2;
        
        // Determine optimal ports based on relative position - favor left/right sides
        const deltaX = dCenterX - sCenterX;
        const deltaY = dCenterY - sCenterY;
        
        let sourceSide, destSide;
        
        // Bias toward left/right sides (where text is) unless the connection is strongly vertical
        const isStronglyVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.5; // 1.5x bias toward horizontal
        
        if (isStronglyVertical) {
          // Strong vertical connection - use top/bottom
          sourceSide = deltaY > 0 ? 'bottom' : 'top';
          destSide = deltaY > 0 ? 'top' : 'bottom';
        } else {
          // Horizontal or diagonal - prefer left/right sides
          sourceSide = deltaX > 0 ? 'right' : 'left';
          destSide = deltaX > 0 ? 'left' : 'right';
        }
        
        // Calculate port positions on the non-rounded edge segments
        const cornerRadius = NODE_CORNER_RADIUS || 8;
        const sourcePortPos = getPortPosition(s, sDims, sourceSide, cornerRadius);
        const destPortPos = getPortPosition(d, dDims, destSide, cornerRadius);
        
        // Distribute edges along the side to avoid clustering
        const sourceUsage = nodePortUsage.get(s.id)[sourceSide];
        const destUsage = nodePortUsage.get(d.id)[destSide];
        
        // Calculate staggered positions along the edge
        const sourceStagger = calculateStaggeredPosition(sourcePortPos, sourceSide, sourceUsage.length, sDims, cornerRadius);
        const destStagger = calculateStaggeredPosition(destPortPos, destSide, destUsage.length, dDims, cornerRadius);
        
        // Record port usage
        sourceUsage.push(edge.id);
        destUsage.push(edge.id);
        
        portAssignments.set(edge.id, {
          sourcePort: sourceStagger,
          destPort: destStagger,
          sourceSide,
          destSide
        });
      }
      
      return portAssignments;
    } catch (error) {
      console.warn('Clean routing port assignment failed:', error);
      return new Map();
    }
  }, [enableAutoRouting, routingStyle, visibleEdges, nodeById, baseDimsById, nodes]);

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
  const [isViewReady, setIsViewReady] = useState(false);

  const [plusSign, setPlusSign] = useState(null);
  const [nodeNamePrompt, setNodeNamePrompt] = useState({ visible: false, name: '', color: null });
  const [connectionNamePrompt, setConnectionNamePrompt] = useState({ visible: false, name: '', color: null, edgeId: null });
  const [abstractionPrompt, setAbstractionPrompt] = useState({ visible: false, name: '', color: null, direction: 'above', nodeId: null, carouselLevel: null });

  // Add logging for abstraction prompt state changes
  useEffect(() => {
    console.log(`[Abstraction Prompt] State changed:`, abstractionPrompt);
  }, [abstractionPrompt]);
  
  // Dialog color picker state
  const [dialogColorPickerVisible, setDialogColorPickerVisible] = useState(false);
  const [dialogColorPickerPosition, setDialogColorPickerPosition] = useState({ x: 0, y: 0 });
  
  // Pie menu color picker state
  const [pieMenuColorPickerVisible, setPieMenuColorPickerVisible] = useState(false);
  const [pieMenuColorPickerPosition, setPieMenuColorPickerPosition] = useState({ x: 0, y: 0 });
  const [activePieMenuColorNodeId, setActivePieMenuColorNodeId] = useState(null);
  const [nodeSelectionGrid, setNodeSelectionGrid] = useState({ visible: false, position: { x: 0, y: 0 } });
  
  // Carousel PieMenu stage state
  const [carouselPieMenuStage, setCarouselPieMenuStage] = useState(1); // 1 = main stage, 2 = position selection stage
  const [isCarouselStageTransition, setIsCarouselStageTransition] = useState(false); // Flag to track internal stage transitions

  // Add logging for carousel stage changes
  useEffect(() => {
    console.log(`[Carousel Stage] Changed to stage:`, carouselPieMenuStage);
  }, [carouselPieMenuStage]);

  const [rightPanelExpanded, setRightPanelExpanded] = useState(true); // Default to open?
  const [isHeaderEditing, setIsHeaderEditing] = useState(false);
  const [isRightPanelInputFocused, setIsRightPanelInputFocused] = useState(false);
  const [leftPanelExpanded, setLeftPanelExpanded] = useState(true); // Default to open?
  const [isLeftPanelInputFocused, setIsLeftPanelInputFocused] = useState(false);
  const [isPieMenuRendered, setIsPieMenuRendered] = useState(false); // Controls if PieMenu is in DOM for animation
  const [currentPieMenuData, setCurrentPieMenuData] = useState(null); // Holds { node, buttons, nodeDimensions }
  const [editingNodeIdOnCanvas, setEditingNodeIdOnCanvas] = useState(null); // For panel-less editing
  const [hasMouseMovedSinceDown, setHasMouseMovedSinceDown] = useState(false);
  const [hoveredEdgeInfo, setHoveredEdgeInfo] = useState(null); // Track hovered edge and which end

  // Connection control panel animation state
  const [controlPanelVisible, setControlPanelVisible] = useState(false);
  const [controlPanelShouldShow, setControlPanelShouldShow] = useState(false);

  // New states for PieMenu transition
  const [selectedNodeIdForPieMenu, setSelectedNodeIdForPieMenu] = useState(null);
  const [isTransitioningPieMenu, setIsTransitioningPieMenu] = useState(false);

  // Abstraction Carousel states
  const [abstractionCarouselVisible, setAbstractionCarouselVisible] = useState(false);
  const [abstractionCarouselNode, setAbstractionCarouselNode] = useState(null);
  const [pendingAbstractionNodeId, setPendingAbstractionNodeId] = useState(null);
  const [carouselFocusedNodeScale, setCarouselFocusedNodeScale] = useState(1.2);
  const [carouselFocusedNodeDimensions, setCarouselFocusedNodeDimensions] = useState(null);
  const [carouselFocusedNode, setCarouselFocusedNode] = useState(null); // Track which node is currently focused in carousel
  
  // Animation states for carousel
  const [carouselAnimationState, setCarouselAnimationState] = useState('hidden'); // 'hidden', 'entering', 'visible', 'exiting'
  const [justCompletedCarouselExit, setJustCompletedCarouselExit] = useState(false);
  
  // Abstraction dimension management
  const [abstractionDimensions, setAbstractionDimensions] = useState(['Physical']);
  const [currentAbstractionDimension, setCurrentAbstractionDimension] = useState('Physical');
  
  // Abstraction control panel states
  const [abstractionControlPanelVisible, setAbstractionControlPanelVisible] = useState(false);
  const [abstractionControlPanelShouldShow, setAbstractionControlPanelShouldShow] = useState(false);
  const [isPieMenuActionInProgress, setIsPieMenuActionInProgress] = useState(false);
  


  // Define carousel callbacks outside conditional rendering to avoid hook violations
  const onCarouselAnimationStateChange = useCallback((newState) => {
    setCarouselAnimationState(newState);
  }, []);

  const onCarouselClose = useCallback(() => {
    // Use the same logic as the back button for a smooth transition
    setSelectedNodeIdForPieMenu(null);
    setIsTransitioningPieMenu(true);
  }, []);

  const onCarouselReplaceNode = useCallback((oldNodeId, newNodeData) => {
    // TODO: Implement node replacement functionality
    console.log('Replace node:', oldNodeId, 'with:', newNodeData);
  }, []);

  // Prevent carousel stage resets while abstraction prompt is open
  useEffect(() => {
    if (abstractionPrompt.visible && carouselPieMenuStage !== 2) {
      console.log(`[Carousel Stage] Abstraction prompt visible, ensuring stage stays at 2`);
      console.log(`[Carousel Stage] Current selectedNodeIdForPieMenu: ${selectedNodeIdForPieMenu}`);
      console.log(`[Carousel Stage] Current isTransitioningPieMenu: ${isTransitioningPieMenu}`);
      setCarouselPieMenuStage(2);
      // Don't mark this as a stage transition to avoid hiding the pie menu
      // setIsCarouselStageTransition(true);
      
      // Ensure the pie menu remains visible during abstraction prompt
      if (!selectedNodeIdForPieMenu && abstractionCarouselNode) {
        console.log(`[Carousel Stage] Restoring selectedNodeIdForPieMenu to keep pie menu visible`);
        setSelectedNodeIdForPieMenu(abstractionCarouselNode.id);
      }
    }
  }, [abstractionPrompt.visible, carouselPieMenuStage, selectedNodeIdForPieMenu, abstractionCarouselNode]);

  const onCarouselExitAnimationComplete = useCallback(() => {
    // Capture the node ID before cleaning up
    const nodeIdToShowPieMenu = abstractionCarouselNode?.id;
    
    // Set exit in progress flag
    carouselExitInProgressRef.current = true;
    
    // Clean up after exit animation completes
    setAbstractionCarouselVisible(false);
    setAbstractionCarouselNode(null);
    setCarouselAnimationState('hidden');
    setIsTransitioningPieMenu(false); // Now safe to end transition
    
    // Now show the regular pie menu for the node that was in the carousel
    if (nodeIdToShowPieMenu) {
      console.log(`[NodeCanvas] Carousel exit complete - restoring selection and pie menu for node: ${nodeIdToShowPieMenu}`);
      setSelectedInstanceIds(new Set([nodeIdToShowPieMenu])); // Restore selection
      setSelectedNodeIdForPieMenu(nodeIdToShowPieMenu);
    }
    
    // Clear the protection flags after animations complete
    setTimeout(() => {
      setJustCompletedCarouselExit(false);
      carouselExitInProgressRef.current = false;
    }, 300); // Quick timeout - allows normal interaction almost immediately
  }, [abstractionCarouselNode?.id]);

  // Use the local state values populated by subscribe
  const projectTitle = activeGraphName ?? 'Loading...';
  const projectBio = activeGraphDescription ?? '';

  const [previewingNodeId, setPreviewingNodeId] = useState(null);
  
  // Track current definition index for each node per graph context (nodeId-graphId -> index)
  const [nodeDefinitionIndices, setNodeDefinitionIndices] = useState(new Map());
  
  // Ref to track carousel exit process to prevent cleanup interference
  const carouselExitInProgressRef = useRef(false);

  // --- Graph Change Cleanup ---
  useEffect(() => {
    // This effect runs whenever the active graph changes.
    // We clear any graph-specific UI state to ensure a clean slate.
    console.log(`[NodeCanvas] activeGraphId changed to: ${activeGraphId}, cleaning up UI state`);
    console.log(`[NodeCanvas] Current state during cleanup:`, {
      abstractionCarouselVisible,
      abstractionPromptVisible: abstractionPrompt.visible,
      carouselPieMenuStage,
      selectedNodeIdForPieMenu
    });
    
    // DON'T clean up if the abstraction carousel is visible (regardless of prompt state)
    if (abstractionCarouselVisible) {
      console.log(`[NodeCanvas] Skipping cleanup - abstraction carousel is visible`);
      return;
    }
    
    // DON'T clean up if we just completed a carousel exit (to prevent clearing restored state)
    if (justCompletedCarouselExit) {
      console.log(`[NodeCanvas] Skipping cleanup - just completed carousel exit`);
      return;
    }
    
    // DON'T clean up if we're transitioning the pie menu (carousel exit in progress)
    if (isTransitioningPieMenu) {
      console.log(`[NodeCanvas] Skipping cleanup - pie menu transition in progress`);
      return;
    }
    
    // DON'T clean up if carousel exit is in progress (ref-based check)
    if (carouselExitInProgressRef.current) {
      console.log(`[NodeCanvas] Skipping cleanup - carousel exit in progress (ref)`);
      return;
    }
    
    // DON'T clean up if we have a selected node and pie menu is active (indicates recent restoration)
    if (selectedInstanceIds.size === 1 && selectedNodeIdForPieMenu && !abstractionCarouselVisible) {
      console.log(`[NodeCanvas] Skipping cleanup - active selection with pie menu (likely just restored)`);
      return;
    }
    
    console.log(`[NodeCanvas] 📍 CLEAR #1: Graph cleanup clearing selectedInstanceIds`);
    setSelectedInstanceIds(new Set());
    setPreviewingNodeId(null);
    setEditingNodeIdOnCanvas(null);
    setPlusSign(null);
    setNodeNamePrompt({ visible: false, name: '' });
    setNodeSelectionGrid({ visible: false, position: { x: 0, y: 0 } });
    setSelectionRect(null);
    setSelectionStart(null);
    setDrawingConnectionFrom(null);
    setHoveredEdgeInfo(null); // Clear edge hover state
    
    // --- Force-close the pie menu ---
    setSelectedNodeIdForPieMenu(null);
    setCurrentPieMenuData(null);
    setIsPieMenuRendered(false);
    setCarouselPieMenuStage(1); // Reset to main stage
    setIsCarouselStageTransition(false); // Reset stage transition flag
    setIsTransitioningPieMenu(false); // Reset any pending transition

    // Clear pie menu color picker state
    setPieMenuColorPickerVisible(false);
    setActivePieMenuColorNodeId(null);

    // Clear abstraction carousel
    console.log(`[NodeCanvas] Cleaning up abstraction carousel state`);
    setAbstractionCarouselVisible(false);
    setAbstractionCarouselNode(null);
    setPendingAbstractionNodeId(null);
          setCarouselFocusedNodeScale(1.2);
      setCarouselFocusedNodeDimensions(null);
      setCarouselFocusedNode(null);
    setCarouselAnimationState('hidden');

    // Clear connection control panel
    setControlPanelVisible(false);
    setControlPanelShouldShow(false);

    // Clear abstraction control panel
    setAbstractionControlPanelVisible(false);
    setAbstractionControlPanelShouldShow(false);
  }, [activeGraphId, abstractionCarouselVisible, justCompletedCarouselExit, isTransitioningPieMenu]); // Protect from cleanup during carousel transitions

  // --- Connection Control Panel Management ---
  useEffect(() => {
    const shouldShow = Boolean(selectedEdgeId && !connectionNamePrompt.visible);
    
    if (shouldShow) {
      // Show the panel immediately
      setControlPanelShouldShow(true);
      setControlPanelVisible(true);
    } else if (selectedEdgeId === null && controlPanelVisible) {
      // Edge was deselected - start exit animation but keep panel mounted
      setControlPanelVisible(false);
      // Don't set controlPanelShouldShow to false yet - let the animation complete
    } else if (!shouldShow && selectedEdgeId && controlPanelVisible) {
      // Dialog opened while edge is still selected - hide panel with animation
      setControlPanelVisible(false);
    } else if (!shouldShow && !selectedEdgeId) {
      // Other cases where panel should be hidden
      setControlPanelVisible(false);
    }
  }, [selectedEdgeId, connectionNamePrompt.visible, controlPanelVisible]);

  // --- Abstraction Control Panel Management ---
  useEffect(() => {
    const shouldShow = Boolean(abstractionCarouselVisible && abstractionCarouselNode);
    
    if (shouldShow) {
      // Show the panel immediately when carousel is visible
      setAbstractionControlPanelShouldShow(true);
      setAbstractionControlPanelVisible(true);
    } else if (!abstractionCarouselVisible && abstractionControlPanelVisible) {
      // Carousel was hidden - start exit animation but keep panel mounted
      setAbstractionControlPanelVisible(false);
      // Don't set abstractionControlPanelShouldShow to false yet - let the animation complete
    } else if (!shouldShow) {
      // Other cases where panel should be hidden
      setAbstractionControlPanelVisible(false);
    }
  }, [abstractionCarouselVisible, abstractionCarouselNode, abstractionControlPanelVisible]);

  // Handle control panel callbacks
  const handleControlPanelClose = useCallback(() => {
    setSelectedEdgeId(null);
    clearSelectedEdgeIds();
  }, [setSelectedEdgeId, clearSelectedEdgeIds]);

  const handleOpenConnectionDialog = useCallback((edgeId) => {
    setConnectionNamePrompt({ visible: true, name: '', color: NODE_DEFAULT_COLOR, edgeId });
  }, [setConnectionNamePrompt]);

  // Handle control panel animation completion
  const handleControlPanelAnimationComplete = useCallback(() => {
    // This callback is only for the exit animation.
    // When it's called, we know it's safe to unmount the component.
    setControlPanelShouldShow(false);
  }, [setControlPanelShouldShow]);

  // Handle abstraction control panel callbacks
  const handleAbstractionDimensionChange = useCallback((newDimension) => {
    setCurrentAbstractionDimension(newDimension);
  }, []);

  const handleAddAbstractionDimension = useCallback((newDimensionName) => {
    setAbstractionDimensions(prev => [...prev, newDimensionName]);
    setCurrentAbstractionDimension(newDimensionName);
  }, []);

  const handleDeleteAbstractionDimension = useCallback((dimensionToDelete) => {
    setAbstractionDimensions(prev => {
      const newDimensions = prev.filter(dim => dim !== dimensionToDelete);
      // If we're deleting the current dimension, switch to the first remaining one
      if (dimensionToDelete === currentAbstractionDimension && newDimensions.length > 0) {
        setCurrentAbstractionDimension(newDimensions[0]);
      }
      return newDimensions;
    });
  }, [currentAbstractionDimension]);

  const handleExpandAbstractionDimension = useCallback((node, dimension, iconRect) => {
    // For now, just open the node in a new tab
    // In the future, this could create/open a graph definition for the abstraction chain
    console.log(`[Abstraction] Expanding ${dimension} dimension for node:`, node.name);
    // Could implement hurtle animation here similar to other expand buttons
  }, []);

  const handleAbstractionControlPanelAnimationComplete = useCallback(() => {
    // This callback is only for the exit animation.
    // When it's called, we know it's safe to unmount the component.
    setAbstractionControlPanelShouldShow(false);
  }, []);

  // --- Saved Graphs Management ---
  const bookmarkActive = useMemo(() => {
    // Check if the current graph's defining node is saved
    if (!activeGraphId) return false;
    const activeGraph = graphsMap.get(activeGraphId);
    const definingNodeId = activeGraph?.definingNodeIds?.[0];
    const isActive = definingNodeId ? savedNodeIds.has(definingNodeId) : false;
    //console.log('[NodeCanvas bookmarkActive] activeGraphId:', activeGraphId, 'definingNodeId:', definingNodeId, 'savedNodeIds:', Array.from(savedNodeIds), 'isActive:', isActive);
    return isActive;
  }, [activeGraphId, graphsMap, savedNodeIds]);

  const handleToggleBookmark = useCallback(() => {
    // Get current state for logging
    const currentState = useGraphStore.getState();
    console.log('[NodeCanvas handleToggleBookmark] activeGraphId:', currentState.activeGraphId);

    if (currentState.activeGraphId) {
      // Toggle the current graph
      console.log('[NodeCanvas handleToggleBookmark] Toggling saved state for current graph:', currentState.activeGraphId);
      storeActions.toggleSavedGraph(currentState.activeGraphId);
    } else {
      console.warn('[NodeCanvas handleToggleBookmark] No active graph found. Cannot toggle.');
    }
  }, [storeActions]); // Dependency only on storeActions as we read fresh state inside
  // --- Refs (Keep these) ---
  const containerRef = useRef(null);
  const [, drop] = useDrop(() => ({
    accept: SPAWNABLE_NODE,
    drop: (item, monitor) => {
        if (!activeGraphId) return;

        // The 'item' from the drag source now contains the prototypeId
        const { prototypeId } = item;
        if (!prototypeId) {
            console.error("Dropped item is missing prototypeId", item);
            return;
        };

        const offset = monitor.getClientOffset();
        if (!offset || !containerRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();

        // Convert drop position to canvas SVG coordinates
        const x = (offset.x - rect.left - panOffset.x) / zoomLevel;
        const y = (offset.y - rect.top - panOffset.y) / zoomLevel;
        
        const prototype = nodePrototypesMap.get(prototypeId);
        if (!prototype) {
             console.error(`Dropped prototype with ID ${prototypeId} not found in nodePrototypesMap.`);
             return;
        }
        
        const dimensions = getNodeDimensions(prototype, false, null);

        // With the new model, we ALWAYS create a new instance.
        let position = {
            x: x - (dimensions.currentWidth / 2),
            y: y - (dimensions.currentHeight / 2)
        };

        // Apply smooth grid snapping when creating new nodes via drag and drop if grid is enabled
        if (gridMode !== 'off') {
          const snapped = snapToGridAnimated(x, y, dimensions.currentWidth, dimensions.currentHeight, null);
          position = { x: snapped.x, y: snapped.y };
        }

        storeActions.addNodeInstance(activeGraphId, prototypeId, position);
    },
  }), [activeGraphId, panOffset, zoomLevel, nodePrototypesMap, storeActions]);

  const setCanvasAreaRef = useCallback(node => {
      containerRef.current = node;
      drop(node);
  }, [drop]);

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
  // Ensure async zoom results apply in order to avoid ghost frames
  const zoomOpIdRef = useRef(0);
  const selectionBaseRef = useRef(new Set());
  const wasSelectionBox = useRef(false);
  const wasDrawingConnection = useRef(false);
  // Add refs for click vs double-click detection
  const clickTimeoutIdRef = useRef(null);
  const potentialClickNodeRef = useRef(null);
  const CLICK_DELAY = 180; // Reduced milliseconds to wait for a potential double-click

  // Ref to track initial mount completion
  const isMountedRef = useRef(false);

  // Pie menu color picker handlers
  const handlePieMenuColorPickerOpen = useCallback((nodeId, position) => {
    // If already open for the same node, close it (toggle behavior)
    if (pieMenuColorPickerVisible && activePieMenuColorNodeId === nodeId) {
      setPieMenuColorPickerVisible(false);
      setActivePieMenuColorNodeId(null);
      return;
    }
    
    setPieMenuColorPickerPosition(position);
    setPieMenuColorPickerVisible(true);
    setActivePieMenuColorNodeId(nodeId);
  }, [pieMenuColorPickerVisible, activePieMenuColorNodeId]);

  const handlePieMenuColorPickerClose = useCallback(() => {
    setPieMenuColorPickerVisible(false);
    setActivePieMenuColorNodeId(null);
  }, []);

  const handlePieMenuColorChange = useCallback((color) => {
    if (activePieMenuColorNodeId) {
      const node = nodes.find(n => n.id === activePieMenuColorNodeId);
      if (node) {
        storeActions.updateNodePrototype(node.prototypeId, draft => {
          draft.color = color;
        });
      }
    }
  }, [activePieMenuColorNodeId, nodes, storeActions]);

  // Pie Menu Button Configuration - now targetPieMenuButtons and dynamic
  const targetPieMenuButtons = useMemo(() => {
    const selectedNode = selectedNodeIdForPieMenu ? nodes.find(n => n.id === selectedNodeIdForPieMenu) : null;

    // Check if we're in AbstractionCarousel mode
    // In stage 2, we might be using a focused node different from the original carousel node
    const isInCarouselMode = selectedNode && abstractionCarouselVisible && abstractionCarouselNode && selectedNode.id === abstractionCarouselNode.id;
    if (isInCarouselMode) {
      // AbstractionCarousel mode: different layouts based on stage
      if (carouselPieMenuStage === 1) {
        // Stage 1: Main carousel menu with 4 buttons from left to right: Back, Swap, Plus, ArrowUpFromDot
        return [
        {
          id: 'carousel-back',
          label: 'Back',
          icon: ArrowLeft,
          position: 'left-inner',
                        action: (nodeId) => {
              // Set protection flag BEFORE starting exit to prevent graph cleanup interference
              setJustCompletedCarouselExit(true);
              setIsPieMenuActionInProgress(true);
              setTimeout(() => setIsPieMenuActionInProgress(false), 100);
              console.log(`[PieMenu Action] Back clicked for node: ${nodeId}. Closing AbstractionCarousel.`);
              // This will trigger the pie menu to shrink, and its onExitAnimationComplete will trigger the carousel to close.
              setIsTransitioningPieMenu(true);
            }
        },
        {
          id: 'carousel-swap',
          label: 'Swap',
          icon: SendToBack,
          position: 'right-inner',
          action: (nodeId) => {
            setIsPieMenuActionInProgress(true);
            setTimeout(() => setIsPieMenuActionInProgress(false), 100);

            console.log(`[PieMenu Action] Swap clicked for node: ${nodeId}. This will replace the canvas node.`);
            // The swap functionality will replace the current instance in the canvas
            // with the selected node from the carousel
            const currentInstance = nodes.find(n => n.id === nodeId);
            if (currentInstance) {
              // This would replace the current instance's prototype with the carousel node's prototype
              // For now, just log it - the actual implementation would update the instance
              console.log(`Would swap canvas node ${currentInstance.prototypeId} with carousel selection`);
            }
          }
        },
        {
          id: 'carousel-plus',
          label: 'Create Definition',
          icon: Plus,
          position: 'right-second',
          action: (nodeId) => {
            console.log(`[PieMenu Action] *** PLUS BUTTON CLICKED *** Create Definition clicked for carousel node: ${nodeId}. Transitioning to position selection stage.`);
            console.log(`[PieMenu Action] Current stage: ${carouselPieMenuStage}, transitioning to stage 2`);
            console.log(`[PieMenu Action] State before transition:`, {
              carouselPieMenuStage,
              isCarouselStageTransition: false,
              selectedNodeIdForPieMenu
            });
            
            // Start the stage transition by triggering the pie menu to shrink first
            setIsCarouselStageTransition(true); // Mark this as an internal stage transition
            setIsTransitioningPieMenu(true); // This will trigger the pie menu to shrink
            
            // The stage will be changed in onExitAnimationComplete after the shrink animation completes
            console.log(`[PieMenu Action] *** STAGE TRANSITION STARTED *** Triggering pie menu shrink`);
          }
        },
        {
          id: 'carousel-delete',
          label: 'Delete',
          icon: Trash2,
          position: 'right-third',
          action: (nodeId) => {
            setIsPieMenuActionInProgress(true);
            setTimeout(() => setIsPieMenuActionInProgress(false), 100);

            console.log(`[PieMenu Action] Delete clicked for carousel node: ${nodeId}`);
            
            const selectedNode = carouselFocusedNode || nodes.find(n => n.id === nodeId);
            if (!selectedNode) {
              console.error(`[PieMenu Action] No node found with ID: ${nodeId}`);
              return;
            }

            // Get the current abstraction carousel data to find the original node
            const carouselNode = abstractionCarouselNode;
            if (!carouselNode) {
              console.error(`[PieMenu Action] No carousel data available`);
              return;
            }

            // Prevent deletion of the original node that the carousel is built around
            if (selectedNode.prototypeId === carouselNode.prototypeId) {
              console.warn(`[PieMenu Action] Cannot delete the original node that the carousel is built around`);
              return;
            }

            // Remove the node from the abstraction chain
            removeFromAbstractionChain(
              carouselNode.prototypeId,     // the node whose chain we're modifying
              currentAbstractionDimension,  // dimension (Physical, Conceptual, etc.)
              selectedNode.prototypeId      // the node to remove
            );

            console.log(`[PieMenu Action] Removed node "${selectedNode.name}" from ${carouselNode.name}'s ${currentAbstractionDimension} abstraction chain`);
            
            // Don't close the pie menu after deletion - stay in the carousel to see the updated chain
            // setSelectedNodeIdForPieMenu(null);
            // setIsTransitioningPieMenu(true);
          }
        },
        {
          id: 'carousel-expand',
          label: 'Expand',
          icon: ArrowUpFromDot,
          position: 'right-outer',
          action: (nodeId) => {
            setIsPieMenuActionInProgress(true);
            setTimeout(() => setIsPieMenuActionInProgress(false), 100);
            
            console.log(`[PieMenu Action] Expand clicked for carousel node: ${nodeId}. Starting hurtle animation and closing carousel.`);
            const nodeData = nodes.find(n => n.id === nodeId);
            if (nodeData) {
              const prototypeId = nodeData.prototypeId;
              if (nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0) {
                // Node has definitions - start hurtle animation to first one
                const graphIdToOpen = nodeData.definitionGraphIds[0];
                startHurtleAnimation(nodeId, graphIdToOpen, prototypeId);
                // Close carousel after animation starts
                setSelectedNodeIdForPieMenu(null);
                setIsTransitioningPieMenu(true);
              } else {
                // Node has no definitions - create one first, then start hurtle animation
                const sourceGraphId = activeGraphId; // Capture current graph before it changes
                storeActions.createAndAssignGraphDefinitionWithoutActivation(prototypeId);
                
                setTimeout(() => {
                  const currentState = useGraphStore.getState();
                  const updatedNodeData = currentState.nodePrototypes.get(prototypeId);
                  if (updatedNodeData?.definitionGraphIds?.length > 0) {
                    const newGraphId = updatedNodeData.definitionGraphIds[updatedNodeData.definitionGraphIds.length - 1];
                    startHurtleAnimation(nodeId, newGraphId, prototypeId, sourceGraphId);
                    // Close carousel after animation starts
                    setSelectedNodeIdForPieMenu(null);
                    setIsTransitioningPieMenu(true);
                  } else {
                    console.error(`[PieMenu Expand] Could not find new definition for node ${prototypeId} after creation.`);
                  }
                }, 50);
              }
            }
          }
        }
      ];
      } else if (carouselPieMenuStage === 2) {
        // Stage 2: Position selection menu - Back on left-inner, vertical stack on right
        console.log(`[PieMenu Buttons] Generating stage 2 buttons for carousel mode`);
        const stage2Buttons = [
          {
            id: 'carousel-back-stage2',
            label: 'Back',
            icon: ArrowLeft,
            position: 'left-inner',
            action: (nodeId) => {
              console.log(`[PieMenu Action] Back clicked in stage 2. Returning to main carousel menu.`);
              // Start the stage transition by triggering the pie menu to shrink first
              setIsCarouselStageTransition(true); // Mark this as an internal stage transition
              setIsTransitioningPieMenu(true); // This will trigger the pie menu to shrink
              
              // The stage will be changed in onExitAnimationComplete after the shrink animation completes
              console.log(`[PieMenu Action] *** STAGE TRANSITION STARTED *** Triggering pie menu shrink`);
            }
          },
          {
            id: 'carousel-add-above',
            label: 'Add Above',
            icon: CornerUpLeft,
            position: 'right-top',
            action: (nodeId) => {
              console.log(`[PieMenu Action] Add Above clicked for carousel node: ${nodeId}`);
              console.log(`[PieMenu Action] Current carouselFocusedNode:`, carouselFocusedNode);
              console.log(`[PieMenu Action] Current carouselPieMenuStage: ${carouselPieMenuStage}`);
              
              // In stage 2, use the focused carousel node, otherwise use the clicked node
              const targetNode = carouselPieMenuStage === 2 && carouselFocusedNode 
                ? carouselFocusedNode 
                : nodes.find(n => n.id === nodeId);
                
              console.log(`[PieMenu Action] Using target node for Add Above:`, {
                id: targetNode?.id,
                name: targetNode?.name,
                prototypeId: targetNode?.prototypeId,
                usingFocusedNode: carouselPieMenuStage === 2 && carouselFocusedNode
              });
              
              if (!targetNode) {
                console.error(`[PieMenu Action] No target node found`);
                return;
              }
              
              // Set abstraction prompt with the target node (focused node in stage 2)
              setAbstractionPrompt({
                visible: true,
                name: '',
                color: null,
                direction: 'above',
                nodeId: targetNode.id,
                carouselLevel: abstractionCarouselNode // Pass the carousel state
              });
              
              console.log(`[PieMenu Action] Add Above abstraction prompt set for targetNodeId: ${targetNode.id}`);
            }
          },
          {
            id: 'carousel-add-below',
            label: 'Add Below',
            icon: CornerDownLeft,
            position: 'right-bottom',
            action: (nodeId) => {
              console.log(`[PieMenu Action] Add Below clicked for carousel node: ${nodeId}`);
              console.log(`[PieMenu Action] Current carouselFocusedNode:`, carouselFocusedNode);
              console.log(`[PieMenu Action] Current carouselPieMenuStage: ${carouselPieMenuStage}`);
              
              // In stage 2, use the focused carousel node, otherwise use the clicked node
              const targetNode = carouselPieMenuStage === 2 && carouselFocusedNode 
                ? carouselFocusedNode 
                : nodes.find(n => n.id === nodeId);
                
              console.log(`[PieMenu Action] Using target node for Add Below:`, {
                id: targetNode?.id,
                name: targetNode?.name,
                prototypeId: targetNode?.prototypeId,
                usingFocusedNode: carouselPieMenuStage === 2 && carouselFocusedNode
              });
              
              if (!targetNode) {
                console.error(`[PieMenu Action] No target node found`);
                return;
              }
              
              // Set abstraction prompt with the target node (focused node in stage 2)
              setAbstractionPrompt({
                visible: true,
                name: '',
                color: null,
                direction: 'below',
                nodeId: targetNode.id,
                carouselLevel: abstractionCarouselNode // Pass the carousel state
              });
              
              console.log(`[PieMenu Action] Add Below abstraction prompt set for targetNodeId: ${targetNode.id}`);
            }
          }
        ];
        console.log(`[PieMenu Buttons] Generated ${stage2Buttons.length} stage 2 buttons:`, stage2Buttons.map(b => b.id));
        return stage2Buttons;
      }
    }
    
    if (selectedNode && previewingNodeId === selectedNode.id) {
      // If the selected node for the pie menu is the one being previewed, show only Compose
      // But don't show it if the carousel is exiting (only for non-carousel mode)
      if (!abstractionCarouselVisible && carouselAnimationState === 'exiting') {
        return []; // Return empty array to hide all buttons during carousel exit
      }
      
      return [
        {
          id: 'compose-preview',
          label: 'Compose',
          icon: Package,
          action: (nodeId) => {
            // Prevent compose action during carousel transitions (only for non-carousel mode)
            if (!abstractionCarouselVisible && carouselAnimationState === 'exiting') {
              console.log('[PieMenu Action] Blocking compose during carousel exit');
              return;
            }
            
            // console.log(`[PieMenu Action] Compose clicked for node: ${nodeId}. Starting transition.`);
            setIsTransitioningPieMenu(true); // Start transition, current menu will hide
            // setPreviewingNodeId(null); // This will be set after animation
          }
        }
      ];
    } else {
      // Default buttons: Expand, Decompose, Connect, Delete, Edit (swapped edit and expand positions)
      // But don't show buttons if the carousel is exiting (only for non-carousel mode)
      if (!abstractionCarouselVisible && carouselAnimationState === 'exiting') {
        return []; // Return empty array to hide all buttons during carousel exit
      }
      
      return [
        {
          id: 'expand-tab',
          label: 'Expand',
          icon: ArrowUpFromDot,
          action: (instanceId) => {
            const nodeData = nodes.find(n => n.id === instanceId);
            if (nodeData) {
              const prototypeId = nodeData.prototypeId;
              if (nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0) {
                // Node has definitions - start hurtle animation to first one
                const graphIdToOpen = nodeData.definitionGraphIds[0];
                startHurtleAnimation(instanceId, graphIdToOpen, prototypeId);
              } else {
                // Node has no definitions - create one first, then start hurtle animation
                const sourceGraphId = activeGraphId; // Capture current graph before it changes
                storeActions.createAndAssignGraphDefinitionWithoutActivation(prototypeId);
                
                setTimeout(() => {
                  const currentState = useGraphStore.getState();
                  const updatedNodeData = currentState.nodePrototypes.get(prototypeId);
                  if (updatedNodeData?.definitionGraphIds?.length > 0) {
                    const newGraphId = updatedNodeData.definitionGraphIds[updatedNodeData.definitionGraphIds.length - 1];
                    startHurtleAnimation(instanceId, newGraphId, prototypeId, sourceGraphId);
                  } else {
                    console.error(`[PieMenu Expand] Could not find new definition for node ${prototypeId} after creation.`);
                  }
                }, 50);
              }
            }
          }
        },
        {
          id: 'decompose-preview',
          label: 'Decompose',
          icon: PackageOpen,
          action: (instanceId) => {
            // Prevent decompose action during carousel transitions (only for non-carousel mode)
            if (!abstractionCarouselVisible && carouselAnimationState === 'exiting') {
              console.log('[PieMenu Action] Blocking decompose during carousel exit');
              return;
            }
            
            console.log(`[PieMenu Action] Decompose clicked for instance: ${instanceId}. Starting transition.`);
            setIsTransitioningPieMenu(true); // Start transition, current menu will hide
            // previewingNodeId (which is an instanceId) will be set in onExitAnimationComplete after animation
          }
        },
        { id: 'abstraction', label: 'Abstraction', icon: Layers, action: (instanceId) => {
            // Prevent abstraction action during carousel transitions (only for non-carousel mode)
            if (!abstractionCarouselVisible && carouselAnimationState === 'exiting') {
              console.log('[PieMenu Action] Blocking abstraction during carousel exit');
              return;
            }
            
            console.log(`[PieMenu Action] Abstraction clicked for node: ${instanceId}.`);
            setPendingAbstractionNodeId(instanceId); // Store the instance ID for later
            setIsTransitioningPieMenu(true); // Start transition, current menu will hide
            // Abstraction carousel will be set up in onExitAnimationComplete after animation
        } },
        { id: 'delete', label: 'Delete', icon: Trash2, action: (instanceId) => {
          storeActions.removeNodeInstance(activeGraphId, instanceId);
          console.log(`[NodeCanvas] 📍 CLEAR #2: Delete action clearing selectedInstanceIds for node ${instanceId}`);
          setSelectedInstanceIds(new Set()); // Deselect after deleting
          setSelectedNodeIdForPieMenu(null); // Ensure pie menu hides
        } },
        { id: 'edit', label: 'Edit', icon: Edit3, action: (instanceId) => {
            const instance = nodes.find(n => n.id === instanceId);
            if (instance) {
                // Open panel tab using the PROTOTYPE ID
                storeActions.openRightPanelNodeTab(instance.prototypeId, instance.name);
                // Ensure right panel is expanded
                if (!rightPanelExpanded) {
                    setRightPanelExpanded(true);
                }
                // Enable inline editing on canvas using the INSTANCE ID
                setEditingNodeIdOnCanvas(instanceId);
            }
        } },
        { 
          id: 'save', 
          label: (() => {
            const node = nodes.find(n => n.id === selectedNodeIdForPieMenu);
            return node && savedNodeIds.has(node.prototypeId) ? 'Unsave' : 'Save';
          })(), 
          icon: Bookmark,
          fill: (() => {
            const node = nodes.find(n => n.id === selectedNodeIdForPieMenu);
            return node && savedNodeIds.has(node.prototypeId) ? 'maroon' : 'none';
          })(),
          action: (instanceId) => {
            const node = nodes.find(n => n.id === instanceId);
            if (node) {
              storeActions.toggleSavedNode(node.prototypeId);
            }
          }
        },
        { id: 'palette', label: 'Palette', icon: Palette, action: (instanceId) => {
            const node = nodes.find(n => n.id === instanceId);
            if (node) {
              // Get the current pie menu data at execution time to avoid circular dependency
              const pieMenuData = selectedNodeIdForPieMenu ? {
                node: nodes.find(n => n.id === selectedNodeIdForPieMenu),
                nodeDimensions: getNodeDimensions(node, previewingNodeId === node.id, null)
              } : null;
              
              if (pieMenuData) {
                // Calculate position for color picker relative to the palette button
                // We'll position it near the pie menu node
                const nodeCenter = {
                  x: pieMenuData.node.x + pieMenuData.nodeDimensions.currentWidth / 2,
                  y: pieMenuData.node.y + pieMenuData.nodeDimensions.currentHeight / 2
                };
                
                // Convert canvas coordinates to screen coordinates
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                  const screenX = nodeCenter.x * zoomLevel + panOffset.x + rect.left;
                  const screenY = nodeCenter.y * zoomLevel + panOffset.y + rect.top;
                  
                  handlePieMenuColorPickerOpen(instanceId, { x: screenX, y: screenY });
                }
              }
            }
        } },
        { id: 'more', label: 'More', icon: MoreHorizontal, action: (instanceId) => {
            console.log(`[PieMenu Action] More options clicked for node: ${instanceId}. Future: show additional menu/submenu.`);
            // TODO: Implement additional options menu/submenu
        } }
      ];
    }
  }, [storeActions, setSelectedInstanceIds, setPreviewingNodeId, selectedNodeIdForPieMenu, previewingNodeId, nodes, activeGraphId, abstractionCarouselVisible, abstractionCarouselNode, carouselPieMenuStage, carouselFocusedNode, carouselAnimationState, PackageOpen, Package, ArrowUpFromDot, Edit3, Trash2, Bookmark, ArrowLeft, SendToBack, Plus, CornerUpLeft, CornerDownLeft, Palette, MoreHorizontal, zoomLevel, panOffset, containerRef, handlePieMenuColorPickerOpen, savedNodeIds]);
  
  // Log button changes for debugging
  useEffect(() => {
    // console.log(`[PieMenu Buttons] targetPieMenuButtons changed:`, {
    //   buttonCount: targetPieMenuButtons.length,
    //   buttonIds: targetPieMenuButtons.map(b => b.id),
    //   carouselStage: carouselPieMenuStage,
    //   selectedNodeId: selectedNodeIdForPieMenu,
    //   carouselVisible: abstractionCarouselVisible
    // });
  }, [targetPieMenuButtons, carouselPieMenuStage, selectedNodeIdForPieMenu, abstractionCarouselVisible]);

  // Effect to restore view state on graph change or center if no stored state
  useLayoutEffect(() => {
    setIsViewReady(false); // Set to not ready on graph change

    // Ensure we have valid sizes and an active graph
    if (activeGraphId && viewportSize.width > 0 && viewportSize.height > 0 && canvasSize.width > 0 && canvasSize.height > 0) {

      const graphData = graphsMap.get(activeGraphId);

      if (graphData && graphData.panOffset && typeof graphData.zoomLevel === 'number') {
        // Restore the stored view state immediately
        // console.log(`[NodeCanvas] Restoring view state for graph ${activeGraphId}:`, storedViewState);
        setPanOffset(graphData.panOffset);
        setZoomLevel(graphData.zoomLevel);
      } else {
        // No stored state, center the view as before
        // console.log(`[NodeCanvas] No stored view state for graph ${activeGraphId}, centering view`);

      // Target the center of the canvas
      const targetCanvasX = canvasSize.width / 2;
      const targetCanvasY = canvasSize.height / 2;

        // Use default zoom level
        const defaultZoom = 1;

      // Calculate pan needed to place targetCanvas coords at viewport center
        const initialPanX = viewportSize.width / 2 - targetCanvasX * defaultZoom;
        const initialPanY = viewportSize.height / 2 - targetCanvasY * defaultZoom;

        // Clamp the initial pan to valid bounds
      const maxX = 0;
      const maxY = 0;
        const minX = viewportSize.width - canvasSize.width * defaultZoom;
        const minY = viewportSize.height - canvasSize.height * defaultZoom;
      const clampedX = Math.min(Math.max(initialPanX, minX), maxX);
      const clampedY = Math.min(Math.max(initialPanY, minY), maxY);

        // Apply the calculated view state immediately
      setPanOffset({ x: clampedX, y: clampedY });
        setZoomLevel(defaultZoom);
      }
      
      // Set view to ready immediately - no delay
      setIsViewReady(true);

    } else if (!activeGraphId) {
      setIsViewReady(true); // No graph, so "ready" to show nothing
    }
  }, [activeGraphId, viewportSize, canvasSize, graphsMap]);

  // Track when panning/zooming operations are active
  const isPanningOrZooming = useRef(false);
  const saveViewStateTimeout = useRef(null);

  // Function to save view state when operations complete
  const updateGraphViewInStore = useCallback(() => {
    if (activeGraphId && panOffset && zoomLevel) {
      updateGraphView(activeGraphId, panOffset, zoomLevel);
    }
  }, [activeGraphId, panOffset, zoomLevel, updateGraphView]);

  // Effect to save view state after panning/zooming stops
  useEffect(() => {
    if (activeGraphId && panOffset && zoomLevel) {
      // Clear any existing timeout
      if (saveViewStateTimeout.current) {
        clearTimeout(saveViewStateTimeout.current);
      }
      
      // Set a timeout to save after operations stop
      saveViewStateTimeout.current = setTimeout(() => {
        if (!isPanningOrZooming.current) {
          updateGraphViewInStore();
        }
      }, 300); // Save 300ms after last pan/zoom change
    }

    return () => {
      if (saveViewStateTimeout.current) {
        clearTimeout(saveViewStateTimeout.current);
      }
    };
  }, [activeGraphId, panOffset, zoomLevel, updateGraphViewInStore]);

  // --- Utility Functions ---
  const lerp = (a, b, t) => a + (b - a) * t;
  const clampCoordinates = (x, y) => {
    const boundedX = Math.min(Math.max(x, 0), canvasSize.width);
    const boundedY = Math.min(Math.max(y, 0), canvasSize.height);
    return { x: boundedX, y: boundedY };
  };

  // Fast line-rectangle intersection for edge culling
  const lineIntersectsRect = (x1, y1, x2, y2, rect) => {
    // Cohen–Sutherland-like quick reject/accept
    const left = rect.minX, right = rect.maxX, top = rect.minY, bottom = rect.maxY;
    // Trivial accept if any endpoint inside
    if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return true;
    if (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom) return true;
    // Compute line deltas
    const dx = x2 - x1;
    const dy = y2 - y1;
    // Helper to test intersection with a vertical or horizontal boundary
    const intersectsVertical = (x) => {
      if (dx === 0) return false;
      const t = (x - x1) / dx;
      if (t < 0 || t > 1) return false;
      const y = y1 + t * dy;
      return y >= top && y <= bottom;
    };
    const intersectsHorizontal = (y) => {
      if (dy === 0) return false;
      const t = (y - y1) / dy;
      if (t < 0 || t > 1) return false;
      const x = x1 + t * dx;
      return x >= left && x <= right;
    };
    return (
      intersectsVertical(left) ||
      intersectsVertical(right) ||
      intersectsHorizontal(top) ||
      intersectsHorizontal(bottom)
    );
  };

  // Helper function to get description content for a node when previewing
  const getNodeDescriptionContent = (node, isNodePreviewing) => {
    if (!isNodePreviewing || !node.definitionGraphIds || node.definitionGraphIds.length === 0) {
      return null;
    }
    
    // Create context-specific key for this node in the current graph
    const contextKey = `${node.prototypeId}-${activeGraphId}`; // Use prototypeId for context
    const currentIndex = nodeDefinitionIndices.get(contextKey) || 0;
    const definitionGraphId = node.definitionGraphIds[currentIndex] || node.definitionGraphIds[0];
    if (!definitionGraphId) return null;
    
    const graphData = graphsMap.get(definitionGraphId);
    return graphData?.description || null;
  };

  const isInsideNode = (nodeData, clientX, clientY) => {
     if (!containerRef.current || !nodeData) return false;
     const rect = containerRef.current.getBoundingClientRect();
     const scaledX = (clientX - rect.left - panOffset.x) / zoomLevel;
     const scaledY = (clientY - rect.top - panOffset.y) / zoomLevel;

     // TODO: Adapt getNodeDimensions or get dimensions directly
     // For now, use fixed size as placeholder
     const { currentWidth, currentHeight } = getNodeDimensions(nodeData, previewingNodeId === nodeData.id, null); // Pass NodeData
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

  // Helper function to check if a point is near a line (for edge hover detection)
  const isNearEdge = (x1, y1, x2, y2, pointX, pointY, threshold = 20) => {
    // Calculate distance from point to line segment
    const A = pointX - x1;
    const B = pointY - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return Math.sqrt(A * A + B * B) <= threshold; // Point-to-point distance
    
    let param = dot / lenSq;
    
    // Clamp to line segment
    if (param < 0) param = 0;
    else if (param > 1) param = 1;
    
    const xx = x1 + param * C;
    const yy = y1 + param * D;
    
    const dx = pointX - xx;
    const dy = pointY - yy;
    
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
  };
  const handleNodeMouseDown = (nodeData, e) => { // nodeData is now a hydrated node (instance + prototype)
    e.stopPropagation();
    if (isPaused || !activeGraphId) return;

    const instanceId = nodeData.id; // This is the instance ID
    const prototypeId = nodeData.prototypeId;
    setHasMouseMovedSinceDown(false);

    // --- Double-click ---
    if (e.detail === 2) {
      e.preventDefault();
      if (clickTimeoutIdRef.current) { clearTimeout(clickTimeoutIdRef.current); clickTimeoutIdRef.current = null; }
      potentialClickNodeRef.current = null;
      // Open panel tab using the PROTOTYPE ID
      storeActions.openRightPanelNodeTab(prototypeId, nodeData.name);
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
        potentialClickNodeRef.current = nodeData;

        clickTimeoutIdRef.current = setTimeout(() => {
            if (potentialClickNodeRef.current?.id === instanceId && !mouseMoved.current && !isMouseDown.current) {
                // --- Execute Selection Logic ---
                const wasSelected = selectedInstanceIds.has(instanceId);
                setSelectedInstanceIds(prev => {
                    const newSelected = new Set(prev);
                    if (wasSelected) {
                       if (instanceId !== previewingNodeId) { // previewingNodeId also needs to be an instanceId
                         newSelected.delete(instanceId); 
                       }
                    } else {
                       newSelected.add(instanceId);
                    }
                    return newSelected;
                });
            }
            clickTimeoutIdRef.current = null;
            potentialClickNodeRef.current = null;
        }, CLICK_DELAY);

        // --- Setup Long Press for Drag/Connection ---
        clearTimeout(longPressTimeout.current);
        setLongPressingInstanceId(instanceId);
        longPressTimeout.current = setTimeout(() => {
            if (clickTimeoutIdRef.current) { clearTimeout(clickTimeoutIdRef.current); clickTimeoutIdRef.current = null; }
            potentialClickNodeRef.current = null;

            if (mouseInsideNode.current && !mouseMoved.current) { 
                if (selectedInstanceIds.has(instanceId)) {
                    // Multi-node drag setup
                    const initialPositions = {};
                    const primaryNodeData = nodes.find(n => n.id === instanceId);
                    if (!primaryNodeData) return;
                    const initialPrimaryPos = { x: primaryNodeData.x, y: primaryNodeData.y };

                    nodes.forEach(n => {
                        if (selectedInstanceIds.has(n.id) && n.id !== instanceId) {
                            initialPositions[n.id] = { offsetX: n.x - initialPrimaryPos.x, offsetY: n.y - initialPrimaryPos.y };
                        }
                    });
                    setDraggingNodeInfo({
                        initialMouse: { x: e.clientX, y: e.clientY },
                        initialPrimaryPos,
                        relativeOffsets: initialPositions,
                        primaryId: instanceId
                    });
                    selectedInstanceIds.forEach(id => {
                        storeActions.updateNodeInstance(activeGraphId, id, draft => { draft.scale = 1.1; });
                    });
                    


                } else {
                    // Single node drag setup
                    const offset = { x: e.clientX - nodeData.x * zoomLevel - panOffset.x, y: e.clientY - nodeData.y * zoomLevel - panOffset.y };
                    setDraggingNodeInfo({ instanceId: instanceId, offset });
                    storeActions.updateNodeInstance(activeGraphId, instanceId, draft => { draft.scale = 1.1; });
                    

                }
            }
            setLongPressingInstanceId(null); // Clear after processing
        }, LONG_PRESS_DURATION);
    }
  };

  const handleSaveNodeData = (prototypeId, newData) => { // Operates on prototype
    if (!activeGraphId) return;
    storeActions.updateNodePrototype(prototypeId, draft => {
        Object.assign(draft, newData);
    });
  };

  // Delta history for better trackpad/mouse detection
  const deltaHistoryRef = useRef([]);
  const DELTA_HISTORY_SIZE = 10;
  const DELTA_TIMEOUT = 500; // Clear history after 500ms of inactivity
  const deltaTimeoutRef = useRef(null);
  // Lock the detected device type within a continuous wheel stream
  const wheelStreamRef = useRef({ lockedType: null, lastTimestamp: 0 });
  const WHEEL_STREAM_GAP_MS = 140; // gap after which a new stream starts
  // Lethargy instance to classify intentful mouse wheel vs inertial trackpad
  const lethargyRef = useRef(null);
  if (!lethargyRef.current) {
    // stability, sensitivity, tolerance tuned lightly for our use-case
    lethargyRef.current = new Lethargy(7, 100, 0.05);
  }
  // Cooldown after zoom to avoid immediate misclassification of tiny trackpad pans
  const lastZoomTsRef = useRef(0);
  const POST_ZOOM_COOLDOWN_MS = 160;
  const SMALL_PIXEL_DELTA_Y = 1.6; // very small pixel scrolls likely pan noise

  // Improved trackpad vs mouse wheel detection based on industry patterns
  // Returns one of: 'trackpad', 'trackpad_inertia', 'mouse', 'mouse_wheel', 'undetermined'
  const analyzeInputDevice = (deltaX, deltaY, deltaMode = 0, wheelDeltaY = 0, rawDeltaY = 0) => {
    // Add current deltas to history
    deltaHistoryRef.current.unshift({ deltaX, deltaY, deltaMode, wheelDeltaY, rawDeltaY, timestamp: Date.now() });
    if (deltaHistoryRef.current.length > DELTA_HISTORY_SIZE) {
      deltaHistoryRef.current.pop();
    }

    // Clear history after timeout
    if (deltaTimeoutRef.current) clearTimeout(deltaTimeoutRef.current);
    deltaTimeoutRef.current = setTimeout(() => {
      deltaHistoryRef.current = [];
    }, DELTA_TIMEOUT);

    // Need at least 3 samples for reliable detection
    if (deltaHistoryRef.current.length < 3) {
      return 'undetermined';
    }

    const recentDeltas = deltaHistoryRef.current.slice(0, 6); // Use last 5-6 samples
    const deltaYValues = recentDeltas.map(d => Math.abs(d.deltaY)).filter(d => d > 0);
    
    if (deltaYValues.length === 0) return 'undetermined';

    // Trackpad indicators (based on research from GitHub issue):
    // 1. Fractional delta values (trackpads often produce non-integer deltas)
    const hasFractionalDeltas = deltaYValues.some(d => d % 1 !== 0);
    
    // 2. Horizontal movement (trackpads support 2D scrolling) - LOWERED threshold
    const hasHorizontalMovement = Math.abs(deltaX) > 0.05; // Reduced from 0.1
    
    // 3. Small, continuous values (trackpads produce smaller, more frequent events)
    const hasSmallDeltas = deltaYValues.every(d => d < 50);
    const hasVariedDeltas = deltaYValues.length > 1 && 
      Math.max(...deltaYValues) - Math.min(...deltaYValues) > deltaYValues[0] * 0.1;

    // 4. Mouse wheel indicators:
    // - Large, discrete values (often multiples of 120, 100, or other fixed amounts)
    // - Integer values
    // - Consistent patterns (same value repeated or simple multiples)
    const hasLargeDeltas = deltaYValues.some(d => d >= 50);
    const allIntegerDeltas = deltaYValues.every(d => d % 1 === 0);
    
    // Check for mouse wheel patterns (repeated values or simple ratios)
    let hasMouseWheelPattern = false;
    if (deltaYValues.length >= 2 && allIntegerDeltas) {
      const uniqueValues = [...new Set(deltaYValues)];
      if (uniqueValues.length <= 2) {
        hasMouseWheelPattern = true; // Repeated values
      } else {
        // Check for simple ratios (1.5x, 2x, 3x, etc.)
        const ratios = [];
        for (let i = 1; i < deltaYValues.length; i++) {
          if (deltaYValues[i-1] > 0 && deltaYValues[i] > 0) {
            ratios.push(deltaYValues[i] / deltaYValues[i-1]);
          }
        }
        const simpleRatios = [0.25, 0.5, 0.67, 1.0, 1.5, 2.0, 3.0, 4.0];
        hasMouseWheelPattern = ratios.some(ratio => 
          simpleRatios.some(simple => Math.abs(ratio - simple) < 0.1)
        );
      }
    }

    // 5. Event frequency and inertia profile
    const timestamps = recentDeltas.map(d => d.timestamp);
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(Math.max(0, timestamps[i-1] - timestamps[i]));
    }
    const avgInterval = intervals.length ? intervals.reduce((a,b) => a + b, 0) / intervals.length : 0;
    const isHighFrequency = avgInterval > 0 && avgInterval <= 20; // ~50 Hz or faster → trackpad-like

    // Inertial decaying pattern: magnitudes generally decreasing over recent samples
    let isDecaying = false;
    if (deltaYValues.length >= 4) {
      let decays = 0;
      for (let i = 1; i < Math.min(deltaYValues.length, 5); i++) {
        if (deltaYValues[i] <= deltaYValues[i-1] * 1.05) decays++;
      }
      isDecaying = decays >= 2;
    }

    // Strong early signals based on browser-level fields
    // 1) If deltamode is lines/pages, it's a mouse wheel
    if (deltaMode === 1 || deltaMode === 2) {
      return 'mouse_wheel';
    }
    // 2) Heuristic from StackOverflow: wheelDeltaY vs deltaY relationship and 120-step multiples
    // Use as a bias signal, not an absolute decision
    let biasMouseWheel = false;
    if (typeof wheelDeltaY === 'number' && wheelDeltaY !== 0) {
      const absWheel = Math.abs(wheelDeltaY);
      // Exact relation often seen on trackpads: wheelDeltaY === rawDeltaY * -3 (browser dependent)
      if (rawDeltaY && wheelDeltaY === rawDeltaY * -3) {
        // Strong bias toward trackpad
        biasMouseWheel = false;
      } else if (absWheel >= 120 && absWheel % 120 === 0) {
        // Typical mouse wheels report multiples of 120 per notch
        biasMouseWheel = true;
      }
    }

    // Decision logic (prioritized)
    if (hasHorizontalMovement && !hasLargeDeltas) {
      return 'trackpad'; // Strong indicator: 2D scrolling with small deltas
    }
    
    if (hasFractionalDeltas && hasSmallDeltas) {
      return 'trackpad'; // Strong indicator: fractional + small values
    }
    
    // On Mac, small or fractional deltas + high frequency or horizontal drift → trackpad
    if (isMac && (hasSmallDeltas || hasFractionalDeltas) && (isHighFrequency || hasHorizontalMovement) && !hasMouseWheelPattern) {
      return 'trackpad';
    }

    // Inertial flick: require large deltas, pixel mode, decaying series, AND either fractional deltas or horizontal drift
    if (isMac && hasLargeDeltas && isDecaying && !hasMouseWheelPattern && deltaMode === 0 && (hasFractionalDeltas || hasHorizontalMovement)) {
      return 'trackpad_inertia';
    }
    
    if ((hasMouseWheelPattern && hasLargeDeltas && allIntegerDeltas) || biasMouseWheel) {
      return 'mouse'; // Strong indicator or bias toward discrete wheel
    }

    // Additional bias: integer-only deltas with negligible horizontal drift → mouse
    if (allIntegerDeltas && !hasHorizontalMovement) {
      return 'mouse';
    }
    
    if (hasSmallDeltas && hasVariedDeltas && !allIntegerDeltas) {
      return 'trackpad'; // Moderate indicator: varied small fractional values
    }
    
    if (hasLargeDeltas && allIntegerDeltas) {
      return 'mouse'; // Moderate indicator: large integer values
    }

    return 'undetermined';
  };

  const handleWheel = async (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Maintain a lock per continuous stream of wheel events
    const nowTs = performance.now();
    if (nowTs - (wheelStreamRef.current.lastTimestamp || 0) > WHEEL_STREAM_GAP_MS) {
      wheelStreamRef.current.lockedType = null;
      wheelStreamRef.current.mouseEvidence = 0;
      wheelStreamRef.current.trackpadEvidence = 0;
      wheelStreamRef.current.candidate = { type: null, count: 0 };
      // Reset history between streams to avoid cross-gesture contamination
      deltaHistoryRef.current = [];
    }
    wheelStreamRef.current.lastTimestamp = nowTs;

    let deltaY = e.deltaY;
    if (e.deltaMode === 1) { deltaY *= 33; } 
    else if (e.deltaMode === 2) { deltaY *= window.innerHeight; }
    let deltaX = e.deltaX;
    if (e.deltaMode === 1) { deltaX *= 33; }
    else if (e.deltaMode === 2) { deltaX *= window.innerWidth; } 

    // Analyze input device type
    const candidateType = analyzeInputDevice(deltaX, deltaY, e.deltaMode, e.wheelDeltaY ?? 0, e.deltaY ?? 0);
    // Lethargy check: returns 1/-1 for intentional wheel, false for inertial flick/nuance
    let lethargySense = null;
    try { lethargySense = lethargyRef.current?.check(e); } catch {}
    // Per-stream lock: only consider Lethargy for mouse wheel when there is negligible horizontal motion
    if (!wheelStreamRef.current.lockedType && (lethargySense === 1 || lethargySense === -1) && Math.abs(deltaX) < 0.15) {
      wheelStreamRef.current.lockedType = 'mouse_wheel';
    }

    // Evidence-based locking to stabilize fast wheel bursts
    const absWheel = Math.abs(e.wheelDeltaY || 0);
    if (absWheel >= 120 && absWheel % 120 === 0 && Math.abs(deltaX) < 0.05) {
      wheelStreamRef.current.mouseEvidence = (wheelStreamRef.current.mouseEvidence || 0) + 1;
    }
    if (Math.abs(deltaX) < 0.03) {
      wheelStreamRef.current.mouseEvidence = (wheelStreamRef.current.mouseEvidence || 0) + 1;
    }
    const fractionalPresent = ((Math.abs(e.deltaY) % 1) !== 0) || ((Math.abs(e.deltaX) % 1) !== 0);
    const hasHorizontalDriftStrong = Math.abs(deltaX) > 0.2;
    const hasHorizontalDriftMild = Math.abs(deltaX) > 0.08;
    if (!e.ctrlKey && e.deltaMode === 0 && (hasHorizontalDriftStrong || (fractionalPresent && hasHorizontalDriftMild))) {
      wheelStreamRef.current.trackpadEvidence = (wheelStreamRef.current.trackpadEvidence || 0) + 1;
    }
    if (!wheelStreamRef.current.lockedType) {
      if ((wheelStreamRef.current.mouseEvidence || 0) >= 2) {
        wheelStreamRef.current.lockedType = 'mouse_wheel';
      } else if ((wheelStreamRef.current.trackpadEvidence || 0) >= 2) {
        wheelStreamRef.current.lockedType = 'trackpad';
      }
    }
    // Otherwise, require two consistent samples before locking
    if (!wheelStreamRef.current.lockedType) {
      wheelStreamRef.current.candidate = wheelStreamRef.current.candidate || { type: null, count: 0 };
      const normType = (candidateType === 'mouse' || candidateType === 'mouse_wheel' || e.deltaMode === 1 || e.deltaMode === 2) ? 'mouse_wheel'
                       : (candidateType === 'trackpad' || candidateType === 'trackpad_inertia') ? 'trackpad'
                       : 'undetermined';
      if (normType !== 'undetermined') {
        if (wheelStreamRef.current.candidate.type === normType) {
          wheelStreamRef.current.candidate.count += 1;
        } else {
          wheelStreamRef.current.candidate.type = normType;
          wheelStreamRef.current.candidate.count = 1;
        }
        if (wheelStreamRef.current.candidate.count >= 2) {
          wheelStreamRef.current.lockedType = wheelStreamRef.current.candidate.type;
        }
      }
    }
    let deviceType = wheelStreamRef.current.lockedType || candidateType;
    // Strong pan override: pixel-mode, no ctrl/meta, require meaningful horizontal drift
    if (!e.ctrlKey && e.deltaMode === 0 && (hasHorizontalDriftStrong || (fractionalPresent && hasHorizontalDriftMild))) {
      deviceType = 'trackpad';
      if (!wheelStreamRef.current.lockedType) wheelStreamRef.current.lockedType = 'trackpad';
    }

    // Post-zoom cooldown bias: shortly after zoom, tiny pixel-mode deltas skew to pan unless strong mouse evidence
    const withinZoomCooldown = (nowTs - (lastZoomTsRef.current || 0)) < POST_ZOOM_COOLDOWN_MS;
    const strongMouseEvidence = (lethargySense === 1 || lethargySense === -1) || ((Math.abs(e.wheelDeltaY || 0) >= 120) && (Math.abs(e.wheelDeltaY || 0) % 120 === 0));
    if (!e.ctrlKey && e.deltaMode === 0 && withinZoomCooldown && Math.abs(deltaY) <= SMALL_PIXEL_DELTA_Y && Math.abs(deltaX) < 0.15 && !strongMouseEvidence) {
      deviceType = 'trackpad';
      wheelStreamRef.current.trackpadEvidence = (wheelStreamRef.current.trackpadEvidence || 0) + 1;
      if (!wheelStreamRef.current.lockedType && wheelStreamRef.current.trackpadEvidence >= 2) {
        wheelStreamRef.current.lockedType = 'trackpad';
      }
    }

    setDebugData((prev) => ({
      ...prev,
      info: 'Wheel event',
      rawDeltaX: e.deltaX.toFixed(2),
      rawDeltaY: e.deltaY.toFixed(2),
      ctrlKey: e.ctrlKey.toString(),
      isMac: isMac.toString(),
      deltaMode: e.deltaMode.toString(),
      wheelDeltaY: (e.wheelDeltaY || 0).toFixed(2),
      detectedDevice: deviceType,
      detectedDeviceCandidate: candidateType,
      lethargySense: String(lethargySense),
      deviceLock: wheelStreamRef.current.lockedType || 'none',
      mouseEvidence: String(wheelStreamRef.current.mouseEvidence || 0),
      trackpadEvidence: String(wheelStreamRef.current.trackpadEvidence || 0),
      historyLength: deltaHistoryRef.current.length.toString(),
    }));

    // 1. Mac Pinch-to-Zoom (Ctrl key pressed) - always zoom regardless of device
    if (isMac && e.ctrlKey) {
        e.stopPropagation();
        isPanningOrZooming.current = true;
        const zoomDelta = deltaY * TRACKPAD_ZOOM_SENSITIVITY;
        const currentZoomForWorker = zoomLevel;
        const currentPanOffsetForWorker = panOffset;
        const opId = ++zoomOpIdRef.current;
        try {
          const result = await canvasWorker.calculateZoom({
            deltaY: zoomDelta, 
            currentZoom: currentZoomForWorker,
            mousePos: { x: mouseX, y: mouseY },
            panOffset: currentPanOffsetForWorker, 
            viewportSize, canvasSize, MIN_ZOOM, MAX_ZOOM,
          });
          if (opId === zoomOpIdRef.current) {
          setPanOffset(result.panOffset);
          setZoomLevel(result.zoomLevel);
          }
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
          // Clear the flag after a delay
          setTimeout(() => { 
            if (opId === zoomOpIdRef.current) {
              isPanningOrZooming.current = false; 
            }
          }, 100);
        } catch (error) {
          console.error('Mac pinch zoom calculation failed:', error);
          setDebugData((prev) => ({ ...prev, info: 'Mac pinch zoom error', error: error.message }));
          isPanningOrZooming.current = false;
        }
        return; // Processed
    }

    // If the carousel is visible, block all other wheel events from this point on
    if (abstractionCarouselVisible) return;

    // 2. Trackpad Two-Finger Pan (based on device detection)
    if (deviceType === 'trackpad' || deviceType === 'trackpad_inertia' || (deviceType === 'undetermined' && isMac && (Math.abs(deltaX) > 0.05 || (Math.abs(deltaY) < 30 && Math.abs(deltaX) > 0)))) {
        e.stopPropagation();
        isPanningOrZooming.current = true;
        const dx = -deltaX * PAN_DRAG_SENSITIVITY;
        const dy = -deltaY * PAN_DRAG_SENSITIVITY;
        
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
            inputDevice: 'Trackpad',
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
        // Clear the flag after a delay
        setTimeout(() => { isPanningOrZooming.current = false; }, 100);
        return; // Processed
    }

    // 3. Mouse Wheel Zoom (based on device detection or fallback)
    if (deviceType === 'mouse' || deviceType === 'mouse_wheel' || (deviceType === 'undetermined' && deltaY !== 0 && Math.abs(deltaX) < 0.15)) {
        e.stopPropagation();
        isPanningOrZooming.current = true;
        const zoomDelta = deltaY * SMOOTH_MOUSE_WHEEL_ZOOM_SENSITIVITY; 
        const currentZoomForWorker = zoomLevel;
        const currentPanOffsetForWorker = panOffset;
        const opId = ++zoomOpIdRef.current;
        try {
            const result = await canvasWorker.calculateZoom({
                deltaY: zoomDelta, 
                currentZoom: currentZoomForWorker,
                mousePos: { x: mouseX, y: mouseY },
                panOffset: currentPanOffsetForWorker, 
                viewportSize, canvasSize, MIN_ZOOM, MAX_ZOOM,
            });
            // Drop stale results (older ops) to avoid "ghost frames"
            if (opId === zoomOpIdRef.current) {
            setPanOffset(result.panOffset);
            setZoomLevel(result.zoomLevel);
              lastZoomTsRef.current = nowTs;
            }
            setDebugData((prev) => ({
                ...prev,
                inputDevice: 'Mouse Wheel',
                gesture: 'wheel-zoom',
                zooming: true,
                panning: false,
                sensitivity: SMOOTH_MOUSE_WHEEL_ZOOM_SENSITIVITY,
                deltaY: deltaY.toFixed(2),
                zoomLevel: result.zoomLevel.toFixed(2),
                panOffsetX: result.panOffset.x.toFixed(2),
                panOffsetY: result.panOffset.y.toFixed(2),
            }));
            // Clear the flag after a delay
            setTimeout(() => { 
              if (opId === zoomOpIdRef.current) {
                isPanningOrZooming.current = false; 
              }
            }, 100);
        } catch (error) {
            console.error('Wheel zoom calculation failed:', error);
            setDebugData((prev) => ({ ...prev, info: 'Wheel zoom error', error: error.message }));
            isPanningOrZooming.current = false;
        }
        return; // Processed
    }

    // 4. Fallback for truly unhandled events
    if (deltaY !== 0 || deltaX !== 0) {
      setDebugData((prev) => ({
        ...prev,
        inputDevice: 'Unhandled Input',
        gesture: 'unprocessed',
        zooming: false,
        panning: false,
        deltaX: deltaX.toFixed(2),
        deltaY: deltaY.toFixed(2),
      }));
      // console.warn('Unhandled wheel event:', { deltaX, deltaY, deviceType, ctrlKey: e.ctrlKey, isMac });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const preventDefaultWheel = (e) => { 
        // Allow wheel events over panel tab bars
        const isOverPanelTabBar = e.target.closest('[data-panel-tabs="true"]');
        if (!isOverPanelTabBar) {
          e.preventDefault(); 
        }
      };
      container.addEventListener('wheel', preventDefaultWheel, { passive: false });
      return () => container.removeEventListener('wheel', preventDefaultWheel);
    }
  }, []);

  // --- Clean routing helpers (orthogonal, low-bend path with simple detours) ---
  // Inflate a rectangle by padding
  const inflateRect = (rect, pad) => ({
    minX: rect.minX - pad,
    minY: rect.minY - pad,
    maxX: rect.maxX + pad,
    maxY: rect.maxY + pad,
  });

  // Check if a single segment intersects any rect (using existing lineIntersectsRect)
  const segmentIntersectsAnyRect = (x1, y1, x2, y2, rects) => {
    for (let i = 0; i < rects.length; i++) {
      if (lineIntersectsRect(x1, y1, x2, y2, rects[i])) return true;
    }
    return false;
  };

  // Build a rounded SVG path from ordered polyline points
  const buildRoundedPathFromPoints = (pts, r = 8) => {
    if (!pts || pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      // For first and last segments, just draw straight line; corners handled via quadratic joins
      if (i < pts.length - 1) {
        const next = pts[i + 1];
        // Determine the approach point before the corner and the exit point after the corner
        // Move back from curr by radius along prev->curr, and forward from curr by radius along curr->next
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        const backX = curr.x - Math.sign(dx1) * r;
        const backY = curr.y - Math.sign(dy1) * r;
        const fwdX = curr.x + Math.sign(dx2) * r;
        const fwdY = curr.y + Math.sign(dy2) * r;
        d += ` L ${backX},${backY} Q ${curr.x},${curr.y} ${fwdX},${fwdY}`;
      } else {
        d += ` L ${curr.x},${curr.y}`;
      }
    }
    return d;
  };

  // --- Edge label placement helpers ---
  // Estimate text width heuristically for label fit checks
  const estimateTextWidth = (text, fontSize = 24) => {
    // Rough average width per character ~0.55 * fontSize for typical sans fonts
    const avgCharWidth = fontSize * 0.55;
    return Math.max(16, text.length * avgCharWidth);
  };

  // Build inflated obstacle rects from visible nodes to avoid placing labels over nodes
  const getVisibleObstacleRects = (pad = 18) => {
    const rects = [];
    for (const node of nodes) {
      if (!visibleNodeIds.has(node.id)) continue;
      const dims = baseDimsById.get(node.id);
      if (!dims) continue;
      const rect = {
        minX: node.x,
        minY: node.y,
        maxX: node.x + dims.currentWidth,
        maxY: node.y + dims.currentHeight,
      };
      rects.push(inflateRect(rect, pad));
    }
    return rects;
  };

  // Compute distance from a point to a rect (outside-only, 0 if inside)
  const pointToRectDistance = (x, y, rect) => {
    const dx = Math.max(rect.minX - x, 0, x - rect.maxX);
    const dy = Math.max(rect.minY - y, 0, y - rect.maxY);
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Check if axis-aligned label rect intersects any obstacle rect
  const rectIntersectsAny = (rect, obstacles) => {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const sep = rect.maxX < o.minX || rect.minX > o.maxX || rect.maxY < o.minY || rect.minY > o.maxY;
      if (!sep) return true;
    }
    return false;
  };

  // Global label registry to track placed labels and avoid overlaps
  const placedLabelsRef = useRef(new Map()); // edgeId -> { rect, position }

  // Clear placed labels when visible edges change
  useEffect(() => {
    placedLabelsRef.current = new Map();
  }, [visibleEdges]);

  // Advanced label placement system with stacking and side placement
  const chooseLabelPlacement = (pathPoints, connectionName, fontSize = 24, edgeId = null) => {
    const obstacles = getVisibleObstacleRects(18);
    const textWidth = estimateTextWidth(connectionName, fontSize);
    const textHeight = fontSize * 1.1;
    
    // Add existing labels as obstacles
    const allObstacles = [...obstacles];
    if (placedLabelsRef.current.size > 0) {
      placedLabelsRef.current.forEach((labelData, id) => {
        if (id !== edgeId) { // Don't avoid our own label
          allObstacles.push(labelData.rect);
        }
      });
    }
    
    // Strategy 1: Try to place on the path itself
    const pathPlacement = tryPathPlacement(pathPoints, textWidth, textHeight, allObstacles);
    if (pathPlacement) return pathPlacement;
    
    // Strategy 2: Try parallel placement alongside the path
    const parallelPlacement = tryParallelPlacement(pathPoints, textWidth, textHeight, allObstacles);
    if (parallelPlacement) return parallelPlacement;
    
    // Strategy 3: Try perpendicular placement at midpoint
    const perpendicularPlacement = tryPerpendicularPlacement(pathPoints, textWidth, textHeight, allObstacles);
    if (perpendicularPlacement) return perpendicularPlacement;
    
    // Strategy 4: Try stacking with similar direction labels
    const stackedPlacement = tryStackedPlacement(pathPoints, textWidth, textHeight, allObstacles, edgeId);
    if (stackedPlacement) return stackedPlacement;
    
    // Fallback: midpoint with best available offset
    return getFallbackPlacement(pathPoints, textWidth, textHeight, allObstacles);
  };

  // Try to place label directly on the path (horizontal segments preferred)
  const tryPathPlacement = (pathPoints, textWidth, textHeight, obstacles) => {
    const candidates = [];
    const minSegmentLength = Math.max(64, textWidth + 24);
    
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const a = pathPoints[i];
      const b = pathPoints[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy);
      
      if (segLen < minSegmentLength) continue;
      
      const isHorizontal = Math.abs(dy) < 0.5;
      const isVertical = Math.abs(dx) < 0.5;
      
      // Prefer horizontal, then vertical, then diagonal
      let priority = 0;
      let angle = 0;
      if (isHorizontal) {
        priority = 3;
        angle = 0;
      } else if (isVertical) {
        priority = 2;
        angle = 90;
      } else {
        priority = 1;
        angle = Math.atan2(dy, dx) * (180 / Math.PI);
      }
      
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      
      // Try small offsets perpendicular to the segment
      const perpX = -dy / segLen; // perpendicular unit vector
      const perpY = dx / segLen;
      
      const offsets = [0, 12, -12, 24, -24];
      for (const offset of offsets) {
        const testX = cx + perpX * offset;
        const testY = cy + perpY * offset;
        
        const rect = {
          minX: testX - textWidth / 2,
          maxX: testX + textWidth / 2,
          minY: testY - textHeight / 2,
          maxY: testY + textHeight / 2,
        };
        
        if (!rectIntersectsAny(rect, obstacles)) {
          const score = priority * 100 + segLen - Math.abs(offset);
          candidates.push({ x: testX, y: testY, angle, score });
        }
      }
    }
    
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0];
    }
    
    return null;
  };

  // Try to place label parallel to the overall path direction, offset to the side
  const tryParallelPlacement = (pathPoints, textWidth, textHeight, obstacles) => {
    if (pathPoints.length < 2) return null;
    
    const start = pathPoints[0];
    const end = pathPoints[pathPoints.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    
    if (length < 10) return null;
    
    const dirX = dx / length;
    const dirY = dy / length;
    const perpX = -dirY; // perpendicular
    const perpY = dirX;
    
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Try different parallel offsets
    const offsets = [40, -40, 60, -60, 80, -80];
    for (const offset of offsets) {
      const testX = midX + perpX * offset;
      const testY = midY + perpY * offset;
      
      const rect = {
        minX: testX - textWidth / 2,
        maxX: testX + textWidth / 2,
        minY: testY - textHeight / 2,
        maxY: testY + textHeight / 2,
      };
      
      if (!rectIntersectsAny(rect, obstacles)) {
        return { x: testX, y: testY, angle, score: 50 - Math.abs(offset) * 0.1 };
      }
    }
    
    return null;
  };
  // Try perpendicular placement (good for short connections)
  const tryPerpendicularPlacement = (pathPoints, textWidth, textHeight, obstacles) => {
    if (pathPoints.length < 2) return null;
    
    const start = pathPoints[0];
    const end = pathPoints[pathPoints.length - 1];
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    
    // Try horizontal placement above/below the midpoint
    const offsets = [30, -30, 50, -50, 70, -70];
    for (const offset of offsets) {
      const testX = midX;
      const testY = midY + offset;
      
      const rect = {
        minX: testX - textWidth / 2,
        maxX: testX + textWidth / 2,
        minY: testY - textHeight / 2,
        maxY: testY + textHeight / 2,
      };
      
      if (!rectIntersectsAny(rect, obstacles)) {
        return { x: testX, y: testY, angle: 0, score: 30 - Math.abs(offset) * 0.1 };
      }
    }
    
    return null;
  };

  // Try stacking with labels that have similar direction/axis
  const tryStackedPlacement = (pathPoints, textWidth, textHeight, obstacles, edgeId) => {
    if (pathPoints.length < 2 || placedLabelsRef.current.size === 0) return null;
    
    const start = pathPoints[0];
    const end = pathPoints[pathPoints.length - 1];
    const pathAngle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
    const normalizedAngle = ((pathAngle % 180) + 180) % 180; // 0-180 range
    
    // Find labels with similar direction (within 15 degrees)
    const similarLabels = [];
    placedLabelsRef.current.forEach((labelData, id) => {
      if (id === edgeId) return;
      const labelAngle = labelData.position.angle || 0;
      const normalizedLabelAngle = ((labelAngle % 180) + 180) % 180;
      const angleDiff = Math.min(
        Math.abs(normalizedAngle - normalizedLabelAngle),
        180 - Math.abs(normalizedAngle - normalizedLabelAngle)
      );
      
      if (angleDiff < 15) { // Similar direction
        similarLabels.push(labelData);
      }
    });
    
    if (similarLabels.length === 0) return null;
    
    // Try stacking near similar labels
    for (const similarLabel of similarLabels) {
      const stackOffsets = [
        { x: 0, y: textHeight + 8 },    // Stack below
        { x: 0, y: -(textHeight + 8) }, // Stack above
        { x: textWidth + 12, y: 0 },    // Stack right
        { x: -(textWidth + 12), y: 0 }  // Stack left
      ];
      
      for (const offset of stackOffsets) {
        const testX = similarLabel.position.x + offset.x;
        const testY = similarLabel.position.y + offset.y;
        
        const rect = {
          minX: testX - textWidth / 2,
          maxX: testX + textWidth / 2,
          minY: testY - textHeight / 2,
          maxY: testY + textHeight / 2,
        };
        
        if (!rectIntersectsAny(rect, obstacles)) {
          return { 
            x: testX, 
            y: testY, 
            angle: similarLabel.position.angle || 0, 
            score: 40 - Math.abs(offset.x) * 0.05 - Math.abs(offset.y) * 0.05 
          };
        }
      }
    }
    
    return null;
  };

  // Fallback placement at path midpoint with best available offset
  const getFallbackPlacement = (pathPoints, textWidth, textHeight, obstacles) => {
    let totalLen = 0;
    const lens = [];
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const a = pathPoints[i];
      const b = pathPoints[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      lens.push(len);
      totalLen += len;
    }
    
    let t = totalLen / 2;
    let x = pathPoints[0]?.x || 0;
    let y = pathPoints[0]?.y || 0;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      if (t <= lens[i]) {
        const a = pathPoints[i];
        const b = pathPoints[i + 1];
        const u = lens[i] === 0 ? 0 : t / lens[i];
        x = a.x + (b.x - a.x) * u;
        y = a.y + (b.y - a.y) * u;
        break;
      } else {
        t -= lens[i];
      }
    }
    
    // Try various offsets to find the least problematic placement
    const offsets = [
      { x: 0, y: 0 }, { x: 0, y: -20 }, { x: 0, y: 20 },
      { x: -30, y: 0 }, { x: 30, y: 0 },
      { x: -25, y: -15 }, { x: 25, y: -15 },
      { x: -25, y: 15 }, { x: 25, y: 15 }
    ];
    
    for (const offset of offsets) {
      const testX = x + offset.x;
      const testY = y + offset.y;
      const rect = {
        minX: testX - textWidth / 2,
        maxX: testX + textWidth / 2,
        minY: testY - textHeight / 2,
        maxY: testY + textHeight / 2,
      };
      
      if (!rectIntersectsAny(rect, obstacles)) {
        return { x: testX, y: testY, angle: 0, score: 0 };
      }
    }
    
    // Ultimate fallback - just place it at midpoint
    return { x, y, angle: 0, score: 0 };
  };
  // Orthogonal routing with smart stem usage - use stems only when needed
  const computeCleanPolylineFromPorts = (start, end, obstacleRects, laneSpacing = 24, startSide = null, endSide = null) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // For short connections or when start/end are well-aligned, use minimal stems
    const isShortConnection = distance < 200;
    const isWellAligned = (startSide === 'right' && endSide === 'left' && Math.abs(dy) < 50) ||
                         (startSide === 'left' && endSide === 'right' && Math.abs(dy) < 50) ||
                         (startSide === 'bottom' && endSide === 'top' && Math.abs(dx) < 50) ||
                         (startSide === 'top' && endSide === 'bottom' && Math.abs(dx) < 50);
    
    let startStemLength, endStemLength;
    
    if (isShortConnection || isWellAligned) {
      // Use minimal stems for short or well-aligned connections
      startStemLength = 24;
      endStemLength = 24;
    } else {
      // Use staggered stems for longer connections to prevent overlap
      const stableEdgeHash = Math.abs((start.x * 31 + start.y * 17 + end.x * 13 + end.y * 7) % 97);
      const baseStemLength = Math.max(60, laneSpacing * 0.3);
      const stemVariation = (stableEdgeHash % 3) * 16; // 0, 16, 32px variations (reduced)
      startStemLength = baseStemLength + stemVariation;
      endStemLength = baseStemLength + ((stableEdgeHash + 1) % 3) * 16;
    }
    
    // Create stem points that exit orthogonally from the node edges at staggered distances
    let stemStart, stemEnd;
    
    if (startSide) {
      // Create orthogonal stem from start port with staggered length
      switch (startSide) {
        case 'top':
          stemStart = { x: start.x, y: start.y - startStemLength };
          break;
        case 'bottom':
          stemStart = { x: start.x, y: start.y + startStemLength };
          break;
        case 'left':
          stemStart = { x: start.x - startStemLength, y: start.y };
          break;
        case 'right':
          stemStart = { x: start.x + startStemLength, y: start.y };
          break;
        default:
          stemStart = start;
      }
    } else {
      stemStart = start;
    }
    
    if (endSide) {
      // Create orthogonal stem to end port with staggered length
      switch (endSide) {
        case 'top':
          stemEnd = { x: end.x, y: end.y - endStemLength };
          break;
        case 'bottom':
          stemEnd = { x: end.x, y: end.y + endStemLength };
          break;
        case 'left':
          stemEnd = { x: end.x - endStemLength, y: end.y };
          break;
        case 'right':
          stemEnd = { x: end.x + endStemLength, y: end.y };
          break;
        default:
          stemEnd = end;
      }
    } else {
      stemEnd = end;
    }
    
    // Route between stem points using simple L/Z logic
    const stemDx = stemEnd.x - stemStart.x;
    const stemDy = stemEnd.y - stemStart.y;
    const preferHorizontal = Math.abs(stemDx) >= Math.abs(stemDy);
    
    let midPath;
    if (Math.abs(stemDx) < 1 && Math.abs(stemDy) < 1) {
      // Stems are very close - direct connection
      midPath = [stemStart, stemEnd];
    } else if (preferHorizontal) {
      // Horizontal-first L path between stems
      midPath = [stemStart, { x: stemEnd.x, y: stemStart.y }, stemEnd];
    } else {
      // Vertical-first L path between stems
      midPath = [stemStart, { x: stemStart.x, y: stemEnd.y }, stemEnd];
    }
    
    // Assemble full path: start -> stem -> route -> stem -> end
    const fullPath = [];
    
    // Add start segment if we have a stem
    if (startSide && stemStart && (stemStart.x !== start.x || stemStart.y !== start.y)) {
      fullPath.push(start, stemStart);
    } else {
      fullPath.push(start);
    }
    
    // Add middle routing (skip first point if it's the same as last added point)
    for (let i = 0; i < midPath.length; i++) {
      const point = midPath[i];
      const lastPoint = fullPath[fullPath.length - 1];
      // Only add if it's different from the last point
      if (!lastPoint || point.x !== lastPoint.x || point.y !== lastPoint.y) {
        fullPath.push(point);
      }
    }
    
    // Add end segment if we have a stem and it's different from the last point
    if (endSide && stemEnd && (stemEnd.x !== end.x || stemEnd.y !== end.y)) {
      const lastPoint = fullPath[fullPath.length - 1];
      if (!lastPoint || lastPoint.x !== end.x || lastPoint.y !== end.y) {
        fullPath.push(end);
      }
    }
    
    return fullPath;
  };



  // Deterministic tiny lane offset to reduce parallel overlaps for clean routing
  const hashString = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  };



  // --- Mouse Drag Panning (unchanged) ---
  // Throttle edge-hover detection to reduce per-frame work
  const lastHoverCheckRef = useRef(0);
  const HOVER_CHECK_INTERVAL_MS = 24; // ~40 Hz

  const handleMouseMove = async (e) => {
    if (isPaused || !activeGraphId) return;
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
    const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
    const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);

    // Edge hover detection (only when not dragging/panning)
    if (!isMouseDown.current && !draggingNodeInfo && !isPanning) {
      const now = performance.now();
      if (now - lastHoverCheckRef.current >= HOVER_CHECK_INTERVAL_MS) {
        lastHoverCheckRef.current = now;
      // Check if mouse is over any node first
        const hoveredNode = nodes.find(node => visibleNodeIds.has(node.id) && isInsideNode(node, e.clientX, e.clientY));
      if (!hoveredNode) {
          // Search only among visible edges in REVERSE order to match z-axis (last rendered = top)
        let foundHoveredEdgeInfo = null;
        let closestDistance = Infinity;
          for (let i = visibleEdges.length - 1; i >= 0; i--) {
            const edge = visibleEdges[i];
            const sourceNode = nodeById.get(edge.sourceId);
            const destNode = nodeById.get(edge.destinationId);
            if (!sourceNode || !destNode) continue;
            const sDims = baseDimsById.get(sourceNode.id);
            const dDims = baseDimsById.get(destNode.id);
            if (!sDims || !dDims) continue;
            const isSPrev = previewingNodeId === sourceNode.id;
            const isDPrev = previewingNodeId === destNode.id;
            const x1 = sourceNode.x + sDims.currentWidth / 2;
            const y1 = sourceNode.y + (isSPrev ? NODE_HEIGHT / 2 : sDims.currentHeight / 2);
            const x2 = destNode.x + dDims.currentWidth / 2;
            const y2 = destNode.y + (isDPrev ? NODE_HEIGHT / 2 : dDims.currentHeight / 2);
            
            let distance = Infinity;
            
            // Use different hover detection based on routing mode
            if (enableAutoRouting && routingStyle === 'clean') {
              // Clean routing: check against the actual orthogonal path using consistent helper
              const pathPoints = generateCleanRoutingPath(edge, sourceNode, destNode, sDims, dDims);
              
              // Check distance to each segment of the path
              let minSegmentDistance = Infinity;
              for (let i = 0; i < pathPoints.length - 1; i++) {
                const segStart = pathPoints[i];
                const segEnd = pathPoints[i + 1];
                
                const A = currentX - segStart.x;
                const B = currentY - segStart.y;
                const C = segEnd.x - segStart.x;
                const D = segEnd.y - segStart.y;
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                
                if (lenSq > 0) {
                  let param = dot / lenSq;
                  if (param < 0) param = 0;
                  else if (param > 1) param = 1;
                  const xx = segStart.x + param * C;
                  const yy = segStart.y + param * D;
                  const dx = currentX - xx;
                  const dy = currentY - yy;
                  const segDistance = Math.sqrt(dx * dx + dy * dy);
                  minSegmentDistance = Math.min(minSegmentDistance, segDistance);
                }
              }
              distance = minSegmentDistance;
            } else if (enableAutoRouting && routingStyle === 'manhattan') {
              // Manhattan routing: use the exact same path generation as rendering
              const pathPoints = generateManhattanRoutingPath(edge, sourceNode, destNode, sDims, dDims);
              
              // Check distance to each segment of the Manhattan path
              let minSegmentDistance = Infinity;
              for (let i = 0; i < pathPoints.length - 1; i++) {
                const segStart = pathPoints[i];
                const segEnd = pathPoints[i + 1];
                
                const A = currentX - segStart.x;
                const B = currentY - segStart.y;
                const C = segEnd.x - segStart.x;
                const D = segEnd.y - segStart.y;
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                
                if (lenSq > 0) {
                  let param = dot / lenSq;
                  if (param < 0) param = 0;
                  else if (param > 1) param = 1;
                  const xx = segStart.x + param * C;
                  const yy = segStart.y + param * D;
                  const dx = currentX - xx;
                  const dy = currentY - yy;
                  const segDistance = Math.sqrt(dx * dx + dy * dy);
                  minSegmentDistance = Math.min(minSegmentDistance, segDistance);
                }
              }
              distance = minSegmentDistance;
            } else {
              // Straight line routing: use simple straight-line distance
              const A = currentX - x1;
              const B = currentY - y1;
              const C = x2 - x1;
              const D = y2 - y1;
              const dot = A * C + B * D;
              const lenSq = C * C + D * D;
              if (lenSq > 0) {
                let param = dot / lenSq;
                if (param < 0) param = 0;
                else if (param > 1) param = 1;
                const xx = x1 + param * C;
                const yy = y1 + param * D;
                const dx = currentX - xx;
                const dy = currentY - yy;
                distance = Math.sqrt(dx * dx + dy * dy);
              }
            }
            
            // Use different thresholds based on routing mode
            const hoverThreshold = (enableAutoRouting && (routingStyle === 'manhattan' || routingStyle === 'clean')) ? 50 : 40;
            
            if (distance <= hoverThreshold && distance < closestDistance) {
              closestDistance = distance;
              foundHoveredEdgeInfo = { edgeId: edge.id };
              // For auto-routing modes, break on first match (top z-axis) to prevent wrong selection
              if (enableAutoRouting && (routingStyle === 'manhattan' || routingStyle === 'clean')) {
                break;
              }
            }
          }
        setHoveredEdgeInfo(foundHoveredEdgeInfo);
      } else {
        setHoveredEdgeInfo(null);
        }
      }
    }

    // Selection Box Logic
    if (selectionStart && isMouseDown.current) {
      e.preventDefault();
      try {
        const selectionRes = await canvasWorker.calculateSelection({ selectionStart, currentX, currentY });
        setSelectionRect(selectionRes);
        const currentIds = new Set();
        nodes.forEach(nd => {
          if (!(selectionRes.x > nd.x + getNodeDimensions(nd, previewingNodeId === nd.id, null).currentWidth ||
                selectionRes.x + selectionRes.width < nd.x ||
                selectionRes.y > nd.y + getNodeDimensions(nd, previewingNodeId === nd.id, null).currentHeight ||
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
        setSelectedInstanceIds(finalSelection);
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
        setHasMouseMovedSinceDown(true); // Set state for useEffect
        if (clickTimeoutIdRef.current) { clearTimeout(clickTimeoutIdRef.current); clickTimeoutIdRef.current = null; potentialClickNodeRef.current = null;}
        // REMOVED: setSelectedNodeIdForPieMenu(null); 

        // Start drawing connection ONLY if a long-press has been recognized
        if (longPressingInstanceId && !draggingNodeInfo) {
             const longPressNodeData = nodes.find(n => n.id === longPressingInstanceId); // Get data
             if (longPressNodeData && !isInsideNode(longPressNodeData, e.clientX, e.clientY)) {
                 clearTimeout(longPressTimeout.current);
                 mouseInsideNode.current = false;
                 const startNodeDims = getNodeDimensions(longPressNodeData, previewingNodeId === longPressNodeData.id, null);
                 const startPt = { x: longPressNodeData.x + startNodeDims.currentWidth / 2, y: longPressNodeData.y + startNodeDims.currentHeight / 2 };
                 const rect = containerRef.current.getBoundingClientRect();
                 const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
                 const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
                 const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);
                 setDrawingConnectionFrom({ sourceInstanceId: longPressingInstanceId, startX: startPt.x, startY: startPt.y, currentX, currentY });
                 setLongPressingInstanceId(null); // Clear ID
             }
        } else if (!draggingNodeInfo && !drawingConnectionFrom && !isPanning && !startedOnNode.current) {
          // Start panning after threshold exceeded
          isPanningOrZooming.current = true;
          setIsPanning(true);
          setPanStart({ x: e.clientX, y: e.clientY });
        }
      }
    }

    // Dragging Node Logic (only after long-press has set draggingNodeInfo)
    if (draggingNodeInfo) {
        requestAnimationFrame(() => { // Keep RAF
            // Multi-node drag
            if (draggingNodeInfo.relativeOffsets) {
                const primaryInstanceId = draggingNodeInfo.primaryId;
                const dx = (e.clientX - draggingNodeInfo.initialMouse.x) / zoomLevel;
                const dy = (e.clientY - draggingNodeInfo.initialMouse.y) / zoomLevel;
                let newPrimaryX = draggingNodeInfo.initialPrimaryPos.x + dx;
                let newPrimaryY = draggingNodeInfo.initialPrimaryPos.y + dy;

                // Apply smooth grid snapping to primary node
                if (gridMode !== 'off') {
                  const primaryNode = nodes.find(n => n.id === primaryInstanceId);
                  if (primaryNode) {
                    const dims = getNodeDimensions(primaryNode, false, null);
                    // Get mouse position in canvas coordinates
                    const mouseCanvasX = (e.clientX - panOffset.x) / zoomLevel;
                    const mouseCanvasY = (e.clientY - panOffset.y) / zoomLevel;
                    console.log('[Grid Snap] Multi-node drag - mouse pos:', { mouseCanvasX, mouseCanvasY, gridMode, gridSize });
                                         const snapped = snapToGridAnimated(mouseCanvasX, mouseCanvasY, dims.currentWidth, dims.currentHeight, { x: primaryNode.x, y: primaryNode.y });
                    console.log('[Grid Snap] Multi-node drag - after smooth snap:', { x: snapped.x, y: snapped.y, dims: dims.currentWidth + 'x' + dims.currentHeight });
                    newPrimaryX = snapped.x;
                    newPrimaryY = snapped.y;
                  }
                }

                const positionUpdates = [];
                positionUpdates.push({ instanceId: primaryInstanceId, x: newPrimaryX, y: newPrimaryY });

                Object.keys(draggingNodeInfo.relativeOffsets).forEach(instanceId => {
                    const relativeOffset = draggingNodeInfo.relativeOffsets[instanceId];
                    positionUpdates.push({
                        instanceId: instanceId,
                        x: newPrimaryX + relativeOffset.offsetX,
                        y: newPrimaryY + relativeOffset.offsetY
                    });
                });

                storeActions.updateMultipleNodeInstancePositions(activeGraphId, positionUpdates);

            } else {
                // Single node drag
                const { instanceId, offset } = draggingNodeInfo;
                const node = nodes.find(n => n.id === instanceId);
                if (node) {
                  const dims = getNodeDimensions(node, false, null);
                  
                  // Get mouse position in canvas coordinates
                  const mouseCanvasX = (e.clientX - panOffset.x) / zoomLevel;
                  const mouseCanvasY = (e.clientY - panOffset.y) / zoomLevel;
                  
                  let newX, newY;
                  
                  // Apply smooth grid snapping to single node
                  if (gridMode !== 'off') {
                    console.log('[Grid Snap] Single node drag - mouse pos:', { mouseCanvasX, mouseCanvasY, gridMode, gridSize });
                                         const snapped = snapToGridAnimated(mouseCanvasX, mouseCanvasY, dims.currentWidth, dims.currentHeight, { x: node.x, y: node.y });
                    console.log('[Grid Snap] Single node drag - after smooth snap:', { x: snapped.x, y: snapped.y, dims: dims.currentWidth + 'x' + dims.currentHeight });
                    newX = snapped.x;
                    newY = snapped.y;
                  } else {
                    // No grid snapping - use offset-based calculation
                    newX = mouseCanvasX - (offset.x / zoomLevel);
                    newY = mouseCanvasY - (offset.y / zoomLevel);
                  }

                  storeActions.updateNodeInstance(activeGraphId, instanceId, draft => {
                      draft.x = newX;
                      draft.y = newY;
                  });
                }
            }
        });
    } else if (drawingConnectionFrom) {
        const bounded = clampCoordinates(currentX, currentY);
        setDrawingConnectionFrom(prev => prev && ({ ...prev, currentX: bounded.x, currentY: bounded.y }));
    } else if (isPanning) {
        if (abstractionCarouselVisible) {
            setIsPanning(false);
            return;
        }
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

    // (Removed per-move extra smoothing to avoid double updates)
  };

  const handleMouseDown = (e) => {
    if (isPaused || !activeGraphId || abstractionCarouselVisible) return;
    // On touch/mobile: allow two-finger pan to bypass resizer/canvas checks
    if (e.touches && e.touches.length >= 2) {
      return;
    }
    // If user started on a resizer, do not start canvas panning
    if (isDraggingLeft.current || isDraggingRight.current) return;
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
    setHoveredEdgeInfo(null); // Clear edge hover when starting interaction
    setLastInteractionType('mouse_down');

    if ((isMac && e.metaKey) || (!isMac && e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      const rect = containerRef.current.getBoundingClientRect();
      const startX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const startY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      setSelectionStart({ x: startX, y: startY });
      setSelectionRect({ x: startX, y: startY, width: 0, height: 0 });
      selectionBaseRef.current = new Set([...selectedInstanceIds]);
      return;
    }
    setPanStart({ x: e.clientX, y: e.clientY });
    setIsPanning(true);
  };

  const handleMouseUp = (e) => {
    if (isPaused || !activeGraphId) return;
    clearTimeout(longPressTimeout.current);
    setLongPressingInstanceId(null); // Clear ID
    mouseInsideNode.current = false;

    // Finalize drawing connection
    if (drawingConnectionFrom) {
        const targetNodeData = nodes.find(n => isInsideNode(n, e.clientX, e.clientY));

        if (targetNodeData && targetNodeData.id !== drawingConnectionFrom.sourceInstanceId) {
            const sourceId = drawingConnectionFrom.sourceInstanceId;
            const destId = targetNodeData.id;

            // Check for existing edge in store's edges
            const exists = edges.some(edge =>
                (edge.sourceId === sourceId && edge.destinationId === destId) ||
                (edge.sourceId === destId && edge.destinationId === sourceId)
            );

            if (!exists) {
                const newEdgeId = uuidv4();
                const newEdgeData = { id: newEdgeId, sourceId, destinationId: destId };
                storeActions.addEdge(activeGraphId, newEdgeData);
            }
        }
        setDrawingConnectionFrom(null);
    }

    // Reset scale for dragged nodes
    if (draggingNodeInfo) {
        const instanceIdsToReset = new Set();
        if (draggingNodeInfo.relativeOffsets) {
            instanceIdsToReset.add(draggingNodeInfo.primaryId);
            Object.keys(draggingNodeInfo.relativeOffsets).forEach(id => instanceIdsToReset.add(id));
        } else if (draggingNodeInfo.instanceId) {
            instanceIdsToReset.add(draggingNodeInfo.instanceId);
        }
        instanceIdsToReset.forEach(id => {
            const nodeExists = nodes.some(n => n.id === id);
            if(nodeExists) {
                storeActions.updateNodeInstance(activeGraphId, id, draft => { draft.scale = 1; });
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
              .filter(nd => !(selectionRes.x > nd.x + getNodeDimensions(nd, previewingNodeId === nd.id, null).currentWidth ||
                                selectionRes.x + selectionRes.width < nd.x ||
                                selectionRes.y > nd.y + getNodeDimensions(nd, previewingNodeId === nd.id, null).currentHeight ||
                                selectionRes.y + selectionRes.height < nd.y))
              .map(nd => nd.id);
            setSelectedInstanceIds(prev => new Set([...prev, ...finalSelectedIds]));
          })
          .catch(error => console.error("Final selection calc failed:", error));
        ignoreCanvasClick.current = true;
        setSelectionStart(null);
        setSelectionRect(null);
    }

    // Finalize panning state
    if (isPanning && panStart) {
      // Inertia on release: continue motion briefly based on last deltas
      let vx = (e.clientX - panStart.x) * 0.14; // velocity scale tuned for feel
      let vy = (e.clientY - panStart.y) * 0.14;
      let remaining = 260; // ms decay duration
      const friction = 0.9; // decay factor per frame
      const step = () => {
        if (remaining <= 0) return;
        setPanOffset(prevOff => {
          const currentCanvasWidth = canvasSize.width * zoomLevel;
          const currentCanvasHeight = canvasSize.height * zoomLevel;
          const minX = viewportSize.width - currentCanvasWidth;
          const minY = viewportSize.height - currentCanvasHeight;
          const maxX = 0;
          const maxY = 0;
          const nx = Math.min(Math.max(prevOff.x + vx, minX), maxX);
          const ny = Math.min(Math.max(prevOff.y + vy, minY), maxY);
          return { x: nx, y: ny };
        });
        remaining -= 16;
        // decay velocity
        vx *= friction;
        vy *= friction;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    setIsPanning(false);
    isPanningOrZooming.current = false; // Clear the flag when panning ends
    isMouseDown.current = false;
    // It's important to reset mouseMoved.current here AFTER all logic that depends on it for this up-event is done.
    // setHasMouseMovedSinceDown is reset on the next mousedown.
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
    isPanningOrZooming.current = false; // Clear the flag when canvas mouse up
    setDraggingNodeInfo(null);
    setDrawingConnectionFrom(null);

    isMouseDown.current = false;
    // setHasMouseMovedSinceDown(false); // Reset on next mousedown
  };
  const handleCanvasClick = (e) => {
      if (wasDrawingConnection.current) {
          wasDrawingConnection.current = false;
          return;
      }
      if (isPieMenuActionInProgress) {
        return;
      }
      if (e.target.closest('g[data-plus-sign="true"]')) return;
      // Prevent canvas click when clicking on PieMenu elements
      if (e.target.closest('.pie-menu')) {
          return;
      }
      if (e.target.tagName !== 'svg' || !e.target.classList.contains('canvas')) return;
      if (isPaused || draggingNodeInfo || drawingConnectionFrom || mouseMoved.current || recentlyPanned || nodeNamePrompt.visible || !activeGraphId) {
          setLastInteractionType('blocked_click');
          return;
      }
      if (ignoreCanvasClick.current) { ignoreCanvasClick.current = false; return; }

      // DEFENSIVE: If carousel is visible but pie menu isn't, force close carousel
      if (abstractionCarouselVisible && !selectedNodeIdForPieMenu) {
        console.log(`[NodeCanvas] 🔧 DEFENSIVE: Carousel stuck without pie menu - force closing`);
        setAbstractionCarouselVisible(false);
        setAbstractionCarouselNode(null);
        setCarouselAnimationState('hidden');
        setCarouselPieMenuStage(1);
        setCarouselFocusedNode(null);
        setCarouselFocusedNodeDimensions(null);
        return;
      }

      // If carousel is visible and exiting, don't handle canvas clicks
      if (abstractionCarouselVisible && carouselAnimationState === 'exiting') {
        console.log(`[NodeCanvas] Carousel is exiting - ignoring canvas click`);
        return;
      }

      if (selectedInstanceIds.size > 0) {
          // Don't clear selection if we just completed a carousel exit
          if (justCompletedCarouselExit) {
            console.log(`[NodeCanvas] Skipping canvas click selection clear - just completed carousel exit`);
            return;
          }
          
          // Don't clear selection if carousel exit is in progress
          if (carouselExitInProgressRef.current) {
            console.log(`[NodeCanvas] Skipping canvas click selection clear - carousel exit in progress`);
            return;
          }
          
          console.log(`[NodeCanvas] 📍 CLEAR #3: Canvas click clearing selection of ${selectedInstanceIds.size} items`);
          setSelectedInstanceIds(new Set());
          // Pie menu will be handled by useEffect on selectedInstanceIds, no direct setShowPieMenu here
          return;
      }

      // Clear selected edge when clicking on empty canvas
      if (selectedEdgeId || selectedEdgeIds.size > 0) {
          setSelectedEdgeId(null);
          clearSelectedEdgeIds();
          return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      // Prevent plus sign if pie menu is active or about to become active
      if (!plusSign && selectedInstanceIds.size === 0) {
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
    
    // Calculate position for the node selection grid (below the dialog)
    const dialogTop = HEADER_HEIGHT + 25;
    const dialogHeight = 120; // Approximate height of the dialog
    const gridTop = dialogTop + dialogHeight + 10; // 10px spacing below dialog
    const dialogWidth = 300; // Match dialog width
    const gridLeft = window.innerWidth / 2 - dialogWidth / 2; // Center to match dialog
    
    setNodeSelectionGrid({ 
      visible: true, 
      position: { x: gridLeft, y: gridTop } 
    });
  };

  const handleClosePrompt = () => {
    if (!nodeNamePrompt.name.trim()) {
      setPlusSign(ps => ps && { ...ps, mode: 'disappear' });
    }
    setNodeNamePrompt({ visible: false, name: '', color: null });
    setNodeSelectionGrid({ visible: false, position: { x: 0, y: 0 } });
    setDialogColorPickerVisible(false); // Close color picker when closing prompt
  };

  // Helper function to interpolate between two colors
  const interpolateColor = (color1, color2, factor) => {
    // Simple color interpolation - convert hex to RGB, interpolate, convert back
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    
    const r1 = parseInt(hex1.substr(0, 2), 16);
    const g1 = parseInt(hex1.substr(2, 2), 16);
    const b1 = parseInt(hex1.substr(4, 2), 16);
    
    const r2 = parseInt(hex2.substr(0, 2), 16);
    const g2 = parseInt(hex2.substr(2, 2), 16);
    const b2 = parseInt(hex2.substr(4, 2), 16);
    
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };
  const handleAbstractionSubmit = ({ name, color }) => {
    console.log(`[Abstraction Submit] Called with:`, { name, color, promptState: abstractionPrompt });
    console.log(`[Abstraction Submit] Current abstractionCarouselNode:`, abstractionCarouselNode);
    console.log(`[Abstraction Submit] Looking for node with ID:`, abstractionPrompt.nodeId);
    
    if (name.trim() && abstractionPrompt.nodeId && abstractionCarouselNode) {
      // The nodeId could be either a canvas instance ID or a prototype ID (from focused carousel node)
      let currentlySelectedNode = nodes.find(n => n.id === abstractionPrompt.nodeId);
      let targetPrototypeId = null;
      
      if (currentlySelectedNode) {
        // Found canvas instance - use its prototype ID
        targetPrototypeId = currentlySelectedNode.prototypeId;
        console.log(`[Abstraction Submit] Found canvas instance node:`, {
          id: currentlySelectedNode.id,
          name: currentlySelectedNode.name,
          prototypeId: currentlySelectedNode.prototypeId
        });
      } else {
        // Not found as canvas instance - might be a prototype ID from focused carousel node
        const nodePrototype = nodePrototypesMap.get(abstractionPrompt.nodeId);
        if (nodePrototype) {
          targetPrototypeId = abstractionPrompt.nodeId;
          // Create a mock node object for the rest of the function
          currentlySelectedNode = {
            id: nodePrototype.id,
            name: nodePrototype.name,
            prototypeId: nodePrototype.id,
            color: nodePrototype.color
          };
          console.log(`[Abstraction Submit] Found prototype node:`, {
            id: nodePrototype.id,
            name: nodePrototype.name,
            prototypeId: nodePrototype.id
          });
        }
      }
      
      console.log(`[Abstraction Submit] RESOLVED NODE INFO:`, {
        promptNodeId: abstractionPrompt.nodeId,
        foundNodeId: currentlySelectedNode?.id,
        foundNodeName: currentlySelectedNode?.name,
        targetPrototypeId: targetPrototypeId,
        carouselNodeId: abstractionCarouselNode.id,
        carouselNodeProtoId: abstractionCarouselNode.prototypeId,
        direction: abstractionPrompt.direction
      });
      
      if (!currentlySelectedNode || !targetPrototypeId) {
        console.error(`[Abstraction Submit] No node found with ID: ${abstractionPrompt.nodeId}`);
        return;
      }

      // Create new node with color gradient
      const newNodeId = uuidv4();
      let newNodeColor = color;
      if (!newNodeColor) {
        const isAbove = abstractionPrompt.direction === 'above';
        const abstractionLevel = isAbove ? 0.3 : -0.2;
        const targetColor = isAbove ? '#FFFFFF' : '#000000';
        newNodeColor = interpolateColor(currentlySelectedNode.color || '#8B0000', targetColor, Math.abs(abstractionLevel));
      }
      
      console.log(`[Abstraction Submit] Creating new node with color:`, newNodeColor);
      
      // Create the new node prototype
      storeActions.addNodePrototype({
        id: newNodeId,
        name: name.trim(),
        description: `A ${abstractionPrompt.direction === 'above' ? 'more abstract' : 'more specific'} concept related to ${currentlySelectedNode.name}`,
        color: newNodeColor,
        typeNodeId: 'base-thing-prototype',
        definitionGraphIds: []
      });
      
      // Add to the abstraction chain relative to the currently selected node
      // Use the original carousel node as the chain owner, but insert relative to the currently selected node
      console.log(`[Abstraction Submit] About to call addToAbstractionChain with:`, {
        chainOwnerNodeId: abstractionCarouselNode.prototypeId,
        dimension: currentAbstractionDimension,
        direction: abstractionPrompt.direction,
        newNodeId: newNodeId,
        insertRelativeToNodeId: currentlySelectedNode.prototypeId
      });
      
      addToAbstractionChain(
        abstractionCarouselNode.prototypeId,     // the node whose chain we're modifying (original carousel node)
        currentAbstractionDimension,            // dimension (Physical, Conceptual, etc.)
        abstractionPrompt.direction,            // 'above' or 'below'
        newNodeId,                              // the new node to add
        targetPrototypeId                       // insert relative to this node (focused node in carousel)
      );
      
      console.log(`[Abstraction] Added new node "${name.trim()}" ${abstractionPrompt.direction} ${currentlySelectedNode.name} in ${abstractionCarouselNode.name}'s ${currentAbstractionDimension} dimension`);
      console.log(`[Abstraction] Target prototype ID used: ${targetPrototypeId}`);
      
      // Close the abstraction prompt but keep pie menu in stage 2
      // Ensure carousel stays visible by maintaining its state
      console.log(`[Abstraction Submit] Current selectedNodeIdForPieMenu before submit completion: ${selectedNodeIdForPieMenu}`);
      setAbstractionPrompt({ visible: false, name: '', color: null, direction: 'above', nodeId: null, carouselLevel: null });
      
      // Explicitly maintain carousel visibility and stay in stage 2 (don't go back to stage 1)
      setAbstractionCarouselVisible(true); // Ensure carousel stays visible
      // Keep carouselPieMenuStage at 2 so users can add more nodes without having to re-enter stage 2
      
      // Ensure pie menu stays selected for the carousel node
      if (abstractionCarouselNode && !selectedNodeIdForPieMenu) {
        console.log(`[Abstraction Submit] Restoring selectedNodeIdForPieMenu after successful submit`);
        setSelectedNodeIdForPieMenu(abstractionCarouselNode.id);
      }
      console.log(`[Abstraction Submit] selectedNodeIdForPieMenu after submit: ${selectedNodeIdForPieMenu}`);
      setIsCarouselStageTransition(true);
      
      // Ensure the carousel node is still selected for pie menu
      if (abstractionCarouselNode) {
        setSelectedNodeIdForPieMenu(abstractionCarouselNode.id);
      }
    }
  };

  const handlePromptSubmit = () => {
    const name = nodeNamePrompt.name.trim();
    if (name && plusSign) {
      setPlusSign(ps => ps && { ...ps, mode: 'morph', tempName: name, selectedColor: nodeNamePrompt.color });
    } else {
      setPlusSign(ps => ps && { ...ps, mode: 'disappear' });
    }
    setNodeNamePrompt({ visible: false, name: '', color: null });
    setNodeSelectionGrid({ visible: false, position: { x: 0, y: 0 } });
    setDialogColorPickerVisible(false); // Close color picker when submitting
  };

  const handleNodeSelection = (nodePrototype) => {
    if (!plusSign || !activeGraphId) return;
    
    // Trigger the morph animation with the selected prototype
    setPlusSign(ps => ps && { 
      ...ps, 
      mode: 'morph', 
      tempName: nodePrototype.name,
      selectedPrototype: nodePrototype // Store the selected prototype for morphDone
    });
    
    // Clean up UI state
    setNodeNamePrompt({ visible: false, name: '' });
    setNodeSelectionGrid({ visible: false, position: { x: 0, y: 0 } });
  };

  const handleNodeSelectionGridClose = () => {
    // Close the grid and trigger disappear animation like hitting X
    setNodeNamePrompt({ visible: false, name: '' });
    setNodeSelectionGrid({ visible: false, position: { x: 0, y: 0 } });
    setPlusSign(ps => ps && { ...ps, mode: 'disappear' });
  };

  const handleMorphDone = () => {
      if (!plusSign || !activeGraphId) return;
      
      let position = {
          x: plusSign.x - NODE_WIDTH / 2,
          y: plusSign.y - NODE_HEIGHT / 2,
      };

      // Apply smooth grid snapping when creating new nodes if grid is enabled
      if (gridMode !== 'off') {
        const snapped = snapToGridAnimated(plusSign.x, plusSign.y, NODE_WIDTH, NODE_HEIGHT, null);
        position = { x: snapped.x, y: snapped.y };
      }

      if (plusSign.selectedPrototype) {
          // A prototype was selected from the grid - create instance of existing prototype
          storeActions.addNodeInstance(activeGraphId, plusSign.selectedPrototype.id, position);
      } else if (plusSign.tempName) {
          // A custom name was entered - create new prototype
          const name = plusSign.tempName;
          const newPrototypeId = uuidv4();
          
          // 1. Create the new prototype
          const newPrototypeData = {
              id: newPrototypeId,
              name: name,
              description: '',
              color: plusSign.selectedColor || 'maroon', // Use selected color or default
              definitionGraphIds: [],
              typeNodeId: 'base-thing-prototype', // Type all new nodes as "Thing"
          };
          storeActions.addNodePrototype(newPrototypeData);

          // 2. Create the first instance of this prototype on the canvas
          storeActions.addNodeInstance(activeGraphId, newPrototypeId, position);
      }

      setPlusSign(null);
  };

  // Dialog color picker handlers
  const handleDialogColorPickerOpen = (iconElement, event) => {
    event.stopPropagation(); // Prevent event from bubbling to backdrop
    
    // If already open, close it (toggle behavior)
    if (dialogColorPickerVisible) {
      setDialogColorPickerVisible(false);
      return;
    }
    
    const rect = iconElement.getBoundingClientRect();
    setDialogColorPickerPosition({ x: rect.right, y: rect.bottom });
    setDialogColorPickerVisible(true);
  };

  const handleDialogColorPickerClose = () => {
    setDialogColorPickerVisible(false);
  };

  const handleDialogColorChange = (color) => {
    if (nodeNamePrompt.visible) {
      setNodeNamePrompt(prev => ({ ...prev, color }));
    } else if (connectionNamePrompt.visible) {
      setConnectionNamePrompt(prev => ({ ...prev, color }));
    }
  };

  const keysPressed = useKeyboardShortcuts();

  // Effect to mark component as mounted
  useEffect(() => {
    isMountedRef.current = true;
  }, []); // Runs once after initial mount

  // Effect to close color pickers when their parent contexts disappear
  useEffect(() => {
    // Close dialog color picker when node name prompt closes
    if (!nodeNamePrompt.visible) {
      setDialogColorPickerVisible(false);
    }
  }, [nodeNamePrompt.visible]);

  useEffect(() => {
    // Close pie menu color picker when pie menu disappears
    if (!currentPieMenuData || !selectedNodeIdForPieMenu) {
      setPieMenuColorPickerVisible(false);
      setActivePieMenuColorNodeId(null);
    }
  }, [currentPieMenuData, selectedNodeIdForPieMenu]);



  // Simple keyboard controls using requestAnimationFrame - synced to display refresh rate
  useEffect(() => {
    let lastFrameTime = 0;
    
    const handleKeyboardMovement = (currentTime = performance.now()) => {
      // Throttle to ensure consistent timing regardless of refresh rate
      if (currentTime - lastFrameTime < 8) { // ~120fps max to keep it smooth even on high refresh displays
        return;
      }
      lastFrameTime = currentTime;
      // Check for conditions that should disable keyboard controls
      const shouldDisableKeyboard = 
        isPaused ||
        nodeNamePrompt.visible || 
        connectionNamePrompt.visible || 
        abstractionPrompt.visible ||
        isHeaderEditing ||
        isRightPanelInputFocused ||
        isLeftPanelInputFocused ||
        !activeGraphId;

      if (shouldDisableKeyboard) return;

      // Calculate movement (use lowercase only to avoid shift conflicts)
      let panDx = 0, panDy = 0;
      if (keysPressed.current['ArrowLeft'] || keysPressed.current['a']) panDx += KEYBOARD_PAN_SPEED;
      if (keysPressed.current['ArrowRight'] || keysPressed.current['d']) panDx -= KEYBOARD_PAN_SPEED;
      if (keysPressed.current['ArrowUp'] || keysPressed.current['w']) panDy += KEYBOARD_PAN_SPEED;
      if (keysPressed.current['ArrowDown'] || keysPressed.current['s']) panDy -= KEYBOARD_PAN_SPEED;

      // Apply movement
      if (panDx !== 0 || panDy !== 0) {
        setPanOffset(prevPan => {
          const newX = Math.max(viewportSize.width - canvasSize.width * zoomLevel, Math.min(0, prevPan.x + panDx));
          const newY = Math.max(viewportSize.height - canvasSize.height * zoomLevel, Math.min(0, prevPan.y + panDy));
          return { x: newX, y: newY };
        });
      }

      // Handle zoom (simple direct approach - no async calculations)
      let zoomDelta = 0;
      if (keysPressed.current[' ']) zoomDelta = -KEYBOARD_ZOOM_SPEED; // Space = zoom out
      if (keysPressed.current['Shift']) zoomDelta = KEYBOARD_ZOOM_SPEED; // Shift = zoom in
        
        if (zoomDelta !== 0) {
          setZoomLevel(prevZoom => {
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prevZoom + zoomDelta));
            
          // Simple pan adjustment to keep view centered
            if (newZoom !== prevZoom) {
              const zoomRatio = newZoom / prevZoom;
              const centerX = viewportSize.width / 2;
              const centerY = viewportSize.height / 2;
              
            setPanOffset(prevPan => ({
                  x: centerX - (centerX - prevPan.x) * zoomRatio,
                  y: centerY - (centerY - prevPan.y) * zoomRatio
            }));
            }
            
            return newZoom;
          });
        }
    };

    // Use requestAnimationFrame to sync with display refresh rate
    let animationFrameId;
    const keyboardLoop = (timestamp) => {
      handleKeyboardMovement(timestamp);
      animationFrameId = requestAnimationFrame(keyboardLoop);
    };
    
    animationFrameId = requestAnimationFrame(keyboardLoop);
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPaused, nodeNamePrompt.visible, connectionNamePrompt.visible, abstractionPrompt.visible, isHeaderEditing, isRightPanelInputFocused, isLeftPanelInputFocused, activeGraphId, viewportSize, canvasSize, zoomLevel]);

    // Add ref for dialog container
  const dialogContainerRef = useRef(null);

  // Deprecated - replaced by UnifiedSelector
  const renderConnectionNamePrompt = () => {
    if (!connectionNamePrompt.visible) return null;
    
    const handleConnectionPromptSubmit = () => {
      if (connectionNamePrompt.name.trim()) {
        // Create a new node prototype for this connection type
        const newConnectionNodeId = uuidv4();
        addNodePrototype({
          id: newConnectionNodeId,
          name: connectionNamePrompt.name.trim(),
          description: '',
          picture: null,
          color: connectionNamePrompt.color || NODE_DEFAULT_COLOR,
          typeNodeId: null,
          definitionGraphIds: []
        });
        
        // Update the edge to use this new connection type
        if (connectionNamePrompt.edgeId) {
          updateEdge(connectionNamePrompt.edgeId, (draft) => {
            draft.definitionNodeIds = [newConnectionNodeId];
          });
        }
        
        setConnectionNamePrompt({ visible: false, name: '', color: null, edgeId: null });
      }
    };

    const handleConnectionPromptClose = () => {
      setConnectionNamePrompt({ visible: false, name: '', color: null, edgeId: null });
    };

    return (
      <>
        <div 
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 1000 }} 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleConnectionPromptClose();
            }
          }}
        />
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
            zIndex: 1001,
            width: '300px',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', cursor: 'pointer' }}>
            <X size={MODAL_CLOSE_ICON_SIZE} color="#999" onClick={handleConnectionPromptClose} />
          </div>
          <div style={{ textAlign: 'center', marginBottom: '15px', color: 'black' }}>
            <strong style={{ fontSize: '18px' }}>Name Your Connection</strong>
          </div>
          <div style={{ textAlign: 'center', marginBottom: '15px', color: '#666', fontSize: '14px' }}>
            The Thing that will define your Connection,<br />
            in verb form if available.
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Palette
              size={20}
              color="#260000"
              style={{ cursor: 'pointer', flexShrink: 0, marginRight: '8px' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleDialogColorPickerOpen(e.currentTarget, e);
                // Update the connection prompt color when color picker changes
                setConnectionNamePrompt({ ...connectionNamePrompt, color: connectionNamePrompt.color || NODE_DEFAULT_COLOR });
              }}
              title="Change color"
            />
            <input
              type="text"
              id="connection-name-prompt-input"
              name="connectionNamePromptInput"
              value={connectionNamePrompt.name}
              onChange={(e) => setConnectionNamePrompt({ ...connectionNamePrompt, name: e.target.value })}
              onKeyDown={(e) => { 
                if (e.key === 'Enter') handleConnectionPromptSubmit(); 
                if (e.key === 'Escape') handleConnectionPromptClose();
              }}
              style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', marginRight: '10px' }}
              autoFocus
            />
            <button
              onClick={handleConnectionPromptSubmit}
              style={{ 
                padding: '10px', 
                backgroundColor: connectionNamePrompt.color || NODE_DEFAULT_COLOR, 
                color: '#bdb5b5', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '50px',
                minHeight: '44px'
              }}
              title="Create connection type"
            >
              <ArrowBigRightDash size={16} color="#bdb5b5" />
            </button>
          </div>
        </div>
      </>
    );
  };

  // Deprecated - replaced by UnifiedSelector
  const renderCustomPrompt = () => {
    if (!nodeNamePrompt.visible) return null;
    return (
      <>
        <div 
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 1000 }} 
          onClick={(e) => {
            // Only close if clicking directly on the backdrop, not on child elements
            if (e.target === e.currentTarget) {
              handleClosePrompt();
            }
          }}
        />
        <div
          ref={dialogContainerRef}
          style={{
            position: 'fixed',
            top: HEADER_HEIGHT + 25,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#bdb5b5',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: 1001, // Higher than node selection grid (998)
            width: '300px',
          }}
          onClick={(e) => e.stopPropagation()} // Prevent clicks within dialog from closing it
          onMouseDown={(e) => e.stopPropagation()} // Also stop mousedown to prevent grid from closing
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', cursor: 'pointer' }}>
            <X size={MODAL_CLOSE_ICON_SIZE} color="#999" onClick={handleClosePrompt} />
          </div>
          <div style={{ textAlign: 'center', marginBottom: '15px', color: 'black' }}>
            <strong style={{ fontSize: '18px' }}>Name Your Thing</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Palette
              size={20}
              color="#260000"
              style={{ cursor: 'pointer', flexShrink: 0, marginRight: '8px' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleDialogColorPickerOpen(e.currentTarget, e);
              }}
              title="Change color"
            />
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
              style={{ 
                padding: '10px', 
                backgroundColor: nodeNamePrompt.color || 'maroon', 
                color: '#bdb5b5', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '50px',
                minHeight: '44px'
              }}
              title="Create node"
            >
              <ArrowBigRightDash size={16} color="#bdb5b5" />
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
    // console.log("[Left Panel Toggle] New state:", !leftPanelExpanded);
  }, [leftPanelExpanded]);

  // Panel toggle and TypeList keyboard shortcuts - work even when inputs are focused
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Only handle these specific keys, regardless of input focus
      if (e.key === '1') {
        e.preventDefault();
        handleToggleLeftPanel();
      } else if (e.key === '2') {
        e.preventDefault();
        handleToggleRightPanel();
      } else if (e.key === '3') {
        e.preventDefault();
        // Cycle TypeList mode: connection -> node -> closed -> connection
        const currentMode = useGraphStore.getState().typeListMode;
        const newMode = currentMode === 'connection' ? 'node' : 
                       currentMode === 'node' ? 'closed' : 'connection';
        storeActions.setTypeListMode(newMode);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleToggleLeftPanel, handleToggleRightPanel, storeActions]);



  const handleLeftPanelFocusChange = useCallback((isFocused) => {
    //console.log(`[Left Panel Focus Change] Setting isLeftPanelInputFocused to: ${isFocused}`);
    setIsLeftPanelInputFocused(isFocused);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInputActive = isHeaderEditing || isRightPanelInputFocused || isLeftPanelInputFocused || nodeNamePrompt.visible;
      if (isInputActive || !activeGraphId) { return; }

      const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace';
      const nodesSelected = selectedInstanceIds.size > 0;
      const edgeSelected = selectedEdgeId !== null || selectedEdgeIds.size > 0;

      if (isDeleteKey && nodesSelected) {
        e.preventDefault();
        const idsToDelete = new Set(selectedInstanceIds); // Use local selection state

        // Call removeNodeInstance action for each selected ID
        idsToDelete.forEach(id => {
            storeActions.removeNodeInstance(activeGraphId, id);
        });

        // Clear local selection state AFTER dispatching actions
        console.log(`[NodeCanvas] 📍 CLEAR #4: Keyboard delete clearing selectedInstanceIds after deleting ${idsToDelete.length} nodes`);
        setSelectedInstanceIds(new Set());
      } else if (isDeleteKey && edgeSelected) {
        console.log('[NodeCanvas] Delete key pressed with edge selected:', {
          selectedEdgeId,
          controlPanelShouldShow,
          controlPanelVisible,
          connectionNamePromptVisible: connectionNamePrompt.visible,
          shouldPreventDeletion: connectionNamePrompt.visible
        });
        
        if (!connectionNamePrompt.visible) {
          e.preventDefault();
          
          // Delete single selected edge
          if (selectedEdgeId) {
            storeActions.removeEdge(selectedEdgeId);
          }
          
          // Delete multiple selected edges
          if (selectedEdgeIds.size > 0) {
            selectedEdgeIds.forEach(edgeId => {
              storeActions.removeEdge(edgeId);
            });
            clearSelectedEdgeIds();
          }
        } else {
          console.log('[NodeCanvas] Edge deletion prevented - connection selector is open');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedInstanceIds, selectedEdgeId, selectedEdgeIds, isHeaderEditing, isRightPanelInputFocused, isLeftPanelInputFocused, nodeNamePrompt.visible, connectionNamePrompt.visible, activeGraphId, storeActions.removeNodeInstance, storeActions.removeEdge, clearSelectedEdgeIds]);

  const handleProjectTitleChange = (newTitle) => {
    // Get CURRENT activeGraphId directly from store
    const currentActiveId = useGraphStore.getState().activeGraphId;
    if (currentActiveId) { 
        // Use localStoreActions
        storeActions.updateGraph(currentActiveId, draft => { draft.name = newTitle || 'Untitled'; });
    } else {
        // console.warn("handleProjectTitleChange: No active graph ID found in store.");
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
  // Global listeners for resizer drag to keep latency low
  useEffect(() => {
    const move = (e) => {
      if (!isDraggingLeft.current && !isDraggingRight.current) return;
      // Prevent page scroll/pinch on touchmove while dragging
      if (e && e.cancelable) {
        try { e.preventDefault(); } catch {}
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }
      onDragMove(e);
    };
    const up = () => {
      if (!isDraggingLeft.current && !isDraggingRight.current) return;
      endDrag();
    };
    const blockWheelWhileDragging = (e) => {
      // Only block global wheel when dragging to avoid interfering with normal scroll
      if (!isDraggingLeft.current && !isDraggingRight.current) return;
      if (e && e.cancelable) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    window.addEventListener('pointerup', up);
    window.addEventListener('wheel', blockWheelWhileDragging, { passive: false });
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('wheel', blockWheelWhileDragging);
    };
  }, []);

  // Effect to manage PieMenu visibility and data for animations
  useEffect(() => {
    console.log(`[NodeCanvas] selectedInstanceIds changed:`, {
      size: selectedInstanceIds.size,
      ids: [...selectedInstanceIds],
      isTransitioningPieMenu,
      abstractionCarouselVisible,
      selectedNodeIdForPieMenu,
      abstractionPromptVisible: abstractionPrompt.visible
    });
    
    // Add stack trace for unexpected clears to debug the issue
    if (selectedInstanceIds.size === 0 && selectedNodeIdForPieMenu && !justCompletedCarouselExit) {
      console.log(`[NodeCanvas] ⚠️ UNEXPECTED SELECTION CLEAR - Stack trace:`, new Error().stack);
    }
    
    if (selectedInstanceIds.size === 1) {
      const instanceId = [...selectedInstanceIds][0];
      
      if (!isTransitioningPieMenu) {
        setSelectedNodeIdForPieMenu(instanceId);
      } else {
        // If transitioning, PieMenu's onExitAnimationComplete will handle setting the next selectedNodeIdForPieMenu
      }
    } else {
      // Not a single selection (0 or multiple)
      
      // SPECIAL CASE: If abstraction prompt is visible, don't close pie menu yet
      if (abstractionPrompt.visible && abstractionCarouselVisible) {
        console.log(`[NodeCanvas] Abstraction prompt visible - keeping pie menu open despite selection change`);
        return;
      }
      
      // If we're currently in carousel mode and losing selection, treat it as a transition
      if (abstractionCarouselVisible && selectedNodeIdForPieMenu) {
        console.log(`[NodeCanvas] Carousel visible but losing selection - starting transition`);
        setIsTransitioningPieMenu(true);
      }
      
      // SPECIAL CASE: If carousel is exiting, don't clear the pie menu - let the exit complete first
      if (carouselAnimationState === 'exiting') {
        console.log(`[NodeCanvas] Carousel is exiting - not clearing pie menu yet`);
        return;
      }
      
      // SPECIAL CASE: If we just completed carousel exit, don't clear the pie menu 
      if (justCompletedCarouselExit) {
        console.log(`[NodeCanvas] Just completed carousel exit - not clearing pie menu`);
        return;
      }
      
      // SPECIAL CASE: If carousel is visible and we're losing selection, start exit animation
      if (abstractionCarouselVisible && selectedNodeIdForPieMenu) {
        console.log(`[NodeCanvas] Carousel visible and losing selection - starting exit animation`);
        setCarouselAnimationState('exiting');
        return;
      }
      
      console.log(`[NodeCanvas] Setting selectedNodeIdForPieMenu to null due to selection change`);
      setSelectedNodeIdForPieMenu(null);
    }
  }, [selectedInstanceIds, isTransitioningPieMenu, abstractionPrompt.visible, abstractionCarouselVisible, selectedNodeIdForPieMenu, carouselAnimationState, justCompletedCarouselExit]); // Added carousel protection flags
  // Effect to prepare and render PieMenu when selectedNodeIdForPieMenu changes and not transitioning
  useEffect(() => {
    if (selectedNodeIdForPieMenu && !isTransitioningPieMenu) {
      const node = nodes.find(n => n.id === selectedNodeIdForPieMenu);
      if (node) {
        // Check if we're in carousel mode and have dynamic dimensions
        const isInCarouselMode = abstractionCarouselVisible && abstractionCarouselNode && node.id === abstractionCarouselNode.id;
        
        // Use dynamic carousel dimensions if available, otherwise calculate from the actual node
        const dimensions = isInCarouselMode && carouselFocusedNodeDimensions 
          ? carouselFocusedNodeDimensions 
          : getNodeDimensions(node, previewingNodeId === node.id, null);
        
        // In carousel mode, create a virtual node positioned at the carousel center
        // Keep the original node for PieMenu, but store focused node info for button actions
        let nodeForPieMenu = node;
        
        if (isInCarouselMode && abstractionCarouselNode) {
          // Calculate carousel center position in canvas coordinates
          const originalNodeDimensions = getNodeDimensions(abstractionCarouselNode, false, null);
          const carouselCenterX = abstractionCarouselNode.x + originalNodeDimensions.currentWidth / 2;
          const carouselCenterY = abstractionCarouselNode.y + originalNodeDimensions.currentHeight / 2; // Perfect center alignment
          
          // Create virtual node at carousel center
          nodeForPieMenu = {
            ...nodeForPieMenu,
            x: carouselCenterX - dimensions.currentWidth / 2,
            y: carouselCenterY - dimensions.currentHeight / 2
          };
          
          console.log(`[NodeCanvas] Final nodeForPieMenu for pie menu:`, {
            id: nodeForPieMenu.id,
            name: nodeForPieMenu.name,
            prototypeId: nodeForPieMenu.prototypeId,
            stage: carouselPieMenuStage,
            focusedNodeId: carouselFocusedNode?.id,
            focusedNodeName: carouselFocusedNode?.name
          });
        }
        
        console.log(`[NodeCanvas] Preparing pie menu for node ${selectedNodeIdForPieMenu}. Stage: ${carouselPieMenuStage}. Buttons:`, targetPieMenuButtons.map(b => b.id));
        
        setCurrentPieMenuData({ 
          node: nodeForPieMenu, 
          buttons: targetPieMenuButtons, 
          nodeDimensions: dimensions
        });
        setIsPieMenuRendered(true); // Ensure PieMenu is in DOM to animate in
      } else {
        //console.log(`[NodeCanvas] Node ${selectedNodeIdForPieMenu} not found, but was set for pie menu. Hiding.`);
        setCurrentPieMenuData(null); // Keep this for safety if node genuinely disappears
        // isPieMenuRendered will be set to false by onExitAnimationComplete if it was visible
      }
    } else if (!selectedNodeIdForPieMenu && !isTransitioningPieMenu) {
        // If no node is targeted for pie menu (e.g., deselected), AND we are not in a transition
        // (which implies the menu should just hide without further state changes from NodeCanvas side for now).
        // The PieMenu will become invisible due to the isVisible prop calculation.
        // currentPieMenuData should NOT be nulled here, as PieMenu needs it to animate out.
        // It will be nulled in onExitAnimationComplete.
        //console.log("[NodeCanvas] selectedNodeIdForPieMenu is null and not transitioning. PieMenu will become invisible and animate out.");
    }
    // If isTransitioningPieMenu is true, we don't change currentPieMenuData or isPieMenuRendered here.
    // The existing menu plays its exit animation, and onExitAnimationComplete handles the next steps.
  }, [selectedNodeIdForPieMenu, nodes, previewingNodeId, targetPieMenuButtons, isTransitioningPieMenu, abstractionCarouselVisible, abstractionCarouselNode, carouselPieMenuStage, carouselFocusedNodeScale, carouselFocusedNodeDimensions, carouselFocusedNode]);

  // --- Hurtle Animation State & Logic ---
  const [hurtleAnimation, setHurtleAnimation] = useState(null);
  const hurtleAnimationRef = useRef(null);

  const runHurtleAnimation = useCallback((animationData) => {
    const animate = (currentTime) => {
      const elapsed = currentTime - animationData.startTime;
      const progress = Math.min(elapsed / animationData.duration, 1);
      
      // Subtle speed variation - gentle ease-in-out
      const easedProgress = progress < 0.5 
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      // Calculate current position (screen coordinates)
      const currentX = Math.round(animationData.startPos.x + (animationData.targetPos.x - animationData.startPos.x) * easedProgress);
      const currentY = Math.round(animationData.startPos.y + (animationData.targetPos.y - animationData.startPos.y) * easedProgress);
      
      // Calculate ballooning and contracting size.
      // It starts at 1px, "balloons" to a peak size, and "contracts" back to 1px.
      const peakOrbSize = animationData.orbSize * 1.9; // Keep the dramatic peak size
      const sineProgress = Math.sin(progress * Math.PI); // This goes from 0 -> 1 -> 0 as progress goes 0 -> 1
      const currentOrbSize = Math.max(1, Math.round(1 + (peakOrbSize - 1) * sineProgress));
      
      // Z-index behavior: stay under node much longer, use positive z-index
      let currentZIndex;
      if (progress < 0.45) {
        currentZIndex = 500; // Positive z-index, will be covered by elevated selected node
      } else if (progress < 0.85) {
        currentZIndex = 15000; // Above header for shorter period
      } else {
        currentZIndex = 5000; // Below header only at the very end
      }
      
      // Update animation state with dynamic properties
      setHurtleAnimation(prev => prev ? {
        ...prev,
        currentPos: { x: currentX, y: currentY },
        currentOrbSize,
        currentZIndex,
        progress
      } : null);

      if (progress < 1) {
        hurtleAnimationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete - clean up and switch graph
        storeActions.openGraphTabAndBringToTop(animationData.targetGraphId, animationData.definitionNodeId);
        setHurtleAnimation(null);
        if (hurtleAnimationRef.current) {
          cancelAnimationFrame(hurtleAnimationRef.current);
          hurtleAnimationRef.current = null;
        }
      }
    };

    hurtleAnimationRef.current = requestAnimationFrame(animate);
  }, [storeActions]);

  // Simple Particle Transfer Animation - always use fresh coordinates
  const startHurtleAnimation = useCallback((nodeId, targetGraphId, definitionNodeId, sourceGraphId = null) => {
    const currentState = useGraphStore.getState();
    
    // If a sourceGraphId is provided, look for the node there. Otherwise, use the current active graph.
    const graphIdToFindNodeIn = sourceGraphId || currentState.activeGraphId;
    
    const nodesInSourceGraph = getHydratedNodesForGraph(graphIdToFindNodeIn)(currentState);
    const nodeData = nodesInSourceGraph.find(n => n.id === nodeId);
    
    if (!nodeData) {
        console.error(`[Hurtle Animation] Failed to find node ${nodeId} in source graph ${graphIdToFindNodeIn}.`);
        return;
    }
    
    // Get fresh viewport state
    const containerElement = containerRef.current;
    if (!containerElement) return;

    // Get the current pan/zoom from the actual SVG element to ensure accuracy
    const svgElement = containerElement.querySelector('.canvas');
    if (!svgElement) return;
    
    const transform = svgElement.style.transform;
    const translateMatch = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
    const scaleMatch = transform.match(/scale\((-?\d+(?:\.\d+)?)\)/);
    
    const currentPanX = translateMatch ? parseFloat(translateMatch[1]) : 0;
    const currentPanY = translateMatch ? parseFloat(translateMatch[2]) : 0;
    const currentZoom = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

    // Get node dimensions 
    const nodeDimensions = getNodeDimensions(nodeData, false, null);
    
    // Calculate node center in canvas coordinates
    const nodeCenterCanvasX = nodeData.x + nodeDimensions.currentWidth / 2;
    const nodeCenterCanvasY = nodeData.y + nodeDimensions.currentHeight / 2;
    
    // Apply current transformation
    const nodeScreenX = nodeCenterCanvasX * currentZoom + currentPanX;
    const nodeScreenY = nodeCenterCanvasY * currentZoom + currentPanY + HEADER_HEIGHT;
    
    // Target is header center
    const screenWidth = containerElement.offsetWidth;
    const headerCenterX = Math.round(screenWidth / 2);
    const headerCenterY = Math.round(HEADER_HEIGHT / 2);
    
    // Calculate orb size proportional to current zoom
    const orbSize = Math.max(12, Math.round(30 * currentZoom));

    const animationData = {
      nodeId,
      targetGraphId,
      definitionNodeId,
      startTime: performance.now(),
      duration: 400, // slower, more satisfying arc
      startPos: { x: nodeScreenX, y: nodeScreenY - 15 },
      targetPos: { x: headerCenterX, y: headerCenterY },
      nodeColor: nodeData.color || NODE_DEFAULT_COLOR,
      orbSize,
    };

    setHurtleAnimation(animationData);
    runHurtleAnimation(animationData);
  }, [containerRef, runHurtleAnimation]);

  const startHurtleAnimationFromPanel = useCallback((nodeId, targetGraphId, definitionNodeId, startRect) => {
    const currentState = useGraphStore.getState();
    const nodeData = currentState.nodePrototypes.get(nodeId);
    if (!nodeData) {
      console.error(`[Panel Hurtle] Failed to find node ${nodeId}.`);
      return;
    }

    const containerElement = containerRef.current;
    if (!containerElement) {
      console.error(`[Panel Hurtle] containerRef.current is null`);
      return;
    }

    // Get the current pan/zoom from the actual SVG element to ensure accuracy
    const svgElement = containerElement.querySelector('.canvas');
    if (!svgElement) {
      console.error(`[Panel Hurtle] Could not find .canvas element`);
      return;
    }
    
    const transform = svgElement.style.transform;
    const scaleMatch = transform.match(/scale\((-?\d+(?:\.\d+)?)\)/);
    const currentZoom = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

    // Start position is the center of the icon's rect
    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;

    // Target is header center
    const screenWidth = containerElement.offsetWidth;
    const headerCenterX = Math.round(screenWidth / 2);
    const headerCenterY = Math.round(HEADER_HEIGHT / 2);

    // Calculate orb size proportional to current zoom, same as pie menu animation
    const orbSize = Math.max(12, Math.round(30 * currentZoom));

    const animationData = {
      nodeId,
      targetGraphId,
      definitionNodeId,
      startTime: performance.now(),
      duration: 400, // Slower arc
      startPos: { x: startX, y: startY },
      targetPos: { x: headerCenterX, y: headerCenterY },
      nodeColor: nodeData.color || NODE_DEFAULT_COLOR,
      orbSize: orbSize, // Use calculated, zoom-dependent size
    };

    setHurtleAnimation(animationData);
    runHurtleAnimation(animationData);
  }, [containerRef, runHurtleAnimation]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (hurtleAnimationRef.current) {
        cancelAnimationFrame(hurtleAnimationRef.current);
      }
    };
  }, []);
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
         onTitleChange={handleProjectTitleChange}
         onEditingStateChange={setIsHeaderEditing}
         headerGraphs={headerGraphs}
         onSetActiveGraph={storeActions.setActiveGraph}
         // Receive debug props
         debugMode={debugMode}
         setDebugMode={setDebugMode}
         bookmarkActive={bookmarkActive}
         onBookmarkToggle={handleToggleBookmark}
         showConnectionNames={showConnectionNames}
         onToggleShowConnectionNames={storeActions.toggleShowConnectionNames}
         enableAutoRouting={enableAutoRouting}
         routingStyle={routingStyle}
         manhattanBends={manhattanBends}
         onToggleEnableAutoRouting={storeActions.toggleEnableAutoRouting}
         onSetRoutingStyle={storeActions.setRoutingStyle}
         onSetManhattanBends={storeActions.setManhattanBends}
         onSetCleanLaneSpacing={(v) => useGraphStore.getState().setCleanLaneSpacing(v)}
         cleanLaneSpacing={cleanLaneSpacing}

         // Grid controls
         gridMode={gridMode}
         onSetGridMode={(m) => useGraphStore.getState().setGridMode(m)}
         gridSize={gridSize}
         onSetGridSize={(v) => useGraphStore.getState().setGridSize(v)}

         onNewUniverse={async () => {
           try {
             console.log('[NodeCanvas] Creating new universe from menu');
             // storeActions.clearUniverse(); // This is redundant
             
             const { createUniverseFile, enableAutoSave } = await import('./store/fileStorage.js');
             const initialData = await createUniverseFile();
             
             if (initialData !== null) {
               storeActions.loadUniverseFromFile(initialData);
               
               // Enable auto-save for the new universe
               enableAutoSave(() => useGraphStore.getState());
               console.log('[NodeCanvas] New universe created successfully from menu with auto-save enabled');
               
               // Ensure universe connection is marked as established
               storeActions.setUniverseConnected(true);
             }
           } catch (error) {
             console.error('[NodeCanvas] Error creating new universe from menu:', error);
             storeActions.setUniverseError(`Failed to create universe: ${error.message}`);
           }
         }}
         onOpenUniverse={async () => {
           try {
             // Check if user has unsaved work
             const currentState = useGraphStore.getState();
             const hasGraphs = currentState.graphs.size > 0;
             const hasNodes = currentState.nodes.size > 0;
             
             if (hasGraphs || hasNodes) {
               const confirmed = confirm(
                 'Opening a different universe file will replace your current work.\n\n' +
                 'Make sure your current work is saved first.\n\n' +
                 'Continue with opening a different universe file?'
               );
               if (!confirmed) {
                 console.log('[NodeCanvas] User cancelled universe file opening');
                 return;
               }
             }
             
             console.log('[NodeCanvas] Opening universe from menu');
             // storeActions.clearUniverse(); // This is redundant
             
             const { openUniverseFile, enableAutoSave, getFileStatus } = await import('./store/fileStorage.js');
             const loadedData = await openUniverseFile();
             
             console.log('[NodeCanvas] Loaded data:', loadedData ? 'success' : 'null');
             
             if (loadedData !== null) {
               console.log('[NodeCanvas] Loading universe data with', Object.keys(loadedData).length, 'properties');
               storeActions.loadUniverseFromFile(loadedData);
               
               // Enable auto-save for the opened universe
               enableAutoSave(() => useGraphStore.getState());
               
               // Debug: check file status after load
               const fileStatus = getFileStatus();
               console.log('[NodeCanvas] File status after load:', fileStatus);
               
               console.log('[NodeCanvas] Universe opened successfully from menu with auto-save enabled');
               
               // Ensure universe connection is marked as established
               storeActions.setUniverseConnected(true);
             } else {
               console.log('[NodeCanvas] User cancelled file selection');
             }
           } catch (error) {
             console.error('[NodeCanvas] Error opening universe from menu:', error);
             storeActions.setUniverseError(`Failed to open universe: ${error.message}`);
           }
         }}
         onSaveUniverse={async () => {
           try {
             console.log('[NodeCanvas] Manual save requested');
             const { forceSave, canAutoSave, getFileStatus } = await import('./store/fileStorage.js');
             
             // Debug: check file status
             const fileStatus = getFileStatus();
             console.log('[NodeCanvas] File status before save:', fileStatus);
             
             if (canAutoSave()) {
               const currentState = useGraphStore.getState();
               console.log('[NodeCanvas] Saving state with', Object.keys(currentState).length, 'properties');
               
               const saveResult = await forceSave(currentState);
               console.log('[NodeCanvas] Manual save result:', saveResult);
               
               if (saveResult) {
                 console.log('[NodeCanvas] Manual save completed successfully');
                 alert('Universe saved successfully!');
               } else {
                 console.warn('[NodeCanvas] Manual save returned false');
                 alert('Save failed for unknown reason.');
               }
             } else {
               console.warn('[NodeCanvas] No file handle available for manual save');
               alert('No universe file is currently open. Please create or open a universe first.');
             }
           } catch (error) {
             console.error('[NodeCanvas] Error during manual save:', error);
             alert(`Failed to save universe: ${error.message}`);
           }
         }}
         onExportRdf={async () => {
           try {
             console.log('[NodeCanvas] RDF export requested');
             const { exportToRdfTurtle } = await import('./formats/rdfExport.js');
             
             const currentState = useGraphStore.getState();
             const rdfData = await exportToRdfTurtle(currentState);
             
             // Create a download link
             const blob = new Blob([rdfData], { type: 'application/n-quads' });
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url;
             a.download = 'cognitive-space.nq';
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
             
             console.log('[NodeCanvas] RDF export completed successfully');
           } catch (error) {
             console.error('[NodeCanvas] Error during RDF export:', error);
             alert(`Failed to export RDF: ${error.message}`);
           }
         }}
         onOpenRecentFile={async (recentFileEntry) => {
           try {
             // Check if user has unsaved work
             const currentState = useGraphStore.getState();
             const hasGraphs = currentState.graphs.size > 0;
             const hasNodes = currentState.nodes.size > 0;
             
             if (hasGraphs || hasNodes) {
               const confirmed = confirm(
                 `Opening "${recentFileEntry.fileName}" will replace your current work.\n\n` +
                 'Make sure your current work is saved first.\n\n' +
                 'Continue?'
               );
               if (!confirmed) {
                 console.log('[NodeCanvas] User cancelled recent file opening');
                 return;
               }
             }
             
             console.log('[NodeCanvas] Opening recent file from menu:', recentFileEntry.fileName);
             // storeActions.clearUniverse(); // This is redundant
             
             const { openRecentFile, enableAutoSave, getFileStatus } = await import('./store/fileStorage.js');
             const loadedData = await openRecentFile(recentFileEntry);
             
             console.log('[NodeCanvas] Recent file data loaded:', loadedData ? 'success' : 'null');
             
             if (loadedData !== null) {
               console.log('[NodeCanvas] Loading recent file data with', Object.keys(loadedData).length, 'properties');
               storeActions.loadUniverseFromFile(loadedData);
               
               // Enable auto-save for the opened universe
               enableAutoSave(() => useGraphStore.getState());
               
               // Debug: check file status after load
               const fileStatus = getFileStatus();
               console.log('[NodeCanvas] File status after recent file load:', fileStatus);
               
               console.log('[NodeCanvas] Recent file opened successfully with auto-save enabled');
               
               // Ensure universe connection is marked as established
               storeActions.setUniverseConnected(true);
             } else {
               console.log('[NodeCanvas] Recent file loading returned null');
             }
           } catch (error) {
             console.error('[NodeCanvas] Error opening recent file:', error);
             storeActions.setUniverseError(`Failed to open recent file: ${error.message}`);
             alert(`Failed to open "${recentFileEntry.fileName}": ${error.message}`);
           }
         }}
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
          nodeDefinitionIndices={nodeDefinitionIndices}
          onStartHurtleAnimationFromPanel={startHurtleAnimationFromPanel}
          leftPanelExpanded={leftPanelExpanded}
          rightPanelExpanded={rightPanelExpanded}
        />

        <div
          ref={setCanvasAreaRef}
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
          onTouchStart={handleTouchStartCanvas}
          onTouchMove={handleTouchMoveCanvas}
          onTouchEnd={handleTouchEndCanvas}
        >
          {isUniverseLoading ? (
            // Show loading state while checking for universe file
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Circular loading spinner */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '4px solid #bdb5b5', // Canvas color
                  borderTop: '4px solid #260000', // Maroon color matching header
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}
              />
              <style>
                {`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}
              </style>
            </div>
          ) : (!isUniverseLoaded || !hasUniverseFile) ? (
            // Show universe file setup screen
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#555', padding: '20px' }}>
              <div style={{ fontSize: '32px', marginBottom: '20px' }}>
                Welcome to Redstring
              </div>
              {universeLoadingError ? (
                <div style={{ textAlign: 'center', maxWidth: '500px', marginBottom: '30px' }}>
                  <div style={{ marginBottom: '10px', color: '#d32f2f', fontSize: '18px' }}>
                    {universeLoadingError}
                  </div>
                  <div style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>
                    A universe file is required to work with Redstring. Click below to create or open one.
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', maxWidth: '500px', marginBottom: '30px' }}>
                  <div style={{ fontSize: '20px', marginBottom: '15px' }}>
                    An open, recursive knowledge graph interface.
                    <br />
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    Create your universe.redstring file once, and it will auto-reconnect on every visit.
                  </div>
                  <div style={{ fontSize: '14px', color: '#888', marginTop: '10px' }}>
                    Save to your Documents folder for easy auto-discovery.
                  </div>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={async () => {
                    try {
                      console.log('[NodeCanvas] Creating universe file');
                      // Clear any existing universe
                      // storeActions.clearUniverse(); // This is redundant
                      
                      // Import the createUniverseFile function
                      const { createUniverseFile, enableAutoSave } = await import('./store/fileStorage.js');
                      
                      // This will prompt for save location and create the universe file
                      const initialData = await createUniverseFile();
                      
                      if (initialData !== null) {
                        // Successfully created universe file, load the empty state
                        storeActions.loadUniverseFromFile(initialData);
                        
                        // Enable auto-save
                        enableAutoSave(() => useGraphStore.getState());
                        console.log('[NodeCanvas] Universe created and saved successfully with auto-save enabled');
                        
                        // Ensure universe connection is marked as established
                        storeActions.setUniverseConnected(true);
                      } else {
                        // User cancelled the file creation dialog
                        console.log('[NodeCanvas] User cancelled universe file creation');
                        storeActions.setUniverseError('File creation was cancelled. Please try again to set up your universe.');
                      }
                    } catch (error) {
                      console.error('[NodeCanvas] Error creating universe:', error);
                      storeActions.setUniverseError(`Failed to create universe: ${error.message}. Please try again.`);
                    }
                  }}
                  style={{
                    padding: '12px 24px',
                    fontSize: '16px',
                    backgroundColor: 'maroon',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#a00000'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'maroon'}
                >
                  Set Up My Universe
                </button>
                
                <button
                  onClick={async () => {
                    try {
                      console.log('[NodeCanvas] User chose to open existing file');
                      // Clear any existing universe
                      // storeActions.clearUniverse(); // This is redundant
                      
                      const { openUniverseFile, enableAutoSave } = await import('./store/fileStorage.js');
                      const loadedData = await openUniverseFile();
                      
                      if (loadedData !== null) {
                        storeActions.loadUniverseFromFile(loadedData);
                        
                        // Enable auto-save
                        enableAutoSave(() => useGraphStore.getState());
                        console.log('[NodeCanvas] Universe opened successfully with auto-save enabled');
                        
                        // Ensure universe connection is marked as established
                        storeActions.setUniverseConnected(true);
                      }
                    } catch (error) {
                      console.error('[NodeCanvas] Error loading file:', error);
                      storeActions.setUniverseError(`Failed to open file: ${error.message}`);
                    }
                  }}
                  style={{
                    padding: '12px 24px',
                    fontSize: '16px',
                    backgroundColor: '#666',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#555'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#666'}
                >
                  Open Existing File
                </button>
              </div>
            </div>
          ) : !activeGraphId ? ( // Check local state
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
              {/* Grid overlay (optimized) */}
              {(gridMode === 'always' || (gridMode === 'hover' && !!draggingNodeInfo)) && (
                <g className="grid-overlay">
                  {/* Thin line grid for 'always' using pattern */}
                  {gridMode === 'always' && (
                    <>
                      <defs>
                        <pattern id="grid-lines-pattern" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                          <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#716C6C" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
                        </pattern>
                      </defs>
                      <rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill="url(#grid-lines-pattern)" />
                    </>
                  )}

                  {/* Grid dots - only show when dragging nodes */}
                  {gridMode === 'hover' && !!draggingNodeInfo && (
                    <g>
                      {(() => {
                        const dots = [];
                        const startX = Math.floor((-panOffset.x / zoomLevel) / gridSize) * gridSize;
                        const startY = Math.floor((-panOffset.y / zoomLevel) / gridSize) * gridSize;
                        const endX = startX + (viewportSize.width / zoomLevel) + gridSize * 2;
                        const endY = startY + (viewportSize.height / zoomLevel) + gridSize * 2;
                        
                        for (let x = startX; x <= endX; x += gridSize) {
                          for (let y = startY; y <= endY; y += gridSize) {
                            dots.push(
                              <circle
                                key={`grid-dot-${x}-${y}`}
                                cx={x}
                                cy={y}
                                r={Math.min(6, Math.max(3, gridSize * 0.06))}
                                fill="#260000"
                                pointerEvents="none"
                              />
                            );
                          }
                        }
                        return dots;
                      })()}
                    </g>
                  )}
                </g>
              )}
              {isViewReady && (
                <>
              <g className="base-layer">
                {visibleEdges.map((edge, idx) => {
                  const sourceNode = nodes.find(n => n.id === edge.sourceId);
                  const destNode = nodes.find(n => n.id === edge.destinationId);

                  if (!sourceNode || !destNode) {
                     return null;
                  }
                  const sNodeDims = baseDimsById.get(sourceNode.id) || getNodeDimensions(sourceNode, false, null);
                  const eNodeDims = baseDimsById.get(destNode.id) || getNodeDimensions(destNode, false, null);
                  const isSNodePreviewing = previewingNodeId === sourceNode.id;
                  const isENodePreviewing = previewingNodeId === destNode.id;
                  const x1 = sourceNode.x + sNodeDims.currentWidth / 2;
                  const y1 = sourceNode.y + (isSNodePreviewing ? NODE_HEIGHT / 2 : sNodeDims.currentHeight / 2);
                  const x2 = destNode.x + eNodeDims.currentWidth / 2;
                  const y2 = destNode.y + (isENodePreviewing ? NODE_HEIGHT / 2 : eNodeDims.currentHeight / 2);

                      const isHovered = hoveredEdgeInfo?.edgeId === edge.id;
                      const isSelected = selectedEdgeId === edge.id || selectedEdgeIds.has(edge.id);
                      

                      

                      // Get edge color - prioritize definitionNodeIds for custom types, then typeNodeId for base types
                      const getEdgeColor = () => {
                        // First check definitionNodeIds (for custom connection types set via control panel)
                        if (edge.definitionNodeIds && edge.definitionNodeIds.length > 0) {
                          const definitionNode = nodePrototypesMap.get(edge.definitionNodeIds[0]);
                          if (definitionNode) {
                            return definitionNode.color || NODE_DEFAULT_COLOR;
                          }
                        }
                        
                        // Then check typeNodeId (for base connection type)
                        if (edge.typeNodeId) {
                          // Special handling for base connection prototype - ensure it's black
                          if (edge.typeNodeId === 'base-connection-prototype') {
                            return '#000000'; // Black color for base connection
                          }
                          const edgePrototype = edgePrototypesMap.get(edge.typeNodeId);
                          if (edgePrototype) {
                            return edgePrototype.color || NODE_DEFAULT_COLOR;
                          }
                        }
                        
                        return destNode.color || NODE_DEFAULT_COLOR;
                      };
                      const edgeColor = getEdgeColor();
                      
                      // Calculate arrow position and rotation
                      const dx = x2 - x1;
                      const dy = y2 - y1;
                      const length = Math.sqrt(dx * dx + dy * dy);
                      
                      // Helper function to calculate edge intersection with rectangular nodes
                      const getNodeEdgeIntersection = (nodeX, nodeY, nodeWidth, nodeHeight, dirX, dirY) => {
                        const centerX = nodeX + nodeWidth / 2;
                        const centerY = nodeY + nodeHeight / 2;
                        const halfWidth = nodeWidth / 2;
                        const halfHeight = nodeHeight / 2;
                        const intersections = [];
                        
                        if (dirX > 0) {
                          const t = halfWidth / dirX;
                          const y = dirY * t;
                          if (Math.abs(y) <= halfHeight) intersections.push({ x: centerX + halfWidth, y: centerY + y, distance: t });
                        }
                        if (dirX < 0) {
                          const t = -halfWidth / dirX;
                          const y = dirY * t;
                          if (Math.abs(y) <= halfHeight) intersections.push({ x: centerX - halfWidth, y: centerY + y, distance: t });
                        }
                        if (dirY > 0) {
                          const t = halfHeight / dirY;
                          const x = dirX * t;
                          if (Math.abs(x) <= halfWidth) intersections.push({ x: centerX + x, y: centerY + halfHeight, distance: t });
                        }
                        if (dirY < 0) {
                          const t = -halfHeight / dirY;
                          const x = dirX * t;
                          if (Math.abs(x) <= halfWidth) intersections.push({ x: centerX + x, y: centerY - halfHeight, distance: t });
                        }
                        
                        return intersections.reduce((closest, current) => 
                          !closest || current.distance < closest.distance ? current : closest, null);
                      };
                      
                      // Calculate edge intersections
                      const sourceIntersection = getNodeEdgeIntersection(
                        sourceNode.x, sourceNode.y, sNodeDims.currentWidth, sNodeDims.currentHeight,
                        dx / length, dy / length
                      );
                      
                      const destIntersection = getNodeEdgeIntersection(
                        destNode.x, destNode.y, eNodeDims.currentWidth, eNodeDims.currentHeight,
                        -dx / length, -dy / length
                      );

                      // Determine if each end of the edge should be shortened for arrows
                      // Ensure arrowsToward is a Set (fix for loading from file)
                      const arrowsToward = edge.directionality?.arrowsToward instanceof Set 
                        ? edge.directionality.arrowsToward 
                        : new Set(Array.isArray(edge.directionality?.arrowsToward) ? edge.directionality.arrowsToward : []);
                      
                      // Only shorten connections at ends with arrows or hover state
                      let shouldShortenSource = isHovered || arrowsToward.has(sourceNode.id);
                      let shouldShortenDest = isHovered || arrowsToward.has(destNode.id);
                      if (enableAutoRouting && routingStyle === 'manhattan') {
                        // In Manhattan mode, never shorten for hover—only for actual arrows
                        shouldShortenSource = arrowsToward.has(sourceNode.id);
                        shouldShortenDest = arrowsToward.has(destNode.id);
                      }

                      // Determine actual start/end points for rendering
                      let startX, startY, endX, endY;
                      
                      // For clean routing, use assigned ports; otherwise use intersection-based positioning
                      if (enableAutoRouting && routingStyle === 'clean') {
                        const portAssignment = cleanLaneOffsets.get(edge.id);
                        if (portAssignment) {
                          const { sourcePort, destPort } = portAssignment;
                          
                          // Check if this edge has directional arrows
                          const hasSourceArrow = arrowsToward.has(sourceNode.id);
                          const hasDestArrow = arrowsToward.has(destNode.id);
                          
                          // Use ports for directional connections, centers for non-directional
                          startX = hasSourceArrow ? sourcePort.x : x1;
                          startY = hasSourceArrow ? sourcePort.y : y1;
                          endX = hasDestArrow ? destPort.x : x2;
                          endY = hasDestArrow ? destPort.y : y2;
                        } else {
                          // Fallback to node centers for clean routing
                          startX = x1;
                          startY = y1;
                          endX = x2;
                          endY = y2;
                        }
                      } else {
                        // Use intersection-based positioning for other routing modes
                        startX = shouldShortenSource ? (sourceIntersection?.x || x1) : x1;
                        startY = shouldShortenSource ? (sourceIntersection?.y || y1) : y1;
                        endX = shouldShortenDest ? (destIntersection?.x || x2) : x2;
                        endY = shouldShortenDest ? (destIntersection?.y || y2) : y2;
                      }

                      // Predeclare Manhattan path info for safe use below
                      let manhattanPathD = null;
                      let manhattanSourceSide = null;
                      let manhattanDestSide = null;

                      // When using Manhattan routing, snap to 4 node ports (midpoints of each side)
                      if (enableAutoRouting && routingStyle === 'manhattan') {
                        const sCenterX = sourceNode.x + sNodeDims.currentWidth / 2;
                        const sCenterY = sourceNode.y + sNodeDims.currentHeight / 2;
                        const dCenterX = destNode.x + eNodeDims.currentWidth / 2;
                        const dCenterY = destNode.y + eNodeDims.currentHeight / 2;

                        const sPorts = {
                          top: { x: sCenterX, y: sourceNode.y },
                          bottom: { x: sCenterX, y: sourceNode.y + sNodeDims.currentHeight },
                          left: { x: sourceNode.x, y: sCenterY },
                          right: { x: sourceNode.x + sNodeDims.currentWidth, y: sCenterY },
                        };
                        const dPorts = {
                          top: { x: dCenterX, y: destNode.y },
                          bottom: { x: dCenterX, y: destNode.y + eNodeDims.currentHeight },
                          left: { x: destNode.x, y: dCenterY },
                          right: { x: destNode.x + eNodeDims.currentWidth, y: dCenterY },
                        };

                        const relDx = dCenterX - sCenterX;
                        const relDy = dCenterY - sCenterY;
                        let sPort, dPort;
                        if (Math.abs(relDx) >= Math.abs(relDy)) {
                          // Prefer horizontal ports
                          sPort = relDx >= 0 ? sPorts.right : sPorts.left;
                          dPort = relDx >= 0 ? dPorts.left : dPorts.right;
                        } else {
                          // Prefer vertical ports
                          sPort = relDy >= 0 ? sPorts.bottom : sPorts.top;
                          dPort = relDy >= 0 ? dPorts.top : dPorts.bottom;
                        }
                        startX = sPort.x;
                        startY = sPort.y;
                        endX = dPort.x;
                        endY = dPort.y;

                        // Determine sides for perpendicular entry/exit
                        const sSide = (Math.abs(startY - sourceNode.y) < 0.5) ? 'top'
                                        : (Math.abs(startY - (sourceNode.y + sNodeDims.currentHeight)) < 0.5) ? 'bottom'
                                        : (Math.abs(startX - sourceNode.x) < 0.5) ? 'left' : 'right';
                        const dSide = (Math.abs(endY - destNode.y) < 0.5) ? 'top'
                                        : (Math.abs(endY - (destNode.y + eNodeDims.currentHeight)) < 0.5) ? 'bottom'
                                        : (Math.abs(endX - destNode.x) < 0.5) ? 'left' : 'right';
                        const initOrient = (sSide === 'left' || sSide === 'right') ? 'H' : 'V';
                        const finalOrient = (dSide === 'left' || dSide === 'right') ? 'H' : 'V';

                        const effectiveBends = (manhattanBends === 'auto')
                          ? (initOrient === finalOrient ? 'two' : 'one')
                          : manhattanBends;

                        // Local helpers declared before use to avoid hoisting issues
                        const cornerRadiusLocal = 8;
                        const buildRoundedLPathOriented = (sx, sy, ex, ey, r, firstOrientation /* 'H' | 'V' */) => {
                          if (firstOrientation === 'H') {
                            if (sx === ex || sy === ey) {
                              return `M ${sx},${sy} L ${ex},${ey}`;
                            }
                            const signX = ex > sx ? 1 : -1;
                            const signY = ey > sy ? 1 : -1;
                            const cornerX = ex;
                            const cornerY = sy;
                            const hx = cornerX - signX * r;
                            const hy = cornerY;
                            const vx = cornerX;
                            const vy = cornerY + signY * r;
                            return `M ${sx},${sy} L ${hx},${hy} Q ${cornerX},${cornerY} ${vx},${vy} L ${ex},${ey}`;
                          } else {
                            if (sx === ex || sy === ey) {
                              return `M ${sx},${sy} L ${ex},${ey}`;
                            }
                            const signX = ex > sx ? 1 : -1;
                            const signY = ey > sy ? 1 : -1;
                            const cornerX = sx;
                            const cornerY = ey;
                            const vx = cornerX;
                            const vy = cornerY - signY * r;
                            const hx = cornerX + signX * r;
                            const hy = cornerY;
                            return `M ${sx},${sy} L ${vx},${vy} Q ${cornerX},${cornerY} ${hx},${hy} L ${ex},${ey}`;
                          }
                        };
                        const buildRoundedZPathOriented = (sx, sy, ex, ey, r, pattern /* 'HVH' | 'VHV' */) => {
                          if (sx === ex || sy === ey) {
                            return `M ${sx},${sy} L ${ex},${ey}`;
                          }
                          if (pattern === 'HVH') {
                            // Horizontal → Vertical → Horizontal with rounded corners at both bends
                            const midX = (sx + ex) / 2;
                            const signX1 = midX >= sx ? 1 : -1; // initial horizontal direction
                            const signY = ey >= sy ? 1 : -1;     // vertical direction
                            const signX2 = ex >= midX ? 1 : -1;  // final horizontal direction
                            const hx1 = midX - signX1 * r;       // before first corner
                            const vy1 = sy + signY * r;          // after first corner
                            const vy2 = ey - signY * r;          // before second corner
                            const hx2 = midX + signX2 * r;       // after second corner
                            return `M ${sx},${sy} L ${hx1},${sy} Q ${midX},${sy} ${midX},${vy1} L ${midX},${vy2} Q ${midX},${ey} ${hx2},${ey} L ${ex},${ey}`;
                          } else {
                            // Vertical → Horizontal → Vertical with rounded corners at both bends
                            const midY = (sy + ey) / 2;
                            const signY1 = midY >= sy ? 1 : -1;  // initial vertical direction
                            const signX = ex >= sx ? 1 : -1;      // horizontal direction (same for both H segments)
                            const signY2 = ey >= midY ? 1 : -1;   // final vertical direction
                            const vy1 = midY - signY1 * r;        // before first corner
                            const hx1 = sx + signX * r;           // after first corner
                            const hx2 = ex - signX * r;           // before second corner
                            const vy2 = midY + signY2 * r;        // after second corner
                            return `M ${sx},${sy} L ${sx},${vy1} Q ${sx},${midY} ${hx1},${midY} L ${hx2},${midY} Q ${ex},${midY} ${ex},${vy2} L ${ex},${ey}`;
                          }
                        };
                        let pathD;
                        if (effectiveBends === 'two' && initOrient === finalOrient) {
                          pathD = (initOrient === 'H')
                            ? buildRoundedZPathOriented(startX, startY, endX, endY, cornerRadiusLocal, 'HVH')
                            : buildRoundedZPathOriented(startX, startY, endX, endY, cornerRadiusLocal, 'VHV');
                        } else {
                          pathD = buildRoundedLPathOriented(startX, startY, endX, endY, cornerRadiusLocal, initOrient);
                        }

                        // Assign for rendering and arrow logic
                        manhattanPathD = pathD;
                        manhattanSourceSide = sSide;
                        manhattanDestSide = dSide;
                      }
                  return (
                        <g key={`edge-${edge.id}-${idx}`}>
                                                 {/* Main edge line - always same thickness */}
                    {/* Glow effect for selected or hovered edge */}
                    {(isSelected || isHovered) && (
                      (enableAutoRouting && (routingStyle === 'manhattan' || routingStyle === 'clean')) ? (
                        <path
                          d={(routingStyle === 'manhattan') ? manhattanPathD : (() => {
                            // Use consistent clean routing path helper
                            const cleanPts = generateCleanRoutingPath(edge, sourceNode, destNode, sNodeDims, eNodeDims);
                            return buildRoundedPathFromPoints(cleanPts, 8);
                          })()}
                          fill="none"
                          stroke={edgeColor}
                          strokeWidth="12"
                          opacity={isSelected ? "0.3" : "0.2"}
                          style={{ 
                            filter: `blur(3px) drop-shadow(0 0 8px ${edgeColor})`
                          }}
                          strokeLinecap="round"
                        />
                      ) : (
                      <line
                          x1={startX}
                          y1={startY}
                          x2={endX}
                          y2={endY}
                        stroke={edgeColor}
                        strokeWidth="12"
                        opacity={isSelected ? "0.3" : "0.2"}
                        style={{ 
                          filter: `blur(3px) drop-shadow(0 0 8px ${edgeColor})`
                        }}
                      />
                      )
                    )}
                    
                    {(enableAutoRouting && (routingStyle === 'manhattan' || routingStyle === 'clean')) ? (
                      <>
                        {routingStyle === 'manhattan' && !arrowsToward.has(sourceNode.id) && (
                          <line x1={x1} y1={y1} x2={startX} y2={startY} stroke={edgeColor} strokeWidth={showConnectionNames ? "16" : "6"} strokeLinecap="round" />
                        )}
                        {routingStyle === 'manhattan' && !arrowsToward.has(destNode.id) && (
                          <line x1={endX} y1={endY} x2={x2} y2={y2} stroke={edgeColor} strokeWidth={showConnectionNames ? "16" : "6"} strokeLinecap="round" />
                        )}
                        <path
                          d={(routingStyle === 'manhattan') ? manhattanPathD : (() => {
                            // Use consistent clean routing path helper
                            const cleanPts = generateCleanRoutingPath(edge, sourceNode, destNode, sNodeDims, eNodeDims);
                            return buildRoundedPathFromPoints(cleanPts, 8);
                          })()}
                          fill="none"
                          stroke={edgeColor}
                          strokeWidth={showConnectionNames ? "16" : "6"}
                          style={{ transition: 'stroke 0.2s ease' }}
                          strokeLinecap="round"
                        />
                      </>
                     ) : (
                       <line
                         x1={startX}
                         y1={startY}
                         x2={endX}
                         y2={endY}
                         stroke={edgeColor}
                         strokeWidth={showConnectionNames ? "16" : "6"}
                         style={{ transition: 'stroke 0.2s ease' }}
                       />
                     )}
                           
                           {/* Connection name text - only show when enabled */}
                           {showConnectionNames && (() => {
                             let midX;
                             let midY;
                             let angle;
                             if (enableAutoRouting && routingStyle === 'manhattan') {
                               const horizontalLen = Math.abs(endX - startX);
                               const verticalLen = Math.abs(endY - startY);
                               if (horizontalLen >= verticalLen) {
                                 midX = (startX + endX) / 2;
                                 midY = startY;
                                 angle = 0;
                               } else {
                                 midX = endX;
                                 midY = (startY + endY) / 2;
                                 angle = 90;
                               }
                             } else {
                               midX = (x1 + x2) / 2;
                               midY = (y1 + y2) / 2;
                               angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
                             }
                             
                             // Determine connection name to display
                             let connectionName = 'Connection';
                             if (edge.definitionNodeIds && edge.definitionNodeIds.length > 0) {
                               const definitionNode = nodePrototypesMap.get(edge.definitionNodeIds[0]);
                               if (definitionNode) {
                                 connectionName = definitionNode.name || 'Connection';
                               }
                             } else if (edge.typeNodeId) {
                               const edgePrototype = edgePrototypesMap.get(edge.typeNodeId);
                               if (edgePrototype) {
                                 connectionName = edgePrototype.name || 'Connection';
                               }
                             }
                             
                             // Smart label placement based on routing style
                             if (enableAutoRouting && routingStyle === 'manhattan') {
                               const pathPoints = generateManhattanRoutingPath(edge, sourceNode, destNode, sNodeDims, eNodeDims);
                               const placement = chooseLabelPlacement(pathPoints, connectionName, 24, edge.id);
                               if (placement) {
                                 midX = placement.x;
                                 midY = placement.y;
                                 angle = placement.angle || 0;
                                 
                                 // Register this label placement
                                 const labelRect = {
                                   minX: midX - estimateTextWidth(connectionName, 24) / 2,
                                   maxX: midX + estimateTextWidth(connectionName, 24) / 2,
                                   minY: midY - 24 * 1.1 / 2,
                                   maxY: midY + 24 * 1.1 / 2,
                                 };
                                 placedLabelsRef.current.set(edge.id, {
                                   rect: labelRect,
                                   position: { x: midX, y: midY, angle }
                                 });
                               } else {
                                 // Fallback to simple Manhattan logic
                                 const horizontalLen = Math.abs(endX - startX);
                                 const verticalLen = Math.abs(endY - startY);
                                 if (horizontalLen >= verticalLen) {
                                   midX = (startX + endX) / 2;
                                   midY = startY;
                                   angle = 0;
                                 } else {
                                   midX = endX;
                                   midY = (startY + endY) / 2;
                                   angle = 90;
                                 }
                               }
                             } else if (enableAutoRouting && routingStyle === 'clean') {
                               const pathPoints = generateCleanRoutingPath(edge, sourceNode, destNode, sNodeDims, eNodeDims);
                               const placement = chooseLabelPlacement(pathPoints, connectionName, 24, edge.id);
                               if (placement) {
                                 midX = placement.x;
                                 midY = placement.y;
                                 angle = placement.angle || 0;
                                 
                                 // Register this label placement
                                 const labelRect = {
                                   minX: midX - estimateTextWidth(connectionName, 24) / 2,
                                   maxX: midX + estimateTextWidth(connectionName, 24) / 2,
                                   minY: midY - 24 * 1.1 / 2,
                                   maxY: midY + 24 * 1.1 / 2,
                                 };
                                 placedLabelsRef.current.set(edge.id, {
                                   rect: labelRect,
                                   position: { x: midX, y: midY, angle }
                                 });
                               } else {
                                 // Fallback to midpoint
                                 midX = (x1 + x2) / 2;
                                 midY = (y1 + y2) / 2;
                                 angle = 0;
                               }
                             } else {
                               // Straight line: keep original behavior
                               midX = (x1 + x2) / 2;
                               midY = (y1 + y2) / 2;
                               angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
                             }
                             
                             // Adjust angle to keep text readable (never upside down)
                             const adjustedAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;
                             
                             return (
                               <g>
                                 {/* Canvas-colored text creating a "hole" effect in the connection */}
                                 <text
                                   x={midX}
                                   y={midY}
                                   fill="#bdb5b5"
                                   fontSize="24"
                                   fontWeight="bold"
                                   textAnchor="middle"
                                   dominantBaseline="middle"
                                   transform={`rotate(${adjustedAngle}, ${midX}, ${midY})`}
                                   stroke={edgeColor}
                                   strokeWidth="6"
                                   strokeLinecap="round"
                                   strokeLinejoin="round"
                                   paintOrder="stroke fill"
                                   style={{ pointerEvents: 'none', fontFamily: "'EmOne', sans-serif" }}
                                 >
                                   {connectionName}
                                 </text>
                               </g>
                             );
                           })()}
                           
                           {/* Invisible click area for edge selection - matches hover detection */}
                                                      {(enableAutoRouting && (routingStyle === 'manhattan' || routingStyle === 'clean')) ? (
                             <path
                               d={(routingStyle === 'manhattan') ? manhattanPathD : (() => {
                                 // Use consistent clean routing path helper
                                 const cleanPts = generateCleanRoutingPath(edge, sourceNode, destNode, sNodeDims, eNodeDims);
                                 return buildRoundedPathFromPoints(cleanPts, 8);
                               })()}
                               fill="none"
                               stroke="transparent"
                               strokeWidth="40"
                               style={{ cursor: 'pointer' }}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 
                                 // Handle multiple selection with Ctrl/Cmd key
                                 if (e.ctrlKey || e.metaKey) {
                                   // Toggle this edge in the multiple selection
                                   if (selectedEdgeIds.has(edge.id)) {
                                     removeSelectedEdgeId(edge.id);
                                   } else {
                                     addSelectedEdgeId(edge.id);
                                   }
                                 } else {
                                   // Single selection - clear multiple selection and set single edge
                                   clearSelectedEdgeIds();
                                   setSelectedEdgeId(edge.id);
                                 }
                               }}
                               onDoubleClick={(e) => {
                                 e.stopPropagation();
                                 
                                 // Find the defining node for this edge's connection type
                                 let definingNodeId = null;
                                 
                                 // Check definitionNodeIds first (for custom connection types)
                                 if (edge.definitionNodeIds && edge.definitionNodeIds.length > 0) {
                                   definingNodeId = edge.definitionNodeIds[0];
                                 } else if (edge.typeNodeId) {
                                   // Fallback to typeNodeId (for base connection type)
                                   definingNodeId = edge.typeNodeId;
                                 }
                                 
                                 // Open the panel tab for the defining node
                                 if (definingNodeId) {
                                   openRightPanelNodeTab(definingNodeId);
                                 }
                               }}
                             />
                           ) : (
                           <line
                             x1={x1}
                             y1={y1}
                             x2={x2}
                             y2={y2}
                             stroke="transparent"
                             strokeWidth="40"
                             style={{ cursor: 'pointer' }}
                             onClick={(e) => {
                               e.stopPropagation();
                               
                               // Handle multiple selection with Ctrl/Cmd key
                               if (e.ctrlKey || e.metaKey) {
                                 // Toggle this edge in the multiple selection
                                 if (selectedEdgeIds.has(edge.id)) {
                                   removeSelectedEdgeId(edge.id);
                                 } else {
                                   addSelectedEdgeId(edge.id);
                                 }
                               } else {
                                 // Single selection - clear multiple selection and set single edge
                                 clearSelectedEdgeIds();
                                 setSelectedEdgeId(edge.id);
                               }
                             }}
                             onDoubleClick={(e) => {
                               e.stopPropagation();
                               
                               // Find the defining node for this edge's connection type
                               let definingNodeId = null;
                               
                               // Check definitionNodeIds first (for custom connection types)
                               if (edge.definitionNodeIds && edge.definitionNodeIds.length > 0) {
                                 definingNodeId = edge.definitionNodeIds[0];
                               } else if (edge.typeNodeId) {
                                 // Fallback to typeNodeId (for base connection type)
                                 definingNodeId = edge.typeNodeId;
                               }
                               
                               // Open the panel tab for the defining node
                               if (definingNodeId) {
                                 openRightPanelNodeTab(definingNodeId);
                               }
                             }}
                           />
                           )}
                          
                                                                                                                  {/* Smart directional arrows with clickable toggle */}
                           {(() => {
                             // Calculate arrow positions (use fallback if intersections fail)
                             let sourceArrowX, sourceArrowY, destArrowX, destArrowY, sourceArrowAngle, destArrowAngle;
                             
                             if (enableAutoRouting && routingStyle === 'clean') {
                               // Clean mode: use actual port assignments for proper arrow positioning
                               const offset = showConnectionNames ? 6 : (shouldShortenSource || shouldShortenDest ? 3 : 5);
                               const portAssignment = cleanLaneOffsets.get(edge.id);
                               
                               if (portAssignment) {
                                 const { sourcePort, destPort, sourceSide, destSide } = portAssignment;
                                 
                                 // Position arrows pointing TOWARD the target node (into the edge)
                                 // Arrow tip points toward the node, positioned outside the edge
                                 switch (sourceSide) {
                                   case 'top':
                                     sourceArrowAngle = 90; // Arrow points down toward node
                                     sourceArrowX = sourcePort.x;
                                     sourceArrowY = sourcePort.y - offset;
                                     break;
                                   case 'bottom':
                                     sourceArrowAngle = -90; // Arrow points up toward node
                                     sourceArrowX = sourcePort.x;
                                     sourceArrowY = sourcePort.y + offset;
                                     break;
                                   case 'left':
                                     sourceArrowAngle = 0; // Arrow points right toward node
                                     sourceArrowX = sourcePort.x - offset;
                                     sourceArrowY = sourcePort.y;
                                     break;
                                   case 'right':
                                     sourceArrowAngle = 180; // Arrow points left toward node
                                     sourceArrowX = sourcePort.x + offset;
                                     sourceArrowY = sourcePort.y;
                                     break;
                                 }
                                 
                                 switch (destSide) {
                                   case 'top':
                                     destArrowAngle = 90; // Arrow points down toward node
                                     destArrowX = destPort.x;
                                     destArrowY = destPort.y - offset;
                                     break;
                                   case 'bottom':
                                     destArrowAngle = -90; // Arrow points up toward node
                                     destArrowX = destPort.x;
                                     destArrowY = destPort.y + offset;
                                     break;
                                   case 'left':
                                     destArrowAngle = 0; // Arrow points right toward node
                                     destArrowX = destPort.x - offset;
                                     destArrowY = destPort.y;
                                     break;
                                   case 'right':
                                     destArrowAngle = 180; // Arrow points left toward node
                                     destArrowX = destPort.x + offset;
                                     destArrowY = destPort.y;
                                     break;
                                 }
                               } else {
                                 // Fallback to center-based positioning
                                 const deltaX = endX - startX;
                                 const deltaY = endY - startY;
                                 const isMainlyVertical = Math.abs(deltaY) > Math.abs(deltaX);
                                 
                                 if (isMainlyVertical) {
                                   sourceArrowAngle = deltaY > 0 ? -90 : 90;
                                   sourceArrowX = startX;
                                   sourceArrowY = startY + (deltaY > 0 ? offset : -offset);
                                   destArrowAngle = deltaX > 0 ? 0 : 180;
                                   destArrowX = endX + (deltaX > 0 ? -offset : offset);
                                   destArrowY = endY;
                                 } else {
                                   sourceArrowAngle = deltaX > 0 ? 180 : 0;
                                   sourceArrowX = startX + (deltaX > 0 ? offset : -offset);
                                   sourceArrowY = startY;
                                   destArrowAngle = deltaY > 0 ? 90 : -90;
                                   destArrowX = endX;
                                   destArrowY = endY + (deltaY > 0 ? -offset : offset);
                                 }
                               }
                             } else if (!sourceIntersection || !destIntersection) {
                               // Fallback positioning - arrows/dots closer to connection center  
                               const fallbackOffset = showConnectionNames ? 20 : 
                                                     (shouldShortenSource || shouldShortenDest ? 12 : 15);
                               sourceArrowX = x1 + (dx / length) * fallbackOffset;
                               sourceArrowY = y1 + (dy / length) * fallbackOffset;
                               destArrowX = x2 - (dx / length) * fallbackOffset;
                               destArrowY = y2 - (dy / length) * fallbackOffset;
                               sourceArrowAngle = Math.atan2(-dy, -dx) * (180 / Math.PI);
                               destArrowAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                             } else if (enableAutoRouting && routingStyle === 'clean') {
                               // Clean routing arrow placement - position close to nodes for better visibility
                               const offset = showConnectionNames ? 8 : 6; // Reduced offset for better visibility
                               const portAssignment = cleanLaneOffsets.get(edge.id);
                               
                               if (portAssignment) {
                                 const { sourcePort, destPort, sourceSide, destSide } = portAssignment;
                                 
                                 // Position arrows close to the actual ports, pointing toward the nodes
                                 switch (sourceSide) {
                                   case 'top':
                                     sourceArrowAngle = 90; // Arrow points down toward node
                                     sourceArrowX = sourcePort.x;
                                     sourceArrowY = sourcePort.y - offset;
                                     break;
                                   case 'bottom':
                                     sourceArrowAngle = -90; // Arrow points up toward node
                                     sourceArrowX = sourcePort.x;
                                     sourceArrowY = sourcePort.y + offset;
                                     break;
                                   case 'left':
                                     sourceArrowAngle = 0; // Arrow points right toward node
                                     sourceArrowX = sourcePort.x - offset;
                                     sourceArrowY = sourcePort.y;
                                     break;
                                   case 'right':
                                     sourceArrowAngle = 180; // Arrow points left toward node
                                     sourceArrowX = sourcePort.x + offset;
                                     sourceArrowY = sourcePort.y;
                                     break;
                                 }
                                 
                                 switch (destSide) {
                                   case 'top':
                                     destArrowAngle = 90; // Arrow points down toward node
                                     destArrowX = destPort.x;
                                     destArrowY = destPort.y - offset;
                                     break;
                                   case 'bottom':
                                     destArrowAngle = -90; // Arrow points up toward node
                                     destArrowX = destPort.x;
                                     destArrowY = destPort.y + offset;
                                     break;
                                   case 'left':
                                     destArrowAngle = 0; // Arrow points right toward node
                                     destArrowX = destPort.x - offset;
                                     destArrowY = destPort.y;
                                     break;
                                   case 'right':
                                     destArrowAngle = 180; // Arrow points left toward node
                                     destArrowX = destPort.x + offset;
                                     destArrowY = destPort.y;
                                     break;
                                 }
                               } else {
                                 // Fallback: position arrows close to node centers
                                 sourceArrowX = startX;
                                 sourceArrowY = startY;
                                 sourceArrowAngle = Math.atan2(-dy, -dx) * (180 / Math.PI);
                                 destArrowX = endX;
                                 destArrowY = endY;
                                 destArrowAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                               }
                             } else {
                               // Manhattan-aware arrow placement; falls back to straight orientation
                               const offset = showConnectionNames ? 6 : (shouldShortenSource || shouldShortenDest ? 3 : 5);
                               if (enableAutoRouting && routingStyle === 'manhattan') {
                                 // Destination arrow aligns to terminal segment into destination
                                 const horizontalTerminal = Math.abs(endX - startX) > Math.abs(endY - startY);
                                 if (horizontalTerminal) {
                                   destArrowAngle = (endX >= startX) ? 0 : 180;
                                   destArrowX = endX + ((endX >= startX) ? -offset : offset);
                                   destArrowY = endY;
                                 } else {
                                   destArrowAngle = (endY >= startY) ? 90 : -90;
                                   destArrowX = endX;
                                   destArrowY = endY + ((endY >= startY) ? -offset : offset);
                                 }
                                 // Source arrow aligns to initial segment out of source (pointing back toward source)
                                 const horizontalInitial = Math.abs(endX - startX) > Math.abs(endY - startY);
                                 if (horizontalInitial) {
                                   sourceArrowAngle = (endX - startX) >= 0 ? 180 : 0;
                                   sourceArrowX = startX + ((endX - startX) >= 0 ? offset : -offset);
                                   sourceArrowY = startY;
                                 } else {
                                   sourceArrowAngle = (endY - startY) >= 0 ? -90 : 90;
                                   sourceArrowX = startX;
                                   sourceArrowY = startY + ((endY - startY) >= 0 ? offset : -offset);
                                 }
                             } else {
                               // Precise intersection positioning - adjust based on slope for visual consistency
                               const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
                               const normalizedAngle = angle > 90 ? 180 - angle : angle;
                               // Shorter distance for quantized slopes (hitting node sides) vs diagonal (hitting corners)
                               const isQuantizedSlope = normalizedAngle < 15 || normalizedAngle > 75;
                                 const arrowLength = isQuantizedSlope ? offset * 0.6 : offset;
                               sourceArrowAngle = Math.atan2(-dy, -dx) * (180 / Math.PI);
                               sourceArrowX = sourceIntersection.x + (dx / length) * arrowLength;
                               sourceArrowY = sourceIntersection.y + (dy / length) * arrowLength;
                               destArrowAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                               destArrowX = destIntersection.x - (dx / length) * arrowLength;
                               destArrowY = destIntersection.y - (dy / length) * arrowLength;
                               }
                             }
                             
                             // Override arrow orientation deterministically by Manhattan sides
                             if (enableAutoRouting && routingStyle === 'manhattan') {
                               const sideOffset = showConnectionNames ? 6 : (shouldShortenSource || shouldShortenDest ? 3 : 5);
                               // Destination arrow strictly based on destination side
                               if (manhattanDestSide === 'left') {
                                 destArrowAngle = 0; // rightwards
                                 destArrowX = endX - sideOffset;
                                 destArrowY = endY;
                               } else if (manhattanDestSide === 'right') {
                                 destArrowAngle = 180; // leftwards
                                 destArrowX = endX + sideOffset;
                                 destArrowY = endY;
                               } else if (manhattanDestSide === 'top') {
                                 destArrowAngle = 90; // downwards
                                 destArrowX = endX;
                                 destArrowY = endY - sideOffset;
                               } else if (manhattanDestSide === 'bottom') {
                                 destArrowAngle = -90; // upwards
                                 destArrowX = endX;
                                 destArrowY = endY + sideOffset;
                               }
                               // Source arrow strictly based on source side (points toward the source node)
                               if (manhattanSourceSide === 'left') {
                                 sourceArrowAngle = 0; // rightwards
                                 sourceArrowX = startX - sideOffset;
                                 sourceArrowY = startY;
                               } else if (manhattanSourceSide === 'right') {
                                 sourceArrowAngle = 180; // leftwards
                                 sourceArrowX = startX + sideOffset;
                                 sourceArrowY = startY;
                               } else if (manhattanSourceSide === 'top') {
                                 sourceArrowAngle = 90; // downwards
                                 sourceArrowX = startX;
                                 sourceArrowY = startY - sideOffset;
                               } else if (manhattanSourceSide === 'bottom') {
                                 sourceArrowAngle = -90; // upwards
                                 sourceArrowX = startX;
                                 sourceArrowY = startY + sideOffset;
                               }
                             }
                             
                             const handleArrowClick = (nodeId, e) => {
                               e.stopPropagation();
                               
                               // Toggle the arrow state for the specific node
                               updateEdge(edge.id, (draft) => {
                                 // Ensure directionality object exists
                                 if (!draft.directionality) {
                                   draft.directionality = { arrowsToward: new Set() };
                                 }
                                 // Ensure arrowsToward is a Set
                                 if (!draft.directionality.arrowsToward) {
                                   draft.directionality.arrowsToward = new Set();
                                 }
                                 
                                 // Toggle arrow for this specific node
                                 if (draft.directionality.arrowsToward.has(nodeId)) {
                                   draft.directionality.arrowsToward.delete(nodeId);
                                 } else {
                                   draft.directionality.arrowsToward.add(nodeId);
                                 }
                               });
                             };
                             
                             return (
                               <>
                                 {/* Source Arrow - visible if arrow points toward source node */}
                                 {arrowsToward.has(sourceNode.id) && (
                                   <g 
                                     transform={`translate(${sourceArrowX}, ${sourceArrowY}) rotate(${sourceArrowAngle + 90})`}
                                     style={{ cursor: 'pointer' }}
                                     onClick={(e) => handleArrowClick(sourceNode.id, e)}
                                     onMouseDown={(e) => e.stopPropagation()}
                                   >
                                     {/* Glow effect for arrow - only when selected or hovered */}
                                     {(isSelected || isHovered) && (
                                       <polygon
                                         points="-12,15 12,15 0,-15"
                                         fill={edgeColor}
                                         stroke={edgeColor}
                                         strokeWidth="8"
                                         strokeLinejoin="round"
                                         strokeLinecap="round"
                                         opacity={isSelected ? "0.3" : "0.2"}
                                         style={{ 
                                           filter: `blur(2px) drop-shadow(0 0 6px ${edgeColor})`
                                         }}
                                       />
                                     )}
                                     <polygon
                                       points={showConnectionNames ? "-18,22 18,22 0,-22" : "-12,15 12,15 0,-15"}
                                       fill={edgeColor}
                                       stroke={edgeColor}
                                       strokeWidth="6"
                                       strokeLinejoin="round"
                                       strokeLinecap="round"
                                       paintOrder="stroke fill"
                                     />
                                   </g>
                                 )}
                                 
                                 {/* Destination Arrow - visible if arrow points toward destination node */}
                                 {arrowsToward.has(destNode.id) && (
                                   <g 
                                     transform={`translate(${destArrowX}, ${destArrowY}) rotate(${destArrowAngle + 90})`}
                                     style={{ cursor: 'pointer' }}
                                     onClick={(e) => handleArrowClick(destNode.id, e)}
                                     onMouseDown={(e) => e.stopPropagation()}
                                   >
                                     {/* Glow effect for arrow - only when selected or hovered */}
                                     {(isSelected || isHovered) && (
                                       <polygon
                                         points="-12,15 12,15 0,-15"
                                         fill={edgeColor}
                                         stroke={edgeColor}
                                         strokeWidth="8"
                                         strokeLinejoin="round"
                                         strokeLinecap="round"
                                         opacity={isSelected ? "0.3" : "0.2"}
                                         style={{ 
                                           filter: `blur(2px) drop-shadow(0 0 6px ${edgeColor})`
                                         }}
                                       />
                                     )}
                                     <polygon
                                       points={showConnectionNames ? "-18,22 18,22 0,-22" : "-12,15 12,15 0,-15"}
                                       fill={edgeColor}
                                       stroke={edgeColor}
                                       strokeWidth="6"
                                       strokeLinejoin="round"
                                       strokeLinecap="round"
                                       paintOrder="stroke fill"
                                     />
                                   </g>
                                 )}

                                 {/* Hover Dots - only visible when hovering and using straight routing */}
                                 {isHovered && (!enableAutoRouting || routingStyle === 'straight') && (
                                   <>
                                     {/* Source Dot - only show if arrow not pointing toward source */}
                                     {!arrowsToward.has(sourceNode.id) && (
                                       <g>
                                         <circle
                                           cx={sourceArrowX}
                                           cy={sourceArrowY}
                                           r="20"
                                           fill="transparent"
                                           style={{ cursor: 'pointer' }}
                                           onClick={(e) => handleArrowClick(sourceNode.id, e)}
                                           onMouseDown={(e) => e.stopPropagation()}
                                         />
                                         <circle
                                           cx={sourceArrowX}
                                           cy={sourceArrowY}
                                           r={showConnectionNames ? "16" : "8"}
                                           fill={edgeColor}
                                           style={{ pointerEvents: 'none' }}
                                         />
                                       </g>
                                     )}
                                     
                                     {/* Destination Dot - only show if arrow not pointing toward destination */}
                                     {!arrowsToward.has(destNode.id) && (
                                       <g>
                                         <circle
                                           cx={destArrowX}
                                           cy={destArrowY}
                                           r="20"
                                           fill="transparent"
                                           style={{ cursor: 'pointer' }}
                                           onClick={(e) => handleArrowClick(destNode.id, e)}
                                           onMouseDown={(e) => e.stopPropagation()}
                                         />
                                         <circle
                                           cx={destArrowX}
                                           cy={destArrowY}
                                           r={showConnectionNames ? "16" : "8"}
                                           fill={edgeColor}
                                           style={{ pointerEvents: 'none' }}
                                         />
                                       </g>
                                     )}
                                   </>
                                 )}
                               </>
                             );
                           })()}
                        </g>
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
                   const draggingNodeId = draggingNodeInfo?.primaryId || draggingNodeInfo?.instanceId;

                   // Determine which node should be treated as "active" for stacking, 
                   // giving priority to previewing, then the node whose PieMenu is currently active/animating.
                   let nodeIdToKeepActiveForStacking = previewingNodeId || currentPieMenuData?.node?.id || selectedNodeIdForPieMenu;
                   if (nodeIdToKeepActiveForStacking === draggingNodeId) {
                     nodeIdToKeepActiveForStacking = null; // Dragging node is handled separately
                   }

                   const otherNodes = nodes.filter(node => 
                     node.id !== nodeIdToKeepActiveForStacking && 
                     node.id !== draggingNodeId &&
                     visibleNodeIds.has(node.id)
                   );

                   const activeNodeToRender = nodeIdToKeepActiveForStacking 
                     ? nodes.find(n => n.id === nodeIdToKeepActiveForStacking)
                     : null;

                   const draggingNodeToRender = draggingNodeId
                     ? nodes.find(n => n.id === draggingNodeId)
                     : null;

                   return (
                     <>
                       {/* Render "Other" Nodes first */}                       
                       {otherNodes.map((node) => {
                         const isPreviewing = previewingNodeId === node.id; // Should be false or irrelevant for these nodes
                         const descriptionContent = getNodeDescriptionContent(node, isPreviewing);
                         const dimensions = getNodeDimensions(node, isPreviewing, descriptionContent);
                         
                         // Do not render the node that the abstraction carousel is open for
                         if (abstractionCarouselVisible && abstractionCarouselNode?.id === node.id) {
                           return null;
                         }

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
                             descriptionAreaHeight={dimensions.descriptionAreaHeight}
                             isSelected={selectedInstanceIds.has(node.id)}
                             isDragging={false} // These are explicitly not the dragging node
                             onMouseDown={(e) => handleNodeMouseDown(node, e)}
                             isPreviewing={isPreviewing}
                             allNodes={nodes}
                             isEditingOnCanvas={node.id === editingNodeIdOnCanvas}
                             onCommitCanvasEdit={(instanceId, newName, isRealTime = false) => { 
                               storeActions.updateNodePrototype(node.prototypeId, draft => { draft.name = newName; }); 
                               if (!isRealTime) setEditingNodeIdOnCanvas(null); 
                             }}
                             onCancelCanvasEdit={() => setEditingNodeIdOnCanvas(null)}
                             onCreateDefinition={(prototypeId) => {
                               if (mouseMoved.current) return;
                               storeActions.createAndAssignGraphDefinition(prototypeId);
                             }}
                             onAddNodeToDefinition={(prototypeId) => {
                               // Create a new alternative definition for the node
                               storeActions.createAndAssignGraphDefinition(prototypeId);
                             }}
                             onDeleteDefinition={(prototypeId, graphId) => {
                               // Delete the specific definition graph from the node
                               storeActions.removeDefinitionFromNode(prototypeId, graphId);
                             }}
                             onExpandDefinition={(instanceId, prototypeId, graphId) => {
                               if (graphId) {
                                 // Node has an existing definition to expand
                                 startHurtleAnimation(instanceId, graphId, prototypeId);
                               } else {
                                 // Node has no definitions - create one, then animate
                                 const sourceGraphId = activeGraphId; // Capture current graph before it changes
                                 storeActions.createAndAssignGraphDefinitionWithoutActivation(prototypeId);
                                 
                                 setTimeout(() => {
                                   const currentState = useGraphStore.getState();
                                   const updatedNodeData = currentState.nodePrototypes.get(prototypeId);
                                   if (updatedNodeData?.definitionGraphIds?.length > 0) {
                                     const newGraphId = updatedNodeData.definitionGraphIds[updatedNodeData.definitionGraphIds.length - 1];
                                     startHurtleAnimation(instanceId, newGraphId, prototypeId, sourceGraphId);
                                   } else {
                                     console.error(`[PieMenu Expand] Could not find new definition for node ${prototypeId} after creation.`);
                                   }
                                 }, 50);
                               }
                             }}
                             storeActions={storeActions}
                             connections={edges}
                             currentDefinitionIndex={nodeDefinitionIndices.get(`${node.prototypeId}-${activeGraphId}`) || 0}
                             onNavigateDefinition={(prototypeId, newIndex) => {
                               const contextKey = `${prototypeId}-${activeGraphId}`;
                               setNodeDefinitionIndices(prev => new Map(prev.set(contextKey, newIndex)));
                             }}

                           />
                         );
                       })}

                       {/* Render The PieMenu next (it will be visually under the active node) */} 
                       {isPieMenuRendered && currentPieMenuData && (
                         <PieMenu
                           node={currentPieMenuData.node}
                           buttons={currentPieMenuData.buttons}
                           nodeDimensions={currentPieMenuData.nodeDimensions}
                           isVisible={(
                             currentPieMenuData?.node?.id === selectedNodeIdForPieMenu &&
                             (!isTransitioningPieMenu || abstractionPrompt.visible || carouselAnimationState === 'exiting') &&
                             !(draggingNodeInfo && 
                               (draggingNodeInfo.primaryId === selectedNodeIdForPieMenu || draggingNodeInfo.instanceId === selectedNodeIdForPieMenu)
                             )
                           )}
                                      onExitAnimationComplete={() => {
             // console.log("[NodeCanvas] PieMenu onExitAnimationComplete: Resetting transition and render state.");
             setIsPieMenuRendered(false); 
             setCurrentPieMenuData(null); 
             const wasTransitioning = isTransitioningPieMenu;
             const pendingAbstractionId = pendingAbstractionNodeId;
             const wasInCarousel = abstractionCarouselVisible; // Check if we were in carousel mode before transition
             
             // The node that was just active before the pie menu disappeared
             const lastActiveNodeId = selectedNodeIdForPieMenu; 
             setPendingAbstractionNodeId(null);
             
             if (wasTransitioning && pendingAbstractionId) {
               // This was an abstraction transition - set up the carousel with entrance animation
               setIsTransitioningPieMenu(false); 
               const nodeData = nodes.find(n => n.id === pendingAbstractionId);
               if (nodeData) {
                 setAbstractionCarouselNode(nodeData);
                 setCarouselAnimationState('entering');
                 setAbstractionCarouselVisible(true);
                 // IMPORTANT: Re-select the node to show the new abstraction pie menu
                 setSelectedNodeIdForPieMenu(pendingAbstractionId);
               }
             } else if (wasTransitioning && wasInCarousel) {
                // Check if this was an internal stage transition vs carousel exit
                if (isCarouselStageTransition) {
                  // This was an internal stage transition - stay in carousel, just update PieMenu
                  setIsCarouselStageTransition(false); // Reset the flag
                  setIsTransitioningPieMenu(false);
                  
                  // Change the stage here after the shrink animation completes
                  if (carouselPieMenuStage === 1) {
                    setCarouselPieMenuStage(2);
                    console.log(`[PieMenu Action] *** STAGE TRANSITION COMPLETED *** Changed to stage 2`);
                  } else if (carouselPieMenuStage === 2) {
                    setCarouselPieMenuStage(1);
                    console.log(`[PieMenu Action] *** STAGE TRANSITION COMPLETED *** Changed to stage 1`);
                  }
                  
                  // Re-select the node to show the new stage PieMenu
                  if (lastActiveNodeId) {
                    setSelectedNodeIdForPieMenu(lastActiveNodeId);
                  }
                } else {
                  // This was a "back" transition from the carousel - start exit animation now
                  setCarouselAnimationState('exiting');
                  // DON'T set isTransitioningPieMenu(false) yet - wait for carousel to finish
                  // The carousel's onExitAnimationComplete will show the regular pie menu
                }
             } else if (wasTransitioning) {
               setIsTransitioningPieMenu(false); 
               const currentlySelectedNodeId = [...selectedInstanceIds][0]; 
               if (currentlySelectedNodeId) {
                   const selectedNodeIsPreviewing = previewingNodeId === currentlySelectedNodeId;
                   if (selectedNodeIsPreviewing) { 
                       setPreviewingNodeId(null);
                   } else { 
                       setPreviewingNodeId(currentlySelectedNodeId);
                   }
                   setSelectedNodeIdForPieMenu(currentlySelectedNodeId); 
               } else {
                    setPreviewingNodeId(null); 
               }
             } else {
               // Not transitioning, just clean exit
               setIsTransitioningPieMenu(false);
             }
           }}
                         />
                       )}



                       {/* Render the "Active" Node (if it exists and not being dragged) */} 
                       {activeNodeToRender && visibleNodeIds.has(activeNodeToRender.id) && (
                         (() => {
                           const isPreviewing = previewingNodeId === activeNodeToRender.id;
                           const descriptionContent = getNodeDescriptionContent(activeNodeToRender, isPreviewing);
                           const dimensions = getNodeDimensions(activeNodeToRender, isPreviewing, descriptionContent);
                           
                           // Hide if its carousel is open
                           if (abstractionCarouselVisible && abstractionCarouselNode?.id === activeNodeToRender.id) {
                             return null;
                           }

                           return (
                             <Node
                               key={activeNodeToRender.id}
                               node={activeNodeToRender}
                               currentWidth={dimensions.currentWidth}
                               currentHeight={dimensions.currentHeight}
                               textAreaHeight={dimensions.textAreaHeight}
                               imageWidth={dimensions.imageWidth}
                               imageHeight={dimensions.calculatedImageHeight}
                               innerNetworkWidth={dimensions.innerNetworkWidth}
                               innerNetworkHeight={dimensions.innerNetworkHeight}
                               descriptionAreaHeight={dimensions.descriptionAreaHeight}
                               isSelected={selectedInstanceIds.has(activeNodeToRender.id)}
                               isDragging={false} // Explicitly not the dragging node if rendered here
                               onMouseDown={(e) => handleNodeMouseDown(activeNodeToRender, e)}
                               isPreviewing={isPreviewing}
                               allNodes={nodes}
                               isEditingOnCanvas={activeNodeToRender.id === editingNodeIdOnCanvas}
                               onCommitCanvasEdit={(instanceId, newName, isRealTime = false) => { 
                                 storeActions.updateNodePrototype(activeNodeToRender.prototypeId, draft => { draft.name = newName; }); 
                                 if (!isRealTime) setEditingNodeIdOnCanvas(null); 
                               }}
                               onCancelCanvasEdit={() => setEditingNodeIdOnCanvas(null)}
                               onCreateDefinition={(prototypeId) => {
                                 if (mouseMoved.current) return;
                                 storeActions.createAndAssignGraphDefinition(prototypeId);
                               }}
                               onAddNodeToDefinition={(prototypeId) => {
                                 // Create a new alternative definition for the node
                                 storeActions.createAndAssignGraphDefinition(prototypeId);
                               }}
                               onDeleteDefinition={(prototypeId, graphId) => {
                                 // Delete the specific definition graph from the node
                                 storeActions.removeDefinitionFromNode(prototypeId, graphId);
                               }}
                               onExpandDefinition={(instanceId, prototypeId, graphId) => {
                                 if (graphId) {
                                   // Node has an existing definition to expand
                                   startHurtleAnimation(instanceId, graphId, prototypeId);
                                 } else {
                                   // Node has no definitions - create one, then animate
                                   const sourceGraphId = activeGraphId; // Capture current graph before it changes
                                   storeActions.createAndAssignGraphDefinitionWithoutActivation(prototypeId);
                                   
                                   setTimeout(() => {
                                     const currentState = useGraphStore.getState();
                                     const updatedNodeData = currentState.nodePrototypes.get(prototypeId);
                                     if (updatedNodeData?.definitionGraphIds?.length > 0) {
                                       const newGraphId = updatedNodeData.definitionGraphIds[updatedNodeData.definitionGraphIds.length - 1];
                                       startHurtleAnimation(instanceId, newGraphId, prototypeId, sourceGraphId);
                                     } else {
                                       console.error(`[PieMenu Expand] Could not find new definition for node ${prototypeId} after creation.`);
                                     }
                                   }, 50);
                                 }
                               }}
                               storeActions={storeActions}
                               connections={edges}
                               currentDefinitionIndex={nodeDefinitionIndices.get(`${activeNodeToRender.prototypeId}-${activeGraphId}`) || 0}
                               onNavigateDefinition={(prototypeId, newIndex) => {
                                 const contextKey = `${prototypeId}-${activeGraphId}`;
                                 setNodeDefinitionIndices(prev => new Map(prev.set(contextKey, newIndex)));
                               }}

                             />
                           );
                         })()
                       )}

                       {/* Render the Dragging Node last (on top) */} 
                       {draggingNodeToRender && visibleNodeIds.has(draggingNodeToRender.id) && (
                         (() => {
                           const isPreviewing = previewingNodeId === draggingNodeToRender.id;
                           const descriptionContent = getNodeDescriptionContent(draggingNodeToRender, isPreviewing);
                           const dimensions = getNodeDimensions(draggingNodeToRender, isPreviewing, descriptionContent);
                           
                           // Hide if its carousel is open
                           if (abstractionCarouselVisible && abstractionCarouselNode?.id === draggingNodeToRender.id) {
                             return null;
                           }

                           return (
                             <Node
                               key={draggingNodeToRender.id}
                               node={draggingNodeToRender}
                               currentWidth={dimensions.currentWidth}
                               currentHeight={dimensions.currentHeight}
                               textAreaHeight={dimensions.textAreaHeight}
                               imageWidth={dimensions.imageWidth}
                               imageHeight={dimensions.calculatedImageHeight}
                               innerNetworkWidth={dimensions.innerNetworkWidth}
                               innerNetworkHeight={dimensions.innerNetworkHeight}
                               descriptionAreaHeight={dimensions.descriptionAreaHeight}
                               isSelected={selectedInstanceIds.has(draggingNodeToRender.id)}
                               isDragging={true} // This is the dragging node
                               onMouseDown={(e) => handleNodeMouseDown(draggingNodeToRender, e)}
                               isPreviewing={isPreviewing}
                               allNodes={nodes}
                               isEditingOnCanvas={draggingNodeToRender.id === editingNodeIdOnCanvas}
                               onCommitCanvasEdit={(instanceId, newName, isRealTime = false) => { 
                                 storeActions.updateNodePrototype(draggingNodeToRender.prototypeId, draft => { draft.name = newName; }); 
                                 if (!isRealTime) setEditingNodeIdOnCanvas(null); 
                               }}
                               onCancelCanvasEdit={() => setEditingNodeIdOnCanvas(null)}
                               onCreateDefinition={(prototypeId) => {
                                 if (mouseMoved.current) return;
                                 storeActions.createAndAssignGraphDefinition(prototypeId);
                               }}
                               onAddNodeToDefinition={(prototypeId) => {
                                 // Create a new alternative definition for the node
                                 storeActions.createAndAssignGraphDefinition(prototypeId);
                               }}
                               onDeleteDefinition={(prototypeId, graphId) => {
                                 // Delete the specific definition graph from the node
                                 storeActions.removeDefinitionFromNode(prototypeId, graphId);
                               }}
                               onExpandDefinition={(instanceId, prototypeId, graphId) => {
                                 if (graphId) {
                                   // Node has an existing definition to expand
                                   startHurtleAnimation(instanceId, graphId, prototypeId);
                                 } else {
                                   // Node has no definitions - create one, then animate
                                   const sourceGraphId = activeGraphId; // Capture current graph before it changes
                                   storeActions.createAndAssignGraphDefinitionWithoutActivation(prototypeId);
                                   
                                   setTimeout(() => {
                                     const currentState = useGraphStore.getState();
                                     const updatedNodeData = currentState.nodePrototypes.get(prototypeId);
                                     if (updatedNodeData?.definitionGraphIds?.length > 0) {
                                       const newGraphId = updatedNodeData.definitionGraphIds[updatedNodeData.definitionGraphIds.length - 1];
                                       startHurtleAnimation(instanceId, newGraphId, prototypeId, sourceGraphId);
                                     } else {
                                       console.error(`[Node OnExpand] Could not find new definition for node ${prototypeId} after creation.`);
                                     }
                                   }, 50);
                                 }
                               }}
                               storeActions={storeActions}
                               connections={edges}
                               currentDefinitionIndex={nodeDefinitionIndices.get(`${draggingNodeToRender.prototypeId}-${activeGraphId}`) || 0}
                               onNavigateDefinition={(prototypeId, newIndex) => {
                                 const contextKey = `${prototypeId}-${activeGraphId}`;
                                 setNodeDefinitionIndices(prev => new Map(prev.set(contextKey, newIndex)));
                               }}

                             />
                           );
                         })()
                       )}
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
                </>
               )}
            </svg>
          )}

          {/* Overlay panel resizers (outside panels) */}
          {renderPanelResizers()}

          {/* Single UnifiedSelector instance with dynamic props */}
          {(() => {
            const anyVisible = nodeNamePrompt.visible || connectionNamePrompt.visible || abstractionPrompt.visible;
            if (!anyVisible) return null;
            if (nodeNamePrompt.visible) {
              return (
                <UnifiedSelector
                  mode="node-creation"
                  isVisible={true}
                  leftPanelExpanded={leftPanelExpanded}
                  rightPanelExpanded={rightPanelExpanded}
                  onClose={() => { setDialogColorPickerVisible(false); handleClosePrompt(); }}
                  onSubmit={({ name, color }) => {
                    if (name && plusSign) {
                      setPlusSign(ps => ps && { ...ps, mode: 'morph', tempName: name, selectedColor: color });
                    } else {
                      setPlusSign(ps => ps && { ...ps, mode: 'disappear' });
                    }
                    setNodeNamePrompt({ visible: false, name: '', color: null });
                    setDialogColorPickerVisible(false);
                  }}
                  onNodeSelect={handleNodeSelection}
                  initialName={nodeNamePrompt.name}
                  initialColor={nodeNamePrompt.color}
                  title="Name Your Thing"
                  subtitle="Add a new Thing to this Web."
                  searchTerm={nodeNamePrompt.name}
                />
              );
            }
            if (connectionNamePrompt.visible) {
              return (
                <UnifiedSelector
                  mode="connection-creation"
                  isVisible={true}
                  leftPanelExpanded={leftPanelExpanded}
                  rightPanelExpanded={rightPanelExpanded}
                  onClose={() => { setDialogColorPickerVisible(false); setConnectionNamePrompt({ visible: false, name: '', color: null, edgeId: null }); }}
                  onSubmit={({ name, color }) => {
                    if (name.trim()) {
                      const newConnectionNodeId = uuidv4();
                      addNodePrototype({ id: newConnectionNodeId, name: name.trim(), description: '', picture: null, color: color || NODE_DEFAULT_COLOR, typeNodeId: null, definitionGraphIds: [] });
                      if (connectionNamePrompt.edgeId) {
                        updateEdge(connectionNamePrompt.edgeId, (draft) => { draft.definitionNodeIds = [newConnectionNodeId]; });
                      }
                      setConnectionNamePrompt({ visible: false, name: '', color: null, edgeId: null });
                      setDialogColorPickerVisible(false);
                    }
                  }}
                  onNodeSelect={(node) => {
                    if (connectionNamePrompt.edgeId) {
                      updateEdge(connectionNamePrompt.edgeId, (draft) => { draft.definitionNodeIds = [node.id]; });
                    }
                    setConnectionNamePrompt({ visible: false, name: '', color: null, edgeId: null });
                    setDialogColorPickerVisible(false);
                  }}
                  initialName={connectionNamePrompt.name}
                  initialColor={connectionNamePrompt.color}
                  title="Name Your Connection"
                  subtitle="The Thing that will define your Connection,<br />in verb form if available."
                  searchTerm={connectionNamePrompt.name}
                />
              );
            }
            // Abstraction prompt
            return (
              <UnifiedSelector
                mode="abstraction-node-creation"
                isVisible={true}
                leftPanelExpanded={leftPanelExpanded}
                rightPanelExpanded={rightPanelExpanded}
                onClose={() => {
                  console.log(`[Abstraction] Closing UnifiedSelector without creating node`);
                  console.log(`[Abstraction] Current selectedNodeIdForPieMenu before close: ${selectedNodeIdForPieMenu}`);
                  setAbstractionPrompt({ visible: false, name: '', color: null, direction: 'above', nodeId: null, carouselLevel: null });
                  setCarouselPieMenuStage(1);
                  setIsCarouselStageTransition(true);
                  if (abstractionCarouselNode && !selectedNodeIdForPieMenu) {
                    console.log(`[Abstraction] Restoring selectedNodeIdForPieMenu after close`);
                    setSelectedNodeIdForPieMenu(abstractionCarouselNode.id);
                  }
                }}
                onSubmit={handleAbstractionSubmit}
                onNodeSelect={(node) => { console.log(`[Abstraction] Selected existing node:`, node); handleAbstractionSubmit({ name: node.name, color: node.color }); }}
                initialName={abstractionPrompt.name}
                initialColor={abstractionPrompt.color}
                title={`Add ${abstractionPrompt.direction === 'above' ? 'Above' : 'Below'}`}
                subtitle={`Create a ${abstractionPrompt.direction === 'above' ? 'more abstract' : 'more specific'} node in the abstraction chain`}
                abstractionDirection={abstractionPrompt.direction}
              />
            );
          })()}
          
          {debugMode && (
            <DebugOverlay 
              debugData={debugData}
              hideOverlay={() => setDebugMode(false)}
            />
          )}
        </div>

        {/* Dynamic Particle Transfer - starts under node, grows during acceleration, perfect z-layering */}
        {hurtleAnimation && (
          <div
            style={{
              position: 'fixed',
              left: (hurtleAnimation.currentPos?.x || hurtleAnimation.startPos.x) - ((hurtleAnimation.currentOrbSize || hurtleAnimation.orbSize) / 2),
              top: (hurtleAnimation.currentPos?.y || hurtleAnimation.startPos.y) - ((hurtleAnimation.currentOrbSize || hurtleAnimation.orbSize) / 2),
              width: hurtleAnimation.currentOrbSize || hurtleAnimation.orbSize,
              height: hurtleAnimation.currentOrbSize || hurtleAnimation.orbSize,
              backgroundColor: hurtleAnimation.nodeColor,
              borderRadius: '50%', // Perfect circle
              zIndex: hurtleAnimation.currentZIndex || 1000, // Dynamic z-index based on animation progress
              pointerEvents: 'none',
              transition: 'none',
              opacity: hurtleAnimation.progress > 0.9 ? (1 - (hurtleAnimation.progress - 0.9) * 10) : 1, // Fade out at the very end
            }}
          />
        )}

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
          nodeDefinitionIndices={nodeDefinitionIndices}
          onStartHurtleAnimationFromPanel={startHurtleAnimationFromPanel}
          leftPanelExpanded={leftPanelExpanded}
          rightPanelExpanded={rightPanelExpanded}
        />
      </div>

      {/* TypeList Component */}
      <TypeList 
        nodes={nodes}
        setSelectedNodes={setSelectedInstanceIds}
        selectedNodes={selectedInstanceIds}
      />

      {/* ConnectionControlPanel Component - with animation */}
      {(controlPanelShouldShow || controlPanelVisible) && (
        <ConnectionControlPanel
          selectedEdge={edgesMap.get(selectedEdgeId)}
          onClose={handleControlPanelClose}
          typeListOpen={typeListMode !== 'closed'}
          onOpenConnectionDialog={handleOpenConnectionDialog}
          isVisible={controlPanelVisible}
          onAnimationComplete={handleControlPanelAnimationComplete}
          onStartHurtleAnimationFromPanel={startHurtleAnimationFromPanel}
        />
      )}

      {/* AbstractionControlPanel Component - with animation */}
      {(abstractionControlPanelShouldShow || abstractionControlPanelVisible) && (
        <AbstractionControlPanel
          selectedNode={abstractionCarouselNode}
          currentDimension={currentAbstractionDimension}
          availableDimensions={abstractionDimensions}
          onDimensionChange={handleAbstractionDimensionChange}
          onAddDimension={handleAddAbstractionDimension}
          onDeleteDimension={handleDeleteAbstractionDimension}
          onExpandDimension={handleExpandAbstractionDimension}
          typeListOpen={typeListMode !== 'closed'}
          isVisible={abstractionControlPanelVisible}
          onAnimationComplete={handleAbstractionControlPanelAnimationComplete}
        />
      )}

      {/* AbstractionCarousel Component */}
      {abstractionCarouselVisible && abstractionCarouselNode && (
        <AbstractionCarousel
          isVisible={abstractionCarouselVisible}
          selectedNode={abstractionCarouselNode}
          panOffset={panOffset}
          zoomLevel={zoomLevel}
          containerRef={containerRef}
          debugMode={debugMode}
          animationState={carouselAnimationState}
          onAnimationStateChange={onCarouselAnimationStateChange}
          onClose={onCarouselClose}
          onReplaceNode={onCarouselReplaceNode}
          onScaleChange={setCarouselFocusedNodeScale}
          onFocusedNodeDimensions={setCarouselFocusedNodeDimensions}
          onFocusedNodeChange={setCarouselFocusedNode}
          onExitAnimationComplete={onCarouselExitAnimationComplete}
        />
      )}
      
      {/* Dialog Color Picker Component */}
      {dialogColorPickerVisible && (
        <ColorPicker
          isVisible={dialogColorPickerVisible}
          onClose={handleDialogColorPickerClose}
          onColorChange={handleDialogColorChange}
          currentColor={
            nodeNamePrompt.visible 
              ? (nodeNamePrompt.color || NODE_DEFAULT_COLOR)
              : (connectionNamePrompt.color || NODE_DEFAULT_COLOR)
          }
          position={dialogColorPickerPosition}
          direction="down-left"
          parentContainerRef={dialogContainerRef}
        />
      )}

      {/* Pie Menu Color Picker Component */}
      {pieMenuColorPickerVisible && activePieMenuColorNodeId && (
        <ColorPicker
          isVisible={pieMenuColorPickerVisible}
          onClose={handlePieMenuColorPickerClose}
          onColorChange={handlePieMenuColorChange}
          currentColor={(() => {
            const node = nodes.find(n => n.id === activePieMenuColorNodeId);
            return node?.color || 'maroon';
          })()}
          position={pieMenuColorPickerPosition}
          direction="down-left"
        />
      )}



      {/* <div>NodeCanvas Simplified - Testing Loop</div> */}
    </div>
  );
}

export default NodeCanvas;