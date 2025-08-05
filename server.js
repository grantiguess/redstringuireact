import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// GitHub OAuth token exchange endpoint
app.post('/api/github/oauth/token', async (req, res) => {
  console.log('[OAuth Server] Token exchange request received');
  
  try {
    const { code, state, redirect_uri } = req.body;
    
    console.log('[OAuth Server] Request params:', { 
      hasCode: !!code, 
      hasState: !!state, 
      redirect_uri 
    });
    
    if (!code || !state) {
      console.error('[OAuth Server] Missing required parameters');
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    console.log('[OAuth Server] Environment check:', { 
      hasClientId: !!clientId, 
      hasClientSecret: !!clientSecret 
    });
    
    if (!clientId || !clientSecret) {
      console.error('[OAuth Server] GitHub OAuth not configured');
      return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }
    
    console.log('[OAuth Server] Exchanging code with GitHub...');
    
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
    
    console.log('[OAuth Server] GitHub response status:', tokenResponse.status);
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('[OAuth Server] GitHub OAuth error:', tokenData.error, tokenData.error_description);
      return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    }
    
    console.log('[OAuth Server] Token exchange successful');
    
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Store for the bridge data
let bridgeStoreData = null;

// Function to call actual Redstring store actions
async function callRedstringStoreAction(action, params) {
  try {
    // This will be called by the Redstring app to register the store
    if (global.redstringStoreActions) {
      return await global.redstringStoreActions[action](...params);
    }
    
    // Fallback: try to call via HTTP to the Redstring app
    const response = await fetch('http://localhost:4000/api/store/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, params })
    });
    
    if (response.ok) {
      return await response.json();
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Failed to call Redstring store action ${action}:`, error);
    throw error;
  }
}

// Endpoint for Redstring app to register store actions
app.post('/api/bridge/register-store', (req, res) => {
  try {
    const { actions } = req.body;
    
    if (!actions) {
      return res.status(400).json({ error: 'Actions object is required' });
    }
    
    // Store the actions globally so they can be called by the bridge
    global.redstringStoreActions = actions;
    
    console.log('✅ Bridge: Redstring store actions registered:', Object.keys(actions));
    res.json({ success: true, registeredActions: Object.keys(actions) });
  } catch (error) {
    console.error('Bridge registration error:', error);
    res.status(500).json({ error: 'Failed to register store actions' });
  }
});

// MCP Bridge endpoint - POST to update store data
app.post('/api/bridge/state', (req, res) => {
  try {
    const newData = req.body;
    
    // If we have existing data, merge the new data with our changes
    if (bridgeStoreData && bridgeStoreData.nodePrototypes) {
      // Preserve any prototypes we've added via actions
      const existingPrototypes = bridgeStoreData.nodePrototypes || [];
      const newPrototypes = newData.nodePrototypes || [];
      
      // Merge prototypes, keeping our additions
      const mergedPrototypes = [...existingPrototypes];
      newPrototypes.forEach(newProto => {
        if (!mergedPrototypes.find(existing => existing.id === newProto.id)) {
          mergedPrototypes.push(newProto);
        }
      });
      
      // Update the data with merged prototypes
      bridgeStoreData = {
        ...newData,
        nodePrototypes: mergedPrototypes
      };
    } else {
      // First time, just set the data
      bridgeStoreData = newData;
    }
    
    console.log('✅ Bridge: Store data updated');
    res.json({ success: true });
  } catch (error) {
    console.error('Bridge POST error:', error);
    res.status(500).json({ error: 'Failed to update store state' });
  }
});

// MCP Bridge endpoint - GET to retrieve store data
app.get('/api/bridge/state', (req, res) => {
  try {
    if (bridgeStoreData) {
      res.json(bridgeStoreData);
    } else {
      res.status(503).json({ error: 'Redstring store not available' });
    }
  } catch (error) {
    console.error('Bridge GET error:', error);
    res.status(500).json({ error: 'Failed to get store state' });
  }
});

// MCP Bridge action endpoints
app.post('/api/bridge/actions/add-node-prototype', async (req, res) => {
  try {
    const { name, description, color, typeNodeId } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }
    
    // Generate a unique ID for the prototype
    const prototypeId = `prototype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Call the actual Redstring store action
    try {
      await callRedstringStoreAction('addNodePrototype', [prototypeId, {
        name,
        description,
        color: color || '#4A90E2',
        typeNodeId: typeNodeId || null
      }]);
      
      console.log('✅ Bridge: Added node prototype to real store:', name);
      
      // Also update bridge data for consistency
      if (bridgeStoreData && bridgeStoreData.nodePrototypes) {
        bridgeStoreData.nodePrototypes.push({
          id: prototypeId,
          name,
          description,
          color: color || '#4A90E2',
          typeNodeId: typeNodeId || null
        });
      }
      
      res.json({ success: true, prototype: { id: prototypeId, name, description, color: color || '#4A90E2', typeNodeId: typeNodeId || null } });
    } catch (storeError) {
      console.error('Failed to call real store action:', storeError);
      
      // Fallback to bridge-only storage
      const newPrototype = {
        id: prototypeId,
        name,
        description,
        color: color || '#4A90E2',
        typeNodeId: typeNodeId || null
      };
      
      if (bridgeStoreData && bridgeStoreData.nodePrototypes) {
        bridgeStoreData.nodePrototypes.push(newPrototype);
        console.log('✅ Bridge: Added node prototype (bridge only):', name);
      }
      
      res.json({ success: true, prototype: newPrototype, warning: 'Bridge-only storage - not saved to file' });
    }
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to add node prototype' });
  }
});

app.post('/api/bridge/actions/add-node-instance', async (req, res) => {
  try {
    const { graphId, prototypeName, position } = req.body;
    
    if (!graphId || !prototypeName || !position) {
      return res.status(400).json({ error: 'Graph ID, prototype name, and position are required' });
    }
    
    // Find the prototype by name or ID
    let prototype = bridgeStoreData?.nodePrototypes?.find(p => p.name === prototypeName);
    if (!prototype) {
      // Try ID match
      prototype = bridgeStoreData?.nodePrototypes?.find(p => p.id === prototypeName);
    }
    if (!prototype) {
      // Try case-insensitive name match
      prototype = bridgeStoreData?.nodePrototypes?.find(p => 
        p.name.toLowerCase() === prototypeName.toLowerCase()
      );
    }
    if (!prototype) {
      return res.status(404).json({ 
        error: `Prototype '${prototypeName}' not found`,
        availablePrototypes: bridgeStoreData?.nodePrototypes?.map(p => ({ name: p.name, id: p.id })) || []
      });
    }
    
    // Generate instance ID
    const instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Call the actual Redstring store action
    try {
      await callRedstringStoreAction('addNodeInstance', [graphId, prototype.id, position, instanceId]);
      
      console.log('✅ Bridge: Added node instance to real store:', prototypeName, 'to graph:', graphId);
      
      // Also update bridge data for consistency
      if (bridgeStoreData && bridgeStoreData.graphs) {
        const graph = bridgeStoreData.graphs.find(g => g.id === graphId);
        if (graph) {
          if (!graph.instances) graph.instances = [];
          graph.instances.push({
            id: instanceId,
            prototypeId: prototype.id,
            x: position.x,
            y: position.y,
            scale: 1
          });
          graph.instanceCount = (graph.instanceCount || 0) + 1;
        }
      }
      
      res.json({ success: true, instance: { id: instanceId, prototypeId: prototype.id, x: position.x, y: position.y, scale: 1 } });
    } catch (storeError) {
      console.error('Failed to call real store action:', storeError);
      
      // Fallback to bridge-only storage
      const newInstance = {
        id: instanceId,
        prototypeId: prototype.id,
        x: position.x,
        y: position.y,
        scale: 1
      };
      
      if (bridgeStoreData && bridgeStoreData.graphs) {
        const graph = bridgeStoreData.graphs.find(g => g.id === graphId);
        if (graph) {
          if (!graph.instances) graph.instances = [];
          graph.instances.push(newInstance);
          graph.instanceCount = (graph.instanceCount || 0) + 1;
          console.log('✅ Bridge: Added node instance (bridge only):', prototypeName, 'to graph:', graph.name);
        }
      }
      
      res.json({ success: true, instance: newInstance, warning: 'Bridge-only storage - not saved to file' });
    }
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to add node instance' });
  }
});

app.post('/api/bridge/actions/set-active-graph', (req, res) => {
  try {
    const { graphId } = req.body;
    
    if (!graphId) {
      return res.status(400).json({ error: 'Graph ID is required' });
    }
    
    // Update active graph in bridge store data
    if (bridgeStoreData) {
      bridgeStoreData.activeGraphId = graphId;
      console.log('✅ Bridge: Set active graph to:', graphId);
    }
    
    res.json({ success: true, activeGraphId: graphId });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to set active graph' });
  }
});

// Open graph tab and bring to top
app.post('/api/bridge/actions/open-graph-tab', (req, res) => {
  try {
    const { graphId, bringToFront = true } = req.body;
    
    if (!graphId) {
      return res.status(400).json({ error: 'Graph ID is required' });
    }
    
    // Update bridge store data to open the graph
    if (bridgeStoreData) {
      // Set as active graph
      bridgeStoreData.activeGraphId = graphId;
      
      // Add to open graphs if not already there
      if (!bridgeStoreData.openGraphIds) {
        bridgeStoreData.openGraphIds = [];
      }
      
      const existingIndex = bridgeStoreData.openGraphIds.indexOf(graphId);
      if (existingIndex > -1) {
        // Graph is already open, move it to the front if bringToFront is true
        if (bringToFront) {
          bridgeStoreData.openGraphIds.splice(existingIndex, 1);
          bridgeStoreData.openGraphIds.unshift(graphId);
        }
      } else {
        // Graph is not open, add it to the front
        bridgeStoreData.openGraphIds.unshift(graphId);
      }
      
      console.log('✅ Bridge: Opened graph tab:', graphId, 'bringToFront:', bringToFront);
    }
    
    res.json({ success: true, graphId, bringToFront });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to open graph tab' });
  }
});

// Update node prototype
app.post('/api/bridge/actions/update-node-prototype', (req, res) => {
  try {
    const { prototypeId, updates } = req.body;
    
    if (!prototypeId || !updates) {
      return res.status(400).json({ error: 'Prototype ID and updates are required' });
    }
    
    // Update prototype in bridge store data
    if (bridgeStoreData && bridgeStoreData.nodePrototypes) {
      const prototype = bridgeStoreData.nodePrototypes.find(p => p.id === prototypeId);
      if (prototype) {
        Object.assign(prototype, updates);
        console.log('✅ Bridge: Updated node prototype:', prototypeId, updates);
      } else {
        return res.status(404).json({ error: `Prototype '${prototypeId}' not found` });
      }
    }
    
    res.json({ success: true, prototypeId, updates });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to update node prototype' });
  }
});

// Create graph definition for a prototype
app.post('/api/bridge/actions/create-graph-definition', (req, res) => {
  try {
    const { prototypeId, activate = false } = req.body;
    
    if (!prototypeId) {
      return res.status(400).json({ error: 'Prototype ID is required' });
    }
    
    // Find the prototype
    if (bridgeStoreData && bridgeStoreData.nodePrototypes) {
      const prototype = bridgeStoreData.nodePrototypes.find(p => p.id === prototypeId);
      if (!prototype) {
        return res.status(404).json({ error: `Prototype '${prototypeId}' not found` });
      }
      
      // Generate new graph ID
      const newGraphId = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create new graph
      const newGraph = {
        id: newGraphId,
        name: prototype.name || 'Untitled Definition',
        description: '',
        picture: null,
        color: prototype.color || '#4A90E2',
        directed: true,
        instances: [],
        instanceCount: 0,
        edgeIds: [],
        definingNodeIds: [prototypeId]
      };
      
      // Add graph to bridge store data
      if (!bridgeStoreData.graphs) {
        bridgeStoreData.graphs = [];
      }
      bridgeStoreData.graphs.push(newGraph);
      
      // Add definition graph ID to prototype
      if (!prototype.definitionGraphIds) {
        prototype.definitionGraphIds = [];
      }
      prototype.definitionGraphIds.push(newGraphId);
      
      // Optionally activate the new graph
      if (activate) {
        bridgeStoreData.activeGraphId = newGraphId;
        if (!bridgeStoreData.openGraphIds) {
          bridgeStoreData.openGraphIds = [];
        }
        bridgeStoreData.openGraphIds.unshift(newGraphId);
      }
      
      console.log('✅ Bridge: Created graph definition:', newGraphId, 'for prototype:', prototype.name);
      res.json({ success: true, graphId: newGraphId, prototypeId, activate });
    } else {
      res.status(500).json({ error: 'Bridge store data not available' });
    }
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to create graph definition' });
  }
});

// AI-Guided Workflow endpoint
app.post('/api/bridge/actions/ai-guided-workflow', (req, res) => {
  try {
    const { workflowType, prototypeName, prototypeDescription, prototypeColor, targetGraphId, instancePositions, connections, enableUserGuidance = true } = req.body;
    
    if (!workflowType) {
      return res.status(400).json({ error: 'Workflow type is required' });
    }
    
    let results = [];
    let currentGraphId = null;
    
    // Simulate the workflow steps
    switch (workflowType) {
      case 'create_prototype_and_definition':
        // Create prototype
        const prototypeId = `prototype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newPrototype = {
          id: prototypeId,
          name: prototypeName,
          description: prototypeDescription || '',
          color: prototypeColor || '#4A90E2',
          definitionGraphIds: []
        };
        
        if (!bridgeStoreData.nodePrototypes) {
          bridgeStoreData.nodePrototypes = [];
        }
        bridgeStoreData.nodePrototypes.push(newPrototype);
        results.push(`✅ Created prototype: ${prototypeName}`);
        
        // Create definition graph
        const definitionGraphId = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const definitionGraph = {
          id: definitionGraphId,
          name: prototypeName,
          description: '',
          color: prototypeColor || '#4A90E2',
          directed: true,
          instances: [],
          instanceCount: 0,
          edgeIds: [],
          definingNodeIds: [prototypeId]
        };
        
        if (!bridgeStoreData.graphs) {
          bridgeStoreData.graphs = [];
        }
        bridgeStoreData.graphs.push(definitionGraph);
        newPrototype.definitionGraphIds.push(definitionGraphId);
        results.push(`✅ Created definition graph: ${definitionGraphId}`);
        
        // Open definition
        bridgeStoreData.activeGraphId = definitionGraphId;
        if (!bridgeStoreData.openGraphIds) {
          bridgeStoreData.openGraphIds = [];
        }
        bridgeStoreData.openGraphIds.unshift(definitionGraphId);
        currentGraphId = definitionGraphId;
        results.push(`✅ Opened definition graph as active: ${definitionGraphId}`);
        break;
        
      case 'add_instance_to_graph':
        if (targetGraphId) {
          bridgeStoreData.activeGraphId = targetGraphId;
          currentGraphId = targetGraphId;
          results.push(`✅ Set target graph as active: ${targetGraphId}`);
        } else if (bridgeStoreData.activeGraphId) {
          currentGraphId = bridgeStoreData.activeGraphId;
          results.push(`✅ Using current active graph: ${bridgeStoreData.activeGraphId}`);
        } else {
          return res.status(400).json({ error: 'No active graph and no target graph specified' });
        }
        
        if (instancePositions?.length) {
          for (const instance of instancePositions) {
            const instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newInstance = {
              id: instanceId,
              prototypeId: instance.prototypeName, // Simplified for demo
              x: instance.x,
              y: instance.y,
              scale: 1
            };
            
            const graph = bridgeStoreData.graphs.find(g => g.id === currentGraphId);
            if (graph) {
              if (!graph.instances) graph.instances = [];
              graph.instances.push(newInstance);
              graph.instanceCount = (graph.instanceCount || 0) + 1;
              results.push(`✅ Added instance: ${instance.prototypeName} at (${instance.x}, ${instance.y})`);
            }
          }
        }
        break;
        
      case 'full_workflow':
        // Combine all steps
        const fullPrototypeId = `prototype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const fullPrototype = {
          id: fullPrototypeId,
          name: prototypeName,
          description: prototypeDescription || '',
          color: prototypeColor || '#4A90E2',
          definitionGraphIds: []
        };
        
        if (!bridgeStoreData.nodePrototypes) {
          bridgeStoreData.nodePrototypes = [];
        }
        bridgeStoreData.nodePrototypes.push(fullPrototype);
        results.push(`✅ Created prototype: ${prototypeName}`);
        
        // Create definition
        const fullDefinitionId = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const fullDefinition = {
          id: fullDefinitionId,
          name: prototypeName,
          description: '',
          color: prototypeColor || '#4A90E2',
          directed: true,
          instances: [],
          instanceCount: 0,
          edgeIds: [],
          definingNodeIds: [fullPrototypeId]
        };
        
        if (!bridgeStoreData.graphs) {
          bridgeStoreData.graphs = [];
        }
        bridgeStoreData.graphs.push(fullDefinition);
        fullPrototype.definitionGraphIds.push(fullDefinitionId);
        results.push(`✅ Created definition graph: ${fullDefinitionId}`);
        
        // Open definition
        bridgeStoreData.activeGraphId = fullDefinitionId;
        if (!bridgeStoreData.openGraphIds) {
          bridgeStoreData.openGraphIds = [];
        }
        bridgeStoreData.openGraphIds.unshift(fullDefinitionId);
        currentGraphId = fullDefinitionId;
        results.push(`✅ Opened definition graph as active: ${fullDefinitionId}`);
        
        // Add instances
        if (instancePositions?.length) {
          for (const instance of instancePositions) {
            const instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newInstance = {
              id: instanceId,
              prototypeId: instance.prototypeName,
              x: instance.x,
              y: instance.y,
              scale: 1
            };
            
            fullDefinition.instances.push(newInstance);
            fullDefinition.instanceCount = (fullDefinition.instanceCount || 0) + 1;
            results.push(`✅ Added instance: ${instance.prototypeName} at (${instance.x}, ${instance.y})`);
          }
        }
        
        // Plan connections
        if (connections?.length) {
          for (const connection of connections) {
            results.push(`📝 Connection planned: ${connection.sourceName} → ${connection.targetName} (${connection.edgeType || 'default'})`);
          }
        }
        break;
        
      default:
        return res.status(400).json({ error: `Unknown workflow type: ${workflowType}` });
    }
    
    const response = {
      success: true,
      workflowType,
      results,
      currentGraphId: currentGraphId || bridgeStoreData.activeGraphId,
      openGraphsCount: bridgeStoreData.openGraphIds?.length || 0
    };
    
    console.log('✅ Bridge: AI-guided workflow completed:', workflowType);
    res.json(response);
    
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to execute AI-guided workflow' });
  }
});

// Delete node instance
app.post('/api/bridge/actions/delete-node-instance', (req, res) => {
  try {
    const { graphId, instanceId } = req.body;
    
    if (!graphId || !instanceId) {
      return res.status(400).json({ error: 'Graph ID and instance ID are required' });
    }
    
    // Remove instance from graph in bridge store data
    if (bridgeStoreData && bridgeStoreData.graphs) {
      const graph = bridgeStoreData.graphs.find(g => g.id === graphId);
      if (graph && graph.instances) {
        const instanceIndex = graph.instances.findIndex(i => i.id === instanceId);
        if (instanceIndex !== -1) {
          graph.instances.splice(instanceIndex, 1);
          graph.instanceCount = Math.max(0, (graph.instanceCount || 0) - 1);
          console.log('✅ Bridge: Deleted node instance:', instanceId, 'from graph:', graph.name);
        } else {
          return res.status(404).json({ error: `Instance '${instanceId}' not found in graph` });
        }
      } else {
        return res.status(404).json({ error: `Graph '${graphId}' not found` });
      }
    }
    
    res.json({ success: true, instanceId, graphId });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to delete node instance' });
  }
});

// Create edge
app.post('/api/bridge/actions/create-edge', (req, res) => {
  try {
    const { graphId, sourceId, targetId, edgeType, weight = 1 } = req.body;
    
    if (!graphId || !sourceId || !targetId) {
      return res.status(400).json({ error: 'Graph ID, source ID, and target ID are required' });
    }
    
    // Generate edge ID
    const edgeId = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newEdge = {
      id: edgeId,
      sourceId,
      destinationId: targetId,
      type: edgeType || 'default',
      weight,
      graphId
    };
    
    // Add edge to graph in bridge store data
    if (bridgeStoreData && bridgeStoreData.graphs) {
      const graph = bridgeStoreData.graphs.find(g => g.id === graphId);
      if (graph) {
        if (!graph.edgeIds) graph.edgeIds = [];
        graph.edgeIds.push(edgeId);
        console.log('✅ Bridge: Created edge:', edgeId, 'from', sourceId, 'to', targetId);
      } else {
        return res.status(404).json({ error: `Graph '${graphId}' not found` });
      }
    }
    
    res.json({ success: true, edge: newEdge });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to create edge' });
  }
});

// Create edge definition
app.post('/api/bridge/actions/create-edge-definition', (req, res) => {
  try {
    const { name, description, color, typeNodeId } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }
    
    // Generate a unique ID for the edge definition
    const edgeDefinitionId = `edge-definition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newEdgeDefinition = {
      id: edgeDefinitionId,
      name,
      description,
      color: color || '#666666',
      typeNodeId: typeNodeId || null
    };
    
    // Add to bridge store data
    if (bridgeStoreData && bridgeStoreData.edgeDefinitions) {
      bridgeStoreData.edgeDefinitions.push(newEdgeDefinition);
    } else if (bridgeStoreData) {
      bridgeStoreData.edgeDefinitions = [newEdgeDefinition];
    }
    
    console.log('✅ Bridge: Added edge definition:', name);
    
    res.json({ success: true, edgeDefinition: newEdgeDefinition });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to create edge definition' });
  }
});

// Move node instance
app.post('/api/bridge/actions/move-node-instance', (req, res) => {
  try {
    const { graphId, instanceId, position } = req.body;
    
    if (!graphId || !instanceId || !position) {
      return res.status(400).json({ error: 'Graph ID, instance ID, and position are required' });
    }
    
    // Update instance position in bridge store data
    if (bridgeStoreData && bridgeStoreData.graphs) {
      const graph = bridgeStoreData.graphs.find(g => g.id === graphId);
      if (graph && graph.instances) {
        const instance = graph.instances.find(i => i.id === instanceId);
        if (instance) {
          instance.x = position.x;
          instance.y = position.y;
          console.log('✅ Bridge: Moved node instance:', instanceId, 'to', position);
        } else {
          return res.status(404).json({ error: `Instance '${instanceId}' not found in graph` });
        }
      } else {
        return res.status(404).json({ error: `Graph '${graphId}' not found` });
      }
    }
    
    res.json({ success: true, instanceId, position });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to move node instance' });
  }
});

// Search nodes
app.post('/api/bridge/actions/search-nodes', (req, res) => {
  try {
    const { query, graphId } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const results = [];
    
    // Search in bridge store data
    if (bridgeStoreData && bridgeStoreData.nodePrototypes) {
      bridgeStoreData.nodePrototypes.forEach(prototype => {
        const matchesName = prototype.name && prototype.name.toLowerCase().includes(query.toLowerCase());
        const matchesDescription = prototype.description && prototype.description.toLowerCase().includes(query.toLowerCase());
        
        if (matchesName || matchesDescription) {
          results.push({
            id: prototype.id,
            name: prototype.name,
            description: prototype.description,
            type: 'prototype'
          });
        }
      });
    }
    
    // If graphId specified, also search instances in that graph
    if (graphId && bridgeStoreData && bridgeStoreData.graphs) {
      const graph = bridgeStoreData.graphs.find(g => g.id === graphId);
      if (graph && graph.instances) {
        graph.instances.forEach(instance => {
          // Find the prototype for this instance
          const prototype = bridgeStoreData.nodePrototypes?.find(p => p.id === instance.prototypeId);
          if (prototype) {
            const matchesName = prototype.name && prototype.name.toLowerCase().includes(query.toLowerCase());
            const matchesDescription = prototype.description && prototype.description.toLowerCase().includes(query.toLowerCase());
            
            if (matchesName || matchesDescription) {
              results.push({
                id: instance.id,
                name: prototype.name,
                description: prototype.description,
                position: { x: instance.x, y: instance.y },
                type: 'instance',
                prototypeId: instance.prototypeId
              });
            }
          }
        });
      }
    }
    
    console.log('✅ Bridge: Search results for query:', query, 'found', results.length, 'matches');
    
    res.json({ success: true, query, results });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to search nodes' });
  }
});

app.listen(PORT, () => {
  console.log(`OAuth server running on port ${PORT}`);
  console.log(`GitHub OAuth callback URL: http://localhost:${PORT}/oauth/callback`);
}); 