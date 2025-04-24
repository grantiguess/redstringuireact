import React from 'react';
import { ArrowLeftFromLine } from 'lucide-react';
import { HEADER_HEIGHT } from './constants'; // Assuming constants file is accessible

const ToggleButton = ({ isExpanded, onClick }) => {
  const buttonTop = HEADER_HEIGHT; // Position directly below header (remove +10 gap)
  const buttonRight = 0; // Position flush with right edge (remove 10px gap)

  return (
    <div
      style={{
        position: 'fixed',
        top: `${buttonTop}px`,
        right: `${buttonRight}px`,
        width: 40,
        height: 40,
        backgroundColor: 'maroon', // Always maroon
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        border: 'none', // Ensure no border
        padding: 0, // Ensure no padding
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)', // Optional: subtle shadow
        zIndex: 10000, // High z-index to be above other elements
        transition: 'background-color 0.2s ease', // Smooth background transition
        // Remove border-radius if you want sharp corners
        // borderRadius: '5px', 
      }}
      onClick={onClick}
      title={isExpanded ? 'Collapse Panel' : 'Expand Panel'} // Tooltip
    >
      <ArrowLeftFromLine 
        size={20} 
        color="#bdb5b5" 
        style={{ 
          transform: isExpanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s ease' 
        }} 
      />
    </div>
  );
};

export default ToggleButton; 