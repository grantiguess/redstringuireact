import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2, ArrowUpFromDot, Plus, ArrowRight } from 'lucide-react';
import './ConnectionControlPanel.css';
import useGraphStore from './store/graphStore';
import NodeType from './NodeType';
import BottomControlPanel from './BottomControlPanel';

const ConnectionControlPanel = ({ selectedEdge, typeListOpen = false, onOpenConnectionDialog, isVisible = true, onAnimationComplete, onStartHurtleAnimationFromPanel }) => {
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const edgePrototypesMap = useGraphStore((state) => state.edgePrototypes);
  const updateEdge = useGraphStore((state) => state.updateEdge);
  const removeEdge = useGraphStore((state) => state.removeEdge);
  const createAndAssignGraphDefinitionWithoutActivation = useGraphStore((state) => state.createAndAssignGraphDefinitionWithoutActivation);
  const openRightPanelNodeTab = useGraphStore((state) => state.openRightPanelNodeTab);

  // Store the last valid edge data for use during exit animation
  const [lastValidEdge, setLastValidEdge] = useState(selectedEdge);

  // Update lastValidEdge when a new valid selectedEdge is provided
  useEffect(() => {
    if (selectedEdge) {
      setLastValidEdge(selectedEdge);
    }
  }, [selectedEdge]);

  // Only render when we have edge data to work with
  if (!lastValidEdge) return null;

  const destinationNode = nodePrototypesMap.get(lastValidEdge.destinationId);
  
  // Check for edge type in definitionNodeIds first, then fallback to typeNodeId
  const currentEdgeType = lastValidEdge.definitionNodeIds && lastValidEdge.definitionNodeIds.length > 0 
    ? nodePrototypesMap.get(lastValidEdge.definitionNodeIds[0])
    : lastValidEdge.typeNodeId 
      ? edgePrototypesMap.get(lastValidEdge.typeNodeId)
      : null;
  
  // Check if this is a base connection (or equivalent)
  const isBaseConnection = !currentEdgeType || currentEdgeType?.id === 'base-connection-prototype';

  // Get the connection color for glow effect
  const getConnectionColor = () => {
    if (currentEdgeType) {
      return currentEdgeType.color || '#4A5568';
    }
    return destinationNode?.color || '#4A5568';
  };
  const connectionColor = getConnectionColor();

  const handleNodeClick = () => {
    // Always open the naming dialog when clicking the center connection display
    if (onOpenConnectionDialog) {
      onOpenConnectionDialog(lastValidEdge.id);
    }
  };

  const handleArrowToggle = (direction) => {
    const nodeId = direction === 'left' ? lastValidEdge.sourceId : lastValidEdge.destinationId;
    
    updateEdge(lastValidEdge.id, (draft) => {
      if (!draft.directionality) {
        draft.directionality = { arrowsToward: new Set() };
      }
      if (!draft.directionality.arrowsToward) {
        draft.directionality.arrowsToward = new Set();
      }
      
      if (draft.directionality.arrowsToward.has(nodeId)) {
        draft.directionality.arrowsToward.delete(nodeId);
      } else {
        draft.directionality.arrowsToward.add(nodeId);
      }
    });
  };

  const handleDeleteConnection = () => {
    if (lastValidEdge?.id) {
      removeEdge(lastValidEdge.id);
    }
  };

  const handleAddConnection = () => {
    if (onOpenConnectionDialog && lastValidEdge?.id) {
      onOpenConnectionDialog(lastValidEdge.id);
    }
  };

  const handleOpenInPanel = () => {
    if (!lastValidEdge) return;
    
    // Get the connection type - similar to how we determine currentEdgeType
    const connectionType = lastValidEdge.definitionNodeIds && lastValidEdge.definitionNodeIds.length > 0 
      ? nodePrototypesMap.get(lastValidEdge.definitionNodeIds[0])
      : lastValidEdge.typeNodeId 
        ? edgePrototypesMap.get(lastValidEdge.typeNodeId)
        : null;
    
    if (connectionType) {
      openRightPanelNodeTab(connectionType.id, connectionType.name);
    }
  };

  const handleOpenDefinition = (e) => {
    if (!lastValidEdge || !onStartHurtleAnimationFromPanel) return;
    
    // Get the connection type - similar to how we determine currentEdgeType
    const connectionType = lastValidEdge.definitionNodeIds && lastValidEdge.definitionNodeIds.length > 0 
      ? nodePrototypesMap.get(lastValidEdge.definitionNodeIds[0])
      : lastValidEdge.typeNodeId 
        ? edgePrototypesMap.get(lastValidEdge.typeNodeId)
        : null;
    
    if (connectionType) {
      // Get the icon's bounding rectangle for the hurtle animation
      const iconRect = e.currentTarget.getBoundingClientRect();
      
      // Check if definitions exist
      const hasDefinitions = connectionType.definitionGraphIds && connectionType.definitionGraphIds.length > 0;
      
      if (hasDefinitions) {
        // Has definitions - animate to existing definition
        const firstDefinitionGraphId = connectionType.definitionGraphIds[0];
        onStartHurtleAnimationFromPanel(
          connectionType.id,
          firstDefinitionGraphId,
          connectionType.id,
          iconRect
        );
      } else {
        // No definitions - create one first, then animate (with delay like Panel.jsx)
        createAndAssignGraphDefinitionWithoutActivation(connectionType.id);
        setTimeout(() => {
          const currentState = useGraphStore.getState();
          const updatedConnectionType = currentState.nodePrototypes.get(connectionType.id) || currentState.edgePrototypes.get(connectionType.id);
          if (updatedConnectionType?.definitionGraphIds?.length > 0) {
            const newGraphId = updatedConnectionType.definitionGraphIds[updatedConnectionType.definitionGraphIds.length - 1];
            onStartHurtleAnimationFromPanel(
              connectionType.id,
              newGraphId,
              connectionType.id,
              iconRect
            );
          }
        }, 150);
      }
    }
  };

  const hasLeftArrow = lastValidEdge.directionality?.arrowsToward?.has(lastValidEdge.sourceId);
  const hasRightArrow = lastValidEdge.directionality?.arrowsToward?.has(lastValidEdge.destinationId);

  // Create center content for the connection display
  const centerContent = (
    <div 
      className="connection-node-display" 
      onClick={handleNodeClick}
    >
      {isBaseConnection ? (
        <div className="base-connection-node" style={{
          backgroundColor: '#bdb5b5', // Canvas color background
          borderRadius: '8px',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          border: '1px solid #ddd'
        }}>
          <span style={{ 
            color: '#000000', // Black text
            fontSize: '16px',
            fontWeight: 'bold'
          }}>
            +
          </span>
          <span style={{ 
            color: '#000000', // Black text
            fontSize: '14px',
            fontWeight: 'bold'
          }}>
            Connection
          </span>
        </div>
      ) : (
        <NodeType 
          name={currentEdgeType.name}
          color={currentEdgeType.color}
          onClick={handleNodeClick}
        />
      )}
    </div>
  );

  return (
    <BottomControlPanel
      centerContent={centerContent}
      onLeftArrow={() => handleArrowToggle('left')}
      onRightArrow={() => handleArrowToggle('right')}
      hasLeftArrow={hasLeftArrow}
      hasRightArrow={hasRightArrow}
      onDelete={handleDeleteConnection}
      onAdd={handleAddConnection}
      onUp={handleOpenDefinition}
      onRightPanel={handleOpenInPanel}
      isVisible={isVisible}
      typeListOpen={typeListOpen}
      onAnimationComplete={onAnimationComplete}
      className="connection-control-panel"
    />
  );
};

export default ConnectionControlPanel;