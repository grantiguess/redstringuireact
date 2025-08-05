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
app.post('/api/bridge/actions/add-node-prototype', (req, res) => {
  try {
    const { name, description, color, typeNodeId } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }
    
    // Generate a unique ID for the prototype
    const prototypeId = `prototype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newPrototype = {
      id: prototypeId,
      name,
      description,
      color: color || '#4A90E2',
      typeNodeId: typeNodeId || null
    };
    
    // Add to bridge store data
    if (bridgeStoreData && bridgeStoreData.nodePrototypes) {
      bridgeStoreData.nodePrototypes.push(newPrototype);
      console.log('✅ Bridge: Added node prototype:', name);
    }
    
    res.json({ success: true, prototype: newPrototype });
  } catch (error) {
    console.error('Bridge action error:', error);
    res.status(500).json({ error: 'Failed to add node prototype' });
  }
});

app.post('/api/bridge/actions/add-node-instance', (req, res) => {
  try {
    const { graphId, prototypeName, position } = req.body;
    
    if (!graphId || !prototypeName || !position) {
      return res.status(400).json({ error: 'Graph ID, prototype name, and position are required' });
    }
    
    // Find the prototype
    const prototype = bridgeStoreData?.nodePrototypes?.find(p => p.name === prototypeName);
    if (!prototype) {
      return res.status(404).json({ error: `Prototype '${prototypeName}' not found` });
    }
    
    // Generate instance ID
    const instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newInstance = {
      id: instanceId,
      prototypeId: prototype.id,
      x: position.x,
      y: position.y,
      scale: 1
    };
    
    // Add to the specified graph
    if (bridgeStoreData && bridgeStoreData.graphs) {
      const graph = bridgeStoreData.graphs.find(g => g.id === graphId);
      if (graph) {
        if (!graph.instances) graph.instances = [];
        graph.instances.push(newInstance);
        graph.instanceCount = (graph.instanceCount || 0) + 1;
        console.log('✅ Bridge: Added node instance:', prototypeName, 'to graph:', graph.name);
      }
    }
    
    res.json({ success: true, instance: newInstance });
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

app.listen(PORT, () => {
  console.log(`OAuth server running on port ${PORT}`);
  console.log(`GitHub OAuth callback URL: http://localhost:${PORT}/oauth/callback`);
}); 