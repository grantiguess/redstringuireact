import React, { useMemo } from 'react';
import { getNodeDimensions } from './utils.js';
import { NODE_HEIGHT, NODE_WIDTH } from './constants';

const GraphPreview = ({ nodes = [], edges = [], width, height }) => {

  // Basic scaling logic (can be refined)
  const { scaledNodes, scaledEdges, viewBox, scale } = useMemo(() => {
    if (!nodes.length || !width || !height) {
      return { scaledNodes: [], scaledEdges: [], viewBox: '0 0 100 100', scale: 1 };
    }

    // Define padding around the bounding box
    const BOUNDING_BOX_PADDING = 20; // Pixels in original coordinates

    // 1. Find bounds of original nodes using getNodeDimensions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const dims = getNodeDimensions(n);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + dims.currentWidth);
      maxY = Math.max(maxY, n.y + dims.currentHeight);
    });

    // Handle case with only one node or invalid bounds
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        const n = nodes[0] || { x: 0, y: 0 }; // Default if nodes is empty somehow
        const dims = nodes[0] ? getNodeDimensions(nodes[0]) : { currentWidth: NODE_WIDTH, currentHeight: NODE_HEIGHT }; 
        minX = n.x;
        minY = n.y;
        maxX = n.x + dims.currentWidth;
        maxY = n.y + dims.currentHeight;
    }

    // Calculate base network dimensions
    const baseNetworkWidth = Math.max(maxX - minX, 1);
    const baseNetworkHeight = Math.max(maxY - minY, 1);

    // Add padding to the dimensions for scaling
    const networkWidth = baseNetworkWidth + 2 * BOUNDING_BOX_PADDING;
    const networkHeight = baseNetworkHeight + 2 * BOUNDING_BOX_PADDING;

    // 2. Calculate scale factors
    const scaleX = width / networkWidth;
    const scaleY = height / networkHeight;
    const finalScale = Math.min(scaleX, scaleY);

    // 3. Calculate offsets to center the scaled graph (account for padding)
    const scaledContentWidth = networkWidth * finalScale;
    const scaledContentHeight = networkHeight * finalScale;
    const offsetX = (width - scaledContentWidth) / 2 - ((minX - BOUNDING_BOX_PADDING) * finalScale);
    const offsetY = (height - scaledContentHeight) / 2 - ((minY - BOUNDING_BOX_PADDING) * finalScale);

    // 4. Scale node positions and dimensions
    const finalScaledNodes = nodes.map(node => {
        const dims = getNodeDimensions(node);
        return {
            id: node.id,
            x: node.x * finalScale + offsetX,
            y: node.y * finalScale + offsetY,
            width: dims.currentWidth * finalScale,
            height: dims.currentHeight * finalScale,
        };
    });

    // 5. Scale edge positions (use center of scaled rects)
    const finalScaledEdges = edges.map(edge => {
      const sourceNode = finalScaledNodes.find(n => n.id === edge.sourceId);
      const destNode = finalScaledNodes.find(n => n.id === edge.destinationId);
      if (!sourceNode || !destNode) return null;
      return {
        key: edge.id,
        x1: sourceNode.x + sourceNode.width / 2,
        y1: sourceNode.y + sourceNode.height / 2,
        x2: destNode.x + destNode.width / 2,
        y2: destNode.y + destNode.height / 2,
      };
    }).filter(Boolean);

    const vb = `0 0 ${width} ${height}`;

    return { scaledNodes: finalScaledNodes, scaledEdges: finalScaledEdges, viewBox: vb, scale: finalScale };

  }, [nodes, edges, width, height]);

  // Render static SVG
  return (
    <svg width="100%" height="100%" viewBox={viewBox} style={{ display: 'block' }}>
      {/* Define Clip Path for Rounded Corners */}
      <defs>
        <clipPath id="graph-preview-rounded-corners">
          {/* Adjust rx/ry percentage as needed */}
          <rect x="0" y="0" width="100%" height="100%" rx="15%" ry="15%" />
        </clipPath>
      </defs>

      <g>
        {/* Render Edges First */}
        {scaledEdges.map(edge => (
          <line
            key={edge.key}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke="black"
            strokeWidth={Math.min(3.0, Math.max(0.6, 1.6 / scale)) || 0.6}
          />
        ))}

        {/* Render Nodes */}
        {scaledNodes.map(node => {
          const originalNode = nodes.find(n => n.id === node.id);
          const imageSrc = originalNode?.imageSrc;
          const nodeColor = originalNode?.color || '#800000'; // Get node color or default

          // Calculate stroke width scaled inversely (similar to edges)
          const nodeStrokeWidth = Math.max(0.5, 1.5 / scale) || 1;

          if (imageSrc) {
            // --- Render Image Node --- 
            return (
              // Apply transform and clip-path to the group
              <g 
                key={node.id} 
                transform={`translate(${node.x} ${node.y})`}
                clipPath="url(#graph-preview-rounded-corners)" // Apply clipping
              >
                {/* Render image within the clipped group */}
                <image
                  // x={node.x} // Position relative to group (0,0)
                  // y={node.y}
                  width={node.width}
                  height={node.height}
                  href={imageSrc}
                  preserveAspectRatio="xMidYMid meet"
                  // Stroke on image directly might not work well with clip-path
                  // stroke={nodeColor} 
                  // strokeWidth={nodeStrokeWidth}
                />
                 {/* Optional: Draw a separate rect for stroke if needed */}
                 {/* <rect x="0" y="0" width={node.width} height={node.height} fill="none" stroke={nodeColor} strokeWidth={nodeStrokeWidth} /> */}
              </g>
            );
          } else {
            // --- Render Rect Node ---
            return (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  fill={nodeColor} // Use node color
                  // FIX: Slightly increase corner radius
                  rx={node.width * 0.15} 
                  ry={node.height * 0.15}
                />
              </g>
            );
          }
        })}
      </g>
    </svg>
  );
};

export default GraphPreview; 