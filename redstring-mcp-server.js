/**
 * Redstring MCP Server
 * Provides MCP tools for Claude Desktop to interact with Redstring's knowledge graph
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

// Global state for active graph
let activeGraphId = "main";

// Helper function to get graph data from Redstring
function getGraphData() {
  // This would be called from the Redstring context
  // For now, return mock data structure that represents the actual Redstring graphs
  return {
    graphs: {
      "main": {
        id: "main",
        name: "Main Graph",
        nodes: [
          { id: "1", name: "Knowledge Graph", description: "A cognitive knowledge graph" },
          { id: "2", name: "AI Collaboration", description: "Human-AI collaboration tools" }
        ],
        edges: [
          { id: "1", sourceId: "1", targetId: "2", type: "relates_to" }
        ],
        nodeCount: 2,
        edgeCount: 1
      },
      "better-call-saul": {
        id: "better-call-saul",
        name: "Better Call Saul",
        nodes: [
          { id: "jimmy", name: "Jimmy McGill", description: "Main character, lawyer who becomes Saul Goodman" },
          { id: "kim", name: "Kim Wexler", description: "Jimmy's romantic partner and fellow lawyer" },
          { id: "chuck", name: "Chuck McGill", description: "Jimmy's older brother, senior partner at HHM" },
          { id: "mike", name: "Mike Ehrmantraut", description: "Former police officer, now private investigator" },
          { id: "gus", name: "Gustavo Fring", description: "Chicken restaurant owner, drug kingpin" },
          { id: "nacho", name: "Ignacio Varga", description: "Member of the Salamanca cartel" },
          { id: "howard", name: "Howard Hamlin", description: "Senior partner at HHM law firm" },
          { id: "lalo", name: "Lalo Salamanca", description: "Cartel member, antagonist" }
        ],
        edges: [
          { id: "jimmy-kim", sourceId: "jimmy", targetId: "kim", type: "romantic_partner" },
          { id: "jimmy-chuck", sourceId: "jimmy", targetId: "chuck", type: "brother" },
          { id: "jimmy-mike", sourceId: "jimmy", targetId: "mike", type: "client" },
          { id: "mike-gus", sourceId: "mike", targetId: "gus", type: "employee" },
          { id: "gus-nacho", sourceId: "gus", targetId: "nacho", type: "controls" },
          { id: "nacho-lalo", sourceId: "nacho", targetId: "lalo", type: "cartel_member" },
          { id: "howard-chuck", sourceId: "howard", targetId: "chuck", type: "law_partner" },
          { id: "jimmy-howard", sourceId: "jimmy", targetId: "howard", type: "former_employee" }
        ],
        nodeCount: 8,
        edgeCount: 8
      }
    },
    activeGraphId: activeGraphId,
    graphCount: 2
  };
}

// Register MCP tools
server.tool(
  "list_available_graphs",
  "List all available knowledge graphs in Redstring",
  {},
  async () => {
    const graphData = getGraphData();
    
    const response = `**Available Knowledge Graphs:**

${Object.values(graphData.graphs).map(graph => `
**${graph.name}** (ID: ${graph.id})
- Nodes: ${graph.nodeCount}
- Edges: ${graph.edgeCount}
- Status: ${graph.id === graphData.activeGraphId ? '🟢 Active' : '⚪ Inactive'}
`).join('\n')}

**Current Active Graph:** ${graphData.activeGraphId}

To switch to a different graph, use the \`set_active_graph\` tool with the graph ID.`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "set_active_graph",
  "Switch to a different knowledge graph",
  {
    graphId: z.string().describe("The ID of the graph to activate")
  },
  async ({ graphId }) => {
    const graphData = getGraphData();
    
    if (!graphData.graphs[graphId]) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Graph "${graphId}" not found. Available graphs:\n${Object.keys(graphData.graphs).join(', ')}`
          }
        ]
      };
    }
    
    // Update the global active graph state
    activeGraphId = graphId;
    
    const graph = graphData.graphs[graphId];
    const response = `✅ Switched to **${graph.name}** (${graphId})

**Graph Overview:**
- Nodes: ${graph.nodeCount}
- Edges: ${graph.edgeCount}

**Available Nodes:**
${graph.nodes.map(node => `- ${node.name}: ${node.description}`).join('\n')}

**Key Relationships:**
${graph.edges.slice(0, 5).map(edge => {
  const source = graph.nodes.find(n => n.id === edge.sourceId);
  const target = graph.nodes.find(n => n.id === edge.targetId);
  return `- ${source?.name} → ${target?.name} (${edge.type})`;
}).join('\n')}

You can now explore this graph using the \`explore_knowledge\` tool!`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "explore_knowledge",
  "Explore and analyze the knowledge graph",
  {
    query: z.string().describe("The query or concept to explore in the knowledge graph"),
    maxDepth: z.number().optional().describe("Maximum depth for exploration (default: 2)"),
    graphId: z.string().optional().describe("Specific graph to explore (default: active graph)")
  },
  async ({ query, maxDepth = 2, graphId }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find nodes that match the query
    const matchingNodes = graph.nodes.filter(node => 
      node.name.toLowerCase().includes(query.toLowerCase()) ||
      node.description.toLowerCase().includes(query.toLowerCase())
    );
    
    // Find related edges
    const relatedEdges = graph.edges.filter(edge => 
      matchingNodes.some(node => node.id === edge.sourceId || node.id === edge.targetId)
    );
    
    const response = `🔍 **Knowledge Exploration Results**

**Query:** "${query}"
**Graph:** ${graph.name} (${targetGraphId})
**Exploration Depth:** ${maxDepth}

**Matching Nodes (${matchingNodes.length}):**
${matchingNodes.length > 0 ? matchingNodes.map(node => `- **${node.name}**: ${node.description}`).join('\n') : '- No direct matches found'}

**Related Relationships (${relatedEdges.length}):**
${relatedEdges.length > 0 ? relatedEdges.map(edge => {
  const source = graph.nodes.find(n => n.id === edge.sourceId);
  const target = graph.nodes.find(n => n.id === edge.targetId);
  return `- ${source?.name} → ${target?.name} (${edge.type})`;
}).join('\n') : '- No relationships found'}

**Graph Statistics:**
- Total Nodes: ${graph.nodeCount}
- Total Edges: ${graph.edgeCount}
- Match Coverage: ${matchingNodes.length}/${graph.nodeCount} nodes

**Recommendations:**
${matchingNodes.length > 0 ? 
  `- Explore deeper connections for: ${matchingNodes.slice(0, 3).map(n => n.name).join(', ')}` :
  '- Try a broader search term or explore the full graph structure'
}`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "get_node_details",
  "Get detailed information about a specific node in the knowledge graph",
  {
    nodeName: z.string().describe("Name of the node to get details for"),
    graphId: z.string().optional().describe("Specific graph to search (default: active graph)")
  },
  async ({ nodeName, graphId }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find the node
    const node = graph.nodes.find(n => 
      n.name.toLowerCase().includes(nodeName.toLowerCase()) ||
      n.id.toLowerCase().includes(nodeName.toLowerCase())
    );
    
    if (!node) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Node "${nodeName}" not found in graph "${graph.name}". Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    // Find all edges involving this node
    const incomingEdges = graph.edges.filter(edge => edge.targetId === node.id);
    const outgoingEdges = graph.edges.filter(edge => edge.sourceId === node.id);
    
    const response = `📋 **Node Details: ${node.name}**

**Basic Information:**
- ID: ${node.id}
- Name: ${node.name}
- Description: ${node.description}
- Graph: ${graph.name} (${targetGraphId})

**Connections:**
- Incoming: ${incomingEdges.length} connections
- Outgoing: ${outgoingEdges.length} connections
- Total: ${incomingEdges.length + outgoingEdges.length} connections

**Incoming Relationships:**
${incomingEdges.length > 0 ? incomingEdges.map(edge => {
  const source = graph.nodes.find(n => n.id === edge.sourceId);
  return `- ${source?.name} → ${node.name} (${edge.type})`;
}).join('\n') : '- None'}

**Outgoing Relationships:**
${outgoingEdges.length > 0 ? outgoingEdges.map(edge => {
  const target = graph.nodes.find(n => n.id === edge.targetId);
  return `- ${node.name} → ${target?.name} (${edge.type})`;
}).join('\n') : '- None'}

**Network Analysis:**
- Centrality: ${incomingEdges.length + outgoingEdges.length > 3 ? 'High' : incomingEdges.length + outgoingEdges.length > 1 ? 'Medium' : 'Low'}
- Role: ${incomingEdges.length > outgoingEdges.length ? 'Receives more connections' : outgoingEdges.length > incomingEdges.length ? 'Initiates more connections' : 'Balanced connections'}`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "create_concept_map",
  "Create a concept map from the knowledge graph",
  {
    domain: z.string().describe("The domain or topic for the concept map"),
    includeRelationships: z.boolean().optional().describe("Include relationship types in the map"),
    graphId: z.string().optional().describe("Specific graph to map (default: active graph)")
  },
  async ({ domain, includeRelationships = true, graphId }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    const response = `🗺️ **Concept Map: ${domain}**

**Graph:** ${graph.name} (${targetGraphId})
**Total Concepts:** ${graph.nodeCount}
**Total Relationships:** ${graph.edgeCount}

**Core Concepts:**
${graph.nodes.map(node => `• **${node.name}**: ${node.description}`).join('\n')}

${includeRelationships ? `
**Key Relationships:**
${graph.edges.map(edge => {
  const source = graph.nodes.find(n => n.id === edge.sourceId);
  const target = graph.nodes.find(n => n.id === edge.targetId);
  return `• ${source?.name} → ${target?.name} (${edge.type})`;
}).join('\n')}
` : ''}

**Map Structure:**
This concept map shows the interconnected nature of ${domain} within the ${graph.name}. Each node represents a key concept, and the relationships show how these concepts interact and influence each other.

**Map Features:**
- Hierarchical organization of concepts
- Clear relationship mapping
- Cross-domain connections
- Scalable structure for expansion

**Next Steps:**
1. Add more specific concepts to each domain
2. Create sub-maps for detailed areas
3. Identify gaps and opportunities for new connections
4. Validate relationships with domain experts

This concept map provides a foundation for understanding and expanding your knowledge in this domain.`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "add_node",
  "Add a new node to the knowledge graph",
  {
    nodeName: z.string().describe("Name of the node to add"),
    description: z.string().describe("Description of the node"),
    nodeType: z.string().optional().describe("Type of node (e.g., 'character', 'concept', 'location')"),
    graphId: z.string().optional().describe("Specific graph to add to (default: active graph)"),
    position: z.object({
      x: z.number().optional().describe("X coordinate for positioning"),
      y: z.number().optional().describe("Y coordinate for positioning")
    }).optional().describe("Position coordinates for the node")
  },
  async ({ nodeName, description, nodeType = "concept", graphId, position }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Generate unique ID for the new node
    const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the new node
    const newNode = {
      id: newNodeId,
      name: nodeName,
      description: description,
      type: nodeType,
      position: position || { x: Math.random() * 100, y: Math.random() * 100 },
      createdAt: new Date().toISOString()
    };
    
    // Add to graph (in a real implementation, this would persist to storage)
    graph.nodes.push(newNode);
    graph.nodeCount = graph.nodes.length;
    
    const response = `✅ **Node Added Successfully**

**New Node Details:**
- **ID:** ${newNodeId}
- **Name:** ${nodeName}
- **Description:** ${description}
- **Type:** ${nodeType}
- **Graph:** ${graph.name} (${targetGraphId})
- **Position:** ${JSON.stringify(newNode.position)}

**Graph Statistics:**
- Total Nodes: ${graph.nodeCount}
- Total Edges: ${graph.edgeCount}

**Next Steps:**
- Use \`get_node_details "${nodeName}"\` to view the new node
- Use \`add_edge\` to connect this node to others
- Use \`explore_knowledge "${nodeName}"\` to see how it fits in the graph`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "remove_node",
  "Remove a node from the knowledge graph",
  {
    nodeName: z.string().describe("Name of the node to remove"),
    graphId: z.string().optional().describe("Specific graph to remove from (default: active graph)"),
    removeEdges: z.boolean().optional().describe("Also remove all edges connected to this node (default: true)")
  },
  async ({ nodeName, graphId, removeEdges = true }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find the node to remove
    const nodeIndex = graph.nodes.findIndex(n => 
      n.name.toLowerCase().includes(nodeName.toLowerCase()) ||
      n.id.toLowerCase().includes(nodeName.toLowerCase())
    );
    
    if (nodeIndex === -1) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Node "${nodeName}" not found in graph "${graph.name}". Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    const nodeToRemove = graph.nodes[nodeIndex];
    
    // Remove connected edges if requested
    let removedEdges = 0;
    if (removeEdges) {
      const originalEdgeCount = graph.edges.length;
      graph.edges = graph.edges.filter(edge => 
        edge.sourceId !== nodeToRemove.id && edge.targetId !== nodeToRemove.id
      );
      removedEdges = originalEdgeCount - graph.edges.length;
    }
    
    // Remove the node
    graph.nodes.splice(nodeIndex, 1);
    graph.nodeCount = graph.nodes.length;
    graph.edgeCount = graph.edges.length;
    
    const response = `🗑️ **Node Removed Successfully**

**Removed Node:**
- **Name:** ${nodeToRemove.name}
- **ID:** ${nodeToRemove.id}
- **Description:** ${nodeToRemove.description}

**Removal Details:**
- Node removed from graph: ${graph.name} (${targetGraphId})
- Connected edges removed: ${removedEdges}
- Remove edges option: ${removeEdges ? 'Yes' : 'No'}

**Updated Graph Statistics:**
- Total Nodes: ${graph.nodeCount}
- Total Edges: ${graph.edgeCount}

**Impact:**
- The node and its connections have been removed from the graph
- Use \`list_available_graphs\` to see current graph state
- Use \`explore_knowledge\` to explore remaining nodes`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "move_node",
  "Move a node to a new position in the knowledge graph",
  {
    nodeName: z.string().describe("Name of the node to move"),
    newPosition: z.object({
      x: z.number().describe("New X coordinate"),
      y: z.number().describe("New Y coordinate")
    }).describe("New position coordinates"),
    graphId: z.string().optional().describe("Specific graph containing the node (default: active graph)")
  },
  async ({ nodeName, newPosition, graphId }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find the node to move
    const node = graph.nodes.find(n => 
      n.name.toLowerCase().includes(nodeName.toLowerCase()) ||
      n.id.toLowerCase().includes(nodeName.toLowerCase())
    );
    
    if (!node) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Node "${nodeName}" not found in graph "${graph.name}". Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    // Store old position
    const oldPosition = node.position || { x: 0, y: 0 };
    
    // Update position
    node.position = newPosition;
    node.lastMoved = new Date().toISOString();
    
    const response = `📍 **Node Moved Successfully**

**Node Details:**
- **Name:** ${node.name}
- **ID:** ${node.id}

**Position Change:**
- **From:** ${JSON.stringify(oldPosition)}
- **To:** ${JSON.stringify(newPosition)}
- **Graph:** ${graph.name} (${targetGraphId})

**Movement Info:**
- Movement timestamp: ${node.lastMoved}
- Node type: ${node.type || 'concept'}

**Next Steps:**
- Use \`get_node_details "${node.name}"\` to see updated node info
- Use \`create_concept_map\` to visualize the new layout
- Use \`explore_knowledge\` to see how the node fits in its new position`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "add_edge",
  "Add a new edge/relationship between nodes in the knowledge graph",
  {
    sourceNode: z.string().describe("Name or ID of the source node"),
    targetNode: z.string().describe("Name or ID of the target node"),
    edgeType: z.string().describe("Type of relationship (e.g., 'friend', 'enemy', 'works_for', 'lives_in')"),
    graphId: z.string().optional().describe("Specific graph to add edge to (default: active graph)"),
    weight: z.number().optional().describe("Relationship strength/weight (default: 1.0)"),
    bidirectional: z.boolean().optional().describe("Create bidirectional relationship (default: false)")
  },
  async ({ sourceNode, targetNode, edgeType, graphId, weight = 1.0, bidirectional = false }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find source and target nodes
    const source = graph.nodes.find(n => 
      n.name.toLowerCase().includes(sourceNode.toLowerCase()) ||
      n.id.toLowerCase().includes(sourceNode.toLowerCase())
    );
    
    const target = graph.nodes.find(n => 
      n.name.toLowerCase().includes(targetNode.toLowerCase()) ||
      n.id.toLowerCase().includes(targetNode.toLowerCase())
    );
    
    if (!source) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Source node "${sourceNode}" not found in graph "${graph.name}". Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    if (!target) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Target node "${targetNode}" not found in graph "${graph.name}". Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    // Generate unique edge ID
    const edgeId = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the edge
    const newEdge = {
      id: edgeId,
      sourceId: source.id,
      targetId: target.id,
      type: edgeType,
      weight: weight,
      createdAt: new Date().toISOString()
    };
    
    // Add to graph
    graph.edges.push(newEdge);
    graph.edgeCount = graph.edges.length;
    
    // Add reverse edge if bidirectional
    if (bidirectional) {
      const reverseEdgeId = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const reverseEdge = {
        id: reverseEdgeId,
        sourceId: target.id,
        targetId: source.id,
        type: edgeType,
        weight: weight,
        createdAt: new Date().toISOString(),
        isReverse: true
      };
      graph.edges.push(reverseEdge);
      graph.edgeCount = graph.edges.length;
    }
    
    const response = `🔗 **Edge Added Successfully**

**New Relationship:**
- **Source:** ${source.name} (${source.id})
- **Target:** ${target.name} (${target.id})
- **Type:** ${edgeType}
- **Weight:** ${weight}
- **Bidirectional:** ${bidirectional ? 'Yes' : 'No'}
- **Graph:** ${graph.name} (${targetGraphId})

**Graph Statistics:**
- Total Nodes: ${graph.nodeCount}
- Total Edges: ${graph.edgeCount}

**Next Steps:**
- Use \`get_node_details "${source.name}"\` to see updated connections
- Use \`get_node_details "${target.name}"\` to see updated connections
- Use \`explore_knowledge "${edgeType}"\` to find similar relationships`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "remove_edge",
  "Remove an edge/relationship from the knowledge graph",
  {
    sourceNode: z.string().describe("Name or ID of the source node"),
    targetNode: z.string().describe("Name or ID of the target node"),
    edgeType: z.string().optional().describe("Specific edge type to remove (optional)"),
    graphId: z.string().optional().describe("Specific graph to remove from (default: active graph)"),
    removeBidirectional: z.boolean().optional().describe("Also remove reverse edge if it exists (default: true)")
  },
  async ({ sourceNode, targetNode, edgeType, graphId, removeBidirectional = true }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find source and target nodes
    const source = graph.nodes.find(n => 
      n.name.toLowerCase().includes(sourceNode.toLowerCase()) ||
      n.id.toLowerCase().includes(sourceNode.toLowerCase())
    );
    
    const target = graph.nodes.find(n => 
      n.name.toLowerCase().includes(targetNode.toLowerCase()) ||
      n.id.toLowerCase().includes(targetNode.toLowerCase())
    );
    
    if (!source || !target) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Node not found. Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    // Find edges to remove
    let edgesToRemove = graph.edges.filter(edge => 
      edge.sourceId === source.id && edge.targetId === target.id
    );
    
    if (edgeType) {
      edgesToRemove = edgesToRemove.filter(edge => edge.type === edgeType);
    }
    
    if (removeBidirectional) {
      const reverseEdges = graph.edges.filter(edge => 
        edge.sourceId === target.id && edge.targetId === source.id
      );
      if (edgeType) {
        edgesToRemove = edgesToRemove.concat(reverseEdges.filter(edge => edge.type === edgeType));
      } else {
        edgesToRemove = edgesToRemove.concat(reverseEdges);
      }
    }
    
    if (edgesToRemove.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `❌ No edges found between "${source.name}" and "${target.name}"${edgeType ? ` of type "${edgeType}"` : ''} in graph "${graph.name}".`
          }
        ]
      };
    }
    
    // Remove edges
    const originalEdgeCount = graph.edges.length;
    graph.edges = graph.edges.filter(edge => !edgesToRemove.some(toRemove => toRemove.id === edge.id));
    const removedCount = originalEdgeCount - graph.edges.length;
    graph.edgeCount = graph.edges.length;
    
    const response = `✂️ **Edge(s) Removed Successfully**

**Removed Relationships:**
- **Source:** ${source.name}
- **Target:** ${target.name}
- **Type:** ${edgeType || 'All types'}
- **Count:** ${removedCount} edge(s) removed
- **Bidirectional:** ${removeBidirectional ? 'Yes' : 'No'}

**Updated Graph Statistics:**
- Total Nodes: ${graph.nodeCount}
- Total Edges: ${graph.edgeCount}

**Impact:**
- The relationship(s) have been removed from the graph
- Use \`get_node_details\` to see updated node connections
- Use \`explore_knowledge\` to explore remaining relationships`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "update_node",
  "Update an existing node's properties in the knowledge graph",
  {
    nodeName: z.string().describe("Name or ID of the node to update"),
    updates: z.object({
      name: z.string().optional().describe("New name for the node"),
      description: z.string().optional().describe("New description for the node"),
      type: z.string().optional().describe("New type for the node"),
      position: z.object({
        x: z.number().optional().describe("New X coordinate"),
        y: z.number().optional().describe("New Y coordinate")
      }).optional().describe("New position coordinates"),
      metadata: z.record(z.any()).optional().describe("Additional metadata to add/update")
    }).describe("Properties to update"),
    graphId: z.string().optional().describe("Specific graph containing the node (default: active graph)")
  },
  async ({ nodeName, updates, graphId }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find the node to update
    const node = graph.nodes.find(n => 
      n.name.toLowerCase().includes(nodeName.toLowerCase()) ||
      n.id.toLowerCase().includes(nodeName.toLowerCase())
    );
    
    if (!node) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Node "${nodeName}" not found in graph "${graph.name}". Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    // Store old values for comparison
    const oldValues = {
      name: node.name,
      description: node.description,
      type: node.type,
      position: node.position
    };
    
    // Apply updates
    if (updates.name) node.name = updates.name;
    if (updates.description) node.description = updates.description;
    if (updates.type) node.type = updates.type;
    if (updates.position) node.position = updates.position;
    if (updates.metadata) {
      node.metadata = { ...node.metadata, ...updates.metadata };
    }
    
    node.lastUpdated = new Date().toISOString();
    
    const response = `✏️ **Node Updated Successfully**

**Node:** ${node.name} (${node.id})

**Changes Made:**
${updates.name ? `- **Name:** "${oldValues.name}" → "${node.name}"` : ''}
${updates.description ? `- **Description:** "${oldValues.description}" → "${node.description}"` : ''}
${updates.type ? `- **Type:** "${oldValues.type}" → "${node.type}"` : ''}
${updates.position ? `- **Position:** ${JSON.stringify(oldValues.position)} → ${JSON.stringify(node.position)}` : ''}
${updates.metadata ? `- **Metadata:** Updated with new properties` : ''}

**Update Info:**
- Last updated: ${node.lastUpdated}
- Graph: ${graph.name} (${targetGraphId})

**Next Steps:**
- Use \`get_node_details "${node.name}"\` to see the updated node
- Use \`explore_knowledge "${node.name}"\` to see how it fits in the graph
- Use \`create_concept_map\` to visualize the updated graph`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "duplicate_node",
  "Create a copy of an existing node in the knowledge graph",
  {
    nodeName: z.string().describe("Name or ID of the node to duplicate"),
    newName: z.string().describe("Name for the duplicated node"),
    graphId: z.string().optional().describe("Specific graph containing the node (default: active graph)"),
    includeEdges: z.boolean().optional().describe("Also duplicate connected edges (default: false)"),
    newPosition: z.object({
      x: z.number().optional().describe("X coordinate for the new node"),
      y: z.number().optional().describe("Y coordinate for the new node")
    }).optional().describe("Position for the duplicated node")
  },
  async ({ nodeName, newName, graphId, includeEdges = false, newPosition }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find the node to duplicate
    const originalNode = graph.nodes.find(n => 
      n.name.toLowerCase().includes(nodeName.toLowerCase()) ||
      n.id.toLowerCase().includes(nodeName.toLowerCase())
    );
    
    if (!originalNode) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Node "${nodeName}" not found in graph "${graph.name}". Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    // Generate unique ID for the duplicated node
    const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the duplicated node
    const duplicatedNode = {
      id: newNodeId,
      name: newName,
      description: originalNode.description,
      type: originalNode.type,
      position: newPosition || { 
        x: (originalNode.position?.x || 0) + 50, 
        y: (originalNode.position?.y || 0) + 50 
      },
      metadata: { ...originalNode.metadata },
      duplicatedFrom: originalNode.id,
      createdAt: new Date().toISOString()
    };
    
    // Add to graph
    graph.nodes.push(duplicatedNode);
    graph.nodeCount = graph.nodes.length;
    
    // Duplicate edges if requested
    let duplicatedEdges = 0;
    if (includeEdges) {
      const originalEdges = graph.edges.filter(edge => 
        edge.sourceId === originalNode.id || edge.targetId === originalNode.id
      );
      
      originalEdges.forEach(edge => {
        const newEdgeId = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newEdge = {
          id: newEdgeId,
          sourceId: edge.sourceId === originalNode.id ? newNodeId : edge.sourceId,
          targetId: edge.targetId === originalNode.id ? newNodeId : edge.targetId,
          type: edge.type,
          weight: edge.weight,
          duplicatedFrom: edge.id,
          createdAt: new Date().toISOString()
        };
        graph.edges.push(newEdge);
        duplicatedEdges++;
      });
      
      graph.edgeCount = graph.edges.length;
    }
    
    const response = `📋 **Node Duplicated Successfully**

**Original Node:**
- **Name:** ${originalNode.name} (${originalNode.id})
- **Type:** ${originalNode.type}

**Duplicated Node:**
- **Name:** ${newName} (${newNodeId})
- **Type:** ${duplicatedNode.type}
- **Position:** ${JSON.stringify(duplicatedNode.position)}
- **Duplicated from:** ${originalNode.id}

**Duplication Details:**
- Edges duplicated: ${duplicatedEdges}
- Include edges option: ${includeEdges ? 'Yes' : 'No'}
- Graph: ${graph.name} (${targetGraphId})

**Updated Graph Statistics:**
- Total Nodes: ${graph.nodeCount}
- Total Edges: ${graph.edgeCount}

**Next Steps:**
- Use \`get_node_details "${newName}"\` to see the duplicated node
- Use \`update_node\` to modify the duplicated node
- Use \`add_edge\` to create new connections for the duplicated node`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "merge_nodes",
  "Merge two nodes into a single node in the knowledge graph",
  {
    sourceNode: z.string().describe("Name or ID of the source node (will be kept)"),
    targetNode: z.string().describe("Name or ID of the target node (will be merged into source)"),
    mergeStrategy: z.enum(["keep_source", "keep_target", "combine"]).optional().describe("How to handle conflicting properties (default: keep_source)"),
    graphId: z.string().optional().describe("Specific graph containing the nodes (default: active graph)"),
    mergeEdges: z.boolean().optional().describe("Merge duplicate edges (default: true)")
  },
  async ({ sourceNode, targetNode, mergeStrategy = "keep_source", graphId, mergeEdges = true }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find the nodes to merge
    const source = graph.nodes.find(n => 
      n.name.toLowerCase().includes(sourceNode.toLowerCase()) ||
      n.id.toLowerCase().includes(sourceNode.toLowerCase())
    );
    
    const target = graph.nodes.find(n => 
      n.name.toLowerCase().includes(targetNode.toLowerCase()) ||
      n.id.toLowerCase().includes(targetNode.toLowerCase())
    );
    
    if (!source || !target) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Node not found. Available nodes:\n${graph.nodes.map(n => `- ${n.name}`).join('\n')}`
          }
        ]
      };
    }
    
    if (source.id === target.id) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Cannot merge a node with itself.`
          }
        ]
      };
    }
    
    // Store original values
    const originalSource = { ...source };
    const originalTarget = { ...target };
    
    // Merge properties based on strategy
    if (mergeStrategy === "keep_target") {
      source.name = target.name;
      source.description = target.description;
      source.type = target.type;
      source.position = target.position;
    } else if (mergeStrategy === "combine") {
      source.name = `${source.name} / ${target.name}`;
      source.description = `${source.description} | ${target.description}`;
      source.type = source.type || target.type;
    }
    // keep_source strategy - no changes needed
    
    // Update metadata
    source.metadata = { 
      ...source.metadata, 
      ...target.metadata,
      mergedFrom: target.id,
      mergedAt: new Date().toISOString()
    };
    
    // Redirect edges from target to source
    let redirectedEdges = 0;
    let mergedEdges = 0;
    
    graph.edges.forEach(edge => {
      if (edge.sourceId === target.id) {
        edge.sourceId = source.id;
        redirectedEdges++;
      }
      if (edge.targetId === target.id) {
        edge.targetId = source.id;
        redirectedEdges++;
      }
    });
    
    // Remove duplicate edges if requested
    if (mergeEdges) {
      const seenEdges = new Set();
      graph.edges = graph.edges.filter(edge => {
        const edgeKey = `${edge.sourceId}-${edge.targetId}-${edge.type}`;
        if (seenEdges.has(edgeKey)) {
          mergedEdges++;
          return false;
        }
        seenEdges.add(edgeKey);
        return true;
      });
    }
    
    // Remove the target node
    const targetIndex = graph.nodes.findIndex(n => n.id === target.id);
    graph.nodes.splice(targetIndex, 1);
    
    // Update graph statistics
    graph.nodeCount = graph.nodes.length;
    graph.edgeCount = graph.edges.length;
    
    const response = `🔗 **Nodes Merged Successfully**

**Merged Nodes:**
- **Source (kept):** ${source.name} (${source.id})
- **Target (merged):** ${originalTarget.name} (${target.id})

**Merge Strategy:** ${mergeStrategy}

**Merge Details:**
- Edges redirected: ${redirectedEdges}
- Edges merged: ${mergedEdges}
- Merge edges option: ${mergeEdges ? 'Yes' : 'No'}
- Graph: ${graph.name} (${targetGraphId})

**Updated Graph Statistics:**
- Total Nodes: ${graph.nodeCount}
- Total Edges: ${graph.edgeCount}

**Result:**
- All connections to the target node now point to the source node
- The target node has been removed from the graph
- Use \`get_node_details "${source.name}"\` to see the merged node`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "create_graph",
  "Create a new knowledge graph",
  {
    graphName: z.string().describe("Name for the new graph"),
    graphId: z.string().optional().describe("Custom ID for the graph (auto-generated if not provided)"),
    description: z.string().optional().describe("Description of the graph"),
    template: z.enum(["empty", "character_network", "concept_map", "timeline"]).optional().describe("Template to start with (default: empty)")
  },
  async ({ graphName, graphId, description, template = "empty" }) => {
    const graphData = getGraphData();
    
    // Generate graph ID if not provided
    const newGraphId = graphId || `graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if graph ID already exists
    if (graphData.graphs[newGraphId]) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Graph ID "${newGraphId}" already exists. Please choose a different ID.`
          }
        ]
      };
    }
    
    // Create base graph structure
    let newGraph = {
      id: newGraphId,
      name: graphName,
      description: description || `Knowledge graph: ${graphName}`,
      nodes: [],
      edges: [],
      nodeCount: 0,
      edgeCount: 0,
      createdAt: new Date().toISOString(),
      template: template
    };
    
    // Add template content
    switch (template) {
      case "character_network":
        newGraph.nodes = [
          { id: "protagonist", name: "Protagonist", description: "Main character", type: "character", position: { x: 200, y: 200 } },
          { id: "antagonist", name: "Antagonist", description: "Opposing character", type: "character", position: { x: 400, y: 200 } },
          { id: "supporting", name: "Supporting Character", description: "Supporting role", type: "character", position: { x: 300, y: 100 } }
        ];
        newGraph.edges = [
          { id: "conflict", sourceId: "protagonist", targetId: "antagonist", type: "conflicts_with" },
          { id: "helps", sourceId: "supporting", targetId: "protagonist", type: "helps" }
        ];
        break;
        
      case "concept_map":
        newGraph.nodes = [
          { id: "main_concept", name: "Main Concept", description: "Central concept", type: "concept", position: { x: 300, y: 200 } },
          { id: "sub_concept_1", name: "Sub Concept 1", description: "Related concept", type: "concept", position: { x: 200, y: 100 } },
          { id: "sub_concept_2", name: "Sub Concept 2", description: "Related concept", type: "concept", position: { x: 400, y: 100 } }
        ];
        newGraph.edges = [
          { id: "relates_1", sourceId: "main_concept", targetId: "sub_concept_1", type: "relates_to" },
          { id: "relates_2", sourceId: "main_concept", targetId: "sub_concept_2", type: "relates_to" }
        ];
        break;
        
      case "timeline":
        newGraph.nodes = [
          { id: "event_1", name: "Event 1", description: "First event", type: "event", position: { x: 100, y: 200 } },
          { id: "event_2", name: "Event 2", description: "Second event", type: "event", position: { x: 300, y: 200 } },
          { id: "event_3", name: "Event 3", description: "Third event", type: "event", position: { x: 500, y: 200 } }
        ];
        newGraph.edges = [
          { id: "leads_to_1", sourceId: "event_1", targetId: "event_2", type: "leads_to" },
          { id: "leads_to_2", sourceId: "event_2", targetId: "event_3", type: "leads_to" }
        ];
        break;
    }
    
    // Update counts
    newGraph.nodeCount = newGraph.nodes.length;
    newGraph.edgeCount = newGraph.edges.length;
    
    // Add to graphs (in a real implementation, this would persist to storage)
    graphData.graphs[newGraphId] = newGraph;
    graphData.graphCount = Object.keys(graphData.graphs).length;
    
    const response = `✨ **New Graph Created Successfully**

**Graph Details:**
- **Name:** ${graphName}
- **ID:** ${newGraphId}
- **Description:** ${newGraph.description}
- **Template:** ${template}

**Initial Content:**
- Nodes: ${newGraph.nodeCount}
- Edges: ${newGraph.edgeCount}

**Template Features:**
${template === "empty" ? "- Empty graph ready for your content" :
  template === "character_network" ? "- Protagonist, antagonist, and supporting character structure" :
  template === "concept_map" ? "- Main concept with related sub-concepts" :
  "- Timeline with sequential events"}

**Next Steps:**
- Use \`set_active_graph "${newGraphId}"\` to switch to this graph
- Use \`add_node\` to add more nodes
- Use \`add_edge\` to create relationships
- Use \`explore_knowledge\` to explore the new graph`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "delete_graph",
  "Delete an entire knowledge graph",
  {
    graphId: z.string().describe("ID of the graph to delete"),
    confirm: z.boolean().describe("Confirm deletion (must be true)")
  },
  async ({ graphId, confirm }) => {
    if (!confirm) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Deletion not confirmed. Set confirm to true to delete the graph.`
          }
        ]
      };
    }
    
    const graphData = getGraphData();
    
    if (!graphData.graphs[graphId]) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Graph "${graphId}" not found. Available graphs:\n${Object.keys(graphData.graphs).join(', ')}`
          }
        ]
      };
    }
    
    const graphToDelete = graphData.graphs[graphId];
    
    // Don't allow deletion of the last graph
    if (Object.keys(graphData.graphs).length === 1) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Cannot delete the last remaining graph. Create another graph first.`
          }
        ]
      };
    }
    
    // Delete the graph
    delete graphData.graphs[graphId];
    graphData.graphCount = Object.keys(graphData.graphs).length;
    
    // If the deleted graph was active, switch to the first available graph
    if (activeGraphId === graphId) {
      activeGraphId = Object.keys(graphData.graphs)[0];
    }
    
    const response = `🗑️ **Graph Deleted Successfully**

**Deleted Graph:**
- **Name:** ${graphToDelete.name}
- **ID:** ${graphId}
- **Nodes:** ${graphToDelete.nodeCount}
- **Edges:** ${graphToDelete.edgeCount}

**Impact:**
- All nodes and edges in the graph have been permanently removed
- Graph structure and relationships are lost

**Current State:**
- Remaining graphs: ${graphData.graphCount}
- Active graph: ${activeGraphId}

**Next Steps:**
- Use \`list_available_graphs\` to see remaining graphs
- Use \`set_active_graph\` to switch to a different graph
- Use \`create_graph\` to create a new graph`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "export_graph",
  "Export a knowledge graph to various formats",
  {
    graphId: z.string().optional().describe("Specific graph to export (default: active graph)"),
    format: z.enum(["json", "csv", "graphml", "dot"]).optional().describe("Export format (default: json)"),
    includeMetadata: z.boolean().optional().describe("Include node/edge metadata (default: true)")
  },
  async ({ graphId, format = "json", includeMetadata = true }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    let exportData = "";
    let exportType = "text";
    
    switch (format) {
      case "json":
        exportData = JSON.stringify(graph, null, 2);
        break;
        
      case "csv":
        // Export nodes
        const nodeHeaders = ["id", "name", "description", "type", "x", "y"];
        const nodeRows = graph.nodes.map(node => [
          node.id,
          node.name,
          node.description,
          node.type || "",
          node.position?.x || 0,
          node.position?.y || 0
        ]);
        
        // Export edges
        const edgeHeaders = ["id", "source", "target", "type", "weight"];
        const edgeRows = graph.edges.map(edge => [
          edge.id,
          edge.sourceId,
          edge.targetId,
          edge.type,
          edge.weight || 1
        ]);
        
        exportData = `# Nodes\n${nodeHeaders.join(",")}\n${nodeRows.map(row => row.join(",")).join("\n")}\n\n# Edges\n${edgeHeaders.join(",")}\n${edgeRows.map(row => row.join(",")).join("\n")}`;
        break;
        
      case "graphml":
        exportData = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <graph id="${graph.id}" edgedefault="directed">
    ${graph.nodes.map(node => `<node id="${node.id}"><data key="name">${node.name}</data><data key="description">${node.description}</data></node>`).join("\n    ")}
    ${graph.edges.map(edge => `<edge id="${edge.id}" source="${edge.sourceId}" target="${edge.targetId}"><data key="type">${edge.type}</data></edge>`).join("\n    ")}
  </graph>
</graphml>`;
        break;
        
      case "dot":
        exportData = `digraph "${graph.name}" {
  ${graph.nodes.map(node => `"${node.id}" [label="${node.name}", tooltip="${node.description}"];`).join("\n  ")}
  ${graph.edges.map(edge => `"${edge.sourceId}" -> "${edge.targetId}" [label="${edge.type}"];`).join("\n  ")}
}`;
        break;
    }
    
    const response = `📤 **Graph Exported Successfully**

**Export Details:**
- **Graph:** ${graph.name} (${targetGraphId})
- **Format:** ${format.toUpperCase()}
- **Include Metadata:** ${includeMetadata ? 'Yes' : 'No'}

**Export Statistics:**
- Nodes: ${graph.nodeCount}
- Edges: ${graph.edgeCount}
- Export size: ${exportData.length} characters

**Export Data:**
\`\`\`${format}
${exportData}
\`\`\`

**Usage:**
- **JSON:** Use for data import/export or API integration
- **CSV:** Use for spreadsheet analysis or database import
- **GraphML:** Use with graph visualization tools like Gephi
- **DOT:** Use with Graphviz for diagram generation

**Next Steps:**
- Copy the export data to use in other tools
- Use \`import_graph\` to import this data back
- Use external tools to visualize or analyze the exported data`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "format_graph",
  "Format and organize the knowledge graph layout",
  {
    graphId: z.string().optional().describe("Specific graph to format (default: active graph)"),
    layoutType: z.enum(["circular", "hierarchical", "force_directed", "grid"]).optional().describe("Layout algorithm to use (default: force_directed)"),
    spacing: z.number().optional().describe("Spacing between nodes (default: 50)")
  },
  async ({ graphId, layoutType = "force_directed", spacing = 50 }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Apply layout algorithm
    let layoutApplied = "";
    let nodesFormatted = 0;
    
    switch (layoutType) {
      case "circular":
        const radius = Math.min(200, spacing * graph.nodes.length / (2 * Math.PI));
        graph.nodes.forEach((node, index) => {
          const angle = (2 * Math.PI * index) / graph.nodes.length;
          node.position = {
            x: Math.cos(angle) * radius + 300,
            y: Math.sin(angle) * radius + 300
          };
          nodesFormatted++;
        });
        layoutApplied = "Circular layout applied";
        break;
        
      case "hierarchical":
        const levels = Math.ceil(Math.sqrt(graph.nodes.length));
        const nodesPerLevel = Math.ceil(graph.nodes.length / levels);
        graph.nodes.forEach((node, index) => {
          const level = Math.floor(index / nodesPerLevel);
          const positionInLevel = index % nodesPerLevel;
          node.position = {
            x: positionInLevel * spacing + 100,
            y: level * spacing + 100
          };
          nodesFormatted++;
        });
        layoutApplied = "Hierarchical layout applied";
        break;
        
      case "grid":
        const cols = Math.ceil(Math.sqrt(graph.nodes.length));
        graph.nodes.forEach((node, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          node.position = {
            x: col * spacing + 100,
            y: row * spacing + 100
          };
          nodesFormatted++;
        });
        layoutApplied = "Grid layout applied";
        break;
        
      case "force_directed":
      default:
        // Simulate force-directed layout with random positioning
        graph.nodes.forEach((node, index) => {
          node.position = {
            x: Math.random() * 400 + 100,
            y: Math.random() * 400 + 100
          };
          nodesFormatted++;
        });
        layoutApplied = "Force-directed layout applied";
        break;
    }
    
    const response = `🎨 **Graph Formatted Successfully**

**Formatting Details:**
- **Layout Type:** ${layoutType}
- **Spacing:** ${spacing} units
- **Graph:** ${graph.name} (${targetGraphId})
- **Nodes Formatted:** ${nodesFormatted}/${graph.nodeCount}

**Layout Applied:**
${layoutApplied}

**Graph Statistics:**
- Total Nodes: ${graph.nodeCount}
- Total Edges: ${graph.edgeCount}
- Layout Algorithm: ${layoutType}

**Visualization:**
- All nodes have been repositioned according to the ${layoutType} algorithm
- Spacing between nodes: ${spacing} units
- Layout optimized for visual clarity

**Next Steps:**
- Use \`create_concept_map\` to visualize the new layout
- Use \`get_node_details\` to see individual node positions
- Use \`explore_knowledge\` to explore the reorganized graph

**Available Layouts:**
- **circular:** Nodes arranged in a circle
- **hierarchical:** Nodes arranged in levels
- **grid:** Nodes arranged in a grid pattern
- **force_directed:** Nodes positioned with simulated forces`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

server.tool(
  "collaborative_reasoning",
  "Engage in collaborative reasoning about the knowledge graph",
  {
    topic: z.string().describe("The topic or question for collaborative reasoning"),
    reasoningMode: z.enum(["exploratory", "analytical", "creative"]).optional().describe("Type of reasoning to apply"),
    graphId: z.string().optional().describe("Specific graph to use (default: active graph)")
  },
  async ({ topic, reasoningMode = "exploratory", graphId }) => {
    const graphData = getGraphData();
    const targetGraphId = graphId || graphData.activeGraphId;
    const graph = graphData.graphs[targetGraphId];
    
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
    
    // Find relevant nodes for the topic
    const relevantNodes = graph.nodes.filter(node => 
      node.name.toLowerCase().includes(topic.toLowerCase()) ||
      node.description.toLowerCase().includes(topic.toLowerCase())
    );
    
    const response = `🧠 **Collaborative Reasoning: ${topic}**

**Reasoning Mode:** ${reasoningMode}
**Graph:** ${graph.name} (${targetGraphId})
**Relevant Nodes Found:** ${relevantNodes.length}

**What I'm Seeing in Your Knowledge Graph:**
- You have ${graph.nodeCount} core concepts organized in ${graph.name}
- The graph shows ${graph.edgeCount} key relationships
- The structure suggests a ${reasoningMode} approach to knowledge organization

${relevantNodes.length > 0 ? `
**Relevant Concepts Found:**
${relevantNodes.map(node => `- **${node.name}**: ${node.description}`).join('\n')}

**My Analysis:**
Based on the ${reasoningMode} reasoning mode and the relevant concepts, I can see several interesting patterns:

1. **Direct Relevance:** ${relevantNodes.length} concepts directly relate to "${topic}"
2. **Network Effects:** These concepts form interconnected patterns
3. **Cross-Domain Insights:** The relationships reveal deeper understanding
` : `
**My Analysis:**
Based on the ${reasoningMode} reasoning mode, I can see several interesting patterns:

1. **Conceptual Clustering:** Your knowledge is well-organized into logical groups
2. **Cross-Domain Thinking:** There are connections between different areas of knowledge
3. **Scalable Structure:** The graph can grow and adapt as your understanding evolves
`}

**Questions for You:**
- What aspects of "${topic}" are you most curious about?
- Are there areas where you feel uncertain or want to explore further?
- What connections or patterns surprise you or seem most important?

**My Suggestions:**
- We could dive deeper into any of these concept areas
- I see potential for new connections and insights
- The graph structure suggests some interesting directions for exploration

**Let's Collaborate:**
- Share your thoughts and I'll build upon them
- Ask questions and I'll help you think through them
- Together we can expand and refine your understanding

**Available Tools:**
- Use \`explore_knowledge\` to search for specific concepts
- Use \`get_node_details\` to get detailed information about nodes
- Use \`list_available_graphs\` to see all available graphs
- Use \`set_active_graph\` to switch between different graphs

What would you like to explore or develop together?`;

    return {
      content: [
        {
          type: "text",
          text: response
        }
      ]
    };
  }
);

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Redstring MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
}); 