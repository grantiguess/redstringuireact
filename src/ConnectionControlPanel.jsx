import { ChevronLeft, ChevronRight } from 'lucide-react';
import './ConnectionControlPanel.css';
import useGraphStore from './store/graphStore';
import NodeType from './NodeType';

const ConnectionControlPanel = ({ selectedEdge, typeListOpen = false, onOpenConnectionDialog }) => {
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const edgePrototypesMap = useGraphStore((state) => state.edgePrototypes);
  const updateEdge = useGraphStore((state) => state.updateEdge);

  if (!selectedEdge) return null;

  const destinationNode = nodePrototypesMap.get(selectedEdge.destinationId);
  
  // Check for edge type in definitionNodeIds first, then fallback to typeNodeId
  const currentEdgeType = selectedEdge.definitionNodeIds && selectedEdge.definitionNodeIds.length > 0 
    ? nodePrototypesMap.get(selectedEdge.definitionNodeIds[0])
    : selectedEdge.typeNodeId 
      ? edgePrototypesMap.get(selectedEdge.typeNodeId)
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
                color: '#8B0000', // Maroon text
                fontSize: '16px',
                fontWeight: 'bold'
              }}>
                +
              </span>
              <span style={{ 
                color: '#8B0000', // Maroon text
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