import { create } from 'zustand';
import { produce, enableMapSet } from 'immer';
import { v4 as uuidv4 } from 'uuid';
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
    console.error("Error deserializing Map:", error);
    return new Map(); // Return empty map on error
  }
};

const serializeSet = (set) => JSON.stringify(Array.from(set));
const deserializeSet = (jsonString) => {
  try {
    if (!jsonString) return new Set();
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch (error) {
    console.error("Error deserializing Set:", error);
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
  try {
    const saved = localStorage.getItem('savedNodeIds');
    if (saved) {
      const parsedIds = JSON.parse(saved);
      if (Array.isArray(parsedIds)) {
        console.log('[Store Init] Loaded saved nodes from localStorage:', parsedIds);
        return new Set(parsedIds);
      }
    }
  } catch (error) {
    console.error('[Store Init] Error loading saved nodes from localStorage:', error);
  }
  console.log('[Store Init] No valid saved nodes found in localStorage, starting fresh.');
  return new Set(); // Return empty set if nothing found or error occurred
};

const loadInitialNodes = () => {
  console.log('[Store Init] Attempting to load nodes map...');
  const map = deserializeMap(localStorage.getItem('nodesMap'));
  console.log(`[Store Init] Loaded ${map.size} nodes.`);
  return map;
};
const loadInitialGraphs = () => {
  console.log('[Store Init] Attempting to load graphs map...');
  const map = deserializeMap(localStorage.getItem('graphsMap'));
  console.log(`[Store Init] Loaded ${map.size} graphs.`);
  return map;
};

// --- Load Initial Open Graphs from localStorage --- 
const loadInitialOpenGraphs = () => {
  try {
    const saved = localStorage.getItem('openGraphIds');
    if (saved) {
      const parsedIds = JSON.parse(saved);
      if (Array.isArray(parsedIds)) {
        console.log('[Store Init] Loaded open graph IDs from localStorage:', parsedIds);
        // TODO: We might need to ensure these graphs actually exist in the graphs map later
        return parsedIds;
      }
    }
  } catch (error) {
    console.error('[Store Init] Error loading open graph IDs from localStorage:', error);
  }
  console.log('[Store Init] No valid open graph IDs found in localStorage, starting empty.');
  return []; // Return empty array if nothing found or error occurred
};

// --- Load Initial Active Graph ID from localStorage --- 
const loadInitialActiveGraphId = (validOpenGraphIds) => {
  try {
    const savedId = localStorage.getItem('activeGraphId');
    if (savedId) {
      // Ensure the saved active ID is actually one of the currently open graphs
      if (validOpenGraphIds.includes(savedId)) {
        console.log('[Store Init] Loaded active graph ID from localStorage:', savedId);
        return savedId;
      }
      console.warn('[Store Init] Saved active graph ID is not in the list of open graphs. Ignoring.');
    }
  } catch (error) {
    console.error('[Store Init] Error loading active graph ID from localStorage:', error);
  }
  // Default: Return the first open graph ID, or null if none are open
  const defaultActiveId = validOpenGraphIds.length > 0 ? validOpenGraphIds[0] : null;
  console.log('[Store Init] No valid active graph ID found or loaded, defaulting to:', defaultActiveId);
  return defaultActiveId;
};

// --- Load Initial Active Definition Node ID from localStorage ---
const loadInitialActiveDefinitionNodeId = (nodesMap) => {
  try {
    const savedId = localStorage.getItem('activeDefinitionNodeId');
    if (savedId && nodesMap.has(savedId)) { // Check if the node exists
      console.log('[Store Init] Loaded active definition node ID from localStorage:', savedId);
      return savedId;
    }
    if (savedId && !nodesMap.has(savedId)) {
        console.warn(`[Store Init] Loaded active definition node ID ${savedId} but node not found in map. Ignoring.`);
    }
  } catch (error) {
    console.error('[Store Init] Error loading active definition node ID from localStorage:', error);
  }
  console.log('[Store Init] No valid active definition node ID found or loaded, defaulting to null.');
  return null;
};

// --- Load Initial Expanded Graphs from localStorage ---
const loadInitialExpandedGraphIds = () => {
  console.log('[Store Init] Attempting to load expanded graph IDs...');
  const set = deserializeSet(localStorage.getItem('expandedGraphIds'));
  console.log(`[Store Init] Loaded ${set.size} expanded graph IDs.`);
  return set;
};

const useGraphStore = create((set, get) => {
  // --- Load Maps First ---
  const initialNodes = loadInitialNodes();
  const initialGraphs = loadInitialGraphs();

  // --- Load Saved/Open State ---
  const initialSavedNodeIds = loadInitialSavedNodes();
  let initialOpenIds = loadInitialOpenGraphs(); // Use let for potential modification

  // --- Determine Initial Active State --- 
  let initialActiveGraphId = null;
  let initialActiveDefinitionNodeId = loadInitialActiveDefinitionNodeId(initialNodes); // Load potential definition node

  if (initialActiveDefinitionNodeId) {
      const definingNode = initialNodes.get(initialActiveDefinitionNodeId);
      if (definingNode && Array.isArray(definingNode.definitionGraphIds) && definingNode.definitionGraphIds.length > 0) {
          const targetGraphId = definingNode.definitionGraphIds[0]; // Prioritize the first definition graph
          if (initialGraphs.has(targetGraphId)) {
              console.log(`[Store Init] Setting active graph based on loaded definition node ${initialActiveDefinitionNodeId}: Graph ${targetGraphId}`);
              initialActiveGraphId = targetGraphId;

              // Ensure this graph is in the open list
              if (!initialOpenIds.includes(targetGraphId)) {
                  console.log(`[Store Init] Adding definition graph ${targetGraphId} to open tabs.`);
                  initialOpenIds = [targetGraphId, ...initialOpenIds]; // Add to the start
              }
          } else {
              console.warn(`[Store Init] Definition node ${initialActiveDefinitionNodeId} points to non-existent graph ${targetGraphId}. Clearing active IDs.`);
              initialActiveDefinitionNodeId = null; // Invalidate definition node ID if graph is missing
              initialActiveGraphId = null;
          }
      } else {
          console.warn(`[Store Init] Loaded definition node ${initialActiveDefinitionNodeId} has no valid definitionGraphIds. Clearing active IDs.`);
          initialActiveDefinitionNodeId = null; // Invalidate if no definition graphs
          initialActiveGraphId = null;
      }
  }

  // Fallback if no active graph was set via definition node
  if (initialActiveGraphId === null) {
      console.log('[Store Init] No active graph set via definition node. Loading based on persisted open tabs...');
      initialActiveGraphId = loadInitialActiveGraphId(initialOpenIds); // Original fallback logic
      // If fallback also results in null activeGraphId, ensure activeDefinitionNodeId is also null
      // (It should already be null from the checks above, but double-check)
      if (initialActiveGraphId === null) {
           console.log('[Store Init] Fallback also resulted in null active graph. Clearing active definition node.');
           initialActiveDefinitionNodeId = null;
      } else {
          // If we *did* find an active graph via fallback, ensure the definition node is cleared
          // because we couldn't validate it via the primary path.
          console.log(`[Store Init] Fallback found active graph ${initialActiveGraphId}. Clearing potentially invalid active definition node.`);
          initialActiveDefinitionNodeId = null;
      }
  }

  // Final Consistency Check: If we have *both* an active graph and an active definition node,
  // ensure the node actually defines the graph. This handles edge cases where localStorage
  // might have inconsistent IDs saved somehow.
  if (initialActiveGraphId !== null && initialActiveDefinitionNodeId !== null) {
      const activeNode = initialNodes.get(initialActiveDefinitionNodeId);
      // Check if the node's definition array includes the determined active graph
      if (!activeNode || !Array.isArray(activeNode.definitionGraphIds) || !activeNode.definitionGraphIds.includes(initialActiveGraphId)) {
           console.warn(`[Store Init] Loaded activeDefinitionNodeId ${initialActiveDefinitionNodeId} does not define the determined activeGraphId ${initialActiveGraphId}. Clearing definition node ID.`);
           initialActiveDefinitionNodeId = null;
      }
  }

  console.log('[Store Init] Final Initial State:', {
    activeGraphId: initialActiveGraphId,
    activeDefinitionNodeId: initialActiveDefinitionNodeId,
    openGraphIds: initialOpenIds,
    graphsCount: initialGraphs.size,
    nodesCount: initialNodes.size,
    savedNodesCount: initialSavedNodeIds.size
  });

  // Return the initial state object
  return { 
    graphs: initialGraphs,
    nodes: initialNodes,
    edges: new Map(), // Start edges empty
    openGraphIds: initialOpenIds,
    activeGraphId: initialActiveGraphId,
    activeDefinitionNodeId: initialActiveDefinitionNodeId, 
    rightPanelTabs: [{ type: 'home', isActive: true }], 
    expandedGraphIds: loadInitialExpandedGraphIds(),
    savedNodeIds: initialSavedNodeIds,

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
        // Also update the corresponding right panel tab's bio AND title if it exists
        const tabIndex = draft.rightPanelTabs.findIndex(tab => tab.nodeId === nodeId);
        if (tabIndex !== -1) {
            // Update the bio using the potentially updated node description
            draft.rightPanelTabs[tabIndex].bio = nodeData.description || '';
            // <<< ADD: Update the title using the updated node name >>>
            draft.rightPanelTabs[tabIndex].title = nodeData.name || 'Untitled'; 
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
    console.log('[Store createNewGraph] Setting activeDefinitionNodeId to null');
    const newGraphId = uuidv4();
    const newNodeId = uuidv4();
    const newGraphName = initialData.name || "New Thing";

    // Node is created first, needs the graph ID
    const newNodeData = {
      id: newNodeId,
      name: newGraphName,
      description: '',
      picture: null,
      color: 'maroon',
      data: null,
      x: 0,
      y: 0,
      scale: 1,
      imageSrc: null,
      thumbnailSrc: null,
      imageAspectRatio: null,
      parentDefinitionNodeId: null,
      edgeIds: [],
      definitionGraphIds: [newGraphId], // Link graph to node
    };
    draft.nodes.set(newNodeId, newNodeData);

    // Graph is created second, needs the node ID
    const newGraphData = {
        id: newGraphId,
        name: newGraphName,
        description: initialData.description || '',
        picture: initialData.picture || null,
        color: initialData.color || '#ccc', // Default color
        directed: initialData.directed !== undefined ? initialData.directed : false, // Default undirected
        nodeIds: [],
        edgeIds: [],
        definingNodeIds: [newNodeId] // <<< FIX: Link node to graph >>>
    };
    draft.graphs.set(newGraphId, newGraphData);

    // Set active state
    draft.activeGraphId = newGraphId;
    draft.activeDefinitionNodeId = newNodeId;

    // Manage open/expanded lists
    if (!draft.openGraphIds.includes(newGraphId)) {
        draft.openGraphIds.unshift(newGraphId);
    }
    draft.expandedGraphIds.add(newGraphId);
    
    console.log('[Store] Created and activated new graph:', newGraphId, newGraphName);
    console.log('[Store] Created corresponding definition node:', newNodeId);
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
      description: `Definition for node: ${nodeData.name} (${nodeId})`,
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
    if (draft.savedNodeIds.has(nodeId)) {
      draft.savedNodeIds.delete(nodeId);
    } else {
      draft.savedNodeIds.add(nodeId);
    }
    // Replace with a new Set instance to ensure reference change
    draft.savedNodeIds = new Set(draft.savedNodeIds);
  })),

  // Explicitly set active definition node (e.g., when switching graphs)
  setActiveDefinitionNode: (nodeId) => {
     console.log(`[Store Action] Explicitly setting activeDefinitionNodeId to: ${nodeId}`);
     set({ activeDefinitionNodeId: nodeId });
  },

  };
});

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

