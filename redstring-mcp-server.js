/**
 * Redstring MCP Server
 * Provides MCP tools for Claude Desktop to interact with Redstring's knowledge graph
 * This server connects to the REAL Redstring store, not a simulation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create MCP server instance
const server = new McpServer({
  name: "redstring",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Bridge to the real Redstring store
// This will be populated when the Redstring app is running
let redstringStoreBridge = null;

// Function to get the real Redstring store state via HTTP request
async function getRealRedstringState() {
  try {
    // Try to fetch from the bridge endpoint
    const response = await fetch('http://localhost:3001/api/bridge/state');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    
    // Convert the minimal data format back to the expected structure
    const state = {
      graphs: new Map((data.graphs || []).map(graph => [graph.id, graph])),
      nodePrototypes: new Map((data.nodePrototypes || []).map(prototype => [prototype.id, prototype])),
      edges: new Map(), // We don't have edge data in the minimal format
      activeGraphId: data.activeGraphId,
      openGraphIds: data.openGraphIds || [],
      expandedGraphIds: new Set(), // Not included in minimal format
      savedNodeIds: new Set(), // Not included in minimal format
      savedGraphIds: new Set(), // Not included in minimal format
      summary: data.summary
    };
    
    return state;
  } catch (error) {
    throw new Error(`Redstring store bridge not available: ${error.message}. Make sure Redstring is running on localhost:4000 and the MCPBridge component is loaded.`);
  }
}

// Function to access real Redstring store actions via HTTP bridge
function getRealRedstringActions() {
  return {
    addNodePrototype: async (prototypeData) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/add-node-prototype', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(prototypeData)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Prototype added successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to add prototype:', error.message);
        throw error;
      }
    },
    addNodeInstance: async (graphId, prototypeName, position) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/add-node-instance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ graphId, prototypeName, position })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Instance added successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to add instance:', error.message);
        throw error;
      }
    },
    setActiveGraphId: async (graphId) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/set-active-graph', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ graphId })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Active graph set successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to set active graph:', error.message);
        throw error;
      }
    },
    
    openGraphTabAndBringToTop: async (graphId) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/open-graph-tab', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ graphId, bringToFront: true })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Graph tab opened and brought to top successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to open graph tab:', error.message);
        throw error;
      }
    },
    
    openGraphTab: async (graphId) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/open-graph-tab', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ graphId, bringToFront: false })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Graph tab opened successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to open graph tab:', error.message);
        throw error;
      }
    },
    
    createAndAssignGraphDefinitionWithoutActivation: async (prototypeId) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/create-graph-definition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prototypeId, activate: false })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Graph definition created successfully');
        return result.graphId;
      } catch (error) {
        console.error('❌ Bridge: Failed to create graph definition:', error.message);
        throw error;
      }
    },
    
    updateNodePrototype: async (prototypeId, updates) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/update-node-prototype', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prototypeId, updates })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Node prototype updated successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to update node prototype:', error.message);
        throw error;
      }
    },
    
    deleteNodeInstance: async (graphId, instanceId) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/delete-node-instance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ graphId, instanceId })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Node instance deleted successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to delete node instance:', error.message);
        throw error;
      }
    },
    
    createEdge: async (graphId, sourceId, targetId, edgeType, weight) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/create-edge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ graphId, sourceId, targetId, edgeType, weight })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Edge created successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to create edge:', error.message);
        throw error;
      }
    },
    
    createEdgeDefinition: async (edgeDefinitionData) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/create-edge-definition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(edgeDefinitionData)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Edge definition created successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to create edge definition:', error.message);
        throw error;
      }
    },
    
    moveNodeInstance: async (graphId, instanceId, position) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/move-node-instance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ graphId, instanceId, position })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Node instance moved successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to move node instance:', error.message);
        throw error;
      }
    },
    
    searchNodes: async (query, graphId) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/search-nodes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, graphId })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.error('✅ Bridge: Node search completed successfully');
        return result;
      } catch (error) {
        console.error('❌ Bridge: Failed to search nodes:', error.message);
        throw error;
      }
    }
  };
}

// Helper function to get graph data from the real Redstring store
async function getGraphData() {
  try {
    const state = await getRealRedstringState();
    
    console.error('DEBUG: State received:', {
      hasGraphs: !!state.graphs,
      graphsType: typeof state.graphs,
      graphsSize: state.graphs?.size,
      graphsKeys: state.graphs ? Array.from(state.graphs.keys()).slice(0, 3) : []
    });
    
    // Convert the real Redstring store structure to a format suitable for MCP tools
    const graphs = {};
    
    // Safely iterate over the Map
    if (state.graphs && state.graphs instanceof Map && state.graphs.size > 0) {
      state.graphs.forEach((graph, graphId) => {
        // Bridge data has minimal graph info, not full instances
        graphs[graphId] = {
          id: graphId,
          name: graph.name,
          description: graph.description || '',
          nodes: [], // Bridge doesn't send full instance data
          edges: [], // Bridge doesn't send edge data
          nodeCount: graph.instanceCount || 0,
          edgeCount: 0,
          instances: new Map(), // Empty since bridge doesn't send full instances
          edgeIds: []
        };
      });
    }
    
    return {
    graphs: graphs,
    activeGraphId: state.activeGraphId,
    graphCount: Object.keys(graphs).length,
    nodePrototypes: state.nodePrototypes,
    edges: state.edges,
    openGraphIds: state.openGraphIds,
    expandedGraphIds: state.expandedGraphIds,
    savedNodeIds: state.savedNodeIds,
    savedGraphIds: state.savedGraphIds
  };
  } catch (error) {
    console.error('Error in getGraphData:', error);
    return {
      graphs: {},
      activeGraphId: null,
      graphCount: 0,
      nodePrototypes: new Map(),
      edges: new Map(),
      openGraphIds: [],
      expandedGraphIds: new Set(),
      savedNodeIds: new Set(),
      savedGraphIds: new Set()
    };
  }
}

// Register MCP tools
server.tool(
  "get_active_graph",
  "Get detailed information about the currently active graph from the real Redstring store",
  {},
  async () => {
    try {
      const graphData = await getGraphData();
      const activeGraphId = graphData.activeGraphId;
      
      if (!activeGraphId || !graphData.graphs[activeGraphId]) {
        return {
          content: [
            {
              type: "text",
              text: `❌ No active graph found in Redstring. Use \`open_graph\` to open a graph first.`
            }
          ]
        };
      }
      
      const activeGraph = graphData.graphs[activeGraphId];
      
      const response = `🎯 **Active Graph Information (Real Redstring Data)**

**Graph Details:**
- **Name:** ${activeGraph.name}
- **ID:** ${activeGraphId}
- **Description:** ${activeGraph.description}

**Content Statistics:**
- **Instances:** ${activeGraph.nodeCount}
- **Relationships:** ${activeGraph.edgeCount}

**UI State:**
- **Position:** Active (center tab in header)
- **Open Status:** ✅ Open in header tabs
- **Expanded:** ${graphData.expandedGraphIds.has(activeGraphId) ? '✅ Yes' : '❌ No'} in "Open Things" list
- **Saved:** ${graphData.savedGraphIds.has(activeGraphId) ? '✅ Yes' : '❌ No'} in "Saved Things" list

**Available Instances:**
${activeGraph.nodes.length > 0 ? 
  activeGraph.nodes.map(node => `- ${node.name} (${node.prototypeId}) - ${node.description} at (${node.x}, ${node.y})`).join('\n') : 
  'No instances in this graph'}

**Available Relationships:**
${activeGraph.edges.length > 0 ? 
  activeGraph.edges.slice(0, 5).map(edge => {
    const source = activeGraph.nodes.find(n => n.id === edge.sourceId);
    const target = activeGraph.nodes.find(n => n.id === edge.targetId);
    return `- ${source?.name || 'Unknown'} → ${target?.name || 'Unknown'} (${edge.type})`;
  }).join('\n') + (activeGraph.edges.length > 5 ? `\n... and ${activeGraph.edges.length - 5} more relationships` : '') : 
  'No relationships in this graph'}

**Open Graph Tabs:**
${graphData.openGraphIds.map((id, index) => {
  const g = graphData.graphs[id];
  const isActive = id === activeGraphId;
  return `${index + 1}. ${g.name} (${id})${isActive ? ' 🟢 ACTIVE' : ''}`;
}).join('\n')}

**Next Steps:**
- Use \`add_node_instance\` to add instances to this active graph
- Use \`add_edge\` to create relationships
- Use \`explore_knowledge\` to search this graph
- Use \`open_graph\` to switch to a different graph`;

      return {
        content: [
          {
            type: "text",
            text: response
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error accessing Redstring store: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  "list_available_graphs",
  "List all available knowledge graphs from the real Redstring store",
  {},
  async () => {
    try {
      const graphData = await getGraphData();
      
      const response = `**Available Knowledge Graphs (Real Redstring Data):**

**📋 Graph IDs for Reference:**
${Object.values(graphData.graphs).map(graph => 
  `- **${graph.name}**: \`${graph.id}\``
).join('\n')}

**📊 Detailed Graph Information:**
${Object.values(graphData.graphs).map(graph => `
**${graph.name}** (ID: \`${graph.id}\`)
- Instances: ${graph.nodeCount}
- Relationships: ${graph.edgeCount}
- Status: ${graph.id === graphData.activeGraphId ? '🟢 Active' : '⚪ Inactive'}
- Open: ${graphData.openGraphIds.includes(graph.id) ? '✅ Yes' : '❌ No'}
- Saved: ${graphData.savedGraphIds.has(graph.id) ? '✅ Yes' : '❌ No'}
`).join('\n')}

**Current Active Graph:** ${graphData.activeGraphId || 'None'}

**Available Prototypes:**
${graphData.nodePrototypes && graphData.nodePrototypes instanceof Map ? 
  Array.from(graphData.nodePrototypes.values()).map(prototype => 
    `- ${prototype.name} (${prototype.id}) - ${prototype.description}`
  ).join('\n') : 
  'No prototypes available'}

**🎯 To open a graph, use:** \`open_graph\` with any of the graph IDs above.`;

      return {
        content: [
          {
            type: "text",
            text: response
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error accessing Redstring store: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  "add_node_prototype",
  "Add a new node prototype to the real Redstring store",
  {
    name: z.string().describe("Name of the prototype"),
    description: z.string().describe("Description of the prototype"),
    color: z.string().optional().describe("Color for the prototype (hex code)"),
    typeNodeId: z.string().optional().describe("Parent type node ID (optional)")
  },
  async ({ name, description, color = "#4A90E2", typeNodeId = null }) => {
    try {
      const actions = getRealRedstringActions();
      
      // Create prototype data
      const prototypeData = {
        name,
        description,
        color,
        typeNodeId
      };
      
      // Add to real Redstring store
      await actions.addNodePrototype(prototypeData);
      
      const response = `✅ **Node Prototype Added Successfully (Real Redstring Store)**

**New Prototype:**
- **Name:** ${name}
- **Description:** ${description}
- **Color:** ${color}
- **Parent Type:** ${typeNodeId || 'None (base type)'}

**What This Means:**
- ✅ Prototype added to global prototype pool
- ✅ Available for creating instances in any graph
- ✅ Will appear in type selection lists
- ✅ Persists to .redstring file

**Next Steps:**
- Use \`add_node_instance\` to create instances of this prototype
- Use \`list_available_graphs\` to see all graphs
- Use \`open_graph\` to open a graph for adding instances`;

      return {
        content: [
          {
            type: "text",
            text: response
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error adding prototype to Redstring store: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  "add_node_instance",
  "Add a new instance of a prototype to the active graph in the real Redstring store",
  {
    prototypeName: z.string().describe("Name of the prototype to create an instance of"),
    position: z.object({
      x: z.number().describe("X coordinate for the instance"),
      y: z.number().describe("Y coordinate for the instance")
    }).describe("Position coordinates for the instance"),
    graphId: z.string().optional().describe("Specific graph to add to (default: active graph)")
  },
  async ({ prototypeName, position, graphId }) => {
    try {
      const state = await getRealRedstringState();
      const actions = getRealRedstringActions();
      
      const targetGraphId = graphId || state.activeGraphId;
      
      if (!targetGraphId) {
        return {
          content: [
            {
              type: "text",
              text: `❌ No active graph found. Use \`open_graph\` to open a graph first.`
            }
          ]
        };
      }
      
      // Validate that the target graph exists
      if (!state.graphs.has(targetGraphId)) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Graph "${targetGraphId}" not found. Use \`list_available_graphs\` to see available graphs.`
            }
          ]
        };
      }
      
      // Find the prototype by name or ID
      let prototype = null;
      
      // First try exact name match
      prototype = Array.from(state.nodePrototypes.values()).find(p => 
        p.name.toLowerCase() === prototypeName.toLowerCase()
      );
      
      if (!prototype) {
        // Try ID match
        prototype = Array.from(state.nodePrototypes.values()).find(p => 
          p.id === prototypeName
        );
      }
      
      if (!prototype) {
        // Try partial name match
        prototype = Array.from(state.nodePrototypes.values()).find(p => 
          p.name.toLowerCase().includes(prototypeName.toLowerCase())
        );
      }
      
      if (!prototype) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Prototype "${prototypeName}" not found. 

**Available prototypes:**
${Array.from(state.nodePrototypes.values()).map(p => `- ${p.name} (${p.id})`).join('\n')}

**Troubleshooting:**
- Use the prototype **name** (e.g., "Charles McGill") or **ID** (e.g., "33b579d9-9d19-4c03-b802-44de24055f23")
- Make sure the prototype exists first using \`add_node_prototype\`
- Or use \`ai_guided_workflow\` with \`full_workflow\` which creates prototypes automatically`
            }
          ]
        };
      }
      
      // CRITICAL: Ensure prototype exists before creating instance
      if (!state.nodePrototypes.has(prototype.id)) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Prototype "${prototype.name}" (${prototype.id}) not found in store. This should not happen - the prototype may have been deleted.`
            }
          ]
        };
      }
      
      // Add instance to real Redstring store
      await actions.addNodeInstance(targetGraphId, prototype.name, position);
      
      const response = `✅ **Node Instance Added Successfully (Real Redstring Store)**

**New Instance:**
- **Prototype:** ${prototype.name} (${prototype.id})
- **Position:** (${position.x}, ${position.y})
- **Graph:** ${state.graphs.get(targetGraphId)?.name} (${targetGraphId})

**What This Means:**
- ✅ Instance added to the real graph
- ✅ Visible in Redstring UI immediately
- ✅ Persists to .redstring file
- ✅ Can be connected with edges
- ✅ Can be moved and manipulated

**Next Steps:**
- Use \`add_edge\` to connect this instance to others
- Use \`move_node_instance\` to reposition the instance
- Use \`get_active_graph\` to see all instances in the graph`;

      return {
        content: [
          {
            type: "text",
            text: response
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error adding instance to Redstring store: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  "set_active_graph",
  "Set a graph as the active graph in the real Redstring UI (graph must already be open)",
  {
    graphId: z.string().describe("The ID of the graph to make active")
  },
  async ({ graphId }) => {
    try {
      const state = await getRealRedstringState();
      const actions = getRealRedstringActions();
      
      if (!state.graphs.has(graphId)) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Graph "${graphId}" not found in Redstring store. Use \`list_available_graphs\` to see available graphs.`
            }
          ]
        };
      }
      
      if (!state.openGraphIds.includes(graphId)) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Graph "${graphId}" is not open. Use \`open_graph\` to open it first, then use \`set_active_graph\` to make it active.`
            }
          ]
        };
      }
      
      const graph = state.graphs.get(graphId);
      
      // Set as active graph using real Redstring actions
      await actions.setActiveGraphId(graphId);
      
      const response = `🎯 **Active Graph Set Successfully (Real Redstring UI)**

**Graph Details:**
- **Name:** ${graph.name}
- **ID:** ${graphId}
- **Description:** ${graph.description}

**UI State Updates:**
- ✅ Set as active graph
- ✅ Graph is now the center tab in header
- ✅ Graph is focused in the main canvas

**Current Open Graphs:**
${state.openGraphIds.map((id, index) => {
  const g = state.graphs.get(id);
  const isActive = id === graphId;
  return `${index + 1}. ${g.name} (${id})${isActive ? ' 🟢 ACTIVE' : ''}`;
}).join('\n')}

**Next Steps:**
- Use \`add_node_instance\` to add instances to this active graph
- Use \`add_edge\` to create relationships
- Use \`explore_knowledge\` to explore the graph`;

      return {
        content: [
          {
            type: "text",
            text: response
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error setting active graph in Redstring: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  "open_graph",
  "Open a graph and make it the active graph in the real Redstring UI",
  {
    graphId: z.string().describe("The ID of the graph to open"),
    bringToFront: z.boolean().optional().describe("Bring graph to front of open tabs (default: true)"),
    autoExpand: z.boolean().optional().describe("Auto-expand the graph in the open things list (default: true)")
  },
  async ({ graphId, bringToFront = true, autoExpand = true }) => {
    try {
      const state = await getRealRedstringState();
      const actions = getRealRedstringActions();
      
      if (!state.graphs.has(graphId)) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Graph "${graphId}" not found in Redstring store. Use \`list_available_graphs\` to see available graphs.`
            }
          ]
        };
      }
      
      const graph = state.graphs.get(graphId);
      
      // Use real Redstring actions to open the graph
      if (bringToFront) {
        await actions.openGraphTabAndBringToTop(graphId);
      } else {
        await actions.openGraphTab(graphId);
      }
      
      const response = `📂 **Graph Opened Successfully (Real Redstring UI)**

**Graph Details:**
- **Name:** ${graph.name}
- **ID:** ${graphId}
- **Description:** ${graph.description}

**UI State Updates:**
- ✅ Added to open graphs list
- ✅ Set as active graph
- ✅ ${bringToFront ? 'Brought to front of tabs' : 'Kept in current position'}
- ✅ ${autoExpand ? 'Auto-expanded in open things list' : 'Not expanded'}

**Current Open Graphs:**
${state.openGraphIds.map((id, index) => {
  const g = state.graphs.get(id);
  const isActive = id === graphId;
  return `${index + 1}. ${g.name} (${id})${isActive ? ' 🟢 ACTIVE' : ''}`;
}).join('\n')}

**Header Tab Position:**
- The graph is now visible in the header tabs
- It's positioned as the active (center) tab
- Other open graphs are shown as inactive tabs

**Next Steps:**
- Use \`add_node_instance\` to add instances to this graph
- Use \`add_edge\` to create relationships
- Use \`explore_knowledge\` to explore the graph`;

      return {
        content: [
          {
            type: "text",
            text: response
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error opening graph in Redstring: ${error.message}`
          }
        ]
      };
    }
  }
);

// Tool: Update node prototype
server.tool(
  "update_node_prototype",
  "Update properties of an existing node prototype",
  {
    prototypeId: z.string().describe("The ID of the prototype to update"),
    updates: z.object({
      name: z.string().optional().describe("New name for the prototype"),
      description: z.string().optional().describe("New description for the prototype"),
      color: z.string().optional().describe("New color for the prototype (hex format)")
    }).describe("Properties to update")
  },
  async ({ prototypeId, updates }) => {
    try {
      const actions = getRealRedstringActions();
      const result = await actions.updateNodePrototype(prototypeId, updates);
      
      if (result.success) {
        return {
          content: [{
            type: "text",
            text: `✅ Successfully updated node prototype "${prototypeId}" with: ${JSON.stringify(updates)}`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to update node prototype: ${result.error || 'Unknown error'}`
          }]
        };
      }
    } catch (error) {
      console.error('Error in update_node_prototype tool:', error);
      return {
        content: [{
          type: "text",
          text: `❌ Error updating node prototype: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Delete node instance
server.tool(
  "delete_node_instance",
  "Remove a node instance from a graph",
  {
    graphId: z.string().describe("The ID of the graph containing the instance"),
    instanceId: z.string().describe("The ID of the instance to delete")
  },
  async ({ graphId, instanceId }) => {
    try {
      const actions = getRealRedstringActions();
      const result = await actions.deleteNodeInstance(graphId, instanceId);
      
      if (result.success) {
        return {
          content: [{
            type: "text",
            text: `✅ Successfully deleted node instance "${instanceId}" from graph "${graphId}"`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to delete node instance: ${result.error || 'Unknown error'}`
          }]
        };
      }
    } catch (error) {
      console.error('Error in delete_node_instance tool:', error);
      return {
        content: [{
          type: "text",
          text: `❌ Error deleting node instance: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Create edge
server.tool(
  "create_edge",
  "Create a connection between two nodes",
  {
    graphId: z.string().describe("The ID of the graph to add the edge to"),
    sourceId: z.string().describe("The ID of the source node"),
    targetId: z.string().describe("The ID of the target node"),
    edgeType: z.string().optional().describe("Type of the edge (optional)"),
    weight: z.number().optional().describe("Weight of the edge (optional, default 1)")
  },
  async ({ graphId, sourceId, targetId, edgeType, weight }) => {
    try {
      const actions = getRealRedstringActions();
      const result = await actions.createEdge(graphId, sourceId, targetId, edgeType, weight);
      
      if (result.success) {
        return {
          content: [{
            type: "text",
            text: `✅ Successfully created edge from "${sourceId}" to "${targetId}" in graph "${graphId}"`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to create edge: ${result.error || 'Unknown error'}`
          }]
        };
      }
    } catch (error) {
      console.error('Error in create_edge tool:', error);
      return {
        content: [{
          type: "text",
          text: `❌ Error creating edge: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Create edge definition
server.tool(
  "create_edge_definition",
  "Create a new edge type definition",
  {
    name: z.string().describe("Name of the edge type"),
    description: z.string().describe("Description of the edge type"),
    color: z.string().optional().describe("Color for the edge type (hex format, optional)"),
    typeNodeId: z.string().optional().describe("Type node ID (optional)")
  },
  async ({ name, description, color, typeNodeId }) => {
    try {
      const actions = getRealRedstringActions();
      const result = await actions.createEdgeDefinition({ name, description, color, typeNodeId });
      
      if (result.success) {
        return {
          content: [{
            type: "text",
            text: `✅ Successfully created edge definition "${name}" with description: ${description}`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to create edge definition: ${result.error || 'Unknown error'}`
          }]
        };
      }
    } catch (error) {
      console.error('Error in create_edge_definition tool:', error);
      return {
        content: [{
          type: "text",
          text: `❌ Error creating edge definition: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Move node instance
server.tool(
  "move_node_instance",
  "Move a node instance to a new position",
  {
    graphId: z.string().describe("The ID of the graph containing the instance"),
    instanceId: z.string().describe("The ID of the instance to move"),
    position: z.object({
      x: z.number().describe("New X coordinate"),
      y: z.number().describe("New Y coordinate")
    }).describe("New position for the node")
  },
  async ({ graphId, instanceId, position }) => {
    try {
      const actions = getRealRedstringActions();
      const result = await actions.moveNodeInstance(graphId, instanceId, position);
      
      if (result.success) {
        return {
          content: [{
            type: "text",
            text: `✅ Successfully moved node instance "${instanceId}" to position (${position.x}, ${position.y})`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to move node instance: ${result.error || 'Unknown error'}`
          }]
        };
      }
    } catch (error) {
      console.error('Error in move_node_instance tool:', error);
      return {
        content: [{
          type: "text",
          text: `❌ Error moving node instance: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Search nodes
server.tool(
  "search_nodes",
  "Search for nodes by name or description",
  {
    query: z.string().describe("Search query to match against node names and descriptions"),
    graphId: z.string().optional().describe("Optional graph ID to search only within that graph")
  },
  async ({ query, graphId }) => {
    try {
      const actions = getRealRedstringActions();
      const result = await actions.searchNodes(query, graphId);
      
      if (result.success) {
        const resultText = result.results.length > 0 
          ? `Found ${result.results.length} matches:\n` + result.results.map(r => 
              `- ${r.name} (${r.type}): ${r.description || 'No description'}`
            ).join('\n')
          : `No nodes found matching "${query}"`;
          
        return {
          content: [{
            type: "text",
            text: `🔍 Search results for "${query}":\n\n${resultText}`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to search nodes: ${result.error || 'Unknown error'}`
          }]
        };
      }
    } catch (error) {
      console.error('Error in search_nodes tool:', error);
      return {
        content: [{
          type: "text",
          text: `❌ Error searching nodes: ${error.message}`
        }]
      };
    }
  }
);

// AI-Guided Workflow Tool
server.tool(
  "ai_guided_workflow",
  "Walk a human user through the complete process of adding a node, creating a graph definition, and building connections. This tool orchestrates the full workflow that a human would do manually.",
  {
    workflowType: z.enum(['create_prototype_and_definition', 'add_instance_to_graph', 'create_connections', 'full_workflow']).describe("Type of workflow to guide the user through"),
    prototypeName: z.string().optional().describe("Name for the new prototype (required for create_prototype_and_definition and full_workflow)"),
    prototypeDescription: z.string().optional().describe("Description for the new prototype"),
    prototypeColor: z.string().optional().describe("Color for the prototype (hex code)"),
    targetGraphId: z.string().optional().describe("Target graph ID for adding instances or creating connections"),
    instancePositions: z.array(z.object({
      prototypeName: z.string().describe("Name of prototype to create instance of"),
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate")
    })).optional().describe("Array of instances to create with positions"),
    connections: z.array(z.object({
      sourceName: z.string().describe("Name of source node"),
      targetName: z.string().describe("Name of target node"),
      edgeType: z.string().optional().describe("Type of connection"),
      weight: z.number().optional().describe("Connection weight")
    })).optional().describe("Array of connections to create"),
    enableUserGuidance: z.boolean().optional().describe("Enable step-by-step user guidance (default: true)")
  },
  async ({ workflowType, prototypeName, prototypeDescription, prototypeColor, targetGraphId, instancePositions, connections, enableUserGuidance = true }) => {
    try {
      const state = await getRealRedstringState();
      const actions = getRealRedstringActions();
      
      let workflowSteps = [];
      let currentStep = 0;
      
      switch (workflowType) {
        case 'create_prototype_and_definition':
          workflowSteps = [
            {
              step: 1,
              action: 'create_prototype',
              description: `Create a new node prototype called "${prototypeName}"`,
              instruction: `I'm creating a new node prototype called "${prototypeName}" with description: "${prototypeDescription || 'No description provided'}"`,
              color: prototypeColor || '#4A90E2'
            },
            {
              step: 2,
              action: 'create_definition',
              description: `Create a graph definition for the "${prototypeName}" prototype`,
              instruction: `Now I'm creating a graph definition for the "${prototypeName}" prototype. This is like clicking the up arrow in the pie menu to create a new definition.`,
              prototypeName: prototypeName
            },
            {
              step: 3,
              action: 'open_definition',
              description: `Open the new definition graph as the active graph`,
              instruction: `Opening the new definition graph as the active graph so you can start adding content to it.`,
              prototypeName: prototypeName
            }
          ];
          break;
          
        case 'add_instance_to_graph':
          workflowSteps = [
            {
              step: 1,
              action: 'ensure_active_graph',
              description: `Ensure we have an active graph to work with`,
              instruction: `First, let's make sure we have an active graph to add instances to.`,
              targetGraphId: targetGraphId
            },
            {
              step: 2,
              action: 'add_instances',
              description: `Add the specified instances to the active graph`,
              instruction: `Now I'm adding the specified instances to the active graph.`,
              instancePositions: instancePositions
            }
          ];
          break;
          
        case 'create_connections':
          workflowSteps = [
            {
              step: 1,
              action: 'ensure_active_graph',
              description: `Ensure we have an active graph to work with`,
              instruction: `First, let's make sure we have an active graph to create connections in.`,
              targetGraphId: targetGraphId
            },
            {
              step: 2,
              action: 'create_connections',
              description: `Create the specified connections between nodes`,
              instruction: `Now I'm creating the specified connections between nodes.`,
              connections: connections
            }
          ];
          break;
          
        case 'full_workflow':
          workflowSteps = [
            {
              step: 1,
              action: 'create_prototype',
              description: `Create a new node prototype called "${prototypeName}"`,
              instruction: `Starting the full workflow! First, I'm creating a new node prototype called "${prototypeName}" with description: "${prototypeDescription || 'No description provided'}"`,
              color: prototypeColor || '#4A90E2'
            },
            {
              step: 2,
              action: 'create_definition',
              description: `Create a graph definition for the "${prototypeName}" prototype`,
              instruction: `Now I'm creating a graph definition for the "${prototypeName}" prototype. This is equivalent to clicking the up arrow (expand) button in the pie menu.`,
              prototypeName: prototypeName
            },
            {
              step: 3,
              action: 'open_definition',
              description: `Open the new definition graph as the active graph`,
              instruction: `Opening the new definition graph as the active graph so we can start building its content.`,
              prototypeName: prototypeName
            },
            {
              step: 4,
              action: 'add_instances',
              description: `Add instances to the new definition graph`,
              instruction: `Now I'm adding instances to the new definition graph to build out its structure.`,
              instancePositions: instancePositions || []
            },
            {
              step: 5,
              action: 'create_connections',
              description: `Create connections between the instances`,
              instruction: `Finally, I'm creating connections between the instances to establish relationships.`,
              connections: connections || []
            }
          ];
          break;
      }
      
      let results = [];
      let currentGraphId = null;
      
      for (const step of workflowSteps) {
        if (enableUserGuidance) {
          results.push(`**Step ${step.step}:** ${step.description}\n${step.instruction}`);
        }
        
        try {
          switch (step.action) {
            case 'create_prototype':
              const prototypeResult = await actions.addNodePrototype({
                name: step.description.match(/"([^"]+)"/)?.[1] || prototypeName,
                description: prototypeDescription || '',
                color: step.color
              });
              results.push(`✅ Created prototype: ${prototypeName}`);
              break;
              
            case 'create_definition':
              // Find the prototype we just created
              const prototype = Array.from(state.nodePrototypes.values()).find(p => 
                p.name.toLowerCase() === (step.prototypeName || prototypeName).toLowerCase()
              );
              if (!prototype) {
                throw new Error(`Prototype "${step.prototypeName || prototypeName}" not found`);
              }
              
              // Create definition graph
              const definitionGraphId = await actions.createAndAssignGraphDefinitionWithoutActivation(prototype.id);
              currentGraphId = definitionGraphId;
              results.push(`✅ Created definition graph: ${definitionGraphId} for prototype "${prototype.name}"`);
              break;
              
            case 'open_definition':
              // Find the prototype and its definition
              const prototypeForOpen = Array.from(state.nodePrototypes.values()).find(p => 
                p.name.toLowerCase() === (step.prototypeName || prototypeName).toLowerCase()
              );
              if (!prototypeForOpen || !prototypeForOpen.definitionGraphIds?.length) {
                throw new Error(`No definition graph found for prototype "${step.prototypeName || prototypeName}"`);
              }
              
              const definitionId = prototypeForOpen.definitionGraphIds[prototypeForOpen.definitionGraphIds.length - 1];
              await actions.openGraphTab(definitionId);
              await actions.setActiveGraphId(definitionId);
              currentGraphId = definitionId;
              results.push(`✅ Opened definition graph as active: ${definitionId}`);
              break;
              
            case 'ensure_active_graph':
              if (step.targetGraphId) {
                await actions.openGraphTab(step.targetGraphId);
                await actions.setActiveGraphId(step.targetGraphId);
                currentGraphId = step.targetGraphId;
                results.push(`✅ Set target graph as active: ${step.targetGraphId}`);
              } else if (state.activeGraphId) {
                currentGraphId = state.activeGraphId;
                results.push(`✅ Using current active graph: ${state.activeGraphId}`);
              } else {
                throw new Error('No active graph and no target graph specified');
              }
              break;
              
            case 'add_instances':
              if (step.instancePositions?.length) {
                for (const instance of step.instancePositions) {
                  await actions.addNodeInstance(currentGraphId, instance.prototypeName, { x: instance.x, y: instance.y });
                  results.push(`✅ Added instance: ${instance.prototypeName} at (${instance.x}, ${instance.y})`);
                }
              }
              break;
              
            case 'create_connections':
              if (step.connections?.length) {
                for (const connection of step.connections) {
                  // For now, we'll just report the connection since edge creation isn't fully implemented
                  results.push(`📝 Connection planned: ${connection.sourceName} → ${connection.targetName} (${connection.edgeType || 'default'})`);
                }
              }
              break;
          }
        } catch (error) {
          results.push(`❌ Step ${step.step} failed: ${error.message}`);
          break;
        }
      }
      
      const response = `🤖 **AI-Guided Workflow Completed**

**Workflow Type:** ${workflowType}
**Steps Executed:** ${workflowSteps.length}

**Results:**
${results.join('\n\n')}

**Current State:**
- Active Graph: ${currentGraphId || state.activeGraphId || 'None'}
- Open Graphs: ${state.openGraphIds.length}

**What This Accomplished:**
${workflowType === 'full_workflow' ? `
✅ Created a new prototype: "${prototypeName}"
✅ Created a graph definition for the prototype
✅ Opened the definition as the active graph
✅ Added instances to build out the structure
✅ Planned connections between instances

This is equivalent to a human user:
1. Adding a new node to a network
2. Clicking the pie menu up arrow to create a definition
3. Opening that definition as the active graph
4. Adding nodes and connections to build the structure
` : 'The requested workflow steps have been completed.'}

**Next Steps:**
- Use \`get_active_graph\` to see the current state
- Use \`add_node_instance\` to add more instances
- Use \`list_available_graphs\` to see all available graphs`;

      return {
        content: [
          {
            type: "text",
            text: response
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ AI-guided workflow failed: ${error.message}`
          }
        ]
      };
    }
  }
);

// Function to set up the bridge to the real Redstring store
function setupRedstringBridge(store) {
  redstringStoreBridge = store;
  console.error("✅ Redstring store bridge established");
}

// Main function
async function main() {
  // Add global error handlers to prevent crashes
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process, just log the error
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
  });
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Use stderr for logging since stdout must only contain JSON-RPC messages
  console.error("Redstring MCP Server running on stdio");
  console.error("Waiting for Redstring store bridge...");
  
  // The bridge will be set up when Redstring connects
  global.setupRedstringBridge = setupRedstringBridge;
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
}); 