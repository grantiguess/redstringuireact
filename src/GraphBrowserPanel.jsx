import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
const NodeItem = ({ node, onNodeClick, depth = 0, expandedNodes, onToggleExpand }) => {
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = node.children && node.children.length > 0;

  const handleToggleExpand = (e) => {
    e.stopPropagation(); // Prevent node click when toggling
    onToggleExpand(node.id);
  };

  const handleNodeClick = (e) => {
    e.stopPropagation();
    // For prototypes, use the first definition graph if available
    if (node.definitionGraphIds && node.definitionGraphIds.length > 0) {
        onNodeClick(node.definitionGraphIds[0], node.id);
    } else {
        console.warn('Node clicked has no definition graphs:', node);
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
            <NodeItem key={child.id} node={child} onNodeClick={onNodeClick} depth={depth + 1} expandedNodes={expandedNodes} onToggleExpand={onToggleExpand} />
          ))}
        </div>
      )}
    </div>
  );
};

const GraphBrowserPanel = () => {
  // Select node prototypes instead of instances
  const nodePrototypes = useGraphStore(state => state.nodePrototypes);
  const openGraphTab = useGraphStore(state => state.openGraphTab);

  // Persistent expansion state management
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Memoize hierarchy based on the nodePrototypes Map
  const nodeHierarchy = useMemo(() => {
    console.log("[GraphBrowserPanel] Recalculating node hierarchy..."); // Add log
    // Convert Map to object for buildHierarchy
    const prototypesObject = nodePrototypes ? Object.fromEntries(nodePrototypes) : {};
    return buildHierarchy(prototypesObject);
  }, [nodePrototypes]);

  // Auto-expand new node prototypes and ensure all nodes are expanded by default
  useEffect(() => {
    if (nodePrototypes && nodePrototypes.size > 0) {
      setExpandedNodes(prev => {
        const newExpanded = new Set(prev);
        let hasNewNodes = false;
        
        // Add all node prototype IDs to expanded set (default expanded behavior)
        nodePrototypes.forEach((node, nodeId) => {
          if (!newExpanded.has(nodeId)) {
            newExpanded.add(nodeId);
            hasNewNodes = true;
          }
        });
        
        // Only update state if we actually added new nodes
        return hasNewNodes ? newExpanded : prev;
      });
    }
  }, [nodePrototypes]);

  // Handle toggling expansion state
  const handleToggleExpand = useCallback((nodeId) => {
    setExpandedNodes(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(nodeId)) {
        newExpanded.delete(nodeId);
      } else {
        newExpanded.add(nodeId);
      }
      return newExpanded;
    });
  }, []);

  const handleNodeClick = (graphId, nodeId) => {
    console.log(`Opening graph ${graphId} from node ${nodeId}`);
    openGraphTab(graphId, nodeId);
  };

  if (!nodePrototypes || Object.keys(nodePrototypes).length === 0) {
    return <div className="graph-browser-panel empty">No nodes loaded.</div>;
  }

  return (
    <div className="graph-browser-panel">
      <div className="panel-header">Graph Browser</div>
      <div className="panel-content">
        {nodeHierarchy.map(rootNode => (
          <NodeItem key={rootNode.id} node={rootNode} onNodeClick={handleNodeClick} expandedNodes={expandedNodes} onToggleExpand={handleToggleExpand} />
        ))}
      </div>
    </div>
  );
};

export default GraphBrowserPanel; 