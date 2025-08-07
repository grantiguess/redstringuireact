import { useEffect, useRef } from 'react';
import useGraphStore from './store/graphStore';

/**
 * MCP Bridge Component
 * 
 * This component establishes a bridge between the Redstring store and the MCP server.
 * It sends minimal essential store state to the server via HTTP and registers store actions.
 */
const MCPBridge = () => {
  const intervalRef = useRef(null);
  const reconnectIntervalRef = useRef(null);
  const connectionStateRef = useRef({
    isConnected: false,
    lastSuccessfulConnection: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5
  });

  useEffect(() => {
    // Function to check bridge server health
    const checkBridgeHealth = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/bridge/health');
        return response.ok;
      } catch (error) {
        return false;
      }
    };

    // Function to handle connection recovery
    const handleConnectionRecovery = async () => {
      const connectionState = connectionStateRef.current;
      
      console.log(`🔄 MCP Bridge: Attempting reconnection (attempt ${connectionState.reconnectAttempts + 1}/${connectionState.maxReconnectAttempts})`);
      
      const isHealthy = await checkBridgeHealth();
      
      if (isHealthy) {
        console.log('✅ MCP Bridge: Server is healthy, re-establishing connection...');
        
        // Reset connection state
        connectionState.isConnected = true;
        connectionState.lastSuccessfulConnection = Date.now();
        connectionState.reconnectAttempts = 0;
        
        // Clear reconnection interval
        if (reconnectIntervalRef.current) {
          clearInterval(reconnectIntervalRef.current);
          reconnectIntervalRef.current = null;
        }
        
        // Re-register actions and restart polling
        try {
          await registerStoreActions();
          await sendStoreToServer();
          
          // Restart normal polling
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          intervalRef.current = setInterval(sendStoreToServer, 10000);
          
          console.log('🎉 MCP Bridge: Connection fully restored!');
        } catch (error) {
          console.error('❌ MCP Bridge: Failed to re-establish full connection:', error);
          connectionState.isConnected = false;
        }
      } else {
        connectionState.reconnectAttempts++;
        
        if (connectionState.reconnectAttempts >= connectionState.maxReconnectAttempts) {
          console.error('❌ MCP Bridge: Max reconnection attempts reached. Giving up.');
          if (reconnectIntervalRef.current) {
            clearInterval(reconnectIntervalRef.current);
            reconnectIntervalRef.current = null;
          }
        } else {
          const nextAttemptDelay = Math.min(1000 * Math.pow(2, connectionState.reconnectAttempts), 30000);
          console.log(`⏳ MCP Bridge: Next reconnection attempt in ${nextAttemptDelay/1000}s`);
        }
      }
    };

    // Function to start reconnection process
    const startReconnection = () => {
      const connectionState = connectionStateRef.current;
      
      if (connectionState.isConnected) {
        connectionState.isConnected = false;
        console.log('🔌 MCP Bridge: Connection lost, starting reconnection process...');
      }
      
      // Stop normal polling
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Start reconnection attempts if not already running
      if (!reconnectIntervalRef.current) {
        connectionState.reconnectAttempts = 0;
        handleConnectionRecovery(); // Immediate first attempt
        
        // Set up periodic reconnection attempts with exponential backoff
        reconnectIntervalRef.current = setInterval(() => {
          const currentDelay = Math.min(5000 * Math.pow(2, connectionState.reconnectAttempts), 30000);
          setTimeout(handleConnectionRecovery, currentDelay);
        }, 5000);
      }
    };

    // Function to register store actions with the bridge server
    const registerStoreActions = async () => {
      try {
        const state = useGraphStore.getState();
        
        // Create a wrapper for store actions that can be called remotely
        // Create action metadata (not functions, since they can't be serialized)
        const actionMetadata = {
          addNodePrototype: {
            description: 'Add a new node prototype',
            parameters: ['prototypeId', 'prototypeData']
          },
          addNodeInstance: {
            description: 'Add a node instance to a graph',
            parameters: ['graphId', 'prototypeId', 'position', 'instanceId']
          },
          removeNodeInstance: {
            description: 'Remove a node instance from a graph',
            parameters: ['graphId', 'instanceId']
          },
          updateNodePrototype: {
            description: 'Update a node prototype',
            parameters: ['prototypeId', 'updates']
          },
          setActiveGraph: {
            description: 'Set the active graph',
            parameters: ['graphId']
          },
          openGraph: {
            description: 'Open a graph',
            parameters: ['graphId']
          },
          createNewGraph: {
            description: 'Create a new empty graph and set it active',
            parameters: ['initialData']
          },
          createAndAssignGraphDefinition: {
            description: 'Create and activate a new definition graph for a prototype',
            parameters: ['prototypeId']
          },
          openRightPanelNodeTab: {
            description: 'Open a node tab in the right panel',
            parameters: ['nodeId']
          },
          addEdge: {
            description: 'Add an edge to a graph',
            parameters: ['graphId', 'edgeData']
          },
          updateEdgeDirectionality: {
            description: 'Update edge directionality arrowsToward list',
            parameters: ['edgeId', 'arrowsToward']
          },
          chat: {
            description: 'Send a message to the AI model',
            parameters: ['message', 'context']
          }
        };

        // Store the actual functions in a global variable that the bridge server can access
        if (typeof window !== 'undefined') {
          window.redstringStoreActions = {
            addNodePrototype: async (prototypeId, prototypeData) => {
              console.log('MCPBridge: Calling addNodePrototype', prototypeId, prototypeData);
              // Ensure the prototypeData has the correct id
              const dataWithId = { ...prototypeData, id: prototypeId };
              state.addNodePrototype(dataWithId);
              return { success: true, prototypeId };
            },
            addNodeInstance: async (graphId, prototypeId, position, instanceId) => {
              console.log('MCPBridge: Calling addNodeInstance', graphId, prototypeId, position, instanceId);
              state.addNodeInstance(graphId, prototypeId, position, instanceId);
              return { success: true, instanceId };
            },
            removeNodeInstance: async (graphId, instanceId) => {
              console.log('MCPBridge: Calling removeNodeInstance', graphId, instanceId);
              state.removeNodeInstance(graphId, instanceId);
              return { success: true, instanceId };
            },
            updateNodePrototype: async (prototypeId, updates) => {
              console.log('MCPBridge: Calling updateNodePrototype', prototypeId, updates);
              state.updateNodePrototype(prototypeId, (prototype) => {
                Object.assign(prototype, updates);
              });
              return { success: true, prototypeId };
            },
            setActiveGraph: async (graphId) => {
              console.log('MCPBridge: Calling setActiveGraph', graphId);
              state.setActiveGraph(graphId);
              return { success: true, graphId };
            },
            openGraph: async (graphId) => {
              console.log('MCPBridge: Calling openGraphTab', graphId);
              state.openGraphTab(graphId);
              return { success: true, graphId };
            },
              createNewGraph: async (initialData) => {
                console.log('MCPBridge: Calling createNewGraph', initialData);
                const beforeId = state.activeGraphId;
                state.createNewGraph(initialData || {});
                const afterId = useGraphStore.getState().activeGraphId;
                return { success: true, graphId: afterId || beforeId };
              },
              createAndAssignGraphDefinition: async (prototypeId) => {
                console.log('MCPBridge: Calling createAndAssignGraphDefinition', prototypeId);
                const graphId = state.createAndAssignGraphDefinition(prototypeId);
                return { success: true, graphId, prototypeId };
              },
              openRightPanelNodeTab: async (nodeId) => {
                console.log('MCPBridge: Calling openRightPanelNodeTab', nodeId);
                state.openRightPanelNodeTab(nodeId);
                return { success: true, nodeId };
              },
              addEdge: async (graphId, edgeData) => {
                console.log('MCPBridge: Calling addEdge', graphId, edgeData);
                state.addEdge(graphId, edgeData);
                return { success: true, edgeId: edgeData.id };
              },
              updateEdgeDirectionality: async (edgeId, arrowsToward) => {
                console.log('MCPBridge: Calling updateEdgeDirectionality', edgeId, arrowsToward);
                state.updateEdge(edgeId, (edge) => {
                  edge.directionality = {
                    arrowsToward: new Set(Array.isArray(arrowsToward) ? arrowsToward : [])
                  };
                });
                return { success: true, edgeId };
              },
            chat: async (message, context) => {
              console.log('MCPBridge: Forwarding chat message to AI model', { message, context });
              // The actual chat handling happens in the MCP server
              return { success: true, message, context };
            }
          };
        }
        
        console.log('MCPBridge: Created action metadata with keys:', Object.keys(actionMetadata));

        // Register action metadata with bridge server
        console.log('MCPBridge: About to register action metadata:', Object.keys(actionMetadata));
        
        const response = await fetch('http://localhost:3001/api/bridge/register-store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            actions: actionMetadata,
            hasWindowActions: typeof window !== 'undefined' && !!window.redstringStoreActions
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('✅ MCP Bridge: Store actions registered with bridge server:', result);
        } else {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
      } catch (error) {
        console.error('❌ MCP Bridge: Failed to register store actions:', error);
        connectionStateRef.current.isConnected = false;
        startReconnection();
      }
    };

    // Function to send store state to server
    const sendStoreToServer = async () => {
      try {
        const state = useGraphStore.getState();
        
        // Send only minimal essential data to keep payload small
        const bridgeData = {
          // Graph data with instance positions for spatial reasoning
          graphs: Array.from(state.graphs.entries()).map(([id, graph]) => ({
            id,
            name: graph.name,
            description: graph.description || '',
            instanceCount: graph.instances?.size || 0,
            // Include instance data for spatial reasoning (only for active graph to keep payload small)
            instances: id === state.activeGraphId && graph.instances ? 
              Object.fromEntries(Array.from(graph.instances.entries()).map(([instanceId, instance]) => [
                instanceId, {
                  id: instance.id,
                  prototypeId: instance.prototypeId,
                  x: instance.x || 0,
                  y: instance.y || 0,
                  scale: instance.scale || 1
                }
              ])) : undefined
          })),
          
          // Only essential prototype info
          nodePrototypes: Array.from(state.nodePrototypes.entries()).slice(0, 50).map(([id, prototype]) => ({
            id,
            name: prototype.name
          })),
          
          // UI state
          activeGraphId: state.activeGraphId,
          openGraphIds: state.openGraphIds,
          
          // Summary stats
          summary: {
            totalGraphs: state.graphs.size,
            totalPrototypes: state.nodePrototypes.size,
            lastUpdate: Date.now()
          }
        };

        // Send to server
        const response = await fetch('http://localhost:3001/api/bridge/state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bridgeData)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error('❌ MCP Bridge: Failed to send store to server:', error);
        const isConnectionError = error.message.includes('fetch') || 
                                 error.message.includes('ECONNREFUSED') ||
                                 error.message.includes('Failed to fetch');
        if (isConnectionError && connectionStateRef.current.isConnected) {
          connectionStateRef.current.isConnected = false;
          startReconnection();
        }
      }
    };

    // Register store actions and send initial state
    const initializeConnection = async () => {
      try {
        await registerStoreActions();
        await sendStoreToServer();
        
        // Mark as connected on successful initialization
        connectionStateRef.current.isConnected = true;
        connectionStateRef.current.lastSuccessfulConnection = Date.now();
        
        console.log('✅ MCP Bridge: Redstring store bridge established');
        console.log('✅ MCP Bridge: Store state:', {
          graphs: useGraphStore.getState().graphs.size,
          nodePrototypes: useGraphStore.getState().nodePrototypes.size,
          activeGraphId: useGraphStore.getState().activeGraphId,
          openGraphIds: useGraphStore.getState().openGraphIds.length
        });
      } catch (error) {
        console.error('❌ MCP Bridge: Failed to initialize connection:', error);
        connectionStateRef.current.isConnected = false;
        startReconnection();
      }
    };
    
    initializeConnection();

    // Set up a polling mechanism to keep the bridge updated
    intervalRef.current = setInterval(sendStoreToServer, 10000); // Update every 10 seconds

    // Set up a listener for save triggers and pending actions from the bridge server
    const checkForBridgeUpdates = async () => {
      try {
        // Check for save triggers
        const saveResponse = await fetch('http://localhost:3001/api/bridge/check-save-trigger');
        if (saveResponse.ok) {
          const saveData = await saveResponse.json();
          if (saveData.shouldSave) {
            console.log('✅ MCP Bridge: Save trigger received, notifying changes');
            const { notifyChanges } = await import('./store/fileStorage.js');
            notifyChanges();
          }
        }
        
        // Check for bridge state changes and sync them back to Redstring
        // DISABLED: This was causing conflicts with Redstring state restoration
        // TODO: Re-implement this as a one-way sync only when AI tools make explicit changes
        // 
        // const bridgeResponse = await fetch('http://localhost:3001/api/bridge/state');
        // if (bridgeResponse.ok) {
        //   const bridgeData = await bridgeResponse.json();
        //   // ... sync logic disabled for now
        // }

        // Check for pending actions
        const actionsResponse = await fetch('http://localhost:3001/api/bridge/pending-actions');
        if (actionsResponse.ok) {
          const actionsData = await actionsResponse.json();
          if (actionsData.pendingActions && actionsData.pendingActions.length > 0) {
            console.log('✅ MCP Bridge: Found pending actions:', actionsData.pendingActions.length);
            
            // Execute each pending action
            for (const pendingAction of actionsData.pendingActions) {
              try {
                if (window.redstringStoreActions && window.redstringStoreActions[pendingAction.action]) {
                  console.log('✅ MCP Bridge: Executing action:', pendingAction.action, pendingAction.params);
                  
                  // For addNodeInstance, ensure the graph and prototype exist in the store first
                  if (pendingAction.action === 'addNodeInstance') {
                    const [graphId, prototypeId, position, instanceId] = pendingAction.params;
                    console.log('🔍 MCP Bridge: Checking if graph and prototype exist before adding instance...');
                    
                    // Get current store state
                    const currentState = useGraphStore.getState();
                    const graphExists = currentState.graphs.has(graphId);
                    const prototypeExists = currentState.nodePrototypes.has(prototypeId);
                    
                    console.log('🔍 MCP Bridge: Graph exists:', graphExists, 'Prototype exists:', prototypeExists);
                    
                    if (!graphExists || !prototypeExists) {
                      console.warn('⚠️ MCP Bridge: Graph or prototype not found in store, attempting to sync from bridge...');
                      
                      // Try to sync missing data from bridge server
                      try {
                        const bridgeResponse = await fetch('http://localhost:3001/api/bridge/state');
                        if (bridgeResponse.ok) {
                          const bridgeData = await bridgeResponse.json();
                          
                          // Add missing prototype if it exists in bridge
                          if (!prototypeExists && bridgeData.nodePrototypes) {
                            const bridgePrototype = bridgeData.nodePrototypes.find(p => p.id === prototypeId);
                            if (bridgePrototype) {
                              console.log('🔄 MCP Bridge: Adding missing prototype from bridge:', bridgePrototype.name);
                              currentState.addNodePrototype(prototypeId, {
                                name: bridgePrototype.name,
                                description: bridgePrototype.description,
                                color: bridgePrototype.color,
                                typeNodeId: bridgePrototype.typeNodeId
                              });
                            }
                          }
                          
                          // Add missing graph if it exists in bridge
                          if (!graphExists && bridgeData.graphs) {
                            const bridgeGraph = bridgeData.graphs.find(g => g.id === graphId);
                            if (bridgeGraph) {
                              console.log('🔄 MCP Bridge: Adding missing graph from bridge:', bridgeGraph.name);
                              currentState.addGraph(graphId, {
                                name: bridgeGraph.name,
                                description: bridgeGraph.description,
                                color: bridgeGraph.color
                              });
                            }
                          }
                        }
                      } catch (syncError) {
                        console.error('❌ MCP Bridge: Failed to sync from bridge:', syncError);
                      }
                      
                      // Check again after sync attempt
                      const updatedState = useGraphStore.getState();
                      const graphExistsAfterSync = updatedState.graphs.has(graphId);
                      const prototypeExistsAfterSync = updatedState.nodePrototypes.has(prototypeId);
                      
                      if (!graphExistsAfterSync || !prototypeExistsAfterSync) {
                        console.warn('⚠️ MCP Bridge: Graph or prototype still not found after sync, skipping instance creation');
                        // Send warning feedback
                        await fetch('http://localhost:3001/api/bridge/action-feedback', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: pendingAction.action,
                            status: 'warning',
                            error: `Graph or prototype not found in store after sync. Graph: ${graphExistsAfterSync}, Prototype: ${prototypeExistsAfterSync}`,
                            params: pendingAction.params
                          })
                        });
                        continue; // Skip this action
                      } else {
                        console.log('✅ MCP Bridge: Successfully synced missing data, proceeding with instance creation');
                      }
                    }
                  }
                  
                  // Execute the action and get result
                  let result;
                  if (pendingAction.action === 'chat') {
                    const { message, context } = pendingAction.params;
                    result = await window.redstringStoreActions[pendingAction.action](message, context);
                    console.log('✅ MCP Bridge: Chat message forwarded:', result);
                  } else {
                    // For other actions that use array parameters
                    result = await window.redstringStoreActions[pendingAction.action](...(Array.isArray(pendingAction.params) ? pendingAction.params : [pendingAction.params]));
                  }
                  console.log('✅ MCP Bridge: Action completed successfully:', pendingAction.action, result);

                  // Acknowledge completion to bridge server if id exists
                  try {
                    if (pendingAction.id) {
                      await fetch('http://localhost:3001/api/bridge/action-completed', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ actionId: pendingAction.id, result })
                      });
                    }
                  } catch (ackErr) {
                    console.warn('⚠️ MCP Bridge: Failed to ack action completion:', ackErr);
                  }
                } else {
                  console.error('❌ MCP Bridge: Action not found:', pendingAction.action);
                  // Send error feedback to bridge server
                  await fetch('http://localhost:3001/api/bridge/action-feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: pendingAction.action,
                      status: 'error',
                      error: 'Action not found in window.redstringStoreActions'
                    })
                  });
                }
              } catch (error) {
                console.error('❌ MCP Bridge: Failed to execute action:', pendingAction.action, error);
                // Send error feedback to bridge server
                try {
                  await fetch('http://localhost:3001/api/bridge/action-feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: pendingAction.action,
                      status: 'error',
                      error: error.message,
                      params: pendingAction.params
                    })
                  });
                } catch (feedbackError) {
                  console.error('❌ MCP Bridge: Failed to send error feedback:', feedbackError);
                }
              }
            }
          }
        }
      } catch (error) {
        // Ignore errors - this is just a polling mechanism
      }
    };
    
    // Check for bridge updates every 2 seconds
    const bridgeUpdateInterval = setInterval(checkForBridgeUpdates, 2000);
    
    // Store the interval for cleanup
    intervalRef.current = { dataInterval: intervalRef.current, bridgeInterval: bridgeUpdateInterval };

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        if (intervalRef.current.dataInterval) {
          clearInterval(intervalRef.current.dataInterval);
        }
        if (intervalRef.current.bridgeInterval) {
          clearInterval(intervalRef.current.bridgeInterval);
        }
        intervalRef.current = null;
      }
      
      // Clean up reconnection interval
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
      }
    };
  }, []);

  // This component doesn't render anything visible
  return null;
};

export default MCPBridge; 