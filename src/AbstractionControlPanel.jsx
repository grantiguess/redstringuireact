import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Plus, ArrowUpFromDot, ArrowRight } from 'lucide-react';
import useGraphStore from './store/graphStore';
import BottomControlPanel from './BottomControlPanel';

const AbstractionControlPanel = ({ 
  selectedNode, 
  currentDimension = 'Physical', 
  availableDimensions = ['Physical'], 
  onDimensionChange,
  onAddDimension,
  onDeleteDimension,
  onExpandDimension,
  onOpenInPanel,
  typeListOpen = false, 
  isVisible = true, 
  onAnimationComplete 
}) => {
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const openRightPanelNodeTab = useGraphStore((state) => state.openRightPanelNodeTab);
  const createAndAssignGraphDefinitionWithoutActivation = useGraphStore((state) => state.createAndAssignGraphDefinitionWithoutActivation);

  // Store the last valid node data for use during exit animation
  const [lastValidNode, setLastValidNode] = useState(selectedNode);

  // Update lastValidNode when a new valid selectedNode is provided
  useEffect(() => {
    if (selectedNode) {
      setLastValidNode(selectedNode);
    }
  }, [selectedNode]);

  // Only render when we have node data to work with
  if (!lastValidNode) return null;

  const currentDimensionIndex = availableDimensions.indexOf(currentDimension);
  const hasPreviousDimension = currentDimensionIndex > 0;
  const hasNextDimension = currentDimensionIndex < availableDimensions.length - 1;

  const handleDimensionNavigate = (direction) => {
    if (direction === 'left' && hasPreviousDimension) {
      const newDimension = availableDimensions[currentDimensionIndex - 1];
      onDimensionChange?.(newDimension);
    } else if (direction === 'right' && hasNextDimension) {
      const newDimension = availableDimensions[currentDimensionIndex + 1];
      onDimensionChange?.(newDimension);
    }
  };

  const handleAddDimension = () => {
    // For now, create a simple new dimension name
    const newDimensionName = `Dimension ${availableDimensions.length + 1}`;
    onAddDimension?.(newDimensionName);
  };

  const handleDeleteDimension = () => {
    if (availableDimensions.length > 1) {
      onDeleteDimension?.(currentDimension);
    }
  };

  const handleExpandDimension = (e) => {
    if (!lastValidNode) return;
    
    // Get the icon's bounding rectangle for any future hurtle animation
    const iconRect = e.currentTarget.getBoundingClientRect();
    
    // For now, just call the expand callback
    onExpandDimension?.(lastValidNode, currentDimension, iconRect);
  };

  const handleOpenInPanel = () => {
    if (!lastValidNode) return;
    
    // Open the node in the right panel
    if (lastValidNode.prototypeId) {
      openRightPanelNodeTab(lastValidNode.prototypeId, lastValidNode.name);
    }
    
    // Also call the callback if provided
    onOpenInPanel?.(lastValidNode, currentDimension);
  };

  // Create center content for the abstraction dimension display
  const centerContent = (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#bdb5b5',
        borderRadius: '8px',
        padding: '6px 12px',
        border: '1px solid #ddd',
        minWidth: '120px'
      }}
    >
      <span style={{ 
        color: '#000000',
        fontSize: '14px',
        fontWeight: 'bold',
        textAlign: 'center'
      }}>
        {currentDimension} Hierarchy
      </span>
    </div>
  );

  return (
    <BottomControlPanel
      centerContent={centerContent}
      onLeftArrow={() => handleDimensionNavigate('left')}
      onRightArrow={() => handleDimensionNavigate('right')}
      hasLeftArrow={hasPreviousDimension}
      hasRightArrow={hasNextDimension}
      onDelete={handleDeleteDimension}
      onAdd={handleAddDimension}
      onUp={handleExpandDimension}
      onRightPanel={handleOpenInPanel}
      isVisible={isVisible}
      typeListOpen={typeListOpen}
      onAnimationComplete={onAnimationComplete}
      className="abstraction-control-panel"
      // Only show delete if there are multiple dimensions
      showDelete={availableDimensions.length > 1}
    />
  );
};

export default AbstractionControlPanel; 