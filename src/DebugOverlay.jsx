import React from 'react';
import './DebugOverlay.css';
import { HEADER_HEIGHT } from './constants';

const DebugOverlay = ({ debugData }) => {
  return (
    <div 
      className="debug-overlay"
      style={{
        position: 'fixed',
        top: `${HEADER_HEIGHT}px`,
        right: '0',
        width: '400px',
        maxHeight: `calc(100vh - ${HEADER_HEIGHT}px)`,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        fontFamily: 'monospace',
        fontSize: '12px',
        overflowY: 'scroll',
        zIndex: 9999,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
    >
      <div style={{ 
        position: 'sticky', 
        top: 0, 
        backgroundColor: 'rgba(0, 0, 0, 0.9)', 
        padding: '5px',
        marginBottom: '10px',
        borderBottom: '1px solid rgba(255,255,255,0.2)',
      }}>
        <strong>Debug Mode</strong>
      </div>

      {Object.entries(debugData).map(([key, value]) => (
        <div key={key} style={{ 
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          padding: '5px 0',
          marginBottom: '5px'
        }}>
          <strong style={{ color: '#66d9ef' }}>{key}:</strong>
          <pre style={{ 
            margin: '5px 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
          </pre>
        </div>
      ))}
    </div>
  );
};

export default DebugOverlay;