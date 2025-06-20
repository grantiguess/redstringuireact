import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { NODE_WIDTH, NODE_HEIGHT, NODE_CORNER_RADIUS, NODE_DEFAULT_COLOR } from './constants';
import { getNodeDimensions } from './utils';
import './AbstractionCarousel.css';

const LEVEL_SPACING = 80; // Vertical spacing between abstraction levels
const PHYSICS_DAMPING = 0.92; // Friction coefficient (0.92 = 8% velocity loss per frame)
const SCROLL_SENSITIVITY = 0.04; // Increased sensitivity for more responsive scrolling
const SNAP_THRESHOLD = 0.5; // Velocity below which snapping starts
const SNAP_SPRING = 0.15; // Spring strength for snapping (higher = faster snap)
const MIN_VELOCITY = 0.01; // Minimum velocity before stopping physics
const MAX_VELOCITY = 8; // Maximum velocity to prevent excessive scrolling

const AbstractionCarousel = ({
  isVisible,
  selectedNode,
  panOffset,
  zoomLevel,
  containerRef,
  onClose,
  onReplaceNode
}) => {
  const carouselRef = useRef(null);
  
  // Physics state
  const [scrollPosition, setScrollPosition] = useState(0); // Continuous position (0 = original node)
  const [velocity, setVelocity] = useState(0); // Current scroll velocity
  const [isSnapping, setIsSnapping] = useState(false); // Whether we're snapping to a level
  
  // Animation refs
  const animationFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(0);

  // Placeholder abstraction chain data - replace with real data later
  const abstractionChain = useMemo(() => {
    if (!selectedNode) return [];
    
    return [
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
  }, [selectedNode]);

  // Calculate the center position where the carousel should be anchored
  const getCarouselPosition = useCallback(() => {
    if (!selectedNode || !containerRef.current) return { x: 0, y: 0 };

    const nodeDimensions = getNodeDimensions(selectedNode, false, null);
    
    // Get the center of the original node's screen coordinates
    const nodeScreenX = Math.round(selectedNode.x * zoomLevel + panOffset.x);
    const nodeScreenY = Math.round(selectedNode.y * zoomLevel + panOffset.y);
    const nodeCenterX = nodeScreenX + Math.round((nodeDimensions.currentWidth * zoomLevel) / 2);
    const nodeCenterY = nodeScreenY + Math.round((nodeDimensions.currentHeight * zoomLevel) / 2) + 50;
    
    return { x: nodeCenterX, y: nodeCenterY };
  }, [selectedNode, panOffset, zoomLevel]);

  // Calculate the stack offset using continuous scroll position
  const getStackOffset = useCallback(() => {
    return Math.round(-scrollPosition * LEVEL_SPACING * zoomLevel);
  }, [scrollPosition, zoomLevel]);

  // Physics update loop
  const updatePhysics = useCallback((currentTime) => {
    if (!isVisible) return;

    const deltaTime = currentTime - lastFrameTimeRef.current;
    lastFrameTimeRef.current = currentTime;

    // Skip first frame to avoid large deltaTime
    if (deltaTime > 100) {
      animationFrameRef.current = requestAnimationFrame(updatePhysics);
      return;
    }

    setVelocity(prevVelocity => {
      const currentVelocity = prevVelocity * PHYSICS_DAMPING;
      
      // Stop physics if velocity is too low
      if (Math.abs(currentVelocity) < MIN_VELOCITY && !isSnapping) {
        return 0;
      }
      
      return currentVelocity;
    });

      setScrollPosition(prevPosition => {
    const newPosition = prevPosition + velocity * 0.016; // Assume ~60fps for consistent physics
    
    // Clamp to abstraction chain bounds (-3 to +3)
    const clampedPosition = Math.max(-3, Math.min(3, newPosition));
    
    // Check if we should start snapping
    if (Math.abs(velocity) < SNAP_THRESHOLD && !isSnapping) {
      const nearestLevel = Math.round(clampedPosition);
      const distanceToNearest = nearestLevel - clampedPosition;
      
      if (Math.abs(distanceToNearest) > 0.01) {
        setIsSnapping(true);
        
        // Start snap animation
        const snapToLevel = () => {
          setScrollPosition(current => {
            const target = Math.max(-3, Math.min(3, Math.round(current))); // Clamp target too
            const diff = target - current;
            
            if (Math.abs(diff) < 0.001) {
              setIsSnapping(false);
              return target;
            }
            
            return current + diff * SNAP_SPRING;
          });
        };
        
        const snapAnimation = () => {
          snapToLevel();
          if (isSnapping) {
            requestAnimationFrame(snapAnimation);
          }
        };
        
        requestAnimationFrame(snapAnimation);
      }
    }
    
    return clampedPosition;
  });

    // Continue physics loop if there's still velocity or snapping
    if (Math.abs(velocity) > MIN_VELOCITY || isSnapping) {
      animationFrameRef.current = requestAnimationFrame(updatePhysics);
    }
  }, [isVisible, velocity, isSnapping]);

  // Start physics loop when component becomes visible
  useEffect(() => {
    if (isVisible && !animationFrameRef.current) {
      lastFrameTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updatePhysics);
    } else if (!isVisible && animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isVisible, updatePhysics]);

  // Handle wheel events for continuous scrolling
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isVisible) return;
    
    // Reset snapping if user scrolls during snap
    if (isSnapping) {
      setIsSnapping(false);
    }
    
    // Add to velocity based on scroll direction and sensitivity
    const deltaY = e.deltaY;
    const velocityChange = deltaY * SCROLL_SENSITIVITY;
    
    setVelocity(prevVelocity => {
      const newVelocity = prevVelocity + velocityChange;
      // Clamp velocity to prevent excessive scrolling
      return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, newVelocity));
    });
    
    // Start physics loop if not already running
    if (!animationFrameRef.current) {
      lastFrameTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updatePhysics);
    }
  }, [isVisible, isSnapping, updatePhysics]);

  // Handle clicks on abstraction nodes
  const handleNodeClick = useCallback((item) => {
    if (!isVisible) return;
    
    // Set target scroll position and animate to it
    const targetPosition = item.level;
    setIsSnapping(true);
    setVelocity(0); // Stop any current motion
    
    const animateToLevel = () => {
      setScrollPosition(current => {
        const diff = targetPosition - current;
        
        if (Math.abs(diff) < 0.001) {
          setIsSnapping(false);
          return targetPosition;
        }
        
        return current + diff * (SNAP_SPRING * 1.5); // Slightly faster for click-to-target
      });
    };
    
    const clickAnimation = () => {
      animateToLevel();
      if (isSnapping) {
        requestAnimationFrame(clickAnimation);
      }
    };
    
    requestAnimationFrame(clickAnimation);
    
    // Handle click actions
    if (item.type === 'add_generic' || item.type === 'add_specific') {
      console.log(`Add new ${item.type.replace('add_', '')} abstraction`);
    } else if (item.type !== 'current') {
      console.log(`Replace current node with: ${item.name}`);
    }
  }, [isVisible, isSnapping]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
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
        zIndex: 15001,
        pointerEvents: 'auto',
        cursor: 'grab'
      }}
      onWheel={handleWheel}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* SVG Container for the abstraction nodes */}
      <svg
        style={{
          position: 'absolute',
          left: '-50vw',
          top: '-50vh',
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          transform: `translateY(${stackOffset}px)`,
          transition: isSnapping ? 'none' : 'none' // No CSS transitions, using JS animation
        }}
      >
        <defs>
          {/* Define clip paths for each node */}
          {abstractionChain.map((item) => {
            const nodeDimensions = getNodeDimensions(item.type === 'current' ? selectedNode : item, false, null);
            const distanceFromMain = Math.abs(item.level - scrollPosition);
            
            // Dramatically enhanced progressive scaling - much more dramatic falloff
            let scale = 1.0;
            if (distanceFromMain === 0) {
              // Exactly at focus - maximum size (much larger)
              scale = 2.5;
            } else if (distanceFromMain < 1) {
              // Close to focus - steep interpolation from max to small
              scale = 2.5 - (distanceFromMain * 2.1); // 2.5 to 0.4
            } else {
              // Further from focus - shrink dramatically to tiny sizes
              scale = 0.4 - ((distanceFromMain - 1) * 0.15); // Start at 0.4, shrink to 0.1
              scale = Math.max(0.1, scale); // Minimum scale of 0.1 (very tiny)
            }
            
            const scaledWidth = Math.round(nodeDimensions.currentWidth * zoomLevel * scale);
            const scaledHeight = Math.round(nodeDimensions.currentHeight * zoomLevel * scale);
            const cornerRadius = Math.round(NODE_CORNER_RADIUS * scale);
            
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
        {abstractionChain.map((item, index) => {
          const nodeDimensions = getNodeDimensions(item.type === 'current' ? selectedNode : item, false, null);
          const isPlaceholder = item.type === 'add_generic' || item.type === 'add_specific';
          const isCurrent = item.type === 'current';
          const distanceFromMain = Math.abs(item.level - scrollPosition);
          
          // Fog of war: hide nodes beyond the second one in either direction
          if (distanceFromMain > 2.5) {
            return null;
          }
          
          // Enhanced progressive scaling - more dramatic growth/shrinkage
          let scale = 1.0;
          if (distanceFromMain === 0) {
            // Exactly at focus - maximum size
            scale = 1.2;
          } else if (distanceFromMain < 1) {
            // Close to focus - interpolate between max and normal
            scale = 1.2 - (distanceFromMain * 0.2); // 1.2 to 1.0
          } else {
            // Further from focus - shrink more dramatically  
            scale = 1.0 - ((distanceFromMain - 1) * 0.25); // Start shrinking after distance 1
            scale = Math.max(0.3, scale); // Minimum scale of 0.3 instead of 0.4
          }
          
          // Calculate exact dimensions using proper rounding
          const scaledWidth = Math.round(nodeDimensions.currentWidth * zoomLevel * scale);
          const scaledHeight = Math.round(nodeDimensions.currentHeight * zoomLevel * scale);
          const scaledTextAreaHeight = Math.round(nodeDimensions.textAreaHeight * zoomLevel * scale);
          
          // Calculate opacity: smooth falloff based on distance
          let opacity = 1;
          if (distanceFromMain <= 1) {
            opacity = 1.0 - (distanceFromMain * 0.1); // Gentler falloff within 1 level
          } else if (distanceFromMain <= 2) {
            opacity = 0.9 - ((distanceFromMain - 1) * 0.4); // Steeper falloff beyond 1 level
          } else {
            opacity = 0.5 - ((distanceFromMain - 2) * 0.8); // Fade to invisible beyond 2 levels
          }
          
          // Position calculation - centered horizontally, spaced vertically
          const nodeX = Math.round(50 * window.innerWidth / 100);
          const nodeY = Math.round(50 * window.innerHeight / 100 + (item.level * LEVEL_SPACING * zoomLevel));
          
          // Determine if this is the "main" node (closest to scroll position)
          const isMainNode = distanceFromMain < 0.5;
          
          // Enhanced border styling - thicker for main node
          const borderWidth = isMainNode ? 6 : 2; // Thicker border for main node
          const borderColor = isPlaceholder ? '#999' : (isMainNode ? 'black' : '#666');
          const nodeColor = isPlaceholder ? 'transparent' : (item.color || NODE_DEFAULT_COLOR);
          
          // Corner radius that matches Node.jsx exactly
          const cornerRadius = Math.round(NODE_CORNER_RADIUS * scale);

          return (
            <g
              key={item.id}
              style={{
                opacity: opacity,
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
              onClick={() => handleNodeClick(item)}
            >
              {/* Background rect with exact same styling as Node.jsx */}
              <rect
                x={Math.round(nodeX - scaledWidth / 2 + 6 * scale)}
                y={Math.round(nodeY - scaledHeight / 2 + 6 * scale)}
                width={Math.round(scaledWidth - 12 * scale)}
                height={Math.round(scaledHeight - 12 * scale)}
                rx={Math.round(cornerRadius - 6 * scale)}
                ry={Math.round(cornerRadius - 6 * scale)}
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
                x={Math.round(nodeX - scaledWidth / 2)}
                y={Math.round(nodeY - scaledHeight / 2)}
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
                    padding: isPlaceholder ? '0' : `0 ${Math.round(8 * scale)}px`,
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
                      color: '#666',
                      fontSize: `${Math.max(10, Math.round(12 * zoomLevel * scale))}px`,
                      fontWeight: 'bold',
                      textAlign: 'center',
                      lineHeight: '1.2'
                    }}>
                      <Plus size={Math.max(12, Math.round(20 * zoomLevel * scale))} style={{ marginBottom: '2px' }} />
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
                        fontSize: `${Math.max(12, Math.round(20 * zoomLevel * scale))}px`,
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
              {!isPlaceholder && (
                <g>
                  <circle
                    cx={Math.round(nodeX + scaledWidth / 2 - 8 * scale)}
                    cy={Math.round(nodeY - scaledHeight / 2 + 8 * scale)}
                    r={Math.max(8, Math.round(12 * scale))}
                    fill={isMainNode ? 'black' : '#666'}
                    stroke="none"
                  />
                  <text
                    x={Math.round(nodeX + scaledWidth / 2 - 8 * scale)}
                    y={Math.round(nodeY - scaledHeight / 2 + 8 * scale)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.max(8, Math.round(10 * zoomLevel * scale))}
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
      <div style={{
        position: 'absolute',
        right: '-80px',
        top: `${stackOffset}px`,
        color: '#666',
        fontSize: `${Math.round(12 * zoomLevel)}px`,
        pointerEvents: 'none',
        userSelect: 'none',
        textAlign: 'left'
      }}>
        <div style={{ marginBottom: '8px' }}>↑ Generic</div>
        <div style={{ 
          color: '#333', 
          fontWeight: 'bold',
          fontSize: `${Math.round(14 * zoomLevel)}px`,
          marginBottom: '8px'
        }}>
          Level {scrollPosition.toFixed(1)}
        </div>
        <div>↓ Specific</div>
        
        {/* Physics debug info */}
        <div style={{ 
          fontSize: `${Math.round(10 * zoomLevel)}px`,
          color: '#999',
          marginTop: '10px'
        }}>
          <div>v: {velocity.toFixed(2)}</div>
          {isSnapping && <div>snapping</div>}
        </div>
      </div>
    </div>
  );
};

export default AbstractionCarousel; 