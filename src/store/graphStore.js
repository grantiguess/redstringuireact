import { create } from 'zustand';
import { produce, enableMapSet } from 'immer';
import { v4 as uuidv4 } from 'uuid';
// No longer importing class instances
// import Graph from '../core/Graph';
// import Node from '../core/Node';

// Enable Immer Map/Set plugin support
enableMapSet();

// --- Initial Empty Graph --- 
// Remove or comment out these constants as they are no longer used for initialization
// const INITIAL_GRAPH_ID = uuidv4(); 
// const INITIAL_EMPTY_GRAPH_DATA = { ... };

/**
 * Helper function to convert a Node class instance to plain data.
 * Add any other relevant properties from Node.js.
 */
const nodeToData = (node) => ({
  id: node.getId(),
  name: node.getName(),
  description: node.getDescription(),
  picture: node.getPicture(),
  color: node.getColor(),
  data: node.getData(), // Keep the data payload
  x: node.getX(),
  y: node.getY(),
  scale: node.getScale(),
  imageSrc: node.getImageSrc(),
  thumbnailSrc: node.getThumbnailSrc(),
  imageAspectRatio: node.getImageAspectRatio(),
  parentDefinitionNodeId: node.getParentDefinitionNodeId(),
  edgeIds: [...node.getEdgeIds()], // Store edge IDs connected to this node
  definitionGraphIds: [...node.getDefinitionGraphIds()], // Store definition graph IDs
});

/**
 * Helper function to convert an Edge class instance to plain data.
 */
const edgeToData = (edge) => ({
    id: edge.getId(),
    sourceId: edge.getSourceId(),
    destinationId: edge.getDestinationId(),
    definitionNodeId: edge.getDefinitionNodeId(),
    name: edge.getName(),
    description: edge.getDescription(),
    picture: edge.getPicture(),
    color: edge.getColor(),
    data: edge.getData(),
    directed: edge.isDirected(), // Assuming Edge might have directed property
});

/**
 * Helper function to convert a Graph class instance to plain data.
 */
const graphToData = (graph) => ({
  id: graph.getId(),
  name: graph.getName(),
  description: graph.getDescription(),
  picture: graph.getPicture(),
  color: graph.getColor(),
  directed: graph.isDirected(),
  nodeIds: graph.getNodes().map(n => n.getId()), // Store only Node IDs
  edgeIds: graph.getEdges().map(e => e.getId()), // Store only Edge IDs
});


