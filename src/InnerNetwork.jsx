import React from 'react';
import Node from './Node'; // Import Node component
import { 
    NODE_WIDTH, 
    NODE_HEIGHT, 
    NODE_PADDING, 
    AVERAGE_CHAR_WIDTH, 
    LINE_HEIGHT_ESTIMATE, 
    EXPANDED_NODE_WIDTH, 
    NAME_AREA_FACTOR 
} from './constants'; // Import necessary constants
import { getNodeDimensions } from './utils.js'; // Import from utils.js

// --- InnerNetwork Component --- 
const InnerNetwork = React.memo(({ nodes, connections, width, height, padding }) => {
  if (!nodes || nodes.length === 0 || width <= 0 || height <= 0) {
    return null; 
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(node => {
    const dims = getNodeDimensions(node); 
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + dims.currentWidth);
    maxY = Math.max(maxY, node.y + dims.currentHeight);
  });

  const networkWidth = nodes.length > 0 ? Math.max(maxX - minX, NODE_WIDTH) : NODE_WIDTH;
  const networkHeight = nodes.length > 0 ? Math.max(maxY - minY, NODE_HEIGHT) : NODE_HEIGHT;

  if (networkWidth <= 0 || networkHeight <= 0) {
      return null; 
  }

  const availableWidth = width - 2 * padding;
  const availableHeight = height - 2 * padding;

  if (availableWidth <= 0 || availableHeight <= 0) {
      return null;
  }

  const scaleX = availableWidth / networkWidth;
  const scaleY = availableHeight / networkHeight;
  const scale = Math.min(scaleX, scaleY); 

  const scaledNetworkWidth = networkWidth * scale;
  const scaledNetworkHeight = networkHeight * scale;
  const translateX = padding + (availableWidth - scaledNetworkWidth) / 2 - (minX * scale);
  const translateY = padding + (availableHeight - scaledNetworkHeight) / 2 - (minY * scale);

  return (
    <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`} pointerEvents="none">
      {connections.map((conn, idx) => {
        const sNode = nodes.find(n => n.id === conn.startId);
        const eNode = nodes.find(n => n.id === conn.endId);
        if (!sNode || !eNode) return null;
        const sNodeDims = getNodeDimensions(sNode);
        const eNodeDims = getNodeDimensions(eNode);
        return (
          <line
            key={`inner-conn-${idx}`}
            x1={sNode.x + sNodeDims.currentWidth / 2}
            y1={sNode.y + sNodeDims.currentHeight / 2}
            x2={eNode.x + eNodeDims.currentWidth / 2}
            y2={eNode.y + eNodeDims.currentHeight / 2}
            stroke="rgba(0,0,0,0.6)" 
            strokeWidth={Math.max(1, 3 / scale)} 
          />
        );
      })}

      {nodes.map((node) => {
         const dimensions = getNodeDimensions(node);
         return (
           <Node
             key={`inner-node-${node.id}`}
             node={node}
             currentWidth={dimensions.currentWidth}
             currentHeight={dimensions.currentHeight}
             textAreaHeight={dimensions.textAreaHeight}
             imageWidth={dimensions.imageWidth}
             imageHeight={dimensions.calculatedImageHeight}
             isSelected={false} 
             isDragging={false}
           />
         );
      })}
    </g>
  );
});

export default InnerNetwork; 