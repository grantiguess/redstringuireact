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
  innerNetworkHeight,
  idPrefix = '' // Add optional idPrefix prop with default
}) => {
  const nodeX = node.x ?? 0; // Use provided x or default to 0
  const nodeY = node.y ?? 0; // Use provided y or default to 0
  const nodeScale = node.scale ?? 1; // Use provided scale or default to 1
  const nodeName = node.name ?? 'Untitled'; // Use provided name or default
  const nodeThumbnailSrc = node.getThumbnailSrc ? node.getThumbnailSrc() : null;

  const hasThumbnail = Boolean(nodeThumbnailSrc);

  // Unique ID for the clip path - incorporate prefix
  const clipPathId = `${idPrefix}node-clip-${node.id ?? Math.random()}`;
  const innerClipPathId = `${idPrefix}node-inner-clip-${node.id ?? Math.random()}`;

  // Calculate image position based on dynamic textAreaHeight
  const contentAreaY = nodeY + textAreaHeight;

  // Define the canvas background color (or import from constants if preferred)
  const canvasBackgroundColor = '#bdb5b5';

  return (
    <g
      className={`node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isPreviewing ? 'previewing' : ''}`}
      onMouseDown={onMouseDown}
      style={{
          // Apply only scaling transform, position is handled by element attributes
          transform: isDragging ? `scale(${nodeScale})` : 'scale(1)',
          transformOrigin: `${nodeX + currentWidth / 2}px ${nodeY + currentHeight / 2}px`, // Use absolute coords for origin
          cursor: 'pointer',
      }}
    >
      <defs>
        {/* Clip path for the main image - Use absolute coords */}
        <clipPath id={clipPathId}>
          <rect
            x={nodeX + NODE_PADDING - 1} // Use absolute nodeX
            y={contentAreaY - 1} // Use calculated absolute contentAreaY
            width={imageWidth + 2}
            height={imageHeight + 2}
            rx={NODE_CORNER_RADIUS}
            ry={NODE_CORNER_RADIUS}
          />
        </clipPath>
        {/* Clip path for the inner network area - Use absolute coords */}
        <clipPath id={innerClipPathId}>
            <rect
                x={nodeX + NODE_PADDING} // Use absolute nodeX
                y={contentAreaY + 0.01} // Use calculated absolute contentAreaY + offset
                width={innerNetworkWidth}
                height={innerNetworkHeight}
                rx={NODE_CORNER_RADIUS}
                ry={NODE_CORNER_RADIUS}
            />
        </clipPath>
      </defs>

      {/* Background Rect - Use absolute coords */}
      <rect
        className="node-background"
        x={nodeX + 6} // Use absolute nodeX
        y={nodeY + 6} // Use absolute nodeY
        rx={NODE_CORNER_RADIUS - 6}
        ry={NODE_CORNER_RADIUS - 6}
        width={currentWidth - 12}
        height={currentHeight - 12}
        fill="maroon"
        stroke={isSelected ? 'black' : 'none'}
        strokeWidth={12}
        style={{ transition: 'width 0.3s ease, height 0.3s ease' }}
      />

      {/* ForeignObject for Name - Use absolute coords */}
      <foreignObject
        x={nodeX} // Use absolute nodeX
        y={nodeY} // Use absolute nodeY
        width={currentWidth}
        height={textAreaHeight}
        style={{
            transition: 'width 0.3s ease, height 0.3s ease',
            overflow: 'hidden'
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
              transition: 'color 0.3s ease' 
            }}
          >
            {nodeName}
          </span>
        </div>
      </foreignObject>

      {/* Image Container (renders if thumbnail exists) */}
      <g>
        {hasThumbnail && (
          <image
            className="node-image"
            x={nodeX + NODE_PADDING} // Use absolute nodeX
            y={contentAreaY} // Use calculated absolute contentAreaY
            width={imageWidth}
            height={imageHeight}
            href={nodeThumbnailSrc}
            preserveAspectRatio="xMidYMid meet"
            clipPath={`url(#${clipPathId})`}
            style={{ opacity: 1, transform: 'translateZ(0)' }}
          />
        )}
      </g>

      {/* --- Network Preview Container --- */}
      {isPreviewing && innerNetworkWidth > 0 && innerNetworkHeight > 0 && (
          <g style={{ transition: 'opacity 0.3s ease', opacity: 1 }} >
              <g clipPath={`url(#${innerClipPathId})`}>
                  <rect
                      x={nodeX + NODE_PADDING} // Use absolute nodeX
                      y={contentAreaY} // Use calculated absolute contentAreaY
                      width={innerNetworkWidth}
                      height={innerNetworkHeight}
                      fill={canvasBackgroundColor}
                  />
                  <g transform={`translate(${nodeX + NODE_PADDING}, ${contentAreaY})`}>
                      <InnerNetwork
                          nodes={allNodes}
                          connections={connections}
                          width={innerNetworkWidth}
                          height={innerNetworkHeight}
                          padding={5}
                      />
                  </g>
              </g>
          </g>
      )}
      {/* --- End Preview --- */}

    </g>
  );
};

export default Node;
