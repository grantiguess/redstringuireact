import React, { useMemo } from 'react';
import UnifiedBottomControlPanel from './UnifiedBottomControlPanel';
import useGraphStore from './store/graphStore';
import { CONNECTION_DEFAULT_COLOR } from './constants';

const ConnectionControlPanel = ({
  selectedEdge,
  selectedEdges = [],
  isVisible = true,
  typeListOpen = false,
  className = '',
  onAnimationComplete,
  onClose,
  onOpenConnectionDialog,
  onStartHurtleAnimationFromPanel
}) => {
  const edgePrototypesMap = useGraphStore((state) => state.edgePrototypes);
  const nodePrototypesMap = useGraphStore((state) => state.nodePrototypes);
  const graphsMap = useGraphStore((state) => state.graphs);
  const activeGraphId = useGraphStore((state) => state.activeGraphId);
  
  // Get instances from the active graph
  const instances = useMemo(() => {
    if (!activeGraphId || !graphsMap) return null;
    return graphsMap.get(activeGraphId)?.instances;
  }, [activeGraphId, graphsMap]);

  // Convert edges to triples format for UnifiedBottomControlPanel
  const triples = useMemo(() => {
    const edges = selectedEdge ? [selectedEdge] : selectedEdges;
    if (!edges || edges.length === 0 || !instances) return [];


    return edges.map(edge => {
      const sourceNode = instances.get(edge.sourceId);
      const targetNode = instances.get(edge.destinationId || edge.targetId);
      const sourcePrototype = sourceNode ? nodePrototypesMap.get(sourceNode.prototypeId) : null;
      const targetPrototype = targetNode ? nodePrototypesMap.get(targetNode.prototypeId) : null;
      // Use EXACT same logic as ConnectionBrowser (lines 468-481)
      let connectionName = 'Connection';
      let connectionColor = '#8B0000';
      let predicateId = edge.typeNodeId || edge.prototypeId;
      
      // First try to get name and color from edge's definition node (if it has one)
      if (edge.definitionNodeIds && edge.definitionNodeIds.length > 0) {
        const definitionNode = nodePrototypesMap.get(edge.definitionNodeIds[0]);
        if (definitionNode) {
          connectionName = definitionNode.name || 'Connection';
          connectionColor = definitionNode.color || '#8B0000';
          predicateId = edge.definitionNodeIds[0];
        }
      } else if (edge.typeNodeId) {
        // Fallback to edge prototype type
        const edgePrototype = nodePrototypesMap.get(edge.typeNodeId);
        if (edgePrototype) {
          connectionName = edgePrototype.name || 'Connection';
          connectionColor = edgePrototype.color || '#8B0000';
        }
      }

      // Calculate arrow states from directionality
      const arrowsToward = edge.directionality?.arrowsToward || new Set();
      const hasLeftArrow = arrowsToward.has(edge.sourceId); // Arrow points TO source (left side)
      const hasRightArrow = arrowsToward.has(edge.destinationId || edge.targetId); // Arrow points TO target (right side)

      const triple = {
        id: edge.id,
        sourceId: edge.sourceId,
        destinationId: edge.destinationId || edge.targetId,
        color: connectionColor,
        directionality: edge.directionality,
        subject: {
          id: sourceNode?.id,
          name: sourcePrototype?.name || sourceNode?.name || 'Node',
          color: sourcePrototype?.color || sourceNode?.color || '#800000'
        },
        predicate: {
          id: predicateId,
          name: connectionName,
          color: connectionColor
        },
        object: {
          id: targetNode?.id,
          name: targetPrototype?.name || targetNode?.name || 'Node',
          color: targetPrototype?.color || targetNode?.color || '#800000'
        },
        hasLeftArrow,
        hasRightArrow
      };


      return triple;
    });
  }, [selectedEdge, selectedEdges, edgePrototypesMap, nodePrototypesMap, instances]);

  const handleToggleLeftArrow = (tripleId) => {
    const updateEdge = useGraphStore.getState().updateEdge;
    updateEdge(tripleId, (draft) => {
      if (!draft.directionality) {
        draft.directionality = { arrowsToward: new Set() };
      }
      if (!draft.directionality.arrowsToward) {
        draft.directionality.arrowsToward = new Set();
      }
      
      // Toggle arrow pointing TO source (left side)
      if (draft.directionality.arrowsToward.has(draft.sourceId)) {
        draft.directionality.arrowsToward.delete(draft.sourceId);
      } else {
        draft.directionality.arrowsToward.add(draft.sourceId);
      }
    });
  };

  const handleToggleRightArrow = (tripleId) => {
    const updateEdge = useGraphStore.getState().updateEdge;
    updateEdge(tripleId, (draft) => {
      if (!draft.directionality) {
        draft.directionality = { arrowsToward: new Set() };
      }
      if (!draft.directionality.arrowsToward) {
        draft.directionality.arrowsToward = new Set();
      }
      
      // Toggle arrow pointing TO target (right side)
      if (draft.directionality.arrowsToward.has(draft.destinationId || draft.targetId)) {
        draft.directionality.arrowsToward.delete(draft.destinationId || draft.targetId);
      } else {
        draft.directionality.arrowsToward.add(draft.destinationId || draft.targetId);
      }
    });
  };

  const handlePredicateClick = (tripleId) => {
    if (onOpenConnectionDialog) {
      onOpenConnectionDialog(tripleId);
    }
  };

  const handleDelete = () => {
    // TODO: Implement delete logic
    console.log('Delete connection(s)');
    if (onClose) {
      onClose();
    }
  };

  const handleAdd = () => {
    // TODO: Implement add logic
    console.log('Add connection');
  };

  const handleUp = () => {
    // TODO: Implement open definition logic
    console.log('Open connection definition');
  };

  const handleOpenInPanel = () => {
    // TODO: Implement open in panel logic
    console.log('Open connection in panel');
  };

  return (
    <UnifiedBottomControlPanel
      mode="connections"
      isVisible={isVisible}
      typeListOpen={typeListOpen}
      className={className}
      onAnimationComplete={onAnimationComplete}
      
      // Connection mode props
      triples={triples}
      onToggleLeftArrow={handleToggleLeftArrow}
      onToggleRightArrow={handleToggleRightArrow}
      onPredicateClick={handlePredicateClick}
      
      // Pie menu button handlers
      onDelete={handleDelete}
      onAdd={handleAdd}
      onUp={handleUp}
      onOpenInPanel={handleOpenInPanel}
    />
  );
};

export default ConnectionControlPanel;
