/**
 * RDF Resolution Panel Component
 * 
 * Provides UI for resolving external links and displaying resolved RDF data
 * with expandable sections and error handling.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { resolveURI, clearCache, getCacheStats } from '../services/rdfResolver.js';
import { sparqlClient, testEndpoint } from '../services/sparqlClient.js';
import { semanticEnrichment, suggestExternalLinks, suggestEquivalentClasses } from '../services/semanticEnrichment.js';
import { rdfValidation, validateNode } from '../services/rdfValidation.js';
import { RotateCcw, ExternalLink, AlertTriangle, CheckCircle, Info, Loader2, RefreshCw, X, ChevronDown, ChevronRight, Globe, Database, Search, Plus } from 'lucide-react';

const RDFResolutionPanel = ({ nodeData, onUpdate, isVisible = false, onClose }) => {
  const [resolutionState, setResolutionState] = useState('idle'); // idle, loading, resolved, error
  const [resolvedData, setResolvedData] = useState({});
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [suggestions, setSuggestions] = useState([]);
  const [validationResults, setValidationResults] = useState(null);
  const [endpointStatus, setEndpointStatus] = useState({});
  const [cacheStats, setCacheStats] = useState(null);

  // Load cache stats on mount
  useEffect(() => {
    if (isVisible) {
      setCacheStats(getCacheStats());
    }
  }, [isVisible]);

  // Check endpoint status on mount
  useEffect(() => {
    if (isVisible) {
      checkEndpointStatus();
    }
  }, [isVisible]);

  // Check endpoint connectivity
  const checkEndpointStatus = async () => {
    const endpoints = ['wikidata', 'dbpedia', 'schema'];
    const status = {};
    
    for (const endpoint of endpoints) {
      try {
        const result = await testEndpoint(endpoint);
        status[endpoint] = result;
      } catch (error) {
        status[endpoint] = { status: 'error', error: error.message };
      }
    }
    
    setEndpointStatus(status);
  };

  // Resolve external links for the current node
  const handleResolveLinks = async () => {
    if (!nodeData.externalLinks || nodeData.externalLinks.length === 0) {
      return;
    }

    setResolutionState('loading');
    
    try {
      const results = {};
      
      for (const link of nodeData.externalLinks) {
        try {
          const resolved = await resolveURI(link, { timeout: 10000 });
          results[link] = { status: 'resolved', data: resolved };
        } catch (error) {
          results[link] = { status: 'failed', error: error.message };
        }
      }
      
      setResolvedData(results);
      setResolutionState('resolved');
      
      // Auto-expand sections with resolved data
      const newExpanded = new Set(expandedSections);
      Object.keys(results).forEach(link => {
        if (results[link].status === 'resolved') {
          newExpanded.add(link);
        }
      });
      setExpandedSections(newExpanded);
      
    } catch (error) {
      console.error('[RDF Resolution] Failed to resolve links:', error);
      setResolutionState('error');
    }
  };

  // Get suggestions for external links
  const handleGetSuggestions = async () => {
    if (!nodeData) return;
    
    try {
      const linkSuggestions = await suggestExternalLinks(nodeData.id, nodeData);
      const classSuggestions = nodeData.typeNodeId ? 
        await suggestEquivalentClasses(nodeData.id, [nodeData.typeNodeId]) : [];
      
      setSuggestions({
        links: linkSuggestions,
        classes: classSuggestions
      });
    } catch (error) {
      console.error('[RDF Resolution] Failed to get suggestions:', error);
    }
  };

  // Validate the current node
  const handleValidateNode = async () => {
    if (!nodeData) return;
    
    try {
      const results = await validateNode(nodeData, { nodes: [nodeData] });
      setValidationResults(results);
    } catch (error) {
      console.error('[RDF Resolution] Validation failed:', error);
    }
  };

  // Toggle section expansion
  const toggleSection = (sectionId) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  // Clear cache
  const handleClearCache = () => {
    clearCache();
    setCacheStats(getCacheStats());
  };

  // Refresh cache stats
  const handleRefreshStats = () => {
    setCacheStats(getCacheStats());
  };

  // Add suggested link
  const handleAddSuggestedLink = (suggestion) => {
    if (onUpdate && nodeData) {
      const updatedNode = { ...nodeData };
      if (!updatedNode.externalLinks) {
        updatedNode.externalLinks = [];
      }
      updatedNode.externalLinks.push(suggestion.uri);
      onUpdate(updatedNode);
    }
  };

  // Add suggested equivalent class
  const handleAddSuggestedClass = (suggestion) => {
    if (onUpdate && nodeData) {
      const updatedNode = { ...nodeData };
      if (!updatedNode.equivalentClasses) {
        updatedNode.equivalentClasses = [];
      }
      updatedNode.equivalentClasses.push(suggestion.uri);
      onUpdate(updatedNode);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="rdf-resolution-panel" style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '90vw',
      maxWidth: '800px',
      maxHeight: '90vh',
      backgroundColor: '#bdb5b5',
      border: '2px solid #260000',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      zIndex: 10000,
      overflow: 'hidden',
      fontFamily: "'EmOne', sans-serif"
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: '#260000',
        color: '#bdb5b5',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '2px solid #8B0000'
      }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>
          RDF Resolution & Validation
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#bdb5b5',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(189, 181, 181, 0.2)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div style={{
        padding: '20px',
        overflowY: 'auto',
        maxHeight: 'calc(90vh - 80px)'
      }}>
        {/* Node Info */}
        <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'rgba(38, 0, 0, 0.05)', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#260000', fontSize: '1.1rem' }}>
            {nodeData?.name || 'Unnamed Node'}
          </h3>
          <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: '0.9rem' }}>
            {nodeData?.description || 'No description available'}
          </p>
          {nodeData?.externalLinks && (
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              <strong>External Links:</strong> {nodeData.externalLinks.length}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={handleResolveLinks}
            disabled={!nodeData?.externalLinks || nodeData.externalLinks.length === 0 || resolutionState === 'loading'}
            style={{
              backgroundColor: '#8B0000',
              color: '#bdb5b5',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#A52A2A'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#8B0000'}
          >
            {resolutionState === 'loading' ? <Loader2 size={16} className="spin" /> : <ExternalLink size={16} />}
            Resolve Links
          </button>

          <button
            onClick={handleGetSuggestions}
            style={{
              backgroundColor: '#2E8B57',
              color: '#bdb5b5',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3CB371'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2E8B57'}
          >
            <Search size={16} />
            Get Suggestions
          </button>

          <button
            onClick={handleValidateNode}
            style={{
              backgroundColor: '#FF8C00',
              color: '#bdb5b5',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FFA500'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FF8C00'}
          >
            <CheckCircle size={16} />
            Validate
          </button>
        </div>

        {/* Resolution Results */}
        {resolutionState === 'resolved' && Object.keys(resolvedData).length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#260000', fontSize: '1.1rem' }}>
              Resolved Data
            </h3>
            {Object.entries(resolvedData).map(([uri, result]) => (
              <div key={uri} style={{ marginBottom: '12px' }}>
                <div
                  onClick={() => toggleSection(uri)}
                  style={{
                    backgroundColor: result.status === 'resolved' ? 'rgba(46, 139, 87, 0.1)' : 'rgba(255, 69, 0, 0.1)',
                    padding: '12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: `1px solid ${result.status === 'resolved' ? '#2E8B57' : '#FF4500'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {result.status === 'resolved' ? <CheckCircle size={16} color="#2E8B57" /> : <AlertTriangle size={16} color="#FF4500" />}
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                      {result.status === 'resolved' ? 'Resolved' : 'Failed'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#666', wordBreak: 'break-all' }}>
                      {uri}
                    </span>
                  </div>
                  {expandedSections.has(uri) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>

                {expandedSections.has(uri) && result.status === 'resolved' && (
                  <div style={{ padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.5)', borderRadius: '6px', marginTop: '8px' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Content Type:</strong> {result.data.contentType}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Triples:</strong> {result.data.triples.length}
                    </div>
                    {result.data.triples.length > 0 && (
                      <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem' }}>
                        {result.data.triples.slice(0, 10).map((triple, index) => (
                          <div key={index} style={{ marginBottom: '4px', fontFamily: 'monospace' }}>
                            {triple.subject} {triple.predicate} {triple.object}
                          </div>
                        ))}
                        {result.data.triples.length > 10 && (
                          <div style={{ color: '#666', fontStyle: 'italic' }}>
                            ... and {result.data.triples.length - 10} more triples
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.links && suggestions.links.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#260000', fontSize: '1.1rem' }}>
              Suggested External Links
            </h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              {suggestions.links.slice(0, 5).map((suggestion, index) => (
                <div key={index} style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  padding: '12px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid rgba(38, 0, 0, 0.1)'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                      {suggestion.label}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666', wordBreak: 'break-all' }}>
                      {suggestion.uri}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>
                      Source: {suggestion.source} • Confidence: {Math.round(suggestion.confidence * 100)}%
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddSuggestedLink(suggestion)}
                    style={{
                      backgroundColor: '#2E8B57',
                      color: '#bdb5b5',
                      border: 'none',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3CB371'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2E8B57'}
                  >
                    <Plus size={12} />
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Results */}
        {validationResults && (
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#260000', fontSize: '1.1rem' }}>
              Validation Results
            </h3>
            <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', padding: '16px', borderRadius: '8px' }}>
              {validationResults.issues.length === 0 ? (
                <div style={{ color: '#2E8B57', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={16} />
                  No validation issues found
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>
                    Found {validationResults.issues.length} issue(s):
                  </div>
                  {validationResults.issues.map((issue, index) => (
                    <div key={index} style={{
                      padding: '8px',
                      marginBottom: '8px',
                      backgroundColor: issue.severity === 'error' ? 'rgba(255, 0, 0, 0.1)' :
                                   issue.severity === 'warning' ? 'rgba(255, 165, 0, 0.1)' :
                                   'rgba(0, 0, 255, 0.1)',
                      border: `1px solid ${issue.severity === 'error' ? '#FF0000' :
                                       issue.severity === 'warning' ? '#FFA500' : '#0000FF'}`,
                      borderRadius: '4px'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {issue.severity.toUpperCase()}: {issue.message}
                      </div>
                      {issue.nodeId && (
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                          Node: {issue.nodeId}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Endpoint Status */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#260000', fontSize: '1.1rem' }}>
            Endpoint Status
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {Object.entries(endpointStatus).map(([endpoint, status]) => (
              <div key={endpoint} style={{
                backgroundColor: status.status === 'connected' ? 'rgba(46, 139, 87, 0.1)' : 'rgba(255, 69, 0, 0.1)',
                padding: '12px',
                borderRadius: '6px',
                border: `1px solid ${status.status === 'connected' ? '#2E8B57' : '#FF4500'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Database size={16} color={status.status === 'connected' ? '#2E8B57' : '#FF4500'} />
                <div>
                  <div style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                    {endpoint}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>
                    {status.status === 'connected' ? 
                      `${status.responseTime}ms` : 
                      status.error || 'Connection failed'
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cache Management */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#260000', fontSize: '1.1rem' }}>
            Cache Management
          </h3>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', padding: '16px', borderRadius: '8px' }}>
            {cacheStats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>Total Entries</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{cacheStats.totalEntries}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>Valid</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2E8B57' }}>{cacheStats.validEntries}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>Expired</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#FF8C00' }}>{cacheStats.expiredEntries}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>Size</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{Math.round(cacheStats.cacheSize / 1024)}KB</div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleClearCache}
                style={{
                  backgroundColor: '#DC143C',
                  color: '#bdb5b5',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#B22222'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#DC143C'}
              >
                <X size={12} />
                Clear Cache
              </button>
              <button
                onClick={handleRefreshStats}
                style={{
                  backgroundColor: '#4682B4',
                  color: '#bdb5b5',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5F9EA0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4682B4'}
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RDFResolutionPanel;
