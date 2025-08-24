import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Plus, CircleDot, RefreshCw } from 'lucide-react';
import useGraphStore from '../store/graphStore';
import { knowledgeFederation } from '../services/knowledgeFederation';
import { fastEnrichFromSemanticWeb } from '../services/semanticWebQuery.js';
import './ConnectionBrowser.css';

/**
 * RDF Triplet Visual Component
 * Displays subject -> predicate -> object relationships as connected nodes
 */
const RDFTriplet = ({ subject, predicate, object, subjectColor, objectColor, onMaterialize }) => {
  const defaultColor = '#8B0000'; // Default maroon for semantic connections
  
  return (
    <div className="rdf-triplet" onClick={() => onMaterialize && onMaterialize({ subject, predicate, object })}>
      <div className="triplet-flow">
        {/* Subject Node */}
        <div 
          className="triplet-node subject-node"
          style={{ backgroundColor: subjectColor || defaultColor }}
        >
          <span className="node-label">{subject}</span>
        </div>
        
        {/* Connection Arrow with Predicate */}
        <div className="triplet-connection">
          <div className="connection-line" />
          <ArrowRight className="connection-arrow" size={14} />
          <span className="predicate-label">{predicate}</span>
        </div>
        
        {/* Object Node */}
        <div 
          className="triplet-node object-node"
          style={{ backgroundColor: objectColor || defaultColor }}
        >
          <span className="node-label">{object}</span>
        </div>
        
        {/* Add to Graph Button */}
        <div className="add-button" title="Add to current graph">
          <Plus size={12} />
        </div>
      </div>
    </div>
  );
};

/**
 * Connection Browser Component
 * Shows semantic web connections with In Graph ↔ All Connections slider
 */
