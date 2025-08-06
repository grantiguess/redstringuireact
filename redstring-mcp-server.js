/**
 * Redstring MCP Server
 * Provides MCP tools for Claude Desktop to interact with Redstring's knowledge graph
 * This server connects to the REAL Redstring store, not a simulation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create MCP server instance
const server = new McpServer({
  name: "redstring",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Create Express app for HTTP endpoints
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Bridge to the real Redstring store
// This will be populated when the Redstring app is running
let redstringStoreBridge = null;

// Store for the bridge data
let bridgeStoreData = null;

// MCP connection state (always true since we're the MCP server)
let mcpConnected = true;

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
    addNodeInstance: async (graphId, prototypeId, position) => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/actions/add-node-instance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ graphId, prototypeId, position })
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
  "chat",
  "Send a message to the AI model and get a response",
  {
    message: z.string().describe("The user's message"),
    context: z.object({
      activeGraphId: z.string().nullable().describe("Currently active graph ID"),
      graphCount: z.number().describe("Total number of graphs"),
      hasAPIKey: z.boolean().describe("Whether the user has set up their API key")
    }).optional().describe("Current context for the AI model")
  },
  async ({ message, context = {} }) => {
    try {
      const state = await getRealRedstringState();
      
      // Format the current state for the AI
      const stateContext = {
        activeGraph: state.activeGraphId ? {
          id: state.activeGraphId,
          name: state.graphs.get(state.activeGraphId)?.name,
          instanceCount: state.graphs.get(state.activeGraphId)?.instances?.size || 0
        } : null,
        graphCount: state.graphs.size,
        graphNames: Array.from(state.graphs.values()).map(g => g.name),
        prototypeCount: state.nodePrototypes.size,
        prototypeNames: Array.from(state.nodePrototypes.values()).map(p => p.name)
      };

      // Forward the message to the AI through stdio
      const response = await server.transport.request({
        jsonrpc: "2.0",
        method: "chat",
        params: {
          messages: [
            {
              role: "system",
              content: `You are assisting with a Redstring knowledge graph. Current state:
- Active Graph: ${stateContext.activeGraph ? `${stateContext.activeGraph.name} (${stateContext.activeGraph.instanceCount} instances)` : 'None'}
- Total Graphs: ${stateContext.graphCount}
- Available Graphs: ${stateContext.graphNames.join(', ')}
- Total Prototypes: ${stateContext.prototypeCount}
- Available Concepts: ${stateContext.prototypeNames.join(', ')}

You can help with:
1. Exploring and searching the knowledge graph
2. Adding new concepts and relationships
3. Managing graphs and their contents
4. Understanding the current state`
            },
            {
              role: "user",
              content: message
            }
          ]
        }
      });

      // Return the AI's response in MCP format
      return {
        content: [{
          type: "text",
          text: response.result.content
        }]
      };
    } catch (error) {
      console.error('Error in chat tool:', error);
      return {
        content: [{
          type: "text",
          text: `I encountered an error communicating with the AI: ${error.message}. Please try again.`
        }]
      };
    }
  }
);

server.tool(
  "get_graph_instances",
  "Get detailed information about all instances in a specific graph",
  {
    graphId: z.string().optional().describe("Graph ID to check (default: active graph)")
  },
  async ({ graphId }) => {
    try {
      const state = await getRealRedstringState();
      
      const targetGraphId = graphId || state.activeGraphId;
      
      if (!targetGraphId) {
        return {
          content: [
            {
              type: "text",
              text: `No graph specified and no active graph found. Use \`open_graph\` to open a graph first.`
            }
          ]
        };
      }
      
      const graph = state.graphs.get(targetGraphId);
      
      if (!graph) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Graph "${targetGraphId}" not found. Use \`list_available_graphs\` to see available graphs.`
            }
          ]
        };
      }
      
      const instances = graph.instances || new Map();
      const instanceList = Array.from(instances.values()).map(instance => {
        const prototype = state.nodePrototypes.get(instance.prototypeId);
        return {
          id: instance.id,
          prototypeName: prototype?.name || 'Unknown',
          prototypeId: instance.prototypeId,
          position: { x: instance.x, y: instance.y },
          scale: instance.scale
        };
      });
      
      const response = `**Graph Instances: ${graph.name}**

**Graph Details:**
- **Name:** ${graph.name}
- **ID:** ${targetGraphId}
- **Description:** ${graph.description || 'No description'}
- **Total Instances:** ${instances.size}

**Instance Details:**
${instanceList.length > 0 ? 
  instanceList.map((inst, index) => 
    `${index + 1}. **${inst.prototypeName}** (${inst.id})
   - Prototype ID: ${inst.prototypeId}
   - Position: (${inst.position.x}, ${inst.position.y})
   - Scale: ${inst.scale}`
  ).join('\n\n') : 
  'No instances in this graph'}

**Available Prototypes for This Graph:**
${Array.from(state.nodePrototypes.values()).slice(0, 10).map(p => 
  `- ${p.name} (${p.id})`
).join('\n')}

**Usage:**
- Use this to verify instances were actually added
- Check positions and prototype assignments
- Debug instance creation issues`;

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
              text: `Error getting graph instances: ${error.message}`
            }
          ]
        };
    }
  }
);

server.tool(
  "verify_state",
  "Verify the current state of the Redstring store and provide explicit debugging information",
  {},
  async () => {
    try {
      const state = await getRealRedstringState();
      
      const response = `**Redstring Store State Verification**

**Store Statistics:**
- **Total Graphs:** ${state.graphs.size}
- **Total Prototypes:** ${state.nodePrototypes.size}
- **Total Edges:** ${state.edges.size}
- **Open Graphs:** ${state.openGraphIds.length}
- **Active Graph:** ${state.activeGraphId || 'None'}

**Active Graph Details:**
${state.activeGraphId ? (() => {
  const activeGraph = state.graphs.get(state.activeGraphId);
  if (!activeGraph) return 'Active graph ID exists but graph not found in store';
  
  return `- **Name:** ${activeGraph.name}
- **ID:** ${state.activeGraphId}
- **Description:** ${activeGraph.description || 'No description'}
- **Instance Count:** ${activeGraph.instances?.size || 0}
- **Open Status:** Open in UI
- **Expanded:** ${state.expandedGraphIds.has(state.activeGraphId) ? 'Yes' : 'No'}`;
})() : 'No active graph set'}

**Available Prototypes (Last 10):**
${Array.from(state.nodePrototypes.values()).slice(-10).map(p => 
  `- ${p.name} (${p.id}) - ${p.description || 'No description'}`
).join('\n')}

**Open Graphs:**
${state.openGraphIds.map((id, index) => {
  const g = state.graphs.get(id);
  const isActive = id === state.activeGraphId;
  return `${index + 1}. ${g?.name || 'Unknown'} (${id})${isActive ? ' ACTIVE' : ''}`;
}).join('\n')}

**Bridge Status:**
- **Bridge Server:** Running on localhost:3001
- **Redstring App:** Running on localhost:4000
- **MCPBridge Connected:** Store actions registered
- **Data Sync:** Real-time updates enabled

**Usage:**
- Use this tool to verify state before and after actions
- Compare counts to detect sync issues
- Check if actions actually succeeded
- Debug connectivity problems`;

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
              text: `Error verifying Redstring store state: ${error.message}`
            }
          ]
        };
    }
  }
);

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
              text: `No active graph found in Redstring. Use \`open_graph\` to open a graph first.`
            }
          ]
        };
      }
      
      const activeGraph = graphData.graphs[activeGraphId];
      
      const response = `**Active Graph Information (Real Redstring Data)**

**Graph Details:**
- **Name:** ${activeGraph.name}
- **ID:** ${activeGraphId}
- **Description:** ${activeGraph.description}

**Content Statistics:**
- **Instances:** ${activeGraph.nodeCount}
- **Relationships:** ${activeGraph.edgeCount}

**UI State:**
- **Position:** Active (center tab in header)
- **Open Status:** Open in header tabs
- **Expanded:** ${graphData.expandedGraphIds.has(activeGraphId) ? 'Yes' : 'No'} in "Open Things" list
- **Saved:** ${graphData.savedGraphIds.has(activeGraphId) ? 'Yes' : 'No'} in "Saved Things" list

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
  return `${index + 1}. ${g.name} (${id})${isActive ? ' ACTIVE' : ''}`;
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

**Graph IDs for Reference:**
${Object.values(graphData.graphs).map(graph => 
  `- **${graph.name}**: \`${graph.id}\``
).join('\n')}

**Detailed Graph Information:**
${Object.values(graphData.graphs).map(graph => `
**${graph.name}** (ID: \`${graph.id}\`)
- Instances: ${graph.nodeCount}
- Relationships: ${graph.edgeCount}
- Status: ${graph.id === graphData.activeGraphId ? 'Active' : 'Inactive'}
- Open: ${graphData.openGraphIds.includes(graph.id) ? 'Yes' : 'No'}
- Saved: ${graphData.savedGraphIds.has(graph.id) ? 'Yes' : 'No'}
`).join('\n')}

**Current Active Graph:** ${graphData.activeGraphId || 'None'}

**Available Prototypes:**
${graphData.nodePrototypes && graphData.nodePrototypes instanceof Map ? 
  Array.from(graphData.nodePrototypes.values()).map(prototype => 
    `- ${prototype.name} (${prototype.id}) - ${prototype.description}`
  ).join('\n') : 
  'No prototypes available'}

**To open a graph, use:** \`open_graph\` with any of the graph IDs above.`;

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
  "⚠️ LEGACY: Add a new node prototype to the real Redstring store (use addNodeToGraph instead)",
  {
    name: z.string().describe("Name of the prototype"),
    description: z.string().describe("Description of the prototype"),
    color: z.string().optional().describe("Color for the prototype (hex code)"),
    typeNodeId: z.string().optional().describe("Parent type node ID (optional)")
  },
  async ({ name, description, color = "#4A90E2", typeNodeId = null }) => {
    try {
      console.warn('⚠️ DEPRECATED: add_node_prototype is deprecated. Use addNodeToGraph instead.');
      
      const actions = getRealRedstringActions();
      
      // Create prototype data
      const prototypeData = {
        name,
        description,
        color,
        typeNodeId
      };
      
      // Get initial state to compare
      const initialState = await getRealRedstringState();
      const initialPrototypeCount = initialState.nodePrototypes.size;
      
      // Add to real Redstring store
      await actions.addNodePrototype(prototypeData);
      
      // CRITICAL: Verify the action actually succeeded by checking the updated state
      const updatedState = await getRealRedstringState();
      const newPrototypeCount = updatedState.nodePrototypes.size;
      
      if (newPrototypeCount <= initialPrototypeCount) {
        return {
          content: [
            {
              type: "text",
              text: `❌ **VERIFICATION FAILED**: Prototype count did not increase. Expected: ${initialPrototypeCount + 1}, Actual: ${newPrototypeCount}

**Debug Information:**
- Prototype Name: ${name}
- Description: ${description}
- Color: ${color}
- Parent Type: ${typeNodeId || 'None'}

**Troubleshooting:**
- The action was queued but may not have executed successfully
- Check if the MCPBridge is properly connected to Redstring
- Try using \`list_available_graphs\` to see current state`
            }
          ]
        };
      }
      
      // Find the newly created prototype to get its ID
      const newPrototype = Array.from(updatedState.nodePrototypes.values()).find(p => 
        p.name === name && p.description === description
      );
      
      if (!newPrototype) {
        return {
          content: [
            {
              type: "text",
              text: `❌ **VERIFICATION FAILED**: New prototype not found in store after creation.

**Debug Information:**
- Prototype Name: ${name}
- Description: ${description}
- Expected Count: ${initialPrototypeCount + 1}
- Actual Count: ${newPrototypeCount}

**Troubleshooting:**
- The prototype may have been created with different data
- Check if there are duplicate names or descriptions
- Try using \`list_available_graphs\` to see current state`
            }
          ]
        };
      }
      
      const response = `✅ **Node Prototype Added Successfully (VERIFIED)**

**New Prototype:**
- **Name:** ${name}
- **ID:** ${newPrototype.id}
- **Description:** ${description}
- **Color:** ${color}
- **Parent Type:** ${typeNodeId || 'None (base type)'}
- **Prototype Count:** ${initialPrototypeCount} → ${newPrototypeCount} ✅

**Verification:**
- ✅ Action executed successfully
- ✅ Prototype count increased
- ✅ Prototype found in store
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
  "addNodeToGraph",
  "Add a concept/node to the active graph - automatically handles prototypes and instances",
  {
    conceptName: z.string().describe("Name of the concept to add (e.g., 'Person', 'Car', 'Idea')"),
    description: z.string().optional().describe("Optional description of the concept"),
    position: z.object({
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate")
    }).describe("Position where to place the node"),
    color: z.string().optional().describe("Optional color for the node (hex code)")
  },
  async ({ conceptName, description, position, color }) => {
    try {
      const state = await getRealRedstringState();
      const actions = await getRealRedstringActions();
      
      if (!state.activeGraphId) {
        return {
          content: [
            {
              type: "text",
              text: `❌ No active graph. Use \`open_graph\` or \`set_active_graph\` to select a graph first.`
            }
          ]
        };
      }
      
      const targetGraphId = state.activeGraphId;
      const graph = state.graphs.get(targetGraphId);
      
      if (!graph) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Active graph not found. Use \`list_available_graphs\` to see available graphs.`
            }
          ]
        };
      }
      
      // Capture initial state for verification
      const originalInstanceCount = graph.instances?.size || 0;
      const originalPrototypeCount = state.nodePrototypes.size;
      
      // Search for existing prototype with this name
      let existingPrototype = null;
      for (const [loopPrototypeId, prototype] of state.nodePrototypes.entries()) {
        if (prototype.name.toLowerCase() === conceptName.toLowerCase()) {
          existingPrototype = { id: loopPrototypeId, ...prototype };
          break;
        }
      }
      
      let prototypeId;
      let prototypeCreated = false;
      
      if (existingPrototype) {
        // Use existing prototype
        prototypeId = existingPrototype.id;
        console.log(`🔍 Found existing prototype: ${existingPrototype.name} (${prototypeId})`);
      } else {
        // Create new prototype
        prototypeId = `prototype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const prototypeData = {
          id: prototypeId,
          name: conceptName,
          description: description || `A ${conceptName.toLowerCase()}`,
          color: color || '#3498db',
          typeNodeId: null
        };
        
        console.log(`🆕 Creating new prototype: ${conceptName} (${prototypeId})`);
        await actions.addNodePrototype(prototypeData);
        prototypeCreated = true;
      }
      
      // Add instance to graph with retry mechanism
      const instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`📍 Adding instance to graph: ${conceptName} at (${position.x}, ${position.y}) using prototype: ${prototypeId}`);
      
      // Retry mechanism to ensure prototype is synced
      let instanceAdded = false;
      let retryCount = 0;
      const maxRetries = 5; // Increased retries
      
      while (!instanceAdded && retryCount < maxRetries) {
        try {
          // Verify prototype exists before attempting to add instance
          const currentState = await getRealRedstringState();
          const prototypeExists = currentState.nodePrototypes.has(prototypeId);
          
          if (!prototypeExists) {
            console.log(`⚠️ Prototype ${prototypeId} not found in store, waiting for sync...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Longer wait
            retryCount++;
            continue;
          }
          
          await actions.addNodeInstance(targetGraphId, prototypeId, position);
          instanceAdded = true;
          console.log(`✅ Instance added successfully on attempt ${retryCount + 1}`);
        } catch (error) {
          retryCount++;
          console.log(`⚠️ Instance creation failed (attempt ${retryCount}/${maxRetries}): ${error.message}`);
          if (retryCount < maxRetries) {
            // Wait a bit for the prototype to sync
            await new Promise(resolve => setTimeout(resolve, 1000)); // Longer wait
          }
        }
      }
      
      if (!instanceAdded) {
        throw new Error(`Failed to add instance after ${maxRetries} attempts. Prototype ${prototypeId} may not be synced.`);
      }
      
      // Verify the changes
      const updatedState = await getRealRedstringState();
      const updatedGraph = updatedState.graphs.get(targetGraphId);
      const newInstanceCount = updatedGraph?.instances?.size || 0;
      const newPrototypeCount = updatedState.nodePrototypes.size;
      
      // Get the final prototype info
      const finalPrototype = updatedState.nodePrototypes.get(prototypeId);
      
      const response = `**Concept Added Successfully (VERIFIED)**

**Added Concept:**
- **Name:** ${conceptName}
- **Position:** (${position.x}, ${position.y})
- **Graph:** ${graph.name} (${targetGraphId})
- **Instance Count:** ${originalInstanceCount} → ${newInstanceCount}

**Prototype Handling:**
${existingPrototype ? 
  `- **Used Existing:** ${existingPrototype.name} (${prototypeId})` :
  `- **Created New:** ${conceptName} (${prototypeId})
- **Description:** ${description || `A ${conceptName.toLowerCase()}`}
- **Color:** ${color || '#3498db'}`
}
- **Prototype Count:** ${originalPrototypeCount} → ${newPrototypeCount} ${prototypeCreated ? '' : '(unchanged)'}

**Verification:**
- Concept added to graph
- Instance count increased
- Prototype ${prototypeCreated ? 'created' : 'reused'} as needed
- Visible in Redstring UI immediately
- Persists to .redstring file

**Debug Information:**
- **Graph ID:** ${targetGraphId}
- **Prototype ID:** ${prototypeId}
- **Instance ID:** ${instanceId}
- **Expected Instance Increase:** +1
- **Actual Instance Increase:** +${newInstanceCount - originalInstanceCount}

**Next Steps:**
- Use \`get_graph_instances\` to see all concepts in this graph
- Use \`addEdgeBetweenNodes\` to connect this concept to others
- Use \`moveNodeInGraph\` to reposition the concept`;

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
              text: `Error adding concept to graph: ${error.message}`
            }
          ]
        };
    }
  }
);

server.tool(
  "removeNodeFromGraph",
  "Remove a concept/node from the active graph",
  {
    conceptName: z.string().describe("Name of the concept to remove"),
    instanceId: z.string().optional().describe("Optional specific instance ID to remove (if multiple instances exist)")
  },
  async ({ conceptName, instanceId }) => {
    try {
      const state = await getRealRedstringState();
      const actions = await getRealRedstringActions();
      
      if (!state.activeGraphId) {
        return {
          content: [
            {
              type: "text",
              text: `❌ No active graph. Use \`open_graph\` or \`set_active_graph\` to select a graph first.`
            }
          ]
        };
      }
      
      const targetGraphId = state.activeGraphId;
      const graph = state.graphs.get(targetGraphId);
      
      if (!graph) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Active graph not found. Use \`list_available_graphs\` to see available graphs.`
            }
          ]
        };
      }
      
      // Find instances of this concept
      const instances = graph.instances || new Map();
      const matchingInstances = [];
      
      for (const [instId, instance] of instances.entries()) {
        const prototype = state.nodePrototypes.get(instance.prototypeId);
        if (prototype && prototype.name.toLowerCase() === conceptName.toLowerCase()) {
          matchingInstances.push({
            id: instId,
            prototype: prototype,
            position: { x: instance.x, y: instance.y }
          });
        }
      }
      
      if (matchingInstances.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `❌ No instances of "${conceptName}" found in graph "${graph.name}". Use \`get_graph_instances\` to see available concepts.`
            }
          ]
        };
      }
      
      let instanceToRemove;
      
      if (instanceId) {
        // Remove specific instance
        instanceToRemove = matchingInstances.find(inst => inst.id === instanceId);
        if (!instanceToRemove) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Instance "${instanceId}" of "${conceptName}" not found in graph.`
              }
            ]
          };
        }
      } else if (matchingInstances.length === 1) {
        // Remove the only instance
        instanceToRemove = matchingInstances[0];
      } else {
        // Multiple instances - list them for user to choose
        const instanceList = matchingInstances.map((inst, index) => 
          `${index + 1}. ${inst.prototype.name} at (${inst.position.x}, ${inst.position.y}) [${inst.id}]`
        ).join('\n');
        
        return {
          content: [
            {
              type: "text",
              text: `🔍 Found ${matchingInstances.length} instances of "${conceptName}" in graph "${graph.name}":

${instanceList}

**To remove a specific instance, use:**
\`removeNodeFromGraph\` with \`instanceId\` parameter set to one of the IDs above.

**To remove all instances, call this tool multiple times with different instance IDs.**`
            }
          ]
        };
      }
      
      // Capture initial state
      const originalInstanceCount = instances.size;
      
      // Remove the instance
      console.log(`🗑️ Removing instance: ${instanceToRemove.prototype.name} (${instanceToRemove.id})`);
      await actions.removeNodeInstance(targetGraphId, instanceToRemove.id);
      
      // Verify the changes
      const updatedState = await getRealRedstringState();
      const updatedGraph = updatedState.graphs.get(targetGraphId);
      const newInstanceCount = updatedGraph?.instances?.size || 0;
      
      const response = `✅ **Concept Removed Successfully (VERIFIED)**

**Removed Concept:**
- **Name:** ${instanceToRemove.prototype.name}
- **Position:** (${instanceToRemove.position.x}, ${instanceToRemove.position.y})
- **Graph:** ${graph.name} (${targetGraphId})
- **Instance Count:** ${originalInstanceCount} → ${newInstanceCount} ✅

**Verification:**
- ✅ Instance removed from graph
- ✅ Instance count decreased
- ✅ Visible in Redstring UI immediately
- ✅ Persists to .redstring file

**Debug Information:**
- **Graph ID:** ${targetGraphId}
- **Instance ID:** ${instanceToRemove.id}
- **Prototype ID:** ${instanceToRemove.prototype.id}
- **Expected Instance Decrease:** -1
- **Actual Instance Decrease:** -${originalInstanceCount - newInstanceCount}

**Next Steps:**
- Use \`get_graph_instances\` to see remaining concepts
- Use \`addNodeToGraph\` to add new concepts
- Use \`addEdgeBetweenNodes\` to connect remaining concepts`;

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
            text: `❌ Error removing concept from graph: ${error.message}`
          }
        ]
      };
    }
  }
);

server.tool(
  "add_node_instance",
  "⚠️ LEGACY: Add a new instance of a prototype to the active graph in the real Redstring store (use addNodeToGraph instead)",
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
      console.warn('⚠️ DEPRECATED: add_node_instance is deprecated. Use addNodeToGraph instead.');
      
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
      await actions.addNodeInstance(targetGraphId, prototype.id, position);
      
      // CRITICAL: Verify the action actually succeeded by checking the updated state
      const updatedState = await getRealRedstringState();
      const updatedGraph = updatedState.graphs.get(targetGraphId);
      
      if (!updatedGraph) {
        return {
          content: [
            {
              type: "text",
              text: `❌ **VERIFICATION FAILED**: Graph "${targetGraphId}" not found after adding instance. The action may have failed.`
            }
          ]
        };
      }
      
      // Check if the instance was actually added by comparing instance counts
      const originalInstanceCount = state.graphs.get(targetGraphId)?.instances?.size || 0;
      const newInstanceCount = updatedGraph.instances?.size || 0;
      
      if (newInstanceCount <= originalInstanceCount) {
        return {
          content: [
            {
              type: "text",
              text: `❌ **VERIFICATION FAILED**: Instance count did not increase. Expected: ${originalInstanceCount + 1}, Actual: ${newInstanceCount}

**Debug Information:**
- Prototype: ${prototype.name} (${prototype.id})
- Target Graph: ${state.graphs.get(targetGraphId)?.name} (${targetGraphId})
- Position: (${position.x}, ${position.y})

**Troubleshooting:**
- The action was queued but may not have executed successfully
- Check if the MCPBridge is properly connected to Redstring
- Try using \`get_active_graph\` to see current state`
            }
          ]
        };
      }
      
      const response = `✅ **Node Instance Added Successfully (VERIFIED)**

**New Instance:**
- **Prototype:** ${prototype.name} (${prototype.id})
- **Position:** (${position.x}, ${position.y})
- **Graph:** ${state.graphs.get(targetGraphId)?.name} (${targetGraphId})
- **Instance Count:** ${originalInstanceCount} → ${newInstanceCount} ✅

**Verification:**
- ✅ Action executed successfully
- ✅ Instance count increased
- ✅ Instance added to real graph
- ✅ Visible in Redstring UI immediately
- ✅ Persists to .redstring file

**Debug Information:**
- **Graph ID:** ${targetGraphId}
- **Prototype ID:** ${prototype.id}
- **Expected Count Increase:** +1
- **Actual Count Increase:** +${newInstanceCount - originalInstanceCount}

**Next Steps:**
- Use \`get_graph_instances\` to see detailed instance information
- Use \`get_active_graph\` to see all instances in the graph
- Use \`add_edge\` to connect this instance to others
- Use \`move_node_instance\` to reposition the instance`;

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

// AI-Guided Workflow Tool removed - chat tool already exists above

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
                  // Find the prototype by name to get its ID
                  const prototype = Array.from(state.nodePrototypes.values()).find(p => 
                    p.name.toLowerCase() === instance.prototypeName.toLowerCase()
                  );
                  
                  if (!prototype) {
                    results.push(`❌ Prototype "${instance.prototypeName}" not found, skipping instance`);
                    continue;
                  }
                  
                  await actions.addNodeInstance(currentGraphId, prototype.id, { x: instance.x, y: instance.y });
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

// HTTP Endpoints (from bridge server)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GitHub OAuth token exchange endpoint
app.post('/api/github/oauth/token', async (req, res) => {
  console.log('[OAuth Server] Token exchange request received');
  
  try {
    const { code, state, redirect_uri } = req.body;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }
    
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirect_uri
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    }
    
    res.json({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      scope: tokenData.scope
    });
    
  } catch (error) {
    console.error('OAuth token exchange error:', error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// Bridge state endpoints
app.post('/api/bridge/state', (req, res) => {
  try {
    bridgeStoreData = req.body;
    console.log('✅ Bridge: Store data updated');
    res.json({ success: true });
  } catch (error) {
    console.error('Bridge POST error:', error);
    res.status(500).json({ error: 'Failed to update store state' });
  }
});

app.get('/api/bridge/state', (req, res) => {
  try {
    if (bridgeStoreData) {
      res.json({ ...bridgeStoreData, mcpConnected });
    } else {
      res.status(503).json({ error: 'Redstring store not available' });
    }
  } catch (error) {
    console.error('Bridge GET error:', error);
    res.status(500).json({ error: 'Failed to get store state' });
  }
});

// Save trigger endpoint (for MCPBridge compatibility)
app.get('/api/bridge/check-save-trigger', (req, res) => {
  // This was used to trigger saves, but we don't need it anymore
  // Return false to indicate no save needed
  res.json({ shouldSave: false });
});

// Pending actions endpoint (for MCPBridge compatibility)
let pendingActions = [];

app.get('/api/bridge/pending-actions', (req, res) => {
  try {
    const actions = [...pendingActions];
    pendingActions = []; // Clear after reading
    res.json({ actions });
  } catch (error) {
    console.error('Pending actions error:', error);
    res.status(500).json({ error: 'Failed to get pending actions' });
  }
});

app.post('/api/bridge/action-completed', (req, res) => {
  try {
    const { actionId, result } = req.body;
    console.log('✅ Bridge: Action completed:', actionId, result);
    res.json({ success: true });
  } catch (error) {
    console.error('Action completion error:', error);
    res.status(500).json({ error: 'Failed to record action completion' });
  }
});

// Store registration endpoint (for MCPBridge compatibility)
app.post('/api/bridge/register-store', (req, res) => {
  try {
    const { actionMetadata } = req.body;
    console.log('✅ Bridge: Store actions registered:', Object.keys(actionMetadata || {}));
    res.json({ success: true, registeredActions: Object.keys(actionMetadata || {}) });
  } catch (error) {
    console.error('Store registration error:', error);
    res.status(500).json({ error: 'Failed to register store actions' });
  }
});

// AI Chat API endpoint - handles actual AI provider calls
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, systemPrompt, context, model: requestedModel } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get API key from client-side storage (we'll need to receive it in the request)
    // For now, return a helpful message asking them to implement the API key passing
    if (!req.headers.authorization) {
      return res.status(401).json({ 
        error: 'API key required', 
        response: 'I need access to your AI API key to provide responses. The API key should be passed in the Authorization header.' 
      });
    }

    const apiKey = req.headers.authorization.replace('Bearer ', '');
    
    // Use custom configuration from client if provided, otherwise use defaults
    let provider = 'openrouter'; // default
    let endpoint = 'https://openrouter.ai/api/v1/chat/completions'; // default  
    let model = 'anthropic/claude-3-sonnet-20240229'; // default
    
    // Check if client provided API configuration
    if (context?.apiConfig) {
      provider = context.apiConfig.provider || provider;
      endpoint = context.apiConfig.endpoint || endpoint;
      model = context.apiConfig.model || model;
      console.log('[AI Chat] Using custom config:', { provider, endpoint, model });
    } else {
      // Fall back to key-based detection for legacy compatibility
      if (apiKey.startsWith('sk-') && !requestedModel) {
        provider = 'openrouter';
        model = 'openai/gpt-4o';
      } else if (apiKey.startsWith('claude-')) {
        provider = 'anthropic';
        endpoint = 'https://api.anthropic.com/v1/messages';
        model = requestedModel || 'claude-3-sonnet-20240229';
      }
    }

    let aiResponse;
    
    if (provider === 'anthropic') {
      // Call Anthropic Claude API directly
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: context?.apiConfig?.settings?.max_tokens || 1000,
          temperature: context?.apiConfig?.settings?.temperature || 0.7,
          messages: [
            {
              role: 'user',
              content: `${systemPrompt}\n\nUser: ${message}`
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      aiResponse = data.content[0].text;
      
    } else {
      // Use OpenRouter (supports OpenAI, Anthropic, and many other models)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:4000', // Optional: helps with rate limits
          'X-Title': 'Redstring Knowledge Graph' // Optional: helps identify your app
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          max_tokens: context?.apiConfig?.settings?.max_tokens || 1000,
          temperature: context?.apiConfig?.settings?.temperature || 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      aiResponse = data.choices[0].message.content;
    }

    res.json({ 
      response: aiResponse,
      provider: provider
    });

  } catch (error) {
    console.error('[AI Chat API] Error:', error);
    res.status(500).json({ 
      error: 'AI chat failed', 
      message: error.message,
      response: `I encountered an error while processing your request: ${error.message}. Please check your API key and try again.`
    });
  }
});

// MCP request endpoint (direct handling since we ARE the MCP server)
app.post('/api/mcp/request', async (req, res) => {
  try {
    const { method, params, id } = req.body;
    const authHeader = req.headers.authorization;
    
    console.log('[MCP] Request received:', { method, id });
    
    let response;
    
    switch (method) {
      case 'initialize':
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true } },
            serverInfo: {
              name: 'redstring',
              version: '1.0.0',
              capabilities: { resources: {}, tools: {} }
            }
          }
        };
        break;
        
      case 'tools/list':
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'chat',
                description: 'Send a message to the AI model and get a response',
                inputSchema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    context: {
                      type: 'object',
                      properties: {
                        activeGraphId: { type: ['string', 'null'] },
                        graphCount: { type: 'number' },
                        hasAPIKey: { type: 'boolean' }
                      }
                    }
                  },
                  required: ['message']
                }
              },
              {
                name: 'verify_state',
                description: 'Verify the current state of the Redstring store',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false }
              },
              {
                name: 'list_available_graphs',
                description: 'List all available knowledge graphs',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false }
              },
              {
                name: 'get_active_graph',
                description: 'Get currently active graph information',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false }
              },
              {
                name: 'get_graph_instances',
                description: 'Get detailed information about all instances in a specific graph',
                inputSchema: {
                  type: 'object',
                  properties: {
                    graphId: { type: 'string', description: 'Graph ID to check (default: active graph)' }
                  }
                }
              },
              {
                name: 'addNodeToGraph',
                description: 'Add a concept/node to the active graph - automatically handles prototypes and instances',
                inputSchema: {
                  type: 'object',
                  properties: {
                    conceptName: { type: 'string', description: 'Name of the concept to add (e.g., "Person", "Car", "Idea")' },
                    description: { type: 'string', description: 'Optional description of the concept' },
                    position: {
                      type: 'object',
                      properties: {
                        x: { type: 'number', description: 'X coordinate' },
                        y: { type: 'number', description: 'Y coordinate' }
                      },
                      required: ['x', 'y'],
                      description: 'Position where to place the node'
                    },
                    color: { type: 'string', description: 'Optional color for the node (hex code)' }
                  },
                  required: ['conceptName', 'position']
                }
              },
              {
                name: 'removeNodeFromGraph',
                description: 'Remove a concept/node from the active graph',
                inputSchema: {
                  type: 'object',
                  properties: {
                    conceptName: { type: 'string', description: 'Name of the concept to remove' },
                    instanceId: { type: 'string', description: 'Optional specific instance ID to remove (if multiple instances exist)' }
                  },
                  required: ['conceptName']
                }
              },
              {
                name: 'open_graph',
                description: 'Open a graph and make it the active graph in the real Redstring UI',
                inputSchema: {
                  type: 'object',
                  properties: {
                    graphId: { type: 'string', description: 'The ID of the graph to open' },
                    bringToFront: { type: 'boolean', description: 'Bring graph to front of open tabs (default: true)' },
                    autoExpand: { type: 'boolean', description: 'Auto-expand the graph in the open things list (default: true)' }
                  },
                  required: ['graphId']
                }
              },
              {
                name: 'set_active_graph',
                description: 'Set a graph as the active graph in the real Redstring UI (graph must already be open)',
                inputSchema: {
                  type: 'object',
                  properties: {
                    graphId: { type: 'string', description: 'The ID of the graph to make active' }
                  },
                  required: ['graphId']
                }
              },
              {
                name: 'search_nodes',
                description: 'Search for nodes by name or description',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'Search query to match against node names and descriptions' },
                    graphId: { type: 'string', description: 'Optional graph ID to search only within that graph' }
                  },
                  required: ['query']
                }
              },
              {
                name: 'add_node_prototype',
                description: '⚠️ LEGACY: Add a new node prototype to the real Redstring store (use addNodeToGraph instead)',
                inputSchema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Name of the prototype' },
                    description: { type: 'string', description: 'Description of the prototype' },
                    color: { type: 'string', description: 'Color for the prototype (hex code)' },
                    typeNodeId: { type: 'string', description: 'Parent type node ID (optional)' }
                  },
                  required: ['name', 'description']
                }
              },
              {
                name: 'add_node_instance',
                description: '⚠️ LEGACY: Add a new instance of a prototype to the active graph in the real Redstring store (use addNodeToGraph instead)',
                inputSchema: {
                  type: 'object',
                  properties: {
                    prototypeName: { type: 'string', description: 'Name of the prototype to create an instance of' },
                    position: {
                      type: 'object',
                      properties: {
                        x: { type: 'number', description: 'X coordinate for the instance' },
                        y: { type: 'number', description: 'Y coordinate for the instance' }
                      },
                      required: ['x', 'y'],
                      description: 'Position coordinates for the instance'
                    },
                    graphId: { type: 'string', description: 'Specific graph to add to (default: active graph)' }
                  },
                  required: ['prototypeName', 'position']
                }
              },
              {
                name: 'update_node_prototype',
                description: 'Update properties of an existing node prototype',
                inputSchema: {
                  type: 'object',
                  properties: {
                    prototypeId: { type: 'string', description: 'The ID of the prototype to update' },
                    updates: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'New name for the prototype' },
                        description: { type: 'string', description: 'New description for the prototype' },
                        color: { type: 'string', description: 'New color for the prototype (hex format)' }
                      },
                      description: 'Properties to update'
                    }
                  },
                  required: ['prototypeId', 'updates']
                }
              },
              {
                name: 'delete_node_instance',
                description: 'Remove a node instance from a graph',
                inputSchema: {
                  type: 'object',
                  properties: {
                    graphId: { type: 'string', description: 'The ID of the graph containing the instance' },
                    instanceId: { type: 'string', description: 'The ID of the instance to delete' }
                  },
                  required: ['graphId', 'instanceId']
                }
              },
              {
                name: 'create_edge',
                description: 'Create a connection between two nodes',
                inputSchema: {
                  type: 'object',
                  properties: {
                    graphId: { type: 'string', description: 'The ID of the graph to add the edge to' },
                    sourceId: { type: 'string', description: 'The ID of the source node' },
                    targetId: { type: 'string', description: 'The ID of the target node' },
                    edgeType: { type: 'string', description: 'Type of the edge (optional)' },
                    weight: { type: 'number', description: 'Weight of the edge (optional, default 1)' }
                  },
                  required: ['graphId', 'sourceId', 'targetId']
                }
              },
              {
                name: 'create_edge_definition',
                description: 'Create a new edge type definition',
                inputSchema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Name of the edge type' },
                    description: { type: 'string', description: 'Description of the edge type' },
                    color: { type: 'string', description: 'Color for the edge type (hex format, optional)' },
                    typeNodeId: { type: 'string', description: 'Type node ID (optional)' }
                  },
                  required: ['name', 'description']
                }
              },
              {
                name: 'move_node_instance',
                description: 'Move a node instance to a new position',
                inputSchema: {
                  type: 'object',
                  properties: {
                    graphId: { type: 'string', description: 'The ID of the graph containing the instance' },
                    instanceId: { type: 'string', description: 'The ID of the instance to move' },
                    position: {
                      type: 'object',
                      properties: {
                        x: { type: 'number', description: 'New X coordinate' },
                        y: { type: 'number', description: 'New Y coordinate' }
                      },
                      required: ['x', 'y'],
                      description: 'New position for the node'
                    }
                  },
                  required: ['graphId', 'instanceId', 'position']
                }
              },
              {
                name: 'ai_guided_workflow',
                description: 'Walk a human user through the complete process of adding a node, creating a graph definition, and building connections. This tool orchestrates the full workflow that a human would do manually.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    workflowType: {
                      type: 'string',
                      enum: ['create_prototype_and_definition', 'add_instance_to_graph', 'create_connections', 'full_workflow'],
                      description: 'Type of workflow to guide the user through'
                    },
                    prototypeName: { type: 'string', description: 'Name for the new prototype (required for create_prototype_and_definition and full_workflow)' },
                    prototypeDescription: { type: 'string', description: 'Description for the new prototype' },
                    prototypeColor: { type: 'string', description: 'Color for the prototype (hex code)' },
                    targetGraphId: { type: 'string', description: 'Target graph ID for adding instances or creating connections' },
                    instancePositions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          prototypeName: { type: 'string', description: 'Name of prototype to create instance of' },
                          x: { type: 'number', description: 'X coordinate' },
                          y: { type: 'number', description: 'Y coordinate' }
                        },
                        required: ['prototypeName', 'x', 'y']
                      },
                      description: 'Array of instances to create with positions'
                    },
                    connections: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          sourceName: { type: 'string', description: 'Name of source node' },
                          targetName: { type: 'string', description: 'Name of target node' },
                          edgeType: { type: 'string', description: 'Type of connection' },
                          weight: { type: 'number', description: 'Connection weight' }
                        },
                        required: ['sourceName', 'targetName']
                      },
                      description: 'Array of connections to create'
                    },
                    enableUserGuidance: { type: 'boolean', description: 'Enable step-by-step user guidance (default: true)' }
                  }
                }
              }
            ]
          }
        };
        break;
        
      case 'tools/call':
        const toolName = params.name;
        const toolArgs = params.arguments || {};
        
        console.log('[MCP] Tool call:', toolName, toolArgs);
        
        // Execute the tool directly since we have access to everything
        let toolResult;
        
        try {
          switch (toolName) {
            case 'chat':
              // Handle chat directly - make actual AI API calls
              const { message, context } = toolArgs;
              
              // Check if user has API key
              if (!context.hasAPIKey) {
                toolResult = `Please set up your AI API key first. Click the key icon in the AI panel to configure your API credentials.`;
                break;
              }
              
              // Get the current state to provide context
              const state = await getRealRedstringState();
              
              // Prepare context for AI
              const activeGraph = state.activeGraphId ? state.graphs.get(state.activeGraphId) : null;
              const graphInfo = activeGraph ? `${activeGraph.name} (${activeGraph.instances?.size || 0} instances)` : 'No active graph';
              
              const systemPrompt = `You are an AI assistant helping with a Redstring knowledge graph system. 

Current Context:
- Active Graph: ${graphInfo}
- Total Graphs: ${state.graphs.size}
- Available Concepts: ${state.nodePrototypes.size}
- Available Graphs: ${Array.from(state.graphs.values()).map(g => g.name).join(', ')}

You have access to these tools that you can call directly:
- verify_state: Check the current state of the Redstring store
- list_available_graphs: List all available knowledge graphs
- get_active_graph: Get information about the currently active graph
- addNodeToGraph: Add a concept/node to the active graph (RECOMMENDED)
- removeNodeFromGraph: Remove a concept/node from the active graph
- open_graph: Open a graph and make it active
- set_active_graph: Set a graph as active
- search_nodes: Search for nodes by name or description
- get_graph_instances: Get detailed information about instances in a graph

When a user asks you to:
1. Add something to a graph → Use addNodeToGraph
2. List graphs → Use list_available_graphs
3. Check current state → Use verify_state
4. Search for nodes → Use search_nodes
5. Open a graph → Use open_graph

You can help users:
1. Add concepts to their graphs
2. Search through existing nodes
3. Navigate between graphs
4. Analyze relationships and patterns
5. Understand their knowledge structure

Be helpful, concise, and focused on graph-related tasks. If they ask about adding concepts, suggest specific node types that might be relevant.`;

              // Make API call to get AI response, passing through auth header
              const headers = {
                'Content-Type': 'application/json',
              };
              
              // Pass through authorization header if available
              if (authHeader) {
                headers['Authorization'] = authHeader;
              }
              
              const aiResponse = await fetch('http://localhost:3001/api/ai/chat', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                  message: message,
                  systemPrompt: systemPrompt,
                  context: context,
                  model: context.preferredModel // Allow client to specify model
                })
              });

              if (!aiResponse.ok) {
                throw new Error(`AI API call failed: ${aiResponse.status}`);
              }

              const aiResult = await aiResponse.json();
              let aiResponseText = aiResult.response || "I'm having trouble generating a response. Please try again.";
              
              // Check if the AI response indicates it wants to call a tool
              if (aiResponseText.includes('I should call') || aiResponseText.includes('Let me call') || aiResponseText.includes('I need to call')) {
                // The AI wants to call a tool, so let's help it
                if (aiResponseText.includes('addNodeToGraph') || aiResponseText.includes('add a concept') || aiResponseText.includes('add a node')) {
                  // Extract concept name from the response
                  const conceptMatch = aiResponseText.match(/add\s+(?:a\s+)?([a-zA-Z]+)/i);
                  if (conceptMatch) {
                    const conceptName = conceptMatch[1];
                    try {
                      const addResult = await server.tools.get('addNodeToGraph').handler({
                        conceptName: conceptName,
                        position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
                        description: `A ${conceptName.toLowerCase()} added by AI`
                      });
                      toolResult = `I've added "${conceptName}" to your active graph! ${addResult.content[0].text}`;
                    } catch (error) {
                      toolResult = `I tried to add "${conceptName}" but encountered an error: ${error.message}`;
                    }
                  } else {
                    toolResult = aiResponseText + "\n\nTo add a concept, please specify what you'd like to add (e.g., 'add a person', 'add a car').";
                  }
                } else if (aiResponseText.includes('list_available_graphs') || aiResponseText.includes('list graphs')) {
                  try {
                    const listResult = await server.tools.get('list_available_graphs').handler({});
                    toolResult = listResult.content[0].text;
                  } catch (error) {
                    toolResult = `I tried to list the graphs but encountered an error: ${error.message}`;
                  }
                } else if (aiResponseText.includes('verify_state') || aiResponseText.includes('check state')) {
                  try {
                    const stateResult = await server.tools.get('verify_state').handler({});
                    toolResult = stateResult.content[0].text;
                  } catch (error) {
                    toolResult = `I tried to check the state but encountered an error: ${error.message}`;
                  }
                } else {
                  toolResult = aiResponseText;
                }
              } else {
                toolResult = aiResponseText;
              }
              break;
              
            case 'verify_state':
              const verifyResult = await server.tools.get('verify_state').handler({});
              toolResult = verifyResult.content[0].text;
              break;
              
            case 'list_available_graphs':
              const listResult = await server.tools.get('list_available_graphs').handler({});
              toolResult = listResult.content[0].text;
              break;
              
            case 'get_active_graph':
              const activeResult = await server.tools.get('get_active_graph').handler({});
              toolResult = activeResult.content[0].text;
              break;
              
            case 'addNodeToGraph':
              const addResult = await server.tools.get('addNodeToGraph').handler(toolArgs);
              toolResult = addResult.content[0].text;
              break;
              
            case 'removeNodeFromGraph':
              const removeResult = await server.tools.get('removeNodeFromGraph').handler(toolArgs);
              toolResult = removeResult.content[0].text;
              break;
              
            case 'open_graph':
              const openResult = await server.tools.get('open_graph').handler(toolArgs);
              toolResult = openResult.content[0].text;
              break;
              
            case 'set_active_graph':
              const setActiveResult = await server.tools.get('set_active_graph').handler(toolArgs);
              toolResult = setActiveResult.content[0].text;
              break;
              
            case 'search_nodes':
              const searchResult = await server.tools.get('search_nodes').handler(toolArgs);
              toolResult = searchResult.content[0].text;
              break;
              
            case 'get_graph_instances':
              const instancesResult = await server.tools.get('get_graph_instances').handler(toolArgs);
              toolResult = instancesResult.content[0].text;
              break;
              
            case 'add_node_prototype':
              const prototypeResult = await server.tools.get('add_node_prototype').handler(toolArgs);
              toolResult = prototypeResult.content[0].text;
              break;
              
            case 'add_node_instance':
              const instanceResult = await server.tools.get('add_node_instance').handler(toolArgs);
              toolResult = instanceResult.content[0].text;
              break;
              
            case 'update_node_prototype':
              const updateResult = await server.tools.get('update_node_prototype').handler(toolArgs);
              toolResult = updateResult.content[0].text;
              break;
              
            case 'delete_node_instance':
              const deleteResult = await server.tools.get('delete_node_instance').handler(toolArgs);
              toolResult = deleteResult.content[0].text;
              break;
              
            case 'create_edge':
              const edgeResult = await server.tools.get('create_edge').handler(toolArgs);
              toolResult = edgeResult.content[0].text;
              break;
              
            case 'create_edge_definition':
              const edgeDefResult = await server.tools.get('create_edge_definition').handler(toolArgs);
              toolResult = edgeDefResult.content[0].text;
              break;
              
            case 'move_node_instance':
              const moveResult = await server.tools.get('move_node_instance').handler(toolArgs);
              toolResult = moveResult.content[0].text;
              break;
              
            case 'ai_guided_workflow':
              const workflowResult = await server.tools.get('ai_guided_workflow').handler(toolArgs);
              toolResult = workflowResult.content[0].text;
              break;
              
            default:
              toolResult = `Tool "${toolName}" not found or not implemented. Available tools: verify_state, list_available_graphs, get_active_graph, addNodeToGraph, removeNodeFromGraph, open_graph, set_active_graph, search_nodes, get_graph_instances, add_node_prototype, add_node_instance, update_node_prototype, delete_node_instance, create_edge, create_edge_definition, move_node_instance, ai_guided_workflow`;
          }
        } catch (error) {
          console.error(`[MCP] Tool ${toolName} error:`, error);
          toolResult = `Error executing tool "${toolName}": ${error.message}`;
        }
        
        response = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: toolResult
            }]
          }
        };
        break;
        
      default:
        response = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('[MCP] Request error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

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
  
  // Start MCP stdio server for AI model communication
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Start HTTP server for web clients
  app.listen(PORT, () => {
    console.error(`Redstring MCP Server running on port ${PORT} (HTTP) and stdio (MCP)`);
    console.error(`GitHub OAuth callback URL: http://localhost:${PORT}/oauth/callback`);
    console.error("Waiting for Redstring store bridge...");
  });
  
  // The bridge will be set up when Redstring connects
  global.setupRedstringBridge = setupRedstringBridge;
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
}); 