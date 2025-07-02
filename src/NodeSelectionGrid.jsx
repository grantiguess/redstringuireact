import React, { useMemo, useEffect } from 'react';
import NodeGridItem from './NodeGridItem';
import useGraphStore from './store/graphStore';
import './NodeSelectionGrid.css';

const NodeSelectionGrid = ({ 
  isVisible, 
  onNodeSelect, 
  onClose,
  position = { x: 0, y: 0 },
  maxHeight = 300,
  width = 280
}) => {
  // Get all node prototypes from the store
  const nodePrototypesMap = useGraphStore(state => state.nodePrototypes);
  
  // Convert to array and sort by name
  const availablePrototypes = useMemo(() => {
    const prototypes = Array.from(nodePrototypesMap.values());
    return prototypes.sort((a, b) => a.name.localeCompare(b.name));
  }, [nodePrototypesMap]);

  const handleNodeClick = (nodePrototype) => {
    onNodeSelect(nodePrototype);
  };

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isVisible) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isVisible, onClose]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Grid container - no backdrop, positioned above overlay */}
      <div
        className="node-selection-grid-container"
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: `${width}px`,
          maxHeight: `${maxHeight}px`,
          zIndex: 1002, // Above dialog (1001) and overlay (1000)
          overflow: 'hidden',
          pointerEvents: 'auto'
        }}
      >
        {/* Scrollable grid content - no background or borders */}
        <div
          className="node-selection-grid-scroll"
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '12px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            alignContent: 'start',
            maxHeight: `${maxHeight}px`
          }}
        >
          {availablePrototypes.length === 0 ? null : (
            availablePrototypes.map((prototype) => (
                              <NodeGridItem
                  key={prototype.id}
                  nodePrototype={prototype}
                  onClick={handleNodeClick}
                  width={132} // Calculated to fit 300px container: (300-24-12)/2 = 132
                  height={80}
                />
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default NodeSelectionGrid; 