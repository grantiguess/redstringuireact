import React from 'react';

// Helper to convert hex to RGBA
const hexToRgba = (hex, alpha) => {
    if (!hex || hex.length < 4) {
        return `rgba(128, 0, 0, ${alpha})`; // Fallback for invalid hex
    }
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) { // #RGB
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) { // #RRGGBB
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const HeaderGraphTab = ({ graph, onSelect, onDoubleClick, isActive }) => {
  const tabStyle = {
    padding: '7px 17px',
    backgroundColor: isActive ? graph.color : hexToRgba(graph.color, 0.5),
    borderRadius: '12px',
    color: isActive ? '#f0f0f0' : 'rgba(240, 240, 240, 0.5)',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
    cursor: 'pointer',
    margin: '0 5px',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    fontWeight: 'bold',
    fontSize: '18px',
    boxShadow: isActive ? '0 0 8px rgba(0,0,0,0.3)' : 'none',
    border: 'none',
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
      {graph.name}
    </div>
  );
};

export default HeaderGraphTab; 