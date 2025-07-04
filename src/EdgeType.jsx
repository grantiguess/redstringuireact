import React from 'react';

const EdgeType = ({ name, color = '#800000', onClick }) => {
  return (
    <div 
      className="edge-type-item"
      style={{ 
        backgroundColor: color, 
        color: '#bdb5b5', // Canvas color for text
        borderRadius: '4px',
        minWidth: '60px', // Changed to minWidth for better scaling
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        border: '2px solid transparent',
        userSelect: 'none',
        padding: '0 8px', // Add horizontal padding
        position: 'relative',
        overflow: 'hidden'
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
      {/* Diagonal line to distinguish from nodes */}
      <div
        style={{
          position: 'absolute',
          left: '4px',
          top: '4px',
          bottom: '4px',
          width: '2px',
          background: 'linear-gradient(45deg, #bdb5b5 0%, transparent 100%)',
          transform: 'skew(-45deg)',
          opacity: 0.7
        }}
      />
      
      {/* Text with proper truncation */}
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          paddingLeft: '8px' // Space for the diagonal line
        }}
      >
        {name}
      </span>
    </div>
  );
};

export default EdgeType;