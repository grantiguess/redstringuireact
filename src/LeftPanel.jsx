import React from 'react';
import useGraphStore from './store/graphStore';
import InnerNetwork from './InnerNetwork';
import './Panel.css';

const LeftPanel = () => {
  // Get all graphs from store
  const graphs = useGraphStore(state => state.graphs);
  const graphArray = Array.from(graphs.values());

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
                nodes={graph.getNodes().map(n => ({ id: n.id, x: n.x, y: n.y }))}
                edges={graph.getEdges().map(e => ({ id: e.getId(), sourceId: e.getSourceId(), destinationId: e.getDestinationId() }))}
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