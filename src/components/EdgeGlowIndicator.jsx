import React, { useMemo } from 'react';
import { useViewportBounds } from '../hooks/useViewportBounds';
import { getNodeDimensions } from '../utils';
import { HEADER_HEIGHT, NODE_HEIGHT } from '../constants';
import useGraphStore from '../store/graphStore';

const EdgeGlowIndicator = ({ 
  nodes, 
  panOffset, 
  zoomLevel, 
  leftPanelExpanded, 
  rightPanelExpanded,
  previewingNodeId,
  showViewportDebug = true,
  showDirectionLines = true
}) => {
  // Get TypeList visibility from store
  const typeListMode = useGraphStore(state => state.typeListMode);
  const typeListVisible = typeListMode !== 'closed';
  
  const viewportBounds = useViewportBounds(leftPanelExpanded, rightPanelExpanded, typeListVisible);

  const allNodeData = useMemo(() => {
    if (!nodes?.length || !viewportBounds) return [];

    // Calculate the actual visible viewport area in canvas coordinates
    // This is the area within the calculated viewport bounds, not just what's on screen
    const canvasViewportMinX = (-panOffset.x) / zoomLevel;
    const canvasViewportMinY = (-panOffset.y) / zoomLevel;
    const canvasViewportMaxX = canvasViewportMinX + viewportBounds.width / zoomLevel;
    const canvasViewportMaxY = canvasViewportMinY + viewportBounds.height / zoomLevel;

    const nodeData = [];

    nodes.forEach(node => {
      // Get node dimensions using the same pattern as working connections
      const isNodePreviewing = previewingNodeId === node.id;
      const dims = getNodeDimensions(node, isNodePreviewing, null);
      
      // Calculate the center of the node using the EXACT same pattern as working connections
      // From NodeCanvas.jsx line 6040-6043: const x1 = sourceNode.x + sNodeDims.currentWidth / 2;
      // and line 6041: const y1 = sourceNode.y + (isSNodePreviewing ? NODE_HEIGHT / 2 : sNodeDims.currentHeight / 2);
      const nodeCenterX = node.x + dims.currentWidth / 2;
      const nodeCenterY = node.y + (isNodePreviewing ? NODE_HEIGHT / 2 : dims.currentHeight / 2);

      // Calculate where the node center appears in overlay coordinates
      // The SVG uses: transform: translate(panOffset.x, panOffset.y) scale(zoomLevel)
      // So a point (x,y) in canvas coordinates becomes: (x * zoomLevel + panOffset.x, y * zoomLevel + panOffset.y) in screen coordinates
      // Then we subtract viewportBounds to get overlay coordinates
      const nodeScreenX = nodeCenterX * zoomLevel + panOffset.x;
      const nodeScreenY = nodeCenterY * zoomLevel + panOffset.y;
      const nodeOverlayX = nodeScreenX - viewportBounds.x;
      const nodeOverlayY = nodeScreenY - viewportBounds.y;
      
      // Check if the node center (green dot) is outside the viewport bounds (red dotted box)
      const isNodeCenterOutsideViewport = (
        nodeOverlayX < 0 ||  // to the left of viewport
        nodeOverlayX > viewportBounds.width ||   // to the right of viewport
        nodeOverlayY < 0 || // above viewport
        nodeOverlayY > viewportBounds.height       // below viewport
      );

      // Store all node data (for debug visualization)
      const nodeInfo = {
        id: node.id,
        nodeCenterX,
        nodeCenterY,
        nodeOverlayX,
        nodeOverlayY,
        isOutsideViewport: isNodeCenterOutsideViewport,
        label: node.name || node.prototype?.name || node.id
      };

      nodeData.push(nodeInfo);
    });

    return nodeData;
  }, [nodes, panOffset, zoomLevel, viewportBounds, previewingNodeId]);

  const offScreenGlows = useMemo(() => {
    const glows = [];

    allNodeData.forEach(nodeInfo => {
      if (!nodeInfo.isOutsideViewport) return; // Only create glows for nodes outside viewport

      // Simple and direct: place dot on the edge closest to the node
      const containerW = viewportBounds.width;
      const containerH = viewportBounds.height;
      
      // Use the node position from nodeInfo
      const nodePxX = nodeInfo.nodeOverlayX;
      const nodePxY = nodeInfo.nodeOverlayY;
      
      // Find which edge the node is closest to and place dot there
      // These distances are already in overlay pixel space (accounts for zoom)
      const distToLeft = Math.abs(nodePxX);
      const distToRight = Math.abs(containerW - nodePxX);
      const distToTop = Math.abs(nodePxY);
      const distToBottom = Math.abs(containerH - nodePxY);
      
      const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
      
      let screenX, screenY;
      if (minDist === distToLeft) {
        // Place on left edge
        screenX = 0;
        screenY = Math.max(0, Math.min(containerH, nodePxY));
      } else if (minDist === distToRight) {
        // Place on right edge
        screenX = containerW;
        screenY = Math.max(0, Math.min(containerH, nodePxY));
      } else if (minDist === distToTop) {
        // Place on top edge
        screenX = Math.max(0, Math.min(containerW, nodePxX));
        screenY = 0;
      } else {
        // Place on bottom edge
        screenX = Math.max(0, Math.min(containerW, nodePxX));
        screenY = containerH;
      }

      // Calculate intensity based on distance from viewport center
      const viewportCenterPxX = containerW / 2;
      const viewportCenterPxY = containerH / 2;
      const distance = Math.sqrt((nodePxX - viewportCenterPxX) ** 2 + (nodePxY - viewportCenterPxY) ** 2);
      const intensity = Math.max(0.4, Math.min(1, 2000 / (distance + 200)));

      // Get node color (fallback to default if not specified)
      const node = nodes.find(n => n.id === nodeInfo.id);
      const nodeColor = node?.color || node?.prototype?.color || '#8B0000';

      glows.push({
        id: nodeInfo.id,
        screenX, // Already relative to overlay container
        screenY, // Already relative to overlay container
        color: nodeColor,
        intensity,
        nodeCenterX: nodeInfo.nodeCenterX,
        nodeCenterY: nodeInfo.nodeCenterY,
        label: nodeInfo.label
      });
    });

    return glows;
  }, [allNodeData, nodes, viewportBounds]);

  if (!viewportBounds) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: viewportBounds.x,
        top: viewportBounds.y,
        width: viewportBounds.width,
        height: viewportBounds.height,
        pointerEvents: 'none',
        zIndex: 1000
      }}
    >
      {/* Debug viewport bounds visualization - positioned absolutely */}
      {showViewportDebug && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            border: '2px dashed rgba(255, 0, 0, 0.8)',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 20px rgba(255, 0, 0, 0.3)',
            zIndex: 999999
          }}
        />
      )}
      
      {/* Debug direction lines */}
      {showDirectionLines && (
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 999998
          }}
        >
          {allNodeData.map(nodeInfo => {
            const centerX = viewportBounds.width / 2;
            const centerY = viewportBounds.height / 2;
            
            const nodeOverlayX = nodeInfo.nodeOverlayX;
            const nodeOverlayY = nodeInfo.nodeOverlayY;
            
            // Find the corresponding glow (if any)
            const glow = offScreenGlows.find(g => g.id === nodeInfo.id);
            
            return (
              <g key={`debug-${nodeInfo.id}`}>
                {/* Line from center to actual node position */}
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={nodeOverlayX}
                  y2={nodeOverlayY}
                  stroke="rgba(0, 255, 0, 0.8)"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                />
                {/* Line from center to dot (only if glow exists) */}
                {glow && (
                  <line
                    x1={centerX}
                    y1={centerY}
                    x2={glow.screenX}
                    y2={glow.screenY}
                    stroke="rgba(255, 0, 0, 0.6)"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                )}
                {/* Mark the actual node position */}
                <circle
                  cx={nodeOverlayX}
                  cy={nodeOverlayY}
                  r="4"
                  fill={nodeInfo.isOutsideViewport ? "rgba(0, 255, 0, 0.8)" : "rgba(0, 255, 0, 0.3)"}
                  stroke="white"
                  strokeWidth="1"
                />
              </g>
            );
          })}
        </svg>
      )}

      
      {/* Debug corner labels */}
      {showViewportDebug && (
        <>
          <div style={{ position: 'absolute', top: '5px', left: '5px', color: 'red', fontSize: '12px', fontWeight: 'bold' }}>
            VIEWPORT: {Math.round(viewportBounds.x)},{Math.round(viewportBounds.y)} {Math.round(viewportBounds.width)}x{Math.round(viewportBounds.height)}
          </div>
          <div style={{ position: 'absolute', top: '25px', left: '5px', color: 'red', fontSize: '10px' }}>
            TypeList: {typeListVisible ? 'VISIBLE' : 'HIDDEN'} | Left: {leftPanelExpanded ? 'OPEN' : 'CLOSED'} | Right: {rightPanelExpanded ? 'OPEN' : 'CLOSED'}
          </div>
          <div style={{ position: 'absolute', top: '40px', left: '5px', color: 'red', fontSize: '10px' }}>
            Header: {HEADER_HEIGHT}px | Window: {viewportBounds?.windowWidth || 'N/A'}x{viewportBounds?.windowHeight || 'N/A'}
          </div>
          <div style={{ position: 'absolute', top: '55px', left: '5px', color: 'red', fontSize: '10px' }}>
            Y Offset: {viewportBounds?.y || 'N/A'} | Expected: {HEADER_HEIGHT}
          </div>
        </>
      )}
      
      {/* Render individual glow dots */}
      {offScreenGlows.map(glow => {
        const { id, screenX, screenY, color, intensity } = glow;
        const size = 24; // Size of the glow dot
        const glowRadius = size * 2; // Size of the glow effect
        
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX - size / 2,
              top: screenY - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${color}${Math.round(intensity * 255 * 0.8).toString(16).padStart(2, '0')} 0%, ${color}${Math.round(intensity * 255 * 0.4).toString(16).padStart(2, '0')} 50%, transparent 100%)`,
              boxShadow: `0 0 ${glowRadius}px ${color}${Math.round(intensity * 255 * 0.3).toString(16).padStart(2, '0')}`,
              transition: 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out',
              transform: `scale(${0.7 + intensity * 0.3})`,
              animation: `pulse-glow-${id} ${2 + Math.random()}s ease-in-out infinite`,
              pointerEvents: 'none'
            }}
          >
            {/* Add CSS animation keyframes */}
            <style>
              {`
                @keyframes pulse-glow-${id} {
                  0%, 100% { 
                    opacity: ${intensity * 0.7}; 
                    transform: scale(${0.7 + intensity * 0.3});
                  }
                  50% { 
                    opacity: ${intensity * 1}; 
                    transform: scale(${0.8 + intensity * 0.4});
                  }
                }
              `}
            </style>
            {showViewportDebug && (
              <div
                style={{
                  position: 'absolute',
                  left: screenX + 14,
                  top: screenY - 4,
                  color: '#260000',
                  background: 'rgba(255,255,255,0.85)',
                  padding: '2px 6px',
                  borderRadius: 6,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none'
                }}
              >
                {glow.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EdgeGlowIndicator;
