import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import './TypeList.css';
import { HEADER_HEIGHT } from './constants';
import NodeType from './NodeType'; // Import NodeType
import useGraphStore from './store/graphStore';
// Placeholder icons (replace with actual icons later)
import { ChevronUp, Square, Share2 } from 'lucide-react'; // Replaced RoundedRectangle with Square

const TypeList = ({ nodes, setSelectedNodes, selectedNodes = new Set() }) => {
  // Modes: 'closed', 'node', 'connection'
  const [mode, setMode] = useState('closed'); 
  // const [isAnimating, setIsAnimating] = useState(false); // Basic animation lock

  // Get store data for finding type nodes
  const activeGraphId = useGraphStore((state) => state.activeGraphId);
  const graphsMap = useGraphStore((state) => state.graphs);
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const setNodeTypeAction = useGraphStore((state) => state.setNodeType);
  
  // Get the type nodes available for the current active graph
  const availableTypeNodes = useMemo(() => {
    const usedTypeIds = new Set();
    
    // If there's an active graph with instances, collect types being used
    if (activeGraphId) {
      const activeGraph = graphsMap.get(activeGraphId);
      if (activeGraph && activeGraph.instances) {
        const instances = Array.from(activeGraph.instances.values());
        
        // For each instance, get its prototype and collect the types being used
        instances.forEach(instance => {
          const prototype = nodePrototypesMap.get(instance.prototypeId);
          if (prototype && prototype.typeNodeId) {
            usedTypeIds.add(prototype.typeNodeId);
          }
        });
      }
    }
    
    // Get the actual prototype objects for the used types
    let typeNodes = Array.from(usedTypeIds)
      .map(id => nodePrototypesMap.get(id))
      .filter(Boolean);
      
    // If no specific types are used (or no active graph), include base types
    if (typeNodes.length === 0) {
      typeNodes = Array.from(nodePrototypesMap.values())
        .filter(prototype => {
          // A prototype is a valid type node if:
          // 1. It has no parent type (typeNodeId is null), AND
          // 2. It's not a graph-defining prototype (doesn't define any graphs)
          //    OR it's the special base "Thing" prototype
          const isUntyped = !prototype.typeNodeId;
          const isBaseThingPrototype = prototype.id === 'base-thing-prototype';
          const isGraphDefining = prototype.definitionGraphIds && prototype.definitionGraphIds.length > 0;
          
          const isValidTypeNode = isUntyped && (isBaseThingPrototype || !isGraphDefining);
          
          // Debug logging to verify the fix
          if (isUntyped) {
            console.log(`[TypeList] Prototype "${prototype.name}": baseThingPrototype=${isBaseThingPrototype}, graphDefining=${isGraphDefining}, included=${isValidTypeNode}`);
          }
          
          return isValidTypeNode;
        });
      
      console.log(`[TypeList] Available type nodes: ${typeNodes.map(n => n.name).join(', ')}`);
    }
    
    return typeNodes;
  }, [activeGraphId, graphsMap, nodePrototypesMap]);

  const handleNodeTypeClick = (nodeType) => {
    // If there are selected nodes, set their type to the clicked node type
    if (selectedNodes.size > 0) {
      selectedNodes.forEach(nodeId => {
        // Don't allow a node to be typed by itself
        if (nodeId !== nodeType.id) {
          setNodeTypeAction(nodeId, nodeType.id);
        }
      });
      console.log(`Set type of ${selectedNodes.size} nodes to ${nodeType.name}`);
    } else {
      // If no nodes are selected, select all nodes of this type
      const nodesOfType = nodes.filter(node => {
        // Find the prototype for this node instance
        const prototype = nodePrototypesMap.get(node.prototypeId);
        return prototype?.typeNodeId === nodeType.id;
      });
      const nodeIds = nodesOfType.map(node => node.id);
      setSelectedNodes(new Set(nodeIds));
      console.log(`Selected ${nodeIds.length} nodes of type ${nodeType.name}`);
    }
  };

  const cycleMode = () => {
    // Restore cycle: closed -> node -> connection -> closed
    setMode(currentMode => {
        if (currentMode === 'closed') return 'node';
        if (currentMode === 'node') return 'connection'; // Restore connection mode
        return 'closed';
    });
    // TODO: Add animation logic if needed
  };

  const getButtonIcon = () => {
    switch (mode) {
      case 'node':
        return <Square size={HEADER_HEIGHT * 0.6} />; // Use Square icon
      case 'connection': // Icon for connection mode
        return <Share2 size={HEADER_HEIGHT * 0.6} />;
      case 'closed':
      default:
        return <ChevronUp size={HEADER_HEIGHT * 0.6} />; // Use ChevronUp for closed state
    }
  };

  return (
    <>
      {/* Mode Toggle Button - Positioned Separately and Fixed */}
      <button 
        onClick={cycleMode}
        className="type-list-toggle-button"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          margin: '0 0 10px 10px',
          height: `${HEADER_HEIGHT}px`,
          width: `${HEADER_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#260000',
          border: '2px solid #bdb5b5', // Canvas color stroke
          borderRadius: '8px',
          padding: 0,
          cursor: 'pointer',
          color: '#bdb5b5',
          zIndex: 20000, // Higher than panels (10000)
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)'
        }}
      >
        {/* Icon size is HEADER_HEIGHT * 0.6 = 30 (matches panel icon size) */}
        {getButtonIcon()}
      </button>

      {/* Sliding Footer Bar */}
      <footer 
        className="type-list-bar"
        style={{ 
          height: `${HEADER_HEIGHT}px`, 
          position: 'fixed', 
          bottom: 0,
          left: 0, // Cover full width
          right: 0,
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#260000',
          zIndex: 19999, // Higher than panels but lower than toggle button
          overflow: 'hidden',
          transition: 'transform 0.3s ease-in-out',
          transform: mode === 'closed' ? 'translateY(100%)' : 'translateY(0)',
          paddingLeft: `calc(${HEADER_HEIGHT}px + 20px)`, // Increase paddingLeft for more space between button and content
          boxShadow: '0 -4px 8px rgba(0, 0, 0, 0.2)'
        }}
      >
        {/* Content Area - Button is no longer here */}
        <div 
          className="type-list-content"
          style={{
            flexGrow: 1,
            display: 'flex', 
            alignItems: 'center',
            // Adjust padding if needed, or remove if paddingLeft on footer is enough
            // paddingLeft: '10px' 
          }}
        >
          {mode === 'node' && (
            <>
              {/* Show available type nodes for the current graph */}
              {availableTypeNodes.map(prototype => (
                <NodeType 
                  key={prototype.id} 
                  name={prototype.name} 
                  color={prototype.color} 
                  onClick={() => handleNodeTypeClick(prototype)} 
                />
              ))}
            </>
          )}
          {mode === 'connection' && (
            <div style={{
              color: '#bdb5b5',
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '0 15px'
            }}>
              Connection Types (Coming Soon)
            </div>
          )}
        </div>
      </footer>
    </>
  );
};

TypeList.propTypes = {
  nodes: PropTypes.array.isRequired,
  setSelectedNodes: PropTypes.func.isRequired,
  selectedNodes: PropTypes.instanceOf(Set)
};

export default TypeList;
