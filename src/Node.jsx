import React, { useMemo } from 'react';
// Import base constants used
import { NODE_WIDTH, NODE_HEIGHT, NODE_CORNER_RADIUS, NODE_PADDING } from './constants';
import './Node.css';
import InnerNetwork from './InnerNetwork.jsx'; // Import InnerNetwork
import { getNodeDimensions } from './utils.js'; // Import needed for node dims

const PREVIEW_SCALE_FACTOR = 0.3; // How much to shrink the network layout

// Accept dimensions and other props
const Node = ({
  node,
  isSelected,
  isDragging,
  onMouseDown,
  currentWidth,
  currentHeight,
  textAreaHeight,
  imageWidth,
  imageHeight,
  // --- Add preview-related props ---
  isPreviewing,
  allNodes,
  connections,
  innerNetworkWidth,
  innerNetworkHeight
}) => {
  const hasImage = !isPreviewing && Boolean(node.image?.src);

  // Unique ID for the clip path
  const clipPathId = `node-clip-${node.id}`;
  const innerClipPathId = `node-inner-clip-${node.id}`;

  // Calculate image position based on dynamic textAreaHeight
  const contentAreaY = node.y + textAreaHeight;

  // --- Calculate Transformed Nodes for Preview ---
  const previewNodes = useMemo(() => {
    if (!isPreviewing || !allNodes || allNodes.length === 0 || !innerNetworkWidth || !innerNetworkHeight) {
      return [];
    }

    // 1. Find bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodes.forEach(n => {
        // Use getNodeDimensions to get accurate size for bounds calculation
        const dims = getNodeDimensions(n, false); // Get normal dimensions
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + dims.currentWidth);
        maxY = Math.max(maxY, n.y + dims.currentHeight);
    });

    // Handle case where only one node exists (or no nodes)
    if (!isFinite(minX)) {
        return allNodes.map(n => ({ ...n, x: innerNetworkWidth / 2 - getNodeDimensions(n, false).currentWidth / 2, y: innerNetworkHeight / 2 - getNodeDimensions(n, false).currentHeight / 2 }));
    }

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const centerX = minX + boundsWidth / 2;
    const centerY = minY + boundsHeight / 2;

    // Center of the preview area
    const previewCenterX = innerNetworkWidth / 2;
    const previewCenterY = innerNetworkHeight / 2;

    // 2. Transform coordinates
    return allNodes.map(n => {
        const dims = getNodeDimensions(n, false); // Get normal dimensions again for positioning
        // Translate to origin based on bounding box center
        const translatedX = n.x - centerX;
        const translatedY = n.y - centerY;

        // Scale down
        const scaledX = translatedX * PREVIEW_SCALE_FACTOR;
        const scaledY = translatedY * PREVIEW_SCALE_FACTOR;

        // Translate to center of preview area (adjusting for node's own width/height)
        const finalX = previewCenterX + scaledX - (dims.currentWidth * PREVIEW_SCALE_FACTOR) / 2;
        const finalY = previewCenterY + scaledY - (dims.currentHeight * PREVIEW_SCALE_FACTOR) / 2;

        return {
            ...n,
            x: finalX,
            y: finalY,
            // Also scale the node size visually in the preview?
            // scale: PREVIEW_SCALE_FACTOR // Optional: Visually shrink nodes too
        };
    });

  }, [isPreviewing, allNodes, innerNetworkWidth, innerNetworkHeight]);

  // Define the canvas background color (or import from constants if preferred)
  const canvasBackgroundColor = '#bdb5b5';

  return (
    <g
      className={`node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isPreviewing ? 'previewing' : ''}`}
      onMouseDown={onMouseDown}
      style={{ 
          // Keep transform for dragging selection scale-up, but maybe not for preview?
          transform: isDragging ? `scale(${node.scale})` : 'scale(1)', // Only apply dragging scale
          transformOrigin: `${node.x + currentWidth / 2}px ${node.y + currentHeight / 2}px`,
          cursor: 'pointer',
          // Apply transitions directly here for smoother prop changes
          transition: 'transform 0.05s ease' // Keep dragging scale transition
      }}
    >
      <defs>
        {/* Clip path for the main image (if shown) */}
        <clipPath id={clipPathId}>
          <rect
            x={node.x + NODE_PADDING - 1} // Position relative to node base
            y={contentAreaY - 1}           // Position below text area
            width={imageWidth + 2}
            height={imageHeight + 2}
            rx={NODE_CORNER_RADIUS}
            ry={NODE_CORNER_RADIUS}
          />
        </clipPath>
        {/* Clip path for the inner network area - Adjust Y */}
        <clipPath id={innerClipPathId}>
            <rect 
                x={node.x + NODE_PADDING} 
                y={contentAreaY} // Start immediately after text area
                width={innerNetworkWidth} 
                height={innerNetworkHeight} 
                rx={NODE_CORNER_RADIUS}
                ry={NODE_CORNER_RADIUS}
            />
        </clipPath>
      </defs>

      {/* Background Rect - Apply transitions */}
      <rect
        className="node-background"
        x={node.x + 6}
        y={node.y + 6}
        rx={NODE_CORNER_RADIUS - 6}
        ry={NODE_CORNER_RADIUS - 6}
        width={currentWidth - 12}
        height={currentHeight - 12}
        fill="maroon"
        stroke={isSelected ? 'black' : 'none'}
        strokeWidth={12}
        // Add transition style directly for dimension changes
        style={{ transition: 'width 0.3s ease, height 0.3s ease' }}
      />

      {/* ForeignObject for Name - Apply transitions and dimensions */}
      <foreignObject
        x={node.x}
        y={node.y}
        width={currentWidth} // Apply animated width
        height={textAreaHeight} // Apply animated height
        // Add transition style directly for dimension changes
        style={{ 
            transition: 'width 0.3s ease, height 0.3s ease',
            overflow: 'hidden' // Hide overflow during transition
        }}
      >
        <div
          className="node-name-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            padding: `0 ${NODE_PADDING}px`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            userSelect: 'none',
            // overflow: 'hidden', // Remove from here
            wordWrap: 'break-word',
            minWidth: 0
          }}
        >
          <span
            className="node-name-text"
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#bdb5b5',
              whiteSpace: 'pre-wrap',
              maxWidth: '100%',
              textAlign: 'center',
              wordBreak: 'keep-all',
              overflowWrap: 'normal',
              minWidth: 0,
              display: 'inline-block',
              width: '100%',
              // Add transition for potential color/opacity changes
              transition: 'color 0.3s ease' 
            }}
          >
            {node.name}
          </span>
        </div>
      </foreignObject>

      {/* Image Container (fades out during preview) */}
      <g style={{ transition: 'opacity 0.3s ease', opacity: isPreviewing ? 0 : 1 }}>
        {hasImage && (
          <image
            className="node-image"
            x={node.x + NODE_PADDING}
            y={contentAreaY}
            width={imageWidth}
            height={imageHeight}
            href={node.image?.thumbnailSrc || node.image?.src}
            preserveAspectRatio="xMidYMid meet"
            clipPath={`url(#${clipPathId})`}
            style={{ 
              opacity: 1,
              transform: 'translateZ(0)'
            }}
          />
        )}
      </g>
      
      {/* Network Preview Container */}
      <g style={{ transition: 'opacity 0.3s ease', opacity: isPreviewing ? 1 : 0 }} >
          {isPreviewing && innerNetworkWidth > 0 && innerNetworkHeight > 0 && (
              <g clipPath={`url(#${innerClipPathId})`}>
                  {/* Network Area Background Rect - Adjust Y */}
                  <rect
                      x={node.x + NODE_PADDING}
                      y={contentAreaY} // Start immediately after text area
                      width={innerNetworkWidth}
                      height={innerNetworkHeight}
                      fill={canvasBackgroundColor} 
                  />
                  {/* Inner Network */}
                  <g transform={`translate(${node.x + NODE_PADDING}, ${contentAreaY})`}>
                      <InnerNetwork
                          nodes={previewNodes}
                          connections={connections}
                          width={innerNetworkWidth}
                          height={innerNetworkHeight}
                          padding={15}
                          isPreviewLayout={true}
                          previewScaleFactor={PREVIEW_SCALE_FACTOR}
                      />
                  </g>
              </g>
          )}
      </g>
    </g>
  );
};

export default Node;
