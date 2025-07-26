import { create } from 'zustand';
import { produce, enableMapSet } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import { NODE_WIDTH, NODE_HEIGHT, NODE_DEFAULT_COLOR } from '../constants';
import { getFileStatus, restoreLastSession, clearSession, notifyChanges } from './fileStorage.js';
import { importFromRedstring } from '../formats/redstringFormat.js';

// Enable Immer Map/Set plugin support
enableMapSet();

const _createAndAssignGraphDefinition = (draft, prototypeId) => {
    const prototype = draft.nodePrototypes.get(prototypeId);
    if (!prototype) {
        console.error(`[Store Helper] Node prototype with ID ${prototypeId} not found.`);
        return null;
    }

    const newGraphId = uuidv4();
    const newGraphName = prototype.name || 'Untitled Definition';

    const newGraphData = {
        id: newGraphId,
        name: newGraphName,
        description: '',
        picture: null,
        color: prototype.color || NODE_DEFAULT_COLOR,
        directed: true,
        instances: new Map(), // Initialize with empty instances map
        edgeIds: [],
        definingNodeIds: [prototypeId], // This is the ID of the prototype
    };
    draft.graphs.set(newGraphId, newGraphData);

    if (!Array.isArray(prototype.definitionGraphIds)) {
        prototype.definitionGraphIds = [];
    }
    prototype.definitionGraphIds.push(newGraphId);

    return newGraphId;
};

/**
 * Helper function to normalize edge directionality to ensure arrowsToward is always a Set
 */
const normalizeEdgeDirectionality = (directionality) => {
  if (!directionality) {
    return { arrowsToward: new Set() };
  }
  
  if (directionality.arrowsToward instanceof Set) {
    return directionality;
  }
  
  if (Array.isArray(directionality.arrowsToward)) {
    return { arrowsToward: new Set(directionality.arrowsToward) };
  }
  
  return { arrowsToward: new Set() };
};

// Middleware to notify auto-save of changes
const autoSaveMiddleware = (config) => {
  let notifyTimeout = null;
  
  return (set, get, api) =>
    config(
      (...args) => {
        set(...args);
        
        // Debounce auto-save notifications to prevent spam during rapid updates (like dragging)
        if (notifyTimeout) {
          clearTimeout(notifyTimeout);
        }
        
        notifyTimeout = setTimeout(() => {
          // Notify auto-save system that changes have been made
          try {
            import('./fileStorage.js').then(({ notifyChanges }) => {
              notifyChanges();
            });
          } catch (error) {
            console.warn('[GraphStore] Failed to notify auto-save of changes:', error);
          }
          notifyTimeout = null;
        }, 100); // 100ms debounce - prevents spam during rapid updates like dragging
      },
      get,
      api
    );
};

