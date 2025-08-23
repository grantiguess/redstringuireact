import React, { useState, useCallback } from 'react';
import { Globe, Link, Book, Search, ExternalLink, Plus, X, Check, Tags, FileText, Eye, Settings, CheckCircle, RotateCcw, Zap } from 'lucide-react';
import { PANEL_CLOSE_ICON_SIZE } from '../constants';
import StandardDivider from './StandardDivider.jsx';
import RDFResolutionPanel from './RDFResolutionPanel.jsx';
import { semanticEnrichment, suggestExternalLinks, suggestEquivalentClasses } from '../services/semanticEnrichment.js';
import { rdfValidation, validateNode } from '../services/rdfValidation.js';

// DOI validation regex
const DOI_REGEX = /^10\.\d{4,}\/[-._;()\/:a-zA-Z0-9]+$/;

// URL validation for academic sources
const isValidURL = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// Extract DOI from various URL formats
const extractDOI = (input) => {
  // Direct DOI format
  if (DOI_REGEX.test(input)) return input;
  
  // DOI URL formats
  const doiUrlMatch = input.match(/(?:https?:\/\/)?(?:www\.)?(?:dx\.)?doi\.org\/(10\.\d{4,}\/[-._;()\/:a-zA-Z0-9]+)/);
  if (doiUrlMatch) return doiUrlMatch[1];
  
  // PubMed URL with DOI
  const pubmedMatch = input.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
  if (pubmedMatch) return `pubmed:${pubmedMatch[1]}`;
  
  return null;
};

const SemanticLinkInput = ({ onAdd, placeholder, type, icon: Icon }) => {
  const [input, setInput] = useState('');
  const [isValid, setIsValid] = useState(false);

  const validateInput = useCallback((value) => {
    if (type === 'doi') {
      return DOI_REGEX.test(value) || extractDOI(value) !== null;
    }
    return isValidURL(value);
  }, [type]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    setIsValid(validateInput(value));
  };

  const handleAdd = () => {
    if (!isValid) return;
    
    let processedValue = input;
    if (type === 'doi') {
      const extracted = extractDOI(input);
      if (extracted) {
        processedValue = extracted.startsWith('10.') ? `doi:${extracted}` : extracted;
      }
    }
    
    onAdd(processedValue);
    setInput('');
    setIsValid(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && isValid) {
      handleAdd();
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <Icon size={16} style={{ color: '#666', marginTop: '1px' }} />
      <input
        type="text"
        value={input}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '6px 8px',
          border: `1px solid ${isValid ? '#28a745' : input ? '#dc3545' : '#260000'}`,
          borderRadius: '4px',
          fontSize: '14px',
          fontFamily: "'EmOne', sans-serif"
        }}
      />
      <button
        onClick={handleAdd}
        disabled={!isValid}
        style={{
          width: '32px',
          height: '32px',
          border: 'none',
          borderRadius: '6px',
          backgroundColor: '#8B0000',
          color: '#EFE8E5',
          cursor: isValid ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          opacity: isValid ? 1 : 0.5
        }}
        onMouseEnter={(e) => isValid && (e.target.style.backgroundColor = '#A00000')}
        onMouseLeave={(e) => isValid && (e.target.style.backgroundColor = '#8B0000')}
      >
        <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#EFE8E5', lineHeight: 1 }}>+</span>
      </button>
    </div>
  );
};

