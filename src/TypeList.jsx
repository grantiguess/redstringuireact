import React, { useState } from 'react';
import './TypeList.css';
import { HEADER_HEIGHT } from './constants';
import NodeType from './NodeType'; // Import NodeType
// Placeholder icons (replace with actual icons later)
import { ChevronUp, Square, Share2 } from 'lucide-react'; // Replaced RoundedRectangle with Square

const TypeList = ({ nodes, setSelectedNodes }) => {
  // Modes: 'closed', 'node', 'connection'
  const [mode, setMode] = useState('closed'); 
  const [isAnimating, setIsAnimating] = useState(false); // Basic animation lock

  // Hardcoded node types for now
  const nodeTypes = [
    { id: 'base', name: 'Thing', color: 'maroon' } // Change color to maroon
  ];

  const handleNodeTypeClick = (nodeType) => {
    // For now, select all nodes when any type is clicked
    // Later, this could filter based on nodeType.id or similar
    const allNodeIds = nodes.map(node => node.id);
    setSelectedNodes(new Set(allNodeIds));
    console.log(`Selected all nodes because ${nodeType.name} was clicked.`);
  };

  const cycleMode = () => {
    if (isAnimating) return; // Prevent clicking during transition (if any)
    
    // Restore cycle: closed -> node -> connection -> closed
    setMode(currentMode => {
        if (currentMode === 'closed') return 'node';
        if (currentMode === 'node') return 'connection'; // Restore connection mode
        return 'closed';
    });
    // TODO: Add animation logic if needed
  };

  const getButtonIcon = () => {
    switch (mode) {
      case 'node':
        return <Square size={HEADER_HEIGHT * 0.6} />; // Use Square icon
      case 'connection': // Icon for connection mode
        return <Share2 size={HEADER_HEIGHT * 0.6} />;
      case 'closed':
      default:
        return <ChevronUp size={HEADER_HEIGHT * 0.6} />; // Use ChevronUp for closed state
    }
  };

  return (
    <>
      {/* Mode Toggle Button - Positioned Separately and Fixed */}
      <button 
        onClick={cycleMode}
        className="type-list-toggle-button"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          margin: '0 0 10px 10px',
          height: `${HEADER_HEIGHT}px`,
          width: `${HEADER_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#260000',
          border: '2px solid #bdb5b5', // Canvas color stroke
          borderRadius: '8px',
          padding: 0,
          cursor: 'pointer',
          color: '#bdb5b5',
          zIndex: 10002,
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)'
        }}
      >
        {/* Icon size is HEADER_HEIGHT * 0.6 = 30 (matches panel icon size) */}
        {getButtonIcon()}
      </button>

      {/* Sliding Footer Bar */}
      <footer 
        className="type-list-bar"
        style={{ 
          height: `${HEADER_HEIGHT}px`, 
          position: 'fixed', 
          bottom: 0,
          left: 0, // Cover full width
          right: 0,
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#260000',
          zIndex: 10001,
          overflow: 'hidden',
          transition: 'transform 0.3s ease-in-out',
          transform: mode === 'closed' ? 'translateY(100%)' : 'translateY(0)',
          paddingLeft: `calc(${HEADER_HEIGHT}px + 20px)`, // Increase paddingLeft for more space between button and content
          boxShadow: '0 -4px 8px rgba(0, 0, 0, 0.2)'
        }}
      >
        {/* Content Area - Button is no longer here */}
        <div 
          className="type-list-content"
          style={{
            flexGrow: 1,
            display: 'flex', 
            alignItems: 'center',
            // Adjust padding if needed, or remove if paddingLeft on footer is enough
            // paddingLeft: '10px' 
          }}
        >
          {mode === 'node' && (
            nodeTypes.map(type => (
              <NodeType 
                key={type.id} 
                name={type.name} 
                color={type.color} 
                onClick={() => handleNodeTypeClick(type)} 
              />
            ))
          )}
          {mode === 'connection' && (
            <div style={{
              color: '#bdb5b5',
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '0 15px'
            }}>
              Connection Types (Coming Soon)
            </div>
          )}
        </div>
      </footer>
    </>
  );
};

export default TypeList;
