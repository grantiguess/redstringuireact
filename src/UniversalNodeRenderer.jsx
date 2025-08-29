import React, { useMemo, useState, useCallback } from 'react';
import { NODE_CORNER_RADIUS } from './constants';
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
  maxNodeSize = 120, // Maximum node size in pixels
  
  // Appearance
  backgroundColor = 'transparent',
  showGrid = false,
  padding = 20,
  
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
  const calculateConnectionPath = useCallback((sourceNode, targetNode, style, scale) => {
    const sourceCenterX = sourceNode.x + sourceNode.width / 2;
    const sourceCenterY = sourceNode.y + sourceNode.height / 2;
    const targetCenterX = targetNode.x + targetNode.width / 2;
    const targetCenterY = targetNode.y + targetNode.height / 2;

    if (style === 'straight') {
      return {
        path: `M ${sourceCenterX} ${sourceCenterY} L ${targetCenterX} ${targetCenterY}`,
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

    if (style === 'curved') {
      // Add curve
      const midX = (sourcePoint.x + targetPoint.x) / 2;
      const midY = (sourcePoint.y + targetPoint.y) / 2;
      const curveOffset = Math.min(50, Math.abs(dx) * 0.3, Math.abs(dy) * 0.3) * scale;
      const controlX = midX + (Math.abs(dx) > Math.abs(dy) ? 0 : curveOffset);
      const controlY = midY + (Math.abs(dx) > Math.abs(dy) ? curveOffset : 0);
      
      return {
        path: `M ${sourcePoint.x} ${sourcePoint.y} Q ${controlX} ${controlY} ${targetPoint.x} ${targetPoint.y}`,
        sourcePoint,
        targetPoint
      };
    }

    return {
      path: `M ${sourcePoint.x} ${sourcePoint.y} L ${targetPoint.x} ${targetPoint.y}`,
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
    const nodesWithPositions = nodes.map(node => {
      if (node.x !== undefined && node.y !== undefined) {
        return node;
      }
      const instance = instances.get(node.id);
      return {
        ...node,
        x: instance?.x || 0,
        y: instance?.y || 0,
        width: instance?.width || node.width || 120,
        height: instance?.height || node.height || 80
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
    
    let scale;
    if (scaleMode === 'fit') {
      scale = Math.min(availableWidth / boundingWidth, availableHeight / boundingHeight);
    } else if (scaleMode === 'fill') {
      scale = Math.max(availableWidth / boundingWidth, availableHeight / boundingHeight);
    } else {
      scale = 1; // fixed
    }
    
    // Ensure nodes don't get too small or too large
    const avgNodeSize = (120 + 80) / 2; // Average of default width/height
    const scaledNodeSize = avgNodeSize * scale;
    if (scaledNodeSize < minNodeSize) {
      scale = minNodeSize / avgNodeSize;
    } else if (scaledNodeSize > maxNodeSize) {
      scale = maxNodeSize / avgNodeSize;
    }
    
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
      cornerRadius: NODE_CORNER_RADIUS * scale
    }));

    // Process connections
    const scaledConnections = connections.map(conn => {
      const sourceNode = scaledNodes.find(n => n.id === conn.sourceId);
      const targetNode = scaledNodes.find(n => n.id === (conn.destinationId || conn.targetId));
      
      if (!sourceNode || !targetNode) return null;
      
      // Calculate connection path
      const { path, sourcePoint, targetPoint } = calculateConnectionPath(
        sourceNode, 
        targetNode, 
        routingStyle,
        scale
      );
      
      // Calculate arrow states
      const arrowsToward = conn.directionality?.arrowsToward || new Set();
      const hasSourceArrow = arrowsToward.has(conn.sourceId);
      const hasTargetArrow = arrowsToward.has(conn.destinationId || conn.targetId);
      
      return {
        ...conn,
        path,
        sourcePoint,
        targetPoint,
        hasSourceArrow,
        hasTargetArrow,
        strokeWidth: Math.max(2, 6 * scale),
        arrowSize: Math.max(4, 8 * scale)
      };
    }).filter(Boolean);

    return { 
      scaledNodes, 
      scaledConnections, 
      transform: { scale, offsetX, offsetY }
    };
  }, [nodes, connections, instances, containerWidth, containerHeight, scaleMode, minNodeSize, maxNodeSize, padding, routingStyle, calculateConnectionPath]);

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
          
          return (
            <g key={`connection-${conn.id}`}>
              {/* Main connection path */}
              <path
                d={conn.path}
                fill="none"
                stroke={conn.color || '#000000'}
                strokeWidth={isHovered ? conn.strokeWidth * 1.5 : conn.strokeWidth}
                strokeLinecap="round"
                style={{ 
                  cursor: interactive ? 'pointer' : 'default',
                  transition: showHoverEffects ? 'all 0.2s ease' : 'none'
                }}
                onMouseEnter={interactive ? () => handleConnectionMouseEnter(conn) : undefined}
                onMouseLeave={interactive ? () => handleConnectionMouseLeave(conn) : undefined}
                onClick={interactive ? () => onConnectionClick?.(conn) : undefined}
              />
              
              {/* Direction arrows */}
              {conn.hasSourceArrow && (
                <polygon
                  points={`${conn.sourcePoint.x - conn.arrowSize},${conn.sourcePoint.y - conn.arrowSize/2} ${conn.sourcePoint.x + conn.arrowSize/2},${conn.sourcePoint.y} ${conn.sourcePoint.x - conn.arrowSize},${conn.sourcePoint.y + conn.arrowSize/2}`}
                  fill={conn.color || '#000000'}
                  style={{ cursor: interactive ? 'pointer' : 'default' }}
                  onClick={interactive ? (e) => { e.stopPropagation(); onToggleArrow?.(conn.id, conn.sourceId); } : undefined}
                />
              )}
              
              {conn.hasTargetArrow && (
                <polygon
                  points={`${conn.targetPoint.x + conn.arrowSize},${conn.targetPoint.y - conn.arrowSize/2} ${conn.targetPoint.x - conn.arrowSize/2},${conn.targetPoint.y} ${conn.targetPoint.x + conn.arrowSize},${conn.targetPoint.y + conn.arrowSize/2}`}
                  fill={conn.color || '#000000'}
                  style={{ cursor: interactive ? 'pointer' : 'default' }}
                  onClick={interactive ? (e) => { e.stopPropagation(); onToggleArrow?.(conn.id, conn.targetId || conn.destinationId); } : undefined}
                />
              )}
              
              {/* Hover dots for arrow toggling */}
              {interactive && showConnectionDots && isHovered && (
                <>
                  {!conn.hasSourceArrow && (
                    <circle
                      cx={conn.sourcePoint.x}
                      cy={conn.sourcePoint.y}
                      r={conn.arrowSize}
                      fill={conn.color || '#000000'}
                      opacity={0.6}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); onToggleArrow?.(conn.id, conn.sourceId); }}
                    />
                  )}
                  {!conn.hasTargetArrow && (
                    <circle
                      cx={conn.targetPoint.x}
                      cy={conn.targetPoint.y}
                      r={conn.arrowSize}
                      fill={conn.color || '#000000'}
                      opacity={0.6}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); onToggleArrow?.(conn.id, conn.targetId || conn.destinationId); }}
                    />
                  )}
                </>
              )}
            </g>
          );
        })}
        
        {/* Render nodes on top */}
        {scaledNodes.map(node => {
          const isHovered = hoveredNodeId === node.id;
          
          return (
            <g 
              key={`node-${node.id}`}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onMouseEnter={interactive ? () => handleNodeMouseEnter(node) : undefined}
              onMouseLeave={interactive ? () => handleNodeMouseLeave(node) : undefined}
              onClick={interactive ? () => onNodeClick?.(node) : undefined}
            >
              {/* Node background */}
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={node.cornerRadius}
                ry={node.cornerRadius}
                fill={node.color || '#800000'}
                stroke={isHovered && showHoverEffects ? '#000' : 'transparent'}
                strokeWidth={Math.max(1, 3 * transform.scale)}
                style={{ 
                  filter: isHovered && showHoverEffects ? 'brightness(1.1) drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3))' : 'none',
                  transition: showHoverEffects ? 'all 0.2s ease' : 'none'
                }}
              />
              
              {/* Node text */}
              <text
                x={node.x + node.width / 2}
                y={node.y + node.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(8, 16 * transform.scale)}
                fontFamily="'EmOne', sans-serif"
                fontWeight="bold"
                fill="#bdb5b5"
                style={{ 
                  pointerEvents: 'none', 
                  userSelect: 'none'
                }}
              >
                {node.name && node.name.length > 15 ? `${node.name.slice(0, 12)}...` : node.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default UniversalNodeRenderer;