const ExternalLinkCard = ({ link, onRemove }) => {
  const getDisplayInfo = (uri) => {
    if (uri.startsWith('doi:')) {
      return {
        type: 'DOI',
        display: uri.replace('doi:', ''),
        url: `https://doi.org/${uri.replace('doi:', '')}`,
        color: '#ff6b35'
      };
    } else if (uri.startsWith('pubmed:')) {
      return {
        type: 'PubMed',
        display: uri.replace('pubmed:', ''),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uri.replace('pubmed:', '')}`,
        color: '#0066cc'
      };
    } else if (uri.startsWith('wd:')) {
      return {
        type: 'Wikidata',
        display: uri.replace('wd:', ''),
        url: `https://www.wikidata.org/wiki/${uri.replace('wd:', '')}`,
        color: '#339966'
      };
    } else if (uri.includes('wikipedia.org')) {
      return {
        type: 'Wikipedia',
        display: uri.split('/').pop(),
        url: uri,
        color: '#000000'
      };
    } else if (uri.includes('arxiv.org')) {
      return {
        type: 'arXiv',
        display: uri.split('/').pop(),
        url: uri,
        color: '#b31b1b'
      };
    } else {
      return {
        type: 'URL',
        display: uri.replace(/^https?:\/\//, '').substring(0, 40) + '...',
        url: uri,
        color: '#666'
      };
    }
  };

  const { type, display, url, color } = getDisplayInfo(link);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      backgroundColor: '#bdb5b5', // Canvas color background
      border: `1px solid ${color}`,
      borderRadius: '6px',
      marginBottom: '6px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)' // Subtle shadow
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '12px',
          fontWeight: 'bold',
          color: color,
          marginBottom: '2px'
        }}>
          {type}
        </div>
        <div style={{
          fontSize: '14px',
          color: '#333',
          fontFamily: "'EmOne', sans-serif"
        }}>
          {display}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => window.open(url, '_blank')}
          style={{
            padding: '4px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            color: color
          }}
          title="Open external link"
        >
          <ExternalLink size={14} />
        </button>
        <button
          onClick={() => onRemove(link)}
          style={{
            padding: '4px',
            border: 'none',
            backgroundColor: '#dc3545',
            color: '#EFE8E5',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
          title="Remove link"
        >
          <X size={PANEL_CLOSE_ICON_SIZE} />
        </button>
      </div>
    </div>
  );
};

