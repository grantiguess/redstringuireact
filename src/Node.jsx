import React, { useMemo, useState, useEffect, useRef } from 'react';
// Import base constants used
import { NODE_WIDTH, NODE_HEIGHT, NODE_CORNER_RADIUS, NODE_PADDING } from './constants';
import './Node.css';
import InnerNetwork from './InnerNetwork.jsx'; // Import InnerNetwork
import { getNodeDimensions } from './utils.js'; // Import needed for node dims
import { v4 as uuidv4 } from 'uuid';

const PREVIEW_SCALE_FACTOR = 0.3; // How much to shrink the network layout

// Accept dimensions and other props
// Expect plain node data object
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
  allNodes, // Expect plain array of node data
  connections, // Expect plain array of edge data
  innerNetworkWidth,
  innerNetworkHeight,
  idPrefix = '', // Add optional idPrefix prop with default
  // --- Add editing props ---
  isEditingOnCanvas,
  onCommitCanvasEdit,
  onCancelCanvasEdit
}) => {
  // Access properties directly from the node data object
  const nodeId = node.id ?? uuidv4(); // Use ID or generate fallback (should have ID from store)
  const nodeX = node.x ?? 0; // Use provided x or default to 0
  const nodeY = node.y ?? 0; // Use provided y or default to 0
  const nodeScale = node.scale ?? 1; // Use provided scale or default to 1
  const nodeName = node.name ?? 'Untitled'; // Use provided name or default
  // Access thumbnailSrc directly if it exists
  const nodeThumbnailSrc = node.thumbnailSrc ?? null;

  // --- Inline Editing State ---
  const [tempName, setTempName] = useState(nodeName);
  const inputRef = useRef(null);

  // Update tempName when node name changes (from panel or other sources)
  useEffect(() => {
    setTempName(nodeName);
  }, [nodeName]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingOnCanvas && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingOnCanvas]);

  // Handle editing commit
  const handleCommitEdit = () => {
    const newName = tempName.trim();
    if (newName && newName !== nodeName) {
      onCommitCanvasEdit?.(nodeId, newName);
    } else {
      onCancelCanvasEdit?.();
    }
  };

  // Handle editing cancel
  const handleCancelEdit = () => {
    setTempName(nodeName); // Reset to original name
    onCancelCanvasEdit?.();
  };

  // Handle key events for editing
  const handleKeyDown = (e) => {
    e.stopPropagation(); // Prevent canvas keyboard shortcuts
    if (e.key === 'Enter') {
      handleCommitEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Handle real-time input changes for dynamic resizing
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setTempName(newValue);
    // Trigger real-time update to the store for dynamic resizing
    if (onCommitCanvasEdit && newValue.trim()) {
      onCommitCanvasEdit(nodeId, newValue, true); // Add 'true' flag for real-time update
    }
  };

  const hasThumbnail = Boolean(nodeThumbnailSrc);

  // Unique ID for the clip path - incorporate prefix
  const clipPathId = `${idPrefix}node-clip-${nodeId}`;
  const innerClipPathId = `${idPrefix}node-inner-clip-${nodeId}`;

  // Calculate image position based on dynamic textAreaHeight
  const contentAreaY = nodeY + textAreaHeight;

  // Define the canvas background color (or import from constants if preferred)
  const canvasBackgroundColor = '#bdb5b5';

  return (
    <g
      className={`node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isPreviewing ? 'previewing' : ''}`}
      onMouseDown={onMouseDown}
      role="graphics-symbol"
      aria-label={nodeName}
      style={{
          // Apply only scaling transform, position is handled by element attributes
          transform: isDragging ? `scale(${nodeScale})` : 'scale(1)',
          transformOrigin: `${nodeX + currentWidth / 2}px ${nodeY + currentHeight / 2}px`, // Use absolute coords for origin
          cursor: 'pointer',
      }}
    >
      <defs>
        {/* FIX: Revert clipPath definition to use absolute coordinates */}
        <clipPath id={clipPathId}>
          <rect
            x={nodeX + NODE_PADDING - 1} // Use absolute coords
            y={contentAreaY - 1}
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
            pointerEvents: isEditingOnCanvas ? 'auto' : 'none',
            userSelect: 'none',
            wordWrap: 'break-word',
            minWidth: 0
          }}
        >
          {isEditingOnCanvas ? (
            <input
              ref={inputRef}
              type="text"
              className="node-name-input"
              value={tempName}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={handleCommitEdit}
            />
          ) : (
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
          )}
        </div>
      </foreignObject>

      {/* Image Container (renders if thumbnail exists) */}
      {/* FIX: Remove the wrapping group and apply clipPath directly to image */}
      {/* <g 
        transform={`translate(${nodeX + NODE_PADDING -1}, ${contentAreaY - 1})`} 
        clipPath={`url(#${clipPathId})`}
      > */} 
        {hasThumbnail && (
          <image
            className="node-image"
            // FIX: Use absolute positioning
            x={nodeX + NODE_PADDING} 
            y={contentAreaY}
            // FIX: Use calculated image dimensions
            width={imageWidth}
            height={imageHeight}
            href={nodeThumbnailSrc}
            // FIX: Change preserveAspectRatio to 'slice' to make image cover the area
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipPathId})`}
            style={{ opacity: 1, transform: 'translateZ(0)' }}
          />
        )}
      {/* </g> */} 

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
                          nodes={allNodes} // Pass plain node data
                          // Pass connections as edges (plain edge data)
                          edges={connections} 
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
