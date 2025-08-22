import React from 'react';
import SharedPanelContent from './SharedPanelContent.jsx';
import useGraphStore from '../../store/graphStore.js';

/**
 * Wrapper component that handles data fetching and action binding
 * for both home and node tabs
 */
const PanelContentWrapper = ({ 
  tabType, // 'home' | 'node'
  nodeId = null,
  storeActions,
  onFocusChange,
  onTypeSelect
}) => {
  const {
    graphs,
    nodePrototypes,
    activeGraphId,
    nodeDefinitionIndices
  } = useGraphStore();

  // Determine which node data to use based on tab type
  const getNodeData = () => {
    if (tabType === 'home') {
      // For home tab, use the defining node of the active graph
      if (!graphs || !activeGraphId) return null;
      const currentGraph = graphs.get(activeGraphId);
      const definingNodeId = currentGraph?.definingNodeIds?.[0];
      return definingNodeId && nodePrototypes ? nodePrototypes.get(definingNodeId) : null;
    } else if (tabType === 'node' && nodeId && nodePrototypes) {
      // For node tab, use the specific node
      return nodePrototypes.get(nodeId);
    }
    return null;
  };

  // Get graph data
  const getGraphData = () => {
    return graphs && activeGraphId ? graphs.get(activeGraphId) : null;
  };

  // Get nodes for the current context
  const getActiveGraphNodes = () => {
    let targetGraphId = activeGraphId;
    
    // For node tabs, show components from the node's definition graph if it has one
    if (tabType === 'node' && nodeId && nodePrototypes) {
      const nodeData = nodePrototypes.get(nodeId);
      if (nodeData && nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0) {
        // Get the context-specific definition index
        const contextKey = `${nodeId}-${activeGraphId}`;
        const currentIndex = nodeDefinitionIndices?.get(contextKey) || 0;
        targetGraphId = nodeData.definitionGraphIds[currentIndex] || nodeData.definitionGraphIds[0];
      }
    }
    
    if (!graphs) return [];
    const targetGraph = graphs.get(targetGraphId);
    if (!targetGraph || !targetGraph.instances) return [];
    
    // Convert instances to hydrated nodes
    return Array.from(targetGraph.instances.values())
      .map(instance => {
        const prototype = nodePrototypes?.get(instance.prototypeId);
        return prototype ? {
          ...prototype,
          ...instance // Instance data (x, y, scale) overwrites prototype data
        } : null;
      })
      .filter(Boolean);
  };

  const nodeData = getNodeData();
  const graphData = getGraphData();
  const activeGraphNodes = getActiveGraphNodes();

  // Action handlers
  const handleNodeUpdate = (updatedData) => {
    if (nodeData?.id) {
      storeActions.updateNodePrototype(nodeData.id, draft => {
        Object.assign(draft, updatedData);
      });
    }
  };

  const handleImageAdd = (nodeId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        const fullImageSrc = loadEvent.target?.result;
        if (typeof fullImageSrc !== 'string') return;
        
        const img = new Image();
        img.onload = async () => {
          try {
            const aspectRatio = img.naturalHeight / img.naturalWidth || 1;
            const nodeDataToSave = { 
              imageSrc: fullImageSrc, 
              imageAspectRatio: aspectRatio 
            };
            storeActions.updateNodePrototype(nodeId, draft => {
              Object.assign(draft, nodeDataToSave);
            });
          } catch (error) {
            console.error("Image save failed:", error);
          }
        };
        img.src = fullImageSrc;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleColorChange = () => {
    // Color change logic would go here
    console.log('Color change clicked');
  };

  const handleOpenNode = (nodeId) => {
    storeActions.openRightPanelNodeTab(nodeId);
  };

  const handleExpandNode = () => {
    // Expand node logic would go here
    console.log('Expand node clicked');
  };

  const handleTypeSelect = (nodeId) => {
    if (onTypeSelect) {
      onTypeSelect(nodeId);
    }
  };

  if (!nodeData) {
    return (
      <div style={{ padding: '10px', color: '#aaa', fontFamily: "'EmOne', sans-serif" }}>
        {tabType === 'home' ? 'No graph data available...' : 'Node data not found...'}
      </div>
    );
  }

  return (
    <SharedPanelContent
      nodeData={nodeData}
      graphData={graphData}
      activeGraphNodes={activeGraphNodes}
      nodePrototypes={nodePrototypes}
      onNodeUpdate={handleNodeUpdate}
      onImageAdd={handleImageAdd}
      onColorChange={handleColorChange}
      onOpenNode={handleOpenNode}
      onExpandNode={handleExpandNode}
      onTypeSelect={handleTypeSelect}
      isHomeTab={tabType === 'home'}
      showExpandButton={true}
      isUltraSlim={false}
    />
  );
};

export default PanelContentWrapper;