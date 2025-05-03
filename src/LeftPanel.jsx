import React from 'react';
import useGraphStore from './store/graphStore';
import { shallow } from 'zustand/shallow';
import InnerNetwork from './InnerNetwork';
import './Panel.css';

const LeftPanel = () => {
  // Get all graphs from store
  const { graphArray } = useGraphStore(state => {
      const graphs = Array.from(state.graphs.values());
      return {
          graphArray: graphs.map(graphData => {
              const graphNodes = graphData.nodeIds
                  .map(id => state.nodes.get(id))
                  .filter(Boolean);
              const graphEdges = graphData.edgeIds
                  .map(id => state.edges.get(id))
                  .filter(Boolean);

              return {
                  id: graphData.id,
                  name: graphData.name,
                  nodes: graphNodes,
                  edges: graphEdges,
              };
          })
      };
  }, shallow);

  return (
    <div className="panel-container inline left">
      <div className="panel-tab-bar">
        <div className="panel-tab" style={{ borderTopLeftRadius: '10px', borderTopRightRadius: '10px' }}>
          Library
        </div>
      </div>
      <div className="panel-content">
        {graphArray.map((graph) => (
          <div key={graph.id} style={{ marginBottom: '16px' }}>
            <strong style={{ display: 'block', marginBottom: '8px' }}>{graph.name || 'Untitled'}</strong>
            <svg width={200} height={100} style={{ background: '#f0f0f0' }}>
              <InnerNetwork
                nodes={graph.nodes}
                edges={graph.edges}
                width={200}
                height={100}
                padding={10}
              />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeftPanel; 