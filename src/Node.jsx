import React from 'react';
// Import base constants used
import { NODE_WIDTH, NODE_HEIGHT, NODE_CORNER_RADIUS, NODE_PADDING } from './constants';
import './Node.css';

// Removed layout constants - now calculated in NodeCanvas

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
  imageHeight
}) => {
  const hasImage = Boolean(node.image?.src);

  // Unique ID for the clip path
  const clipPathId = `node-clip-${node.id}`;

  // Calculate image position based on dynamic textAreaHeight
  const imageX = node.x + NODE_PADDING;
  const imageY = node.y + textAreaHeight; // Position directly below dynamic text area

  return (
    <g
      className={`node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={onMouseDown}
      style={{
        transform: `scale(${node.scale})`,
        transformOrigin: `${node.x + currentWidth / 2}px ${node.y + currentHeight / 2}px`,
        cursor: 'pointer'
      }}
    >
      {/* Define the clip path for the image */}
      <defs>
        <clipPath id={clipPathId}>
          <rect
            x={imageX - 1}
            y={imageY - 1}
            width={imageWidth + 2}
            height={imageHeight + 2}
            rx={NODE_CORNER_RADIUS}
            ry={NODE_CORNER_RADIUS}
          />
        </clipPath>
      </defs>

      {/* Background Rect - Uses total currentHeight */}
      <rect
        className="node-background"
        x={node.x}
        y={node.y}
        rx={NODE_CORNER_RADIUS}
        ry={NODE_CORNER_RADIUS}
        width={currentWidth}
        height={currentHeight}
        fill="maroon"
        stroke={isSelected ? 'black' : 'none'}
        strokeWidth={4}
      />

      {/* ForeignObject for Name - Use specific textAreaHeight */}
      <foreignObject
        x={node.x}
        y={node.y}
        width={currentWidth}
        height={textAreaHeight}
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
            overflow: 'hidden'
          }}
        >
          {/* Inner span - Allow wrapping */}
          <span
            className="node-name-text"
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#bdb5b5',
              whiteSpace: 'normal',
              maxWidth: '100%',
              textAlign: 'center',
              wordBreak: 'break-word'
            }}
          >
            {node.name}
          </span>
        </div>
      </foreignObject>

      {/* SVG Image - Positioned below textAreaHeight */}
      {hasImage && (
        <image
          className="node-image"
          x={imageX}
          y={imageY}
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
  );
};

export default Node;
