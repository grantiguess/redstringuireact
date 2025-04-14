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
const InnerNetwork = ({ nodes, connections, width, height, padding }) => {
  if (!nodes || nodes.length === 0 || width <= 0 || height <= 0) {
    return null; 
  }

  // --- Bounding Box Calculation ---
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(node => {
    // Use dimensions of the original nodes passed in
    const dims = getNodeDimensions(node); 
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + dims.currentWidth);
    maxY = Math.max(maxY, node.y + dims.currentHeight);
  });

  // Define padding around the bounding box
  const BOUNDING_BOX_PADDING = 20; // Pixels in original coordinates

  // Calculate base network dimensions from bounding box
  const baseNetworkWidth = nodes.length > 0 ? Math.max(maxX - minX, NODE_WIDTH) : NODE_WIDTH;
  const baseNetworkHeight = nodes.length > 0 ? Math.max(maxY - minY, NODE_HEIGHT) : NODE_HEIGHT;

  // Add padding to the dimensions before scaling
  const networkWidth = baseNetworkWidth + 2 * BOUNDING_BOX_PADDING;
  const networkHeight = baseNetworkHeight + 2 * BOUNDING_BOX_PADDING;

  if (networkWidth <= 0 || networkHeight <= 0) {
      return null; 
  }

  // --- Scaling and Translation Calculation ---
  const availableWidth = width - 2 * padding;
  const availableHeight = height - 2 * padding;

  if (availableWidth <= 0 || availableHeight <= 0) {
      return null;
  }

  const scaleX = availableWidth / networkWidth;
  const scaleY = availableHeight / networkHeight;
  const scale = Math.min(scaleX, scaleY); // Calculate scale to fit padded box

  const scaledNetworkWidth = networkWidth * scale; 
  const scaledNetworkHeight = networkHeight * scale; 

  // Adjust translation to account for the padded bounding box origin (minX - padding)
  const translateX = padding + (availableWidth - scaledNetworkWidth) / 2 - ((minX - BOUNDING_BOX_PADDING) * scale);
  const translateY = padding + (availableHeight - scaledNetworkHeight) / 2 - ((minY - BOUNDING_BOX_PADDING) * scale);


  return (
    // Apply calculated transform to the parent group
    <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`} pointerEvents="none">
      {/* Render Edges using original coordinates (scaled by parent g) */}
      {connections.map((edge, idx) => {
        const originalSNode = edge.getSource();
        const originalENode = edge.getDestination();

        if (!originalSNode || !originalENode) return null;

        // Find node data (needed for dimensions)
        const sNodeData = nodes.find(n => n.getId() === originalSNode.getId());
        const eNodeData = nodes.find(n => n.getId() === originalENode.getId());

        if (!sNodeData || !eNodeData) return null;

        // Get original dimensions for center calculation
        const sNodeDims = getNodeDimensions(sNodeData);
        const eNodeDims = getNodeDimensions(eNodeData);

        // Calculate center points using the *up-to-date* node data from the `nodes` prop
        const sCenterX = sNodeData.getX() + sNodeDims.currentWidth / 2;
        const sCenterY = sNodeData.getY() + sNodeDims.currentHeight / 2;
        const eCenterX = eNodeData.getX() + eNodeDims.currentWidth / 2;
        const eCenterY = eNodeData.getY() + eNodeDims.currentHeight / 2;

        // Use center coordinates for the line
        return (
          <line
            key={`inner-conn-${sNodeData.getId()}-${eNodeData.getId()}-${idx}`}
            x1={sCenterX} 
            y1={sCenterY}
            x2={eCenterX}
            y2={eCenterY}
            stroke="rgba(0,0,0,0.6)"
            // Keep stroke width scaling inversely
            strokeWidth={Math.max(1, 4 / scale)} 
          />
        );
      })}

      {/* Render Nodes using original coordinates and dimensions (scaled by parent g) */}
      {nodes.map((node) => {
         // Get original dimensions 
         const dimensions = getNodeDimensions(node);

         return (
           <Node
             key={`inner-node-${node.getId()}`}
             node={{
                 id: node.getId(),
                 name: node.getName(),
                 getThumbnailSrc: () => node.getThumbnailSrc ? node.getThumbnailSrc() : null,
                 // Pass original coordinates; transform is handled by parent <g>
                 x: node.getX(), 
                 y: node.getY(),
                 scale: 1 // Scale is handled by parent <g>
             }}
             // Pass original dimensions
             currentWidth={dimensions.currentWidth}
             currentHeight={dimensions.currentHeight}
             textAreaHeight={dimensions.textAreaHeight}
             imageWidth={dimensions.imageWidth}
             imageHeight={dimensions.calculatedImageHeight}
             // Other props
             isSelected={false}
             isDragging={false}
             idPrefix="inner-" // Keep prefix for ID uniqueness
             isPreviewing={false} // Don't trigger preview state within preview
           />
         );
      })}
    </g>
  );
};

export default InnerNetwork;