import React, { useState, useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import { Plus } from 'lucide-react';
import { NODE_WIDTH, NODE_HEIGHT, NODE_CORNER_RADIUS, NODE_DEFAULT_COLOR, NODE_PADDING } from './constants';
import { getNodeDimensions } from './utils';
import useGraphStore from './store/graphStore';
import './AbstractionCarousel.css';

// Color utility functions for hue-based progression

// Helper function to convert CSS color names to hex
const cssColorToHex = (color) => {
  // If it's already a hex color, return as-is
  if (typeof color === 'string' && color.startsWith('#')) {
    return color;
  }
  
  // Create a temporary element to get the computed color
  if (typeof document !== 'undefined') {
    const tempElement = document.createElement('div');
    tempElement.style.color = color;
    document.body.appendChild(tempElement);
    
    const computedColor = getComputedStyle(tempElement).color;
    document.body.removeChild(tempElement);
    
    // Parse rgb(r, g, b) format
    const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }
  
  // Fallback for common CSS colors
  const colorMap = {
    'maroon': '#800000',
    'red': '#ff0000',
    'orange': '#ffa500',
    'yellow': '#ffff00',
    'olive': '#808000',
    'lime': '#00ff00',
    'green': '#008000',
    'aqua': '#00ffff',
    'teal': '#008080',
    'blue': '#0000ff',
    'navy': '#000080',
    'fuchsia': '#ff00ff',
    'purple': '#800080',
    'black': '#000000',
    'gray': '#808080',
    'silver': '#c0c0c0',
    'white': '#ffffff'
  };
  
  return colorMap[color.toLowerCase()] || '#800000'; // Default to maroon if unknown
};

const hexToHsl = (hex) => {
  // Convert CSS color names to hex first
  hex = cssColorToHex(hex);
  
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l;

  l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
};

const hslToHex = (h, s, l) => {
  h = h % 360;
  s = s / 100;
  l = l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const generateProgressiveColor = (baseColor, level) => {
  if (level === 0) return baseColor; // Center node stays the same
  
  const { h, s, l } = hexToHsl(baseColor);
  
  // Reduce saturation significantly for less gaudy colors
  const reducedSaturation = Math.max(0, s - 25); // Reduce saturation by 25%
  
  // For generic levels (negative), make progressively lighter
  // For specific levels (positive), make progressively darker
  let newLightness = l;
  
  if (level < 0) {
    // Generic levels: lighter with bigger first jump for better contrast
    if (level === -1) {
      // First level above center gets an even bigger jump for better contrast
      newLightness = Math.min(90, l + 40); // 40% lighter for first step (increased from 25%)
    } else {
      // More linear progression after the first jump
      // Use a gentler curve that starts slower and increases gradually
      const stepsFromFirst = Math.abs(level) - 1; // Steps beyond the first (-1)
      const linearBase = 40; // Start from the first jump
      const linearIncrement = 8; // Smaller, more linear increments (was 15)
      const lighteningFactor = linearBase + (stepsFromFirst * linearIncrement);
      newLightness = Math.min(90, l + lighteningFactor);
    }
  } else if (level > 0) {
    // Specific levels: darker with more linear progression
    // Make the darkening more gradual and linear too
    const linearDarkeningFactor = level * 6; // Even gentler than before (was 8)
    newLightness = Math.max(10, l - linearDarkeningFactor);
  }
  
  return hslToHex(h, reducedSaturation, newLightness);
};

const getTextColor = (backgroundColor) => {
  const { h, s, l } = hexToHsl(backgroundColor);
  
  // If background is bright (lightness > 35), use dark text with same hue
  // Lowered threshold from 42% to 35% for better contrast
  if (l > 35) {
    // Create a dark color with the same hue but very low lightness for better contrast
    return hslToHex(h, Math.min(s, 50), 12); // Darker text (12% instead of 15%) with slightly higher saturation
  } else {
    // Use light text for dark backgrounds
    return '#bdb5b5';
  }
};

const LEVEL_SPACING = -5; // Much tighter spacing for vertical carousel with dynamic content
const PHYSICS_DAMPING = 0.75; // Much lower damping for less friction/stickiness
const BASE_SCROLL_SENSITIVITY = 0.0003; // Reduced from 0.0008 for less sensitive quick scrolls
const PRECISION_SCROLL_SENSITIVITY = 0.0008; // Increased from 0.0010 for better slow start gain
const SNAP_THRESHOLD = 0.25; // Higher threshold to prevent premature snapping
const SNAP_SPRING = 0.35; // Stronger spring for faster snapping
const MIN_VELOCITY = 0.003; // Lower minimum to allow smaller movements
const MAX_VELOCITY = 0.8; // Slightly lower max velocity for better control
const VELOCITY_HISTORY_SIZE = 5; // Number of recent velocity samples to track
const CONTINUOUS_SCROLL_THRESHOLD = 0.12; // Lowered threshold to detect continuous scrolling sooner

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
        
        // Dynamic bounds based on actual chain length
        const minLevel = action.payload.minLevel || -6;
        const maxLevel = action.payload.maxLevel || 6;
        nextPosition = Math.max(minLevel, Math.min(maxLevel, nextPosition));
        
        // Check if we should start snapping (with enhanced "stuck" detection)
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
            
            // Enhanced snapping: if we're very close to a node (within 0.1), snap immediately
            const STUCK_THRESHOLD = 0.1; // Much smaller threshold for "stuck" detection
            
            if (distToFloor < STUCK_THRESHOLD) {
              // Very close to floor, snap immediately
              newTarget = floor;
            } else if (distToCeil < STUCK_THRESHOLD) {
              // Very close to ceiling, snap immediately  
              newTarget = ceil;
            } else if (distToFloor < SNAP_THRESHOLD) {
              // Close to floor, snap to floor
              newTarget = floor;
            } else if (distToCeil < SNAP_THRESHOLD) {
              // Close to ceiling, snap to ceiling
              newTarget = ceil;
            } else {
              // In the middle, use velocity direction to decide
              if (velocityDirection > 0) {
                newTarget = ceil; // Moving forward, snap to next
              } else if (velocityDirection < 0) {
                newTarget = floor; // Moving backward, snap to previous
              } else {
                newTarget = Math.round(nextPosition); // No velocity, snap to nearest
              }
            }
          }
          
          nextTargetPosition = Math.max(minLevel, Math.min(maxLevel, newTarget));
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
    case 'SET_VELOCITY_WITH_HISTORY':
      const { velocity, deltaY } = action.payload;
      const newHistory = [...(state.velocityHistory || []), Math.abs(velocity)];
      // Keep only the most recent samples
      const trimmedHistory = newHistory.slice(-VELOCITY_HISTORY_SIZE);
      return { 
        ...state, 
        velocity, 
        velocityHistory: trimmedHistory 
      };
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
        hasUserScrolled: false,
        velocityHistory: []
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
  onFocusedNodeDimensions, // New callback to report the focused node's dimensions
  currentDimension = 'Physical', // Current abstraction axis/dimension
  availableDimensions = [], // Available abstraction axes for this node
  onDimensionChange, // Called when user changes dimension
  onAddDimension, // Called when user adds a new dimension
  onDeleteDimension, // Called when user deletes a dimension
  onExpandDimension, // Called when user expands a dimension
  onOpenInPanel // Called when user opens dimension in panel
}) => {
  const carouselRef = useRef(null);
  
  // Store bindings
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const abstractionAxes = useGraphStore((state) => state.abstractionAxes);
  const thingNodeId = useGraphStore((state) => state.thingNodeId);
  
  // Pre-calculate the abstraction chain and base dimensions for each node
  const abstractionChainWithDims = useMemo(() => {
    if (!selectedNode) return [];
    
    const baseColor = selectedNode.color || NODE_DEFAULT_COLOR;
    console.log('[AbstractionCarousel] Base color:', baseColor, 'from selectedNode.color:', selectedNode.color);
    
    // Get the current abstraction axis
    const currentAxis = Array.from(abstractionAxes.values()).find(axis => axis.name === currentDimension);
    
    if (!currentAxis) {
      // If no axis exists, create a default chain with Thing at the bottom
      const thingNode = nodePrototypesMap.get(thingNodeId);
      
      const chain = [
        // Placeholder nodes for adding more
        { id: 'add_generic', name: 'Add More Generic Thing', type: 'add_generic', level: -2, color: '#ffffff' },
        
        // Thing is always at the bottom (only if it exists)
        ...(thingNode ? [{ ...thingNode, type: 'generic', level: -1, color: generateProgressiveColor(baseColor, -1) }] : []),
        
        // Current node (level 0) - use actual selectedNode data including thumbnail
        { ...selectedNode, type: 'current', level: 0 },
        
        // Placeholder nodes for adding more
        { id: 'add_specific', name: 'Add More Specific Thing', type: 'add_specific', level: 1, color: '#000000', textColor: '#ffffff', borderColor: '#000000' }
      ];
      
      // Pre-calculate base dimensions for each node
      return chain.map(item => {
        const nodeForDimensions = item.type === 'current' ? selectedNode : item;
        const baseDimensions = getNodeDimensions(nodeForDimensions, false, null);
        return { ...item, baseDimensions };
      });
    }
    
    // Build chain from the abstraction axis
    const chain = [];
    
    // Add the "Add More Generic Thing" button at the top
    chain.push({ id: 'add_generic', name: 'Add More Generic Thing', type: 'add_generic', level: -currentAxis.chainNodeIds.length - 1, color: '#ffffff' });
    
    // Add the nodes from the chain (most generic to most specific)
    currentAxis.chainNodeIds.forEach((nodeId, index) => {
      const node = nodePrototypesMap.get(nodeId);
      if (node) {
        const level = -(currentAxis.chainNodeIds.length - index);
        chain.push({
          ...node,
          type: 'generic',
          level: level,
          color: generateProgressiveColor(baseColor, level)
        });
      }
    });
    
    // Always add Thing at the bottom (level -1)
    const thingNode = nodePrototypesMap.get(thingNodeId);
    if (thingNode) {
      chain.push({
        ...thingNode,
        type: 'generic',
        level: -1,
        color: generateProgressiveColor(baseColor, -1)
      });
    }
    
    // Add the current node at level 0
    chain.push({ ...selectedNode, type: 'current', level: 0 });
    
    // Add the "Add More Specific Thing" button at the bottom
    chain.push({ id: 'add_specific', name: 'Add More Specific Thing', type: 'add_specific', level: 1, color: '#000000', textColor: '#ffffff', borderColor: '#000000' });

    // Log the generated colors
    chain.forEach(item => {
      if (item.level !== 0) {
        console.log(`[AbstractionCarousel] Level ${item.level}: ${item.name} -> Color: ${item.color}`);
      }
    });

    // Pre-calculate base dimensions for each node to use for smooth interpolation later
    return chain.map(item => {
      const nodeForDimensions = item.type === 'current' ? selectedNode : item;
      const baseDimensions = getNodeDimensions(nodeForDimensions, false, null);
      return { ...item, baseDimensions };
    });
  }, [selectedNode, currentDimension, abstractionAxes, nodePrototypesMap, thingNodeId]);
  
  // Calculate physics bounds based on chain
  const physicsMinLevel = useMemo(() => {
    if (!abstractionChainWithDims.length) return -6;
    return Math.min(...abstractionChainWithDims.map(n => n.level));
  }, [abstractionChainWithDims]);
  
  const physicsMaxLevel = useMemo(() => {
    if (!abstractionChainWithDims.length) return 6;
    return Math.max(...abstractionChainWithDims.map(n => n.level));
  }, [abstractionChainWithDims]);

  // Physics state using reducer
  const [physicsState, dispatchPhysics] = useReducer(physicsReducer, {
    realPosition: 0,
    targetPosition: 0,
    velocity: 0,
    isSnapping: false,
    hasUserScrolled: false,
    velocityHistory: []
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

  // Pre-calculate the y-offset for each level based on dynamic heights
  const levelOffsets = useMemo(() => {
    const offsets = { 0: 0 };
    if (!abstractionChainWithDims.length) return offsets;

    // Find the minimum and maximum levels
    const levels = abstractionChainWithDims.map(n => n.level);
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);

    // Calculate upwards from 0
    let upY = 0;
    for (let i = -1; i >= minLevel; i--) {
      const nodeCurrent = abstractionChainWithDims.find(n => n.level === i);
      const nodeAbove = abstractionChainWithDims.find(n => n.level === i + 1);
      if (!nodeCurrent || !nodeAbove) break;
      
      const hCurrent = nodeCurrent.baseDimensions.currentHeight;
      const hAbove = nodeAbove.baseDimensions.currentHeight;
      
      upY -= ((hAbove / 2) + (hCurrent / 2) + LEVEL_SPACING);
      offsets[i] = upY;
    }

    // Calculate downwards from 0
    let downY = 0;
    for (let i = 1; i <= maxLevel; i++) {
      const nodeCurrent = abstractionChainWithDims.find(n => n.level === i);
      const nodeBelow = abstractionChainWithDims.find(n => n.level === i - 1);
      if (!nodeCurrent || !nodeBelow) break;

      const hCurrent = nodeCurrent.baseDimensions.currentHeight;
      const hBelow = nodeBelow.baseDimensions.currentHeight;

      downY += ((hBelow / 2) + (hCurrent / 2) + LEVEL_SPACING);
      offsets[i] = downY;
    }
    return offsets;
  }, [abstractionChainWithDims]);

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

  // Calculate the stack offset using real position and dynamic offsets
  const getStackOffset = useCallback(() => {
    const position = physicsState.realPosition;
    const floorLevel = Math.floor(position);
    const ceilLevel = Math.ceil(position);

    const offsetA = levelOffsets[floorLevel];
    const offsetB = levelOffsets[ceilLevel];

    if (offsetA === undefined || offsetB === undefined) {
      // Fallback for out-of-bounds levels during animation
      return -position * (NODE_HEIGHT + LEVEL_SPACING) * zoomLevel;
    }

    const factor = position - floorLevel;
    const interpolatedOffset = offsetA + (offsetB - offsetA) * factor;

    return -interpolatedOffset * zoomLevel;
  }, [physicsState.realPosition, zoomLevel, levelOffsets]);

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
    dispatchPhysics({ 
      type: 'UPDATE_PHYSICS', 
      payload: { 
        frameMultiplier,
        minLevel: physicsMinLevel,
        maxLevel: physicsMaxLevel
      } 
    });

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
  }, [isVisible, abstractionChainWithDims, onScaleChange, onFocusedNodeDimensions, physicsMinLevel, physicsMaxLevel]);

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
    
    // Get current state for adaptive sensitivity calculation
    const currentState = physicsStateRef.current;
    const velocityHistory = currentState.velocityHistory || [];
    
    // Calculate if we're in continuous scrolling mode
    // Look at recent velocity magnitudes to detect sustained scrolling
    const recentVelocities = velocityHistory.slice(-3); // Last 3 samples
    const hasRecentActivity = recentVelocities.length >= 2;
    const avgRecentVelocity = hasRecentActivity 
      ? recentVelocities.reduce((sum, v) => sum + Math.abs(v), 0) / recentVelocities.length 
      : 0;
    
    // Determine if we're in continuous scrolling mode
    const isContinuousScrolling = hasRecentActivity && avgRecentVelocity > CONTINUOUS_SCROLL_THRESHOLD;
    
    // Use adaptive sensitivity based on scrolling context
    const baseSensitivity = isContinuousScrolling ? BASE_SCROLL_SENSITIVITY : PRECISION_SCROLL_SENSITIVITY;
    
    // Add scroll curve enhancement for easier slow starts
    const deltaY = e.deltaY;
    const absDeltaY = Math.abs(deltaY);
    
    // Progressive sensitivity curve: lower values get boosted more
    let sensitivityMultiplier = 1.0;
    if (absDeltaY < 10) {
      // Small movements get significant boost for easier starts
      sensitivityMultiplier = 2.5;
    } else if (absDeltaY < 25) {
      // Medium movements get moderate boost
      sensitivityMultiplier = 1.8;
    } else if (absDeltaY < 50) {
      // Larger movements get small boost
      sensitivityMultiplier = 1.2;
    }
    // Very large movements (>50) use base sensitivity (1.0)
    
    const adjustedSensitivity = baseSensitivity * sensitivityMultiplier;
    const velocityChange = deltaY * adjustedSensitivity;
    
    // Calculate new velocity using current state from ref
    const newVelocity = currentState.velocity + velocityChange;
    const clampedVelocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, newVelocity));
    
    // Update velocity and add to history
    dispatchPhysics({ type: 'SET_VELOCITY_WITH_HISTORY', payload: { velocity: clampedVelocity, deltaY } });
    
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
      // TODO: Implement abstraction axis node creation
      // For now, create a simple prompt for the user to name the new abstraction level
      const isGeneric = item.type === 'add_generic';
      const defaultName = isGeneric ? 'New Generic Thing' : 'New Specific Thing';
      const newName = prompt(`Enter name for ${isGeneric ? 'generic' : 'specific'} abstraction:`, defaultName);
      
      if (newName && newName.trim()) {
        // Create a new node prototype for this abstraction level
        const newNodeId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newNodeData = {
          id: newNodeId,
          name: newName.trim(),
          description: `A ${isGeneric ? 'more generic' : 'more specific'} abstraction of ${selectedNode.name}`,
          color: selectedNode.color || '#8B0000',
          typeNodeId: 'base-thing-prototype',
          definitionGraphIds: [],
          isSpecificityChainNode: true,
          hasSpecificityChain: false
        };
        
        // Add the new node to the store
        // TODO: Add to abstraction axis system when implemented
        console.log(`Would create new ${isGeneric ? 'generic' : 'specific'} abstraction: ${newName}`);
        console.log('New node data:', newNodeData);
        
        // For now, just show an alert that this feature is coming soon
        alert(`Abstraction creation for "${newName}" is coming soon! This will be integrated with the full abstraction axis system.`);
      }
    } else if (item.type !== 'current') {
      console.log(`Replace current node with: ${item.name}`);
    }
  }, [isVisible, selectedNode]);

  // Handle escape key and click-away to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

      const handleClickAway = (e) => {
    if (carouselRef.current && !carouselRef.current.contains(e.target)) {
      // Also check if the click was on the abstraction control panel
      const isOnControlPanel = e.target.closest('.abstraction-control-panel');
      if (!isOnControlPanel) {
        onClose();
      }
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
          {/* Define clip paths for each node's image */}
          {abstractionChainWithDims.map((item) => {
            // Check if this node has a thumbnail (current node uses selectedNode data)
            const hasThumbnail = Boolean(item.thumbnailSrc);
            if (!hasThumbnail) return null; // Only for nodes with images

            const nodeDimensions = item.baseDimensions;
            const { currentWidth, currentHeight, textAreaHeight, imageWidth, calculatedImageHeight } = nodeDimensions;
            
            // Use simple corner radius to match Node.jsx
            const imageCornerRadius = NODE_CORNER_RADIUS;

            return (
              <clipPath key={`clip-image-${item.id}`} id={`carousel-image-clip-${item.id}`}>
                <rect
                  // These coordinates are relative to the center of the node group's transform
                  x={-currentWidth / 2 + NODE_PADDING}
                  y={-currentHeight / 2 + textAreaHeight}
                  width={imageWidth}
                  height={calculatedImageHeight}
                  rx={imageCornerRadius}
                  ry={imageCornerRadius}
                />
              </clipPath>
            );
          })}
        </defs>

        {/* Render all abstraction levels in a vertical stack */}
        {[...abstractionChainWithDims]
          .sort((a, b) => {
            const distA = Math.abs(a.level - physicsState.realPosition);
            const distB = Math.abs(b.level - physicsState.realPosition);

            const isMainA = distA < 0.5;
            const isMainB = distB < 0.5;

            if (isMainA) return 1; // Main node always last (on top)
            if (isMainB) return -1;

            // Sort by distance descending, so farther nodes are rendered first (underneath)
            return distB - distA;
          })
          .map((item, index) => {
          const nodeDimensions = item.baseDimensions; // Use pre-calculated dimensions
          const isPlaceholder = item.type === 'add_generic' || item.type === 'add_specific';
          const isCurrent = item.type === 'current';
          const distanceFromMain = Math.abs(item.level - physicsState.realPosition);
          
          // Fog of war: hide nodes beyond a certain distance (dynamic based on chain length)
          const maxVisibleDistance = Math.min(7.5, abstractionChainWithDims.length + 1);
          if (distanceFromMain > maxVisibleDistance) {
            return null;
          }

          // Calculate entrance/exit animation properties
          let animationOpacity = 1;
          let animationScale = 1;
          let animationDelay = 0;
          let useAnimationOpacity = false;
          let opacityTransitionDelay = 0;
          
          // Only animate nodes within 2 levels of the center
          const shouldAnimate = distanceFromMain <= 2;
          
          if (animationState === 'entering' && !isCurrent && shouldAnimate) {
            // Entrance animation: start from center, staggered by distance
            animationDelay = distanceFromMain * 40; // 40ms per level (faster)
            animationOpacity = 0;
            animationScale = 0.3;
            useAnimationOpacity = true; // Override opacity for entrance
            // Add additional delay for opacity transition after entrance completes
            opacityTransitionDelay = animationDelay + 200; // 200ms entrance duration + stagger delay
          } else if (animationState === 'exiting' && !isCurrent && shouldAnimate) {
            // Exit animation: shrink to center, reverse stagger
            animationDelay = (4 - distanceFromMain) * 30; // 30ms reverse stagger (faster)
            animationScale = 0.3;
            useAnimationOpacity = false; // Don't override opacity - let CSS animate from current opacity
          }
          
          // Progressive scaling - center node matches real node size exactly
          let scale = 1.0;
          if (distanceFromMain === 0) {
            // Exactly at focus - should match the real node size
            scale = 1.0;
          } else if (distanceFromMain < 1) {
            // Close to focus - gentler drop from 1.0 to 0.8
            scale = 1.0 - (distanceFromMain * 0.2);
          } else {
            // Further from focus - shrink more gradually
            scale = 0.8 - ((distanceFromMain - 1) * 0.1);
            scale = Math.max(0.5, scale); // Minimum scale of 0.5 for readability
          }
          
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
          
          // Position calculation - uses dynamic offsets now
          const nodeX = window.innerWidth * 0.5;
          const nodeY = window.innerHeight * 2 + (levelOffsets[item.level] * zoomLevel);
          
          // Determine if this is the "main" node (closest to scroll position)
          const isMainNode = distanceFromMain < 0.5;
          
          // --- Refactored for Stable Scaling & Image Support ---
          const {
            currentWidth: unscaledWidth,
            currentHeight: unscaledHeight,
            textAreaHeight: unscaledTextAreaHeight,
            imageWidth: unscaledImageWidth,
            calculatedImageHeight: unscaledImageHeight
          } = item.baseDimensions;
          const hasThumbnail = Boolean(item.thumbnailSrc);

          // Unscaled border and corner radius
          const borderWidth = isMainNode ? 12 : 0; // Match NodeCanvas: 12 for centered, 0 for others
          const cornerRadius = NODE_CORNER_RADIUS;
          
          const borderColor = isMainNode ? 'black' : 'none'; // Match NodeCanvas: black for centered, none for others
          const nodeColor = isPlaceholder ? (item.color || '#bdb5b5') : (item.color || NODE_DEFAULT_COLOR);
          
          // Debug logging
          if (!isPlaceholder) {
            console.log(`[AbstractionCarousel Render] Level ${item.level}: ${item.name} -> item.color: ${item.color}, final nodeColor: ${nodeColor}`);
          }
          
          // Calculate animation transform for enter/exit
          const animationTransform = !isCurrent && shouldAnimate && (animationState === 'entering' || animationState === 'exiting') 
            ? `scale(${animationScale})` 
            : 'scale(1)';
          
          const animationStyles = !isCurrent && shouldAnimate && (animationState === 'entering' || animationState === 'exiting') ? {
            animation: animationState === 'entering' 
              ? `carousel-node-enter 0.2s ease-out ${animationDelay}ms both`
              : `carousel-node-exit 0.2s ease-in ${animationDelay}ms both`,
            // For exit animations, pass the current opacity as a CSS variable
            ...(animationState === 'exiting' ? { '--start-opacity': opacity } : {})
          } : {};

          // Calculate final opacity with transition
          const finalOpacity = useAnimationOpacity ? animationOpacity : opacity;
          const opacityStyle = animationState === 'entering' && shouldAnimate && !isCurrent ? {
            opacity: 1, // Start at full opacity after entrance
            animation: `carousel-opacity-transition 0.4s ease ${opacityTransitionDelay}ms forwards`,
            // Set CSS custom property for the final target opacity
            '--target-opacity': opacity
          } : {
            opacity: finalOpacity
          };

          return (
            <g
              key={item.id}
              style={{
                ...opacityStyle,
                cursor: 'pointer',
                pointerEvents: 'auto',
                transform: animationTransform,
                transformOrigin: `${nodeX}px ${nodeY}px`,
                ...animationStyles
              }}
              onClick={() => handleNodeClick(item)}
            >
              {/* This group handles positioning and dynamic scaling, keeping contents stable */}
              <g transform={`translate(${nodeX}, ${nodeY}) scale(${zoomLevel * scale})`}>
                {/* Background rect - uses unscaled dimensions */}
                <rect
                  x={-unscaledWidth / 2 + 6}
                  y={-unscaledHeight / 2 + 6}
                  width={unscaledWidth - 12}
                  height={unscaledHeight - 12}
                  rx={cornerRadius - 6}
                  ry={cornerRadius - 6}
                  fill={nodeColor}
                  stroke={borderColor}
                  strokeWidth={8}
                  style={{
                    filter: isMainNode 
                      ? 'drop-shadow(0px 0px 20px rgba(0, 0, 0, 0.5))'
                      : 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.2))'
                  }}
                />
                
                {/* Image (if available) - positioned relative to center */}
                {hasThumbnail && (
                    <image
                        x={-unscaledWidth / 2 + NODE_PADDING}
                        y={-unscaledHeight / 2 + unscaledTextAreaHeight}
                        width={unscaledImageWidth}
                        height={unscaledImageHeight}
                        href={item.thumbnailSrc}
                        preserveAspectRatio="xMidYMid slice"
                        clipPath={`url(#carousel-image-clip-${item.id})`}
                    />
                )}

                {/* ForeignObject for name text - uses unscaled dimensions */}
                <foreignObject
                  x={-unscaledWidth / 2}
                  y={-unscaledHeight / 2}
                  width={unscaledWidth}
                  height={hasThumbnail ? unscaledTextAreaHeight : unscaledHeight}
                  style={{
                    overflow: 'hidden',
                    pointerEvents: 'none'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%',
                      padding: isPlaceholder ? '0' : '15px 15px', // Match Node.jsx padding
                      boxSizing: 'border-box',
                      userSelect: 'none',
                      minWidth: 0
                    }}
                  >
                    {isPlaceholder ? (
                      <>
                        <Plus size={20} style={{ marginBottom: '2px', color: item.textColor || getTextColor(nodeColor) }} />
                        <span style={{ 
                          maxWidth: '90%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'pre-line',
                          wordBreak: 'break-word',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          fontFamily: "'EmOne', sans-serif",
                          textAlign: 'center',
                          lineHeight: '1.2',
                          color: item.textColor || getTextColor(nodeColor)
                        }}>
                          {item.name.replace(' Generic Thing', '\nGeneric Thing').replace(' Specific Thing', '\nSpecific Thing')}
                        </span>
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: '20px', // Match Node.jsx
                          fontWeight: 'bold', // Match Node.jsx
                          fontFamily: "'EmOne', sans-serif", // Use EmOne for node names
                          color: getTextColor(nodeColor),
                          whiteSpace: 'normal',
                          overflowWrap: 'break-word',
                          wordBreak: 'keep-all',
                          textAlign: 'center',
                          minWidth: 0,
                          width: '100%',
                          display: 'inline-block',
                          hyphens: 'auto'
                        }}
                        lang="en"
                      >
                        {item.name}
                      </span>
                    )}
                  </div>
                </foreignObject>

                {/* Level indicator - positioned inside the transformed group */}
                {!isPlaceholder && debugMode && (
                  <g>
                    <circle
                      cx={unscaledWidth / 2 - 8}
                      cy={-unscaledHeight / 2 + 8}
                      r={12}
                      fill={isMainNode ? 'black' : '#666'}
                      stroke="none"
                    />
                    <text
                      x={unscaledWidth / 2 - 8}
                      y={-unscaledHeight / 2 + 8}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={12}
                      fontFamily="'EmOne', sans-serif"
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
          fontFamily: "'EmOne', sans-serif",
          pointerEvents: 'none',
          userSelect: 'none',
          textAlign: 'left'
        }}>
          <div style={{ marginBottom: '8px' }}>↑ Generic</div>
          <div style={{ 
            color: '#333', 
            fontWeight: 'bold',
            fontSize: `${14 * zoomLevel}px`,
            fontFamily: "'EmOne', sans-serif",
            marginBottom: '8px'
          }}>
            Level {physicsState.realPosition.toFixed(1)}
          </div>
          <div>↓ Specific</div>
          
          {/* Physics debug info */}
          <div style={{ 
            fontSize: `${10 * zoomLevel}px`,
            fontFamily: "'EmOne', sans-serif",
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