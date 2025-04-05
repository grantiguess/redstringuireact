import React from 'react';
import { NODE_WIDTH, NODE_HEIGHT } from './constants';
import './Node.css';

// Define constants for layout
const NODE_PADDING = 30; // Padding horizontal and bottom
const SPACING = 15;      // Explicit gap between name area and image top
const CORNER_RADIUS = 40;

// Factor determining how much of the original NODE_HEIGHT is reserved for the name before image starts
const NAME_AREA_FACTOR = 0.7;

// Define dimensions for the expanded state
const EXPANDED_NODE_WIDTH = 300;

const Node = ({ node, isSelected, isDragging, onMouseDown }) => {
  const hasImage = Boolean(node.image?.src);
  const hasValidImageDimensions = hasImage && node.image.naturalWidth > 0;

  // Determine current width based on image presence
  const currentWidth = hasImage ? EXPANDED_NODE_WIDTH : NODE_WIDTH;

  // Calculate dynamic image height
  let calculatedImageHeight = 0;
  const imageWidth = currentWidth - 2 * NODE_PADDING; // Use NODE_PADDING for horizontal
  if (hasValidImageDimensions) {
    const aspectRatio = node.image.naturalHeight / node.image.naturalWidth;
    calculatedImageHeight = imageWidth * aspectRatio;
  }

  // Calculate overall node height using SPACING and NODE_PADDING
  const currentHeight = hasImage
    ? (NODE_HEIGHT * NAME_AREA_FACTOR) + SPACING + calculatedImageHeight + NODE_PADDING // Effective Name Area + Gap + Image + Bottom Padding
    : NODE_HEIGHT;

  const clipPathId = `node-clip-${node.id}`;

  // Calculate image properties
  const imageX = node.x + NODE_PADDING;
  // Add SPACING back to image Y position
  const imageY = node.y + (NODE_HEIGHT * NAME_AREA_FACTOR) + SPACING;

  return (
    <g
      className={`node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={onMouseDown}
      style={{
        transform: `scale(${node.scale})`,
        // Keep origin relative to original top-left for predictable placement
        transformOrigin: `${node.x}px ${node.y}px`,
        cursor: 'pointer'
      }}
    >
      {/* Define the clip path for the image */}
      <defs>
        <clipPath id={clipPathId}>
          <rect
            x={imageX}
            y={imageY} // Uses updated Y position
            width={imageWidth}
            height={calculatedImageHeight}
            rx={CORNER_RADIUS}
            ry={CORNER_RADIUS}
          />
        </clipPath>
      </defs>

      {/* Background Rect */}
      <rect
        className="node-background"
        x={node.x}
        y={node.y}
        rx={CORNER_RADIUS}
        ry={CORNER_RADIUS}
        width={currentWidth}
        height={currentHeight}
        fill="maroon"
        stroke={isSelected ? 'black' : 'none'}
        strokeWidth={4}
      />

      {/* ForeignObject for Name - uses NODE_PADDING, conditional alignment */}
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
            // Left-align text if image is present, otherwise center
            justifyContent: hasImage ? 'flex-start' : 'center',
            width: '100%',
            height: '100%',
            padding: `0 ${NODE_PADDING}px`, // Use NODE_PADDING for horizontal
            boxSizing: 'border-box',
            pointerEvents: 'none',
            userSelect: 'none',
            fontSize: '16px',
            fontWeight: 'bold',
            fontFamily: 'Helvetica',
            color: '#bdb5b5',
            textAlign: hasImage ? 'left' : 'center', // Also adjust textAlign
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis'
          }}
        >
          {node.name}
        </div>
      </foreignObject>

      {/* SVG Image */}
      {hasImage && (
        <image
          className="node-image"
          x={imageX}
          y={imageY} // Uses updated Y position
          width={imageWidth}
          height={calculatedImageHeight}
          href={node.image.src}
          preserveAspectRatio="xMidYMid meet"
          clipPath={`url(#${clipPathId})`}
          style={{ opacity: 1 }}
        />
      )}
    </g>
  );
};

export default Node;
