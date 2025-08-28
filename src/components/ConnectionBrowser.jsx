import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowRight, Plus, CircleDot, RefreshCw } from 'lucide-react';
import useGraphStore from '../store/graphStore';
import { knowledgeFederation } from '../services/knowledgeFederation';
import { fastEnrichFromSemanticWeb } from '../services/semanticWebQuery.js';
import Dropdown from './Dropdown.jsx';
import './ConnectionBrowser.css';

/**
 * Improved RDF Triplet Visual Component
 * Displays subject -> predicate -> object relationships as connected nodes
 * Styled to match NodeCanvas connections exactly with proper arrows and directionality
 * Supports ultra-slim panels with responsive design
 */
const RDFTriplet = ({
  subject,
  predicate,
  object,
  subjectColor,
  objectColor,
  onMaterialize,
  connection, // Full connection object for access to directionality info
  isUltraSlim = false,
  containerWidth = 400
}) => {
  const defaultColor = '#8B0000'; // Default maroon for semantic connections
  const canvasColor = '#bdb5b5'; // Canvas background color for text fill - matches NodeCanvas exactly
  
  // Determine connection directionality
  const isNondirectional = connection?.type === 'native' && connection?.directionality === 'nondirectional';
  const isBidirectional = connection?.type === 'native' && connection?.directionality === 'bidirectional';
  const isDirected = connection?.type === 'native' && !isNondirectional && !isBidirectional;
  const isSemantic = connection?.type === 'semantic';
  
  // Get connection color
  const connectionColor = connection?.connectionColor || subjectColor || defaultColor;
  
  // Responsive sizing based on panel width
  const getSizing = () => {
    // Dynamic sizing based on container width - continuously scale everything
    const baseHeight = isUltraSlim ? 24 : 40;
    const baseLineThickness = isUltraSlim ? 3 : 6;
    const baseTextSize = isUltraSlim ? 8 : 14;
    const baseNodeSize = isUltraSlim ? 9 : 13;

    // Scale factor based on container width
    const scaleFactor = Math.max(0.6, Math.min(1, containerWidth / 400));

    return {
      nodePadding: isUltraSlim ? '4px 6px' : '8px 12px',
      nodeFontSize: `${baseNodeSize * scaleFactor}px`,
      lineThickness: Math.max(2, baseLineThickness * scaleFactor),
      textFontSize: baseTextSize * scaleFactor,
      arrowSize: 12, // Keep arrows consistent
      arrowStrokeWidth: isUltraSlim ? 2 : 3,
      nodeMinWidth: isUltraSlim ? '50px' : '80px',
      nodeMaxWidth: isUltraSlim ? '80px' : '130px',
      connectionHeight: Math.max(20, baseHeight * scaleFactor)
    };
  };
  
  const sizing = getSizing();

  // Simple responsive text hiding based on actual container width
  const textLength = typeof predicate === 'string' ? predicate.length : 1;
  const scaleFactor = Math.max(0.5, Math.min(1, containerWidth / (textLength * 12)));
  const scaledFontSize = sizing.textFontSize * scaleFactor;

  // Calculate dynamic font size for continuous scaling
  const baseFontSize = sizing.textFontSize;
  const minFontSize = Math.max(6, baseFontSize * 0.3);
  const maxFontSize = baseFontSize;

  let dynamicScaleFactor;
  if (containerWidth < 150) {
    dynamicScaleFactor = Math.max(0.3, containerWidth / 200);
  } else if (containerWidth < 300) {
    dynamicScaleFactor = Math.max(0.4, containerWidth / 400);
  } else {
    dynamicScaleFactor = Math.min(1, containerWidth / 500);
  }

  const dynamicFontSize = Math.max(minFontSize, Math.min(maxFontSize, baseFontSize * dynamicScaleFactor));

  return (
    <div 
      className="rdf-triplet" 
      onClick={() => {
        // Only semantic web connections can be materialized
        if (connection?.type === 'semantic' && onMaterialize) {
          onMaterialize({ subject, predicate, object });
        }
      }}
      style={{
        cursor: connection?.type === 'semantic' ? 'pointer' : 'default'
      }}
    >
      <div className="triplet-flow">
        {/* Subject Node */}
        <div 
          className="triplet-node subject-node"
          style={{ 
            backgroundColor: subjectColor || defaultColor,
            minWidth: sizing.nodeMinWidth,
            maxWidth: sizing.nodeMaxWidth,
            padding: sizing.nodePadding
          }}
        >
          <span 
            className="node-label"
            style={{ fontSize: sizing.nodeFontSize }}
          >
            {typeof subject === 'string' ? subject : JSON.stringify(subject)}
          </span>
        </div>
        
        {/* Connection - RESPONSIVE FLEX APPROACH */}
        <div className="triplet-connection" style={{
          flex: 1,
          minWidth: `${Math.max(20, sizing.connectionHeight * 0.5)}px`,
          height: sizing.connectionHeight,
          display: 'flex',
          alignItems: 'center'
        }}>
          
          {/* Start Arrow Container (Fixed width, conditionally rendered) */}
          {isBidirectional && (
            <div className="arrow-container" style={{ width: `${Math.max(15, sizing.connectionHeight * 0.6)}px`, height: '100%'}}>
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(15, sizing.connectionHeight * 0.6)} ${sizing.connectionHeight}`} preserveAspectRatio="xMidYMid meet">
                  <g transform={`translate(${Math.max(15, sizing.connectionHeight * 0.6) / 2}, ${sizing.connectionHeight / 2}) rotate(270)`}>
                    <polygon
                      points={`-${sizing.arrowSize},${sizing.arrowSize * 1.25} ${sizing.arrowSize},${sizing.arrowSize * 1.25} 0,-${sizing.arrowSize * 1.25}`}
                      fill={connectionColor}
                    />
                  </g>
                </svg>
            </div>
          )}

                    {/* Fixed Line and Centered Text */}
          <div className="line-container" style={{ flex: 1, height: '100%', position: 'relative', minWidth: `${Math.max(10, sizing.connectionHeight * 0.3)}px` }}>
                                {/* Stretching Line */}
            <svg width="100%" height="100%" preserveAspectRatio="none">
                <line
                    x1="0"
                    y1="50%"
                    x2="100%"
                    y2="50%"
                    stroke={connectionColor}
                    strokeWidth={sizing.lineThickness}
                    strokeLinecap="round"
                />
            </svg>
            {/* Centered Text - positioned absolutely in middle */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              pointerEvents: 'none',
              overflow: 'hidden'
            }}>
              <svg width="100%" height={sizing.connectionHeight} style={{ overflow: 'hidden' }}>
                <text
                  x="50%"
                  y="50%"
                  dominantBaseline="middle"
                  textAnchor="middle"
                  fill={canvasColor}
                  fontSize={dynamicFontSize}
                  fontWeight="bold"
                  stroke={connectionColor}
                  strokeWidth={Math.max(3, dynamicFontSize * 0.25)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  paintOrder="stroke fill"
                  style={{
                    fontFamily: "'EmOne', sans-serif",
                    userSelect: 'none',
                    textOverflow: isUltraSlim ? 'clip' : 'ellipsis',
                    overflow: isUltraSlim ? 'hidden' : 'visible'
                  }}
                >
                  {(() => {
                    // Dynamic continuous scaling - hide text when it gets too small
                    // Hide text completely when font size is below readable threshold
                    if (dynamicFontSize < 8) return '';

                    // Truncate text if it's too long for the available space
                    let displayText = typeof predicate === 'string' ? predicate : JSON.stringify(predicate);

                    // Estimate how much space we need for this text at current font size
                    const estimatedTextWidth = displayText.length * (dynamicFontSize * 0.6);
                    const padding = 16; // Add 8px padding on each side
                    const availableSpace = Math.max(60, containerWidth - 80 - padding * 2); // Account for arrows, padding, and extra breathing room

                    // Truncate if needed, but always show something
                    if (estimatedTextWidth > availableSpace && displayText.length > 8) {
                      const maxChars = Math.max(6, Math.floor(availableSpace / (dynamicFontSize * 0.6)));
                      displayText = displayText.substring(0, maxChars - 3) + '...';
                    }

                    return displayText;
                  })()}
                </text>
              </svg>
            </div>
          </div>

          {/* End Arrow Container (Fixed width, conditionally rendered) */}
          {(isDirected || isBidirectional || isSemantic) && (
            <div className="arrow-container" style={{ width: `${Math.max(15, sizing.connectionHeight * 0.6)}px`, height: '100%'}}>
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(15, sizing.connectionHeight * 0.6)} ${sizing.connectionHeight}`} preserveAspectRatio="xMidYMid meet">
                  <g transform={`translate(${Math.max(15, sizing.connectionHeight * 0.6) / 2}, ${sizing.connectionHeight / 2}) rotate(90)`}>
                    <polygon
                      points={`-${sizing.arrowSize},${sizing.arrowSize * 1.25} ${sizing.arrowSize},${sizing.arrowSize * 1.25} 0,-${sizing.arrowSize * 1.25}`}
                      fill={connectionColor}
                    />
                  </g>
                </svg>
            </div>
          )}
        </div>
        
        {/* Object Node */}
        <div 
          className="triplet-node object-node"
          style={{ 
            backgroundColor: objectColor || defaultColor,
            minWidth: sizing.nodeMinWidth,
            maxWidth: sizing.nodeMaxWidth,
            padding: sizing.nodePadding
          }}
        >
          <span 
            className="node-label"
            style={{ fontSize: sizing.nodeFontSize }}
          >
            {typeof object === 'string' ? object : JSON.stringify(object)}
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Connection Browser Component
 * Shows connections with dropdown: In Graph | Universe | Semantic Web
 */