const ConnectionBrowser = ({ nodeData, onMaterializeConnection }) => {
  const [connectionScope, setConnectionScope] = useState('all'); // 'graph' | 'all'
  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { activeGraphId, nodePrototypes, graphs } = useGraphStore();
  
  // Load connections from federated knowledge system
  useEffect(() => {
    if (!nodeData?.name || nodeData.name.trim() === '') {
      console.log('[ConnectionBrowser] No valid node name, skipping connection load');
      return;
    }
    
    const loadConnections = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`[ConnectionBrowser] Loading federated connections for: "${nodeData.name}"`);
        
        // Use fast enrichment for immediate results
        const enrichmentResults = await fastEnrichFromSemanticWeb(nodeData.name, {
          timeout: 15000 // Use fast 15 second timeout
        });
        
        // Convert enrichment results to connection format
        const federatedConnections = [];
        
        // Add main entity connections if found
        if (enrichmentResults.sources.wikidata?.found) {
          federatedConnections.push({
            id: 'fed-wikidata',
            subject: nodeData.name,
            predicate: 'found in',
            object: 'Wikidata',
            confidence: 0.9,
            source: 'wikidata',
            inCurrentGraph: false
          });
        }
        
        if (enrichmentResults.sources.dbpedia?.found) {
          federatedConnections.push({
            id: 'fed-dbpedia',
            subject: nodeData.name,
            predicate: 'found in',
            object: 'DBpedia',
            confidence: 0.9,
            source: 'dbpedia',
            inCurrentGraph: false
          });
        }
        
        if (enrichmentResults.sources.wikipedia?.found) {
          federatedConnections.push({
            id: 'fed-wikipedia',
            subject: nodeData.name,
            predicate: 'found in',
            object: 'Wikipedia',
            confidence: 0.8,
            source: 'wikipedia',
            inCurrentGraph: false
          });
        }
        
        // Add external links as connections
        if (enrichmentResults.suggestions?.externalLinks) {
          enrichmentResults.suggestions.externalLinks.forEach((link, index) => {
            federatedConnections.push({
              id: `fed-link-${index}`,
              subject: nodeData.name,
              predicate: 'external link',
              object: link.split('/').pop() || link,
              confidence: 0.7,
              source: 'semantic_web',
              inCurrentGraph: false
            });
          });
        }
        
        setConnections(federatedConnections);
        console.log(`[ConnectionBrowser] Loaded ${federatedConnections.length} federated connections`);
        
      } catch (err) {
        console.error('[ConnectionBrowser] Failed to load connections:', err);
        setError(err.message);
        
        // Fallback to mock data on error
        const mockConnections = [
          {
            id: '1',
            subject: nodeData?.name || 'Node',
            predicate: 'instance of',
            object: 'company',
            confidence: 0.9,
            source: 'wikidata',
            inCurrentGraph: false
          },
          {
            id: '2', 
            subject: nodeData?.name || 'Node',
            predicate: 'headquartered in',
            object: 'California',
            confidence: 0.85,
            source: 'dbpedia',
            inCurrentGraph: false
          }
        ];
        setConnections(mockConnections);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadConnections();
  }, [nodeData?.name]);
  
  // Check if nodes exist in current graph
  const checkIfInCurrentGraph = (sourceName, targetName) => {
    if (!graphs || !activeGraphId) return false;
    
    const currentGraph = graphs.get(activeGraphId);
    if (!currentGraph?.instances) return false;
    
    let hasSource = false;
    let hasTarget = false;
    
    for (const instance of currentGraph.instances.values()) {
      const prototype = nodePrototypes?.get(instance.prototypeId);
      if (prototype) {
        if (prototype.name.toLowerCase() === sourceName.toLowerCase()) {
          hasSource = true;
        }
        if (prototype.name.toLowerCase() === targetName.toLowerCase()) {
          hasTarget = true;
        }
      }
    }
    
    return hasSource && hasTarget;
  };
  
  // Filter connections based on scope
  const filteredConnections = useMemo(() => {
    if (connectionScope === 'graph') {
      return connections.filter(conn => conn.inCurrentGraph);
    }
    return connections;
  }, [connections, connectionScope]);
  
  // Get appropriate color for nodes based on existing prototypes
  const getNodeColor = (nodeName) => {
    // Check if a node with this name already exists in prototypes
    for (const [id, prototype] of nodePrototypes.entries()) {
      if (prototype.name.toLowerCase() === nodeName.toLowerCase()) {
        return prototype.color;
      }
    }
    return '#8B0000'; // Default maroon
  };
  
  const handleMaterializeConnection = (connection) => {
    if (onMaterializeConnection) {
      onMaterializeConnection({
        ...connection,
        subjectColor: getNodeColor(connection.subject),
        objectColor: getNodeColor(connection.object)
      });
    }
    console.log('[ConnectionBrowser] Materializing connection:', connection);
  };
  
  if (!nodeData) {
    return (
      <div className="connection-browser-empty">
        No node data available for connections
      </div>
    );
  }
  
  return (
    <div className="connection-browser">
      {/* Scope Slider */}
      <div className="connection-scope-control">
        <div className="scope-slider">
          <button
            className={`scope-button ${connectionScope === 'graph' ? 'active' : ''}`}
            onClick={() => setConnectionScope('graph')}
          >
            In Graph
          </button>
          <button
            className={`scope-button ${connectionScope === 'all' ? 'active' : ''}`}
            onClick={() => setConnectionScope('all')}
          >
            All Connections
          </button>
        </div>
        <div className="connection-count">
          {isLoading ? (
            <div className="loading-indicator">
              <RefreshCw size={12} className="spin" />
              <span>Loading...</span>
            </div>
          ) : (
            `${filteredConnections.length} connection${filteredConnections.length !== 1 ? 's' : ''}`
          )}
        </div>
      </div>
      
      {/* Connection List */}
      <div className="connection-list">
        {error ? (
          <div className="connection-error">
            <span>Error loading connections: {error}</span>
            <button 
              className="retry-button"
              onClick={() => {
                setConnections([]);
                setError(null);
                // Trigger reload by changing a dependency
                const event = new CustomEvent('retryConnections');
                window.dispatchEvent(event);
              }}
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="connection-loading">
            <RefreshCw size={20} className="spin" />
            <span>Loading connections from semantic web...</span>
          </div>
        ) : filteredConnections.length === 0 ? (
          <div className="no-connections">
            <CircleDot size={20} color="#666" />
            <span>No {connectionScope === 'graph' ? 'graph' : 'available'} connections found</span>
          </div>
        ) : (
          filteredConnections.map((connection) => (
            <RDFTriplet
              key={connection.id}
              subject={connection.subject}
              predicate={connection.predicate}
              object={connection.object}
              subjectColor={getNodeColor(connection.subject)}
              objectColor={getNodeColor(connection.object)}
              onMaterialize={() => handleMaterializeConnection(connection)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ConnectionBrowser;