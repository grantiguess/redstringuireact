import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NODE_CORNER_RADIUS } from './constants'; // Import node corner radius
import './PieMenu.css'; // Animation styles

const BUBBLE_SIZE = 40; // Diameter of the bubble
const BUBBLE_PADDING = 10; // Desired visual gap between node edge and bubble edge
const ICON_SIZE = 20; // Size of the icon inside the bubble
const NUM_FIXED_POSITIONS = 8;
const FIXED_ANGLE_STEP = (2 * Math.PI) / NUM_FIXED_POSITIONS; // PI/4 or 45 degrees
const START_ANGLE_OFFSET = -Math.PI / 2; // Start at the top position (North)

const POP_ANIMATION_DURATION = 400; // ms, matches CSS
const SHRINK_ANIMATION_DURATION = 150; // ms, matches CSS (FASTER)
const STAGGER_DELAY = 40; // ms, slightly reduced
const EXIT_ANIMATION_BUFFER = 50; // ms, extra buffer for animation to complete visually

const PieMenu = ({ node, buttons, nodeDimensions, isVisible, onExitAnimationComplete }) => {
  // animationState can be: null (initial/hidden), 'popping', 'visible_steady', 'shrinking'
  const [animationState, setAnimationState] = useState(null);

  const bubbleRefs = useRef([]);
  // Ensure bubbleRefs array is the same length as buttons
  // This needs to be robust against buttons array changing length
  useEffect(() => {
    bubbleRefs.current = Array(buttons.length).fill().map((_, i) => bubbleRefs.current[i] || React.createRef());
  }, [buttons.length]);

  const animationsEndedCountRef = useRef(0);

  const [isVisibleInternal, setIsVisibleInternal] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const radius = 70; // Main radius for button placement
  const bubbleSize = 50; // Diameter of each button bubble

  // Primary effect to react to visibility changes from parent
  useEffect(() => {
    if (isVisible && !isVisibleInternal && !isAnimatingOut) {
      setIsVisibleInternal(true); // Trigger appear animation
    } else if (!isVisible && isVisibleInternal && !isAnimatingOut) {
      setIsAnimatingOut(true);
    }
  }, [isVisible, isVisibleInternal, isAnimatingOut, onExitAnimationComplete, node?.id]);

  const handleAnimationEnd = useCallback((event, buttonIndex) => {
    if (event.target === bubbleRefs.current[buttonIndex]?.current) {
      if (animationState === 'popping' && event.animationName === 'pie-bubble-pop') {
        animationsEndedCountRef.current += 1;
        if (animationsEndedCountRef.current >= buttons.length) {
          setAnimationState('visible_steady');
          animationsEndedCountRef.current = 0;
        }
      } else if (animationState === 'shrinking' && event.animationName === 'pie-bubble-shrink-out') {
        animationsEndedCountRef.current += 1;
        if (animationsEndedCountRef.current >= buttons.length) {
          onExitAnimationComplete && onExitAnimationComplete();
          setAnimationState(null);
          animationsEndedCountRef.current = 0;
        }
      }
    }
  }, [animationState, buttons, onExitAnimationComplete]);

  // Effect to add/remove event listeners for exit animation
  useEffect(() => {
    if (animationState === 'popping' || animationState === 'shrinking') {
      bubbleRefs.current.forEach((ref, index) => {
        const currentRef = ref.current;
        if (currentRef) {
          const listener = (event) => handleAnimationEnd(event, index);
          currentRef.addEventListener('animationend', listener);
          currentRef._animationEndListener = listener; 
        }
      });
    }

    return () => {
      bubbleRefs.current.forEach(ref => {
        const currentRef = ref.current;
        if (currentRef && currentRef._animationEndListener) {
          currentRef.removeEventListener('animationend', currentRef._animationEndListener);
          delete currentRef._animationEndListener;
        }
      });
    };
  }, [animationState, handleAnimationEnd]);

  // Render null if essential data is missing
  if (!node || !buttons || !buttons.length || !nodeDimensions) {
    if (animationState !== null && animationState !== 'shrinking' && onExitAnimationComplete) {
      onExitAnimationComplete();
      setAnimationState(null);
    }
    return null;
  }

  if (animationState === null && !isVisible) {
    return null;
  }
  if (animationState === null && isVisible) {
    return null;
  }

  const { x, y } = node;
  const { currentWidth, currentHeight } = nodeDimensions;

  const nodeCenterX = x + currentWidth / 2;
  const nodeCenterY = y + currentHeight / 2;

  const totalVisualOffset = BUBBLE_PADDING + BUBBLE_SIZE / 2;
  const cornerRadius = NODE_CORNER_RADIUS;

  let dynamicClassName = 'pie-menu-bubble-inner';
  if (animationState === 'popping') {
    dynamicClassName += ' is-popping';
  } else if (animationState === 'visible_steady') {
    dynamicClassName += ' is-visible-steady';
  } else if (animationState === 'shrinking') {
    dynamicClassName += ' is-shrinking';
  } else if (isVisible) {
    dynamicClassName += ' is-popping';
  }

  const handleBubbleClick = (buttonAction, e) => {
    e.stopPropagation();
    if (buttonAction && node) {
      buttonAction(node.id);
    }
    setIsAnimatingOut(true);
  };

  return (
    <g className="pie-menu">
      {buttons.map((button, index) => {
        const effectiveIndex = buttons.length === 1 ? 1 : index;

        if (effectiveIndex >= NUM_FIXED_POSITIONS) return null;

        const angle = START_ANGLE_OFFSET + effectiveIndex * FIXED_ANGLE_STEP;
        let bubbleX, bubbleY;

        switch (effectiveIndex) {
          case 0:
            bubbleX = nodeCenterX;
            bubbleY = nodeCenterY - (currentHeight / 2 + totalVisualOffset);
            break;
          case 1:
            bubbleX = nodeCenterX + (currentWidth / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.cos(angle);
            bubbleY = nodeCenterY - (currentHeight / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.sin(angle);
            break;
          case 2:
            bubbleX = nodeCenterX + (currentWidth / 2 + totalVisualOffset);
            bubbleY = nodeCenterY;
            break;
          case 3:
            bubbleX = nodeCenterX + (currentWidth / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.cos(angle);
            bubbleY = nodeCenterY + (currentHeight / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.sin(angle);
            break;
          case 4:
            bubbleX = nodeCenterX;
            bubbleY = nodeCenterY + (currentHeight / 2 + totalVisualOffset);
            break;
          case 5: // Bottom-Left (South-West)
            bubbleX = nodeCenterX - (currentWidth / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.cos(angle);
            bubbleY = nodeCenterY + (currentHeight / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.sin(angle);
            break;
          case 6: // Left (West)
            bubbleX = nodeCenterX - (currentWidth / 2 + totalVisualOffset);
            bubbleY = nodeCenterY;
            break;
          case 7: // Top-Left (North-West)
            bubbleX = nodeCenterX - (currentWidth / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.cos(angle);
            bubbleY = nodeCenterY - (currentHeight / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.sin(angle);
            break;
          default:
            // Fallback, though should not happen with NUM_FIXED_POSITIONS
            bubbleX = nodeCenterX + (currentWidth / 2 + totalVisualOffset) * Math.cos(angle);
            bubbleY = nodeCenterY + (currentHeight / 2 + totalVisualOffset) * Math.sin(angle);
        }

        const IconComponent = button.icon;

        // Distance from bubble final position back to node center (for animation start)
        const startDX = nodeCenterX - bubbleX;
        const startDY = nodeCenterY - bubbleY;

        let animationDelayMs;
        if (buttons.length === 1) {
          animationDelayMs = 0; // No delay if only one button
        } else if (animationState === 'shrinking') {
          // Reverse stagger for shrinking: last button (index N-1) gets 0 delay, first (index 0) gets (N-1)*delay
          animationDelayMs = (buttons.length - 1 - index) * STAGGER_DELAY;
        } else { // For popping or steady
          animationDelayMs = index * STAGGER_DELAY;
        }

        return (
          <g
            key={button.id || index}
            transform={`translate(${bubbleX}, ${bubbleY})`}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              if (animationState === 'shrinking') return; // Prevent click during exit animation
              e.stopPropagation();
              if (!isVisible) return; // Prevent action if menu is supposed to be hidden but animation not complete
              button.action(node.id);
            }}
          >
            {/* Inner wrapper so CSS transform does not conflict with outer absolute positioning */}
            <g
              className={dynamicClassName}
              style={{
                // Custom properties used by CSS keyframes to calculate initial offset
                '--start-x': `${startDX}px`,
                '--start-y': `${startDY}px`,
                animationDelay: `${animationDelayMs}ms`,
              }}
              ref={bubbleRefs.current[index]} // Assign ref to the inner g
            >
              <circle
                cx="0"
                cy="0"
                r={BUBBLE_SIZE / 2}
                fill="#DEDADA"
                stroke="maroon"
                strokeWidth={3}
              />
              {IconComponent && (
                <IconComponent
                  x={-ICON_SIZE / 2}
                  y={-ICON_SIZE / 2}
                  width={ICON_SIZE}
                  height={ICON_SIZE}
                  color="maroon"
                />
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
};

export default PieMenu; 