import React, { useState, useCallback, useMemo } from 'react';
import { NODE_HEIGHT } from './constants'; // Assuming we use this height
import GraphPreview from './GraphPreview'; // <<< Import GraphPreview
// import './GraphListItem.css'; // We'll create this later

const GraphListItem = ({
  graphData,
  panelWidth,
  isActive,
  onClick,
  onDoubleClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDoubleClick = useCallback(() => {
    setIsExpanded(prev => !prev);
    // Potentially call onDoubleClick prop if needed for other actions
    // onDoubleClick?.(graphData.id); 
  }, []);

  const handleClick = useCallback(() => {
    onClick?.(graphData.id);
  }, [onClick, graphData.id]);

  // Calculate actual item width (needed for height animation)
  const currentItemWidth = useMemo(() => {
    // Subtracting 5px for the parent container's right padding
    return panelWidth ? panelWidth - 5 : NODE_HEIGHT; // Fallback to NODE_HEIGHT if panelWidth undefined?
  }, [panelWidth]);

  const itemStyle = {
    width: '100%',
    // FIX: Set height explicitly for smooth animation
    height: isExpanded ? currentItemWidth : NODE_HEIGHT, 
    // aspectRatio: isExpanded ? '1 / 1' : undefined, // REMOVE aspect-ratio
    backgroundColor: 'maroon',
    color: '#bdb5b5',
    // FIX: Use margin for spacing, remove marginBottom
    // marginBottom: '10px',
    margin: '5px 0', // Equal top/bottom margin
    // FIX: Increase border radius
    borderRadius: '12px', 
    boxSizing: 'border-box',
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    // FIX: Apply border whenever active, regardless of expansion
    border: isActive ? '8px solid black' : 'none',
    // FIX: Update transition (remove aspect-ratio)
    transition: 'height 0.2s ease, border 0.2s ease',
    // FIX: Add alignment for when expanded
    alignItems: 'center', // Center preview horizontally
    justifyContent: isExpanded ? 'flex-start' : 'center', // Center name vertically when collapsed
    // FIX: Adjust padding based on expansion (add bottom padding when expanded)
    paddingTop: isExpanded ? '10px' : '0',
    paddingLeft: isExpanded ? '10px' : '0',
    paddingRight: isExpanded ? '10px' : '0',
    paddingBottom: isExpanded ? '15px' : '0', // Add more bottom padding for "chin"
    // position: 'relative', // REMOVE relative positioning
  };

  // Style for the preview container - Apply animation directly here
  const previewContainerStyle = {
    width: '85%',
    // height: '80%', // REMOVE fixed height
    // FIX: Animate maxHeight and opacity directly
    maxHeight: isExpanded ? '80%' : '0px', 
    opacity: isExpanded ? 1 : 0,
    marginTop: '0',
    marginBottom: '0',
    backgroundColor: '#bdb5b5',
    borderRadius: '4px',
    overflow: 'hidden', 
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // FIX: Add transition here
    transition: 'max-height 0.2s ease, opacity 0.2s ease',
  };

  return (
    <div
      style={itemStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={graphData.name} // Tooltip with full name
    >
      {/* Graph Name - Add padding here */}
      <div 
        style={{
           fontWeight: 'bold',
           whiteSpace: 'nowrap',
           overflow: 'hidden',
           textOverflow: 'ellipsis',
           padding: isExpanded ? '5px 10px' : '10px',
           textAlign: 'center',
           width: '100%',
           boxSizing: 'border-box',
           // FIX: Remove auto margins when expanded
           marginTop: isExpanded ? '0' : 'auto',
           marginBottom: isExpanded ? '10px' : 'auto',
           userSelect: 'none',
        }}
      >
        {graphData.name}
      </div>

      {/* Conditional Preview Area - Animate container directly */}
      <div style={previewContainerStyle}>
        {/* <div style={previewWrapperStyle}> REMOVE Wrapper */}
          {/* Render the actual preview only when expanded to avoid rendering cost? */}
          {isExpanded && (
            <GraphPreview 
              nodes={graphData.nodes}
              edges={graphData.edges}
              width={itemStyle.width === '100%' ? 100 : (currentItemWidth) * 0.85} 
              height={itemStyle.width === '100%' ? 100 : (currentItemWidth) * 0.80} 
            />
          )}
        {/* </div> */}
      </div>
    </div>
  );
};

export default GraphListItem; 