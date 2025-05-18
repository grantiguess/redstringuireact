import React from 'react';
import { NODE_CORNER_RADIUS } from './constants'; // Import node corner radius
import './PieMenu.css'; // Animation styles

const BUBBLE_SIZE = 40; // Diameter of the bubble
const BUBBLE_PADDING = 10; // Desired visual gap between node edge and bubble edge
const ICON_SIZE = 20; // Size of the icon inside the bubble
const NUM_FIXED_POSITIONS = 8;
const FIXED_ANGLE_STEP = (2 * Math.PI) / NUM_FIXED_POSITIONS; // PI/4 or 45 degrees
const START_ANGLE_OFFSET = -Math.PI / 2; // Start at the top position (North)

const PieMenu = ({ node, buttons, nodeDimensions }) => {
  if (!node || !buttons || !buttons.length || !nodeDimensions) {
    return null;
  }

  const { x, y } = node;
  const { currentWidth, currentHeight } = nodeDimensions;

  const nodeCenterX = x + currentWidth / 2;
  const nodeCenterY = y + currentHeight / 2;

  const totalVisualOffset = BUBBLE_PADDING + BUBBLE_SIZE / 2;
  const cornerRadius = NODE_CORNER_RADIUS;

  return (
    <g className="pie-menu">
      {buttons.map((button, index) => {
        if (index >= NUM_FIXED_POSITIONS) return null;

        const angle = START_ANGLE_OFFSET + index * FIXED_ANGLE_STEP;
        let bubbleX, bubbleY;

        // Determine position based on angle index (0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW)
        switch (index) {
          case 0: // Top (North)
            bubbleX = nodeCenterX;
            bubbleY = nodeCenterY - (currentHeight / 2 + totalVisualOffset);
            break;
          case 1: // Top-Right (North-East)
            bubbleX = nodeCenterX + (currentWidth / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.cos(angle);
            bubbleY = nodeCenterY - (currentHeight / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.sin(angle);
            break;
          case 2: // Right (East)
            bubbleX = nodeCenterX + (currentWidth / 2 + totalVisualOffset);
            bubbleY = nodeCenterY;
            break;
          case 3: // Bottom-Right (South-East)
            bubbleX = nodeCenterX + (currentWidth / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.cos(angle);
            bubbleY = nodeCenterY + (currentHeight / 2 - cornerRadius) + (cornerRadius + totalVisualOffset) * Math.sin(angle);
            break;
          case 4: // Bottom (South)
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

        return (
          <g
            key={button.id || index}
            transform={`translate(${bubbleX}, ${bubbleY})`}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              button.action(node.id);
            }}
          >
            {/* Inner wrapper so CSS transform does not conflict with outer absolute positioning */}
            <g
              className="pie-menu-bubble-inner"
              style={{
                // Custom properties used by CSS keyframes to calculate initial offset
                '--start-x': `${startDX}px`,
                '--start-y': `${startDY}px`,
                // Small stagger so bubbles pop sequentially
                animationDelay: `${index * 50}ms`,
              }}
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