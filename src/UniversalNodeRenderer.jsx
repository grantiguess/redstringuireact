import React, { useMemo, useState, useCallback, useRef } from 'react';
import useGraphStore from './store/graphStore';

/**
 * Universal Node/Connection Renderer
 * 
 * A reusable component that can render nodes and connections at any scale
 * while maintaining exact proportionality and functionality from NodeCanvas.
 * 
 * Can be used in: panels, modals, control panels, previews, etc.
 */
const UniversalNodeRenderer = ({
  // Data
  nodes = [], // Array of node objects with {id, x, y, width, height, name, color}
  connections = [], // Array of connection objects 
  
  // Sizing
  containerWidth = 400,
  containerHeight = 200,
  scaleMode = 'fit', // 'fit' | 'fill' | 'fixed'
  minNodeSize = 40, // Minimum node size in pixels
  maxNodeSize = 240, // Maximum node size in pixels (allow wider nodes before downscaling)
  
  // Appearance
  backgroundColor = 'transparent',
  showGrid = false,
  padding = 20,
  
  // Layout
  alignNodesHorizontally = false, // For control panels - align all nodes on same Y axis
  minHorizontalSpacing = 140, // Minimum distance between nodes when aligned horizontally
  
  // Interactivity
  interactive = true,
  showHoverEffects = true,
  showConnectionDots = true,
  
  // Callbacks
  onNodeClick,
  onNodeHover,
  onConnectionClick,
  onConnectionHover,
  onToggleArrow,
  
  // Advanced
  routingStyle = 'smart', // 'straight' | 'smart' | 'curved'
  className = ''
}) => {
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState(null);
  const [stableHoveredConnectionId, setStableHoveredConnectionId] = useState(null);
  const hoverTimeoutRef = useRef(null);
  
  const graphsMap = useGraphStore((state) => state.graphs);
  const activeGraphId = useGraphStore((state) => state.activeGraphId);
  
  // Get actual node instances if not provided
  const instances = useMemo(() => {
    if (!activeGraphId || !graphsMap) return new Map();
    return graphsMap.get(activeGraphId)?.instances || new Map();
  }, [activeGraphId, graphsMap]);

  // Calculate connection path based on routing style
  const calculateConnectionPath = useCallback((sourceNode, targetNode, style, scale, hasSourceArrow, hasTargetArrow) => {
    const sourceCenterX = sourceNode.x + sourceNode.width / 2;
    const sourceCenterY = sourceNode.y + sourceNode.height / 2;
    const targetCenterX = targetNode.x + targetNode.width / 2;
    const targetCenterY = targetNode.y + targetNode.height / 2;
    
    // Arrow tip length for cutting the line (slightly larger for clearer spacing)
    const arrowTipLength = 24 * scale;

    if (style === 'straight') {
      // Cut line short for arrows
      const dx = targetCenterX - sourceCenterX;
      const dy = targetCenterY - sourceCenterY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const unitX = dx / length;
      const unitY = dy / length;
      
      const startX = hasSourceArrow ? sourceCenterX + unitX * arrowTipLength : sourceCenterX;
      const startY = hasSourceArrow ? sourceCenterY + unitY * arrowTipLength : sourceCenterY;
      const endX = hasTargetArrow ? targetCenterX - unitX * arrowTipLength : targetCenterX;
      const endY = hasTargetArrow ? targetCenterY - unitY * arrowTipLength : targetCenterY;
      
      return {
        path: `M ${startX} ${startY} L ${endX} ${endY}`,
        sourcePoint: { x: sourceCenterX, y: sourceCenterY },
        targetPoint: { x: targetCenterX, y: targetCenterY }
      };
    }

    // Smart routing - choose optimal connection points
    const dx = targetCenterX - sourceCenterX;
    const dy = targetCenterY - sourceCenterY;
    
    let sourcePoint, targetPoint;
    
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal connection
      if (dx > 0) {
        sourcePoint = { x: sourceNode.x + sourceNode.width, y: sourceCenterY };
        targetPoint = { x: targetNode.x, y: targetCenterY };
      } else {
        sourcePoint = { x: sourceNode.x, y: sourceCenterY };
        targetPoint = { x: targetNode.x + targetNode.width, y: targetCenterY };
      }
    } else {
      // Vertical connection
      if (dy > 0) {
        sourcePoint = { x: sourceCenterX, y: sourceNode.y + sourceNode.height };
        targetPoint = { x: targetCenterX, y: targetNode.y };
      } else {
        sourcePoint = { x: sourceCenterX, y: sourceNode.y };
        targetPoint = { x: targetCenterX, y: targetNode.y + targetNode.height };
      }
    }

    // Apply arrow tip cutting to smart routing points
    let finalSourcePoint = sourcePoint;
    let finalTargetPoint = targetPoint;
    
    if (hasSourceArrow || hasTargetArrow) {
      const dx = targetPoint.x - sourcePoint.x;
      const dy = targetPoint.y - sourcePoint.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 0) {
        const unitX = dx / length;
        const unitY = dy / length;
        
        if (hasSourceArrow) {
          finalSourcePoint = {
            x: sourcePoint.x + unitX * arrowTipLength,
            y: sourcePoint.y + unitY * arrowTipLength
          };
        }
        
        if (hasTargetArrow) {
          finalTargetPoint = {
            x: targetPoint.x - unitX * arrowTipLength,
            y: targetPoint.y - unitY * arrowTipLength
          };
        }
      }
    }

    if (style === 'curved') {
      // Add curve
      const midX = (finalSourcePoint.x + finalTargetPoint.x) / 2;
      const midY = (finalSourcePoint.y + finalTargetPoint.y) / 2;
      const curveOffset = Math.min(50, Math.abs(dx) * 0.3, Math.abs(dy) * 0.3) * scale;
      const controlX = midX + (Math.abs(dx) > Math.abs(dy) ? 0 : curveOffset);
      const controlY = midY + (Math.abs(dx) > Math.abs(dy) ? curveOffset : 0);
      
      return {
        path: `M ${finalSourcePoint.x} ${finalSourcePoint.y} Q ${controlX} ${controlY} ${finalTargetPoint.x} ${finalTargetPoint.y}`,
        sourcePoint,
        targetPoint
      };
    }

    return {
      path: `M ${finalSourcePoint.x} ${finalSourcePoint.y} L ${finalTargetPoint.x} ${finalTargetPoint.y}`,
      sourcePoint,
      targetPoint
    };
  }, []);

  // Helper to get connection display name
  const getConnectionName = useCallback((connection) => {
    if (connection.name) return connection.name;
    if (connection.label) return connection.label;
    if (connection.edgePrototype?.name) return connection.edgePrototype.name;
    return 'Connection';
  }, []);

  // Helper to get connection color
  const getConnectionColor = useCallback((connection) => {
    if (connection.color) return connection.color;
    if (connection.edgePrototype?.color) return connection.edgePrototype.color;
    return '#8B0000'; // Default connection color
  }, []);

  // Calculate scaled layout
  const { scaledNodes, scaledConnections, transform } = useMemo(() => {
    if (!nodes.length) {
      return { scaledNodes: [], scaledConnections: [], transform: { scale: 1, offsetX: 0, offsetY: 0 } };
    }

    // If nodes don't have positions, get them from instances
    const nodesWithPositions = nodes.map((node, index) => {
      let x, y, width, height;
      
      if (node.x !== undefined && node.y !== undefined) {
        x = node.x;
        y = node.y;
        if (node.width && node.height) {
          width = node.width;
          height = node.height;
        } else {
          // Compute width/height from text to match Node.jsx proportions
          const nameString = typeof node.name === 'string' ? node.name : '';
          const averageCharWidth = 12; // Node.jsx uses ~20px font
          const sidePaddingSingle = 22; // match Node.jsx
          const topBottomPadding = 20;
          const minWidth = 140;
          const maxWidth = 360;
          const textWidth = Math.max(0, nameString.length * averageCharWidth);
          const desiredContentWidth = Math.min(Math.max(textWidth, minWidth - 2 * sidePaddingSingle), maxWidth - 2 * sidePaddingSingle);
          width = Math.min(Math.max(desiredContentWidth + 2 * sidePaddingSingle, minWidth), maxWidth);
          const availableLineWidth = Math.max(1, width - 2 * sidePaddingSingle);
          const lineCount = Math.max(1, Math.ceil(textWidth / availableLineWidth));
          const lineHeight = 32; // Node.jsx line-height
          height = Math.max(80, (lineCount * lineHeight) + (2 * topBottomPadding));
        }
      } else {
        const instance = instances.get(node.id);
        x = instance?.x || 0;
        y = instance?.y || 0;
        if (instance?.width && instance?.height) {
          width = instance.width;
          height = instance.height;
        } else if (node.width && node.height) {
          width = node.width;
          height = node.height;
        } else {
          // Compute width/height from text to match Node.jsx proportions
          const nameString = typeof node.name === 'string' ? node.name : '';
          const averageCharWidth = 12;
          const sidePaddingSingle = 22;
          const topBottomPadding = 20;
          const minWidth = 140;
          const maxWidth = 360;
          const textWidth = Math.max(0, nameString.length * averageCharWidth);
          const desiredContentWidth = Math.min(Math.max(textWidth, minWidth - 2 * sidePaddingSingle), maxWidth - 2 * sidePaddingSingle);
          width = Math.min(Math.max(desiredContentWidth + 2 * sidePaddingSingle, minWidth), maxWidth);
          const availableLineWidth = Math.max(1, width - 2 * sidePaddingSingle);
          const lineCount = Math.max(1, Math.ceil(textWidth / availableLineWidth));
          const lineHeight = 32;
          height = Math.max(80, (lineCount * lineHeight) + (2 * topBottomPadding));
        }
      }
      
      // If alignNodesHorizontally is true, arrange nodes in a horizontal line
      if (alignNodesHorizontally) {
        const nodeSpacing = 200; // Space between nodes
        x = index * nodeSpacing;
        y = 0; // Same Y for all nodes
      }
      
      return {
        ...node,
        x,
        y,
        width,
        height
      };
    });

    // Calculate bounding box
    const minX = Math.min(...nodesWithPositions.map(n => n.x));
    const maxX = Math.max(...nodesWithPositions.map(n => n.x + n.width));
    const minY = Math.min(...nodesWithPositions.map(n => n.y));
    const maxY = Math.max(...nodesWithPositions.map(n => n.y + n.height));
    
    const boundingWidth = maxX - minX;
    const boundingHeight = maxY - minY;
    
    // Calculate scale to fit container with padding
    const availableWidth = containerWidth - (padding * 2);
    const availableHeight = containerHeight - (padding * 2);

    // Special handling for horizontal alignment contexts (e.g., connection control panel)
    if (alignNodesHorizontally) {
      const baseWidths = nodesWithPositions.map(n => n.width);
      const baseHeights = nodesWithPositions.map(n => n.height);
      const sumWidths = baseWidths.reduce((a, b) => a + b, 0);
      const maxHeight = Math.max(...baseHeights, 1);
      const gaps = Math.max(0, nodesWithPositions.length - 1);
      const spacing = Math.max(0, minHorizontalSpacing);
      const widthForNodes = Math.max(1, availableWidth - gaps * spacing);
      const scaleByWidth = Math.min(1, widthForNodes / Math.max(1, sumWidths));
      const scaleByHeight = Math.min(1, availableHeight / Math.max(1, maxHeight));
      const nodeScale = Math.min(scaleByWidth, scaleByHeight);

      // Lay out nodes centered horizontally with minimum spacing, scaling proportionally
      const scaledWidths = baseWidths.map(w => w * nodeScale);
      const scaledHeights = baseHeights.map(h => h * nodeScale);
      const totalScaledWidth = scaledWidths.reduce((a, b) => a + b, 0) + gaps * spacing;
      const startX = padding + (availableWidth - totalScaledWidth) / 2;
      let cursorX = startX;
      const scaledNodes = nodesWithPositions.map((n, i) => {
        const w = scaledWidths[i];
        const h = scaledHeights[i];
        const x = cursorX;
        const y = padding + (availableHeight - h) / 2;
        cursorX += w + (i < nodesWithPositions.length - 1 ? spacing : 0);
        return {
          ...n,
          x,
          y,
          width: w,
          height: h,
          cornerRadius: Math.max(1, 28 * nodeScale)
        };
      });

      const scaledConnections = connections.map(conn => {
        const sourceNode = scaledNodes.find(n => n.id === conn.sourceId);
        const targetNode = scaledNodes.find(n => n.id === (conn.destinationId || conn.targetId));
        if (!sourceNode || !targetNode) return null;
        const arrowsToward = conn.directionality?.arrowsToward || new Set();
        const hasSourceArrow = arrowsToward.has(conn.sourceId);
        const hasTargetArrow = arrowsToward.has(conn.destinationId || conn.targetId);
        const { path, sourcePoint, targetPoint } = calculateConnectionPath(
          sourceNode,
          targetNode,
          routingStyle,
          nodeScale,
          hasSourceArrow,
          hasTargetArrow
        );
        return {
          ...conn,
          path,
          sourcePoint,
          targetPoint,
          hasSourceArrow,
          hasTargetArrow,
          strokeWidth: Math.max(2, 6 * nodeScale),
          connectionName: conn.edgePrototype?.name || conn.name || 'Connection'
        };
      }).filter(Boolean);

      return {
        scaledNodes,
        scaledConnections,
        transform: { scale: nodeScale, offsetX: 0, offsetY: 0 }
      };
    }
    
    let scale;
    if (scaleMode === 'fit') {
      scale = Math.min(availableWidth / boundingWidth, availableHeight / boundingHeight);
    } else if (scaleMode === 'fill') {
      scale = Math.max(availableWidth / boundingWidth, availableHeight / boundingHeight);
    } else {
      scale = 1; // fixed
    }
    
    // Respect provided node sizes; do not clamp to a fixed visual size
    
    // Calculate centering offset
    const scaledWidth = boundingWidth * scale;
    const scaledHeight = boundingHeight * scale;
    const offsetX = (containerWidth - scaledWidth) / 2 - (minX * scale);
    const offsetY = (containerHeight - scaledHeight) / 2 - (minY * scale);

    // Apply transforms to nodes
    const scaledNodes = nodesWithPositions.map(node => ({
      ...node,
      x: node.x * scale + offsetX,
      y: node.y * scale + offsetY,
      width: node.width * scale,
      height: node.height * scale,
      cornerRadius: Math.max(1, 28 * scale)
    }));

    // Process connections
    const scaledConnections = connections.map(conn => {
      const sourceNode = scaledNodes.find(n => n.id === conn.sourceId);
      const targetNode = scaledNodes.find(n => n.id === (conn.destinationId || conn.targetId));
      
      if (!sourceNode || !targetNode) return null;
      
      // Calculate arrow states first
      const arrowsToward = conn.directionality?.arrowsToward || new Set();
      const hasSourceArrow = arrowsToward.has(conn.sourceId);
      const hasTargetArrow = arrowsToward.has(conn.destinationId || conn.targetId);
      
      // Calculate connection path with arrow awareness
      const { path, sourcePoint, targetPoint } = calculateConnectionPath(
        sourceNode, 
        targetNode, 
        routingStyle,
        scale,
        hasSourceArrow,
        hasTargetArrow
      );
      
      return {
        ...conn,
        path,
        sourcePoint,
        targetPoint,
        hasSourceArrow,
        hasTargetArrow,
        strokeWidth: Math.max(2, 6 * scale),
        color: getConnectionColor(conn),
        connectionName: getConnectionName(conn)
      };
    }).filter(Boolean);

    return { 
      scaledNodes, 
      scaledConnections, 
      transform: { scale, offsetX, offsetY }
    };
  }, [nodes, connections, instances, containerWidth, containerHeight, scaleMode, minNodeSize, maxNodeSize, padding, routingStyle, alignNodesHorizontally, calculateConnectionPath]);

  // Event handlers
  const handleNodeMouseEnter = (node) => {
    setHoveredNodeId(node.id);
    onNodeHover?.(node, true);
  };

  const handleNodeMouseLeave = (node) => {
    setHoveredNodeId(null);
    onNodeHover?.(node, false);
  };

  const handleConnectionMouseEnter = (connection) => {
    console.log(`[Handler] Connection ENTER ${connection.id}`, {
      hadTimeout: !!hoverTimeoutRef.current,
      currentHovered: hoveredConnectionId,
      stableHovered: stableHoveredConnectionId
    });
    
    // Clear any pending leave timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    setHoveredConnectionId(connection.id);
    setStableHoveredConnectionId(connection.id);
    onConnectionHover?.(connection, true);
  };

  const handleConnectionMouseLeave = (connection) => {
    console.log(`[Handler] Connection LEAVE ${connection.id}`, {
      currentHovered: hoveredConnectionId,
      stableHovered: stableHoveredConnectionId
    });
    
    setHoveredConnectionId(null);
    
    // Debounce the stable hover state to prevent flicker
    hoverTimeoutRef.current = setTimeout(() => {
      console.log(`[Handler] Connection TIMEOUT FIRED ${connection.id} - hiding dots`);
      setStableHoveredConnectionId(null);
      onConnectionHover?.(connection, false);
    }, 100); // 100ms delay before actually hiding dots
  };

  return (
    <div 
      className={`universal-node-renderer ${className}`}
      style={{ 
        width: containerWidth, 
        height: containerHeight,
        backgroundColor,
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <svg
        width={containerWidth}
        height={containerHeight}
        style={{ display: 'block' }}
      >
        {/* Grid background if enabled */}
        {showGrid && (
          <defs>
            <pattern
              id="grid"
              width={20 * transform.scale}
              height={20 * transform.scale}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${20 * transform.scale} 0 L 0 0 0 ${20 * transform.scale}`}
                fill="none"
                stroke="#e0e0e0"
                strokeWidth="1"
              />
            </pattern>
          </defs>
        )}

        {showGrid && (
          <rect width="100%" height="100%" fill="url(#grid)" />
        )}

        {/* Render connections first (behind nodes) */}
        {scaledConnections.map(conn => {
          const isHovered = hoveredConnectionId === conn.id;
          const isStableHovered = stableHoveredConnectionId === conn.id;
          
          // Debug logging - show connection data
          if (isHovered) {
            const originalConn = connections.find(c => c.id === conn.id);
            console.log(`[UniversalNodeRenderer] Connection ${conn.id} hovered:`, {
              originalPath: conn.path,
              sourcePoint: conn.sourcePoint,
              targetPoint: conn.targetPoint,
              hasSourceArrow: conn.hasSourceArrow,
              hasTargetArrow: conn.hasTargetArrow,
              connectionName: conn.connectionName,
              color: conn.color,
              originalConnection: originalConn,
              showConnectionDots,
              interactive,
              transform,
              // Check all possible name/color sources
              nameCheck: {
                'conn.name': conn.name,
                'conn.label': conn.label,
                'conn.connectionName': conn.connectionName,
                'originalConn?.name': originalConn?.name,
                'originalConn?.label': originalConn?.label,
                'originalConn?.edgePrototype?.name': originalConn?.edgePrototype?.name
              },
              colorCheck: {
                'conn.color': conn.color,
                'originalConn?.color': originalConn?.color,
                'originalConn?.edgePrototype?.color': originalConn?.edgePrototype?.color
              }
            });
          }
          
          // Calculate adjusted connection path for hover dots
          const dotRadius = Math.max(6, 10 * transform.scale);
          let adjustedPath = conn.path;
          let adjustedSourcePoint = conn.sourcePoint;
          let adjustedTargetPoint = conn.targetPoint;
          
          if (isStableHovered && showConnectionDots && ((!conn.hasSourceArrow) || (!conn.hasTargetArrow))) { // Use stable hover state for path extension
            // Extend the line to reach the dots when hovering
            const dx = conn.targetPoint.x - conn.sourcePoint.x;
            const dy = conn.targetPoint.y - conn.sourcePoint.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 0) {
              const unitX = dx / length;
              const unitY = dy / length;
              
              // Calculate dot positions (8% from nodes, same as arrows)
              const dotOffset = 0.08 * length;
              
              if (!conn.hasSourceArrow) {
                // Extend line to reach source dot
                adjustedSourcePoint = {
                  x: conn.sourcePoint.x + unitX * dotOffset,
                  y: conn.sourcePoint.y + unitY * dotOffset
                };
              } else {
                adjustedSourcePoint = conn.sourcePoint;
              }
              
              if (!conn.hasTargetArrow) {
                // Extend line to reach target dot
                adjustedTargetPoint = {
                  x: conn.targetPoint.x - unitX * dotOffset,
                  y: conn.targetPoint.y - unitY * dotOffset
                };
              } else {
                adjustedTargetPoint = conn.targetPoint;
              }
              
              adjustedPath = `M ${adjustedSourcePoint.x} ${adjustedSourcePoint.y} L ${adjustedTargetPoint.x} ${adjustedTargetPoint.y}`;
            }
          }
          
          if (isHovered) {
            console.log(`[UniversalNodeRenderer] Rendering hovered connection ${conn.id}:`, {
              originalPath: conn.path,
              adjustedPath,
              pathsMatch: conn.path === adjustedPath,
              willShorten: conn.path !== adjustedPath,
              strokeWidth: isHovered ? conn.strokeWidth * 1.35 : conn.strokeWidth,
              filter: 'none', // Currently disabled
              dotRadius,
              willShowDots: interactive && showConnectionDots && ((!conn.hasSourceArrow) || (!conn.hasTargetArrow)),
              pathLength: adjustedPath.length,
              pathValid: adjustedPath.startsWith('M') && adjustedPath.includes('L'),
              // Debug path shortening
              sourceHasArrow: conn.hasSourceArrow,
              targetHasArrow: conn.hasTargetArrow,
              shouldShorten: (!conn.hasSourceArrow) || (!conn.hasTargetArrow),
              showConnectionDots,
              interactive
            });
          }

          return (
            <g key={`connection-${conn.id}`}>
              {/* Glow filter disabled - was causing connections to disappear */}
              
              {/* Invisible much wider hover area to encompass dots */}
              {interactive && (
                <path
                  d={isStableHovered ? adjustedPath : conn.path} // Use stable hover state to prevent flicker
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(60, conn.strokeWidth * 8)} // Much wider to include dots
                  strokeLinecap="round"
                  style={{ 
                    cursor: 'pointer',
                    pointerEvents: 'stroke'
                  }}
                  onMouseEnter={(e) => {
                    console.log(`[UniversalNodeRenderer] Mouse enter connection ${conn.id} (invisible hover area)`, {
                      target: e.target.tagName,
                      clientX: e.clientX,
                      clientY: e.clientY,
                      currentHovered: hoveredConnectionId,
                      stableHovered: stableHoveredConnectionId
                    });
                    handleConnectionMouseEnter(conn);
                  }}
                  onMouseLeave={(e) => {
                    // Don't leave if moving to a dot (prevents flicker)
                    if (e.relatedTarget?.tagName === 'circle') {
                      console.log(`[UniversalNodeRenderer] Mouse moving to dot - ignoring leave event for ${conn.id}`);
                      return;
                    }
                    
                    console.log(`[UniversalNodeRenderer] Mouse leave connection ${conn.id} (invisible hover area)`, {
                      target: e.target.tagName,
                      clientX: e.clientX,
                      clientY: e.clientY,
                      relatedTarget: e.relatedTarget?.tagName,
                      currentHovered: hoveredConnectionId,
                      stableHovered: stableHoveredConnectionId
                    });
                    handleConnectionMouseLeave(conn);
                  }}
                  onClick={() => onConnectionClick?.(conn)}
                />
              )}
              
              {/* Main connection path - animated shortening on hover */}
              <path
                d={isStableHovered ? adjustedPath : conn.path} // Use stable hover state to prevent flicker
                fill="none"
                stroke={conn.color || '#000000'}
                strokeWidth={isHovered ? conn.strokeWidth * 1.35 : conn.strokeWidth}
                strokeLinecap="round"
                filter="none"
                style={{ 
                  pointerEvents: 'none', // Don't interfere with hover area above
                  transition: 'none' // Disable animation temporarily
                }}
              />
              
              {/* Direction arrows - match NodeCanvas style */}
              {conn.hasSourceArrow && (() => {
                const dx = conn.targetPoint.x - conn.sourcePoint.x;
                const dy = conn.targetPoint.y - conn.sourcePoint.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const unitX = dx / length;
                const unitY = dy / length;
                // Position arrow at same distance as dots (8% from start)
                const arrowOffset = 0.08 * length;
                const arrowX = conn.sourcePoint.x + unitX * arrowOffset;
                const arrowY = conn.sourcePoint.y + unitY * arrowOffset;
                const sourceArrowAngle = Math.atan2(-dy, -dx) * 180 / Math.PI; // Point toward the source node
                return (
                  <g 
                    transform={`translate(${arrowX}, ${arrowY}) rotate(${sourceArrowAngle + 90})`}
                    style={{ cursor: interactive ? 'pointer' : 'default' }}
                    onClick={interactive ? (e) => { e.stopPropagation(); onToggleArrow?.(conn.id, conn.sourceId); } : undefined}
                  >
                    <polygon
                      points={`${-12 * transform.scale},${15 * transform.scale} ${12 * transform.scale},${15 * transform.scale} 0,${-15 * transform.scale}`}
                      fill={conn.color || '#000000'}
                      stroke={conn.color || '#000000'}
                      strokeWidth={Math.max(2, 4 * transform.scale)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      paintOrder="stroke fill"
                    />
                  </g>
                );
              })()}
              
              {conn.hasTargetArrow && (() => {
                const dx = conn.targetPoint.x - conn.sourcePoint.x;
                const dy = conn.targetPoint.y - conn.sourcePoint.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const unitX = dx / length;
                const unitY = dy / length;
                // Position arrow at same distance as dots (8% from end)
                const arrowOffset = 0.08 * length;
                const arrowX = conn.targetPoint.x - unitX * arrowOffset;
                const arrowY = conn.targetPoint.y - unitY * arrowOffset;
                const destArrowAngle = Math.atan2(dy, dx) * 180 / Math.PI; // Point toward the target node
                return (
                  <g 
                    transform={`translate(${arrowX}, ${arrowY}) rotate(${destArrowAngle + 90})`}
                    style={{ cursor: interactive ? 'pointer' : 'default' }}
                    onClick={interactive ? (e) => { e.stopPropagation(); onToggleArrow?.(conn.id, conn.targetId || conn.destinationId); } : undefined}
                  >
                    <polygon
                      points={`${-12 * transform.scale},${15 * transform.scale} ${12 * transform.scale},${15 * transform.scale} 0,${-15 * transform.scale}`}
                      fill={conn.color || '#000000'}
                      stroke={conn.color || '#000000'}
                      strokeWidth={Math.max(2, 4 * transform.scale)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      paintOrder="stroke fill"
                    />
                  </g>
                );
              })()}
              
              {/* Connection name text - rendered on top of connection */}
              {conn.connectionName && conn.connectionName !== 'Connection' && (() => {
                const dx = conn.targetPoint.x - conn.sourcePoint.x;
                const dy = conn.targetPoint.y - conn.sourcePoint.y;
                const midX = (conn.sourcePoint.x + conn.targetPoint.x) / 2;
                const midY = (conn.sourcePoint.y + conn.targetPoint.y) / 2;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const adjustedAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;
                const fontSize = Math.max(8, 16 * transform.scale);
                
                return (
                  <text
                    x={midX}
                    y={midY}
                    fill="#bdb5b5"
                    fontSize={fontSize}
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${adjustedAngle}, ${midX}, ${midY})`}
                    stroke={conn.color || '#000000'}
                    strokeWidth={Math.max(2, conn.strokeWidth)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    paintOrder="stroke fill"
                    fontFamily="'EmOne', sans-serif"
                    style={{ pointerEvents: 'none' }}
                  >
                    {conn.connectionName}
                  </text>
                );
              })()}
              
              {/* Dots moved outside connection group to prevent interference */}
            </g>
          );
        })}
        
        {/* Render hover dots separately to prevent connection interference */}
        {interactive && showConnectionDots && scaledConnections.map(conn => {
          const isStableHovered = stableHoveredConnectionId === conn.id;
          if (!isStableHovered) return null;
          
          return (
            <g key={`dots-${conn.id}`}>
              {!conn.hasSourceArrow && (() => {
                const dx = conn.targetPoint.x - conn.sourcePoint.x;
                const dy = conn.targetPoint.y - conn.sourcePoint.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const unitX = dx / length;
                const unitY = dy / length;
                // Position dot at same distance as arrows (8% from start)
                const dotOffset = 0.08 * length;
                const dotX = conn.sourcePoint.x + unitX * dotOffset;
                const dotY = conn.sourcePoint.y + unitY * dotOffset;
                
                return (
                  <g>
                    <defs>
                      <filter id={`dot-glow-${conn.id}-source`} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation={3 * transform.scale} result="coloredBlur"/>
                        <feMerge> 
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <circle
                      cx={dotX}
                      cy={dotY}
                      r={Math.max(6, 10 * transform.scale)}
                                              fill={conn.color || '#000000'}
                        opacity={1}
                        filter={`url(#dot-glow-${conn.id}-source)`}
                        style={{ 
                          cursor: 'pointer',
                          pointerEvents: 'auto'
                        }}
                      onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        onToggleArrow?.(conn.id, conn.sourceId); 
                      }}
                    />
                  </g>
                );
              })()}
              {!conn.hasTargetArrow && (() => {
                const dx = conn.targetPoint.x - conn.sourcePoint.x;
                const dy = conn.targetPoint.y - conn.sourcePoint.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const unitX = dx / length;
                const unitY = dy / length;
                // Position dot at same distance as arrows (8% from end)
                const dotOffset = 0.08 * length;
                const dotX = conn.targetPoint.x - unitX * dotOffset;
                const dotY = conn.targetPoint.y - unitY * dotOffset;
                
                return (
                  <g>
                    <defs>
                      <filter id={`dot-glow-${conn.id}-target`} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation={3 * transform.scale} result="coloredBlur"/>
                        <feMerge> 
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <circle
                      cx={dotX}
                      cy={dotY}
                      r={Math.max(6, 10 * transform.scale)}
                      fill={conn.color || '#000000'}
                      opacity={0.8}
                      filter={`url(#dot-glow-${conn.id}-target)`}
                      style={{ 
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        transition: 'opacity 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.opacity = '0.8';
                      }}
                      onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        onToggleArrow?.(conn.id, conn.targetId || conn.destinationId); 
                      }}
                    />
                  </g>
                );
              })()}
            </g>
          );
        })}
        
        {/* Render nodes on top */}
        {scaledNodes.map(node => {
          const isHovered = hoveredNodeId === node.id;
          // Match Node.jsx title ratios: font 20, line-height 32, padding top/bottom 20, sides 22/30
          const computedFontSize = Math.max(8, 20 * transform.scale);
          const cornerRadius = Math.max(1, 28 * transform.scale);
          const singleLineSidePadding = 22 * transform.scale;
          const multiLineSidePadding = 30 * transform.scale;
          const verticalPadding = 20 * transform.scale;
          const nameString = typeof node.name === 'string' ? node.name : '';
          // Determine multiline like Node.jsx (chars-per-line heuristic)
          const averageCharWidth = 12 * transform.scale;
          const availableTextWidth = Math.max(0, node.width - (2 * singleLineSidePadding));
          const charsPerLine = Math.max(1, Math.floor(availableTextWidth / averageCharWidth));
          const isMultiline = nameString.length > charsPerLine;
          
          return (
            <g 
              key={`node-${node.id}`}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onMouseEnter={interactive ? () => handleNodeMouseEnter(node) : undefined}
              onMouseLeave={interactive ? () => handleNodeMouseLeave(node) : undefined}
              onClick={interactive ? () => onNodeClick?.(node) : undefined}
            >
              {/* Node background */}
                          {/* Background rect with exact Node.jsx styling */}
            <rect
              className="node-background"
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={cornerRadius}
              ry={cornerRadius}
              fill={node.color || '#800000'}
              stroke={isHovered && showHoverEffects ? '#000000' : 'none'}
              strokeWidth={isHovered && showHoverEffects ? Math.max(1, 12 * transform.scale) : 0}
              style={{ 
                cursor: interactive ? 'pointer' : 'default',
                transition: 'width 0.3s ease, height 0.3s ease, fill 0.2s ease'
              }}
              onMouseEnter={interactive ? () => handleNodeMouseEnter(node) : undefined}
              onMouseLeave={interactive ? () => handleNodeMouseLeave(node) : undefined}
              onClick={interactive ? () => onNodeClick?.(node) : undefined}
            />
            
            {/* Text using foreignObject like Node.jsx */}
            <foreignObject
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              style={{ 
                pointerEvents: 'none',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  padding: `${verticalPadding}px ${isMultiline ? multiLineSidePadding : singleLineSidePadding}px`,
                  boxSizing: 'border-box',
                  userSelect: 'none',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: `${computedFontSize}px`,
                    fontWeight: 'bold',
                    color: '#bdb5b5',
                    lineHeight: `${Math.max(16, 32 * transform.scale)}px`,
                    letterSpacing: '-0.2px',
                    whiteSpace: 'normal',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                    textAlign: 'center',
                    minWidth: 0,
                    display: 'inline-block',
                    width: '100%',
                    fontFamily: 'EmOne, sans-serif',
                    hyphens: 'auto',
                  }}
                >
                  {nameString}
                </span>
              </div>
            </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default UniversalNodeRenderer;
