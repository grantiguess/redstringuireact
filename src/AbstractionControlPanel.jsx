import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Plus, ArrowUpFromDot, ArrowRight, Edit3 } from 'lucide-react';
import useGraphStore from './store/graphStore';
import UnifiedBottomControlPanel from './UnifiedBottomControlPanel';

const AbstractionControlPanel = ({ 
  selectedNode, 
  currentDimension = 'Data Abstraction Axis', 
  availableDimensions = ['Data Abstraction Axis'], 
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(currentDimension);

  // Update lastValidNode when a new valid selectedNode is provided
  useEffect(() => {
    if (selectedNode) {
      setLastValidNode(selectedNode);
    }
  }, [selectedNode]);

  // Update editing name when current dimension changes
  useEffect(() => {
    setEditingName(currentDimension);
  }, [currentDimension]);

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
    // Create a new dimension name
    const newDimensionName = `Data Abstraction Axis ${availableDimensions.length + 1}`;
    onAddDimension?.(newDimensionName);
  };

  const handleDeleteDimension = () => {
    if (availableDimensions.length > 1) {
      onDeleteDimension?.(currentDimension);
    }
  };

  const handleExpandDimension = () => {
    if (!lastValidNode) return;
    
    // For now, just call the expand callback
    onExpandDimension?.(lastValidNode, currentDimension);
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

  const handleEditName = () => {
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (editingName.trim() && editingName !== currentDimension) {
      // Here you would typically update the dimension name in your store
      // For now, we'll just close the edit mode
      console.log('Would update dimension name to:', editingName);
    }
    setIsEditingName(false);
  };

  const handleCancelEdit = () => {
    setEditingName(currentDimension);
    setIsEditingName(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Create the hierarchy display content
  const hierarchyContent = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div className="piemenu-button" onClick={() => handleDimensionNavigate('left')} title="Previous" style={{ visibility: hasPreviousDimension ? 'visible' : 'hidden' }}>
        <ChevronLeft size={18} />
      </div>
      
      {isEditingName ? (
        <input
          type="text"
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleSaveName}
          style={{
            backgroundColor: '#bdb5b5',
            border: '1px solid #ddd',
            borderRadius: '6px',
            padding: '4px 8px',
            color: '#000000',
            fontSize: '14px',
            fontWeight: 'bold',
            textAlign: 'center',
            minWidth: '120px',
            outline: 'none'
          }}
          autoFocus
        />
      ) : (
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
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
          <div className="piemenu-button" onClick={handleEditName} title="Edit Name" style={{ padding: '2px' }}>
            <Edit3 size={14} />
          </div>
        </div>
      )}
      
      <div className="piemenu-button" onClick={() => handleDimensionNavigate('right')} title="Next" style={{ visibility: hasNextDimension ? 'visible' : 'hidden' }}>
        <ChevronRight size={18} />
      </div>
    </div>
  );

  return (
    <UnifiedBottomControlPanel
      mode="abstraction"
      isVisible={isVisible}
      typeListOpen={typeListOpen}
      className="abstraction-control-panel"
      onAnimationComplete={onAnimationComplete}
      
      // Custom content for abstraction mode
      customContent={hierarchyContent}
      
      // Pie menu button handlers
      onAdd={handleAddDimension}
      onUp={handleExpandDimension}
      onOpenInPanel={handleOpenInPanel}
      onDelete={handleDeleteDimension}
      
      // Only show delete if there are multiple dimensions
      showDelete={availableDimensions.length > 1}
    />
  );
};

export default AbstractionControlPanel; 