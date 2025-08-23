import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Globe, 
  Database, 
  Code, 
  ChevronDown, 
  ChevronRight, 
  Sparkles, 
  Settings,
  Plus,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Info,
  XCircle
} from 'lucide-react';
import useGraphStore from '../store/graphStore';
import { knowledgeFederation } from '../services/knowledgeFederation';
import './SemanticDiscovery.css';

/**
 * Unified Semantic Discovery Component
 * Progressive disclosure from simple → advanced while maintaining native Redstring aesthetic
 */
const SemanticDiscovery = ({ nodeData, onMaterializeConnection, onNodeUpdate }) => {
  const [expandedLevels, setExpandedLevels] = useState(new Set(['simple'])); // Only simple level expanded initially
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState(null);
  const [error, setError] = useState(null);
  const [guidedOptions, setGuidedOptions] = useState({
    sources: ['wikidata', 'dbpedia'],
    maxDepth: 1,
    maxEntities: 5,
    relationshipTypes: ['instance', 'subclass', 'location', 'organization']
  });
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [savedQueries, setSavedQueries] = useState([]);
  const [customLinks, setCustomLinks] = useState([]);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [linkType, setLinkType] = useState('doi');
  
  const { activeGraphId, nodePrototypes, graphs } = useGraphStore();

  // Simple discovery - one-click semantic exploration
  const handleSimpleDiscovery = async () => {
    if (!nodeData?.name) return;
    
    setIsDiscovering(true);
    setError(null);
    
    try {
      console.log(`[SemanticDiscovery] Starting simple discovery for: ${nodeData.name}`);
      
      const results = await knowledgeFederation.importKnowledgeCluster(nodeData.name, {
        maxDepth: 1,
        maxEntitiesPerLevel: 3,
        includeRelationships: true,
        includeSources: ['wikidata', 'dbpedia'],
      });
      
      setDiscoveryResults(results);
      console.log(`[SemanticDiscovery] Simple discovery completed:`, results);
      
    } catch (err) {
      console.error('[SemanticDiscovery] Simple discovery failed:', err);
      setError(err.message);
    } finally {
      setIsDiscovering(false);
    }
  };

  // Guided discovery - configurable semantic search
  const handleGuidedDiscovery = async () => {
    if (!nodeData?.name) return;
    
    setIsDiscovering(true);
    setError(null);
    
    try {
      console.log(`[SemanticDiscovery] Starting guided discovery for: ${nodeData.name}`, guidedOptions);
      
      const results = await knowledgeFederation.importKnowledgeCluster(nodeData.name, {
        maxDepth: guidedOptions.maxDepth,
        maxEntitiesPerLevel: guidedOptions.maxEntities,
        includeRelationships: true,
        includeSources: guidedOptions.sources,
        relationshipTypes: guidedOptions.relationshipTypes,
      });
      
      setDiscoveryResults(results);
      console.log(`[SemanticDiscovery] Guided discovery completed:`, results);
      
    } catch (err) {
      console.error('[SemanticDiscovery] Guided discovery failed:', err);
      setError(err.message);
    } finally {
      setIsDiscovering(false);
    }
  };

  // Advanced discovery - custom SPARQL queries
  const handleAdvancedDiscovery = async () => {
    if (!advancedQuery.trim()) return;
    
    setIsDiscovering(true);
    setError(null);
    
    try {
      console.log(`[SemanticDiscovery] Executing advanced query:`, advancedQuery);
      
      // This would integrate with a SPARQL endpoint
      // For now, we'll simulate the result
      const results = {
        relationships: [{
          source: 'Custom Query',
          relation: 'SPARQL Result',
          target: 'Query executed',
          confidence: 1.0,
          sourceType: 'custom'
        }]
      };
      
      setDiscoveryResults(results);
      
      // Save query to history
      const newQuery = {
        id: Date.now(),
        query: advancedQuery,
        timestamp: new Date(),
        nodeName: nodeData?.name || 'Unknown'
      };
      setSavedQueries(prev => [newQuery, ...prev.slice(0, 9)]); // Keep last 10
      
    } catch (err) {
      console.error('[SemanticDiscovery] Advanced discovery failed:', err);
      setError(err.message);
    } finally {
      setIsDiscovering(false);
    }
  };

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

  // Convert discovery results to connection format for ConnectionBrowser
  const connections = useMemo(() => {
    if (!discoveryResults?.relationships) return [];
    
    return discoveryResults.relationships.map((rel, index) => ({
      id: `discovery-${index}`,
      subject: rel.source,
      predicate: rel.relation,
      object: rel.target,
      confidence: rel.confidence,
      source: rel.source || 'discovery',
      inCurrentGraph: checkIfInCurrentGraph(rel.source, rel.target)
    }));
  }, [discoveryResults, graphs, activeGraphId, nodePrototypes]);

  // Get appropriate color for nodes based on existing prototypes
  const getNodeColor = (nodeName) => {
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
    console.log('[SemanticDiscovery] Materializing connection:', connection);
  };

  // Toggle expansion of a level
  const toggleLevel = (levelName) => {
    const newExpanded = new Set(expandedLevels);
    if (newExpanded.has(levelName)) {
      newExpanded.delete(levelName);
    } else {
      newExpanded.add(levelName);
    }
    setExpandedLevels(newExpanded);
  };

  // Custom link handling
  const addCustomLink = () => {
    if (!newLinkInput.trim()) return;
    
    const newLink = {
      id: Date.now(),
      url: newLinkInput.trim(),
      type: linkType,
      addedAt: new Date()
    };
    
    setCustomLinks(prev => [...prev, newLink]);
    setNewLinkInput('');
    
    // Update the node with the new link
    if (onNodeUpdate) {
      onNodeUpdate({
        ...nodeData,
        customLinks: [...(nodeData.customLinks || []), newLink]
      });
    }
  };

  const removeCustomLink = (linkId) => {
    setCustomLinks(prev => prev.filter(link => link.id !== linkId));
    
    // Update the node with the removed link
    if (onNodeUpdate) {
      onNodeUpdate({
        ...nodeData,
        customLinks: (nodeData.customLinks || []).filter(link => link.id !== linkId)
      });
    }
  };

  const getLinkDisplayInfo = (url, type) => {
    if (type === 'doi') {
      const doiMatch = url.match(/10\.\d+\/[\w\.\-]+/);
      return doiMatch ? doiMatch[0] : url;
    } else if (type === 'wikipedia') {
      const wikiMatch = url.match(/wikipedia\.org\/wiki\/(.+)/);
      return wikiMatch ? decodeURIComponent(wikiMatch[1].replace(/_/g, ' ')) : url;
    } else if (type === 'arxiv') {
      const arxivMatch = url.match(/arxiv\.org\/abs\/(.+)/);
      return arxivMatch ? `arXiv:${arxivMatch[1]}` : url;
    }
    return url;
  };

  if (!nodeData) {
    return (
      <div className="semantic-discovery-empty">
        <Info size={16} />
        <span>Select a node to discover semantic connections</span>
      </div>
    );
  }

  return (
    <div className="semantic-discovery">
      {/* Level 1: Simple Discovery */}
      <div className="discovery-level simple">
        <div className="level-header">
          <div className="level-icon">
            <Sparkles size={16} />
          </div>
          <div className="level-content">
            <h3>Discover Related</h3>
            <p>Automatically find connections from semantic web sources</p>
          </div>
          <button
            className="discovery-button primary"
            onClick={handleSimpleDiscovery}
            disabled={isDiscovering}
          >
            {isDiscovering ? 'Discovering...' : 'Discover'}
          </button>
        </div>
        
        {discoveryResults && expandedLevels.has('simple') && (
          <div className="discovery-results">
            <div className="results-header">
              <h4>Discovery Results</h4>
              <span className="result-count">{connections.length} connections found</span>
            </div>
            <div className="connections-preview">
              {connections.slice(0, 3).map((connection) => (
                <div key={connection.id} className="connection-preview-item">
                  <div className="connection-nodes">
                    <span className="node-pill" style={{ backgroundColor: getNodeColor(connection.subject) }}>
                      {connection.subject}
                    </span>
                    <span className="connection-arrow">→</span>
                    <span className="node-pill" style={{ backgroundColor: getNodeColor(connection.object) }}>
                      {connection.object}
                    </span>
                  </div>
                  <span className="connection-predicate">{connection.predicate}</span>
                </div>
              ))}
            </div>
            <button
              className="expand-results-button"
              onClick={() => toggleLevel('guided')}
            >
              View All Results
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Level 2: Guided Discovery */}
      <div className="discovery-level guided">
        <div 
          className="level-header expandable"
          onClick={() => toggleLevel('guided')}
        >
          <div className="level-icon">
            <Settings size={16} />
          </div>
          <div className="level-content">
            <h3>Guided Search</h3>
            <p>Customize discovery sources and parameters</p>
          </div>
          {expandedLevels.has('guided') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        
        {expandedLevels.has('guided') && (
          <div className="level-content-expanded">
            <div className="guided-options">
              <div className="option-group">
                <label>Data Sources</label>
                <div className="checkbox-group">
                  {['wikidata', 'dbpedia', 'wikipedia'].map(source => (
                    <label key={source} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={guidedOptions.sources.includes(source)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setGuidedOptions(prev => ({
                              ...prev,
                              sources: [...prev.sources, source]
                            }));
                          } else {
                            setGuidedOptions(prev => ({
                              ...prev,
                              sources: prev.sources.filter(s => s !== source)
                            }));
                          }
                        }}
                      />
                      <span className="checkbox-label">{source}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="option-group">
                <label>Search Depth</label>
                <input
                  type="range"
                  min="1"
                  max="3"
                  value={guidedOptions.maxDepth}
                  onChange={(e) => setGuidedOptions(prev => ({
                    ...prev,
                    maxDepth: parseInt(e.target.value)
                  }))}
                  className="range-slider"
                />
                <span className="range-value">{guidedOptions.maxDepth} level{guidedOptions.maxDepth !== 1 ? 's' : ''}</span>
              </div>
              
              <div className="option-group">
                <label>Max Entities</label>
                <input
                  type="range"
                  min="3"
                  max="10"
                  value={guidedOptions.maxEntities}
                  onChange={(e) => setGuidedOptions(prev => ({
                    ...prev,
                    maxEntities: parseInt(e.target.value)
                  }))}
                  className="range-slider"
                />
                <span className="range-value">{guidedOptions.maxEntities} entities</span>
              </div>
            </div>
            
            <button
              className="discovery-button secondary"
              onClick={handleGuidedDiscovery}
              disabled={isDiscovering}
            >
              {isDiscovering ? 'Searching...' : 'Search with Options'}
            </button>
          </div>
        )}
      </div>

      {/* Level 3: Custom Links */}
      <div className="discovery-level custom-links">
        <div 
          className="level-header expandable"
          onClick={() => toggleLevel('custom-links')}
        >
          <div className="level-icon">
            <ExternalLink size={16} />
          </div>
          <div className="level-content">
            <h3>Custom Links</h3>
            <p>Add DOIs, Wikipedia links, and other external references</p>
          </div>
          {expandedLevels.has('custom-links') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        
        {expandedLevels.has('custom-links') && (
          <div className="level-content-expanded">
            <div className="custom-links-options">
              <div className="link-input-group">
                <div className="link-input-row">
                  <select
                    value={linkType}
                    onChange={(e) => setLinkType(e.target.value)}
                    className="link-type-select"
                  >
                    <option value="doi">DOI</option>
                    <option value="wikipedia">Wikipedia</option>
                    <option value="arxiv">arXiv</option>
                    <option value="url">Other URL</option>
                  </select>
                  <input
                    type="text"
                    value={newLinkInput}
                    onChange={(e) => setNewLinkInput(e.target.value)}
                    placeholder={`Enter ${linkType === 'doi' ? 'DOI' : linkType === 'wikipedia' ? 'Wikipedia URL' : linkType === 'arxiv' ? 'arXiv URL' : 'URL'}...`}
                    className="link-input"
                    onKeyPress={(e) => e.key === 'Enter' && addCustomLink()}
                  />
                  <button
                    className="add-link-button"
                    onClick={addCustomLink}
                    disabled={!newLinkInput.trim()}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              
              <div className="existing-links">
                <label>Existing Links</label>
                <div className="links-list">
                  {customLinks.map(link => (
                    <div key={link.id} className="link-item">
                      <div className="link-info">
                        <span className="link-type-badge">{link.type}</span>
                        <span className="link-display">{getLinkDisplayInfo(link.url, link.type)}</span>
                      </div>
                      <div className="link-actions">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="open-link-button"
                          title="Open link"
                        >
                          <ExternalLink size={12} />
                        </a>
                        <button
                          className="remove-link-button"
                          onClick={() => removeCustomLink(link.id)}
                          title="Remove link"
                        >
                          <XCircle size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {customLinks.length === 0 && (
                    <div className="no-links">
                      <span>No custom links added yet</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Level 4: Advanced Discovery */}
      <div className="discovery-level advanced">
        <div 
          className="level-header expandable"
          onClick={() => toggleLevel('advanced')}
        >
          <div className="level-icon">
            <Code size={16} />
          </div>
          <div className="level-content">
            <h3>Advanced Queries</h3>
            <p>Custom SPARQL queries and endpoint connections</p>
          </div>
          {expandedLevels.has('advanced') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        
        {expandedLevels.has('advanced') && (
          <div className="level-content-expanded">
            <div className="advanced-options">
              <div className="query-input-group">
                <label>SPARQL Query</label>
                <textarea
                  value={advancedQuery}
                  onChange={(e) => setAdvancedQuery(e.target.value)}
                  placeholder="Enter your SPARQL query here..."
                  className="query-textarea"
                  rows={4}
                />
              </div>
              
              <div className="saved-queries">
                <label>Saved Queries</label>
                <div className="saved-queries-list">
                  {savedQueries.map(query => (
                    <div key={query.id} className="saved-query-item">
                      <span className="query-text">{query.query.substring(0, 50)}...</span>
                      <span className="link-meta">{query.nodeName} • {query.timestamp.toLocaleDateString()}</span>
                      <button
                        className="load-query-button"
                        onClick={() => setAdvancedQuery(query.query)}
                      >
                        Load
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <button
              className="discovery-button secondary"
              onClick={handleAdvancedDiscovery}
              disabled={isDiscovering || !advancedQuery.trim()}
            >
              {isDiscovering ? 'Executing...' : 'Execute Query'}
            </button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="discovery-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button
            className="retry-button"
            onClick={() => {
              setError(null);
              setDiscoveryResults(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Full Results Display (when expanded) */}
      {discoveryResults && (expandedLevels.has('guided') || expandedLevels.has('advanced')) && (
        <div className="full-results">
          <div className="results-header">
            <h4>All Discovery Results</h4>
            <div className="results-actions">
              <button
                className="action-button"
                onClick={() => setExpandedLevels(new Set(['simple']))}
              >
                <ChevronRight size={14} />
                Collapse
              </button>
            </div>
          </div>
          
          <div className="connections-list">
            {connections.map((connection) => (
              <div key={connection.id} className="connection-item">
                <div className="connection-nodes">
                  <span className="node-pill" style={{ backgroundColor: getNodeColor(connection.subject) }}>
                    {connection.subject}
                  </span>
                  <span className="connection-arrow">→</span>
                  <span className="node-pill" style={{ backgroundColor: getNodeColor(connection.object) }}>
                    {connection.object}
                  </span>
                </div>
                <div className="connection-details">
                  <span className="connection-predicate">{connection.predicate}</span>
                  <div className="connection-actions">
                    <button
                      className="materialize-button"
                      onClick={() => handleMaterializeConnection(connection)}
                      title="Add to graph"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SemanticDiscovery;
