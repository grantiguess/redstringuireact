import React, { useMemo, useState, useCallback } from 'react';
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
        // Removed arrowSize - using fixed NodeCanvas points now
        connectionName: conn.edgePrototype?.name || conn.name || 'Connection'
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
    setHoveredConnectionId(connection.id);
    onConnectionHover?.(connection, true);
  };

  const handleConnectionMouseLeave = (connection) => {
    setHoveredConnectionId(null);
    onConnectionHover?.(connection, false);
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
          
          // Calculate adjusted connection path for hover dots
          const dotRadius = Math.max(6, 10 * transform.scale);
          const arrowTipLength = 24 * transform.scale;
          let adjustedPath = conn.path;
          let adjustedSourcePoint = conn.sourcePoint;
          let adjustedTargetPoint = conn.targetPoint;
          
          if (isHovered && showConnectionDots) {
            // Shorten the line more aggressively when hovering
            const dx = conn.targetPoint.x - conn.sourcePoint.x;
            const dy = conn.targetPoint.y - conn.sourcePoint.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length > 0) {
              const unitX = dx / length;
              const unitY = dy / length;
              
              if (!conn.hasSourceArrow) {
                // Stop well before the dot center for better visual separation
                const shortenDistance = dotRadius + (8 * transform.scale);
                adjustedSourcePoint = {
                  x: conn.sourcePoint.x + unitX * shortenDistance,
                  y: conn.sourcePoint.y + unitY * shortenDistance
                };
              } else {
                // For arrows, stop before the arrow tip
                adjustedSourcePoint = {
                  x: conn.sourcePoint.x + unitX * (arrowTipLength + 4 * transform.scale),
                  y: conn.sourcePoint.y + unitY * (arrowTipLength + 4 * transform.scale)
                };
              }
              
              if (!conn.hasTargetArrow) {
                // Stop well before the dot center for better visual separation
                const shortenDistance = dotRadius + (8 * transform.scale);
                adjustedTargetPoint = {
                  x: conn.targetPoint.x - unitX * shortenDistance,
                  y: conn.targetPoint.y - unitY * shortenDistance
                };
              } else {
                // For arrows, stop before the arrow tip
                adjustedTargetPoint = {
                  x: conn.targetPoint.x - unitX * (arrowTipLength + 4 * transform.scale),
                  y: conn.targetPoint.y - unitY * (arrowTipLength + 4 * transform.scale)
                };
              }
              
              adjustedPath = `M ${adjustedSourcePoint.x} ${adjustedSourcePoint.y} L ${adjustedTargetPoint.x} ${adjustedTargetPoint.y}`;
            }
          }
          
          return (
            <g key={`connection-${conn.id}`}>
              {/* Glow filter for connection line */}
              {isHovered && (
                <defs>
                  <filter id={`line-glow-${conn.id}`}>
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge> 
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
              )}
              
              {/* Main connection path */}
              <path
                d={adjustedPath}
                fill="none"
                stroke={conn.color || '#000000'}
                strokeWidth={isHovered ? conn.strokeWidth * 1.35 : conn.strokeWidth}
                strokeLinecap="round"
                filter={isHovered ? `url(#line-glow-${conn.id})` : 'none'}
                style={{ 
                  cursor: interactive ? 'pointer' : 'default',
                  transition: showHoverEffects ? 'all 0.2s ease' : 'none'
                }}
                onMouseEnter={interactive ? () => handleConnectionMouseEnter(conn) : undefined}
                onMouseLeave={interactive ? () => handleConnectionMouseLeave(conn) : undefined}
                onClick={interactive ? () => onConnectionClick?.(conn) : undefined}
              />
              
              {/* Direction arrows - match NodeCanvas style */}
              {conn.hasSourceArrow && (() => {
                const dx = conn.targetPoint.x - conn.sourcePoint.x;
                const dy = conn.targetPoint.y - conn.sourcePoint.y;
                const sourceArrowAngle = Math.atan2(-dy, -dx) * 180 / Math.PI; // Point toward the source node
                return (
                  <g 
                    transform={`translate(${conn.sourcePoint.x}, ${conn.sourcePoint.y}) rotate(${sourceArrowAngle + 90})`}
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
                const destArrowAngle = Math.atan2(dy, dx) * 180 / Math.PI; // Point toward the target node
                return (
                  <g 
                    transform={`translate(${conn.targetPoint.x}, ${conn.targetPoint.y}) rotate(${destArrowAngle + 90})`}
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
              
              {/* Hover dots for arrow toggling */}
              {interactive && showConnectionDots && isHovered && (
                <>
                  {!conn.hasSourceArrow && (
                    <g>
                      <defs>
                        <filter id={`glow-${conn.id}-source`}>
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge> 
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <circle
                        cx={conn.sourcePoint.x}
                        cy={conn.sourcePoint.y}
                        r={Math.max(6, 10 * transform.scale)}
                        fill={conn.color || '#000000'}
                        opacity={0.8}
                        filter={`url(#glow-${conn.id}-source)`}
                        style={{ 
                          cursor: 'pointer',
                          pointerEvents: 'all',
                          transition: 'opacity 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.opacity = '1';
                          e.stopPropagation();
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.opacity = '0.8';
                          e.stopPropagation();
                        }}
                        onClick={(e) => { 
                          e.preventDefault();
                          e.stopPropagation(); 
                          onToggleArrow?.(conn.id, conn.sourceId); 
                        }}
                      />
                    </g>
                  )}
                  {!conn.hasTargetArrow && (
                    <g>
                      <defs>
                        <filter id={`glow-${conn.id}-target`}>
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge> 
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <circle
                        cx={conn.targetPoint.x}
                        cy={conn.targetPoint.y}
                        r={Math.max(6, 10 * transform.scale)}
                        fill={conn.color || '#000000'}
                        opacity={0.8}
                        filter={`url(#glow-${conn.id}-target)`}
                        style={{ 
                          cursor: 'pointer',
                          pointerEvents: 'all',
                          transition: 'opacity 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.opacity = '1';
                          e.stopPropagation();
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.opacity = '0.8';
                          e.stopPropagation();
                        }}
                        onClick={(e) => { 
                          e.preventDefault();
                          e.stopPropagation(); 
                          onToggleArrow?.(conn.id, conn.targetId || conn.destinationId); 
                        }}
                      />
                    </g>
                  )}
                </>
              )}
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
