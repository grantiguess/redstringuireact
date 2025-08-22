import React, { useState } from 'react';
import SharedPanelContent from './SharedPanelContent.jsx';
import useGraphStore from '../../store/graphStore.js';
import ColorPicker from '../../ColorPicker.jsx';
import PanelColorPickerPortal from '../PanelColorPickerPortal.jsx';

/**
 * Wrapper component that handles data fetching and action binding
 * for both home and node tabs
 */
const PanelContentWrapper = ({ 
  tabType, // 'home' | 'node'
  nodeId = null,
  storeActions,
  onFocusChange,
  onTypeSelect,
  onStartHurtleAnimationFromPanel,
  isUltraSlim = false
}) => {
  const {
    graphs,
    nodePrototypes,
    activeGraphId,
    nodeDefinitionIndices
  } = useGraphStore();

  // Color picker state
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [colorPickerPosition, setColorPickerPosition] = useState({ x: 0, y: 0 });
  const [colorPickerNodeId, setColorPickerNodeId] = useState(null);

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

  // Check if this node is the defining node of the current active graph
  const isDefiningNodeOfCurrentGraph = activeGraphId && graphData && 
    graphData.definingNodeIds && graphData.definingNodeIds.includes(nodeData?.id);

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

  const handleColorPickerOpen = (event) => {
    event.stopPropagation();
    const nodeId = nodeData?.id;
    if (!nodeId) return;
    
    // If already open for the same node, close it (toggle behavior)
    if (colorPickerVisible && colorPickerNodeId === nodeId) {
      setColorPickerVisible(false);
      setColorPickerNodeId(null);
      return;
    }
    
    // Open color picker - align with the icon position
    const rect = event.currentTarget.getBoundingClientRect();
    setColorPickerPosition({ x: rect.right - 10, y: rect.top - 5 });
    setColorPickerNodeId(nodeId);
    setColorPickerVisible(true);
  };

  const handleColorChange = (newColor) => {
    if (colorPickerNodeId && storeActions?.updateNodePrototype) {
      storeActions.updateNodePrototype(colorPickerNodeId, draft => {
        draft.color = newColor;
      });
    }
  };

  const handleColorPickerClose = () => {
    setColorPickerVisible(false);
    setColorPickerNodeId(null);
  };

  const handleOpenNode = (nodeId) => {
    storeActions.openRightPanelNodeTab(nodeId);
  };

  const handleExpandNode = (event) => {
    const nodeId = nodeData?.id;
    if (!nodeId) return;

    // Get the icon's bounding rectangle for the hurtle animation
    const iconRect = event.currentTarget.getBoundingClientRect();

    // Same logic as PieMenu expand but using hurtle animation from panel
    if (nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0) {
      // Node has existing definition(s) - start hurtle animation to first one
      const graphIdToOpen = nodeData.definitionGraphIds[0];
      if (onStartHurtleAnimationFromPanel) {
        onStartHurtleAnimationFromPanel(nodeId, graphIdToOpen, nodeId, iconRect);
      } else if (storeActions?.openGraphTabAndBringToTop) {
        // Fallback if hurtle animation not available
        storeActions.openGraphTabAndBringToTop(graphIdToOpen, nodeId);
      }
    } else {
      // Node has no definitions - create one first, then start hurtle animation
      if (storeActions?.createAndAssignGraphDefinitionWithoutActivation) {
        const sourceGraphId = activeGraphId; // Capture current graph before it changes
        storeActions.createAndAssignGraphDefinitionWithoutActivation(nodeId);
        
        setTimeout(() => {
          const currentState = useGraphStore.getState();
          const updatedNodeData = currentState.nodePrototypes.get(nodeId);
          if (updatedNodeData?.definitionGraphIds?.length > 0) {
            const newGraphId = updatedNodeData.definitionGraphIds[updatedNodeData.definitionGraphIds.length - 1];
            if (onStartHurtleAnimationFromPanel) {
              onStartHurtleAnimationFromPanel(nodeId, newGraphId, nodeId, iconRect);
            }
          }
        }, 50);
      }
    }
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
    <>
      <SharedPanelContent
        nodeData={nodeData}
        graphData={graphData}
        activeGraphNodes={activeGraphNodes}
        nodePrototypes={nodePrototypes}
        onNodeUpdate={handleNodeUpdate}
        onImageAdd={handleImageAdd}
        onColorChange={handleColorPickerOpen}
        onOpenNode={handleOpenNode}
        onExpandNode={handleExpandNode}
        onTypeSelect={handleTypeSelect}
        isHomeTab={tabType === 'home'}
        showExpandButton={true}
      expandButtonDisabled={isDefiningNodeOfCurrentGraph}
        isUltraSlim={isUltraSlim}
      />
      
      {/* Color Picker Component - Rendered in Portal to prevent clipping */}
      <PanelColorPickerPortal
        isVisible={colorPickerVisible}
        onClose={handleColorPickerClose}
        onColorChange={handleColorChange}
        currentColor={colorPickerNodeId && nodePrototypes ? nodePrototypes.get(colorPickerNodeId)?.color || '#8B0000' : '#8B0000'}
        position={colorPickerPosition}
        direction="down-left"
      />
    </>
  );
};

export default PanelContentWrapper;