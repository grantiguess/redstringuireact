import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import './ConnectionControlPanel.css';
import useGraphStore from './store/graphStore';
import NodeType from './NodeType';

const ConnectionControlPanel = ({ selectedEdge, typeListOpen = false, onOpenConnectionDialog }) => {
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const updateEdge = useGraphStore((state) => state.updateEdge);

  if (!selectedEdge) return null;

  const destinationNode = nodePrototypesMap.get(selectedEdge.destinationId);
  
  const currentEdgeType = selectedEdge.definitionNodeIds && selectedEdge.definitionNodeIds.length > 0 
    ? nodePrototypesMap.get(selectedEdge.definitionNodeIds[0])
    : null;

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
      onOpenConnectionDialog(selectedEdge.id);
    }
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
    <div className={`connection-control-panel ${typeListOpen ? 'with-typelist' : ''}`}>
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
          {currentEdgeType ? (
            <NodeType 
              name={currentEdgeType.name}
              color={currentEdgeType.color}
              onClick={handleNodeClick}
            />
          ) : (
            <div className="default-connection-node">
              <div className="connection-node-icon" style={{ 
                backgroundColor: '#000', 
                color: '#fff', 
                borderRadius: '4px', 
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Plus size={16} />
              </div>
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