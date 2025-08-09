# AI Integration Testing Guide for Redstring

This guide shows you how to test the AI integration with Redstring, including how to simulate an AI client and validate that everything is working correctly.

## Overview

The AI integration consists of several components:
1. **Redstring** - The main application (localhost:4000)
2. **Bridge Server** - HTTP bridge between Redstring and MCP (localhost:3001)
3. **MCP Server** - Model Context Protocol server for AI clients
4. **AI Client** - Claude Desktop, Tome, or other MCP-compatible clients

## Quick Start Testing

### A. Zero-LLM flow checks (HTTP only)

Use these to validate queues, committer and UI path without an AI model.

1) Open help:

GET http://localhost:3001/orchestration/help

2) Enqueue and commit an instance directly (fast path):

POST http://localhost:3001/test/commit-ops
{
  "graphId": "<active-graph-id>",
  "ops": [
    { "type": "addNodeInstance", "graphId": "<active-graph-id>", "prototypeId": "<existing-prototype-id>", "position": { "x": 420, "y": 220 }, "instanceId": "inst-smoketest-1" }
  ]
}

Expect: applyMutations executed in the app; a friendly chat line confirming the node was added.

3) Inspect queues/telemetry:

GET http://localhost:3001/queue/metrics?name=reviewQueue

GET http://localhost:3001/telemetry?limit=50

### B. Chat/Agent end-to-end (with friendly text + tool calls)

Goal: verify the user-facing chatbot returns text first, then queues the tool path that lands in UI via pending actions.

1) Send agent request:

POST http://localhost:3001/api/ai/agent
Headers: Authorization: Bearer <your-ai-key> (not strictly required for local testing)
Body:
{
  "message": "Add Solar Energy",
  "context": { "activeGraphId": "<active-graph-id>" }
}

Expect:
- response: conversational text
- toolCalls: array including addNodePrototype (skipped or queued) and applyMutations(addNodeInstance)
- cid: correlation id for this flow

2) Trace the flow with cid:

GET http://localhost:3001/telemetry?cid=<cid>

Expect: tool_call entries for addNodePrototype, setActiveGraph (if needed), applyMutations, and an agent_queued summary.

3) Confirm UI execution:

In the app chat: see friendly messages like “Created concept …”, “Switched to graph …”, “Added … to … at (x, y)”.

### C. Pending action path (ordered execution)

Actions are executed in this order to avoid race conditions:
1) createNewGraph
2) addNodePrototype
3) openGraph
4) setActiveGraph
5) applyMutations

This ensures prototypes exist and the correct graph is active before instances are added.

### 1. Start the AI Connection Wizard

```bash
node ./ai-connection-wizard.js
```

This will:
- Check if Redstring is running
- Start the bridge server
- Start the MCP server
- Detect AI clients
- Provide connection instructions
- Monitor the connection status

### 2. Test with AI Client Simulator

```bash
node ./test-ai-client.js
```

This simulates what an AI client would do:
- Connects to the MCP server
- Lists available tools
- Calls various Redstring operations
- Demonstrates node creation and removal

## Manual Testing Steps

### Step 1: Verify Services are Running

Check that all services are accessible:

```bash
# Check Redstring
curl http://localhost:4000

# Check Bridge Server
curl http://localhost:3001/health

# Check Bridge State
curl http://localhost:3001/api/bridge/state
```

### Step 2: Test MCP Server Directly

Start the MCP server manually:

```bash
node redstring-mcp-server.js
```

You should see: `Redstring MCP Server running on stdio`

### Step 3: Test Individual Tools

Use the bridge server endpoints to test individual operations:

```bash
# List available graphs
curl -X POST http://localhost:3001/api/bridge/actions/list-graphs

# Get active graph
curl -X POST http://localhost:3001/api/bridge/actions/get-active-graph

# Add a node prototype
curl -X POST http://localhost:3001/api/bridge/actions/add-node-prototype \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Node",
    "description": "A test node created via API",
    "color": "#4A90E2"
  }'
```

## Available MCP Tools

The MCP server provides these tools for AI clients:

