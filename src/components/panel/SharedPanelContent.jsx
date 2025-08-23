import React, { useState, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { Palette, ArrowUpFromDot, ImagePlus, BookOpen, ExternalLink } from 'lucide-react';
import { NODE_CORNER_RADIUS, NODE_DEFAULT_COLOR } from '../../constants.js';
import CollapsibleSection from '../CollapsibleSection.jsx';
import SemanticEditor from '../SemanticEditor.jsx';
import ConnectionBrowser from '../ConnectionBrowser.jsx';
import StandardDivider from '../StandardDivider.jsx';

// Helper function to determine the correct article ("a" or "an")
const getArticleFor = (word) => {
  if (!word) return 'a';
  const firstLetter = word.trim()[0].toLowerCase();
  return ['a', 'e', 'i', 'o', 'u'].includes(firstLetter) ? 'an' : 'a';
};

// Wikipedia enrichment functions
const searchWikipedia = async (query) => {
  try {
    // First try to get the exact page
    const summaryResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      { 
        headers: { 
          'Api-User-Agent': 'Redstring/1.0 (https://redstring.ai) Claude/1.0' 
        }
      }
    );

    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json();
      return {
        type: 'direct',
        page: {
          title: summaryData.title,
          description: summaryData.extract || summaryData.description,
          url: summaryData.content_urls?.desktop?.page,
          thumbnail: summaryData.thumbnail?.source
        }
      };
    }

    // If direct lookup fails, search for similar pages
    const searchResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=5`,
      { 
        headers: { 
          'Api-User-Agent': 'Redstring/1.0 (https://redstring.ai) Claude/1.0' 
        }
      }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData.query?.search?.length > 0) {
        return {
          type: 'disambiguation',
          options: searchData.query.search.map(result => ({
            title: result.title,
            snippet: result.snippet.replace(/<[^>]*>/g, ''), // Remove HTML tags
            pageid: result.pageid
          }))
        };
      }
    }
  } catch (error) {
    console.warn('[Wikipedia] Search failed:', error);
  }
  
  return { type: 'not_found' };
};

const getWikipediaPage = async (title) => {
  try {
    // Check if this is a section link (contains #)
    const [pageTitle, sectionId] = title.includes('#') ? title.split('#') : [title, null];
    
    const summaryResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`,
      { 
        headers: { 
          'Api-User-Agent': 'Redstring/1.0 (https://redstring.ai) Claude/1.0' 
        }
      }
    );

    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json();
      let description = summaryData.extract || summaryData.description;
      let pageUrl = summaryData.content_urls?.desktop?.page;
      
      // If this is a section link, try to get section-specific content
      if (sectionId) {
        try {
          const sectionContent = await getWikipediaSection(pageTitle, sectionId);
          if (sectionContent) {
            description = sectionContent;
          }
          // Add section fragment to URL
          if (pageUrl) {
            pageUrl += '#' + sectionId;
          }
        } catch (error) {
          console.warn('[Wikipedia] Section content fetch failed, using page summary:', error);
        }
      }
      
      return {
        title: summaryData.title,
        description: description,
        url: pageUrl,
        thumbnail: summaryData.thumbnail?.source,
        isSection: !!sectionId,
        sectionId: sectionId
      };
    }
  } catch (error) {
    console.warn('[Wikipedia] Page fetch failed:', error);
  }
  
  return null;
};