const useGraphStore = create((set, get) => ({
  // --- State --- (Using plain data objects)
  // Initialize with empty state
  graphs: new Map(), // Initialize with empty graph map
  nodes: new Map(),       // Map<string, NodeData>
  edges: new Map(),       // Map<string, EdgeData> - NEW
  openGraphIds: [],     // Start with no graphs open
  activeGraphId: null,  // Start with no active graph
  rightPanelTabs: [{ type: 'home', isActive: true }], // Initialize with home tab

  // --- Actions --- (Operating on plain data)

  // Loads a Graph instance, converts to data, stores data.
  loadGraph: (graphInstance) => set(produce((draft) => {
    const graphData = graphToData(graphInstance);
    if (!draft.graphs.has(graphData.id)) {
      draft.graphs.set(graphData.id, graphData);

      // Convert and add nodes to global pool
      graphInstance.getNodes().forEach(nodeInstance => {
        const nodeData = nodeToData(nodeInstance);
        if (!draft.nodes.has(nodeData.id)) {
          draft.nodes.set(nodeData.id, nodeData);
        }
      });

       // Convert and add edges to global pool
      graphInstance.getEdges().forEach(edgeInstance => {
          const edgeData = edgeToData(edgeInstance);
          if (!draft.edges.has(edgeData.id)) {
              draft.edges.set(edgeData.id, edgeData);
          }
      });

      // Open graph tab
      if (!draft.openGraphIds.includes(graphData.id)) {
        draft.openGraphIds.push(graphData.id);
      }
      if (draft.activeGraphId === null) {
        draft.activeGraphId = graphData.id;
      }
    }
  })),

  // Adds NEW plain node data to the global pool and a specific graph
  addNode: (graphId, newNodeData) => set(produce((draft) => {
    const graph = draft.graphs.get(graphId);
    const nodeId = newNodeData.id;

    if (!nodeId) {
        console.error("addNode: newNodeData must have an id.");
        return;
    }

    if (graph && !draft.nodes.has(nodeId)) {
      // Add node data to global pool
      draft.nodes.set(nodeId, newNodeData);
      // Add node ID to graph's nodeIds array
      graph.nodeIds.push(nodeId);
      console.log(`[Store addNode] Successfully added node ${nodeId} to graph ${graphId}`); // Log success
    } else if (!graph) {
      console.warn(`addNode: Graph with id ${graphId} not found.`);
    } else {
      console.warn(`addNode: Node with id ${nodeId} already exists in global pool.`);
    }
  })),

  // Updates specific properties of a node
  updateNode: (nodeId, updateFn) => set(produce((draft) => {
    const nodeData = draft.nodes.get(nodeId);
    if (nodeData) {
        // Apply the update function directly to the draft state
        updateFn(nodeData);

        // --- BEGIN FIX ---
        // Also update the corresponding right panel tab's bio if it exists
        const tabIndex = draft.rightPanelTabs.findIndex(tab => tab.nodeId === nodeId);
        if (tabIndex !== -1) {
            // Update the bio using the potentially updated node description
            draft.rightPanelTabs[tabIndex].bio = nodeData.description || '';
        }
        // --- END FIX ---

    } else {
        console.warn(`updateNode: Node ${nodeId} not found.`);
    }
  })),

  // Adds a NEW edge (provided as plain data) to the global pool and a specific graph
  // Note: Expects edge ID to be provided or generated beforehand.
  addEdge: (graphId, newEdgeData) => set(produce((draft) => {
      const graph = draft.graphs.get(graphId);
      const edgeId = newEdgeData.id;
      const sourceId = newEdgeData.sourceId;
      const destId = newEdgeData.destinationId;

      if (!edgeId || !sourceId || !destId) {
          console.error("addEdge: newEdgeData requires id, sourceId, and destinationId.");
          return;
      }

      // Ensure source and dest nodes exist in the specific graph for consistency?
      // Or just check they exist globally?
      const sourceNode = draft.nodes.get(sourceId);
      const destNode = draft.nodes.get(destId);

      if (graph && !draft.edges.has(edgeId) && sourceNode && destNode) {
          // Add edge data to global pool
          draft.edges.set(edgeId, newEdgeData);
          // Add edge ID to graph's edgeIds array
          graph.edgeIds.push(edgeId);
          // Add edge ID to source and destination nodes' edgeIds arrays
          sourceNode.edgeIds.push(edgeId);
          destNode.edgeIds.push(edgeId);
      } else if (!graph) {
          console.warn(`addEdge: Graph ${graphId} not found.`);
      } else if (draft.edges.has(edgeId)) {
          console.warn(`addEdge: Edge ${edgeId} already exists.`);
      } else if (!sourceNode || !destNode) {
          console.warn(`addEdge: Source node ${sourceId} or destination node ${destId} not found.`);
          // Decide if edge should still be added if nodes don't exist
      }
  })),

  // Removes a node and its connected edges from global pools and graph references
  removeNode: (nodeId) => set(produce((draft) => {
    const nodeToRemove = draft.nodes.get(nodeId);
    if (nodeToRemove) {
      // 1. Get IDs of edges connected to the node *before* deleting the node
      const connectedEdgeIds = [...nodeToRemove.edgeIds]; // Copy array

      // 2. Delete the node from the global pool
      draft.nodes.delete(nodeId);

      // 3. Remove the node ID from all graphs that contain it
      draft.graphs.forEach(graph => {
        const index = graph.nodeIds.indexOf(nodeId);
        if (index > -1) {
          graph.nodeIds.splice(index, 1);
        }
        // Also remove associated edge IDs from the graph's list
        graph.edgeIds = graph.edgeIds.filter(id => !connectedEdgeIds.includes(id));
      });

      // 4. Delete the connected edges from the global edge pool
      connectedEdgeIds.forEach(edgeId => {
          draft.edges.delete(edgeId);
      });

      // 5. Remove references to deleted edges from *other* nodes
      draft.nodes.forEach(node => {
          node.edgeIds = node.edgeIds.filter(id => !connectedEdgeIds.includes(id));
      });

    } else {
      console.warn(`removeNode: Node with id ${nodeId} not found.`);
    }
  })),

  // Removes an edge from the global pool and relevant graph/node references
  removeEdge: (edgeId) => set(produce((draft) => {
      const edgeToRemove = draft.edges.get(edgeId);
      if (edgeToRemove) {
          const { sourceId, destinationId } = edgeToRemove;

          // 1. Delete edge from global pool
          draft.edges.delete(edgeId);

          // 2. Remove edge ID from the graph(s) that contain it
          draft.graphs.forEach(graph => {
              const index = graph.edgeIds.indexOf(edgeId);
              if (index > -1) {
                  graph.edgeIds.splice(index, 1);
              }
          });

          // 3. Remove edge ID from source node's edgeIds
          const sourceNode = draft.nodes.get(sourceId);
          if (sourceNode) {
              const index = sourceNode.edgeIds.indexOf(edgeId);
              if (index > -1) {
                  sourceNode.edgeIds.splice(index, 1);
              }
          }

          // 4. Remove edge ID from destination node's edgeIds
          const destNode = draft.nodes.get(destinationId);
          if (destNode) {
              const index = destNode.edgeIds.indexOf(edgeId);
              if (index > -1) {
                  destNode.edgeIds.splice(index, 1);
              }
          }
      } else {
          console.warn(`removeEdge: Edge with id ${edgeId} not found.`);
      }
  })),

  // --- Tab Management Actions --- (Unaffected)
  openGraphTab: (graphId) => set(produce((draft) => {
    if (draft.graphs.has(graphId) && !draft.openGraphIds.includes(graphId)) {
      draft.openGraphIds.push(graphId);
    }
  })),

  closeGraphTab: (graphId) => set(produce((draft) => {
    draft.openGraphIds = draft.openGraphIds.filter(id => id !== graphId);
    if (draft.activeGraphId === graphId) {
      draft.activeGraphId = draft.openGraphIds.length > 0 ? draft.openGraphIds[0] : null;
    }
  })),

  setActiveGraphTab: (graphId) => set(produce((draft) => {
    if (graphId === null) {
         draft.activeGraphId = null;
         return;
    }
    if (draft.openGraphIds.includes(graphId)) {
      draft.activeGraphId = graphId;
    } else if (draft.graphs.has(graphId)) {
         console.warn(`Graph ${graphId} exists but is not open. Cannot set as active tab.`);
    } else {
       console.warn(`Cannot set active tab: Graph with id ${graphId} not found or not open.`);
    }
  })),

  // Creates a new, empty graph and sets it as active
  createNewGraph: (initialData = {}) => set(produce((draft) => {
    const newGraphId = uuidv4();
    const newGraphName = initialData.name || "New Thing";

    const newGraphData = {
        id: newGraphId,
        name: newGraphName,
        description: initialData.description || '',
        picture: initialData.picture || null,
        color: initialData.color || '#ccc', // Default color
        directed: initialData.directed !== undefined ? initialData.directed : false, // Default undirected
        nodeIds: [],
        edgeIds: [],
    };

    draft.graphs.set(newGraphId, newGraphData);
    draft.activeGraphId = newGraphId; // Set the new graph as active

    // Optionally open it automatically (if using openGraphIds)
    if (!draft.openGraphIds.includes(newGraphId)) {
        draft.openGraphIds.push(newGraphId);
    }
    
    console.log('[Store] Created and activated new graph:', newGraphId, newGraphName);
    // Return the ID (though set() doesn't directly return it, caller can read state after)
    // No explicit return needed here, state is updated via Immer
  })),

  // Sets the currently active graph tab.
  setActiveGraph: (graphId) => set(produce((draft) => {
      if (draft.graphs.has(graphId)) { // Ensure the graph exists
          if (draft.openGraphIds.includes(graphId)) { // Ensure it's an open graph
            draft.activeGraphId = graphId;
          } else {
              console.warn(`setActiveGraph: Graph ${graphId} is not open.`);
              // Optionally open it here: draft.openGraphIds.push(graphId);
              // draft.activeGraphId = graphId;
          }
      } else {
          console.warn(`setActiveGraph: Graph ${graphId} not found.`);
      }
  })),

  // Updates specific properties of a graph
  updateGraph: (graphId, updateFn) => set(produce((draft) => {
      const graphData = draft.graphs.get(graphId);
      if (graphData) {
          // Apply the update function directly to the draft state
          updateFn(graphData);
          // Immer will handle the update, no need to set it back manually
          // const updatedGraphData = updateFn(graphData);
          // draft.graphs.set(graphId, updatedGraphData);
      } else {
          console.warn(`updateGraph: Graph ${graphId} not found.`);
      }
  })),

  // --- Right Panel Tab Management Actions ---
  openRightPanelNodeTab: (nodeId) => set(produce((draft) => {
    // Find node data to get the title
    const nodeData = draft.nodes.get(nodeId);
    if (!nodeData) {
      console.warn(`openRightPanelNodeTab: Node with id ${nodeId} not found.`);
      return;
    }
    
    // Check if tab already exists
    const existingTabIndex = draft.rightPanelTabs.findIndex(tab => 
      tab.type === 'node' && tab.nodeId === nodeId
    );
    
    // Set all tabs to inactive
    draft.rightPanelTabs.forEach(tab => { tab.isActive = false; });
    
    if (existingTabIndex > -1) {
      // Tab exists, just activate it
      draft.rightPanelTabs[existingTabIndex].isActive = true;
    } else {
      // Create new tab
      draft.rightPanelTabs.push({
        type: 'node',
        nodeId,
        title: nodeData.name,
        isActive: true
      });
    }
  })),
  
  activateRightPanelTab: (index) => set(produce((draft) => {
    if (index < 0 || index >= draft.rightPanelTabs.length) {
      console.warn(`activateRightPanelTab: Tab index ${index} out of bounds.`);
      return;
    }
    
    // Set all tabs to inactive, then activate the selected tab
    draft.rightPanelTabs.forEach(tab => { tab.isActive = false; });
    draft.rightPanelTabs[index].isActive = true;
  })),
  
  closeRightPanelTab: (index) => set(produce((draft) => {
    if (index <= 0 || index >= draft.rightPanelTabs.length) {
      console.warn(`closeRightPanelTab: Tab index ${index} out of bounds or is home tab.`);
      return;
    }
    
    const wasActive = draft.rightPanelTabs[index].isActive;
    
    // Remove the tab
    draft.rightPanelTabs.splice(index, 1);
    
    // If the closed tab was active, activate the home tab
    if (wasActive) {
      draft.rightPanelTabs[0].isActive = true;
    }
  })),
  
  moveRightPanelTab: (dragIndex, hoverIndex) => set(produce((draft) => {
    // Convert to absolute indices (drag and hover are 0-based from the UI but we need to add 1 for the home tab)
    const sourceDragIndex = dragIndex + 1;
    const sourceHoverIndex = hoverIndex + 1;
    
    if (sourceDragIndex <= 0 || sourceHoverIndex <= 0 || 
        sourceDragIndex >= draft.rightPanelTabs.length || sourceHoverIndex >= draft.rightPanelTabs.length) {
      console.warn(`moveRightPanelTab: Invalid indices drag=${sourceDragIndex}, hover=${sourceHoverIndex}`);
      return;
    }
    
    // Move the tab
    const [movedTab] = draft.rightPanelTabs.splice(sourceDragIndex, 1);
    draft.rightPanelTabs.splice(sourceHoverIndex, 0, movedTab);
  })),

}));

