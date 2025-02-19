import React, { useState, useRef, useEffect } from 'react';
import './NodeCanvas.css';
import { X } from 'lucide-react';
import Header from './Header.jsx';
import DebugOverlay from './DebugOverlay.jsx';
import { useCanvasWorker } from './useCanvasWorker.js';

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
  PLUS_SIGN_ANIMATION_DURATION
} from './constants';

import Panel from './Panel';

// Check if user's on a Mac and then store it
const isMac = navigator.platform.toUpperCase().includes('MAC');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const duration = (mode === 'morph') ? morphDuration : appearDisappearDuration;

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
        color: (mode === 'morph')
          ? (easeT < 0.5 ? startColor : endColor)
          : '#DEDADA',
        lineOpacity: (mode === 'morph')
          ? lerp(startLineOp, endLineOp, Math.min(easeT * 3, 1))
          : lerp(startLineOp, endLineOp, easeT),
        textOpacity: (mode === 'morph')
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

  const {
    rotation,
    width,
    height,
    cornerRadius,
    color,
    lineOpacity,
    textOpacity,
  } = plusRef.current;

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

const NodeCanvas = () => {
  const [nodes, setNodes] = useState([
    {
      id: 1,
      x: 500,
      y: 500,
      name: 'Node 1',
      scale: 1,
      bio: '',
      image: null,
    },
    {
      id: 2,
      x: 1000,
      y: 800,
      name: 'Node 2',
      scale: 1,
      bio: '',
      image: null,
    },
  ]);

  // Constants for selecting nodes
  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const wasSelectionBox = useRef(false);

  const [draggingNode, setDraggingNode] = useState(null);
  const [longPressingNode, setLongPressingNode] = useState(null);
  const [drawingConnectionFrom, setDrawingConnectionFrom] = useState(null);
  const [connections, setConnections] = useState([]);
  const wasDrawingConnection = useRef(false);

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
    width: window.innerWidth * 2,
    height: (window.innerHeight - HEADER_HEIGHT) * 2,
  });
  const [zoomLevel, setZoomLevel] = useState(1);
  const MIN_ZOOM = Math.max(
    viewportSize.width / canvasSize.width,
    viewportSize.height / canvasSize.height
  );

  const [debugMode, setDebugMode] = useState(false);
  const [debugData, setDebugData] = useState({});
  const [isPaused, setIsPaused] = useState(false);
  const [lastInteractionType, setLastInteractionType] = useState(null);

  const containerRef = useRef(null);
  const isMouseDown = useRef(false);
  const ignoreCanvasClick = useRef(false);
  const mouseDownPosition = useRef({ x: 0, y: 0 });
  const mouseMoved = useRef(false);
  const startedOnNode = useRef(false);
  const longPressTimeout = useRef(null);
  const mouseInsideNode = useRef(true);

  const [plusSign, setPlusSign] = useState(null);
  const [nodeNamePrompt, setNodeNamePrompt] = useState({
    visible: false,
    name: '',
  });

  // The panel expanded/collapsed
  const [panelExpanded, setPanelExpanded] = useState(false);
  const panelRef = useRef(null);

  const canvasWorker = useCanvasWorker();

  const lerp = (a, b, t) => a + (b - a) * t;
  const clampCoordinates = (x, y) => {
    const boundedX = Math.min(Math.max(x, 0), canvasSize.width);
    const boundedY = Math.min(Math.max(y, 0), canvasSize.height);
    return { x: boundedX, y: boundedY };
  };

  const isInsideNode = (node, clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    const scaledX = (clientX - rect.left - panOffset.x) / zoomLevel;
    const scaledY = (clientY - rect.top - panOffset.y) / zoomLevel;
    return (
      scaledX >= node.x &&
      scaledX <= node.x + NODE_WIDTH &&
      scaledY >= node.y &&
      scaledY <= node.y + NODE_HEIGHT
    );
  };

  // When a node is double-clicked, open the panel and focus its tab.
  const openNodeTab = (nodeId, nodeName) => {
    setPanelExpanded(true);
    if (panelRef.current && panelRef.current.openNodeTab) {
      panelRef.current.openNodeTab(nodeId, nodeName);
    }
  };

  const handleNodeMouseDown = (node, e) => {
    e.stopPropagation();
    if (isPaused) return;

    if (e.detail === 2) {
      e.preventDefault();
      openNodeTab(node.id, node.name);
      return;
    }

    isMouseDown.current = true;
    mouseDownPosition.current = { x: e.clientX, y: e.clientY };
    mouseMoved.current = false;
    mouseInsideNode.current = true;
    startedOnNode.current = true;

    clearTimeout(longPressTimeout.current);
    longPressTimeout.current = setTimeout(() => {
      if (mouseInsideNode.current && !mouseMoved.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDraggingNode({
          ...node,
          offsetX: (e.clientX - rect.left - panOffset.x) / zoomLevel - node.x,
          offsetY: (e.clientY - rect.top - panOffset.y) / zoomLevel - node.y,
        });
        animateNodeLerp(node.id, 1.1);
      }
    }, LONG_PRESS_DURATION);

    setLongPressingNode(node);
  };

  const animateNodeLerp = (nodeId, targetScale) => {
    const animate = () => {
      setNodes(prev =>
        prev.map(n => {
          if (n.id === nodeId) {
            const newScale = lerp(n.scale, targetScale, LERP_SPEED);
            if (Math.abs(newScale - targetScale) < 0.01) {
              return { ...n, scale: targetScale };
            }
            return { ...n, scale: newScale };
          }
          return n;
        })
      );
      const currentNode = nodes.find(n => n.id === nodeId);
      if (currentNode && Math.abs(currentNode.scale - targetScale) >= 0.01) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  };

  const handleOpenNodeTab = (nodeId, nodeName) => {
    setPanelExpanded(true);
    // Logic handled via panelRef in openNodeTab.
  };

  const handleSaveNodeData = (nodeId, newData) => {
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, ...newData } : n))
    );
  };

  const handleWheel = async (e) => {
    if (isPaused) return;
    let deltaY = e.deltaY;
    if (e.deltaMode === 1) {
      deltaY *= 33;
    } else if (e.deltaMode === 2) {
      deltaY *= window.innerHeight;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    try {
      const result = await canvasWorker.calculateZoom({
        deltaY,
        currentZoom: zoomLevel,
        mousePos: { x: mouseX, y: mouseY },
        panOffset,
        viewportSize,
        canvasSize,
        MIN_ZOOM,
        MAX_ZOOM
      });
      setPanOffset(result.panOffset);
      setZoomLevel(result.zoomLevel);
    } catch (error) {
      console.error('Zoom calculation failed:', error);
    }
  };

  const handleMouseMove = async (e) => {
    if (isPaused) return;
  
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
    const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
    const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);
  
    // If a selection was started (via ctrl/cmd on mouse down) and the mouse is still down,
    // update the selection rectangle regardless of whether the key remains held.
    if (selectionStart && isMouseDown.current) {
      e.preventDefault();
      try {
        const selectionRes = await canvasWorker.calculateSelection({
          selectionStart,
          currentX,
          currentY
        });
        setSelectionRect(selectionRes);
  
        const newSelectedIds = nodes
          .filter(nd => {
            return !(
              selectionRes.x > nd.x + NODE_WIDTH ||
              selectionRes.x + selectionRes.width < nd.x ||
              selectionRes.y > nd.y + NODE_HEIGHT ||
              selectionRes.y + selectionRes.height < nd.y
            );
          })
          .map(nd => nd.id);
  
        setSelectedNodes(prev => new Set([...prev, ...newSelectedIds]));
      } catch (error) {
        console.error('Selection calc failed:', error);
      }
      return;
    }
  
    if (isMouseDown.current) {
      const dx = e.clientX - mouseDownPosition.current.x;
      const dy = e.clientY - mouseDownPosition.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
  
      if (dist > MOVEMENT_THRESHOLD) {
        mouseMoved.current = true;
  
        if (longPressingNode && !draggingNode) {
          const inside = isInsideNode(longPressingNode, e.clientX, e.clientY);
          if (!inside) {
            clearTimeout(longPressTimeout.current);
            mouseInsideNode.current = false;
  
            const startPt = {
              x: longPressingNode.x + NODE_WIDTH / 2,
              y: longPressingNode.y + NODE_HEIGHT / 2
            };
  
            setDrawingConnectionFrom({
              node: longPressingNode,
              startX: startPt.x,
              startY: startPt.y,
              currentX,
              currentY,
              originalNodeX: longPressingNode.x,
              originalNodeY: longPressingNode.y
            });
            animateNodeLerp(longPressingNode.id, 1);
            setLongPressingNode(null);
          }
        } else if (!draggingNode && !drawingConnectionFrom && !isPanning && !startedOnNode.current) {
          setIsPanning(true);
          setPanStart({ x: e.clientX, y: e.clientY });
        }
      }
    }
  
    if (draggingNode) {
      try {
        const newPositions = await canvasWorker.calculateNodePositions({
          nodes,
          draggingNode: {
            ...draggingNode,
            width: NODE_WIDTH,
            height: NODE_HEIGHT
          },
          mouseX: e.clientX,
          mouseY: e.clientY,
          panOffset,
          zoomLevel,
          canvasSize,
          viewportSize,
          headerHeight: HEADER_HEIGHT
        });
        setNodes(newPositions);
      } catch (error) {
        console.error('Node pos calc failed:', error);
      }
    } else if (drawingConnectionFrom) {
      if (!drawingConnectionFrom.originalNodeX) return;
      const bounded = clampCoordinates(currentX, currentY);
      setDrawingConnectionFrom(prev => {
        if (!prev?.originalNodeX) return null;
        return {
          ...prev,
          currentX: bounded.x,
          currentY: bounded.y,
          startX: prev.originalNodeX + NODE_WIDTH / 2,
          startY: prev.originalNodeY + NODE_HEIGHT / 2
        };
      });
    } else if (isPanning) {
      requestAnimationFrame(() => {
        if (!panStart?.x || !panStart?.y) return;
  
        const dx = (e.clientX - panStart.x) * SCROLL_SENSITIVITY;
        const dy = (e.clientY - panStart.y) * SCROLL_SENSITIVITY;
  
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
    if (isPaused) return;
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
      return;
    }
  
    setPanStart({ x: e.clientX, y: e.clientY });
    setIsPanning(true);
  };

  const handleMouseUp = (e) => {
    if (isPaused) return;
    clearTimeout(longPressTimeout.current);
    mouseInsideNode.current = false;
  
    if (drawingConnectionFrom) {
      const targetNode = nodes.find(n => isInsideNode(n, e.clientX, e.clientY));
      if (targetNode && targetNode.id !== drawingConnectionFrom.node.id) {
        const exists = connections.some(
          c =>
            (c.startId === drawingConnectionFrom.node.id && c.endId === targetNode.id) ||
            (c.startId === targetNode.id && c.endId === drawingConnectionFrom.node.id)
        );
        if (!exists) {
          setConnections(prev => [
            ...prev,
            { startId: drawingConnectionFrom.node.id, endId: targetNode.id },
          ]);
        }
      }
      setDrawingConnectionFrom(null);
      wasDrawingConnection.current = true;
    }
  
    if (longPressingNode) {
      const dx = e.clientX - mouseDownPosition.current.x;
      const dy = e.clientY - mouseDownPosition.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (
        dist < MOVEMENT_THRESHOLD &&
        isInsideNode(longPressingNode, e.clientX, e.clientY) &&
        !draggingNode
      ) {
        const wasSelected = selectedNodes.has(longPressingNode.id);
        setSelectedNodes(prev =>
          wasSelected
            ? new Set([...Array.from(prev)].filter(id => id !== longPressingNode.id))
            : new Set([...Array.from(prev), longPressingNode.id])
        );
      }
      animateNodeLerp(longPressingNode.id, 1);
      setLongPressingNode(null);
    }
  
    // If a selection was started, finalize it using the final mouse-up coordinates,
    // update selected nodes, and ensure the selection rectangle is cleared.
    if (selectionStart) {
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);
      canvasWorker.calculateSelection({ selectionStart, currentX, currentY })
        .then(selectionRes => {
          const finalSelectedIds = nodes
            .filter(nd => {
              return !(
                selectionRes.x > nd.x + NODE_WIDTH ||
                selectionRes.x + selectionRes.width < nd.x ||
                selectionRes.y > nd.y + NODE_HEIGHT ||
                selectionRes.y + selectionRes.height < nd.y
              );
            })
            .map(nd => nd.id);
          // Merge the final selection with any already-selected nodes
          setSelectedNodes(prev => new Set([...prev, ...finalSelectedIds]));
        })
        .catch(error => console.error("Final selection calc failed:", error));
      ignoreCanvasClick.current = true;
      setSelectionStart(null);
      setSelectionRect(null);
    }
  
    setDraggingNode(null);
    setIsPanning(false);
    isMouseDown.current = false;
    mouseMoved.current = false;
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
  
    // Clear selection state on canvas mouse up
    if (selectionStart) {
      setSelectionStart(null);
      setSelectionRect(null);
    }
  
    setIsPanning(false);
    setDraggingNode(null);
    setDrawingConnectionFrom(null);
    isMouseDown.current = false;
  };  

  const handleCanvasClick = (e) => {
    if (wasDrawingConnection.current) {
      wasDrawingConnection.current = false;
      return;
    }
  
    if (e.target.closest('g[data-plus-sign="true"]')) return;
    if (e.target.tagName !== 'svg') return;
    if (isPaused || draggingNode || drawingConnectionFrom || mouseMoved.current || recentlyPanned || nodeNamePrompt.visible) {
      setLastInteractionType('blocked_click');
      return;
    }
  
    // If the click came after a selection box drag, ignore it so nodes remain selected.
    if (ignoreCanvasClick.current) {
      ignoreCanvasClick.current = false;
      return;
    }
  
    // If any node is selected, clear the selection instead of spawning the plus sign.
    if (selectedNodes.size > 0) {
      setSelectedNodes(new Set());
      return;
    }
  
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
    const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
  
    if (!plusSign) {
      setPlusSign({
        x: mouseX,
        y: mouseY,
        mode: 'appear',
        tempName: '',
      });
      setLastInteractionType('plus_sign_shown');
    } else {
      if (nodeNamePrompt.visible) {
        return;
      }
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
    if (!plusSign?.tempName) {
      setPlusSign(null);
      return;
    }
    setNodes(prev => [
      ...prev,
      {
        id: Date.now(),
        x: plusSign.x - NODE_WIDTH / 2,
        y: plusSign.y - NODE_HEIGHT / 2,
        name: plusSign.tempName,
        scale: 1,
        bio: '',
        image: null,
      },
    ]);
    setPlusSign(null);
  };

  const renderCustomPrompt = () => {
    if (!nodeNamePrompt.visible) return null;
    return (
      <>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 999,
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
            zIndex: 1000,
            width: '300px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              cursor: 'pointer',
            }}
          >
            <X size={20} color="#999" onClick={handleClosePrompt} />
          </div>
          <div style={{ textAlign: 'center', marginBottom: '15px', color: 'black' }}>
            <strong style={{ fontSize: '18px' }}>Enter Node Name</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              value={nodeNamePrompt.name}
              onChange={(e) => setNodeNamePrompt({ ...nodeNamePrompt, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePromptSubmit();
                }
              }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                marginRight: '10px',
              }}
              autoFocus
            />
            <button
              onClick={handlePromptSubmit}
              style={{
                padding: '10px 20px',
                backgroundColor: 'maroon',
                color: '#bdb5b5',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              Enter
            </button>
          </div>
        </div>
      </>
    );
  };

  const handleTogglePanel = () => {
    setPanelExpanded(prev => !prev);
  };

  return (
    <div
      className="app-container"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <Header />
      {renderCustomPrompt()}

      <Panel
        ref={panelRef}
        isExpanded={panelExpanded}
        onToggleExpand={handleTogglePanel}
        nodes={nodes}
        onSaveNodeData={handleSaveNodeData}
      />

      <div
        className="canvas-container"
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          touchAction: 'none',
          overflow: 'hidden',
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
          }}
          onMouseUp={handleMouseUp}
        >
          <g className="base-layer">
            {connections.map((conn, idx) => {
              const sNode = nodes.find(n => n.id === conn.startId);
              const eNode = nodes.find(n => n.id === conn.endId);
              if (!sNode || !eNode) return null;
              return (
                <line
                  key={idx}
                  x1={sNode.x + NODE_WIDTH / 2}
                  y1={sNode.y + NODE_HEIGHT / 2}
                  x2={eNode.x + NODE_WIDTH / 2}
                  y2={eNode.y + NODE_HEIGHT / 2}
                  stroke="black"
                  strokeWidth="5"
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
                strokeWidth="5"
              />
            )}

            {nodes.map((node) => (
              <g
                key={node.id}
                className={`node ${selectedNodes.has(node.id) ? 'selected' : ''} ${draggingNode?.id === node.id ? 'dragging' : ''}`}
                onMouseDown={(e) => handleNodeMouseDown(node, e)}
                style={{
                  transform: `scale(${node.scale})`,
                  transformOrigin: `${node.x + NODE_WIDTH / 2}px ${node.y + NODE_HEIGHT / 2}px`,
                  cursor: 'pointer',
                }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  rx={40}
                  ry={40}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  fill="maroon"
                  stroke={selectedNodes.has(node.id) ? 'black' : 'none'}
                  strokeWidth={4}
                />
                <foreignObject
                  x={node.x}
                  y={node.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      fontFamily: 'Helvetica',
                      color: '#bdb5b5',
                      textAlign: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {node.name}
                  </div>
                </foreignObject>
              </g>
            ))}
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

        {debugMode && <DebugOverlay debugData={debugData} />}
      </div>
    </div>
  );
};

export default NodeCanvas;