const WikipediaSearch = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchWikipedia = async (searchTerm) => {
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTerm)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setResults([{
          title: data.title,
          description: data.extract,
          url: data.content_urls.desktop.page,
          thumbnail: data.thumbnail?.source
        }]);
      } else {
        // Fallback to search API
        const searchResponse = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/search?q=${encodeURIComponent(searchTerm)}&limit=3`
        );
        const searchData = await searchResponse.json();
        setResults(searchData.pages || []);
      }
    } catch (error) {
      console.warn('Wikipedia search failed:', error);
      setResults([]);
    }
    setLoading(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchWikipedia(query);
    }
  };

  // Handle Wikipedia URL input
  const handleDirectURL = (input) => {
    const wikipediaMatch = input.match(/(?:https?:\/\/)?(?:www\.)?(?:en\.)?wikipedia\.org\/wiki\/(.+)/);
    if (wikipediaMatch) {
      return input;
    }
    return null;
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    
    // If it looks like a Wikipedia URL, clear results to indicate it's ready
    if (handleDirectURL(value)) {
      setResults([]);
    }
  };

  const handleSearch = () => {
    // Check if it's a direct Wikipedia URL first
    const directURL = handleDirectURL(query);
    if (directURL) {
      onSelect(directURL);
      setQuery('');
      return;
    }
    
    // Otherwise, search
    searchWikipedia(query);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
        <Globe size={16} style={{ color: '#666', marginTop: '1px', flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Search Wikipedia or paste URL..."
          style={{
            flex: 1,
            padding: '6px 8px',
            border: '1px solid #260000',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: "'EmOne', sans-serif"
          }}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          style={{
            width: '32px',
            height: '32px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: '#8B0000',
            color: '#EFE8E5',
            cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            opacity: loading || !query.trim() ? 0.5 : 1
          }}
          onMouseEnter={(e) => !(loading || !query.trim()) && (e.target.style.backgroundColor = '#A00000')}
          onMouseLeave={(e) => !(loading || !query.trim()) && (e.target.style.backgroundColor = '#8B0000')}
        >
          {loading ? '...' : <span style={{ fontSize: '18px', color: '#EFE8E5', lineHeight: 1 }}>⌕</span>}
        </button>
      </div>

      {results.length > 0 && (
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {results.map((result, index) => (
            <div
              key={index}
              style={{
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '6px',
                cursor: 'pointer',
                backgroundColor: '#f8f9fa',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start'
              }}
            >
              <div 
                onClick={() => onSelect(result.url || `https://en.wikipedia.org/wiki/${result.title}`)}
                style={{ flex: 1 }}
              >
                <div style={{
                  fontWeight: 'bold',
                  fontSize: '14px',
                  marginBottom: '4px',
                  color: '#333'  // Dark title
                }}>
                  {result.title}
                </div>
                {result.description && (
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    lineHeight: 1.3
                  }}>
                    {result.description.substring(0, 100)}...
                  </div>
                )}
              </div>
              <button
                onClick={() => window.open(result.url || `https://en.wikipedia.org/wiki/${result.title}`, '_blank')}
                style={{
                  padding: '4px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  color: '#8B0000',
                  marginLeft: '8px'
                }}
                title="Open in Wikipedia"
              >
                <ExternalLink size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RDFSchemaPropertiesSection = ({ nodeData, onUpdate }) => {
  const [rdfsSeeAlso, setRdfsSeeAlso] = useState((nodeData['rdfs:seeAlso'] || []).join(', '));

  const handleSeeAlsoBlur = () => {
    const seeAlsoArray = rdfsSeeAlso
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    onUpdate({
      ...nodeData,
      'rdfs:seeAlso': seeAlsoArray
    });
  };

  const handleSeeAlsoKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <div style={{ 
      marginBottom: '20px',
      backgroundColor: '#bdb5b5', // Canvas color background
      padding: '15px',
      borderRadius: '8px',
      border: '1px solid #e0e0e0'
    }}>
      <h4 style={{ 
        margin: '0 0 10px 0', 
        fontSize: '14px', 
        color: '#8B0000', // Maroon header
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        backgroundColor: '#EFE8E5',
        borderRadius: '4px',
        borderLeft: '3px solid #8B0000' // Maroon left border
      }}>
        <Tags size={14} />
        RDF Schema Properties
      </h4>

      {/* Show auto-synced RDF properties */}
      <div style={{
        padding: '8px 10px',
        backgroundColor: '#EFE8E5', // Canvas color background
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        marginBottom: '10px',
        fontSize: '12px'
      }}>
        <div style={{ marginBottom: '6px', fontWeight: 'bold', color: '#333' }}>
          Auto-Generated RDF Schema:
        </div>
        <div style={{ marginBottom: '3px', color: '#333' }}>
          <strong>rdfs:label:</strong> <code>"{nodeData.name || 'Untitled'}"</code>
        </div>
        <div style={{ marginBottom: '0px', color: '#333' }}>
          <strong>rdfs:comment:</strong> <code>"{(nodeData.description || 'No description').substring(0, 60)}{(nodeData.description || '').length > 60 ? '...' : ''}"</code>
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px', 
          marginTop: '6px',
          color: '#666', 
          fontSize: '11px'
        }}>
          <CheckCircle size={12} />
          Auto-synced
        </div>
      </div>

      {/* Only rdfs:seeAlso needs manual input */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ 
          display: 'block', 
          fontSize: '12px', 
          color: '#8B0000', // Maroon label
          marginBottom: '4px',
          fontWeight: 'bold'
        }}>
          See Also (rdfs:seeAlso)
        </label>
        <input
          type="text"
          value={rdfsSeeAlso}
          onChange={(e) => setRdfsSeeAlso(e.target.value)}
          onBlur={handleSeeAlsoBlur}
          onKeyPress={handleSeeAlsoKeyPress}
          placeholder="https://example.com/related, https://other.com/resource"
          style={{
            width: 'calc(100% - 16px)', // Account for padding
            padding: '6px 8px',
            border: '1px solid #8B0000', // Maroon border
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: "'EmOne', sans-serif",
            backgroundColor: '#EFE8E5' // Canvas color for input background
          }}
        />
        <div style={{ 
          fontSize: '11px', 
          color: '#666', 
          marginTop: '2px'
        }}>
          Comma-separated URLs to related resources
        </div>
      </div>
    </div>
  );
};