// --- Selectors --- (Return plain data, add edge selector)

export const getGraphDataById = (id) => (state) => state.graphs.get(id);
export const getNodeDataById = (id) => (state) => state.nodes.get(id);
export const getEdgeDataById = (id) => (state) => state.edges.get(id); // New selector

export const getActiveGraphData = (state) => state.graphs.get(state.activeGraphId);

// Returns NodeData objects for a given graph ID
export const getNodesForGraph = (graphId) => (state) => {
  const graph = state.graphs.get(graphId);
  if (!graph) return [];
  return graph.nodeIds.map(nodeId => state.nodes.get(nodeId)).filter(Boolean); // Filter out undefined if node missing
};

// Returns EdgeData objects for a given graph ID
export const getEdgesForGraph = (graphId) => (state) => {
    const graph = state.graphs.get(graphId);
    if (!graph) return [];
    return graph.edgeIds.map(edgeId => state.edges.get(edgeId)).filter(Boolean);
};

// Returns NodeData objects by parentDefinitionNodeId
export const getNodesByParent = (parentId) => (state) => {
    const nodes = [];
    for (const nodeData of state.nodes.values()) {
        if (nodeData.parentDefinitionNodeId === parentId) {
            nodes.push(nodeData);
        }
    }
    return nodes;
};

// Returns the graph name (title)
export const getGraphTitleById = (graphId) => (state) => {
    const graphData = state.graphs.get(graphId);
    return graphData?.name || null; // Return name directly from data
};

export const getOpenGraphIds = (state) => state.openGraphIds;
export const getActiveGraphId = (state) => state.activeGraphId;

// Export the store hook
export default useGraphStore; 