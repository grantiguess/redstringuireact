import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Plus, CircleDot, RefreshCw } from 'lucide-react';
import useGraphStore from '../store/graphStore';
import { knowledgeFederation } from '../services/knowledgeFederation';
import { fastEnrichFromSemanticWeb } from '../services/semanticWebQuery.js';
import Dropdown from './Dropdown.jsx';
import './ConnectionBrowser.css';

/**
 * RDF Triplet Visual Component
 * Displays subject -> predicate -> object relationships as connected nodes
 * Styled to match NodeCanvas connections with proper arrows and directionality
 */
const RDFTriplet = ({ 
  subject, 
  predicate, 
  object, 
  subjectColor, 
  objectColor, 
  onMaterialize, 
  connection // Full connection object for access to directionality info
}) => {
  const defaultColor = '#8B0000'; // Default maroon for semantic connections
  const canvasColor = '#EFE8E5'; // Canvas background color for text fill
  
  // Determine if this connection has directionality
  const isDirected = connection?.type === 'native' && connection?.directionality !== 'undirected';
  const isUndirected = connection?.type === 'native' && connection?.directionality === 'undirected';
  
  return (
    <div className="rdf-triplet" onClick={() => onMaterialize && onMaterialize({ subject, predicate, object })}>
      <div className="triplet-flow">
        {/* Subject Node */}
        <div 
          className="triplet-node subject-node"
          style={{ backgroundColor: subjectColor || defaultColor }}
        >
          <span className="node-label">{typeof subject === 'string' ? subject : JSON.stringify(subject)}</span>
        </div>
        
        {/* Connection with SVG Arrow and Label */}
        <div className="triplet-connection">
          <svg 
            width="120" 
            height="40" 
            style={{ overflow: 'visible' }}
            className="connection-svg"
          >
            {/* Connection Line */}
            <line
              x1="10"
              y1="20"
              x2="110"
              y2="20"
              stroke={subjectColor || defaultColor}
              strokeWidth="4"
              strokeLinecap="round"
            />
            
            {/* Arrow or circle for directionality */}
            {isUndirected ? (
              // Circle for undirected connections
              <circle
                cx="110"
                cy="20"
                r="6"
                fill={subjectColor || defaultColor}
              />
            ) : (
              // Arrow for directed connections (or semantic web)
              <g transform="translate(110, 20) rotate(90)">
                <polygon
                  points="-8,10 8,10 0,-10"
                  fill={subjectColor || defaultColor}
                  stroke={subjectColor || defaultColor}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  paintOrder="stroke fill"
                />
              </g>
            )}
            
            {/* Connection Label - styled like NodeCanvas */}
            <text
              x="60"
              y="20"
              fill={canvasColor}
              fontSize="14"
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
              stroke={subjectColor || defaultColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              paintOrder="stroke fill"
              style={{ 
                pointerEvents: 'none', 
                fontFamily: "'EmOne', sans-serif",
                userSelect: 'none'
              }}
            >
              {typeof predicate === 'string' ? predicate : JSON.stringify(predicate)}
            </text>
          </svg>
        </div>
        
        {/* Object Node */}
        <div 
          className="triplet-node object-node"
          style={{ backgroundColor: objectColor || defaultColor }}
        >
          <span className="node-label">{typeof object === 'string' ? object : JSON.stringify(object)}</span>
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
 * Shows connections with dropdown: In Graph | Universe | Semantic Web
 */
const ConnectionBrowser = ({ nodeData, onMaterializeConnection }) => {
  const [connectionScope, setConnectionScope] = useState('semantic'); // 'graph' | 'universe' | 'semantic'
  const [semanticConnections, setSemanticConnections] = useState([]);
  const [nativeConnections, setNativeConnections] = useState([]);
  const [isLoadingSemanticWeb, setIsLoadingSemanticWeb] = useState(false);
  const [error, setError] = useState(null);
  
  const { activeGraphId, nodePrototypes, graphs, edges } = useGraphStore();
  
  // Load semantic web connections from federated knowledge system
  useEffect(() => {
    if (!nodeData?.name || nodeData.name.trim() === '') {
      console.log('[ConnectionBrowser] No valid node name, skipping semantic web connection load');
      return;
    }
    
    const loadSemanticConnections = async () => {
      setIsLoadingSemanticWeb(true);
      setError(null);
      
      try {
        console.log(`[ConnectionBrowser] Loading semantic web connections for: "${nodeData.name}"`);
        
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
            type: 'semantic'
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
            type: 'semantic'
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
            type: 'semantic'
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
              type: 'semantic'
            });
          });
        }
        
        setSemanticConnections(federatedConnections);
        console.log(`[ConnectionBrowser] Loaded ${federatedConnections.length} semantic web connections`);
        
      } catch (err) {
        console.error('[ConnectionBrowser] Failed to load semantic web connections:', err);
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
            type: 'semantic'
          },
          {
            id: '2', 
            subject: nodeData?.name || 'Node',
            predicate: 'headquartered in',
            object: 'California',
            confidence: 0.85,
            source: 'dbpedia',
            type: 'semantic'
          }
        ];
        setSemanticConnections(mockConnections);
      } finally {
        setIsLoadingSemanticWeb(false);
      }
    };
    
    loadSemanticConnections();
  }, [nodeData?.name]);

  // Load native Redstring connections for this node
  useEffect(() => {
    if (!nodeData?.id) {
      console.log('[ConnectionBrowser] No node ID, skipping native connection load');
      return;
    }

    const loadNativeConnections = () => {
      const connections = [];
      
      // Find all instances of this node prototype across all graphs
      const nodeInstances = [];
      for (const [graphId, graph] of graphs.entries()) {
        if (graph.instances) {
          for (const [instanceId, instance] of graph.instances.entries()) {
            if (instance.prototypeId === nodeData.id) {
              nodeInstances.push({
                instanceId,
                graphId,
                instance
              });
            }
          }
        }
      }
      
      // For each instance, find all edges connected to it
      for (const nodeInstance of nodeInstances) {
        const { instanceId, graphId, instance } = nodeInstance;
        const graph = graphs.get(graphId);
        
        if (graph?.edgeIds) {
          for (const edgeId of graph.edgeIds) {
            const edge = edges.get(edgeId);
            if (!edge) continue;
            
            let isSource = false;
            let isDestination = false;
            let connectedInstanceId = null;
            
            // Check if this instance is involved in the edge
            if (edge.sourceId === instanceId) {
              isSource = true;
              connectedInstanceId = edge.destinationId;
            } else if (edge.destinationId === instanceId) {
              isDestination = true;
              connectedInstanceId = edge.sourceId;
            }
            
            if (connectedInstanceId) {
              // Get the connected instance and its prototype
              const connectedInstance = graph.instances?.get(connectedInstanceId);
              const connectedPrototype = connectedInstance ? nodePrototypes.get(connectedInstance.prototypeId) : null;
              
              if (connectedInstance && connectedPrototype) {
                // Get edge prototype for the connection label
                const edgePrototype = nodePrototypes.get(edge.typeNodeId) || { name: 'Connection' };
                
                const connection = {
                  id: `native-${edgeId}`,
                  subject: isSource ? nodeData.name : connectedPrototype.name,
                  predicate: edgePrototype.name,
                  object: isSource ? connectedPrototype.name : nodeData.name,
                  confidence: 1.0, // Native connections have 100% confidence
                  source: 'redstring',
                  type: 'native',
                  graphId,
                  graphName: graph.name,
                  edgeId,
                  sourceInstanceId: edge.sourceId,
                  destinationInstanceId: edge.destinationId,
                  inCurrentGraph: graphId === activeGraphId
                };
                
                connections.push(connection);
              }
            }
          }
        }
      }
      
      setNativeConnections(connections);
      console.log(`[ConnectionBrowser] Loaded ${connections.length} native connections for node ${nodeData.name}`);
    };
    
    loadNativeConnections();
  }, [nodeData?.id, graphs, edges, nodePrototypes, activeGraphId]);
  
  // Filter connections based on scope
  const filteredConnections = useMemo(() => {
    switch (connectionScope) {
      case 'graph':
        // Show only native connections that are in the current active graph
        return nativeConnections.filter(conn => conn.inCurrentGraph);
      case 'universe':
        // Show all native connections across all graphs
        return nativeConnections;
      case 'semantic':
        // Show semantic web connections
        return semanticConnections;
      default:
        return [];
    }
  }, [connectionScope, nativeConnections, semanticConnections]);
  
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
  
  // Determine loading state based on current scope
  const isLoading = connectionScope === 'semantic' ? isLoadingSemanticWeb : false;

  return (
    <div className="connection-browser">
      {/* Scope Dropdown */}
      <Dropdown
        options={[
          { value: 'graph', label: 'In Graph' },
          { value: 'universe', label: 'Universe' },
          { value: 'semantic', label: 'Semantic Web' }
        ]}
        value={connectionScope}
        onChange={setConnectionScope}
        rightContent={
          isLoading ? (
            <div className="loading-indicator">
              <RefreshCw size={12} className="spin" />
              <span>Loading...</span>
            </div>
          ) : (
            `${filteredConnections.length} connection${filteredConnections.length !== 1 ? 's' : ''}`
          )
        }
      />
      
      {/* Connection List */}
      <div className="connection-list">
        {error && connectionScope === 'semantic' ? (
          <div className="connection-error">
            <span>Error loading semantic web connections: {error}</span>
            <button 
              className="retry-button"
              onClick={() => {
                setSemanticConnections([]);
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
            <span>
              {connectionScope === 'semantic' 
                ? 'Loading connections from semantic web...' 
                : 'Loading connections...'
              }
            </span>
          </div>
        ) : filteredConnections.length === 0 ? (
          <div className="no-connections">
            <CircleDot size={20} color="#666" />
            <span>
              No {connectionScope === 'graph' ? 'graph' : 
                   connectionScope === 'universe' ? 'universe' : 
                   'semantic web'} connections found
            </span>
            {connectionScope !== 'semantic' && (
              <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '4px' }}>
                {connectionScope === 'graph' 
                  ? 'Connect nodes in this graph to see relationships here'
                  : 'Connect instances of this node across any graph'
                }
              </div>
            )}
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