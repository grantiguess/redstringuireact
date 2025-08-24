import React from 'react';
import { Copy } from 'lucide-react';

const ContextMenu = ({ x, y, options, onClose, onSelect }) => {
  if (!options || options.length === 0) return null;

  return (
    <>
      {/* Invisible backdrop to catch clicks */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998
        }}
        onClick={onClose}
      />
      
      {/* Context menu */}
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          background: '#DEDADA', // PlusSign off-white background
          border: '2px solid maroon', // PlusSign maroon stroke
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          minWidth: '150px',
          fontFamily: "'EmOne', sans-serif",
          fontSize: '0.85rem'
        }}
      >
        {options.map((option, index) => (
          <div
            key={index}
            style={{
              padding: '8px 12px',
              color: 'maroon', // PlusSign maroon text
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: index < options.length - 1 ? '1px solid rgba(128, 0, 0, 0.2)' : 'none',
              transition: 'background-color 0.1s ease',
              fontWeight: 'bold'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = 'rgba(128, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onSelect(option);
              onClose();
            }}
          >
            {option.icon && <span>{option.icon}</span>}
            <span>{option.label}</span>
            {option.shortcut && (
              <span style={{ 
                marginLeft: 'auto', 
                fontSize: '0.7rem', 
                opacity: 0.7 
              }}>
                {option.shortcut}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

export default ContextMenu;