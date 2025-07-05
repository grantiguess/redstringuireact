import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './ConnectionControlPanel.css';
import useGraphStore from './store/graphStore';
import NodeType from './NodeType';

const ConnectionControlPanel = ({ selectedEdge, typeListOpen = false, onOpenConnectionDialog, isVisible = true, onAnimationComplete }) => {
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const edgePrototypesMap = useGraphStore((state) => state.edgePrototypes);
  const updateEdge = useGraphStore((state) => state.updateEdge);

  // Animation state management
  const [animationState, setAnimationState] = useState('entering');
  const [shouldRender, setShouldRender] = useState(true);
  
  // Store the last valid edge data for use during exit animation
  const [lastValidEdge, setLastValidEdge] = useState(selectedEdge);

  // Update lastValidEdge when a new valid selectedEdge is provided
  useEffect(() => {
    if (selectedEdge) {
      setLastValidEdge(selectedEdge);
    }
  }, [selectedEdge]);

  // Handle visibility changes and animation lifecycle
  useEffect(() => {
    if (isVisible) {
      // Always start fresh when becoming visible
      setShouldRender(true);
      setAnimationState('entering');
    } else {
      // When becoming invisible, ALWAYS start exit animation if we're currently rendered
      // Never immediately hide - let the animation complete first
      if (shouldRender) {
        setAnimationState('exiting');
      }
      // If shouldRender is already false, do nothing - component is already hidden
    }
  }, [isVisible]);

  // Always reset to entering state when a new edge is selected
  useEffect(() => {
    if (selectedEdge?.id && isVisible) {
      setAnimationState('entering');
    }
  }, [selectedEdge?.id, isVisible]);

  // Handle animation end events
  const handleAnimationEnd = (e) => {
    if (e.animationName === 'connectionPanelFlyIn') {
      setAnimationState('visible');
    } else if (e.animationName === 'connectionPanelFlyOut') {
      setShouldRender(false);
      onAnimationComplete?.();
    }
  };

  // Fallback timeout for exit animation
  useEffect(() => {
    if (animationState === 'exiting') {
      const timeout = setTimeout(() => {
        setShouldRender(false);
        onAnimationComplete?.();
      }, 400); // Slightly longer than the animation duration (300ms)
      
      return () => clearTimeout(timeout);
    }
  }, [animationState, onAnimationComplete]);

  // Only stop rendering when shouldRender is false, and ensure we have edge data to work with
  if (!shouldRender || !lastValidEdge) return null;

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

  const hasLeftArrow = lastValidEdge.directionality?.arrowsToward?.has(lastValidEdge.sourceId);
  const hasRightArrow = lastValidEdge.directionality?.arrowsToward?.has(lastValidEdge.destinationId);

  return (
    <div 
      className={`connection-control-panel ${typeListOpen ? 'with-typelist' : ''} ${animationState}`}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="connection-control-content">
        <div className="arrow-control left-arrow">
          <div 
            className={`arrow-dropdown ${hasLeftArrow ? 'active' : ''}`}
            onClick={() => handleArrowToggle('left')}
          >
            <ChevronLeft size={20} />
          </div>
        </div>
        
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
        
        <div className="arrow-control right-arrow">
          <div 
            className={`arrow-dropdown ${hasRightArrow ? 'active' : ''}`}
            onClick={() => handleArrowToggle('right')}
          >
            <ChevronRight size={20} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionControlPanel;