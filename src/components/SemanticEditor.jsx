import React, { useState, useCallback, useEffect } from 'react';
import { Globe, Link, Book, Search, ExternalLink, Plus, X, Check, Tags, FileText, Eye, Settings, CheckCircle, RotateCcw, Zap, Loader2, AlertCircle, CheckSquare } from 'lucide-react';
import { PANEL_CLOSE_ICON_SIZE } from '../constants';
import StandardDivider from './StandardDivider.jsx';
import { rdfResolver } from '../services/rdfResolver.js';
import { enrichFromSemanticWeb, fastEnrichFromSemanticWeb } from '../services/semanticWebQuery.js';
import { knowledgeFederation } from '../services/knowledgeFederation.js';

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

const SemanticLinkInput = ({ onAdd, placeholder, type, icon: Icon, defaultValue = '' }) => {
  const [input, setInput] = useState(defaultValue);
  const [isValid, setIsValid] = useState(false);

  const validateInput = useCallback((value) => {
    if (type === 'doi') {
      return DOI_REGEX.test(value) || extractDOI(value) !== null;
    }
    return isValidURL(value);
  }, [type]);

  // Update input when defaultValue changes
  useEffect(() => {
    if (defaultValue && input === '') {
      setInput(defaultValue);
      setIsValid(validateInput(defaultValue));
    }
  }, [defaultValue, validateInput]);

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
        color: '#ff6b35',
        desc: 'Digital Object Identifier'
      };
    } else if (uri.startsWith('pubmed:')) {
      return {
        type: 'PubMed',
        display: uri.replace('pubmed:', ''),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uri.replace('pubmed:', '')}`,
        color: '#0066cc',
        desc: 'PubMed record'
      };
    } else if (uri.startsWith('wd:')) {
      return {
        type: 'Wikidata',
        display: uri.replace('wd:', ''),
        url: `https://www.wikidata.org/wiki/${uri.replace('wd:', '')}`,
        color: '#339966',
        desc: 'Structured data from Wikidata'
      };
    } else if (uri.includes('wikipedia.org')) {
      const last = uri.split('/').pop();
      const pretty = last ? decodeURIComponent(last).replace(/_/g, ' ') : 'Wikipedia Article';
      return {
        type: 'Wikipedia',
        display: pretty,
        url: uri,
        color: '#000000',
        desc: 'Wikipedia article'
      };
    } else if (uri.includes('arxiv.org')) {
      return {
        type: 'arXiv',
        display: uri.split('/').pop(),
        url: uri,
        color: '#b31b1b',
        desc: 'arXiv preprint'
      };
    } else {
      return {
        type: 'URL',
        display: uri.replace(/^https?:\/\//, '').substring(0, 40) + '...',
        url: uri,
        color: '#666',
        desc: undefined
      };
    }
  };

  const { type, display, url, color, desc } = getDisplayInfo(link);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 10px',
      border: `1px solid ${color}`,
      borderRadius: '8px',
      marginBottom: '6px',
      minWidth: 0
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
          fontSize: '12px',
          color: '#333',
          fontFamily: "'EmOne', sans-serif",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {display}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={() => window.open(url, '_blank')}
          style={{
            width: '28px',
            height: '28px',
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
            width: '28px',
            height: '28px',
            border: 'none',
            backgroundColor: '#8B0000',
            color: '#EFE8E5',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            maxHeight: '28px'
          }}
          title="Remove link"
        >
          <span style={{ fontWeight: 'bold', fontSize: '16px' }}>×</span>
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
      // Use search API first for better semantic results
      const searchResponse = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/search?q=${encodeURIComponent(searchTerm)}&limit=10`
      );
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.pages && searchData.pages.length > 0) {
          setResults(searchData.pages);
        } else {
          // If no search results, try exact page match as fallback
          const exactResponse = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTerm)}`
          );
          
          if (exactResponse.ok) {
            const data = await exactResponse.json();
            setResults([{
              title: data.title,
              description: data.extract,
              url: data.content_urls.desktop.page,
              thumbnail: data.thumbnail?.source
            }]);
          } else {
            setResults([]);
          }
        }
      } else {
        setResults([]);
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
      marginBottom: '12px'
    }}>
      <div style={{ 
        margin: '0 0 6px 0', 
        fontSize: '12px', 
        color: '#260000',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <Tags size={12} />
        <span style={{ fontWeight: 'bold' }}>RDF Schema</span>
      </div>

      {/* Show auto-synced RDF properties */}
      <div style={{
        fontSize: '12px',
        marginBottom: '8px'
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
      <div style={{ marginBottom: '10px', marginLeft: '8px', marginRight: '24px' }}>
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
            width: '100%',
            padding: '6px 8px',
            border: '1px solid #8B0000',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: "'EmOne', sans-serif",
            backgroundColor: 'transparent'
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

const SemanticEditor = ({ nodeData, onUpdate, isUltraSlim = false }) => {
  const [enrichmentState, setEnrichmentState] = useState({
    isEnriching: false,
    progress: {},
    results: null,
    error: null
  });
  const [resolvedData, setResolvedData] = useState(new Map());
  const [federationState, setFederationState] = useState({
    isImporting: false,
    progress: { stage: '', entity: '', level: 0 },
    results: null,
    error: null
  });
  const [externalType, setExternalType] = useState('doi'); // 'doi' | 'wikipedia' | 'url'
  const [showAdvanced, setShowAdvanced] = useState(false);


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

  // Handle semantic web enrichment
  const handleEnrichFromSemanticWeb = async () => {
    if (!nodeData?.name) return;
    
    setEnrichmentState({
      isEnriching: true,
      progress: {
        wikidata: 'pending',
        dbpedia: 'pending',
        wikipedia: 'pending'
      },
      results: null,
      error: null
    });

    try {
      // Update progress as we go
      setEnrichmentState(prev => ({
        ...prev,
        progress: { 
          wikidata: 'active', 
          dbpedia: 'pending', 
          wikipedia: 'pending' 
        }
      }));
      
      // Use our fast semantic web enrichment for immediate results
      const enrichmentResults = await fastEnrichFromSemanticWeb(nodeData.name, { timeout: 15000 });
      
      // Update progress to show completion
      setEnrichmentState(prev => ({
        ...prev,
        progress: {
          wikidata: enrichmentResults.sources.wikidata?.found ? 'completed' : 'failed',
          dbpedia: enrichmentResults.sources.dbpedia?.found ? 'completed' : 'failed',
          wikipedia: enrichmentResults.sources.wikipedia?.found ? 'completed' : 'failed'
        }
      }));
      
      // Set final results
      setEnrichmentState({
        isEnriching: false,
        progress: {},
        results: enrichmentResults.suggestions,
        error: null
      });

      // Auto-import when confidence >= 0.8
      try {
        const conf = Number(enrichmentResults?.suggestions?.confidence || 0);
        if (conf >= 0.8) {
          const updates = { ...nodeData };
          // Apply description if absent
          if (!updates.description && enrichmentResults.suggestions.description) {
            updates.description = enrichmentResults.suggestions.description;
          }
          // Merge external links
          if (Array.isArray(enrichmentResults.suggestions.externalLinks) && enrichmentResults.suggestions.externalLinks.length > 0) {
            const existing = new Set((updates.externalLinks || []));
            enrichmentResults.suggestions.externalLinks.forEach(l => existing.add(l));
            updates.externalLinks = Array.from(existing);
          }
          // Merge equivalent classes if provided
          if (Array.isArray(enrichmentResults.suggestions.equivalentClasses) && enrichmentResults.suggestions.equivalentClasses.length > 0) {
            const prev = Array.isArray(updates.equivalentClasses) ? updates.equivalentClasses : [];
            const merged = [...prev, ...enrichmentResults.suggestions.equivalentClasses];
            updates.equivalentClasses = merged;
          }
          onUpdate(updates);
        }
      } catch (e) {
        // Swallow auto-import errors silently but log
        console.warn('[SemanticEditor] Auto-import at 80% failed:', e);
      }
      
    } catch (error) {
      console.error('[SemanticEditor] Enrichment failed:', error);
      setEnrichmentState({
        isEnriching: false,
        progress: {},
        results: null,
        error: error.message
      });
    }
  };


  // Resolve external links to RDF data
  const resolveExternalLinks = async () => {
    const resolved = new Map();
    
    for (const link of externalLinks) {
      try {
        const rdfData = await rdfResolver.resolveURI(link, { timeout: 10000 });
        if (rdfData) {
          resolved.set(link, rdfData);
        }
      } catch (error) {
        console.warn(`Failed to resolve ${link}:`, error);
      }
    }
    
    setResolvedData(resolved);
    return resolved;
  };


  // Apply a suggestion to the node
  const applySuggestion = (type, value) => {
    if (type === 'externalLink') {
      addExternalLink(value);
    } else if (type === 'description' && !nodeData.description) {
      onUpdate({ ...nodeData, description: value });
    } else if (type === 'equivalentClass') {
      const updatedClasses = [...(nodeData.equivalentClasses || []), value];
      onUpdate({ ...nodeData, equivalentClasses: updatedClasses });
    }
  };

  // Handle mass knowledge import
  const handleMassImport = async () => {
    if (!nodeData?.name) return;
    
    setFederationState({
      isImporting: true,
      progress: { stage: 'initializing', entity: nodeData.name, level: 0 },
      results: null,
      error: null
    });

    try {
      const results = await knowledgeFederation.importKnowledgeCluster(
        nodeData.name,
        {
          maxDepth: 2,
          maxEntitiesPerLevel: 8,
          includeRelationships: true,
          includeSources: ['wikidata', 'dbpedia'],
          onProgress: (progressData) => {
            setFederationState(prev => ({
              ...prev,
              progress: progressData
            }));
          }
        }
      );

      setFederationState({
        isImporting: false,
        progress: { stage: 'complete', entity: '', level: 0 },
        results: results,
        error: null
      });

      console.log(`[SemanticEditor] Mass import completed: ${results.totalEntities} entities, ${results.totalRelationships} relationships`);
      
    } catch (error) {
      console.error('[SemanticEditor] Mass import failed:', error);
      setFederationState({
        isImporting: false,
        progress: { stage: 'failed', entity: '', level: 0 },
        results: null,
        error: error.message
      });
    }
  };


  return (
    <div style={{ 
      padding: '0 0 10px 0', 
      fontFamily: "'EmOne', sans-serif"
    }}>
      <div style={{
        margin: '0 0 10px 0',
        color: '#260000',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={16} />
          <span style={{ fontWeight: 'bold' }}>Semantic Web</span>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            padding: '4px 8px',
            border: '1px solid #8B0000',
            borderRadius: '6px',
            background: 'transparent',
            color: '#8B0000',
            fontSize: '10px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          {showAdvanced ? 'Advanced — On' : 'Advanced'}
        </button>
      </div>

      {/* Semantic Profile */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          margin: '0 0 6px 0',
          fontSize: '12px',
          color: '#260000',
          fontWeight: 'bold'
        }}>
          Semantic Profile
        </div>
      </div>

      {/* RDF Schema Properties Section */}
      <RDFSchemaPropertiesSection 
        nodeData={nodeData} 
        onUpdate={onUpdate} 
      />

      <StandardDivider margin="15px 0" />

      {/* External Links Section (Rosetta Stone) */}
      <div style={{ 
        marginBottom: '16px'
      }}>
        <div style={{ 
          margin: '0 0 8px 0', 
          fontSize: '12px', 
          color: '#260000',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Link size={12} />
          <span style={{ fontWeight: 'bold' }}>External References (owl:sameAs)</span>
        </div>

        {/* Unified reference input */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
          <select
            value={externalType}
            onChange={(e) => setExternalType(e.target.value)}
            style={{
              padding: '6px 8px',
              border: '1px solid #8B0000',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#260000'
            }}
          >
            <option value="doi">DOI</option>
            <option value="wikipedia">Wikipedia</option>
            <option value="url">Other URL</option>
          </select>
          <SemanticLinkInput
            onAdd={addExternalLink}
            placeholder={externalType === 'doi' ? '10.1000/182 or https://doi.org/10.1000/182' : (externalType === 'wikipedia' ? 'https://en.wikipedia.org/wiki/...' : 'https://example.com/resource')}
            type={externalType === 'doi' ? 'doi' : 'url'}
            icon={externalType === 'doi' ? Book : ExternalLink}
          />
        </div>

        {/* Display existing links */}
        {externalLinks.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <h5 style={{ 
              margin: '0 0 6px 0', 
              fontSize: '12px', 
              color: '#666'
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

        {/* Semantic Web Actions */}
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <button
              onClick={handleEnrichFromSemanticWeb}
              disabled={enrichmentState.isEnriching}
              style={{
                backgroundColor: enrichmentState.isEnriching ? '#666' : '#8B0000',
                color: '#EFE8E5',
                border: 'none',
                padding: '6px 10px',
                borderRadius: '4px',
                cursor: enrichmentState.isEnriching ? 'not-allowed' : 'pointer',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 'bold'
              }}
              onMouseEnter={(e) => !enrichmentState.isEnriching && (e.currentTarget.style.backgroundColor = '#A52A2A')}
              onMouseLeave={(e) => !enrichmentState.isEnriching && (e.currentTarget.style.backgroundColor = '#8B0000')}
              title="Enrich from semantic web (Wikidata, DBpedia)"
            >
              {enrichmentState.isEnriching ? <Loader2 size={14} style={{animation: 'spin 1s linear infinite'}} /> : <Zap size={14} />}
              {enrichmentState.isEnriching ? 'Enriching...' : 'Enrich from Web'}
            </button>
            
            {showAdvanced && (
            <button
              onClick={handleMassImport}
              disabled={enrichmentState.isEnriching || federationState.isImporting}
              style={{
                backgroundColor: (enrichmentState.isEnriching || federationState.isImporting) ? '#666' : '#4B0082',
                color: '#EFE8E5',
                border: 'none',
                padding: '6px 10px',
                borderRadius: '4px',
                cursor: (enrichmentState.isEnriching || federationState.isImporting) ? 'not-allowed' : 'pointer',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 'bold'
              }}
              onMouseEnter={(e) => !(enrichmentState.isEnriching || federationState.isImporting) && (e.currentTarget.style.backgroundColor = '#6A0DAD')}
              onMouseLeave={(e) => !(enrichmentState.isEnriching || federationState.isImporting) && (e.currentTarget.style.backgroundColor = '#4B0082')}
              title="Import entire knowledge cluster (entities + relationships)"
            >
              {federationState.isImporting ? <Loader2 size={14} style={{animation: 'spin 1s linear infinite'}} /> : <Globe size={14} />}
              {federationState.isImporting ? 'Importing...' : 'Mass Import'}
            </button>
            )}
            
            {showAdvanced && externalLinks.length > 0 && (
              <button
                onClick={resolveExternalLinks}
                disabled={enrichmentState.isEnriching}
                style={{
                  backgroundColor: enrichmentState.isEnriching ? '#666' : '#2E8B57',
                  color: '#EFE8E5',
                  border: 'none',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  cursor: enrichmentState.isEnriching ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 'bold'
                }}
                onMouseEnter={(e) => !enrichmentState.isEnriching && (e.currentTarget.style.backgroundColor = '#3CB371')}
                onMouseLeave={(e) => !enrichmentState.isEnriching && (e.currentTarget.style.backgroundColor = '#2E8B57')}
                title="Resolve external links to RDF data"
              >
                <RotateCcw size={14} />
                Resolve Links
              </button>
            )}
          </div>

          {/* Optional Wikipedia helper under Advanced */}
          {showAdvanced && (
            <div style={{ marginTop: '6px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Wikipedia Helper</label>
              <WikipediaSearch onSelect={addExternalLink} />
            </div>
          )}

          {/* Progress Display */}
          {enrichmentState.isEnriching && (
            <div style={{ 
              fontSize: '11px', 
              color: '#666'
            }}>
              <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Enriching from semantic web...</div>
              {Object.entries(enrichmentState.progress).map(([source, status]) => (
                <div key={source} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  {status === 'pending' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ccc' }} />}
                  {status === 'active' && <Loader2 size={8} style={{ color: '#8B0000', animation: 'spin 1s linear infinite' }} />}
                  {status === 'completed' && <CheckSquare size={8} style={{ color: '#2E8B57' }} />}
                  <span>{source.replace('_', ' ')}...</span>
                </div>
              ))}
            </div>
          )}

          {/* Error Display */}
          {enrichmentState.error && (
            <div style={{
              fontSize: '11px',
              color: '#dc3545',
              padding: '8px',
              backgroundColor: 'rgba(220, 53, 69, 0.1)',
              borderRadius: '4px',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <AlertCircle size={12} />
              {enrichmentState.error}
            </div>
          )}

          {/* Results and Suggestions */}
          {enrichmentState.results && (
            <div style={{
              fontSize: '12px'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#8B0000' }}>Enrichment Suggestions:</div>
              
              {enrichmentState.results.description && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Description:</div>
                  <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                    {enrichmentState.results.description}
                  </div>
                  {!nodeData.description && (
                    <button
                      onClick={() => applySuggestion('description', enrichmentState.results.description)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        backgroundColor: '#2E8B57',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Apply Description
                    </button>
                  )}
                </div>
              )}
              
              {enrichmentState.results.externalLinks.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>External Links:</div>
                  {enrichmentState.results.externalLinks.map((link, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <code style={{ fontSize: '10px', padding: '2px 4px', borderRadius: '2px', background: 'rgba(0,0,0,0.05)' }}>
                        {link.substring(0, 50)}...
                      </code>
                      <button
                        onClick={() => applySuggestion('externalLink', link)}
                        style={{
                          padding: '2px 6px',
                          fontSize: '9px',
                          backgroundColor: '#2E8B57',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {enrichmentState.results.equivalentClasses.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Classifications:</div>
                  {enrichmentState.results.equivalentClasses.map((cls, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px' }}>{cls.label}</span>
                      <span style={{ fontSize: '9px', color: '#666' }}>({cls.source})</span>
                      <button
                        onClick={() => applySuggestion('equivalentClass', cls)}
                        style={{
                          padding: '2px 6px',
                          fontSize: '9px',
                          backgroundColor: '#2E8B57',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div style={{ fontSize: '10px', color: '#666', marginTop: '8px' }}>Confidence: {(enrichmentState.results.confidence * 100).toFixed(0)}%</div>
            </div>
          )}
        </div>
      </div>

      <StandardDivider margin="20px 0" />

      {/* Mass Import Progress */}
      {federationState.isImporting && (
        <div style={{
          marginBottom: '15px',
          padding: '12px',
          backgroundColor: '#EFE8E5',
          borderRadius: '6px',
          border: '1px solid #e0e0e0'
        }}>
          <div style={{ 
            fontSize: '12px', 
            color: '#4B0082',
            fontWeight: 'bold',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Mass Importing Knowledge Cluster...
          </div>
          <div style={{ fontSize: '11px', color: '#666' }}>
            Stage: {federationState.progress.stage}
            {federationState.progress.entity && ` | Entity: ${federationState.progress.entity}`}
            {federationState.progress.level > 0 && ` | Level: ${federationState.progress.level}`}
          </div>
        </div>
      )}

      {/* Mass Import Results */}
      {federationState.results && (
        <div style={{
          marginBottom: '15px',
          padding: '12px',
          backgroundColor: '#EFE8E5',
          borderRadius: '6px',
          border: '1px solid #e0e0e0'
        }}>
          <div style={{
            fontSize: '12px',
            color: '#4B0082',
            fontWeight: 'bold',
            marginBottom: '8px'
          }}>
            Knowledge Cluster Imported 🌐
          </div>
          <div style={{ fontSize: '11px', color: '#333', marginBottom: '6px' }}>
            <strong>{federationState.results.totalEntities}</strong> entities, <strong>{federationState.results.totalRelationships}</strong> relationships
          </div>
          <div style={{ fontSize: '10px', color: '#666' }}>
            Sources: {Object.entries(federationState.results.sourceBreakdown).map(([source, count]) => `${source}: ${count}`).join(', ')}
          </div>
          <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
            Clusters: {federationState.results.clusters.size}
          </div>
        </div>
      )}

      
      {/* Semantic Classification Section */}
      <SemanticClassificationSection 
        nodeData={nodeData} 
        onUpdate={onUpdate}
      />

      {/* Resolved RDF Data Display */}
      {resolvedData.size > 0 && (
        <div style={{
          marginTop: '15px',
          padding: '12px',
          backgroundColor: '#EFE8E5',
          borderRadius: '6px',
          border: '1px solid #e0e0e0'
        }}>
          <h5 style={{
            margin: '0 0 10px 0',
            fontSize: '12px',
            color: '#8B0000',
            fontWeight: 'bold'
          }}>
            Resolved RDF Data ({resolvedData.size})
          </h5>
          {Array.from(resolvedData.entries()).map(([link, data], idx) => (
            <div key={idx} style={{
              marginBottom: '8px',
              padding: '6px',
              backgroundColor: '#bdb5b5',
              borderRadius: '4px',
              fontSize: '11px'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                {data.label || 'Unknown Resource'}
              </div>
              {data.description && (
                <div style={{ color: '#666', marginBottom: '4px' }}>
                  {data.description}
                </div>
              )}
              <div style={{ fontSize: '10px', color: '#8B0000' }}>Source: {link}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SemanticEditor;