### Core Tools
- `verify_state` - Check if Redstring store is available
- `get_graph_instances` - Get all graph instances
- `list_available_graphs` - List available graphs
- `get_active_graph` - Get the currently active graph
- `open_graph` - Open a specific graph
- `set_active_graph` - Set the active graph

### Node Operations (RECOMMENDED)
- `addNodeToGraph` - Add a node to a graph
- `removeNodeFromGraph` - Remove a node from a graph

### Legacy Tools
- `add_node_prototype` - Add a node prototype (legacy)
- `add_node_instance` - Add a node instance (legacy)

## Testing with Real AI Clients

### Claude Desktop

1. Open Claude Desktop
2. Go to Settings > Local MCP Servers
3. Add new server:
   - **Command**: `node`
   - **Args**: `/path/to/redstringuireact/redstring-mcp-server.js`
4. Restart Claude Desktop
5. Test with: "Show me the available graphs in Redstring"

### Tome

1. Open Tome
2. Go to Settings > MCP Servers
3. Add new server:
   - **Command**: `node /path/to/redstringuireact/redstring-mcp-server.js`
4. Test the connection
5. Try: "List the graphs in my Redstring workspace"

## Troubleshooting

### Common Issues

1. **Bridge server timeout**
   - Check if port 3001 is available
   - Restart the bridge server: `node server.js`

2. **MCP server not starting**
   - Ensure Redstring is running first
   - Check for port conflicts
   - Verify the MCP server path

3. **No tools available**
   - Check bridge server status
   - Verify Redstring store is accessible
   - Restart the MCP server

4. **JSON parsing errors**
   - The wizard now uses "OK/FAIL" instead of emojis
   - Check for any remaining emoji output

### Debug Commands

```bash
# Bridge daemon logs
curl 'http://localhost:3001/telemetry?limit=100' | jq '.items[] | {ts, type, name, cid, args, message}'

# Check all processes
ps aux | grep node

# Check port usage
lsof -i :3001
lsof -i :4000

# Kill all related processes
pkill -f "node server.js"
pkill -f "redstring-mcp-server.js"

# Check logs
tail -f /tmp/redstring.log  # if logging is enabled
```

## Advanced Testing

### Test Node Operations

```bash
# Create a test graph first in Redstring UI
# Then test adding nodes via MCP

node -e "
const { spawn } = require('child_process');
const mcp = spawn('node', ['redstring-mcp-server.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

setTimeout(() => {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'addNodeToGraph',
      arguments: {
        graphId: 'your-graph-id',
        nodeData: {
          name: 'Test Node',
          description: 'Created via MCP',
          position: { x: 100, y: 100 },
          type: 'note'
        }
      }
    }
  };
  
  mcp.stdin.write(JSON.stringify(request) + '\n');
}, 2000);
"
```

### Test Data Flow

1. Create a graph in Redstring UI
2. Add some nodes manually
3. Use MCP tools to read the data
4. Add nodes via MCP
5. Verify they appear in the UI
6. Remove nodes via MCP
7. Verify they're removed from the UI

## Validation Checklist

- [ ] Redstring is running on localhost:4000
- [ ] Bridge server is running on localhost:3001
- [ ] MCP server starts without errors
- [ ] AI client simulator can connect
- [ ] All tools are listed and available
- [ ] Can read graph data via MCP
- [ ] Can add nodes via MCP
- [ ] Can remove nodes via MCP
- [ ] Changes appear in Redstring UI
- [ ] Real AI client (Claude/Tome) can connect
- [ ] Real AI client can use the tools

## Performance Testing

Test with larger datasets:

```bash
# Create many graphs and nodes in Redstring
# Then test MCP performance

time node ./test-ai-client.js
```

## Security Considerations

- MCP server runs locally only
- No authentication required for local connections
- Bridge server exposes HTTP endpoints locally
- Consider firewall rules for production use

## Next Steps

Once testing is complete:

1. Configure your preferred AI client
2. Set up any automation workflows
3. Create custom tools if needed
4. Monitor performance and stability
5. Document any custom configurations

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the logs for error messages
3. Test with the AI client simulator first
4. Verify all services are running
5. Check for port conflicts or permission issues 