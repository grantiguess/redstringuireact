import { useEffect, useRef } from 'react';
import useGraphStore from './store/graphStore';

/**
 * MCP Bridge Component
 * 
 * This component establishes a bridge between the Redstring store and the MCP server.
 * It sends minimal essential store state to the server via HTTP.
 */
const MCPBridge = () => {
  const intervalRef = useRef(null);

  useEffect(() => {
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

    // Send initial state
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

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // This component doesn't render anything visible
  return null;
};

export default MCPBridge; 