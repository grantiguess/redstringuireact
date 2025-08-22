import React from 'react';
import { Info, Palette, ArrowUpFromDot, ImagePlus, LayoutGrid } from 'lucide-react';
import { NODE_CORNER_RADIUS, NODE_DEFAULT_COLOR } from '../../constants.js';
import CollapsibleSection from '../CollapsibleSection.jsx';
import SemanticEditor from '../SemanticEditor.jsx';

/**
 * Shared content component used by both home and node tabs
 * Provides consistent layout and functionality across panel types
 */
const SharedPanelContent = ({
  // Core data
  nodeData,
  graphData,
  activeGraphNodes = [],
  
  // Actions
  onNodeUpdate,
  onImageAdd,
  onColorChange,
  onOpenNode,
  onExpandNode,
  onNavigateDefinition,
  
  // UI state
  isUltraSlim = false,
  showExpandButton = true,
  
  // Type determination
  isHomeTab = false
}) => {
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
          color="#260000"
          style={{ cursor: 'pointer', flexShrink: 0 }}
          onClick={onExpandNode}
          title="Expand definition"
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
        <div style={{
          backgroundColor: nodeData.color || NODE_DEFAULT_COLOR,
          borderRadius: NODE_CORNER_RADIUS,
          padding: '8px 12px',
          maxWidth: '200px',
          overflow: 'hidden'
        }}>
          <span style={{
            color: '#bdb5b5',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            fontFamily: "'EmOne', sans-serif",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {nodeData.name || 'Untitled'}
          </span>
        </div>
        
        {!isUltraSlim && actionButtons}
      </div>

      {isUltraSlim && (
        <div style={{ marginTop: '12px' }}>
          {actionButtons}
        </div>
      )}

      {/* Bio Section */}
      <CollapsibleSection 
        title="Bio" 
        defaultExpanded={true}
        icon={Info}
      >
        <textarea
          value={nodeData.description || ''}
          onChange={(e) => onNodeUpdate({ ...nodeData, description: e.target.value })}
          placeholder="Add a description..."
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: "'EmOne', sans-serif",
            resize: 'vertical'
          }}
        />
      </CollapsibleSection>

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

      {/* Components Section */}
      <CollapsibleSection 
        title="Components" 
        count={activeGraphNodes.length}
        defaultExpanded={true}
        icon={LayoutGrid}
      >
        {activeGraphNodes.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            {activeGraphNodes.map((node) => (
              <div
                key={node.id}
                style={{
                  backgroundColor: node.color || NODE_DEFAULT_COLOR,
                  borderRadius: NODE_CORNER_RADIUS,
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '0 5px',
                  overflow: 'hidden'
                }}
                title={node.name}
                onClick={() => onOpenNode(node.id)}
              >
                <span style={{
                  color: '#bdb5b5',
                  fontSize: '0.8rem',
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  padding: '0 10px',
                  boxSizing: 'border-box',
                  userSelect: 'none',
                  fontFamily: "'EmOne', sans-serif"
                }}>
                  {node.name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ 
            color: '#666', 
            fontSize: '0.9rem', 
            fontFamily: "'EmOne', sans-serif",
            textAlign: 'center',
            padding: '20px 0'
          }}>
            No components in this {isHomeTab ? 'graph' : 'definition'}.
          </div>
        )}
      </CollapsibleSection>

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