import React, { useState, useCallback } from 'react';
import { Globe, Link, Book, Search, ExternalLink, Plus, X, Check } from 'lucide-react';

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
      <Icon size={16} style={{ color: '#666' }} />
      <input
        type="text"
        value={input}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '6px 8px',
          border: `1px solid ${isValid ? '#28a745' : input ? '#dc3545' : '#ccc'}`,
          borderRadius: '4px',
          fontSize: '14px',
          fontFamily: "'EmOne', sans-serif"
        }}
      />
      <button
        onClick={handleAdd}
        disabled={!isValid}
        style={{
          padding: '6px 8px',
          border: 'none',
          borderRadius: '4px',
          backgroundColor: isValid ? '#28a745' : '#ccc',
          color: 'white',
          cursor: isValid ? 'pointer' : 'not-allowed',
          fontSize: '12px'
        }}
      >
        <Plus size={14} />
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
      backgroundColor: '#f8f9fa',
      border: `1px solid ${color}`,
      borderRadius: '6px',
      marginBottom: '6px'
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
            backgroundColor: 'transparent',
            cursor: 'pointer',
            color: '#dc3545'
          }}
          title="Remove link"
        >
          <X size={14} />
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

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <Search size={16} style={{ color: '#666' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Search Wikipedia..."
          style={{
            flex: 1,
            padding: '6px 8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: "'EmOne', sans-serif"
          }}
        />
        <button
          onClick={() => searchWikipedia(query)}
          disabled={loading || !query.trim()}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '12px'
          }}
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {results.map((result, index) => (
            <div
              key={index}
              onClick={() => onSelect(result.url || `https://en.wikipedia.org/wiki/${result.title}`)}
              style={{
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '6px',
                cursor: 'pointer',
                backgroundColor: '#f8f9fa'
              }}
            >
              <div style={{
                fontWeight: 'bold',
                fontSize: '14px',
                marginBottom: '4px'
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
          ))}
        </div>
      )}
    </div>
  );
};

const SemanticEditor = ({ nodeData, onUpdate }) => {
  if (!nodeData) return null;

  const externalLinks = nodeData.externalLinks || [];
  const equivalentClasses = nodeData.equivalentClasses || [];

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

  const addEquivalentClass = (uri) => {
    const updatedClasses = [...equivalentClasses, { "@id": uri }];
    onUpdate({
      ...nodeData,
      equivalentClasses: updatedClasses
    });
  };

  return (
    <div style={{ padding: '15px', fontFamily: "'EmOne', sans-serif" }}>
      <h3 style={{
        margin: '0 0 15px 0',
        color: '#333',
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <Globe size={18} />
        Semantic Web Links
      </h3>

      {/* External Links Section */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ 
          margin: '0 0 10px 0', 
          fontSize: '14px', 
          color: '#555',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Link size={14} />
          External References
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
      </div>

      {/* Abstraction Relationships Section */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <h4 style={{ 
          margin: '0 0 10px 0', 
          fontSize: '14px', 
          color: '#555',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Search size={14} />
          Semantic Classification
        </h4>

        <div style={{
          padding: '10px',
          backgroundColor: '#f8f9fa',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#666',
          fontStyle: 'italic'
        }}>
          Abstraction Carousel integration with external ontologies coming soon...
        </div>

        {/* Future: AbstractionCarousel with external mappings */}
        {/* {nodeData.abstractionChains && (
          <SemanticAbstractionCarousel 
            node={nodeData}
            onChainUpdate={(chains) => onUpdate({...nodeData, abstractionChains: chains})}
            onExternalMapping={(mapping) => addEquivalentClass(mapping)}
          />
        )} */}
      </div>
    </div>
  );
};

export default SemanticEditor;