// Export the store hook
export default useGraphStore; 

// --- Subscribe to save changes to localStorage --- 
useGraphStore.subscribe(
  (state, prevState) => {
    // Check if savedNodeIds specifically has changed
    const savedNodesChanged = state.savedNodeIds !== prevState.savedNodeIds;
    if (savedNodesChanged) {
      console.log('[Store Subscribe] savedNodeIds changed!', { prev: prevState.savedNodeIds, next: state.savedNodeIds });
      try {
        const savedIdsArray = Array.from(state.savedNodeIds);
        localStorage.setItem('savedNodeIds', JSON.stringify(savedIdsArray));
        console.log('[Store Subscribe] Saved nodes to localStorage:', savedIdsArray);
      } catch (error) {
        console.error('[Store Subscribe] Error saving nodes to localStorage:', error);
      }
    }

    // Check if openGraphIds specifically has changed
    const openGraphsChanged = state.openGraphIds !== prevState.openGraphIds;
    if (openGraphsChanged) {
      console.log('[Store Subscribe] openGraphIds changed!', { prev: prevState.openGraphIds, next: state.openGraphIds });
      try {
        // We store the array directly
        localStorage.setItem('openGraphIds', JSON.stringify(state.openGraphIds));
        console.log('[Store Subscribe] Saved open graph IDs to localStorage:', state.openGraphIds);
      } catch (error) {
        console.error('[Store Subscribe] Error saving open graph IDs to localStorage:', error);
      }
    }

    // Nodes Map Persistence
    const nodesMapChanged = state.nodes !== prevState.nodes;
    if (nodesMapChanged) {
      // console.log('[Store Subscribe] nodes map changed!', { prevSize: prevState.nodes.size, nextSize: state.nodes.size });
      try {
        localStorage.setItem('nodesMap', serializeMap(state.nodes));
        // console.log(`[Store Subscribe] Saved ${state.nodes.size} nodes map to localStorage.`);
      } catch (error) {
        console.error('[Store Subscribe] Error saving nodes map to localStorage:', error);
      }
    }

    // Graphs Map Persistence
    const graphsMapChanged = state.graphs !== prevState.graphs;
    if (graphsMapChanged) {
       console.log('[Store Subscribe] graphs map changed!', { prevSize: prevState.graphs.size, nextSize: state.graphs.size });
      try {
        localStorage.setItem('graphsMap', serializeMap(state.graphs));
        console.log(`[Store Subscribe] Saved ${state.graphs.size} graphs map to localStorage.`);
      } catch (error) {
        console.error('[Store Subscribe] Error saving graphs map to localStorage:', error);
      }
    }

    // Active Graph ID Persistence
    const activeGraphChanged = state.activeGraphId !== prevState.activeGraphId;
    if (activeGraphChanged) {
      console.log('[Store Subscribe] activeGraphId changed!', { prev: prevState.activeGraphId, next: state.activeGraphId });
      try {
        // Store null directly, or the string ID
        if (state.activeGraphId === null) {
           localStorage.removeItem('activeGraphId'); // Remove if null
           console.log('[Store Subscribe] Removed activeGraphId from localStorage.');
        } else {
           localStorage.setItem('activeGraphId', state.activeGraphId);
           console.log('[Store Subscribe] Saved active graph ID to localStorage:', state.activeGraphId);
        }
      } catch (error) {
        console.error('[Store Subscribe] Error saving active graph ID to localStorage:', error);
      }
    }

    // Active Definition Node ID Persistence
    const activeDefinitionNodeChanged = state.activeDefinitionNodeId !== prevState.activeDefinitionNodeId;
    if (activeDefinitionNodeChanged) {
        console.log('[Store Subscribe] activeDefinitionNodeId changed!', { prev: prevState.activeDefinitionNodeId, next: state.activeDefinitionNodeId });
        try {
            if (state.activeDefinitionNodeId === null) {
                localStorage.removeItem('activeDefinitionNodeId');
                console.log('[Store Subscribe] Removed activeDefinitionNodeId from localStorage.');
            } else {
                localStorage.setItem('activeDefinitionNodeId', state.activeDefinitionNodeId);
                console.log('[Store Subscribe] Saved active definition node ID to localStorage:', state.activeDefinitionNodeId);
            }
        } catch (error) {
            console.error('[Store Subscribe] Error saving active definition node ID to localStorage:', error);
        }
    }

    // Expanded Graph IDs Persistence
    const expandedGraphsChanged = state.expandedGraphIds !== prevState.expandedGraphIds;
    if (expandedGraphsChanged) {
        console.log('[Store Subscribe] expandedGraphIds changed!', { prevSize: prevState.expandedGraphIds.size, nextSize: state.expandedGraphIds.size });
        try {
            localStorage.setItem('expandedGraphIds', serializeSet(state.expandedGraphIds));
            console.log(`[Store Subscribe] Saved ${state.expandedGraphIds.size} expanded graph IDs to localStorage.`);
        } catch (error) {
            console.error('[Store Subscribe] Error saving expanded graph IDs to localStorage:', error);
        }
    }
  },
  // Optional: Selector to only trigger on savedNodeIds changes (more efficient)
  // state => state.savedNodeIds 
); 