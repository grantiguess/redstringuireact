import React from 'react';
import './NodeType.css';

const NodeType = ({ name, color = '#800000', onClick }) => {
  return (
    <div 
      className="node-type-item"
      style={{ 
        backgroundColor: color,
        color: '#bdb5b5', // Canvas color for text
        borderRadius: '4px', // Less rounded
        width: '60px', // Smaller width
        height: '32px', // Smaller height
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        border: '2px solid transparent',
        userSelect: 'none'
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#bdb5b5';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.transform = 'translateY(0px)';
      }}
    >
      {name}
    </div>
  );
};

export default NodeType;
