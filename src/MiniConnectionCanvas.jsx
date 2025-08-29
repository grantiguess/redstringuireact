import React, { useMemo, useState, useRef } from 'react';
import { NODE_CORNER_RADIUS } from './constants';
import useGraphStore from './store/graphStore';

const MiniConnectionCanvas = ({
  connections = [], // Array of connection objects with full node data
  scale = 0.1, // Scale factor for miniaturization
  width = 280,
  height = 120,
  onNodeClick,
  onConnectionClick,
  onToggleArrow
}) => {
  const [hoveredConnectionId, setHoveredConnectionId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const svgRef = useRef(null);

  const graphsMap = useGraphStore((state) => state.graphs);
  const activeGraphId = useGraphStore((state) => state.activeGraphId);
  
  // Get node instances from active graph
  const instances = useMemo(() => {
    if (!activeGraphId || !graphsMap) return new Map();
    return graphsMap.get(activeGraphId)?.instances || new Map();
  }, [activeGraphId, graphsMap]);

  // Calculate bounds and scaled positions for all nodes involved in connections
  const { scaledNodes, scaledConnections, viewBox } = useMemo(() => {
    if (!connections.length || !instances.size) {
      return { scaledNodes: [], scaledConnections: [], viewBox: `0 0 ${width} ${height}` };
    }

    // Collect all unique nodes involved in these connections
    const nodeIds = new Set();
    connections.forEach(conn => {
      nodeIds.add(conn.sourceId);
      nodeIds.add(conn.destinationId || conn.targetId);
    });

    // Get actual node data with positions
    const nodes = Array.from(nodeIds).map(id => {
      const instance = instances.get(id);
      return instance ? {
        id,
        x: instance.x || 0,
        y: instance.y || 0,
        width: instance.width || 120,
        height: instance.height || 80,
        name: instance.name || 'Node',
        color: instance.color || '#800000'
      } : null;
    }).filter(Boolean);

    if (!nodes.length) {
      return { scaledNodes: [], scaledConnections: [], viewBox: `0 0 ${width} ${height}` };
    }

    // Calculate bounding box
    const minX = Math.min(...nodes.map(n => n.x));
    const maxX = Math.max(...nodes.map(n => n.x + n.width));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxY = Math.max(...nodes.map(n => n.y + n.height));
    
    const boundingWidth = maxX - minX;
    const boundingHeight = maxY - minY;
    
    // Add padding
    const padding = 20;
    const paddedWidth = boundingWidth + padding * 2;
    const paddedHeight = boundingHeight + padding * 2;
    
    // Calculate scale to fit in container
    const scaleX = width / paddedWidth;
    const scaleY = height / paddedHeight;
    const finalScale = Math.min(scaleX, scaleY, scale); // Don't exceed requested scale
    
    // Center the content
    const scaledWidth = paddedWidth * finalScale;
    const scaledHeight = paddedHeight * finalScale;
    const offsetX = (width - scaledWidth) / 2;
    const offsetY = (height - scaledHeight) / 2;

    // Scale node positions and sizes
    const scaledNodes = nodes.map(node => ({
      ...node,
      x: offsetX + (node.x - minX + padding) * finalScale,
      y: offsetY + (node.y - minY + padding) * finalScale,
      width: node.width * finalScale,
      height: node.height * finalScale
    }));

    // Process connections with scaled coordinates
    const scaledConnections = connections.map(conn => {
      const sourceNode = scaledNodes.find(n => n.id === conn.sourceId);
      const targetNode = scaledNodes.find(n => n.id === (conn.destinationId || conn.targetId));
      
      if (!sourceNode || !targetNode) return null;
      
      // Calculate connection path - use smart routing like NodeCanvas
      const sourceX = sourceNode.x + sourceNode.width / 2;
      const sourceY = sourceNode.y + sourceNode.height / 2;
      const targetX = targetNode.x + targetNode.width / 2;
      const targetY = targetNode.y + targetNode.height / 2;
      
      // Calculate optimal port positions (simplified version of NodeCanvas logic)
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      
      let sourcePortX = sourceX;
      let sourcePortY = sourceY;
      let targetPortX = targetX;
      let targetPortY = targetY;
      
      // Use side-based routing for better visual clarity
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal connection preferred
        if (dx > 0) {
          // Target is to the right
          sourcePortX = sourceNode.x + sourceNode.width;
          targetPortX = targetNode.x;
        } else {
          // Target is to the left
          sourcePortX = sourceNode.x;
          targetPortX = targetNode.x + targetNode.width;
        }
      } else {
        // Vertical connection preferred
        if (dy > 0) {
          // Target is below
          sourcePortY = sourceNode.y + sourceNode.height;
          targetPortY = targetNode.y;
        } else {
          // Target is above
          sourcePortY = sourceNode.y;
          targetPortY = targetNode.y + targetNode.height;
        }
      }
      
      // Calculate arrow directions
      const arrowsToward = conn.directionality?.arrowsToward || new Set();
      const hasSourceArrow = arrowsToward.has(conn.sourceId);
      const hasTargetArrow = arrowsToward.has(conn.destinationId || conn.targetId);
      
      return {
        id: conn.id,
        sourceId: conn.sourceId,
        targetId: conn.destinationId || conn.targetId,
        sourceX: sourcePortX,
        sourceY: sourcePortY,
        targetX: targetPortX,
        targetY: targetPortY,
        centerX: (sourceX + targetX) / 2,
        centerY: (sourceY + targetY) / 2,
        color: conn.color || '#000000',
        hasSourceArrow,
        hasTargetArrow,
        edgePrototype: conn.edgePrototype,
        // Add path data for curved connections
        pathData: `M ${sourcePortX} ${sourcePortY} Q ${(sourcePortX + targetPortX) / 2} ${(sourcePortY + targetPortY) / 2 + (Math.abs(dx) > Math.abs(dy) ? dy * 0.3 : dx * 0.3)} ${targetPortX} ${targetPortY}`
      };
    }).filter(Boolean);

    const viewBox = `0 0 ${width} ${height}`;
    
    return { scaledNodes, scaledConnections, viewBox };
  }, [connections, instances, width, height, scale]);

  // Handle mouse events
  const handleNodeMouseEnter = (nodeId) => setHoveredNodeId(nodeId);
  const handleNodeMouseLeave = () => setHoveredNodeId(null);
  const handleConnectionMouseEnter = (connId) => setHoveredConnectionId(connId);
  const handleConnectionMouseLeave = () => setHoveredConnectionId(null);

  const handleNodeClick = (node) => {
    onNodeClick?.(node);
  };

  const handleConnectionClick = (connection) => {
    onConnectionClick?.(connection);
  };

  const handleArrowClick = (connectionId, targetNodeId, e) => {
    e.stopPropagation();
    onToggleArrow?.(connectionId, targetNodeId);
  };

  return (
    <div style={{ 
      width: `${width}px`, 
      height: `${height}px`,
      border: '1px solid #ccc',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: '#f5f5f5'
    }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={viewBox}
        style={{ display: 'block' }}
      >
        {/* Render connections first (behind nodes) */}
        {scaledConnections.map(conn => {
          const isHovered = hoveredConnectionId === conn.id;
          
          return (
            <g key={`connection-${conn.id}`}>
              {/* Main connection path */}
              <path
                d={conn.pathData}
                fill="none"
                stroke={conn.color}
                strokeWidth={isHovered ? 3 : 2}
                strokeLinecap="round"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => handleConnectionMouseEnter(conn.id)}
                onMouseLeave={handleConnectionMouseLeave}
                onClick={() => handleConnectionClick(conn)}
              />
              
              {/* Direction arrows */}
              {conn.hasSourceArrow && (
                <g>
                  {/* Arrow pointing to source */}
                  <polygon
                    points={`${conn.sourceX-4},${conn.sourceY-2} ${conn.sourceX+2},${conn.sourceY} ${conn.sourceX-4},${conn.sourceY+2}`}
                    fill={conn.color}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleArrowClick(conn.id, conn.sourceId, e)}
                  />
                </g>
              )}
              
              {conn.hasTargetArrow && (
                <g>
                  {/* Arrow pointing to target */}
                  <polygon
                    points={`${conn.targetX+4},${conn.targetY-2} ${conn.targetX-2},${conn.targetY} ${conn.targetX+4},${conn.targetY+2}`}
                    fill={conn.color}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleArrowClick(conn.id, conn.targetId, e)}
                  />
                </g>
              )}
              
              {/* Hover dots for direction toggling */}
              {isHovered && (
                <>
                  {!conn.hasSourceArrow && (
                    <circle
                      cx={conn.sourceX}
                      cy={conn.sourceY}
                      r={4}
                      fill={conn.color}
                      opacity={0.8}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => handleArrowClick(conn.id, conn.sourceId, e)}
                    />
                  )}
                  {!conn.hasTargetArrow && (
                    <circle
                      cx={conn.targetX}
                      cy={conn.targetY}
                      r={4}
                      fill={conn.color}
                      opacity={0.8}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => handleArrowClick(conn.id, conn.targetId, e)}
                    />
                  )}
                  {/* Connection center dot for labeling/editing */}
                  <circle
                    cx={conn.centerX}
                    cy={conn.centerY}
                    r={6}
                    fill={conn.color}
                    opacity={0.6}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleConnectionClick(conn)}
                  />
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
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => handleNodeMouseEnter(node.id)}
              onMouseLeave={handleNodeMouseLeave}
              onClick={() => handleNodeClick(node)}
            >
              {/* Node background with border like NodeCanvas */}
              <rect
                x={node.x + 1}
                y={node.y + 1}
                width={node.width - 2}
                height={node.height - 2}
                rx={NODE_CORNER_RADIUS * (node.width / 120)} // Scale corner radius
                ry={NODE_CORNER_RADIUS * (node.height / 80)}
                fill={node.color}
                stroke={isHovered ? '#000' : 'transparent'}
                strokeWidth={isHovered ? 2 : 1}
                style={{ 
                  filter: isHovered ? 'brightness(1.1) drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3))' : 'none',
                  transition: 'all 0.2s ease'
                }}
              />
              
              {/* Node text */}
              <text
                x={node.x + node.width / 2}
                y={node.y + node.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(8, node.width * 0.1)} // Scale font size
                fontFamily="'EmOne', sans-serif"
                fontWeight="bold"
                fill="#bdb5b5"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {node.name.length > 15 ? `${node.name.slice(0, 12)}...` : node.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default MiniConnectionCanvas;