const SemanticClassificationSection = ({ nodeData, onUpdate }) => {
  const [federationMode, setFederationMode] = useState('node'); // 'node' or 'domain'
  const [showSettings, setShowSettings] = useState(false);

  const equivalentClasses = nodeData.equivalentClasses || [];
  const abstractionChains = nodeData.abstractionChains || {};

  const addEquivalentClass = (uri, source = 'manual') => {
    const updatedClasses = [...equivalentClasses, { "@id": uri, "source": source }];
    onUpdate({
      ...nodeData,
      equivalentClasses: updatedClasses
    });
  };

  const removeEquivalentClass = (uri) => {
    const updatedClasses = equivalentClasses.filter(cls => cls['@id'] !== uri);
    onUpdate({
      ...nodeData,
      equivalentClasses: updatedClasses
    });
  };

  // Common ontology mappings
  const commonOntologies = [
    { id: 'schema:Person', name: 'Person (Schema.org)', color: '#4285f4' },
    { id: 'foaf:Person', name: 'Person (FOAF)', color: '#34a853' },
    { id: 'dbo:Person', name: 'Person (DBpedia)', color: '#ea4335' },
    { id: 'schema:Organization', name: 'Organization (Schema.org)', color: '#4285f4' },
    { id: 'foaf:Organization', name: 'Organization (FOAF)', color: '#34a853' },
    { id: 'schema:CreativeWork', name: 'Creative Work (Schema.org)', color: '#4285f4' },
    { id: 'schema:Thing', name: 'Thing (Schema.org)', color: '#4285f4' }
  ];

  return (
    <div style={{
      backgroundColor: '#bdb5b5', // Canvas color background
      padding: '15px',
      borderRadius: '8px',
      border: '1px solid #e0e0e0'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '10px' 
      }}>
        <h4 style={{ 
          margin: '0', 
          fontSize: '14px', 
          color: '#8B0000', // Maroon header
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          backgroundColor: '#EFE8E5',
          borderRadius: '4px',
          borderLeft: '3px solid #8B0000' // Maroon left border
        }}>
          <Search size={14} />
          Semantic Classification
        </h4>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            padding: '4px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            color: '#8B0000' // Maroon color
          }}
          title="Federation settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Federation Settings */}
      {showSettings && (
        <div style={{
          padding: '10px',
          backgroundColor: '#EFE8E5', // Canvas color background
          borderRadius: '6px',
          marginBottom: '10px',
          border: '1px solid #e0e0e0'
        }}>
          <div style={{ fontSize: '12px', color: '#8B0000', marginBottom: '8px', fontWeight: 'bold' }}>
            Federation Mode:
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
              <input
                type="radio"
                checked={federationMode === 'node'}
                onChange={() => setFederationMode('node')}
              />
              Per-node classification
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
              <input
                type="radio"
                checked={federationMode === 'domain'}
                onChange={() => setFederationMode('domain')}
              />
              Domain-wide settings
            </label>
          </div>
          <div style={{ 
            fontSize: '11px', 
            color: '#666', 
            marginTop: '6px',
            fontStyle: 'italic'
          }}>
            {federationMode === 'node' 
              ? 'Each node can have custom ontology mappings'
              : 'Use domain-wide federation settings for consistent classification'
            }
          </div>
        </div>
      )}

      {/* Current Type Display */}
      {nodeData.typeNodeId && (
        <div style={{
          padding: '8px 10px',
          backgroundColor: '#EFE8E5', // Canvas color background
          borderLeft: '3px solid #8B0000', // Maroon left border
          marginBottom: '10px',
          fontSize: '12px',
          borderRadius: '0 6px 6px 0' // Rounded right corners
        }}>
          <strong style={{ color: '#8B0000' }}>Current Type:</strong> {nodeData.typeNodeId}
          <br />
          <span style={{ color: '#666' }}>
            This creates an rdfs:subClassOf relationship in RDF Schema
          </span>
        </div>
      )}

      {/* Quick Ontology Mappings */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ 
          display: 'block', 
          fontSize: '12px', 
          color: '#8B0000', // Maroon label
          marginBottom: '8px',
          fontWeight: 'bold'
        }}>
          Quick Classifications (owl:equivalentClass):
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {commonOntologies.map(onto => {
            const isSelected = equivalentClasses.some(cls => cls['@id'] === onto.id);
            return (
              <button
                key={onto.id}
                onClick={() => isSelected 
                  ? removeEquivalentClass(onto.id)
                  : addEquivalentClass(onto.id, 'quick-select')
                }
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  border: `1px solid ${onto.color}`,
                  backgroundColor: isSelected ? onto.color : '#EFE8E5', // Canvas color background when not selected
                  color: isSelected ? '#EFE8E5' : onto.color,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {onto.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Classifications */}
      {equivalentClasses.length > 0 && (
        <div>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            color: '#8B0000', // Maroon label
            marginBottom: '8px',
            fontWeight: 'bold'
          }}>
            Current Classifications ({equivalentClasses.length}):
          </label>
          {equivalentClasses.map((cls, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                backgroundColor: '#EFE8E5', // Canvas color background
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                marginBottom: '4px',
                fontSize: '12px'
              }}
            >
              <div>
                <code style={{ 
                  backgroundColor: '#EFE8E5', 
                  padding: '2px 4px', 
                  borderRadius: '3px',
                  fontSize: '11px',
                  color: '#333' // Dark text color for better readability
                }}>
                  {cls['@id']}
                </code>
                {cls.source && (
                  <span style={{ 
                    marginLeft: '8px', 
                    fontSize: '10px', 
                    color: '#333', // Dark text color to match panel
                    fontStyle: 'italic'
                  }}>
                    via {cls.source}
                  </span>
                )}
              </div>
              <button
                onClick={() => removeEquivalentClass(cls['@id'])}
                style={{
                  padding: '2px 6px',
                  border: 'none',
                  backgroundColor: '#dc3545',
                  color: '#EFE8E5',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1
                }}
              >
                <X size={12} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Abstraction Chains - Future Feature */}
      {Object.keys(abstractionChains).length > 0 && (
        <div style={{ marginTop: '15px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            color: '#8B0000', // Maroon label
            marginBottom: '8px',
            fontWeight: 'bold'
          }}>
            Abstraction Chains:
          </label>
          <div style={{ 
            fontSize: '11px', 
            color: '#856404', 
            fontStyle: 'italic',
            marginTop: '8px'
          }}>
            Future: These will be automatically mapped to rdfs:subClassOf relationships
          </div>
        </div>
      )}
    </div>
  );
};

const SemanticEditor = ({ nodeData, onUpdate }) => {
  const [showRDFResolution, setShowRDFResolution] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [validationResults, setValidationResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!nodeData) return null;

  const externalLinks = nodeData.externalLinks || [];

  const addExternalLink = (uri) => {
    const updatedLinks = [...externalLinks, uri];
    onUpdate({
      ...nodeData,
      externalLinks: updatedLinks
    });
  };

  const removeExternalLink = (uri) => {
    const updatedLinks = externalLinks.filter(link => link !== uri);
    onUpdate({
      ...nodeData,
      externalLinks: updatedLinks
    });
  };

  // Handle getting suggestions for external links
  const handleGetSuggestions = async () => {
    if (!nodeData) return;
    
    setIsLoading(true);
    try {
      const linkSuggestions = await suggestExternalLinks(nodeData.id, nodeData);
      setSuggestions(linkSuggestions);
    } catch (error) {
      console.error('[SemanticEditor] Failed to get suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle node validation
  const handleValidateNode = async () => {
    if (!nodeData) return;
    
    setIsLoading(true);
    try {
      const results = await validateNode(nodeData, { nodes: [nodeData] });
      setValidationResults(results);
    } catch (error) {
      console.error('[SemanticEditor] Validation failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle updating node data
  const handleNodeUpdate = (updatedNode) => {
    onUpdate(updatedNode);
  };

  return (
    <div style={{ 
      padding: '15px', 
      fontFamily: "'EmOne', sans-serif",
      backgroundColor: '#bdb5b5', // Canvas color background
      borderRadius: '8px',
      border: '1px solid #e0e0e0'
    }}>
      <h3 style={{
        margin: '0 0 15px 0',
        color: '#8B0000', // Maroon header
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: '#EFE8E5', // Canvas color background for header
        borderRadius: '6px',
        borderLeft: '4px solid #8B0000' // Maroon left border
      }}>
        <Globe size={18} />
        Semantic Web Links
      </h3>

      {/* RDF Schema Properties Section */}
      <RDFSchemaPropertiesSection 
        nodeData={nodeData} 
        onUpdate={onUpdate} 
      />

      <StandardDivider margin="15px 0" />

      {/* External Links Section (Rosetta Stone) */}
      <div style={{ 
        marginBottom: '20px',
        backgroundColor: '#bdb5b5', // Canvas color background
        padding: '15px',
        borderRadius: '8px',
        border: '1px solid #e0e0e0'
      }}>
        <h4 style={{ 
          margin: '0 0 10px 0', 
          fontSize: '14px', 
          color: '#8B0000', // Maroon header
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          backgroundColor: '#EFE8E5',
          borderRadius: '4px',
          borderLeft: '3px solid #8B0000' // Maroon left border
        }}>
          <Link size={14} />
          External References (owl:sameAs)
        </h4>

        {/* DOI Input */}
        <div style={{ marginBottom: '10px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            color: '#666', 
            marginBottom: '4px' 
          }}>
            DOI or Academic Paper
          </label>
          <SemanticLinkInput
            onAdd={addExternalLink}
            placeholder="10.1000/182 or https://doi.org/10.1000/182"
            type="doi"
            icon={Book}
          />
        </div>

        {/* Wikipedia Search */}
        <div style={{ marginBottom: '10px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            color: '#666', 
            marginBottom: '4px' 
          }}>
            Wikipedia Article
          </label>
          <WikipediaSearch onSelect={addExternalLink} />
        </div>

        {/* General URL Input */}
        <div style={{ marginBottom: '10px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            color: '#666', 
            marginBottom: '4px' 
          }}>
            Other URL
          </label>
          <SemanticLinkInput
            onAdd={addExternalLink}
            placeholder="https://example.com/resource"
            type="url"
            icon={ExternalLink}
          />
        </div>

        {/* Display existing links */}
        {externalLinks.length > 0 && (
          <div style={{ marginTop: '15px' }}>
            <h5 style={{ 
              margin: '0 0 8px 0', 
              fontSize: '12px', 
              color: '#666',
              textTransform: 'uppercase'
            }}>
              Linked Resources ({externalLinks.length})
            </h5>
            {externalLinks.map((link, index) => (
              <ExternalLinkCard
                key={index}
                link={link}
                onRemove={removeExternalLink}
              />
            ))}
          </div>
        )}

        {/* RDF Resolution Actions */}
        {externalLinks.length > 0 && (
          <div style={{ marginTop: '15px', padding: '12px', backgroundColor: 'rgba(38, 0, 0, 0.05)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowRDFResolution(true)}
                style={{
                  backgroundColor: '#8B0000',
                  color: '#bdb5b5',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 'bold'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#A52A2A'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#8B0000'}
                title="Resolve external links to RDF data"
              >
                <RotateCcw size={14} />
                Resolve Links
              </button>
              
              <button
                onClick={handleGetSuggestions}
                style={{
                  backgroundColor: '#2E8B57',
                  color: '#bdb5b5',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 'bold'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3CB371'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2E8B57'}
                title="Get AI-powered suggestions for external links"
              >
                <Zap size={14} />
                Get Suggestions
              </button>

              <button
                onClick={handleValidateNode}
                style={{
                  backgroundColor: '#FF8C00',
                  color: '#bdb5b5',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 'bold'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FFA500'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FF8C00'}
                title="Validate node semantic consistency"
              >
                <CheckCircle size={14} />
                Validate
              </button>
            </div>
          </div>
        )}
      </div>

      <StandardDivider margin="20px 0" />
      
      {/* Semantic Classification Section */}
      <SemanticClassificationSection 
        nodeData={nodeData} 
        onUpdate={onUpdate}
      />

      {/* RDF Resolution Panel */}
      <RDFResolutionPanel
        nodeData={nodeData}
        onUpdate={handleNodeUpdate}
        isVisible={showRDFResolution}
        onClose={() => setShowRDFResolution(false)}
      />
    </div>
  );
};

export default SemanticEditor;