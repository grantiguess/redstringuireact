import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './ConnectionControlPanel.css';
import useGraphStore from './store/graphStore';
import NodeType from './NodeType';

const ConnectionControlPanel = ({ selectedEdge, onClose }) => {
  const edgePrototypesMap = useGraphStore((state) => state.edgePrototypes);
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const setEdgeTypeAction = useGraphStore((state) => state.setEdgeType);
  const updateEdge = useGraphStore((state) => state.updateEdge);

  if (!selectedEdge) return null;

  const sourceNode = nodePrototypesMap.get(selectedEdge.sourceId);
  const destinationNode = nodePrototypesMap.get(selectedEdge.destinationId);
  
  const currentEdgeType = selectedEdge.definitionNodeIds && selectedEdge.definitionNodeIds.length > 0 
    ? nodePrototypesMap.get(selectedEdge.definitionNodeIds[0])
    : null;

  const handleNodeClick = () => {
    // For now, just cycle through available edge types
    const availableTypes = Array.from(edgePrototypesMap.values());
    const currentIndex = availableTypes.findIndex(type => 
      selectedEdge.definitionNodeIds && selectedEdge.definitionNodeIds.includes(type.id)
    );
    const nextIndex = (currentIndex + 1) % availableTypes.length;
    const nextType = availableTypes[nextIndex];
    
    setEdgeTypeAction(selectedEdge.id, nextType.id);
  };

  const handleArrowToggle = (direction) => {
    const nodeId = direction === 'left' ? selectedEdge.sourceId : selectedEdge.destinationId;
    
    updateEdge(selectedEdge.id, (draft) => {
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

  const hasLeftArrow = selectedEdge.directionality?.arrowsToward?.has(selectedEdge.sourceId);
  const hasRightArrow = selectedEdge.directionality?.arrowsToward?.has(selectedEdge.destinationId);

  return (
    <div className="connection-control-panel">
      <div className="connection-control-content">
        <div className="arrow-control left-arrow">
          <div 
            className={`arrow-dropdown ${hasLeftArrow ? 'active' : ''}`}
            onClick={() => handleArrowToggle('left')}
          >
            <ChevronLeft size={20} />
          </div>
        </div>
        
        <div className="connection-node-display" onClick={handleNodeClick}>
          {currentEdgeType ? (
            <NodeType 
              node={currentEdgeType}
              isSelected={false}
              onClick={handleNodeClick}
            />
          ) : (
            <div className="default-connection-node">
              <div className="connection-node-icon">→</div>
              <span>Connection</span>
            </div>
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