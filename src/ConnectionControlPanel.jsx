import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2, ArrowUpFromDot, Plus, ArrowRight } from 'lucide-react';
import './ConnectionControlPanel.css';
import useGraphStore from './store/graphStore';
import NodeType from './NodeType';
import UnifiedBottomControlPanel from './UnifiedBottomControlPanel';

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

  // Access graph context for subject/object rendering
  const graphsMap = useGraphStore((state) => state.graphs);
  const activeGraphId = useGraphStore((state) => state.activeGraphId);
  const selectedEdgeIds = useGraphStore((state) => state.selectedEdgeIds);

  // Build the list of edges to show (support multi-select)
  const edgesToShow = React.useMemo(() => {
    const list = [];
    if (selectedEdgeIds && selectedEdgeIds.size > 0) {
      selectedEdgeIds.forEach((id) => {
        const e = useGraphStore.getState().edges.get(id);
        if (e) list.push(e);
      });
    } else if (lastValidEdge) {
      list.push(lastValidEdge);
    }
    return list;
  }, [lastValidEdge, selectedEdgeIds]);

  if (edgesToShow.length === 0) return null;

  const graph = graphsMap.get(activeGraphId);

  const resolvePredicate = (edge) => {
    const byDef = edge.definitionNodeIds && edge.definitionNodeIds.length > 0 
      ? nodePrototypesMap.get(edge.definitionNodeIds[0])
      : null;
    if (byDef) return byDef;
    return edge.typeNodeId ? edgePrototypesMap.get(edge.typeNodeId) : null;
  };

  const triples = edgesToShow.map((edge) => {
    const subjectInstance = graph?.instances?.get(edge.sourceId);
    const objectInstance = graph?.instances?.get(edge.destinationId);
    const subjectProto = subjectInstance ? nodePrototypesMap.get(subjectInstance.prototypeId) : null;
    const objectProto = objectInstance ? nodePrototypesMap.get(objectInstance.prototypeId) : null;
    const predicate = resolvePredicate(edge);
    return {
      id: edge.id,
      subject: subjectProto ? { id: subjectProto.id, name: subjectProto.name, color: subjectProto.color } : { id: edge.sourceId, name: 'Node', color: '#4A5568' },
      object: objectProto ? { id: objectProto.id, name: objectProto.name, color: objectProto.color } : { id: edge.destinationId, name: 'Node', color: '#4A5568' },
      predicate: predicate ? { id: predicate.id, name: predicate.name, color: predicate.color || '#4A5568' } : { id: 'base-connection-prototype', name: 'Connection', color: '#4A5568' },
      hasLeftArrow: edge.directionality?.arrowsToward?.has(edge.sourceId),
      hasRightArrow: edge.directionality?.arrowsToward?.has(edge.destinationId)
    };
  });

  const handleNodeClick = () => {
    // Always open the naming dialog when clicking the center connection display
    if (onOpenConnectionDialog) {
      onOpenConnectionDialog(lastValidEdge.id);
    }
  };

  const toggleArrowFor = (edgeId, nodeId) => {
    updateEdge(edgeId, (draft) => {
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
    if (selectedEdgeIds && selectedEdgeIds.size > 0) {
      Array.from(selectedEdgeIds).forEach((id) => removeEdge(id));
    } else if (lastValidEdge?.id) {
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

  return (
    <UnifiedBottomControlPanel
      mode="connections"
      isVisible={isVisible}
      typeListOpen={typeListOpen}
      onAnimationComplete={onAnimationComplete}
      className="connection-control-panel"
      triples={triples}
      onToggleLeftArrow={(edgeId) => {
        const e = useGraphStore.getState().edges.get(edgeId);
        if (!e) return;
        toggleArrowFor(edgeId, e.sourceId);
      }}
      onToggleRightArrow={(edgeId) => {
        const e = useGraphStore.getState().edges.get(edgeId);
        if (!e) return;
        toggleArrowFor(edgeId, e.destinationId);
      }}
      onPredicateClick={(edgeId) => onOpenConnectionDialog?.(edgeId)}
      onNodeClick={() => { /* optional: navigate to node */ }}
      onDelete={handleDeleteConnection}
      onAdd={handleAddConnection}
      onUp={handleOpenDefinition}
      onOpenInPanel={handleOpenInPanel}
    />
  );
};

export default ConnectionControlPanel;