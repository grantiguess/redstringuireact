import React, { useMemo, useState, useEffect, useRef } from 'react';
// Import base constants used
import { NODE_WIDTH, NODE_HEIGHT, NODE_CORNER_RADIUS, NODE_PADDING } from './constants';
import './Node.css';
import InnerNetwork from './InnerNetwork.jsx'; // Import InnerNetwork
import { getNodeDimensions } from './utils.js'; // Import needed for node dims
import { v4 as uuidv4 } from 'uuid';
import { ChevronLeft, ChevronRight, Trash2, Expand } from 'lucide-react'; // Import navigation icons, trash, and expand
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
  storeActions,
  // --- Add callback for adding nodes to definition ---
  onAddNodeToDefinition,
  // --- Add callback for deleting definition graphs ---
  onDeleteDefinition,
  // --- Add callback for expanding definition graphs ---
  onExpandDefinition
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

  // No longer need text width calculation since arrows are in top-right corner

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

  // Get the store state once and use it for both selectors
  const storeState = useGraphStore();
  
  // Filter nodes and edges for the current graph definition
  const currentGraphNodes = useMemo(() => {
    if (!currentGraphId) return [];
    return getNodesForGraph(currentGraphId)(storeState);
  }, [currentGraphId, storeState.nodes, storeState.graphs]);

  const currentGraphEdges = useMemo(() => {
    if (!currentGraphId) return [];
    return getEdgesForGraph(currentGraphId)(storeState);
  }, [currentGraphId, storeState.edges, storeState.graphs]);

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
            padding: isPreviewing 
              ? `0 ${hasAnyDefinitions ? 110 : 60}px 0 ${hasAnyDefinitions ? 110 : 60}px` // Balanced padding: left accounts for 3 buttons (~117px), right accounts for arrows (~110px) - arrows take same space regardless of count
              : `0 ${NODE_PADDING}px`,
            boxSizing: 'border-box',
            pointerEvents: isEditingOnCanvas ? 'auto' : 'none',
            userSelect: 'none',
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
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
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

            {/* Plus Button and Navigation Arrows - Positioned in title area like a name tag */}
      {isPreviewing && (
          <g style={{ 
            opacity: showArrows ? 1 : 0,
            transition: 'opacity 0.2s ease-in'
          }}>
              {/* Plus Button - Left side of title area */}
              <foreignObject
                x={nodeX + 25} // Closer to title
                y={nodeY + (textAreaHeight / 2) - 16} // Center vertically with title
                width={32}
                height={32}
                style={{ 
                  pointerEvents: showArrows ? 'auto' : 'none',
                  cursor: 'pointer'
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.5,
                    transition: 'opacity 0.2s ease',
                    fontSize: '24px',
                    fontWeight: 'bold',
                    color: '#bdb5b5'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onAddNodeToDefinition) {
                      console.log(`[Plus Button] Creating alternative definition for node: ${nodeId}`);
                      onAddNodeToDefinition(nodeId);
                    }
                  }}
                  title="Create alternative definition"
                >
                  +
                </div>
              </foreignObject>

              {/* Delete Button - Only show when there are definitions to delete */}
              {hasAnyDefinitions && (
                <foreignObject
                  x={nodeX + 55} // Position closer to plus button
                  y={nodeY + (textAreaHeight / 2) - 16} // Center vertically with title
                  width={32}
                  height={32}
                  style={{ 
                    pointerEvents: showArrows ? 'auto' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: hasMultipleDefinitions ? 0.5 : 0.3, // Lower opacity when only one definition
                      transition: 'opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = hasMultipleDefinitions ? '0.5' : '0.3'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDeleteDefinition && currentGraphId) {
                        console.log(`[Delete Button] Deleting definition graph: ${currentGraphId} for node: ${nodeId}`);
                        
                        // Adjust currentDefinitionIndex before deletion
                        const newLength = definitionGraphIds.length - 1; // Length after deletion
                        if (newLength > 0) {
                          // If we're deleting the last definition, move to the previous one
                          if (currentDefinitionIndex >= newLength) {
                            setCurrentDefinitionIndex(newLength - 1);
                          }
                          // If we're deleting from the middle or beginning, keep the same index
                          // (which will now point to the next definition in the list)
                        } else {
                          // If this was the last definition, reset to 0
                          setCurrentDefinitionIndex(0);
                        }
                        
                        onDeleteDefinition(nodeId, currentGraphId);
                      }
                    }}
                    title="Delete current definition"
                  >
                    <Trash2 size={20} color="#bdb5b5" />
                  </div>
                </foreignObject>
              )}

              {/* Expand Button - Only show when there are definitions to expand */}
              {hasAnyDefinitions && (
                <foreignObject
                  x={nodeX + 85} // Position closer to delete button
                  y={nodeY + (textAreaHeight / 2) - 16} // Center vertically with title
                  width={32}
                  height={32}
                  style={{ 
                    pointerEvents: showArrows ? 'auto' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: hasMultipleDefinitions ? 0.5 : 0.3, // Lower opacity when only one definition
                      transition: 'opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = hasMultipleDefinitions ? '0.5' : '0.3'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onExpandDefinition && currentGraphId) {
                        console.log(`[Expand Button] Opening definition graph: ${currentGraphId} for node: ${nodeId}`);
                        onExpandDefinition(nodeId, currentGraphId);
                      }
                    }}
                    title="Open definition in new tab"
                  >
                    <Expand size={20} color="#bdb5b5" />
                  </div>
                </foreignObject>
              )}

              {/* Navigation Arrows - Show when there are any definitions */}
              {hasAnyDefinitions && (() => {
                // Calculate dynamic width for the number based on character count
                const numberText = `${currentDefinitionIndex + 1}`;
                const numberWidth = Math.max(20, numberText.length * 12); // Increased minimum and per-character width
                const arrowSize = 32; // Increased arrow container size
                const margin = 25; // Reduced margin from right edge to move arrows more to the right
                const spacing = 1; // Tighter spacing between elements
                
                // Calculate positions from right edge
                const rightArrowX = nodeX + currentWidth - margin - arrowSize;
                const numberX = rightArrowX - spacing - numberWidth;
                const leftArrowX = numberX - spacing - arrowSize;
                
                return (
                  <>
                    {/* Left Arrow - Navigate to previous definition */}
                    <foreignObject
                      x={leftArrowX}
                      y={nodeY + (textAreaHeight / 2) - 16} // Center vertically with title
                      width={arrowSize}
                      height={arrowSize}
                      style={{ 
                        pointerEvents: showArrows ? 'auto' : 'none',
                        cursor: hasMultipleDefinitions ? 'pointer' : 'default'
                      }}
                    >
                      <div
                        data-arrow
                        style={{
                          width: `${arrowSize}px`,
                          height: `${arrowSize}px`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: hasMultipleDefinitions ? 0.5 : 0.2,
                          transition: 'opacity 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (hasMultipleDefinitions) {
                            e.currentTarget.style.opacity = '1';
                            // Also highlight the number
                            const numberElement = e.currentTarget.parentElement.parentElement.querySelector('[data-number-indicator]');
                            if (numberElement) numberElement.style.opacity = '1';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = hasMultipleDefinitions ? '0.5' : '0.2';
                          // Reset number opacity
                          const numberElement = e.currentTarget.parentElement.parentElement.querySelector('[data-number-indicator]');
                          if (numberElement) numberElement.style.opacity = '0.7';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasMultipleDefinitions) {
                            navigateToPreviousDefinition();
                            console.log(`Navigated to previous definition: ${currentDefinitionIndex - 1 >= 0 ? currentDefinitionIndex - 1 : definitionGraphIds.length - 1} of ${definitionGraphIds.length}`);
                          }
                        }}
                        title={hasMultipleDefinitions ? "Previous definition" : "Only one definition"}
                      >
                        <ChevronLeft size={28} color="#bdb5b5" />
                      </div>
                    </foreignObject>

                    {/* Number Indicator - Show current definition index */}
                    <foreignObject
                      x={numberX}
                      y={nodeY + (textAreaHeight / 2) - 16} // Center vertically with title
                      width={numberWidth}
                      height={32}
                      style={{ 
                        pointerEvents: showArrows ? 'auto' : 'none',
                        cursor: hasMultipleDefinitions ? 'pointer' : 'default'
                      }}
                    >
                      <div
                        data-number-indicator
                        style={{
                          width: `${numberWidth}px`,
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: '#bdb5b5',
                          opacity: 0.7,
                          transition: 'opacity 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '1';
                          // Also highlight both arrows
                          const container = e.currentTarget.parentElement.parentElement;
                          const arrows = container.querySelectorAll('[data-arrow]');
                          arrows.forEach(arrow => {
                            if (hasMultipleDefinitions) arrow.style.opacity = '1';
                          });
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '0.7';
                          // Reset arrow opacity
                          const container = e.currentTarget.parentElement.parentElement;
                          const arrows = container.querySelectorAll('[data-arrow]');
                          arrows.forEach(arrow => {
                            arrow.style.opacity = hasMultipleDefinitions ? '0.5' : '0.2';
                          });
                        }}
                        title={`Definition ${currentDefinitionIndex + 1} of ${definitionGraphIds.length}`}
                      >
                        {numberText}
                      </div>
                    </foreignObject>

                    {/* Right Arrow - Navigate to next definition */}
                    <foreignObject
                      x={rightArrowX}
                      y={nodeY + (textAreaHeight / 2) - 16} // Center vertically with title
                      width={arrowSize}
                      height={arrowSize}
                      style={{ 
                        pointerEvents: showArrows ? 'auto' : 'none',
                        cursor: hasMultipleDefinitions ? 'pointer' : 'default'
                      }}
                    >
                      <div
                        data-arrow
                        style={{
                          width: `${arrowSize}px`,
                          height: `${arrowSize}px`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: hasMultipleDefinitions ? 0.5 : 0.2,
                          transition: 'opacity 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (hasMultipleDefinitions) {
                            e.currentTarget.style.opacity = '1';
                            // Also highlight the number
                            const numberElement = e.currentTarget.parentElement.parentElement.querySelector('[data-number-indicator]');
                            if (numberElement) numberElement.style.opacity = '1';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = hasMultipleDefinitions ? '0.5' : '0.2';
                          // Reset number opacity
                          const numberElement = e.currentTarget.parentElement.parentElement.querySelector('[data-number-indicator]');
                          if (numberElement) numberElement.style.opacity = '0.7';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasMultipleDefinitions) {
                            navigateToNextDefinition();
                            console.log(`Navigated to next definition: ${currentDefinitionIndex + 1 < definitionGraphIds.length ? currentDefinitionIndex + 1 : 0} of ${definitionGraphIds.length}`);
                          }
                        }}
                        title={hasMultipleDefinitions ? "Next definition" : "Only one definition"}
                      >
                        <ChevronRight size={28} color="#bdb5b5" />
                      </div>
                    </foreignObject>
                  </>
                );
              })()}
          </g>
      )}
      {/* --- End Preview --- */}

    </g>
  );
};

export default Node;
