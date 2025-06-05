import { create } from 'zustand';
import { produce, enableMapSet } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import { NODE_WIDTH, NODE_HEIGHT, NODE_DEFAULT_COLOR } from '../constants'; // <<< Import node dimensions
import { initializeFileStorage, saveToFile, getFileStatus, restoreLastSession, clearSession } from './fileStorage.js';
// No longer importing class instances
// import Graph from '../core/Graph';
// import Node from '../core/Node';

// Enable Immer Map/Set plugin support
enableMapSet();

// --- Serialization Helpers ---
const serializeMap = (map) => JSON.stringify(Array.from(map.entries()));
const deserializeMap = (jsonString) => {
  try {
    if (!jsonString) return new Map();
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) return new Map();
    // Ensure entries are valid key-value pairs
    const validEntries = parsed.filter(entry => Array.isArray(entry) && entry.length === 2);
    return new Map(validEntries);
  } catch (error) {
    // console.error("Error deserializing Map:", error);
    return new Map(); // Return empty map on error
  }
};

const serializeSet = (set) => JSON.stringify(Array.from(set));
const deserializeSet = (jsonString) => {
    if (!jsonString) return new Set();
  try {
    const arr = JSON.parse(jsonString);
    return new Set(arr);
  } catch (e) {
    // console.error("Error deserializing Set from JSON:", e);
    return new Set(); // Return empty set on error
  }
};

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

// --- Load Initial State from localStorage --- 
const loadInitialSavedNodes = () => {
    const saved = localStorage.getItem('savedNodeIds');
    if (saved) {
    // console.log("[Store Init] Loaded savedNodeIds from localStorage:", saved);
    return deserializeSet(saved);
  }
  // console.log("[Store Init] No savedNodeIds in localStorage, starting with empty set.");
  return new Set();
};

const loadInitialSavedGraphs = () => {
    const saved = localStorage.getItem('savedGraphIds');
    if (saved) {
    // console.log("[Store Init] Loaded savedGraphIds from localStorage:", saved);
    return deserializeSet(saved);
  }
  // console.log("[Store Init] No savedGraphIds in localStorage, starting with empty set.");
  return new Set();
};

const loadInitialNodes = () => {
  // console.log('[Store Init] Attempting to load nodes map...');
  const map = deserializeMap(localStorage.getItem('nodesMap'));
  // console.log(`[Store Init] Loaded ${map.size} nodes.`);
  return map;
};
const loadInitialGraphs = () => {
  // console.log('[Store Init] Attempting to load graphs map...');
  const map = deserializeMap(localStorage.getItem('graphsMap'));
  // console.log(`[Store Init] Loaded ${map.size} graphs.`);
  return map;
};

// --- Load Initial Open Graphs from localStorage --- 
const loadInitialOpenGraphs = () => {
  const storedOpenGraphs = localStorage.getItem('openGraphIds');
  if (storedOpenGraphs) {
    try {
      const parsed = JSON.parse(storedOpenGraphs);
      // console.log("[Store Init] Loaded and parsed openGraphIds from localStorage:", parsed);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // console.error("[Store Init] Error parsing openGraphIds from localStorage:", e);
      return [];
  }
  }
  // console.log("[Store Init] No openGraphIds in localStorage, starting with an empty array.");
  return [];
};

// --- Load Initial Active Graph ID from localStorage --- 
const loadInitialActiveGraphId = (validOpenGraphIds) => {
  const storedActiveGraphId = localStorage.getItem('activeGraphId');
  if (storedActiveGraphId && validOpenGraphIds.includes(storedActiveGraphId)) {
    // console.log("[Store Init] Loaded activeGraphId from localStorage:", storedActiveGraphId);
    return storedActiveGraphId;
  } else if (validOpenGraphIds.length > 0) {
    // console.log("[Store Init] No valid activeGraphId in localStorage, using first open graph:", validOpenGraphIds[0]);
    return validOpenGraphIds[0];
  }
  // console.log("[Store Init] No activeGraphId and no open graphs, activeGraphId will be null.");
  return null;
};

// --- Load Initial Active Definition Node ID from localStorage ---
const loadInitialActiveDefinitionNodeId = (nodesMap) => {
  const storedActiveDefinitionNodeId = localStorage.getItem('activeDefinitionNodeId');
  if (storedActiveDefinitionNodeId) {
    // Validate if this node ID still exists in the loaded nodesMap
    if (nodesMap.has(storedActiveDefinitionNodeId)) {
      // console.log("[Store Init] Loaded and validated activeDefinitionNodeId from localStorage:", storedActiveDefinitionNodeId);
      return storedActiveDefinitionNodeId;
    }
    // console.log("[Store Init] Loaded activeDefinitionNodeId from localStorage but it's no longer valid (not in nodesMap). Resetting.");
    }
  // console.log("[Store Init] No activeDefinitionNodeId in localStorage or it was invalid, starting with null.");
  return null;
};

// --- Load Initial Expanded Graphs from localStorage ---
const loadInitialExpandedGraphIds = () => {
  const storedExpandedGraphIds = localStorage.getItem('expandedGraphIds');
  if (storedExpandedGraphIds) {
    try {
      const parsed = JSON.parse(storedExpandedGraphIds);
      // console.log("[Store Init] Loaded and parsed expandedGraphIds from localStorage:", parsed);
      return new Set(Array.isArray(parsed) ? parsed : []); // Return as Set
    } catch (e) {
      // console.error("[Store Init] Error parsing expandedGraphIds from localStorage:", e);
      return new Set();
    }
  }
  // console.log("[Store Init] No expandedGraphIds in localStorage, starting with an empty Set.");
  return new Set();
};

