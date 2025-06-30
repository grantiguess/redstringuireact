import React from 'react';

// Helper to convert any color (hex or CSS name) to RGBA
const colorToRgba = (color, alpha) => {
    if (typeof color !== 'string' || !color) {
        return `rgba(255, 0, 255, ${alpha})`; // Bright magenta fallback
    }
    
    // If it's already a hex color, parse it
    if (color.startsWith('#')) {
        let r = 0, g = 0, b = 0;
        if (color.length === 4) { // #RGB
            r = parseInt(color[1] + color[1], 16);
            g = parseInt(color[2] + color[2], 16);
            b = parseInt(color[3] + color[3], 16);
        } else if (color.length === 7) { // #RRGGBB
            r = parseInt(color.slice(1, 3), 16);
            g = parseInt(color.slice(3, 5), 16);
            b = parseInt(color.slice(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    // For CSS color names like "maroon", "red", etc., use a canvas to convert to RGB
    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        const computedColor = ctx.fillStyle;
        
        // If the browser converted it to hex, parse that
        if (computedColor.startsWith('#')) {
            const r = parseInt(computedColor.slice(1, 3), 16);
            const g = parseInt(computedColor.slice(3, 5), 16);
            const b = parseInt(computedColor.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        
        // If it's already in rgb() format, extract the values
        const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
        }
    }
    
    // Fallback: return the original color with alpha (for CSS named colors)
    return color;
};

const HeaderGraphTab = ({ graph, onSelect, onDoubleClick, isActive, hideText = false }) => {
  const tabStyle = {
    padding: '7px 17px',
    backgroundColor: isActive ? graph.color : colorToRgba(graph.color, 0.333),
    borderRadius: '12px',
    color: isActive ? '#bdb5b5' : 'rgba(240, 240, 240, 0.5)',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
    cursor: 'pointer',
    margin: '0 5px',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    fontWeight: 'bold',
    fontSize: '18px',
    boxShadow: isActive ? '0 0 8px rgba(0,0,0,0.0)' : 'none',
    border: 'none',
    userSelect: 'none',
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
  };

  const handleClick = (e) => {
    if (!isActive && onSelect) {
      onSelect(graph.id);
    }
  };

  const handleDoubleClick = (e) => {
    if (onDoubleClick && isActive) {
      onDoubleClick(e);
    }
  };

  return (
    <div
      style={tabStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={graph.name}
    >
      <span style={{ 
        opacity: hideText ? 0 : 1,
        display: 'inline-block',
        verticalAlign: 'middle', // Better vertical alignment
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {graph.name}
      </span>
    </div>
  );
};

export default HeaderGraphTab; 