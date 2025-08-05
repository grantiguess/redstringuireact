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

  useEffect(() => {
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
          setActiveGraph: {
            description: 'Set the active graph',
            parameters: ['graphId']
          },
          openGraph: {
            description: 'Open a graph',
            parameters: ['graphId']
          }
        };

        // Store the actual functions in a global variable that the bridge server can access
        if (typeof window !== 'undefined') {
          window.redstringStoreActions = {
            addNodePrototype: async (prototypeId, prototypeData) => {
              console.log('MCPBridge: Calling addNodePrototype', prototypeId, prototypeData);
              state.addNodePrototype(prototypeId, prototypeData);
              return { success: true, prototypeId };
            },
            addNodeInstance: async (graphId, prototypeId, position, instanceId) => {
              console.log('MCPBridge: Calling addNodeInstance', graphId, prototypeId, position, instanceId);
              state.addNodeInstance(graphId, prototypeId, position, instanceId);
              return { success: true, instanceId };
            },
            setActiveGraph: async (graphId) => {
              console.log('MCPBridge: Calling setActiveGraph', graphId);
              state.setActiveGraph(graphId);
              return { success: true, graphId };
            },
            openGraph: async (graphId) => {
              console.log('MCPBridge: Calling openGraph', graphId);
              state.openGraph(graphId);
              return { success: true, graphId };
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
      }
    };

    // Function to send store state to server
    const sendStoreToServer = async () => {
      try {
        const state = useGraphStore.getState();
        
        // Send only minimal essential data to keep payload small
        const bridgeData = {
          // Only graph IDs and names
          graphs: Array.from(state.graphs.entries()).map(([id, graph]) => ({
            id,
            name: graph.name,
            instanceCount: graph.instances?.size || 0
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
      }
    };

    // Register store actions and send initial state
    registerStoreActions();
    sendStoreToServer();
    
    console.log('✅ MCP Bridge: Redstring store bridge established');
    console.log('✅ MCP Bridge: Store state:', {
      graphs: useGraphStore.getState().graphs.size,
      nodePrototypes: useGraphStore.getState().nodePrototypes.size,
      activeGraphId: useGraphStore.getState().activeGraphId,
      openGraphIds: useGraphStore.getState().openGraphIds.length
    });

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
                  
                  const result = await window.redstringStoreActions[pendingAction.action](...pendingAction.params);
                  console.log('✅ MCP Bridge: Action completed successfully:', pendingAction.action, result);
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
    };
  }, []);

  // This component doesn't render anything visible
  return null;
};

export default MCPBridge; 