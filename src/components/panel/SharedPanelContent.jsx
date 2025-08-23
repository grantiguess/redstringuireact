import React, { useState, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { Palette, ArrowUpFromDot, ImagePlus } from 'lucide-react';
import { NODE_CORNER_RADIUS, NODE_DEFAULT_COLOR } from '../../constants.js';
import CollapsibleSection from '../CollapsibleSection.jsx';
import SemanticEditor from '../SemanticEditor.jsx';
import StandardDivider from '../StandardDivider.jsx';

// Helper function to determine the correct article ("a" or "an")
const getArticleFor = (word) => {
  if (!word) return 'a';
  const firstLetter = word.trim()[0].toLowerCase();
  return ['a', 'e', 'i', 'o', 'u'].includes(firstLetter) ? 'an' : 'a';
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

      {/* Dividing line above Type section */}
      <StandardDivider margin="20px 0" />
      
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

      {/* Dividing line above Semantic Web Integration section */}
      <StandardDivider margin="20px 0" />
      
      {/* Semantic Web Integration */}
      <CollapsibleSection 
        title="Semantic Web Links" 
        defaultExpanded={false}
      >
        <SemanticEditor 
          nodeData={nodeData}
          onUpdate={onNodeUpdate}
        />
      </CollapsibleSection>
    </div>
  );
};

export default SharedPanelContent;