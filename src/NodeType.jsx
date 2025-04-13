import React from 'react';
import './NodeType.css';

const NodeType = ({ name, color = '#555', onClick }) => {
  return (
    <div 
      className="node-type-item"
      style={{ 
        backgroundColor: color, 
        borderRadius: '4px' // Add slight rounding
      }}
      // draggable="true" // Remove draggable attribute
      onClick={onClick} // Add onClick handler
    >
      {name}
    </div>
  );
};

export default NodeType;
