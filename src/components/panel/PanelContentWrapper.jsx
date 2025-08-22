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
  onFocusChange
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
      const currentGraph = graphs.get(activeGraphId);
      const definingNodeId = currentGraph?.definingNodeIds?.[0];
      return definingNodeId ? nodePrototypes.get(definingNodeId) : null;
    } else if (tabType === 'node' && nodeId) {
      // For node tab, use the specific node
      return nodePrototypes.get(nodeId);
    }
    return null;
  };

  // Get graph data
  const getGraphData = () => {
    return graphs.get(activeGraphId);
  };

  // Get nodes for the current graph
  const getActiveGraphNodes = () => {
    const currentGraph = graphs.get(activeGraphId);
    if (!currentGraph || !currentGraph.instances) return [];
    
    // Convert instances to hydrated nodes
    return Array.from(currentGraph.instances.values())
      .map(instance => {
        const prototype = nodePrototypes.get(instance.prototypeId);
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
      onNodeUpdate={handleNodeUpdate}
      onImageAdd={handleImageAdd}
      onColorChange={handleColorChange}
      onOpenNode={handleOpenNode}
      onExpandNode={handleExpandNode}
      isHomeTab={tabType === 'home'}
      showExpandButton={true}
      isUltraSlim={false}
    />
  );
};

export default PanelContentWrapper;