const getWikipediaSection = async (pageTitle, sectionId) => {
  try {
    // Get full page content to extract section
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&format=json&origin=*&section=${encodeURIComponent(sectionId)}`,
      { 
        headers: { 
          'Api-User-Agent': 'Redstring/1.0 (https://redstring.ai) Claude/1.0' 
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.parse?.text?.['*']) {
        // Extract first paragraph from HTML content
        const htmlContent = data.parse.text['*'];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        // Find first paragraph with substantial content
        const paragraphs = tempDiv.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent.trim();
          if (text.length > 100) { // Minimum length for substantial content
            return text;
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Wikipedia] Section parsing failed:', error);
  }
  
  return null;
};

// Wikipedia Enrichment Component
const WikipediaEnrichment = ({ nodeData, onUpdateNode }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [showDisambiguation, setShowDisambiguation] = useState(false);

  const handleWikipediaSearch = async () => {
    setIsSearching(true);
    try {
      const result = await searchWikipedia(nodeData.name);
      setSearchResult(result);
      
      if (result.type === 'direct') {
        // Directly apply the Wikipedia data
        await applyWikipediaData(result.page);
      } else if (result.type === 'disambiguation') {
        setShowDisambiguation(true);
      }
    } catch (error) {
      console.error('[Wikipedia] Enrichment failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const applyWikipediaData = async (pageData) => {
    const updates = {};
    
    // Add description if node doesn't have one
    if (!nodeData.description && pageData.description) {
      updates.description = pageData.description;
    }
    
    // Add Wikipedia metadata
    updates.semanticMetadata = {
      ...nodeData.semanticMetadata,
      wikipediaUrl: pageData.url,
      wikipediaTitle: pageData.title,
      wikipediaEnriched: true,
      wikipediaEnrichedAt: new Date().toISOString()
    };

    if (pageData.thumbnail) {
      updates.semanticMetadata.wikipediaThumbnail = pageData.thumbnail;
    }

    // Add Wikipedia link to external links (stored directly on nodeData.externalLinks)
    const currentExternalLinks = nodeData.externalLinks || [];
    
    // Check if Wikipedia link already exists
    const hasWikipediaLink = currentExternalLinks.some(link => 
      typeof link === 'string' ? 
        link.includes('wikipedia.org') : 
        link.url?.includes('wikipedia.org')
    );
    
    if (!hasWikipediaLink && pageData.url) {
      // Add the Wikipedia URL directly to the externalLinks array
      updates.externalLinks = [pageData.url, ...currentExternalLinks];
    }

    await onUpdateNode(updates);
    setSearchResult(null);
    setShowDisambiguation(false);
  };

  const handleDisambiguationSelect = async (option) => {
    setIsSearching(true);
    try {
      const pageData = await getWikipediaPage(option.title);
      if (pageData) {
        await applyWikipediaData(pageData);
      }
    } catch (error) {
      console.error('[Wikipedia] Disambiguation selection failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Show the enrichment button only if node has no description or no Wikipedia link
  const showEnrichButton = !nodeData.description || !nodeData.semanticMetadata?.wikipediaUrl;
  const isAlreadyLinked = nodeData.semanticMetadata?.wikipediaUrl;

  if (!showEnrichButton && !showDisambiguation) return null;

  return (
    <div style={{ margin: '12px 0' }}>
      {showEnrichButton && (
        <button
          onClick={handleWikipediaSearch}
          disabled={isSearching}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            border: '1px solid #8B0000',
            borderRadius: '6px',
            background: 'transparent',
            color: '#8B0000',
            fontFamily: "'EmOne', sans-serif",
            fontSize: '11px',
            cursor: isSearching ? 'wait' : 'pointer',
            fontWeight: 'bold',
            textAlign: 'left'
          }}
        >
          <BookOpen size={12} />
          {isSearching ? 'Searching Wikipedia...' : 'Enrich from Wikipedia'}
        </button>
      )}

      {showDisambiguation && searchResult?.type === 'disambiguation' && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          border: '1px solid #8B0000',
          borderRadius: '6px',
          background: 'rgba(139,0,0,0.05)'
        }}>
          <div style={{
            fontSize: '11px',
            color: '#8B0000',
            fontFamily: "'EmOne', sans-serif",
            fontWeight: 'bold',
            marginBottom: '8px'
          }}>
            Multiple Wikipedia pages found:
          </div>
          {searchResult.options.slice(0, 3).map((option, index) => (
            <div
              key={index}
              onClick={() => handleDisambiguationSelect(option)}
              style={{
                padding: '6px',
                marginBottom: '4px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                background: 'white',
                fontSize: '10px',
                fontFamily: "'EmOne', sans-serif"
              }}
            >
              <div style={{ fontWeight: 'bold', color: '#8B0000', marginBottom: '2px' }}>
                {option.title}
              </div>
              <div style={{ color: '#666', lineHeight: '1.3' }}>
                {option.snippet}
              </div>
            </div>
          ))}
          <button
            onClick={() => setShowDisambiguation(false)}
            style={{
              marginTop: '6px',
              padding: '4px 8px',
              border: '1px solid #ccc',
              borderRadius: '3px',
              background: 'transparent',
              color: '#666',
              fontSize: '9px',
              cursor: 'pointer',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {isAlreadyLinked && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '8px',
          fontSize: '10px',
          color: '#8B0000',
          fontFamily: "'EmOne', sans-serif"
        }}>
          <BookOpen size={10} />
          <span>Wikipedia linked</span>
          <button
            onClick={() => window.open(nodeData.semanticMetadata.wikipediaUrl, '_blank')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '2px 4px',
              border: '1px solid #8B0000',
              borderRadius: '3px',
              background: 'transparent',
              color: '#8B0000',
              fontSize: '8px',
              cursor: 'pointer',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            <ExternalLink size={8} />
            View
          </button>
        </div>
      )}
    </div>
  );
};

// Item types for drag and drop
const ItemTypes = {
  SPAWNABLE_NODE: 'spawnable_node'
};

// Draggable node component
const DraggableNodeComponent = ({ node, onOpenNode }) => {
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: ItemTypes.SPAWNABLE_NODE,
    item: { 
      prototypeId: node.prototypeId || node.id, 
      nodeId: node.prototypeId || node.id, 
      nodeName: node.name, 
      nodeColor: node.color || NODE_DEFAULT_COLOR,
      fromPanel: true
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }), [node.prototypeId, node.id, node.name, node.color]);

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return (
    <div
      ref={drag}
      style={{
        position: 'relative',
        backgroundColor: node.color || NODE_DEFAULT_COLOR,
        color: '#bdb5b5',
        borderRadius: '12px',
        padding: '6px 6px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
        textAlign: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: "'EmOne', sans-serif",
        minHeight: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDragging ? 0.5 : 1,
        wordBreak: 'break-word',
        lineHeight: '1.2'
      }}
      title={node.name}
      onClick={() => onOpenNode(node.prototypeId || node.id)}
    >
      {node.name}
    </div>
  );
};

// Draggable title component - using same pattern as DraggableNodeComponent
const DraggableTitleComponent = ({ 
  nodeData, 
  isEditingTitle, 
  tempTitle, 
  onTempTitleChange, 
  onTitleDoubleClick, 
  onTitleKeyPress, 
  onTitleSave 
}) => {
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: ItemTypes.SPAWNABLE_NODE,
    item: { 
      prototypeId: nodeData.id, 
      nodeId: nodeData.id, 
      nodeName: nodeData.name, 
      nodeColor: nodeData.color || NODE_DEFAULT_COLOR,
      fromPanel: true
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }), [nodeData.id, nodeData.name, nodeData.color]);

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  if (isEditingTitle) {
    // When editing, make it look identical to non-editing state but with cursor
    return (
      <div style={{
        position: 'relative',
        backgroundColor: nodeData.color || NODE_DEFAULT_COLOR,
        color: '#bdb5b5',
        borderRadius: '12px',
        paddingTop: '10px',
        paddingBottom: '8px',
        paddingLeft: '12px',
        paddingRight: '12px',
        fontSize: '1.1rem',
        fontWeight: 'bold',
        textAlign: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: "'EmOne', sans-serif",
        minHeight: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '200px',
        width: 'fit-content'
      }}>
        <input
          type="text"
          value={tempTitle}
          onChange={(e) => onTempTitleChange(e.target.value)}
          onKeyDown={onTitleKeyPress}
          onBlur={onTitleSave}
          autoFocus
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#bdb5b5',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            fontFamily: "'EmOne', sans-serif",
            outline: 'none',
            width: `${Math.min(tempTitle.length * 0.7 + 2, 15)}ch`,
            maxWidth: '100%',
            padding: 0,
            textAlign: 'center',
            cursor: 'text'
          }}
        />
      </div>
    );
  }

  // When not editing, show draggable node - exactly like DraggableNodeComponent
  return (
    <div
      ref={drag}
      style={{
        position: 'relative',
        backgroundColor: nodeData.color || NODE_DEFAULT_COLOR,
        color: '#bdb5b5',
        borderRadius: '12px',
        paddingTop: '10px',
        paddingBottom: '8px',
        paddingLeft: '12px',
        paddingRight: '12px',
        fontSize: '1.1rem',
        fontWeight: 'bold',
        textAlign: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: "'EmOne', sans-serif",
        minHeight: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDragging ? 0.5 : 1,
        maxWidth: '200px',
        width: 'fit-content'
      }}
      title={nodeData.name}
      onDoubleClick={onTitleDoubleClick}
    >
      {nodeData.name || 'Untitled'}
    </div>
  );
};

/**
 * Shared content component used by both home and node tabs
 * Provides consistent layout and functionality across panel types
 */
const SharedPanelContent = ({
  // Core data
  nodeData,
  graphData,
  activeGraphNodes = [],
  nodePrototypes, // Add this to get type names
  
  // Actions
  onNodeUpdate,
  onImageAdd,
  onColorChange,
  onOpenNode,
  onExpandNode,
  onNavigateDefinition,
  onTypeSelect,
  onMaterializeConnection,
  
  // UI state
  isUltraSlim = false,
  showExpandButton = true,
  expandButtonDisabled = false,
  
  // Type determination
  isHomeTab = false
}) => {
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [tempBio, setTempBio] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');

  const handleBioDoubleClick = () => {
    setTempBio(nodeData.description || '');
    setIsEditingBio(true);
    // Trigger auto-resize after a short delay to ensure DOM is updated
    setTimeout(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight + 4, 40) + 'px';
      }
    }, 10);
  };

  const handleBioSave = () => {
    onNodeUpdate({ ...nodeData, description: tempBio });
    setIsEditingBio(false);
  };

  const handleBioCancel = () => {
    setIsEditingBio(false);
  };

  const handleBioKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBioSave();
    } else if (e.key === 'Escape') {
      handleBioCancel();
    }
  };

  const handleTitleDoubleClick = () => {
    setTempTitle(nodeData.name || '');
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    onNodeUpdate({ ...nodeData, name: tempTitle });
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
  };

  const handleTitleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  };

  if (!nodeData) {
    return (
      <div style={{ padding: '10px', color: '#aaa', fontFamily: "'EmOne', sans-serif" }}>
        No data available...
      </div>
    );
  }

  // Action buttons for header
  const actionButtons = (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px',
      flexWrap: isUltraSlim ? 'wrap' : 'nowrap'
    }}>
      <Palette
        size={20}
        color="#260000"
        style={{ cursor: 'pointer', flexShrink: 0 }}
        onClick={onColorChange}
        title="Change color"
      />
      {showExpandButton && (
        <ArrowUpFromDot
          size={20}
          color={expandButtonDisabled ? "#716C6C" : "#260000"}
          style={{ 
            cursor: expandButtonDisabled ? 'not-allowed' : 'pointer', 
            flexShrink: 0,
            opacity: expandButtonDisabled ? 0.5 : 1
          }}
          onClick={expandButtonDisabled ? undefined : onExpandNode}
          title={expandButtonDisabled ? "Cannot expand - this node defines the current graph" : "Expand definition"}
        />
      )}
      <ImagePlus
        size={20}
        color="#260000"
        style={{ cursor: 'pointer', flexShrink: 0 }}
        onClick={() => onImageAdd(nodeData.id)}
        title="Add image"
      />
    </div>
  );

  return (
    <div className="shared-panel-content">
      {/* Header Section */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '8px' 
      }}>
        <DraggableTitleComponent 
          nodeData={nodeData} 
          isEditingTitle={isEditingTitle}
          tempTitle={tempTitle}
          onTempTitleChange={setTempTitle}
          onTitleDoubleClick={handleTitleDoubleClick}
          onTitleKeyPress={handleTitleKeyPress}
          onTitleSave={handleTitleSave}
        />
        
        {!isUltraSlim && actionButtons}
      </div>

      {/* Type Section - under title */}
      {(() => {
        // Get the type name
        const typeName = nodeData.typeNodeId && nodePrototypes 
          ? nodePrototypes.get(nodeData.typeNodeId)?.name || 'Type'
          : 'Thing';
        
        return (
          <div style={{
            marginBottom: isUltraSlim ? '16px' : '12px'
          }}>
            {isUltraSlim ? (
              // Ultra slim layout: "Is a" on top, type button below, icons at bottom
              <>
                <div style={{
                  marginBottom: '6px',
                  minWidth: '120px',
                  whiteSpace: 'nowrap'
                }}>
                  <span style={{
                    fontSize: '0.9rem',
                    color: '#260000',
                    fontFamily: "'EmOne', sans-serif"
                  }}>
                    Is {getArticleFor(typeName)}
                  </span>
                </div>
                
                <div style={{
                  marginBottom: '12px'
                }}>
                  <button
                    onClick={() => onTypeSelect && onTypeSelect(nodeData.id)}
                    style={{
                      backgroundColor: '#8B0000',
                      color: '#bdb5b5',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '5px 8px 3px 8px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontFamily: "'EmOne', sans-serif",
                      outline: 'none'
                    }}
                  >
                    {typeName}
                  </button>
                </div>
                
                <div style={{ 
                  display: 'flex',
                  gap: '8px',
                  marginLeft: '2px'
                }}>
                  {actionButtons}
                </div>
              </>
            ) : (
              // Normal layout: "Is a" and type button inline
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                minWidth: '120px',
                whiteSpace: 'nowrap'
              }}>
                <span style={{
                  fontSize: '0.9rem',
                  color: '#260000',
                  fontFamily: "'EmOne', sans-serif"
                }}>
                  Is {getArticleFor(typeName)}
                </span>
                <button
                  onClick={() => onTypeSelect && onTypeSelect(nodeData.id)}
                  style={{
                    backgroundColor: '#8B0000',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '5px 8px 3px 8px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontFamily: "'EmOne', sans-serif",
                    outline: 'none',
                    marginLeft: '6px'
                  }}
                >
                  {typeName}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Dividing line above Bio section */}
      <StandardDivider margin="20px 0" />
      
      {/* Bio Section */}
      <CollapsibleSection 
        title="Bio" 
        defaultExpanded={true}
      >
        {isEditingBio ? (
          <div style={{ marginRight: '15px' }}>
            <textarea
              value={tempBio}
              onChange={(e) => setTempBio(e.target.value)}
              onKeyDown={handleBioKeyPress}
              onBlur={handleBioSave}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px 12px 12px',
                border: '3px solid #260000',
                borderRadius: '12px',
                fontSize: '1.0rem',
                fontFamily: "'EmOne', sans-serif",
                lineHeight: '1.4',
                backgroundColor: 'transparent',
                outline: 'none',
                color: '#260000',
                resize: 'none',
                minHeight: '40px',
                height: 'auto',
                overflow: 'hidden',
                boxSizing: 'border-box'
              }}
              rows={2}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.max(e.target.scrollHeight + 4, 40) + 'px';
              }}
            />
          </div>
        ) : (
          <div 
            onDoubleClick={handleBioDoubleClick}
            style={{
              marginRight: '15px',
              padding: '8px',
              fontSize: '1.0rem',
              fontFamily: "'EmOne', sans-serif",
              lineHeight: '1.4',
              color: nodeData.description ? '#260000' : '#999',
              cursor: 'pointer',
              borderRadius: '4px',
              minHeight: '20px',
              userSelect: 'text',
              textAlign: 'left'
            }}
            title="Double-click to edit"
          >
            {nodeData.description || 'Double-click to add a bio...'}
          </div>
        )}
      </CollapsibleSection>

      {/* Wikipedia Enrichment */}
      <WikipediaEnrichment 
        nodeData={nodeData}
        onUpdateNode={onNodeUpdate}
      />

      {/* Dividing line above Image section */}
      {nodeData.imageSrc && <StandardDivider margin="20px 0" />}
      
      {/* Image Section */}
      {nodeData.imageSrc && (
        <CollapsibleSection 
          title="Image" 
          defaultExpanded={true}
        >
          <div style={{
            width: '100%',
            overflow: 'hidden',
            borderRadius: '6px'
          }}>
            <img
              src={nodeData.imageSrc}
              alt={nodeData.name}
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: '6px'
              }}
            />
          </div>
        </CollapsibleSection>
      )}

      {/* Dividing line above Components section */}
      <StandardDivider margin="20px 0" />
      
      {/* Components Section */}
      <CollapsibleSection 
        title="Components" 
        count={activeGraphNodes.length}
        defaultExpanded={true}
      >
        {activeGraphNodes.length > 0 ? (
          <div style={{
            marginRight: '15px',
            display: 'grid',
            gridTemplateColumns: isUltraSlim ? '1fr' : '1fr 1fr',
            gap: '8px',
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            {activeGraphNodes.map((node) => (
              <DraggableNodeComponent
                key={node.id}
                node={node}
                onOpenNode={onOpenNode}
              />
            ))}
          </div>
        ) : (
          <div style={{ 
            marginRight: '15px',
            color: '#999', 
            fontSize: '0.9rem', 
            fontFamily: "'EmOne', sans-serif",
            textAlign: 'left',
            padding: '20px 0 20px 15px'
          }}>
            No components in this {isHomeTab ? 'graph' : 'definition'}.
          </div>
        )}
      </CollapsibleSection>

      {/* Dividing line above Connections section */}
      <StandardDivider margin="20px 0" />
      
      {/* Connections Section - Native Redstring connections */}
      <CollapsibleSection 
        title="Connections" 
        defaultExpanded={false}
      >
        <ConnectionBrowser 
          nodeData={nodeData}
          onMaterializeConnection={onMaterializeConnection}
        />
      </CollapsibleSection>

      {/* Dividing line above External Links section */}
      <StandardDivider margin="20px 0" />
      
      {/* External Links Section - SemanticEditor for Wikipedia/Wikidata links */}
      <CollapsibleSection 
        title="External Links" 
        defaultExpanded={false}
      >
        <SemanticEditor 
          nodeData={nodeData}
          onUpdate={onNodeUpdate}
        />
      </CollapsibleSection>

      {/* Show Semantic Profile if node has semantic metadata */}
      {nodeData.semanticMetadata && (
        <>
          <StandardDivider margin="20px 0" />
          <CollapsibleSection 
            title="Semantic Profile" 
            defaultExpanded={false}
          >
            <div className="semantic-profile">
              <div style={{ padding: '12px', fontSize: '11px', color: '#260000', fontFamily: "'EmOne', sans-serif" }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Source:</strong> {nodeData.semanticMetadata.source || 'Semantic Web'}
                </div>
                {nodeData.semanticMetadata.originalUri && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>URI:</strong> 
                    <a href={nodeData.semanticMetadata.originalUri} target="_blank" rel="noopener noreferrer" 
                       style={{ color: '#8B0000', marginLeft: '8px' }}>
                      View Original
                    </a>
                  </div>
                )}
                {nodeData.semanticMetadata.confidence && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Confidence:</strong> {Math.round(nodeData.semanticMetadata.confidence * 100)}%
                  </div>
                )}
                {nodeData.semanticMetadata.equivalentClasses?.length > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Equivalent Classes:</strong>
                    <div style={{ marginTop: '4px', fontSize: '10px' }}>
                      {nodeData.semanticMetadata.equivalentClasses.map((cls, idx) => (
                        <span key={idx} style={{ 
                          display: 'inline-block', 
                          margin: '2px', 
                          padding: '2px 6px', 
                          background: 'rgba(139,0,0,0.1)', 
                          borderRadius: '3px' 
                        }}>
                          {cls}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Show imported triplets/relationships */}
                {nodeData.semanticMetadata.relationships && nodeData.semanticMetadata.relationships.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <strong>Imported Relationships:</strong>
                    <div style={{ marginTop: '6px', fontSize: '10px' }}>
                      {nodeData.semanticMetadata.relationships.map((rel, idx) => (
                        <div key={idx} style={{
                          padding: '4px 6px',
                          margin: '2px 0',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid #333',
                          borderRadius: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <span style={{ fontWeight: 'bold', color: '#8B0000' }}>{rel.subject}</span>
                          <span style={{ color: '#666' }}>→</span>
                          <span style={{ fontStyle: 'italic', fontSize: '9px' }}>{rel.relation}</span>
                          <span style={{ color: '#666' }}>→</span>
                          <span style={{ fontWeight: 'bold', color: '#8B0000' }}>{rel.target}</span>
                          {rel.confidence && (
                            <span style={{ marginLeft: 'auto', fontSize: '8px', color: '#666' }}>
                              ({Math.round(rel.confidence * 100)}%)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
};

export default SharedPanelContent;