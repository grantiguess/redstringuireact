import React, { useState, useMemo, useCallback } from 'react';
import useGraphStore from './store/graphStore';
import './GraphBrowserPanel.css';

// Helper function to build the hierarchy
const buildHierarchy = (nodesMap) => {
  const hierarchy = {};
  const roots = [];

  // Create a map for quick lookup and initialize children arrays
  const items = {};
  Object.values(nodesMap).forEach(node => {
    items[node.id] = { ...node, children: [] };
  });

  // Populate children arrays and identify roots
  Object.values(items).forEach(item => {
    if (item.parentDefinitionNodeId && items[item.parentDefinitionNodeId]) {
      items[item.parentDefinitionNodeId].children.push(item);
    } else {
      roots.push(item);
    }
  });

  // Sort roots and children alphabetically by name (optional)
  const sortByName = (a, b) => a.name.localeCompare(b.name);
  roots.sort(sortByName);
  Object.values(items).forEach(item => item.children.sort(sortByName));

  return roots;
};

// Recursive component to render a node and its children
const NodeItem = ({ node, onNodeClick, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded

  const hasChildren = node.children && node.children.length > 0;

  const handleToggleExpand = (e) => {
    e.stopPropagation(); // Prevent node click when toggling
    setIsExpanded(!isExpanded);
  };

  const handleNodeClick = (e) => {
    e.stopPropagation();
    // Only trigger click for actual definition nodes, not containers?
    // Or maybe always trigger? Let's assume always trigger for now.
    if (node.graphId) {
        onNodeClick(node.graphId, node.id);
    } else {
        console.warn('Node clicked has no graphId:', node);
    }
  };

  return (
    <div className="node-item-container">
      <div
        className="node-item"
        style={{ paddingLeft: `${depth * 15 + (hasChildren ? 5 : 20)}px` }} // Indentation + space for icon
        onClick={handleNodeClick}
        role="button"
        tabIndex={0}
        onKeyPress={(e) => e.key === 'Enter' && handleNodeClick(e)} // Basic accessibility
      >
        {hasChildren && (
          <span className={`toggle-icon ${isExpanded ? 'expanded' : 'collapsed'}`} onClick={handleToggleExpand}>
            {isExpanded ? '▼' : '▶'} {/* Simple expand/collapse icons */}
          </span>
        )}
        <span className="node-name">{node.name || 'Unnamed Node'}</span>
      </div>
      {hasChildren && isExpanded && (
        <div className="node-children">
          {node.children.map(child => (
            <NodeItem key={child.id} node={child} onNodeClick={onNodeClick} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const GraphBrowserPanel = () => {
  // Select state slices individually
  const nodes = useGraphStore(state => state.nodes);
  const openGraphTab = useGraphStore(state => state.openGraphTab);

  // Memoize hierarchy based on the nodes Map
  // Zustand's default shallow compare should handle the Map reference
  const nodeHierarchy = useMemo(() => {
    console.log("[GraphBrowserPanel] Recalculating node hierarchy..."); // Add log
    // Ensure nodes is treated as a plain object for Object.values if needed by buildHierarchy
    // Or update buildHierarchy to directly accept a Map
    const nodesObject = nodes ? Object.fromEntries(nodes) : {}; // Convert Map to object if necessary
    // return buildHierarchy(nodes || {}); // Original line if buildHierarchy handles Maps
    return buildHierarchy(nodesObject); // Pass the plain object
  }, [nodes]);

  const handleNodeClick = (graphId, nodeId) => {
    console.log(`Opening graph ${graphId} from node ${nodeId}`);
    openGraphTab(graphId, nodeId);
  };

  if (!nodes || Object.keys(nodes).length === 0) {
    return <div className="graph-browser-panel empty">No nodes loaded.</div>;
  }

  return (
    <div className="graph-browser-panel">
      <div className="panel-header">Graph Browser</div>
      <div className="panel-content">
        {nodeHierarchy.map(rootNode => (
          <NodeItem key={rootNode.id} node={rootNode} onNodeClick={handleNodeClick} />
        ))}
      </div>
    </div>
  );
};

export default GraphBrowserPanel; 