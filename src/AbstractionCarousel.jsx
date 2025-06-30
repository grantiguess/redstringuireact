import React, { useState, useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import { Plus } from 'lucide-react';
import { NODE_WIDTH, NODE_HEIGHT, NODE_CORNER_RADIUS, NODE_DEFAULT_COLOR } from './constants';
import { getNodeDimensions } from './utils';
import './AbstractionCarousel.css';

const LEVEL_SPACING = 80; // Vertical spacing between abstraction levels
const PHYSICS_DAMPING = 0.88; // Balanced damping for smooth feel
const SCROLL_SENSITIVITY = 0.003; // Much less sensitive for precise control
const SNAP_THRESHOLD = 0.3; // Balanced threshold for natural snapping
const SNAP_SPRING = 0.15; // Stronger spring for faster snapping
const MIN_VELOCITY = 0.01; // Balanced minimum velocity
const MAX_VELOCITY = 1; // Lower max velocity for better control

// Physics state reducer
const physicsReducer = (state, action) => {
  switch (action.type) {
    case 'UPDATE_PHYSICS': {
      const { frameMultiplier } = action.payload;
      const dampedVelocity = state.velocity * Math.pow(PHYSICS_DAMPING, frameMultiplier);
      
      let nextVelocity = dampedVelocity;
      let nextPosition = state.realPosition;
      let nextIsSnapping = state.isSnapping;
      let nextTargetPosition = state.targetPosition;
      
      if (state.isSnapping) {
        // Move toward target position
        const diff = state.targetPosition - state.realPosition;
        
        if (Math.abs(diff) < 0.01) {
          nextIsSnapping = false;
          nextPosition = state.targetPosition; // Snap exactly to target
        } else {
          nextPosition = state.realPosition + diff * SNAP_SPRING * frameMultiplier;
        }
      } else {
        // Normal velocity-based movement
        nextPosition = state.realPosition + dampedVelocity * frameMultiplier;
        nextPosition = Math.max(-3, Math.min(3, nextPosition));
        
        // Check if we should start snapping
        if (Math.abs(dampedVelocity) < MIN_VELOCITY && !state.isSnapping && state.hasUserScrolled) {
          nextIsSnapping = true;
          nextVelocity = 0;
          
          // Calculate target based on the new position and velocity direction
          const velocityDirection = state.velocity > 0 ? 1 : (state.velocity < 0 ? -1 : 0);
          
          // Get nearest integer positions
          const floor = Math.floor(nextPosition);
          const ceil = Math.ceil(nextPosition);
          
          let newTarget;
          
          if (floor === ceil) {
            // Already at integer
            newTarget = floor;
          } else {
            const distToFloor = nextPosition - floor;
            const distToCeil = ceil - nextPosition;
            
            // Use velocity direction to break ties
            if (Math.abs(distToFloor - distToCeil) < 0.3) {
              newTarget = velocityDirection > 0 ? ceil : (velocityDirection < 0 ? floor : Math.round(nextPosition));
            } else {
              newTarget = Math.round(nextPosition);
            }
          }
          
          nextTargetPosition = Math.max(-3, Math.min(3, newTarget));
        }
      }
      
      return {
        ...state,
        velocity: nextVelocity,
        realPosition: nextPosition,
        isSnapping: nextIsSnapping,
        targetPosition: nextTargetPosition
      };
    }
    case 'SET_VELOCITY':
      return { ...state, velocity: action.payload };
    case 'SET_USER_SCROLLED':
      return { ...state, hasUserScrolled: action.payload };
    case 'INTERRUPT_SNAPPING':
      return { ...state, isSnapping: false };
    case 'JUMP_TO_LEVEL':
      return { 
        ...state, 
        // Don't immediately change realPosition - let it animate smoothly
        targetPosition: action.payload, 
        isSnapping: true, // Enable snapping animation to target
        velocity: 0, // Clear any existing velocity for clean animation
        hasUserScrolled: true
      };
    case 'RESET':
      return {
        realPosition: 0,
        targetPosition: 0,
        velocity: 0,
        isSnapping: false,
        hasUserScrolled: false
      };
    default:
      return state;
  }
};

const AbstractionCarousel = ({
  isVisible,
  selectedNode,
  panOffset,
  zoomLevel,
  containerRef,
  debugMode,
  animationState = 'visible', // 'hidden', 'entering', 'visible', 'exiting'
  onAnimationStateChange,
  onExitAnimationComplete,
  onClose,
  onReplaceNode,
  onScaleChange, // New callback to report the focused node's current scale
  onFocusedNodeDimensions // New callback to report the focused node's dimensions
}) => {
  const carouselRef = useRef(null);
  
  // Physics state using reducer
  const [physicsState, dispatchPhysics] = useReducer(physicsReducer, {
    realPosition: 0,
    targetPosition: 0,
    velocity: 0,
    isSnapping: false,
    hasUserScrolled: false
  });
  
  // Animation refs
  const animationFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const physicsStateRef = useRef(physicsState);
  const updatePhysicsRef = useRef(null);

  // Update physics state ref whenever state changes
  useEffect(() => {
    physicsStateRef.current = physicsState;
  }, [physicsState]);

  // Handle animation state transitions
  useEffect(() => {
    if (animationState === 'entering') {
      // Start entrance animation, then transition to visible
      const timer = setTimeout(() => {
        onAnimationStateChange?.('visible');
      }, 200); // Faster animation duration
      return () => clearTimeout(timer);
    } else if (animationState === 'exiting') {
      // Start exit animation, then call completion callback
      const timer = setTimeout(() => {
        onExitAnimationComplete?.();
      }, 200); // Faster animation duration
      return () => clearTimeout(timer);
    }
  }, [animationState, onAnimationStateChange, onExitAnimationComplete]);

  // Pre-calculate the abstraction chain and base dimensions for each node
  const abstractionChainWithDims = useMemo(() => {
    if (!selectedNode) return [];
    
    const chain = [
      // Placeholder nodes for adding more
      { id: 'add_generic', name: 'Add More Generic Thing', type: 'add_generic', level: -3, color: '#999' },
      
      // More generic levels (negative indices)
      { id: `${selectedNode.id}_generic_2`, name: 'Entity', type: 'generic', level: -2, color: '#4A90E2' },
      { id: `${selectedNode.id}_generic_1`, name: 'Physical Object', type: 'generic', level: -1, color: '#5BA0F2' },
      
      // Current node (level 0)
      { ...selectedNode, type: 'current', level: 0 },
      
      // More specific levels (positive indices)
      { id: `${selectedNode.id}_specific_1`, name: `Specific ${selectedNode.name}`, type: 'specific', level: 1, color: '#E24A4A' },
      { id: `${selectedNode.id}_specific_2`, name: `Very Specific ${selectedNode.name}`, type: 'specific', level: 2, color: '#F25A5A' },
      
      // Placeholder nodes for adding more
      { id: 'add_specific', name: 'Add More Specific Thing', type: 'add_specific', level: 3, color: '#999' }
    ];

    // Pre-calculate base dimensions for each node to use for smooth interpolation later
    return chain.map(item => {
      const nodeForDimensions = item.type === 'current' ? selectedNode : item;
      const baseDimensions = getNodeDimensions(nodeForDimensions, false, null);
      return { ...item, baseDimensions };
    });
  }, [selectedNode]);

  // Calculate the center position where the carousel should be anchored
  const getCarouselPosition = useCallback(() => {
    if (!selectedNode || !containerRef.current) return { x: 0, y: 0 };

    const containerRect = containerRef.current.getBoundingClientRect();
    const nodeDimensions = getNodeDimensions(selectedNode, false, null);
    
    // Get the center of the original node's screen coordinates, relative to the canvas container
    const nodeScreenX = Math.round(selectedNode.x * zoomLevel + panOffset.x);
    const nodeScreenY = Math.round(selectedNode.y * zoomLevel + panOffset.y);
    const nodeCenterX = nodeScreenX + Math.round((nodeDimensions.currentWidth * zoomLevel) / 2);
    const nodeCenterY = nodeScreenY + Math.round((nodeDimensions.currentHeight * zoomLevel) / 2);
    
    // Adjust for the container's position relative to the viewport
    return { 
      x: nodeCenterX + containerRect.left, 
      y: nodeCenterY + containerRect.top 
    };
  }, [selectedNode, panOffset, zoomLevel, containerRef]);

  // Calculate the stack offset using real position
  const getStackOffset = useCallback(() => {
    const offset = -physicsState.realPosition * LEVEL_SPACING * zoomLevel;
    return offset;
  }, [physicsState.realPosition, zoomLevel]);

  // Physics update loop using reducer
  const updatePhysics = useCallback((currentTime) => {
    if (!isVisible) {
      animationFrameRef.current = null;
      return;
    }
    
    const deltaTime = Math.min(currentTime - lastFrameTimeRef.current, 32);
    lastFrameTimeRef.current = currentTime;

    // Skip first frame to avoid large deltaTime
    if (deltaTime > 100) {
      animationFrameRef.current = requestAnimationFrame(updatePhysicsRef.current);
      return;
    }

    const deltaTimeSeconds = deltaTime / 1000;
    const frameMultiplier = deltaTimeSeconds * 60;

    // Update physics using reducer
    dispatchPhysics({ type: 'UPDATE_PHYSICS', payload: { frameMultiplier } });

    // After physics update, get the latest position from the state ref
    // This avoids adding physicsState as a dependency to this callback
    const position = physicsStateRef.current.realPosition;

    // Calculate and report scale factor for the focused node
    if (onScaleChange) {
      const distanceFromFocus = Math.abs(0 - position);
      let scale = 1.0;
      if (distanceFromFocus === 0) {
        scale = 1.0;
      } else if (distanceFromFocus < 1) {
        scale = 1.0 - (distanceFromFocus * 0.3);
      } else {
        scale = 0.7 - ((distanceFromFocus - 1) * 0.15);
        scale = Math.max(0.4, scale);
      }
      onScaleChange(scale);
    }
    
    // Calculate and report the focused node's actual current dimensions
    if (onFocusedNodeDimensions && abstractionChainWithDims.length > 0) {
      const floorLevel = Math.floor(position);
      const ceilLevel = Math.ceil(position);
      const nodeA = abstractionChainWithDims.find(item => item.level === floorLevel);
      const nodeB = abstractionChainWithDims.find(item => item.level === ceilLevel);
      const dimA = nodeA?.baseDimensions;
      const dimB = nodeB?.baseDimensions || dimA;

      if (dimA && dimB) {
        const factor = position - floorLevel;
        const lerp = (a, b, t) => a + (b - a) * t;
        const interpolatedWidth = lerp(dimA.currentWidth, dimB.currentWidth, factor);
        const interpolatedHeight = lerp(dimA.currentHeight, dimB.currentHeight, factor);
        const interpolatedTextAreaHeight = lerp(dimA.textAreaHeight, dimB.textAreaHeight, factor);
        const actualCurrentDimensions = {
          currentWidth: interpolatedWidth,
          currentHeight: interpolatedHeight,
          textAreaHeight: interpolatedTextAreaHeight
        };
        onFocusedNodeDimensions(actualCurrentDimensions);
      }
    }

    // Check current state to decide whether to continue the animation loop
    const currentState = physicsStateRef.current;
    if (Math.abs(currentState.velocity) > MIN_VELOCITY || currentState.isSnapping) {
      animationFrameRef.current = requestAnimationFrame(updatePhysicsRef.current);
    } else {
      animationFrameRef.current = null;
    }
  }, [isVisible, abstractionChainWithDims, onScaleChange, onFocusedNodeDimensions]);

  // Update updatePhysics ref
  useEffect(() => {
    updatePhysicsRef.current = updatePhysics;
  }, [updatePhysics]);

  // Start physics loop when component becomes visible
  useEffect(() => {
    if (isVisible && !animationFrameRef.current) {
      // Reset all state when carousel opens
      dispatchPhysics({ type: 'RESET' });
      lastFrameTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updatePhysicsRef.current);
    } else if (!isVisible && animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      // Reset all state when closing
      dispatchPhysics({ type: 'RESET' });
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isVisible]); // Removed updatePhysics dependency

  // Handle wheel events for continuous scrolling
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isVisible) return;
    
    // Mark that user has started scrolling
    dispatchPhysics({ type: 'SET_USER_SCROLLED', payload: true });
    
    // Allow new input to interrupt snapping
    dispatchPhysics({ type: 'INTERRUPT_SNAPPING' });
    
    // Add to velocity based on scroll direction and sensitivity
    const deltaY = e.deltaY;
    const velocityChange = deltaY * SCROLL_SENSITIVITY;
    
    // Calculate new velocity using current state from ref
    const newVelocity = physicsStateRef.current.velocity + velocityChange;
    const clampedVelocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, newVelocity));
    dispatchPhysics({ type: 'SET_VELOCITY', payload: clampedVelocity });
    
    // Always start physics loop on wheel input
    if (!animationFrameRef.current) {
      lastFrameTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updatePhysicsRef.current);
    }
  }, [isVisible]); // Remove updatePhysics dependency to avoid frequent recreations

  // Set up global, non-passive wheel event listener when carousel is visible
  useEffect(() => {
    if (isVisible) {
      document.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        document.removeEventListener('wheel', handleWheel, { passive: false });
      };
    }
  }, [isVisible]); // Removed handleWheel from dependencies to prevent infinite loop

  // Handle clicks on abstraction nodes
  const handleNodeClick = useCallback((item) => {
    if (!isVisible) return;
    
    // Jump to clicked level and set it as target
    dispatchPhysics({ type: 'JUMP_TO_LEVEL', payload: item.level });
    
    // Start physics loop for smooth animation to target
    if (!animationFrameRef.current) {
      lastFrameTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updatePhysicsRef.current);
    }
    
    // Handle click actions
    if (item.type === 'add_generic' || item.type === 'add_specific') {
      console.log(`Add new ${item.type.replace('add_', '')} abstraction`);
    } else if (item.type !== 'current') {
      console.log(`Replace current node with: ${item.name}`);
    }
  }, [isVisible]);

  // Handle escape key and click-away to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickAway = (e) => {
      if (carouselRef.current && !carouselRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      // We listen on the document and check if the click was outside the visuals
      document.addEventListener('mousedown', handleClickAway);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mousedown', handleClickAway);
      };
    }
  }, [isVisible, onClose]);

  if (!isVisible || !selectedNode) return null;

  const carouselPosition = getCarouselPosition();
  const stackOffset = getStackOffset();

  return (
    <div
      ref={carouselRef}
      style={{
        position: 'fixed',
        left: carouselPosition.x,
        top: carouselPosition.y,
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        pointerEvents: 'auto',
        cursor: 'grab'
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* SVG Container for the abstraction nodes */}
      <svg
        style={{
          position: 'absolute',
          left: '-50vw',
          top: '-200vh',
          width: '100vw',
          height: '400vh',
          pointerEvents: 'none',
          transform: `translateY(${stackOffset}px)`,
          transition: physicsState.isSnapping ? 'none' : 'none' // No CSS transitions, using JS animation
        }}
      >
        <defs>
          {/* Define clip paths for each node */}
          {abstractionChainWithDims.map((item) => {
            const nodeDimensions = item.baseDimensions; // Use pre-calculated dimensions
            const distanceFromMain = Math.abs(item.level - physicsState.realPosition);
            
            // Moderate progressive scaling - noticeable but not extreme
            let scale = 1.0;
            if (distanceFromMain === 0) {
              // Exactly at focus - keep at maximum size (1.2 as requested)
              scale = 1.2;
            } else if (distanceFromMain < 1) {
              // Close to focus - moderate drop from 1.2 to 0.8
              scale = 1.2 - (distanceFromMain * 0.4); // 1.2 to 0.8 - more moderate
            } else {
              // Further from focus - shrink gradually
              scale = 0.8 - ((distanceFromMain - 1) * 0.15); // Start at 0.8, drop more gradually
              scale = Math.max(0.5, scale); // Minimum scale of 0.5 for readability
            }
            
            const scaledWidth = nodeDimensions.currentWidth * zoomLevel * scale;
            const scaledHeight = nodeDimensions.currentHeight * zoomLevel * scale;
            const cornerRadius = NODE_CORNER_RADIUS * zoomLevel * scale;
            
            return (
              <clipPath key={`clip-${item.id}`} id={`abstraction-clip-${item.id}`}>
                <rect
                  width={scaledWidth}
                  height={scaledHeight}
                  rx={cornerRadius}
                  ry={cornerRadius}
                />
              </clipPath>
            );
          })}
        </defs>

        {/* Render all abstraction levels in a vertical stack */}
        {abstractionChainWithDims.map((item, index) => {
          const nodeDimensions = item.baseDimensions; // Use pre-calculated dimensions
          const isPlaceholder = item.type === 'add_generic' || item.type === 'add_specific';
          const isCurrent = item.type === 'current';
          const distanceFromMain = Math.abs(item.level - physicsState.realPosition);
          
          // Fog of war: hide nodes beyond a certain distance
          if (distanceFromMain > 4.5) {
            return null;
          }

          // Calculate entrance/exit animation properties
          let animationOpacity = 1;
          let animationScale = 1;
          let animationDelay = 0;
          let useAnimationOpacity = false;
          
          if (animationState === 'entering' && !isCurrent) {
            // Entrance animation: start from center, staggered by distance
            animationDelay = distanceFromMain * 40; // 40ms per level (faster)
            animationOpacity = 0;
            animationScale = 0.3;
            useAnimationOpacity = true; // Override opacity for entrance
          } else if (animationState === 'exiting' && !isCurrent) {
            // Exit animation: shrink to center, reverse stagger
            animationDelay = (4 - distanceFromMain) * 30; // 30ms reverse stagger (faster)
            animationScale = 0.3;
            useAnimationOpacity = false; // Don't override opacity - let CSS animate from current opacity
          }
          
          // Progressive scaling - center node matches real node size exactly
          let scale = 1.0;
          if (distanceFromMain === 0) {
            // Exactly at focus - same size as real node
            scale = 1.0;
          } else if (distanceFromMain < 1) {
            // Close to focus - moderate drop from 1.0 to 0.7
            scale = 1.0 - (distanceFromMain * 0.3);
          } else {
            // Further from focus - shrink gradually
            scale = 0.7 - ((distanceFromMain - 1) * 0.15);
            scale = Math.max(0.4, scale); // Minimum scale of 0.4 for readability
          }
          
          // Calculate smooth dimensions (no rounding for animation)
          const scaledWidth = nodeDimensions.currentWidth * zoomLevel * scale;
          const scaledHeight = nodeDimensions.currentHeight * zoomLevel * scale;
          const scaledTextAreaHeight = nodeDimensions.textAreaHeight * zoomLevel * scale;
          
          // Calculate opacity: smooth falloff based on distance, combined with animation
          let opacity = 1;
          if (distanceFromMain <= 1) {
            opacity = 1.0 - (distanceFromMain * 0.1); // Gentler falloff within 1 level
          } else if (distanceFromMain <= 2) {
            opacity = 0.9 - ((distanceFromMain - 1) * 0.4); // Steeper falloff beyond 1 level
          } else {
            opacity = 0.5 - ((distanceFromMain - 2) * 0.8); // Fade to invisible beyond 2 levels
          }
          
          // Apply animation opacity only when we want to override (entrance animation)
          if (useAnimationOpacity) {
            opacity = isCurrent ? opacity : animationOpacity;
          }
          // For exit animations, keep the natural calculated opacity so CSS can animate from it
          
          // Position calculation - relative to carousel center (which is at 50vw, 50vh in the SVG)
          const nodeX = window.innerWidth * 0.5;
          const nodeY = window.innerHeight * 2 + (item.level * LEVEL_SPACING * zoomLevel);
          
          // Determine if this is the "main" node (closest to scroll position)
          const isMainNode = distanceFromMain < 0.5;
          
          // Enhanced border styling - scaled proportionally (smooth values)
          const borderWidth = (isMainNode ? 6 : 2) * zoomLevel * scale;
          const borderColor = isPlaceholder ? '#999' : (isMainNode ? 'black' : '#666');
          const nodeColor = isPlaceholder ? '#bdb5b5' : (item.color || NODE_DEFAULT_COLOR);
          
          // Corner radius - smooth scaling
          const cornerRadius = NODE_CORNER_RADIUS * zoomLevel * scale;

          // Calculate animation transform
          const animationTransform = !isCurrent && (animationState === 'entering' || animationState === 'exiting') 
            ? `scale(${animationScale})` 
            : 'scale(1)';
          
          // Calculate CSS animation properties
          const animationStyles = !isCurrent && (animationState === 'entering' || animationState === 'exiting') ? {
            animation: animationState === 'entering' 
              ? `carousel-node-enter 0.2s ease-out ${animationDelay}ms both`
              : `carousel-node-exit 0.2s ease-in ${animationDelay}ms both`,
            // For exit animations, pass the current opacity as a CSS variable
            ...(animationState === 'exiting' ? { '--start-opacity': opacity } : {})
          } : {};

          return (
            <g
              key={item.id}
              style={{
                opacity: opacity,
                cursor: 'pointer',
                pointerEvents: 'auto',
                zIndex: isMainNode ? 100 : 1, // Higher z-index for focused node
                transform: animationTransform,
                transformOrigin: `${nodeX}px ${nodeY}px`, // Transform from the node center
                ...animationStyles
              }}
              onClick={() => handleNodeClick(item)}
            >
              {/* Background rect with smooth positioning */}
              <rect
                x={nodeX - scaledWidth / 2 + 6 * zoomLevel * scale}
                y={nodeY - scaledHeight / 2 + 6 * zoomLevel * scale}
                width={scaledWidth - 12 * zoomLevel * scale}
                height={scaledHeight - 12 * zoomLevel * scale}
                rx={cornerRadius - 6 * zoomLevel * scale}
                ry={cornerRadius - 6 * zoomLevel * scale}
                fill={nodeColor}
                stroke={borderColor}
                strokeWidth={borderWidth}
                style={{
                  filter: isMainNode 
                    ? 'drop-shadow(0px 0px 20px rgba(0, 0, 0, 0.5))' // Stronger shadow for main node
                    : 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.2))'
                }}
              />

              {/* ForeignObject for name text */}
              <foreignObject
                x={nodeX - scaledWidth / 2}
                y={nodeY - scaledHeight / 2}
                width={scaledWidth}
                height={scaledTextAreaHeight}
                style={{
                  overflow: 'hidden',
                  pointerEvents: 'none'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    padding: isPlaceholder ? '0' : `0 ${8 * scale}px`,
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    minWidth: 0
                  }}
                >
                  {isPlaceholder ? (
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center',
                      color: '#260000',
                      fontSize: `${12 * zoomLevel * scale}px`,
                      fontWeight: 'bold',
                      textAlign: 'center',
                      lineHeight: '1.2'
                    }}>
                      <Plus size={20 * zoomLevel * scale} style={{ marginBottom: '2px' }} />
                      <span style={{ 
                        maxWidth: '90%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word'
                      }}>
                        {item.name}
                      </span>
                    </div>
                  ) : (
                    <span
                      style={{
                        fontSize: `${(isMainNode ? 22 : 20) * zoomLevel * scale}px`,
                        fontWeight: isMainNode ? 'bolder' : 'bold', // Extra bold for main node
                        color: '#bdb5b5',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0,
                        display: 'inline-block',
                        width: '100%'
                      }}
                    >
                      {item.name}
                    </span>
                  )}
                </div>
              </foreignObject>

              {/* Level indicator (only for non-placeholder nodes) */}
              {!isPlaceholder && debugMode && (
                <g>
                  <circle
                    cx={nodeX + scaledWidth / 2 - 8 * scale}
                    cy={nodeY - scaledHeight / 2 + 8 * scale}
                    r={Math.max(8, 12 * scale)}
                    fill={isMainNode ? 'black' : '#666'}
                    stroke="none"
                  />
                  <text
                    x={nodeX + scaledWidth / 2 - 8 * scale}
                    y={nodeY - scaledHeight / 2 + 8 * scale}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={12 * zoomLevel * scale}
                    fill="#bdb5b5"
                    fontWeight="bold"
                    style={{
                      userSelect: 'none',
                      pointerEvents: 'none'
                    }}
                  >
                    {item.level}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Navigation hints - now shows continuous position */}
      {debugMode && (
        <div style={{
          position: 'absolute',
          right: '-80px',
          top: `${stackOffset}px`,
          color: '#666',
          fontSize: `${12 * zoomLevel}px`,
          pointerEvents: 'none',
          userSelect: 'none',
          textAlign: 'left'
        }}>
          <div style={{ marginBottom: '8px' }}>↑ Generic</div>
          <div style={{ 
            color: '#333', 
            fontWeight: 'bold',
            fontSize: `${14 * zoomLevel}px`,
            marginBottom: '8px'
          }}>
            Level {physicsState.realPosition.toFixed(1)}
          </div>
          <div>↓ Specific</div>
          
          {/* Physics debug info */}
          <div style={{ 
            fontSize: `${10 * zoomLevel}px`,
            color: '#999',
            marginTop: '10px'
          }}>
            <div>real: {physicsState.realPosition.toFixed(2)}</div>
            <div>target: {physicsState.targetPosition}</div>
            <div>v: {physicsState.velocity.toFixed(2)}</div>
            {physicsState.isSnapping && <div>snapping</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default AbstractionCarousel; 