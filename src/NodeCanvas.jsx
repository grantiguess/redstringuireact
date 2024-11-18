import React, { useState, useRef, useEffect } from 'react';
import './NodeCanvas.css';
import { X } from 'lucide-react';
import Header from './Header.jsx';
import DebugOverlay from './DebugOverlay.jsx';

import {
  NODE_WIDTH,
  NODE_HEIGHT,
  LONG_PRESS_DURATION,
  LERP_SPEED,
  HEADER_HEIGHT,
  MAX_ZOOM,
  MOVEMENT_THRESHOLD
} from './constants';

const NodeCanvas = () => {
  // State variables
  const [nodes, setNodes] = useState([
    { id: 1, x: 500, y: 500, label: 'Node 1', scale: 1 },
    { id: 2, x: 1000, y: 800, label: 'Node 2', scale: 1 },
  ]);
  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const [selectionRect, setSelectionRect] = useState(null); // For drag selection
  const [selectionStart, setSelectionStart] = useState(null); // Track where selection started

  const [draggingNode, setDraggingNode] = useState(null);
  const [longPressingNode, setLongPressingNode] = useState(null);
  const [drawingConnectionFrom, setDrawingConnectionFrom] = useState(null);
  const [connections, setConnections] = useState([]);
  const [connectionStateHistory, setConnectionStateHistory] = useState([]);
  const [lastInteractionType, setLastInteractionType] = useState(null);
  const [canShowPlusSign, setCanShowPlusSign] = useState(true);
  
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight - HEADER_HEIGHT,
  });
  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth * 3, // Adjusted to 3 times the viewport width
    height: (window.innerHeight - HEADER_HEIGHT) * 3, // Adjusted to 3 times the viewport height
  });
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const startedOnNode = useRef(false);

  const [debugMode, setDebugMode] = useState(false);
  const [debugData, setDebugData] = useState({});
  
  const containerRef = useRef(null);
  const longPressTimeout = useRef(null);
  const mouseInsideNode = useRef(true);
  const [isPaused, setIsPaused] = useState(false);

  // New state for the plus sign
  const [plusSign, setPlusSign] = useState(null);

  // Refs to track mouse movement
  const isMouseDown = useRef(false);
  const mouseDownPosition = useRef({ x: 0, y: 0 });
  const mouseMoved = useRef(false);

  // State for the custom prompt
  const [nodeNamePrompt, setNodeNamePrompt] = useState({
    visible: false,
    name: '',
  });

  // Tracks animation frame for canvas
  const panAnimationFrame = useRef(null);

  // States for smooth panning
  const [lastPanUpdate, setLastPanUpdate] = useState(0);
  const lastMousePos = useRef({ x: 0, y: 0 });


  // In handleClosePrompt:
  const handleClosePrompt = () => {
    setIsPaused(false);
    setNodeNamePrompt({ visible: false, name: '' });
    animatePlusSign(false);
  };

  // Ref to store the plusSignData during animation
  const plusSignDataRef = useRef(null);

  // Calculate MIN_ZOOM dynamically
  const MIN_ZOOM = Math.max(
    viewportSize.width / canvasSize.width,
    viewportSize.height / canvasSize.height
  );

  // Effect to handle window resize events and update viewport and canvas size
  useEffect(() => {
    const handleResize = () => {
      const newViewportSize = {
        width: window.innerWidth,
        height: window.innerHeight - HEADER_HEIGHT,
      };
      setViewportSize(newViewportSize);

      // Update canvas size proportionally
      setCanvasSize({
        width: newViewportSize.width * 3,
        height: newViewportSize.height * 3,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [nodeNamePrompt.visible]);

  // Effect to handle keyboard events (e.g., toggling debug mode with Ctrl+D)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setDebugMode((prev) => !prev);
      } else if (e.key === 'Escape' && nodeNamePrompt.visible) {
        handleClosePrompt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Effect to track mouse position relative to the canvas
  useEffect(() => {
    const container = containerRef.current;
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('wheel', handleMouseMove);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('wheel', handleMouseMove);
    };
  }, [panOffset, zoomLevel]);

  // Effect to prevent default browser zoom behavior during pinch-zoom
  useEffect(() => {
    const handleWheelPreventDefault = (e) => {
      if (e.ctrlKey || e.metaKey || e.deltaY % 1 !== 0) {
        e.preventDefault();
      }
    };

    const container = containerRef.current;
    container.addEventListener('wheel', handleWheelPreventDefault, {
      passive: false,
    });

    return () => {
      container.removeEventListener('wheel', handleWheelPreventDefault);
    };
  }, []);

  // Update debug data whenever relevant state changes
  useEffect(() => {
    if (debugMode) {
      setDebugData({
        'Pan Motion': {
          panOffsetX: panOffset.x.toFixed(2),
          panOffsetY: panOffset.y.toFixed(2),
          mouseX: mousePos.x.toFixed(2),
          mouseY: mousePos.y.toFixed(2),
          isPanning: isPanning,
          deltaFromStart: isPanning ? {
            dx: (mousePos.x - panStart.x).toFixed(2),
            dy: (mousePos.y - panStart.y).toFixed(2)
          } : null,
          currentPanStart: panStart,
        },
        'Interaction State': {
          lastInteractionType,
          canShowPlusSign,
          isMouseDown: isMouseDown.current,
          mouseMoved: mouseMoved.current,
          isPanning,
          draggingNode: !!draggingNode,
          drawingConnectionFrom: !!drawingConnectionFrom,
          hasSelectionRect: !!selectionRect,
          selectedNodesCount: selectedNodes.size,
          plusSignActive: !!plusSign
        },
        'Nodes': nodes,
        'Selected Nodes': Array.from(selectedNodes),
        'Dragging Node': draggingNode,
        'Long Pressing Node': longPressingNode,
        'Drawing Connection From': drawingConnectionFrom,
        'Connections': connections,
        'Zoom Level': zoomLevel,
        'Canvas Size': canvasSize,
        'Viewport Size': viewportSize,
        'Pan Offset': panOffset,
        'Pan Start': panStart,
        'Is Panning': isPanning,
        'Min Zoom': MIN_ZOOM,
        'Mouse Position': mousePos,
        'Plus Sign': plusSign,
        'Mouse States': {
          isMouseDown: isMouseDown.current,
          mouseMoved: mouseMoved.current,
          mouseInsideNode: mouseInsideNode.current
        },
        'Connection Drawing State History': connectionStateHistory
      });
    }
  }, [
    lastInteractionType,
    canShowPlusSign,
    isMouseDown,
    mouseMoved.current,
    isPanning,
    draggingNode,
    drawingConnectionFrom,
    selectionRect,
    selectedNodes,
    plusSign,
    debugMode,
    mousePos,
    panOffset,
    panStart,
    nodes
  ]);

  useEffect(() => {
    if (debugMode && drawingConnectionFrom) {
      setConnectionStateHistory(prev => {
        const newHistory = [...prev, {
          timestamp: Date.now(),
          state: { ...drawingConnectionFrom }
        }];
        // Keep last 10 states
        return newHistory.slice(-10);
      });
    }
  }, [drawingConnectionFrom, debugMode]);

  // Linear interpolation function for smooth scaling animations
  const lerp = (start, end, t) => start + (end - start) * t;

  // Function to check if a given point is inside a node (considering zoom and pan)
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

  // Handler for mouse wheel events to zoom in/out
  const handleWheel = (e) => {
    if (isPaused) return;
    //e.preventDefault(); // Prevent default scrolling and zooming

    // Normalize deltaY for different delta modes
    let deltaY = e.deltaY;
    if (e.deltaMode === 1) {
      // deltaMode 1 means the delta is in lines, not pixels
      deltaY *= 33; // Approximate line height in pixels
    } else if (e.deltaMode === 2) {
      // deltaMode 2 means the delta is in pages
      deltaY *= window.innerHeight;
    }

    // Determine the zoom direction and amount
    let zoomFactor;
    if (deltaY < 0) {
      // Zoom in
      zoomFactor = 1.1;
    } else if (deltaY > 0) {
      // Zoom out
      zoomFactor = 1 / 1.1;
    } else {
      // No zoom
      return;
    }

    // Apply the zoom factor to the current zoom level
    let newZoomLevel = zoomLevel * zoomFactor;

    // Enforce zoom boundaries
    newZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));

    // Adjust zoom factor if zoom level was clamped
    zoomFactor = newZoomLevel / zoomLevel;

    // Calculate pan offset delta to keep the mouse position stationary
    const panOffsetDeltaX = (mousePos.x - panOffset.x) * (1 - zoomFactor);
    const panOffsetDeltaY = (mousePos.y - panOffset.y) * (1 - zoomFactor);

    // Update the pan offset
    let newPanOffsetX = panOffset.x + panOffsetDeltaX;
    let newPanOffsetY = panOffset.y + panOffsetDeltaY;

    // Clamp panOffset within boundaries
    const maxPanOffsetX = 0;
    const maxPanOffsetY = 0;
    const minPanOffsetX =
      viewportSize.width - canvasSize.width * newZoomLevel;
    const minPanOffsetY =
      viewportSize.height - canvasSize.height * newZoomLevel;

    newPanOffsetX = Math.min(
      Math.max(newPanOffsetX, minPanOffsetX),
      maxPanOffsetX
    );
    newPanOffsetY = Math.min(
      Math.max(newPanOffsetY, minPanOffsetY),
      maxPanOffsetY
    );

    // Update the state
    setPanOffset({ x: newPanOffsetX, y: newPanOffsetY });
    setZoomLevel(newZoomLevel);
  };

  const clampCoordinates = (x, y) => {
    const boundedX = Math.min(Math.max(x, 0), canvasSize.width);
    const boundedY = Math.min(Math.max(y, 0), canvasSize.height);
    return { x: boundedX, y: boundedY };
  };

  const clearDebugHistory = () => {
    setConnectionStateHistory([]);
  };

  // Handler for mouse down events on a node
  const handleNodeMouseDown = (node, e) => {
    e.stopPropagation();
    if (isPaused) return;
  
    isMouseDown.current = true;
    mouseDownPosition.current = { x: e.clientX, y: e.clientY };
    mouseMoved.current = false;
    mouseInsideNode.current = true;
    startedOnNode.current = true; // Set flag when starting on a node
  
    // Clear any existing timeout before starting a new one
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
  // Function to start detecting a long press on a node
  const startLongPress = (node, e) => {
    clearTimeout(longPressTimeout.current);
    mouseInsideNode.current = true;
  
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

  // Function to animate node scaling using linear interpolation
  const animateNodeLerp = (nodeId, targetScale) => {
    const animate = () => {
      setNodes((prevNodes) => {
        const updatedNodes = prevNodes.map((node) => {
          if (node.id === nodeId) {
            const newScale = lerp(node.scale, targetScale, LERP_SPEED);
            if (Math.abs(newScale - targetScale) < 0.01) {
              return { ...node, scale: targetScale };
            }
            return { ...node, scale: newScale };
          }
          return node;
        });
        return updatedNodes;
      });

      const currentNode = nodes.find((node) => node.id === nodeId);
      if (currentNode && Math.abs(currentNode.scale - targetScale) >= 0.01) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  };

  const startSmoothPanning = () => {
    if (panAnimationFrame.current) return;
    
    const animate = () => {
      if (isPanning && isMouseDown.current && lastMousePos.current) {
        const currentTime = performance.now();
        const deltaTime = currentTime - lastPanUpdate;
        
        if (deltaTime >= 16) { // Cap at roughly 60fps
          const dx = lastMousePos.current.x - panStart.x;
          const dy = lastMousePos.current.y - panStart.y;
          
          let newPanOffsetX = panOffset.x + dx;
          let newPanOffsetY = panOffset.y + dy;
          
          const maxPanOffsetX = 0;
          const maxPanOffsetY = 0;
          const minPanOffsetX = viewportSize.width - canvasSize.width * zoomLevel;
          const minPanOffsetY = viewportSize.height - canvasSize.height * zoomLevel;
          
          newPanOffsetX = Math.min(Math.max(newPanOffsetX, minPanOffsetX), maxPanOffsetX);
          newPanOffsetY = Math.min(Math.max(newPanOffsetY, minPanOffsetY), maxPanOffsetY);
          
          setPanOffset({ x: newPanOffsetX, y: newPanOffsetY });
          setPanStart({ x: lastMousePos.current.x, y: lastMousePos.current.y });
          setLastPanUpdate(currentTime);
        }
      }
      panAnimationFrame.current = requestAnimationFrame(animate);
    };
    
    panAnimationFrame.current = requestAnimationFrame(animate);
  };

  // Handler for mouse move events on the canvas
  const handleMouseMove = (e) => {
    if (isPaused) return;
  
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
    const rawY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
    
    // Clamp the current coordinates to canvas bounds
    const { x: currentX, y: currentY } = clampCoordinates(rawX, rawY);
  
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  
    // Handle selection rectangle
    if (selectionStart && isMouseDown.current && e.ctrlKey) {
      e.preventDefault();
      
      const newRect = {
        x: Math.min(selectionStart.x, currentX),
        y: Math.min(selectionStart.y, currentY),
        width: Math.abs(currentX - selectionStart.x),
        height: Math.abs(currentY - selectionStart.y)
      };
      
      setSelectionRect(newRect);
      
      const selectedIds = nodes.filter(node => {
        return !(
          newRect.x > (node.x + NODE_WIDTH) ||
          (newRect.x + newRect.width) < node.x ||
          newRect.y > (node.y + NODE_HEIGHT) ||
          (newRect.y + newRect.height) < node.y
        );
      }).map(node => node.id);
      
      setSelectedNodes(new Set(selectedIds));
      return;
    }
  
    if (isMouseDown.current) {
      const dx = e.clientX - mouseDownPosition.current.x;
      const dy = e.clientY - mouseDownPosition.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
  
      if (distance > MOVEMENT_THRESHOLD) {
        mouseMoved.current = true;
  
        if (longPressingNode && !draggingNode) {
          const inside = isInsideNode(longPressingNode, e.clientX, e.clientY);
          if (!inside) {
            clearTimeout(longPressTimeout.current);
            mouseInsideNode.current = false;
  
            const startPoint = {
              x: longPressingNode.x + NODE_WIDTH / 2,
              y: longPressingNode.y + NODE_HEIGHT / 2
            };
  
            setDrawingConnectionFrom({
              node: longPressingNode,
              startX: startPoint.x,
              startY: startPoint.y,
              currentX: currentX,
              currentY: currentY,
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
  
    // Handle node dragging
    if (draggingNode) {
      const newNodeX = Math.min(Math.max(currentX - draggingNode.offsetX, 0), canvasSize.width - NODE_WIDTH);
      const newNodeY = Math.min(Math.max(currentY - draggingNode.offsetY, 0), canvasSize.height - NODE_HEIGHT);
  
      setNodes(prevNodes =>
        prevNodes.map(node =>
          node.id === draggingNode.id
            ? { ...node, x: newNodeX, y: newNodeY }
            : node
        )
      );
    } 
    // Handle connection drawing
    else if (drawingConnectionFrom) {
      if (!drawingConnectionFrom?.originalNodeX) return;
  
      const boundedEndpoint = clampCoordinates(currentX, currentY);
      
      setDrawingConnectionFrom(prev => {
        if (!prev?.originalNodeX) return null;
        
        return {
          ...prev,
          currentX: boundedEndpoint.x,
          currentY: boundedEndpoint.y,
          startX: prev.originalNodeX + NODE_WIDTH / 2,
          startY: prev.originalNodeY + NODE_HEIGHT / 2
        };
      });
    }
    // Handle panning with requestAnimationFrame
    else if (isPanning) {
      requestAnimationFrame(() => {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        
        let newPanOffsetX = panOffset.x + dx;
        let newPanOffsetY = panOffset.y + dy;
    
        const maxPanOffsetX = 0;
        const maxPanOffsetY = 0;
        const minPanOffsetX = viewportSize.width - canvasSize.width * zoomLevel;
        const minPanOffsetY = viewportSize.height - canvasSize.height * zoomLevel;
    
        newPanOffsetX = Math.min(Math.max(newPanOffsetX, minPanOffsetX), maxPanOffsetX);
        newPanOffsetY = Math.min(Math.max(newPanOffsetY, minPanOffsetY), maxPanOffsetY);
    
        setPanOffset({ x: newPanOffsetX, y: newPanOffsetY });
        setPanStart({ x: e.clientX, y: e.clientY });
      });
    }
  };

  // Handler for mouse up events on the canvas
  const handleMouseUp = (e) => {
    if (isPaused) return;
  
    // Always clear long press timeout and mouse inside state first
    clearTimeout(longPressTimeout.current);
    mouseInsideNode.current = false;
  
    // Handle connection drawing completion first - must be done before other state changes
    // to prevent race conditions with state updates
    if (drawingConnectionFrom) {
      const targetNode = nodes.find(node => isInsideNode(node, e.clientX, e.clientY));
      
      // Only create connection if target is valid and not the same as source
      if (targetNode && targetNode.id !== drawingConnectionFrom.node.id) {
        // Check if this connection already exists (in either direction)
        const connectionExists = connections.some(
          conn =>
            (conn.startId === drawingConnectionFrom.node.id &&
              conn.endId === targetNode.id) ||
            (conn.startId === targetNode.id &&
              conn.endId === drawingConnectionFrom.node.id)
        );
  
        // Add new connection if it doesn't exist
        if (!connectionExists) {
          setConnections(prevConnections => [
            ...prevConnections,
            {
              startId: drawingConnectionFrom.node.id,
              endId: targetNode.id,
            },
          ]);
        }
      }
  
      // Clear connection drawing state immediately to prevent state conflicts
      setDrawingConnectionFrom(null);
    }
  
    // Handle node selection from long press
    if (longPressingNode) {
      // Only handle selection if we haven't moved and are still over the node
      if (!mouseMoved.current && isInsideNode(longPressingNode, e.clientX, e.clientY)) {
        if (e.shiftKey) {
          // Toggle node selection when shift is held
          setSelectedNodes(prev => {
            const newSelection = new Set(prev);
            if (newSelection.has(longPressingNode.id)) {
              newSelection.delete(longPressingNode.id);
            } else {
              newSelection.add(longPressingNode.id);
            }
            return newSelection;
          });
        } else {
          // Select only this node when shift isn't held
          setSelectedNodes(new Set([longPressingNode.id]));
        }
      }
      // Reset node scale and clear long press state
      animateNodeLerp(longPressingNode.id, 1);
      setLongPressingNode(null);
    }
  
    // Clear dragging state if active
    if (draggingNode) {
      setDraggingNode(null);
    }
  
    // Handle selection rectangle completion
    if (selectionRect) {
      if (e.shiftKey) {
        // Merge with existing selection when shift is held
        setSelectedNodes(prev => {
          const newSelection = new Set(prev);
          nodes.forEach(node => {
            const nodeCenter = {
              x: node.x + NODE_WIDTH / 2,
              y: node.y + NODE_HEIGHT / 2
            };
            if (nodeCenter.x >= selectionRect.x && 
                nodeCenter.x <= selectionRect.x + selectionRect.width &&
                nodeCenter.y >= selectionRect.y && 
                nodeCenter.y <= selectionRect.y + selectionRect.height) {
              newSelection.add(node.id);
            }
          });
          return newSelection;
        });
      } else {
        // Replace selection when shift isn't held
        const selectedIds = nodes.filter(node => {
          const nodeCenter = {
            x: node.x + NODE_WIDTH / 2,
            y: node.y + NODE_HEIGHT / 2
          };
          return nodeCenter.x >= selectionRect.x && 
                 nodeCenter.x <= selectionRect.x + selectionRect.width &&
                 nodeCenter.y >= selectionRect.y && 
                 nodeCenter.y <= selectionRect.y + selectionRect.height;
        }).map(node => node.id);
        setSelectedNodes(new Set(selectedIds));
      }
      // Clear selection rectangle state
      setSelectionRect(null);
      setSelectionStart(null);
    }
  
    // Finally, reset all remaining interaction states
    setIsPanning(false);
    isMouseDown.current = false;
    mouseMoved.current = false;
  };

  // Handler for mouse down events on the canvas (start panning)
  const handleMouseDown = (e) => {
    if (isPaused) return;
    
    isMouseDown.current = true;
    mouseDownPosition.current = { x: e.clientX, y: e.clientY };
    startedOnNode.current = false; // Reset flag when clicking on canvas
    setCanShowPlusSign(false);
    setLastInteractionType('mouse_down');
  
    if (e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      const rect = containerRef.current.getBoundingClientRect();
      const startX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
      const startY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
      setSelectionStart({ x: startX, y: startY });
      setSelectionRect({ x: startX, y: startY, width: 0, height: 0 });
      setIsPanning(false);
    } else if (!draggingNode && !drawingConnectionFrom) {
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  // Handler for mouse up events on the canvas (stop panning)
  const handleMouseUpCanvas = () => {
    if (isPaused) return;
  
    if (panAnimationFrame.current) {
      cancelAnimationFrame(panAnimationFrame.current);
      panAnimationFrame.current = null;
    }
    
    if (drawingConnectionFrom || draggingNode || isPanning) {
      setCanShowPlusSign(false);
      setLastInteractionType('interaction_ended');
    } else {
      setCanShowPlusSign(true);
      setLastInteractionType('clean_mouse_up');
    }

    // Clean up animation frame on unmount
    // useEffect(() => {
    //   return () => {
    //     if (panAnimationFrame.current) {
    //       cancelAnimationFrame(panAnimationFrame.current);
    //     }
    //   };
    // }, []);
  
    setIsPanning(false);
    setDraggingNode(null);
    setDrawingConnectionFrom(null);
    isMouseDown.current = false;
  };  

  const handleCanvasClick = (e) => {
    // Check if we clicked on SVG or its immediate container
    if (e.target.tagName !== 'svg') return;
    
    if (isPaused || draggingNode || drawingConnectionFrom || mouseMoved.current) {
      setCanShowPlusSign(false);
      setLastInteractionType('blocked_click');
      return;
    }
  
    // Clear node selection when clicking canvas (unless holding shift)
    if (!e.shiftKey) {
      setSelectedNodes(new Set());
    }
  
    // Only show plus sign if no nodes are selected and we can show it
    if (selectedNodes.size > 0 || !canShowPlusSign) {
      setLastInteractionType('nodes_selected');
      return;
    }
  
    // Toggle plus sign
    if (plusSign) {
      animatePlusSign(false);
      setLastInteractionType('plus_sign_hidden');
      return;
    }
  
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - panOffset.x) / zoomLevel;
    const mouseY = (e.clientY - rect.top - panOffset.y) / zoomLevel;
  
    setPlusSign({
      x: mouseX,
      y: mouseY,
      rotation: -90,
      color: 'white',
      width: 0,
      height: 0,
      cornerRadius: 40,
      lineOpacity: 1,
    });
  
    setLastInteractionType('plus_sign_shown');
    animatePlusSign(true);
  };

  // Function to animate the plus sign appearance/disappearance
  const animatePlusSign = (appearing) => {
    const animationDuration = 150; // milliseconds (twice as fast)
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / animationDuration, 1); // from 0 to 1

      // Lerp width and height
      const width = appearing ? lerp(0, 40, t) : lerp(40, 0, t);
      const height = width; // Keep it square

      // Lerp rotation
      const rotation = appearing ? lerp(-90, 0, t) : lerp(0, 90, t);

      setPlusSign((prev) =>
        prev
          ? {
              ...prev,
              width,
              height,
              rotation,
            }
          : null
      );

      if (t < 1) {
        requestAnimationFrame(animate);
      } else if (!appearing) {
        // Animation complete, remove the plus sign
        setPlusSign(null);
      }
    };

    requestAnimationFrame(animate);
  };

  // Handler for clicking on the plus sign
  const handlePlusSignClick = (e) => {
    e.stopPropagation();
    // Show the custom prompt
    setNodeNamePrompt({ visible: true, name: '' });
    // Store the plusSign data
    plusSignDataRef.current = { ...plusSign };
    setIsPaused(true);
  };

  // Handler for prompt submission
  const handlePromptSubmit = () => {
    const name = nodeNamePrompt.name.trim();
    if (name) {
      // Start the animation to transform plus sign into node
      animatePlusSignToNode(name, plusSignDataRef.current);
    } else {
      // If no name entered, remove the plus sign
      animatePlusSign(false); // false for disappearing
    }
    // Hide the prompt
    setIsPaused(false);
    setNodeNamePrompt({ visible: false, name: '' });
  };

  // Function to animate the plus sign transforming into a node
  const animatePlusSignToNode = (name, plusSignData) => {
    const animationDuration = 250; // milliseconds (twice as fast)
    const startTime = performance.now();

    const startWidth = plusSignData.width;
    const startHeight = plusSignData.height;
    const startCornerRadius = plusSignData.cornerRadius;
    const endWidth = NODE_WIDTH;
    const endHeight = NODE_HEIGHT;
    const endCornerRadius = 40; // Corner radius for nodes

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / animationDuration, 1); // from 0 to 1

      // Lerp color from white to maroon
      const color = t < 0.5 ? 'white' : 'maroon';

      // Lerp width and height
      const width = lerp(startWidth, endWidth, t);
      const height = lerp(startHeight, endHeight, t);

      // Lerp corner radius
      const cornerRadius = lerp(startCornerRadius, endCornerRadius, t);

      // Fade out the plus lines
      const lineOpacity = lerp(1, 0, t);

      setPlusSign((prev) =>
        prev
          ? {
              ...prev,
              width,
              height,
              cornerRadius,
              color,
              lineOpacity,
            }
          : null
      );

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete, replace the plus sign with a node
        setNodes((prevNodes) => [
          ...prevNodes,
          {
            id: Date.now(),
            x: plusSignData.x - NODE_WIDTH / 2,
            y: plusSignData.y - NODE_HEIGHT / 2,
            label: name,
            scale: 1,
          },
        ]);
        setPlusSign(null);
        plusSignDataRef.current = null; // Clear the ref
      }
    };

    requestAnimationFrame(animate);
  };
  
  // Render the custom prompt
  const renderCustomPrompt = () => {
    if (!nodeNamePrompt.visible) return null;
  
    return (
      <>
        {/* Dark overlay */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 999
          }}
        />
        {/* Prompt dialog */}
        <div
          style={{
            position: 'fixed',
            top: HEADER_HEIGHT + 25,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: 1000,
            width: '300px'
          }}
        >
          <div style={{ 
            position: 'absolute',
            top: '10px',
            right: '10px',
            cursor: 'pointer'
          }}>
            <X 
              size={20} 
              color="#999"
              onClick={handleClosePrompt}
              style={{
                transition: 'color 0.2s',
                ':hover': {
                  color: '#666'
                }
              }}
            />
          </div>
          <div style={{ textAlign: 'center', marginBottom: '15px', color: 'black' }}>
            <strong style={{ fontSize: '18px' }}>Enter Node Name</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              value={nodeNamePrompt.name}
              onChange={(e) =>
                setNodeNamePrompt({ ...nodeNamePrompt, name: e.target.value })
              }
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
                color: 'white',
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

  // Render the component
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

      {/* Render the custom prompt */}
      {renderCustomPrompt()}

      {/* Canvas container */}
      <div
        className="canvas-container"
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          touchAction: 'none',
        }}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUpCanvas}
        onClick={handleCanvasClick}
      >
        {/* SVG canvas */}
        <svg
          className="canvas"
          width={canvasSize.width}
          height={canvasSize.height}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: '0 0',
            transition: 'transform 0.1s ease-out',
            backgroundColor: 'white',
          }}
          onMouseUp={handleMouseUp}
        >
          {/* Base layer for connections and nodes */}
          <g className="base-layer">
            {/* Connections */}
            {connections.map((conn, index) => {
              const startNode = nodes.find((node) => node.id === conn.startId);
              const endNode = nodes.find((node) => node.id === conn.endId);
              if (startNode && endNode) {
                return (
                  <line
                    key={index}
                    x1={startNode.x + NODE_WIDTH / 2}
                    y1={startNode.y + NODE_HEIGHT / 2}
                    x2={endNode.x + NODE_WIDTH / 2}
                    y2={endNode.y + NODE_HEIGHT / 2}
                    stroke="black"
                    strokeWidth="5"
                  />
                );
              } else {
                return null;
              }
            })}

            {/* Connection being drawn */}
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

            {/* Nodes */}
            {nodes.map((node) => (
              <g
              key={node.id}
              className={`node ${selectedNodes.has(node.id) ? 'selected' : ''} ${
                draggingNode?.id === node.id ? 'dragging' : ''
              }`}
              onMouseDown={(e) => handleNodeMouseDown(node, e)}
              onMouseUp={handleMouseUp}
              style={{
                transform: `scale(${node.scale})`,
                transformOrigin: `${node.x + NODE_WIDTH / 2}px ${
                  node.y + NODE_HEIGHT / 2
                }px`,
                cursor: 'pointer',
              }}
            >
              <rect
                x={node.x}
                y={node.y}
                rx="40"
                ry="40"
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                fill="maroon"
                stroke={selectedNodes.has(node.id) ? 'black' : 'none'}
                strokeWidth="4"
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
                      color: 'white',
                      textAlign: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {node.label}
                  </div>
                </foreignObject>
              </g>
            ))}
          </g>

          {/* Canvas UI layer */}
          <g className="canvas-ui-layer">
            {/* Selection rectangle */}
            {selectionRect && (
              <rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill="rgba(255, 0, 0, 0.1)"
                stroke="red"
                strokeWidth="1"
              />
            )}

            {/* Plus sign */}
            {plusSign && (
              <g
                transform={`translate(${plusSign.x}, ${plusSign.y}) rotate(${plusSign.rotation})`}
                onClick={handlePlusSignClick}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={-plusSign.width / 2}
                  y={-plusSign.height / 2}
                  width={plusSign.width}
                  height={plusSign.height}
                  rx={plusSign.cornerRadius}
                  ry={plusSign.cornerRadius}
                  fill={plusSign.color}
                  stroke="maroon"
                  strokeWidth="3"
                />
                <line
                  x1={-plusSign.width / 4}
                  y1={0}
                  x2={plusSign.width / 4}
                  y2={0}
                  stroke="maroon"
                  strokeWidth="3"
                  opacity={plusSign.lineOpacity}
                />
                <line
                  x1={0}
                  y1={-plusSign.height / 4}
                  x2={0}
                  y2={plusSign.height / 4}
                  stroke="maroon"
                  strokeWidth="3"
                  opacity={plusSign.lineOpacity}
                />
              </g>
            )}
          </g>

          {/* Menu UI layer for future use */}
          <g className="menu-ui-layer">
          </g>
        </svg>
        {debugMode && <DebugOverlay debugData={debugData} />}
      </div>
    </div>
  );

};

export default NodeCanvas;
