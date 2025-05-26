import React, { useMemo, useState, useEffect, useRef } from 'react';
// Import base constants used
import { NODE_WIDTH, NODE_HEIGHT, NODE_CORNER_RADIUS, NODE_PADDING } from './constants';
import './Node.css';
import InnerNetwork from './InnerNetwork.jsx'; // Import InnerNetwork
import { getNodeDimensions } from './utils.js'; // Import needed for node dims
import { v4 as uuidv4 } from 'uuid';
import { ChevronLeft, ChevronRight } from 'lucide-react'; // Import navigation icons
import useGraphStore, { getNodesForGraph, getEdgesForGraph } from './store/graphStore.js'; // Import store selectors

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
  onCancelCanvasEdit,
  // --- Add store actions for creating definitions ---
  onCreateDefinition,
  // --- Add store access for fetching definition graph data ---
  storeActions
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

  // Calculate text width for arrow positioning (only when previewing)
  const textWidth = useMemo(() => {
    if (!isPreviewing) return 0;
    
    // Create a temporary canvas to measure text width
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = 'bold 20px sans-serif'; // Match the font from the node name styling
    const width = context.measureText(nodeName).width;
    canvas.remove(); // Clean up
    return width;
  }, [isPreviewing, nodeName]);

  // State to control arrow fade-in animation
  const [showArrows, setShowArrows] = useState(false);

  // State to track which definition graph is currently being shown (index in definitionGraphIds array)
  const [currentDefinitionIndex, setCurrentDefinitionIndex] = useState(0);

  // Get the node's definition graph IDs
  const definitionGraphIds = node.definitionGraphIds || [];
  const hasMultipleDefinitions = definitionGraphIds.length > 1;
  const hasAnyDefinitions = definitionGraphIds.length > 0;

  // Get the currently displayed graph ID
  const currentGraphId = definitionGraphIds[currentDefinitionIndex] || definitionGraphIds[0];

  // Filter nodes and edges for the current graph definition
  const currentGraphNodes = useMemo(() => {
    if (!currentGraphId) return [];
    // Get the actual nodes from the definition graph using the store selector
    const state = useGraphStore.getState();
    return getNodesForGraph(currentGraphId)(state);
  }, [currentGraphId]);

  const currentGraphEdges = useMemo(() => {
    if (!currentGraphId) return [];
    // Get the actual edges from the definition graph using the store selector
    const state = useGraphStore.getState();
    return getEdgesForGraph(currentGraphId)(state);
  }, [currentGraphId]);

  // Effect to handle arrow fade-in after expansion
  useEffect(() => {
    if (isPreviewing) {
      // Reset to first definition when expanding
      setCurrentDefinitionIndex(0);
      // Small delay to let the expansion animation start, then fade in arrows
      const timer = setTimeout(() => {
        setShowArrows(true);
      }, 200); // 200ms delay after expansion starts
      return () => clearTimeout(timer);
    } else {
      // Immediately hide arrows when not previewing
      setShowArrows(false);
    }
  }, [isPreviewing]);

  // Navigation functions
  const navigateToPreviousDefinition = () => {
    if (!hasMultipleDefinitions) return;
    setCurrentDefinitionIndex(prev => 
      prev === 0 ? definitionGraphIds.length - 1 : prev - 1
    );
  };

  const navigateToNextDefinition = () => {
    if (!hasMultipleDefinitions) return;
    setCurrentDefinitionIndex(prev => 
      prev === definitionGraphIds.length - 1 ? 0 : prev + 1
    );
  };

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
                  
                  {hasAnyDefinitions ? (
                      // Show existing graph definition
                      <>
                          <g transform={`translate(${nodeX + NODE_PADDING}, ${contentAreaY})`}>
                              <InnerNetwork
                                  nodes={currentGraphNodes} // Pass filtered node data for current definition
                                  edges={currentGraphEdges} // Pass filtered edge data for current definition
                                  width={innerNetworkWidth}
                                  height={innerNetworkHeight}
                                  padding={5}
                              />
                          </g>
                          
                          {/* Definition indicator - show current definition index if multiple exist */}
                          {hasMultipleDefinitions && (
                              <text
                                  x={nodeX + currentWidth - 20} // Position in bottom-right corner
                                  y={contentAreaY + innerNetworkHeight - 10}
                                  fontSize="12"
                                  fill="#bdb5b5"
                                  textAnchor="end"
                                  style={{ opacity: 0.7 }}
                              >
                                  {currentDefinitionIndex + 1}/{definitionGraphIds.length}
                              </text>
                          )}
                      </>
                  ) : (
                      // Show "Create Definition" interface when no definitions exist
                      <foreignObject
                          x={nodeX + NODE_PADDING}
                          y={contentAreaY}
                          width={innerNetworkWidth}
                          height={innerNetworkHeight}
                          style={{ 
                              pointerEvents: 'auto',
                              cursor: 'pointer'
                          }}
                      >
                          <div
                              style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: canvasBackgroundColor,
                                  color: '#666',
                                  fontSize: '16px',
                                  fontWeight: 'bold',
                                  textAlign: 'center',
                                  padding: '20px',
                                  boxSizing: 'border-box',
                                  transition: 'all 0.2s ease',
                              }}
                              onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#a8a0a0';
                                  e.currentTarget.style.color = '#333';
                              }}
                              onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = canvasBackgroundColor;
                                  e.currentTarget.style.color = '#666';
                              }}
                              onClick={(e) => {
                                  e.stopPropagation();
                                  if (onCreateDefinition) {
                                      onCreateDefinition(nodeId);
                                  }
                                  console.log(`Creating new definition for node: ${nodeName}`);
                              }}
                          >
                              <div style={{ fontSize: '48px', marginBottom: '10px' }}>+</div>
                              <div>Define {nodeName}</div>
                              <div>With a New Web</div>
                          </div>
                      </foreignObject>
                  )}
              </g>
          </g>
      )}

            {/* Navigation Arrows - Only show when there are multiple definitions */}
      {isPreviewing && textWidth > 0 && hasMultipleDefinitions && (
          <g style={{ 
            opacity: showArrows ? 1 : 0,
            transition: 'opacity 0.2s ease-in'
          }}>
              {/* Left Arrow - Navigate to previous definition */}
              <foreignObject
                x={nodeX + (currentWidth / 2) - (textWidth / 2) - 50} // Position just left of text start
                y={nodeY + (textAreaHeight / 2) - 20} // Center vertically with title area
                width={40}
                height={40}
                style={{ 
                  pointerEvents: showArrows ? 'auto' : 'none',
                  cursor: 'pointer'
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.5,
                    transition: 'opacity 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToPreviousDefinition();
                    console.log(`Navigated to previous definition: ${currentDefinitionIndex - 1 >= 0 ? currentDefinitionIndex - 1 : definitionGraphIds.length - 1} of ${definitionGraphIds.length}`);
                  }}
                >
                  <ChevronLeft size={32} color="#bdb5b5" />
                </div>
              </foreignObject>

              {/* Right Arrow - Navigate to next definition */}
              <foreignObject
                x={nodeX + (currentWidth / 2) + (textWidth / 2) + 10} // Position just right of text end
                y={nodeY + (textAreaHeight / 2) - 20} // Center vertically with title area
                width={40}
                height={40}
                style={{ 
                  pointerEvents: showArrows ? 'auto' : 'none',
                  cursor: 'pointer'
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.5,
                    transition: 'opacity 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToNextDefinition();
                    console.log(`Navigated to next definition: ${currentDefinitionIndex + 1 < definitionGraphIds.length ? currentDefinitionIndex + 1 : 0} of ${definitionGraphIds.length}`);
                  }}
                >
                  <ChevronRight size={32} color="#bdb5b5" />
                </div>
              </foreignObject>
          </g>
      )}
      {/* --- End Preview --- */}

    </g>
  );
};

export default Node;