const ConnectionBrowser = ({ nodeData, onMaterializeConnection, isUltraSlim = false }) => {
  const [connectionScope, setConnectionScope] = useState('semantic'); // 'graph' | 'universe' | 'semantic'
  const [semanticConnections, setSemanticConnections] = useState([]);
  const [nativeConnections, setNativeConnections] = useState([]);
  const [isLoadingSemanticWeb, setIsLoadingSemanticWeb] = useState(false);
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(400); // Default width
  const connectionListRef = useRef(null);

  const { activeGraphId, nodePrototypes, graphs, edges } = useGraphStore();

  // Measure container width for responsive text hiding
  useEffect(() => {
    const updateContainerWidth = () => {
      if (connectionListRef.current) {
        const width = connectionListRef.current.offsetWidth;
        setContainerWidth(width);
      }
    };

    // Initial measurement
    updateContainerWidth();

    // Update on window resize
    window.addEventListener('resize', updateContainerWidth);

    // Use ResizeObserver for more accurate measurements
    let resizeObserver;
    if (connectionListRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(updateContainerWidth);
      resizeObserver.observe(connectionListRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateContainerWidth);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

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
                // Get edge prototype for the connection label and COLOR
                let connectionName = 'Connection';
                let connectionColor = '#8B0000'; // Default color
                
                // First try to get name and color from edge's definition node (if it has one)
                if (edge.definitionNodeIds && edge.definitionNodeIds.length > 0) {
                  const definitionNode = nodePrototypes.get(edge.definitionNodeIds[0]);
                  if (definitionNode) {
                    connectionName = definitionNode.name || 'Connection';
                    connectionColor = definitionNode.color || '#8B0000';
                  }
                } else if (edge.typeNodeId) {
                  // Fallback to edge prototype type
                  const edgePrototype = nodePrototypes.get(edge.typeNodeId);
                  if (edgePrototype) {
                    connectionName = edgePrototype.name || 'Connection';
                    connectionColor = edgePrototype.color || '#8B0000';
                  }
                }
                
                const connection = {
                  id: `native-${edgeId}`,
                  subject: isSource ? nodeData.name : connectedPrototype.name,
                  predicate: connectionName,
                  object: isSource ? connectedPrototype.name : nodeData.name,
                  confidence: 1.0, // Native connections have 100% confidence
                  source: 'redstring',
                  type: 'native',
                  graphId,
                  graphName: graph.name,
                  edgeId,
                  sourceInstanceId: edge.sourceId,
                  destinationInstanceId: edge.destinationId,
                  inCurrentGraph: graphId === activeGraphId,
                  directionality: edge.directionality || 'directed', // Include directionality info
                  isSource, // Track if current node is source or destination
                  connectedNodeId: connectedPrototype.id,
                  connectedNodeName: connectedPrototype.name,
                  connectionColor // Store the edge/connection color
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
      <div className="connection-list" ref={connectionListRef}>
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
              connection={connection}
              isUltraSlim={isUltraSlim}
              containerWidth={containerWidth}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ConnectionBrowser;