// Create store with async initialization
const useGraphStore = create((set, get) => {
  // Return both initial state and actions
  return {
    // Initialize with empty state - will be loaded from file
    graphs: new Map(),
    nodes: new Map(),
    edges: new Map(),
    openGraphIds: [],
    activeGraphId: null,
    activeDefinitionNodeId: null, 
    rightPanelTabs: [{ type: 'home', isActive: true }], 
    expandedGraphIds: new Set(),
    savedNodeIds: loadInitialSavedNodes(),
    savedGraphIds: loadInitialSavedGraphs(),
    
    // File storage state
    isFileLoaded: false,
    fileLoadingError: null,

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
        // console.error("addNode: newNodeData must have an id.");
        return;
    }

    if (graph && !draft.nodes.has(nodeId)) {
      // Check if this graph is a definition graph (has definingNodeIds)
      if (graph.definingNodeIds && graph.definingNodeIds.length > 0) {
        // Set the parentDefinitionNodeId to the first defining node
        const definingNodeId = graph.definingNodeIds[0];
        // console.log(`[Store addNode] Setting parentDefinitionNodeId to ${definingNodeId} for node ${nodeId} in definition graph ${graphId}`);
        newNodeData.parentDefinitionNodeId = definingNodeId;
      }
      
      // Add node data to global pool
      draft.nodes.set(nodeId, newNodeData);
      // Add node ID to graph's nodeIds array
      graph.nodeIds.push(nodeId);
      // console.log(`[Store addNode] Successfully added node ${nodeId} to graph ${graphId}`); // Log success
    } else if (!graph) {
      // console.warn(`addNode: Graph with id ${graphId} not found.`);
    } else {
      // console.warn(`addNode: Node with id ${nodeId} already exists in global pool.`);
    }
  })),

  // Update a node's data using Immer's recipe
  updateNode: (nodeId, recipe) => set(produce((draft) => {
    const node = draft.nodes.get(nodeId);
    if (node) {
      const originalName = node.name; // Store original name
      recipe(node); // Apply the Immer updates
      
      // Check if the name was changed and sync to definition graphs
      const newName = node.name;
      if (newName !== originalName && Array.isArray(node.definitionGraphIds)) {
        // console.log(`[Store updateNode] Node ${nodeId} name changed from "${originalName}" to "${newName}". Syncing definition graph names.`);
        // Update all graphs that this node defines
        for (const graphId of node.definitionGraphIds) {
          const graph = draft.graphs.get(graphId);
          if (graph) {
            // console.log(`[Store updateNode] Updating graph ${graphId} name to match node.`);
            graph.name = newName;
          }
        }
        
        // NEW: Also sync corresponding nodes across different definition graphs of the same parent node
        if (node.parentDefinitionNodeId) {
          // console.log(`[Store updateNode] Node ${nodeId} has parent ${node.parentDefinitionNodeId}. Syncing across definition graphs.`);
          
          // Find which graph this node currently belongs to
          let currentGraphId = null;
          for (const [graphId, graph] of draft.graphs.entries()) {
            if (graph.nodeIds.includes(nodeId)) {
              currentGraphId = graphId;
              break;
            }
          }
          
          // Get the parent node that this node belongs to
          const parentNode = draft.nodes.get(node.parentDefinitionNodeId);
          if (parentNode && Array.isArray(parentNode.definitionGraphIds)) {
            // console.log(`[Store updateNode] Parent node ${node.parentDefinitionNodeId} has ${parentNode.definitionGraphIds.length} definition graphs.`);
            
            // For each definition graph of the parent node
            for (const parentGraphId of parentNode.definitionGraphIds) {
              if (parentGraphId === currentGraphId) continue; // Skip the current graph
              
              const parentGraph = draft.graphs.get(parentGraphId);
              if (parentGraph) {
                // console.log(`[Store updateNode] Checking definition graph ${parentGraphId} for corresponding nodes.`);
                
                // Find nodes in this definition graph that have the same name as the original node name
                for (const nodeIdInGraph of parentGraph.nodeIds) {
                  const nodeInGraph = draft.nodes.get(nodeIdInGraph);
                  if (nodeInGraph && nodeInGraph.name === originalName) {
                    // console.log(`[Store updateNode] Found corresponding node ${nodeIdInGraph} in graph ${parentGraphId}, updating name to "${newName}".`);
                    nodeInGraph.name = newName;
                    
                    // Also update any definition graphs that this corresponding node defines
                    if (Array.isArray(nodeInGraph.definitionGraphIds)) {
                      for (const correspondingGraphId of nodeInGraph.definitionGraphIds) {
                        const correspondingGraph = draft.graphs.get(correspondingGraphId);
                        if (correspondingGraph) {
                          // console.log(`[Store updateNode] Updating corresponding node's graph ${correspondingGraphId} name to match.`);
                          correspondingGraph.name = newName;
                        }
                      }
                    }
                    
                    // Update the corresponding node's tab title if it's open in the right panel
                    const correspondingTabIndex = draft.rightPanelTabs.findIndex(tab => tab.nodeId === nodeIdInGraph);
                    if (correspondingTabIndex !== -1) {
                      draft.rightPanelTabs[correspondingTabIndex].title = newName;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      // console.warn(`updateNode: Node with id ${nodeId} not found.`);
    }
  })),

  // Update positions of multiple nodes efficiently
  updateMultipleNodePositions: (updates) => set(produce((draft) => {
    updates.forEach(({ nodeId, x, y }) => {
      const node = draft.nodes.get(nodeId);
      if (node) {
        node.x = x;
        node.y = y;
      } else {
        // console.warn(`updateMultipleNodePositions: Node with id ${nodeId} not found.`);
      }
    });
  })),

  // Adds a NEW edge (provided as plain data) to the global pool and a specific graph
  // Note: Expects edge ID to be provided or generated beforehand.
  addEdge: (graphId, newEdgeData) => set(produce((draft) => {
      const graph = draft.graphs.get(graphId);
      const edgeId = newEdgeData.id;
      const sourceId = newEdgeData.sourceId;
      const destId = newEdgeData.destinationId;

      if (!edgeId || !sourceId || !destId) {
          // console.error("addEdge: newEdgeData requires id, sourceId, and destinationId.");
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
          // console.warn(`addEdge: Graph ${graphId} not found.`);
      } else if (draft.edges.has(edgeId)) {
          // console.warn(`addEdge: Edge ${edgeId} already exists.`);
      } else if (!sourceNode || !destNode) {
          // console.warn(`addEdge: Source node ${sourceId} or destination node ${destId} not found.`);
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
      // console.warn(`removeNode: Node with id ${nodeId} not found.`);
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
  openGraphTab: (graphId, definitionNodeId = null) => set(produce((draft) => {
    console.log(`[Store openGraphTab] Called with graphId: ${graphId}, definitionNodeId: ${definitionNodeId}`);
    if (draft.graphs.has(graphId)) { // Ensure graph exists
      // Add to open list if not already there
      if (!draft.openGraphIds.includes(graphId)) {
      draft.openGraphIds.push(graphId);
      }
      // Set this graph as the active one
      draft.activeGraphId = graphId;
      console.log(`[Store openGraphTab] Set activeGraphId to: ${graphId}`);

      // Set the definition node ID if provided
      if (definitionNodeId) {
        console.log(`[Store openGraphTab] Setting activeDefinitionNodeId to: ${definitionNodeId}`);
        draft.activeDefinitionNodeId = definitionNodeId;
      } else {
        // If opening a graph tab without a specific definition node, clear the active definition node
        console.log(`[Store openGraphTab] No definitionNodeId provided, clearing activeDefinitionNodeId.`);
        draft.activeDefinitionNodeId = null;
      }
      
      // <<< ADD: Ensure the opened graph is expanded in the list >>>
      draft.expandedGraphIds.add(graphId);
      console.log(`[Store openGraphTab] Added ${graphId} to expanded set.`);

    } else {
      console.warn(`[Store openGraphTab] Graph ${graphId} not found.`);
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
    console.log('[Store createNewGraph] Creating new empty graph');
    const newGraphId = uuidv4();
    const newGraphName = initialData.name || "New Thing";

    // Create a new empty graph (no circular references)
    const newGraphData = {
        id: newGraphId,
        name: newGraphName,
        description: initialData.description || '',
        picture: initialData.picture || null,
        color: initialData.color || '#ccc', // Default color
        directed: initialData.directed !== undefined ? initialData.directed : false, // Default undirected
        nodeIds: [],
        edgeIds: [],
        definingNodeIds: [] // Empty - this graph is not defined by any node initially
    };
    draft.graphs.set(newGraphId, newGraphData);

    // Set active state (no definition node since this is just an empty graph)
    draft.activeGraphId = newGraphId;
    draft.activeDefinitionNodeId = null; // Clear definition node since this is not a definition graph

    // Manage open/expanded lists
    if (!draft.openGraphIds.includes(newGraphId)) {
        draft.openGraphIds.unshift(newGraphId);
    }
    draft.expandedGraphIds.add(newGraphId);
    
    console.log('[Store] Created and activated new empty graph:', newGraphId, newGraphName);
  })),

  // Creates a new graph and assigns it as a definition for a given node
  createAndAssignGraphDefinition: (nodeId) => set(produce((draft) => {
    const nodeData = draft.nodes.get(nodeId);
    if (!nodeData) {
      console.warn(`[Store createAndAssignGraphDefinition] Node ${nodeId} not found.`);
      return;
    }

    // Create a new graph, named after the node
    const newGraphId = uuidv4();
    const newGraphName = nodeData.name || "Untitled Definition";
    const newGraphData = {
      id: newGraphId,
      name: newGraphName,
      description: '',
      picture: null,
      color: '#ccc',
      directed: false,
      nodeIds: [],
      edgeIds: [],
      definingNodeIds: [nodeId] // <<< FIX: Link existing node to new graph >>>
    };
    draft.graphs.set(newGraphId, newGraphData);
    console.log(`[Store createAndAssignGraphDefinition] Created new graph ${newGraphId} for node ${nodeId}`);

    // Assign the new graph ID to the node's definitions
    if (!Array.isArray(nodeData.definitionGraphIds)) {
      nodeData.definitionGraphIds = [];
    }
    // Check if it's already defined (shouldn't happen with new graph, but safe)
    if (!nodeData.definitionGraphIds.includes(newGraphId)) {
        nodeData.definitionGraphIds.push(newGraphId);
    }
    console.log(`[Store createAndAssignGraphDefinition] Assigned graph ${newGraphId} to node ${nodeId}`);

    // Make the new graph active and set the defining node
    draft.activeGraphId = newGraphId;
    draft.activeDefinitionNodeId = nodeId;
    console.log(`[Store createAndAssignGraphDefinition] Set active graph to ${newGraphId} and definition node to ${nodeId}`);

    // Ensure the new graph is in the open list
    if (!draft.openGraphIds.includes(newGraphId)) {
      draft.openGraphIds.unshift(newGraphId); // Add to front
    }
    draft.expandedGraphIds.add(newGraphId); // Expand it in the list
  })),

  // Sets the currently active graph tab.
  setActiveGraph: (graphId) => {
    console.log(`[Store Action] setActiveGraph called with: ${graphId}`);
    set((state) => {
      const targetGraph = state.graphs.get(graphId);

      // Check if the graph exists and is open
      if (targetGraph && state.openGraphIds.includes(graphId)) {
        console.log(`[Store Action] Setting active graph: ${graphId}`);
        // Determine the corresponding activeDefinitionNodeId
        const newActiveDefinitionNodeId = targetGraph.definingNodeIds?.[0] || null;
        console.log(`[Store Action] Setting activeDefinitionNodeId to: ${newActiveDefinitionNodeId}`);
        return { 
          activeGraphId: graphId,
          activeDefinitionNodeId: newActiveDefinitionNodeId 
        };
      } else {
        console.warn(`[Store Action] setActiveGraph: Graph ID ${graphId} not found or not open.`);
        // Fallback: Activate the first open graph if the target isn't valid
        if (state.openGraphIds.length > 0) {
          const fallbackGraphId = state.openGraphIds[0];
          const fallbackGraph = state.graphs.get(fallbackGraphId);
          const fallbackDefNodeId = fallbackGraph?.definingNodeIds?.[0] || null;
          console.log(`[Store Action] Fallback: Setting active graph to ${fallbackGraphId} and def node to ${fallbackDefNodeId}`);
          return { 
            activeGraphId: fallbackGraphId,
            activeDefinitionNodeId: fallbackDefNodeId
           };
        } else {
          console.log(`[Store Action] Fallback: No graphs open, setting activeGraphId and activeDefinitionNodeId to null.`);
          return { activeGraphId: null, activeDefinitionNodeId: null }; // No graphs open
        }
      }
    });
  },

  // Updates specific properties of a graph
  updateGraph: (graphId, updateFn) => set(produce((draft) => {
      const graphData = draft.graphs.get(graphId);
      if (graphData) {
          const originalName = graphData.name; // Store original name
          // Apply the update function directly to the draft state
          updateFn(graphData);
          // Immer will handle the update, no need to set it back manually

          // Check if the name was changed
          const newName = graphData.name;
          if (newName !== originalName) {
            console.log(`[Store updateGraph] Graph ${graphId} name changed from "${originalName}" to "${newName}". Syncing defining node name.`);
            // Find the corresponding definition node(s) and update their names
            for (const node of draft.nodes.values()) {
              if (Array.isArray(node.definitionGraphIds) && node.definitionGraphIds.includes(graphId)) {
                console.log(`[Store updateGraph] Updating node ${node.id} name to match graph.`);
                node.name = newName;
                // Also update the node's tab title if it's open in the right panel
                const tabIndex = draft.rightPanelTabs.findIndex(tab => tab.nodeId === node.id);
                if (tabIndex !== -1) {
                  draft.rightPanelTabs[tabIndex].title = newName;
                }
                
                // NEW: Also sync corresponding nodes across different definition graphs of the same parent node
                if (node.parentDefinitionNodeId) {
                  console.log(`[Store updateGraph] Node ${node.id} has parent ${node.parentDefinitionNodeId}. Syncing across definition graphs.`);
                  
                  // Get the parent node that this node belongs to
                  const parentNode = draft.nodes.get(node.parentDefinitionNodeId);
                  if (parentNode && Array.isArray(parentNode.definitionGraphIds)) {
                    console.log(`[Store updateGraph] Parent node ${node.parentDefinitionNodeId} has ${parentNode.definitionGraphIds.length} definition graphs.`);
                    
                    // For each definition graph of the parent node
                    for (const parentGraphId of parentNode.definitionGraphIds) {
                      if (parentGraphId === graphId) continue; // Skip the current graph
                      
                      const parentGraph = draft.graphs.get(parentGraphId);
                      if (parentGraph) {
                        console.log(`[Store updateGraph] Checking definition graph ${parentGraphId} for corresponding nodes.`);
                        
                        // Find nodes in this definition graph that have the same name as the original node name
                        for (const nodeIdInGraph of parentGraph.nodeIds) {
                          const nodeInGraph = draft.nodes.get(nodeIdInGraph);
                          if (nodeInGraph && nodeInGraph.name === originalName) {
                            console.log(`[Store updateGraph] Found corresponding node ${nodeIdInGraph} in graph ${parentGraphId}, updating name to "${newName}".`);
                            nodeInGraph.name = newName;
                            
                            // Also update any definition graphs that this corresponding node defines
                            if (Array.isArray(nodeInGraph.definitionGraphIds)) {
                              for (const correspondingGraphId of nodeInGraph.definitionGraphIds) {
                                const correspondingGraph = draft.graphs.get(correspondingGraphId);
                                if (correspondingGraph) {
                                  console.log(`[Store updateGraph] Updating corresponding node's graph ${correspondingGraphId} name to match.`);
                                  correspondingGraph.name = newName;
                                }
                              }
                            }
                            
                            // Update the corresponding node's tab title if it's open in the right panel
                            const correspondingTabIndex = draft.rightPanelTabs.findIndex(tab => tab.nodeId === nodeIdInGraph);
                            if (correspondingTabIndex !== -1) {
                              draft.rightPanelTabs[correspondingTabIndex].title = newName;
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
      } else {
          console.warn(`updateGraph: Graph ${graphId} not found.`);
      }
  })),

  // --- Right Panel Tab Management Actions ---
  openRightPanelNodeTab: (nodeId, nodeNameFallback = 'Node Details') => set(produce((draft) => {
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
        title: nodeData.name || nodeNameFallback,
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
  
  closeRightPanelTab: (nodeIdToClose) => set(produce((draft) => {
    // Find the index of the tab with the matching nodeId
    const index = draft.rightPanelTabs.findIndex(tab => tab.nodeId === nodeIdToClose);

    // Check if found and it's not the home tab (index 0)
    if (index === -1 || index === 0) { 
      console.warn(`closeRightPanelTab: Tab with node ID ${nodeIdToClose} not found or is home tab.`);
      return;
    }
    
    const wasActive = draft.rightPanelTabs[index].isActive;
    
    // Remove the tab
    draft.rightPanelTabs.splice(index, 1);
    
    // If the closed tab was active, activate the home tab
    if (wasActive && draft.rightPanelTabs.length > 0) {
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

  closeGraph: (graphId) => set(produce((draft) => {
    console.log(`[Store closeGraph] Called with graphId: ${graphId}`);
    const index = draft.openGraphIds.indexOf(graphId);
    if (index === -1) {
      console.warn(`[Store closeGraph] Graph ID ${graphId} not found in openGraphIds.`);
      return; // Graph not open, nothing to close
    }

    const wasActive = draft.activeGraphId === graphId;
    let newActiveId = draft.activeGraphId;

    // Remove the graph ID from the list
    draft.openGraphIds.splice(index, 1);

    // Determine the new active graph ONLY if the closed one was active
    if (wasActive) {
      if (draft.openGraphIds.length === 0) {
        // No graphs left
        newActiveId = null;
      } else if (index > 0) {
        // There was a graph above the closed one, try to activate it
        // Note: The index before splicing corresponds to the item now *at* index-1
        newActiveId = draft.openGraphIds[index - 1]; 
      } else {
        // Closed the first graph (index 0), activate the new first graph
        newActiveId = draft.openGraphIds[0];
      }
    }

    // Set the new active ID
    draft.activeGraphId = newActiveId;
    if (draft.activeGraphId === null) {
      console.log('[Store closeGraph] Active graph became null, setting activeDefinitionNodeId to null');
      draft.activeDefinitionNodeId = null;
    }

    // <<< Also remove from expanded set if closed >>>
    draft.expandedGraphIds.delete(graphId);
    
    // Schedule cleanup after closing a graph
    console.log(`[Store closeGraph] Graph ${graphId} closed, scheduling cleanup...`);
    setTimeout(() => {
      const currentState = get();
      currentState.cleanupOrphanedData();
    }, 100);
  })),

  // <<< Add action to toggle expanded state >>>
  toggleGraphExpanded: (graphId) => set(produce((draft) => {
    console.log(`[Store toggleGraphExpanded] Called for ${graphId}. Current state:`, new Set(draft.expandedGraphIds)); // <<< Log entry
    if (draft.expandedGraphIds.has(graphId)) {
      draft.expandedGraphIds.delete(graphId);
      console.log(`[Store toggleGraphExpanded] Removed ${graphId}. New state:`, new Set(draft.expandedGraphIds)); // <<< Log after delete
    } else {
      draft.expandedGraphIds.add(graphId);
      console.log(`[Store toggleGraphExpanded] Added ${graphId}. New state:`, new Set(draft.expandedGraphIds)); // <<< Log after add
    }
  })),

  // Toggle node bookmark status in savedNodeIds set
  toggleSavedNode: (nodeId) => set(produce((draft) => {
    const wasRemoved = draft.savedNodeIds.has(nodeId);
    if (wasRemoved) {
      draft.savedNodeIds.delete(nodeId);
    } else {
      draft.savedNodeIds.add(nodeId);
    }
    // Replace with a new Set instance to ensure reference change
    draft.savedNodeIds = new Set(draft.savedNodeIds);
    
    // If we removed a saved node, trigger cleanup after a short delay
    if (wasRemoved) {
      console.log(`[Store toggleSavedNode] Node ${nodeId} was unsaved, scheduling cleanup...`);
      // Use setTimeout to trigger cleanup after the current state update completes
      setTimeout(() => {
        const currentState = get();
        currentState.cleanupOrphanedData();
      }, 100);
    }
  })),

  // Toggle graph bookmark status by saving/unsaving its defining node
  toggleSavedGraph: (graphId) => set(produce((draft) => {
    const graph = draft.graphs.get(graphId);
    if (!graph) {
      console.warn(`[Store toggleSavedGraph] Graph ${graphId} not found.`);
      return;
    }
    
    // Get the defining node ID (the node this graph defines)
    let definingNodeId = graph.definingNodeIds?.[0];
    
    // If no defining node exists, create one to represent this graph
    if (!definingNodeId) {
      console.log(`[Store toggleSavedGraph] Graph ${graphId} has no defining node. Creating one.`);
      
      // Create a new node to represent this graph
      definingNodeId = uuidv4();
      const definingNodeData = {
        id: definingNodeId,
        name: graph.name || 'Untitled Graph',
        description: graph.description || '',
        picture: '',
        color: NODE_DEFAULT_COLOR,
        data: null,
        x: 0,
        y: 0,
        scale: 1,
        imageSrc: null,
        thumbnailSrc: null,
        imageAspectRatio: null,
        parentDefinitionNodeId: null,
        edgeIds: [],
        definitionGraphIds: [graphId] // This node defines the current graph
      };
      
      // Add the defining node to the nodes map
      draft.nodes.set(definingNodeId, definingNodeData);
      
      // Set this node as the defining node for the graph
      if (!graph.definingNodeIds) {
        graph.definingNodeIds = [];
      }
      graph.definingNodeIds.unshift(definingNodeId); // Add to beginning
      
      console.log(`[Store toggleSavedGraph] Created defining node ${definingNodeId} for graph ${graphId}.`);
    }
    
    const wasNodeSaved = draft.savedNodeIds.has(definingNodeId);
    if (wasNodeSaved) {
      draft.savedNodeIds.delete(definingNodeId);
      console.log(`[Store toggleSavedGraph] Removed defining node ${definingNodeId} from saved nodes (bookmarked graph ${graphId}).`);
    } else {
      draft.savedNodeIds.add(definingNodeId);
      console.log(`[Store toggleSavedGraph] Added defining node ${definingNodeId} to saved nodes (bookmarked graph ${graphId}).`);
    }
    // Replace with a new Set instance to ensure reference change
    draft.savedNodeIds = new Set(draft.savedNodeIds);
  })),

  // Explicitly set active definition node (e.g., when switching graphs)
  setActiveDefinitionNode: (nodeId) => {
     console.log(`[Store Action] Explicitly setting activeDefinitionNodeId to: ${nodeId}`);
     set({ activeDefinitionNodeId: nodeId });
  },

  // Remove a definition graph from a node and delete the graph if it's no longer referenced
  removeDefinitionFromNode: (nodeId, graphId) => set(produce((draft) => {
    const node = draft.nodes.get(nodeId);
    if (!node) {
      console.warn(`[Store removeDefinitionFromNode] Node ${nodeId} not found.`);
      return;
    }

    // Remove the graph ID from the node's definition list
    if (Array.isArray(node.definitionGraphIds)) {
      const index = node.definitionGraphIds.indexOf(graphId);
      if (index > -1) {
        node.definitionGraphIds.splice(index, 1);
        console.log(`[Store removeDefinitionFromNode] Removed graph ${graphId} from node ${nodeId} definitions.`);
      } else {
        console.warn(`[Store removeDefinitionFromNode] Graph ${graphId} not found in node ${nodeId} definitions.`);
        return;
      }
    }

    // Check if any other nodes still reference this graph as a definition
    let isGraphStillReferenced = false;
    for (const otherNode of draft.nodes.values()) {
      if (otherNode.id !== nodeId && Array.isArray(otherNode.definitionGraphIds) && otherNode.definitionGraphIds.includes(graphId)) {
        isGraphStillReferenced = true;
        break;
      }
    }

    // If no other nodes reference this graph, delete it completely
    if (!isGraphStillReferenced) {
      console.log(`[Store removeDefinitionFromNode] Graph ${graphId} is no longer referenced, deleting it.`);
      
      // Remove from graphs map
      draft.graphs.delete(graphId);
      
      // Close the graph tab if it's open
      const openIndex = draft.openGraphIds.indexOf(graphId);
      if (openIndex > -1) {
        draft.openGraphIds.splice(openIndex, 1);
        
        // If this was the active graph, switch to another one
        if (draft.activeGraphId === graphId) {
          draft.activeGraphId = draft.openGraphIds.length > 0 ? draft.openGraphIds[0] : null;
          if (draft.activeGraphId === null) {
            draft.activeDefinitionNodeId = null;
          }
        }
      }
      
      // Remove from expanded set
      draft.expandedGraphIds.delete(graphId);
      
      // Delete all nodes that belong to this graph
      const nodesToDelete = [];
      for (const [nodeId, nodeData] of draft.nodes.entries()) {
        if (nodeData.parentDefinitionNodeId && draft.nodes.get(nodeData.parentDefinitionNodeId)?.definitionGraphIds?.includes(graphId)) {
          nodesToDelete.push(nodeId);
        }
      }
      
      // Delete all edges that belong to this graph
      const edgesToDelete = [];
      for (const [edgeId, edgeData] of draft.edges.entries()) {
        // Check if this edge belongs to the graph being deleted
        const graph = draft.graphs.get(graphId);
        if (graph && graph.edgeIds.includes(edgeId)) {
          edgesToDelete.push(edgeId);
        }
      }
      
      // Actually delete the nodes and edges
      nodesToDelete.forEach(id => draft.nodes.delete(id));
      edgesToDelete.forEach(id => draft.edges.delete(id));
      
      console.log(`[Store removeDefinitionFromNode] Deleted graph ${graphId} and ${nodesToDelete.length} nodes, ${edgesToDelete.length} edges.`);
    } else {
      console.log(`[Store removeDefinitionFromNode] Graph ${graphId} is still referenced by other nodes, keeping it.`);
    }
  })),

  // Open a graph tab and bring it to the top (similar to Panel.jsx double-click behavior)
  openGraphTabAndBringToTop: (graphId, definitionNodeId = null) => set(produce((draft) => {
    console.log(`[Store openGraphTabAndBringToTop] Called with graphId: ${graphId}, definitionNodeId: ${definitionNodeId}`);
    if (!draft.graphs.has(graphId)) {
      console.warn(`[Store openGraphTabAndBringToTop] Graph ${graphId} not found.`);
      return;
    }

    // Check if graph is already open
    const existingIndex = draft.openGraphIds.indexOf(graphId);
    
    if (existingIndex > -1) {
      // Graph is already open, move it to the front
      draft.openGraphIds.splice(existingIndex, 1); // Remove from current position
      draft.openGraphIds.unshift(graphId); // Add to front
      console.log(`[Store openGraphTabAndBringToTop] Moved existing graph ${graphId} to front.`);
    } else {
      // Graph is not open, add it to the front
      draft.openGraphIds.unshift(graphId);
      console.log(`[Store openGraphTabAndBringToTop] Added new graph ${graphId} to front.`);
    }

    // Set this graph as the active one
    draft.activeGraphId = graphId;
    console.log(`[Store openGraphTabAndBringToTop] Set activeGraphId to: ${graphId}`);

    // Set the definition node ID if provided
    if (definitionNodeId) {
      console.log(`[Store openGraphTabAndBringToTop] Setting activeDefinitionNodeId to: ${definitionNodeId}`);
      draft.activeDefinitionNodeId = definitionNodeId;
    } else {
      console.log(`[Store openGraphTabAndBringToTop] No definitionNodeId provided, clearing activeDefinitionNodeId.`);
      draft.activeDefinitionNodeId = null;
    }
    
    // Ensure the opened graph is expanded in the list
    draft.expandedGraphIds.add(graphId);
    console.log(`[Store openGraphTabAndBringToTop] Added ${graphId} to expanded set.`);
  })),

  // Clean up orphaned nodes and graphs that are no longer referenced
  cleanupOrphanedData: () => set(produce((draft) => {
    console.log('[Store cleanupOrphanedData] Starting cleanup of orphaned nodes and graphs...');
    
    // Step 1: Find all referenced nodes
    const referencedNodeIds = new Set();
    
    // Add saved nodes
    draft.savedNodeIds.forEach(nodeId => referencedNodeIds.add(nodeId));
    
    // Add nodes from open graphs
    draft.openGraphIds.forEach(graphId => {
      const graph = draft.graphs.get(graphId);
      if (graph && graph.nodeIds) {
        graph.nodeIds.forEach(nodeId => referencedNodeIds.add(nodeId));
      }
    });
    
    // Add nodes from definition graphs of referenced nodes
    const addDefinitionNodes = (nodeId) => {
      const node = draft.nodes.get(nodeId);
      if (node && Array.isArray(node.definitionGraphIds)) {
        node.definitionGraphIds.forEach(graphId => {
          const defGraph = draft.graphs.get(graphId);
          if (defGraph && defGraph.nodeIds) {
            defGraph.nodeIds.forEach(defNodeId => {
              if (!referencedNodeIds.has(defNodeId)) {
                referencedNodeIds.add(defNodeId);
                addDefinitionNodes(defNodeId); // Recursively add nested definitions
              }
            });
          }
        });
      }
    };
    
    // Recursively add all definition nodes
    Array.from(referencedNodeIds).forEach(nodeId => addDefinitionNodes(nodeId));
    
    // Step 2: Find all referenced graphs
    const referencedGraphIds = new Set();
    
    // Add open graphs
    draft.openGraphIds.forEach(graphId => referencedGraphIds.add(graphId));
    
    // Add definition graphs from referenced nodes
    referencedNodeIds.forEach(nodeId => {
      const node = draft.nodes.get(nodeId);
      if (node && Array.isArray(node.definitionGraphIds)) {
        node.definitionGraphIds.forEach(graphId => referencedGraphIds.add(graphId));
      }
    });
    
    // Step 3: Remove orphaned nodes
    const orphanedNodes = [];
    for (const [nodeId, node] of draft.nodes.entries()) {
      if (!referencedNodeIds.has(nodeId)) {
        orphanedNodes.push(nodeId);
      }
    }
    
    orphanedNodes.forEach(nodeId => {
      console.log(`[Store cleanupOrphanedData] Removing orphaned node: ${nodeId}`);
      draft.nodes.delete(nodeId);
    });
    
    // Step 4: Remove orphaned graphs
    const orphanedGraphs = [];
    for (const [graphId, graph] of draft.graphs.entries()) {
      if (!referencedGraphIds.has(graphId)) {
        orphanedGraphs.push(graphId);
      }
    }
    
    orphanedGraphs.forEach(graphId => {
      console.log(`[Store cleanupOrphanedData] Removing orphaned graph: ${graphId}`);
      draft.graphs.delete(graphId);
      
      // Also clean up related state
      draft.expandedGraphIds.delete(graphId);
      
      // Remove from right panel tabs if open
      draft.rightPanelTabs = draft.rightPanelTabs.filter(tab => 
        tab.type !== 'graph' || tab.graphId !== graphId
      );
    });
    
    // Step 5: Remove orphaned edges
    const orphanedEdges = [];
    for (const [edgeId, edge] of draft.edges.entries()) {
      const sourceExists = referencedNodeIds.has(edge.sourceId);
      const destExists = referencedNodeIds.has(edge.destinationId);
      if (!sourceExists || !destExists) {
        orphanedEdges.push(edgeId);
      }
    }
    
    orphanedEdges.forEach(edgeId => {
      console.log(`[Store cleanupOrphanedData] Removing orphaned edge: ${edgeId}`);
      draft.edges.delete(edgeId);
    });
    
    // Step 6: Clean up edge references in remaining nodes
    referencedNodeIds.forEach(nodeId => {
      const node = draft.nodes.get(nodeId);
      if (node && Array.isArray(node.edgeIds)) {
        const originalLength = node.edgeIds.length;
        node.edgeIds = node.edgeIds.filter(edgeId => draft.edges.has(edgeId));
        if (node.edgeIds.length !== originalLength) {
          console.log(`[Store cleanupOrphanedData] Cleaned edge references in node ${nodeId}`);
        }
      }
    });
    
    // Step 7: Clean up edge references in remaining graphs
    referencedGraphIds.forEach(graphId => {
      const graph = draft.graphs.get(graphId);
      if (graph && Array.isArray(graph.edgeIds)) {
        const originalLength = graph.edgeIds.length;
        graph.edgeIds = graph.edgeIds.filter(edgeId => draft.edges.has(edgeId));
        if (graph.edgeIds.length !== originalLength) {
          console.log(`[Store cleanupOrphanedData] Cleaned edge references in graph ${graphId}`);
        }
      }
    });
    
    console.log(`[Store cleanupOrphanedData] Cleanup complete. Removed ${orphanedNodes.length} nodes, ${orphanedGraphs.length} graphs, ${orphanedEdges.length} edges.`);
  })),

  // Load data from file
  loadFromFile: async () => {
    try {
      const fileData = await initializeFileStorage();
      if (fileData) {
        set(() => ({
          ...fileData,
          isFileLoaded: true,
          fileLoadingError: null
        }));
        console.log('[FileStore] Successfully loaded data from file');
      } else {
        // Empty file or new file created
        set((state) => ({
          ...state,
          isFileLoaded: true,
          fileLoadingError: null
        }));
        console.log('[FileStore] Started with empty universe');
      }
    } catch (error) {
      console.error('[FileStore] Error loading from file:', error);
      set((state) => ({
        ...state,
        isFileLoaded: true,
        fileLoadingError: error.name === 'AbortError' ? 'File selection cancelled' : error.message
      }));
    }
  },

  // Restore from last session (automatic)
  restoreFromSession: async () => {
    try {
      const result = await restoreLastSession();
      if (result.success) {
        set(() => ({
          ...result.storeState,
          isFileLoaded: true,
          fileLoadingError: null
        }));
        console.log('[FileStore] Successfully restored from last session:', result.fileName);
        return true;
      } else {
        console.log('[FileStore] No previous session to restore');
        return false;
      }
    } catch (error) {
      console.error('[FileStore] Error restoring from session:', error);
      set((state) => ({
        ...state,
        fileLoadingError: error.message
      }));
      return false;
    }
  },

  // Clear current session
  clearSession: () => {
    clearSession();
    set((state) => ({
      ...state,
      graphs: new Map(),
      nodes: new Map(),
      edges: new Map(),
      openGraphIds: [],
      activeGraphId: null,
      activeDefinitionNodeId: null,
      savedNodeIds: new Set(),
      savedGraphIds: new Set(),
      expandedGraphIds: new Set(),
      isFileLoaded: false,
      fileLoadingError: null
    }));
    console.log('[FileStore] Session cleared and state reset');
  },

  // Get file status
  getFileStatus: () => getFileStatus(),

  }; // End of returned state and actions object
}); // End of create function

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

// Selector to check if a node is bookmarked
export const isNodeSaved = (nodeId) => (state) => state.savedNodeIds.has(nodeId);
export const isGraphSaved = (graphId) => (state) => state.savedGraphIds.has(graphId);

// Export the store hook
export default useGraphStore; 

// --- Subscribe to save changes to file ---
useGraphStore.subscribe(
  (state, prevState) => {
    // Only auto-save if file has been loaded (to avoid saving empty state on init)
    if (!state.isFileLoaded) return;
    
    // Check if any important data has changed
    const dataChanged = 
      state.savedNodeIds !== prevState.savedNodeIds ||
      state.savedGraphIds !== prevState.savedGraphIds ||
      state.openGraphIds !== prevState.openGraphIds ||
      state.nodes !== prevState.nodes ||
      state.graphs !== prevState.graphs ||
      state.edges !== prevState.edges ||
      state.activeGraphId !== prevState.activeGraphId ||
      state.activeDefinitionNodeId !== prevState.activeDefinitionNodeId ||
      state.expandedGraphIds !== prevState.expandedGraphIds;

    if (dataChanged) {
      console.log('[FileStore] Store data changed, auto-saving to file...');
      saveToFile(state);
    }
  }
); 