// Create store with async initialization
const useGraphStore = create(autoSaveMiddleware((set, get) => {
  // Return both initial state and actions
  return {
    // Initialize with completely empty state - universe file is required
    graphs: new Map(),
    nodePrototypes: (() => {
      // Initialize with base "Thing" type
      const thingId = 'base-thing-prototype';
      const nodePrototypes = new Map();
      nodePrototypes.set(thingId, {
        id: thingId,
        name: 'Thing',
        description: 'The base type for all things. Things are nodes, ideas, nouns, concepts, objects, whatever you want them to be. They will always be at the bottom of the abstraction stack. They are the "atoms" of your Redstring universe.',
        color: '#8B0000', // Dark red/maroon
        typeNodeId: null, // No parent type - this is the most basic type
        definitionGraphIds: [],
        isSpecificityChainNode: false, // Not part of any specificity chain
        hasSpecificityChain: false // Does not define a specificity chain
      });
      return nodePrototypes;
    })(),
    edgePrototypes: (() => {
      // Initialize with base "Connection" type
      const connectionId = 'base-connection-prototype';
      const edgePrototypes = new Map();
      edgePrototypes.set(connectionId, {
        id: connectionId,
        name: 'Connection',
        description: 'The base type for all connections. Connections are edges, relationships, verbs, actions, whatever you want them to be. They will always be at the bottom of the connection abstraction stack.',
        color: '#000000', // Black
        typeNodeId: null, // No parent type - this is the most basic connection type
        definitionGraphIds: [],
        isSpecificityChainNode: false, // Not part of any specificity chain
        hasSpecificityChain: false // Does not define a specificity chain
      });
      return edgePrototypes;
    })(),
    edges: new Map(),
    openGraphIds: [],
    activeGraphId: null,
    activeDefinitionNodeId: null, // This now refers to a prototypeId
    selectedEdgeId: null, // Currently selected edge for editing
    selectedEdgeIds: new Set(), // Multiple selected edges
    typeListMode: (() => {
      // Load saved state from localStorage, with 'connection' as default
      const savedMode = localStorage.getItem('redstring_typelist_mode');
      if (savedMode && ['closed', 'node', 'connection'].includes(savedMode)) {
        return savedMode;
      } else {
        return 'connection'; // Default order: connections -> nodes -> closed
      }
    })(),
    rightPanelTabs: [{ type: 'home', isActive: true }], 
    expandedGraphIds: new Set(),
    savedNodeIds: new Set(), // This now refers to prototype IDs
    savedGraphIds: new Set(), // This is based on the defining prototype ID
    
    // Universe file state
    isUniverseLoaded: false,
    isUniverseLoading: true, // Start in loading state
    universeLoadingError: null,
    hasUniverseFile: false,

    // Thing node ID for abstraction system
    thingNodeId: 'base-thing-prototype',
    
    // UI Settings
    showConnectionNames: false,

  // --- Actions --- (Operating on plain data)

  // This action is deprecated. All loading now goes through loadUniverseFromFile.
  loadGraph: (graphInstance) => {},

  // Adds a NEW plain prototype data to the global pool.
  addNodePrototype: (prototypeData) => set(produce((draft) => {
    const prototypeId = prototypeData.id || uuidv4();
    if (!draft.nodePrototypes.has(prototypeId)) {
        draft.nodePrototypes.set(prototypeId, { ...prototypeData, id: prototypeId });
    }
  })),
  
  // Adds a new instance of a prototype to a specific graph.
  addNodeInstance: (graphId, prototypeId, position, instanceId = uuidv4()) => set(produce((draft) => {
    const graph = draft.graphs.get(graphId);
    const prototype = draft.nodePrototypes.get(prototypeId);

    if (!graph || !prototype) {
        console.error(`[addNodeInstance] Invalid graphId (${graphId}) or prototypeId (${prototypeId})`);
        return;
    }
    
    const newInstance = {
        id: instanceId,
        prototypeId,
        x: position.x,
        y: position.y,
        scale: 1,
    };
    
    if (!graph.instances) {
        graph.instances = new Map();
    }
    graph.instances.set(instanceId, newInstance);
  })),

  // Removes an instance from a graph and cleans up its connected edges.
  removeNodeInstance: (graphId, instanceId) => set(produce((draft) => {
    const graph = draft.graphs.get(graphId);
    if (!graph || !graph.instances?.has(instanceId)) {
      console.warn(`[removeNodeInstance] Instance ${instanceId} not found in graph ${graphId}.`);
      return;
    }

    // 1. Delete the instance from the graph
    graph.instances.delete(instanceId);

    // 2. Find all edges connected to this instance and delete them
    const edgesToDelete = [];
    for (const [edgeId, edge] of draft.edges.entries()) {
      if (edge.sourceId === instanceId || edge.destinationId === instanceId) {
        edgesToDelete.push(edgeId);
      }
    }
    
    edgesToDelete.forEach(edgeId => {
      draft.edges.delete(edgeId);
      // Also remove from the graph's edgeIds list
      if (graph.edgeIds) {
          const index = graph.edgeIds.indexOf(edgeId);
          if (index > -1) {
              graph.edgeIds.splice(index, 1);
          }
      }
    });
  })),

  // Update a prototype's data using Immer's recipe. This affects all its instances.
  updateNodePrototype: (prototypeId, recipe) => set(produce((draft) => {
    const prototype = draft.nodePrototypes.get(prototypeId);
    if (prototype) {
      const originalName = prototype.name;
      recipe(prototype); // Apply Immer updates
      const newName = prototype.name;

      // Sync name change to any graphs defined by this prototype
      if (newName !== originalName && Array.isArray(prototype.definitionGraphIds)) {
        prototype.definitionGraphIds.forEach(graphId => {
          const graph = draft.graphs.get(graphId);
          if (graph) {
            graph.name = newName;
          }
        });
      }
      
      // Update titles in right panel tabs
      draft.rightPanelTabs.forEach(tab => {
          if (tab.nodeId === prototypeId) {
              tab.title = newName;
          }
      });

    } else {
      console.warn(`updateNodePrototype: Prototype with id ${prototypeId} not found.`);
    }
  })),

  // Update an instance's unique data (e.g., position)
  updateNodeInstance: (graphId, instanceId, recipe) => set(produce((draft) => {
      const graph = draft.graphs.get(graphId);
      if (graph && graph.instances) {
          const instance = graph.instances.get(instanceId);
          if (instance) {
              recipe(instance);
          } else {
              console.warn(`updateNodeInstance: Instance ${instanceId} not found in graph ${graphId}.`);
          }
      }
  })),
  
  // Update positions of multiple instances efficiently
  updateMultipleNodeInstancePositions: (graphId, updates) => set(produce((draft) => {
    const graph = draft.graphs.get(graphId);
    if (!graph || !graph.instances) return;

    updates.forEach(({ instanceId, x, y }) => {
      const instance = graph.instances.get(instanceId);
      if (instance) {
        instance.x = x;
        instance.y = y;
      }
    });
  })),

  // Adds a NEW edge connecting two instances.
  addEdge: (graphId, newEdgeData) => set(produce((draft) => {
      const graph = draft.graphs.get(graphId);
      if (!graph) {
          console.error(`[addEdge] Graph with ID ${graphId} not found.`);
          return;
      }

      const { id: edgeId, sourceId: sourceInstanceId, destinationId: destInstanceId } = newEdgeData;
      if (!edgeId || !sourceInstanceId || !destInstanceId) {
          console.error("[addEdge] newEdgeData requires id, sourceId, and destinationId.");
          return;
      }

      // Ensure source and dest instances exist in the graph
      if (!graph.instances?.has(sourceInstanceId) || !graph.instances?.has(destInstanceId)) {
          console.error(`[addEdge] Source or destination instance not found in graph ${graphId}.`);
          return;
      }
      
      if (!draft.edges.has(edgeId)) {
          newEdgeData.directionality = normalizeEdgeDirectionality(newEdgeData.directionality);
          // Assign default edge type if not specified
          if (!newEdgeData.typeNodeId) {
            newEdgeData.typeNodeId = 'base-connection-prototype';
          }
          draft.edges.set(edgeId, newEdgeData);

          if (!graph.edgeIds) {
            graph.edgeIds = [];
          }
          graph.edgeIds.push(edgeId);
      }
  })),

  // Update an edge's data using Immer's recipe (no change needed here)
  updateEdge: (edgeId, recipe) => set(produce((draft) => {
    const edge = draft.edges.get(edgeId);
    if (edge) {
      recipe(edge); // Apply the Immer updates
    } else {
      console.warn(`updateEdge: Edge with id ${edgeId} not found.`);
    }
  })),

  // Set the type of a node (the node that serves as this node's type in the abstraction hierarchy)
  setNodeType: (nodeId, typeNodeId) => set(produce((draft) => {
    const node = draft.nodePrototypes.get(nodeId);
    if (!node) {
      console.warn(`setNodeType: Node prototype ${nodeId} not found.`);
      return;
    }
    
    // Prevent the base "Thing" type from being assigned a type
    if (nodeId === 'base-thing-prototype' && typeNodeId !== null) {
      console.warn(`setNodeType: The base "Thing" type cannot be assigned a type. It must remain the fundamental type.`);
      return;
    }
    
    // Validate that the type node exists (if not null)
    if (typeNodeId !== null && !draft.nodePrototypes.has(typeNodeId)) {
      console.warn(`setNodeType: Type node ${typeNodeId} not found.`);
      return;
    }
    
    // Prevent circular typing (a node cannot be typed by itself or by a node it already types)
    if (typeNodeId === nodeId) {
      console.warn(`setNodeType: Node ${nodeId} cannot be typed by itself.`);
      return;
    }
    
    // Check for indirect circular typing by traversing the type chain
    if (typeNodeId !== null) {
      let currentTypeId = typeNodeId;
      const visited = new Set();
      while (currentTypeId && !visited.has(currentTypeId)) {
        visited.add(currentTypeId);
        const currentTypeNode = draft.nodePrototypes.get(currentTypeId);
        if (currentTypeNode?.typeNodeId === nodeId) {
          console.warn(`setNodeType: Circular typing detected. Node ${nodeId} cannot be typed by ${typeNodeId}.`);
          return;
        }
        currentTypeId = currentTypeNode?.typeNodeId;
      }
    }
    
    node.typeNodeId = typeNodeId;
    console.log(`setNodeType: Set type of node ${nodeId} to ${typeNodeId || 'null'}.`);
  })),

  // Edge prototype management
  addEdgePrototype: (prototypeData) => set(produce((draft) => {
    const prototypeId = prototypeData.id || uuidv4();
    if (!draft.edgePrototypes.has(prototypeId)) {
        draft.edgePrototypes.set(prototypeId, { ...prototypeData, id: prototypeId });
    }
  })),

  updateEdgePrototype: (prototypeId, recipe) => set(produce((draft) => {
    const prototype = draft.edgePrototypes.get(prototypeId);
    if (prototype) {
      const originalTypeNodeId = prototype.typeNodeId;
      recipe(prototype); // Apply Immer updates
      
      // Prevent the base "Connection" type from being changed
      if (prototypeId === 'base-connection-prototype' && prototype.typeNodeId !== originalTypeNodeId) {
        console.warn(`updateEdgePrototype: Cannot change the type of the base "Connection" prototype. Attempted to change from ${originalTypeNodeId} to ${prototype.typeNodeId}`);
        prototype.typeNodeId = originalTypeNodeId; // Restore original value
      }
    } else {
      console.warn(`updateEdgePrototype: Edge prototype with id ${prototypeId} not found.`);
    }
  })),

  // Set the type of an edge
  setEdgeType: (edgeId, typeNodeId) => set(produce((draft) => {
    const edge = draft.edges.get(edgeId);
    if (!edge) {
      console.warn(`setEdgeType: Edge ${edgeId} not found.`);
      return;
    }
    
    // Validate that the type node exists (if not null)
    if (typeNodeId !== null && !draft.edgePrototypes.has(typeNodeId)) {
      console.warn(`setEdgeType: Edge type ${typeNodeId} not found.`);
      return;
    }
    
    edge.typeNodeId = typeNodeId;
    console.log(`setEdgeType: Set type of edge ${edgeId} to ${typeNodeId || 'null'}.`);
  })),

  // Deprecated actions, kept for API consistency during refactor if needed, but should not be used.
  addNode: () => console.warn("`addNode` is deprecated. Use `addNodePrototype` and `addNodeInstance`."),
  updateNode: () => console.warn("`updateNode` is deprecated. Use `updateNodePrototype` or `updateNodeInstance`."),
  updateMultipleNodePositions: () => console.warn("`updateMultipleNodePositions` is deprecated. Use `updateMultipleNodeInstancePositions`."),
  removeNode: () => console.warn("`removeNode` is deprecated. Use `removeNodeInstance`."),
  removeEdge: (edgeId) => set(produce((draft) => {
    const edge = draft.edges.get(edgeId);
    if (!edge) {
      console.warn(`[Store removeEdge] Edge with ID ${edgeId} not found.`);
      return;
    }

    // Remove from global edges Map
    draft.edges.delete(edgeId);

    // Remove from graph's edgeIds list
    for (const [graphId, graph] of draft.graphs.entries()) {
      if (graph.edgeIds && graph.edgeIds.includes(edgeId)) {
        const index = graph.edgeIds.indexOf(edgeId);
        if (index > -1) {
          graph.edgeIds.splice(index, 1);
        }
        break;
      }
    }

    // Clear selection if this edge was selected
    if (draft.selectedEdgeId === edgeId) {
      draft.selectedEdgeId = null;
    }

    console.log(`[Store removeEdge] Edge ${edgeId} removed successfully.`);
  })),


  // --- Tab Management Actions --- (Unaffected by prototype change)
    openGraphTab: (graphId, definitionNodeId = null) => set(produce((draft) => {
    console.log(`[Store openGraphTab] Called with graphId: ${graphId}, definitionNodeId: ${definitionNodeId}`);
    if (draft.graphs.has(graphId)) { // Ensure graph exists
      // Add to open list if not already there (add to TOP of list)
      if (!draft.openGraphIds.includes(graphId)) {
        draft.openGraphIds.unshift(graphId);
      }
      // Set this graph as the active one
      draft.activeGraphId = graphId;
      
      // Auto-expand the newly opened graph in the "Open Things" list
      draft.expandedGraphIds.add(graphId);
      
      console.log(`[Store openGraphTab] Set activeGraphId to: ${graphId} and auto-expanded.`);

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

    // Create a new prototype that will define this graph.
    const definingPrototypeId = uuidv4();
    const definingPrototypeData = {
        id: definingPrototypeId,
        name: newGraphName,
        description: initialData.description || '',
        color: initialData.color || NODE_DEFAULT_COLOR,
        typeNodeId: initialData.typeNodeId || null, // Node that serves as this node's type
        // No positional data in prototype
        definitionGraphIds: [newGraphId] // This prototype defines the new graph
    };
    draft.nodePrototypes.set(definingPrototypeId, definingPrototypeData);

    // Create a new empty graph
    const newGraphData = {
        id: newGraphId,
        name: newGraphName,
        description: initialData.description || '',
        picture: initialData.picture || null,
        color: initialData.color || NODE_DEFAULT_COLOR,
        directed: initialData.directed !== undefined ? initialData.directed : false,
        instances: new Map(), // Initialize with empty instances map
        edgeIds: [],
        definingNodeIds: [definingPrototypeId], // This graph is defined by the new prototype
        panOffset: null,
        zoomLevel: null,
    };
    draft.graphs.set(newGraphId, newGraphData);

    // Set active state
    draft.activeGraphId = newGraphId;
    draft.activeDefinitionNodeId = definingPrototypeId; // The defining prototype ID

    // Manage open/expanded lists
    if (!draft.openGraphIds.includes(newGraphId)) {
        draft.openGraphIds.unshift(newGraphId);
    }
    draft.expandedGraphIds.add(newGraphId);
    
    console.log(`[Store] Created and activated new empty graph: ${newGraphId} ('${newGraphName}') defined by prototype ${definingPrototypeId}.`);
  })),

  // Creates a new graph, assigns it as a definition to a prototype, and makes it active
  createAndAssignGraphDefinition: (prototypeId) => {
    let newGraphId = null;
    set(produce((draft) => {
      newGraphId = _createAndAssignGraphDefinition(draft, prototypeId);
      if (!newGraphId) return;

      // Open and activate the new graph (add to TOP of list)
      if (!draft.openGraphIds.includes(newGraphId)) {
          draft.openGraphIds.unshift(newGraphId);
      }
      draft.activeGraphId = newGraphId;
      draft.activeDefinitionNodeId = prototypeId;
      
      // Auto-expand the new graph in the "Open Things" list
      draft.expandedGraphIds.add(newGraphId);
      
      console.log(`[Store createAndAssignGraphDefinition] Created new graph ${newGraphId} for prototype ${prototypeId}, set as active, and auto-expanded.`);
    }));
    return newGraphId;
  },
  
  // Creates a new graph and assigns it as a definition, but does NOT make it active.
  createAndAssignGraphDefinitionWithoutActivation: (prototypeId) => {
    let newGraphId = null;
    set(produce((draft) => {
      newGraphId = _createAndAssignGraphDefinition(draft, prototypeId);
      if (!newGraphId) return;
      
      console.log(`[Store createAndAssignGraphDefinitionWithoutActivation] Created new graph ${newGraphId} for prototype ${prototypeId}.`);
    }));
    return newGraphId;
  },

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
            // Find the corresponding definition prototype(s) and update their names
            for (const prototype of draft.nodePrototypes.values()) {
              if (Array.isArray(prototype.definitionGraphIds) && prototype.definitionGraphIds.includes(graphId)) {
                console.log(`[Store updateGraph] Updating prototype ${prototype.id} name to match graph.`);
                prototype.name = newName;
                // Also update the node's tab title if it's open in the right panel
                const tabIndex = draft.rightPanelTabs.findIndex(tab => tab.nodeId === prototype.id);
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
    // Find prototype data to get the title
    const prototypeData = draft.nodePrototypes.get(nodeId);
    if (!prototypeData) {
      console.warn(`openRightPanelNodeTab: Node prototype with id ${nodeId} not found.`);
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
        title: prototypeData.name || nodeNameFallback,
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
        // No positional data in prototype
        definitionGraphIds: [graphId] // This node defines the current graph
      };
      
      // Add the defining node to the nodes map
      draft.nodePrototypes.set(definingNodeId, definingNodeData);
      
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

  // Toggle connection names visibility
  toggleShowConnectionNames: () => set(produce((draft) => {
    draft.showConnectionNames = !draft.showConnectionNames;
  })),

  // Explicitly set active definition node (e.g., when switching graphs)
  setActiveDefinitionNode: (nodeId) => {
     console.log(`[Store Action] Explicitly setting activeDefinitionNodeId to: ${nodeId}`);
     set({ activeDefinitionNodeId: nodeId });
  },

  // Set the currently selected edge for editing
  setSelectedEdgeId: (edgeId) => {
     console.log(`[Store Action] Setting selectedEdgeId to: ${edgeId}`);
     set({ selectedEdgeId: edgeId });
  },

  // Set multiple selected edges
  setSelectedEdgeIds: (edgeIds) => {
     console.log(`[Store Action] Setting selectedEdgeIds to:`, edgeIds);
     set({ selectedEdgeIds: new Set(edgeIds) });
  },

  // Add edge to selection
  addSelectedEdgeId: (edgeId) => set(produce((draft) => {
     draft.selectedEdgeIds.add(edgeId);
     console.log(`[Store Action] Added edge ${edgeId} to selection`);
  })),

  // Remove edge from selection
  removeSelectedEdgeId: (edgeId) => set(produce((draft) => {
     draft.selectedEdgeIds.delete(edgeId);
     console.log(`[Store Action] Removed edge ${edgeId} from selection`);
  })),

  // Clear all selected edges
  clearSelectedEdgeIds: () => set(produce((draft) => {
     draft.selectedEdgeIds.clear();
     console.log(`[Store Action] Cleared all selected edges`);
  })),

  // Set TypeList mode
  setTypeListMode: (mode) => {
     console.log(`[Store Action] Setting typeListMode to: ${mode}`);
     set({ typeListMode: mode });
  },

  // Set the type of a node prototype
  setNodeType: (nodeId, typeNodeId) => set(produce((draft) => {
    const nodePrototype = draft.nodePrototypes.get(nodeId);
    if (nodePrototype) {
      nodePrototype.typeNodeId = typeNodeId;
      console.log(`[Store] Set type of node ${nodeId} to ${typeNodeId}`);
    } else {
      console.error(`[Store] Could not find node prototype ${nodeId} to set type`);
    }
  })),

  // Remove a definition graph from a node and delete the graph if it's no longer referenced
  removeDefinitionFromNode: (nodeId, graphId) => set(produce((draft) => {
    const node = draft.nodePrototypes.get(nodeId);
    if (!node) {
      console.warn(`[Store removeDefinitionFromNode] Node prototype ${nodeId} not found.`);
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
    for (const otherNode of draft.nodePrototypes.values()) {
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
      
      // Delete all instances that belong to this graph is complex.
      // The graph is gone, so its instances are implicitly gone.
      // We might need a more robust cleanup later.
      
      console.log(`[Store removeDefinitionFromNode] Deleted graph ${graphId}.`);
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
    console.log('[Store cleanupOrphanedData] Starting cleanup of orphaned data...');
    
    // Step 1: Find all referenced prototypes and instances
    const referencedPrototypeIds = new Set();
    
    // Add saved prototypes
    draft.savedNodeIds.forEach(prototypeId => referencedPrototypeIds.add(prototypeId));
    
    // Add prototypes from all instances in open graphs
    draft.openGraphIds.forEach(graphId => {
      const graph = draft.graphs.get(graphId);
      if (graph && graph.instances) {
        graph.instances.forEach(instance => referencedPrototypeIds.add(instance.prototypeId));
      }
    });
    
    // Add prototypes that are being used as types by other prototypes
    for (const prototype of draft.nodePrototypes.values()) {
      if (prototype.typeNodeId) {
        referencedPrototypeIds.add(prototype.typeNodeId);
      }
    }
    
    // Add prototypes that are referenced by edges (connection types)
    for (const [edgeId, edge] of draft.edges.entries()) {
      // Check definitionNodeIds (new approach)
      if (edge.definitionNodeIds && Array.isArray(edge.definitionNodeIds)) {
        edge.definitionNodeIds.forEach(nodeId => referencedPrototypeIds.add(nodeId));
      }
      // Check typeNodeId (legacy approach)
      if (edge.typeNodeId) {
        referencedPrototypeIds.add(edge.typeNodeId);
      }
    }
    
    // Recursively add prototypes from definition graphs
    const addDefinitionPrototypes = (prototypeId) => {
      const prototype = draft.nodePrototypes.get(prototypeId);
      if (prototype && Array.isArray(prototype.definitionGraphIds)) {
        prototype.definitionGraphIds.forEach(graphId => {
          const defGraph = draft.graphs.get(graphId);
          if (defGraph && defGraph.instances) {
            defGraph.instances.forEach(instance => {
              if (!referencedPrototypeIds.has(instance.prototypeId)) {
                referencedPrototypeIds.add(instance.prototypeId);
                addDefinitionPrototypes(instance.prototypeId); // Recurse
              }
            });
          }
        });
      }
    };
    
    Array.from(referencedPrototypeIds).forEach(prototypeId => addDefinitionPrototypes(prototypeId));
    
    // Step 2: Find all referenced graphs
    const referencedGraphIds = new Set();
    
    // Add open graphs
    draft.openGraphIds.forEach(graphId => referencedGraphIds.add(graphId));
    
    // Add definition graphs from referenced prototypes
    referencedPrototypeIds.forEach(prototypeId => {
      const prototype = draft.nodePrototypes.get(prototypeId);
      if (prototype && Array.isArray(prototype.definitionGraphIds)) {
        prototype.definitionGraphIds.forEach(graphId => referencedGraphIds.add(graphId));
      }
    });
    
    // Step 3: Remove orphaned prototypes
    const orphanedPrototypes = [];
    for (const prototypeId of draft.nodePrototypes.keys()) {
      if (!referencedPrototypeIds.has(prototypeId)) {
        orphanedPrototypes.push(prototypeId);
      }
    }
    
    orphanedPrototypes.forEach(prototypeId => {
      console.log(`[Store cleanupOrphanedData] Removing orphaned prototype: ${prototypeId}`);
      draft.nodePrototypes.delete(prototypeId);
    });
    
    // Step 4: Remove orphaned graphs (and their instances/edges)
    const orphanedGraphs = [];
    for (const graphId of draft.graphs.keys()) {
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
    const allInstanceIds = new Set();
    draft.graphs.forEach(g => {
        if(g.instances) {
            g.instances.forEach(inst => allInstanceIds.add(inst.id));
        }
    });

    for (const [edgeId, edge] of draft.edges.entries()) {
      const sourceExists = allInstanceIds.has(edge.sourceId);
      const destExists = allInstanceIds.has(edge.destinationId);
      if (!sourceExists || !destExists) {
        orphanedEdges.push(edgeId);
      }
    }
    
    orphanedEdges.forEach(edgeId => {
      console.log(`[Store cleanupOrphanedData] Removing orphaned edge: ${edgeId}`);
      draft.edges.delete(edgeId);
    });
    
    // Step 6: Clean up edge references in remaining graphs
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
    
    console.log(`[Store cleanupOrphanedData] Cleanup complete. Removed ${orphanedPrototypes.length} prototypes, ${orphanedGraphs.length} graphs, ${orphanedEdges.length} edges.`);
  })),

  // Restore from last session (automatic) - now only returns universe file data
  restoreFromSession: async () => {
    try {
      const result = await restoreLastSession();
      return result; // Return the result object for the component to handle
    } catch (error) {
      console.error('[Store] Error restoring from session:', error);
      return { success: false, error: error.message };
    }
  },

  // Get file status
  getFileStatus: () => getFileStatus(),

  // Universe file management actions
  loadUniverseFromFile: (dataToLoad) => {
    // If dataToLoad already contains Maps (i.e., was returned by importFromRedstring earlier) we can use it directly.
    const isAlreadyDeserialized = dataToLoad && dataToLoad.graphs instanceof Map;

    let storeState;
    if (isAlreadyDeserialized) {
      storeState = dataToLoad;
    } else {
      // Use the centralized import function to correctly deserialize the data
      const { storeState: importedState, errors } = importFromRedstring(dataToLoad);
      if (errors && errors.length > 0) {
        console.error("[graphStore] Errors importing from Redstring:", errors);
        return;
      }
      storeState = importedState;
    }

    // Normalize all edge directionality to ensure arrowsToward is always a Set
    if (storeState.edges) {
      for (const [edgeId, edgeData] of storeState.edges.entries()) {
        edgeData.directionality = normalizeEdgeDirectionality(edgeData.directionality);
      }
    }

    set({
      ...storeState,
      isUniverseLoaded: true,
      isUniverseLoading: false,
      universeLoadingError: null,
      hasUniverseFile: true,
    });
  },

  setUniverseError: (error) => set({ 
    isUniverseLoaded: true, // Loading is complete, but with an error
    isUniverseLoading: false,
    universeLoadingError: error,
    hasUniverseFile: false
  }),
  
  // --- Simple Abstraction Actions ---
  
  // Add a node above (more abstract) or below (more specific) in a dimension chain
  addToAbstractionChain: (nodeId, dimension, direction, newNodeId, insertRelativeToNodeId) => set(produce((draft) => {
    console.log(`[Store] addToAbstractionChain called with:`, {
      nodeId,
      dimension,
      direction,
      newNodeId,
      insertRelativeToNodeId
    });
    
    const node = draft.nodePrototypes.get(nodeId);
    if (!node) {
      console.error(`Node ${nodeId} not found`);
      return;
    }
    
    console.log(`[Store] Found chain owner node:`, {
      id: node.id,
      name: node.name,
      hasAbstractionChains: !!node.abstractionChains,
      existingChain: node.abstractionChains?.[dimension]
    });
    
    // Initialize abstraction chains if they don't exist
    if (!node.abstractionChains) {
      node.abstractionChains = {};
    }
    
    // Initialize this dimension if it doesn't exist
    if (!node.abstractionChains[dimension]) {
      node.abstractionChains[dimension] = [nodeId]; // Start with just this node
    }
    
    const chain = node.abstractionChains[dimension];
    
    // If insertRelativeToNodeId is provided, insert relative to that node
    if (insertRelativeToNodeId && insertRelativeToNodeId !== nodeId) {
      const relativeIndex = chain.indexOf(insertRelativeToNodeId);
      if (relativeIndex !== -1) {
        if (direction === 'above') {
          // More abstract - insert before the relative node
          chain.splice(relativeIndex, 0, newNodeId);
        } else {
          // More specific - insert after the relative node
          chain.splice(relativeIndex + 1, 0, newNodeId);
        }
        console.log(`Added ${newNodeId} ${direction} ${insertRelativeToNodeId} in ${dimension} dimension. Chain:`, chain);
        return;
      } else {
        console.warn(`Relative node ${insertRelativeToNodeId} not found in chain, inserting both nodes`);
        // If the relative node isn't in the chain yet, we need to handle this case
        // Insert both the relative node and the new node in the correct order
        const chainOwnerIndex = chain.indexOf(nodeId);
        if (chainOwnerIndex !== -1) {
          if (direction === 'above') {
            // Insert relative node at chain owner position, then new node above it
            chain.splice(chainOwnerIndex, 0, newNodeId, insertRelativeToNodeId);
          } else {
            // Insert relative node at chain owner position, then new node below it  
            chain.splice(chainOwnerIndex, 0, insertRelativeToNodeId, newNodeId);
          }
          console.log(`Added relative node ${insertRelativeToNodeId} and new node ${newNodeId} ${direction} it. Chain:`, chain);
          return;
        }
      }
    }
    
    // Fallback: insert relative to the chain owner (original behavior)
    const currentIndex = chain.indexOf(nodeId);
    
    if (currentIndex === -1) {
      // Node not in chain, add it first
      chain.push(nodeId);
    }
    
    // Add new node in the right position relative to chain owner
    const updatedCurrentIndex = chain.indexOf(nodeId);
    if (direction === 'above') {
      // More abstract - insert before the chain owner
      chain.splice(updatedCurrentIndex, 0, newNodeId);
    } else {
      // More specific - insert after the chain owner
      chain.splice(updatedCurrentIndex + 1, 0, newNodeId);
    }
    
    console.log(`Added ${newNodeId} ${direction} ${nodeId} in ${dimension} dimension. Chain:`, chain);
  })),
  
  // Remove a node from an abstraction chain
  removeFromAbstractionChain: (nodeId, dimension, nodeToRemove) => set(produce((draft) => {
    const node = draft.nodePrototypes.get(nodeId);
    if (!node?.abstractionChains?.[dimension]) return;
    
    const chain = node.abstractionChains[dimension];
    const index = chain.indexOf(nodeToRemove);
    if (index > -1) {
      chain.splice(index, 1);
      console.log(`Removed ${nodeToRemove} from ${nodeId}'s ${dimension} chain`);
    }
  })),
  
  // Replace a node in the canvas with one from the abstraction chain
  swapNodeInChain: (currentNodeId, newNodeId) => set(produce((draft) => {
    // This will be used by the swap button in the carousel
    // For now, just log the action - the actual swap will happen in the UI layer
    console.log(`Swapping ${currentNodeId} with ${newNodeId}`);
  })),

  clearUniverse: () => set(() => ({
    graphs: new Map(),
    nodePrototypes: new Map(),
    edges: new Map(),
    openGraphIds: [],
    activeGraphId: null,
    activeDefinitionNodeId: null,
    rightPanelTabs: [{ type: 'home', isActive: true }],
    expandedGraphIds: new Set(),
    savedNodeIds: new Set(),
    savedGraphIds: new Set(),
    isUniverseLoaded: false,
    isUniverseLoading: false,
    universeLoadingError: null,
    hasUniverseFile: false,
  })),

  setUniverseConnected: (hasFile = true) => set(state => ({
    ...state,
    hasUniverseFile: hasFile
  })),

  updateGraphView: (graphId, panOffset, zoomLevel) => {
    set(produce((draft) => {
      const graph = draft.graphs.get(graphId);
      if (graph) {
        graph.panOffset = panOffset;
        graph.zoomLevel = zoomLevel;
      }
    }));
    notifyChanges(); // for auto-save
  },

  }; // End of returned state and actions object
})); // End of create function with middleware

// --- Selectors --- (Return plain data, add edge selector)

export const getGraphDataById = (id) => (state) => state.graphs.get(id);
export const getNodePrototypeById = (id) => (state) => state.nodePrototypes.get(id);
export const getEdgeDataById = (id) => (state) => state.edges.get(id);

export const getActiveGraphData = (state) => state.graphs.get(state.activeGraphId);

// Returns NodeInstance objects for a given graph ID
export const getInstancesForGraph = (graphId) => (state) => {
  const graph = state.graphs.get(graphId);
  if (!graph || !graph.instances) return [];
  return Array.from(graph.instances.values());
};

// Returns fully hydrated node objects (instance + prototype data) for rendering
export const getHydratedNodesForGraph = (graphId) => (state) => {
    const graph = state.graphs.get(graphId);
    if (!graph || !graph.instances) return [];
    
    return Array.from(graph.instances.values()).map(instance => {
        const prototype = state.nodePrototypes.get(instance.prototypeId);
        if (!prototype) return null;
        return {
            ...prototype, // Spread prototype properties (name, color, etc.)
            ...instance, // Spread instance properties (id, x, y, scale), overwriting prototype id with instanceId
        };
    }).filter(Boolean); // Filter out any cases where prototype might be missing
};


// Returns EdgeData objects for a given graph ID
export const getEdgesForGraph = (graphId) => (state) => {
    const graph = state.graphs.get(graphId);
    if (!graph || !graph.edgeIds) return [];
    return graph.edgeIds.map(edgeId => state.edges.get(edgeId)).filter(Boolean);
};

// This selector is likely no longer needed or needs to be re-thought.
// It was for finding nodes within a definition graph based on a parent.
export const getNodesByParent = (parentId) => (state) => {
    const nodes = [];
    for (const nodeData of state.nodePrototypes.values()) {
        // This logic is probably incorrect with the new model.
        // if (nodeData.parentDefinitionNodeId === parentId) {
        //     nodes.push(nodeData);
        // }
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
export const getNodeTypesInHierarchy = (nodeId) => (state) => {
  const types = [];
  let currentId = nodeId;
  const visited = new Set();
  
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = state.nodePrototypes.get(currentId);
    if (node) {
      types.push(node);
      currentId = node.typeNodeId;
    } else {
      break;
    }
  }
  
  return types;
};

// Export the store hook
export default useGraphStore; 

// Auto-save is now handled by the fileStorage module directly with enableAutoSave()
// This file has been refactored to use a prototype/instance model.
// - The global `nodes` map is now `nodePrototypes`.
// - `Graph` objects contain an `instances` map instead of `nodeIds`.
// - Actions now operate on `nodePrototypes` and `instances` separately.
// - Edges connect `instanceId`s.
// - Selectors have been updated to provide data in the new format.
//
// TODO: Update all dependent components (`NodeCanvas.jsx`, `Node.jsx`, etc.)
// to use the new actions and selectors.

// Auto-save is now handled by the fileStorage module directly with enableAutoSave() 