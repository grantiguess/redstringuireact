import React, { useEffect, useState, useMemo } from 'react';
import { Trash2, Plus, ArrowUpFromDot, ArrowRight, ChevronLeft, ChevronRight, PackageOpen, Layers, Edit3, Bookmark, Palette, MoreHorizontal, Group, Ungroup } from 'lucide-react';
import UniversalNodeRenderer from './UniversalNodeRenderer';
import { RENDERER_PRESETS } from './UniversalNodeRenderer.presets';
import './UnifiedBottomControlPanel.css';

// Small helper to render a triangle cap (rounded-ish via strokeJoin/lineJoin aesthetics)
const TriangleCap = ({ direction = 'left', color = '#bdb5b5', variant = 'ghost', onClick }) => {
  // Ensure arrows face OUTWARD from the center rail on the X axis
  // Left cap should point LEFT; Right cap should point RIGHT
  const pointsLeftFacing = '2,11 20,2 20,20';
  const pointsRightFacing = '20,11 2,2 2,20';
  const points = direction === 'left' ? pointsLeftFacing : pointsRightFacing;
  const className = `predicate-arrow ${variant === 'ghost' ? 'ghost' : 'solid'}`;
  return (
    <svg className={className} viewBox="0 0 22 22" style={{ color }} onClick={onClick}>
      <polygon points={points} fill={variant === 'ghost' ? 'none' : color} />
    </svg>
  );
};

const NodePill = ({ name, color = '#800000', onClick }) => {
  return (
    <div
      className="node-pill"
      style={{ backgroundColor: color }}
      onClick={onClick}
    >
      {name}
    </div>
  );
};

const PredicateRail = ({ color = '#4A5568', leftActive, rightActive, onToggleLeft, onToggleRight, onClickCenter, centerWidth = 140, label }) => {
  return (
    <div className="predicate-rail" onClick={onClickCenter}>
      <TriangleCap direction="left" color={color} variant={leftActive ? 'solid' : 'ghost'} onClick={(e) => { e.stopPropagation(); onToggleLeft?.(); }} />
      <div className="predicate-rect" style={{ backgroundColor: color }}>
        <span style={{ 
          color: '#bdb5b5', 
          fontWeight: 'bold', 
          fontSize: '14px', 
          fontFamily: "'EmOne', sans-serif",
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {label || 'Connection'}
        </span>
      </div>
      <TriangleCap direction="right" color={color} variant={rightActive ? 'solid' : 'ghost'} onClick={(e) => { e.stopPropagation(); onToggleRight?.(); }} />
    </div>
  );
};

// Modes: 'nodes' | 'connections' | 'abstraction' | 'group'
const UnifiedBottomControlPanel = ({
  mode = 'nodes',
  isVisible = true,
  typeListOpen = false,
  className = '',
  onAnimationComplete,

  // Node mode props
  selectedNodes = [], // [{ id, name, color }]
  onNodeClick,

  // Connection mode props
  triples = [], // [{ id, subject: {id,name,color}, predicate: {id,name,color}, object: {id,name,color}, hasLeftArrow, hasRightArrow }]
  onToggleLeftArrow, // (tripleId) => void
  onToggleRightArrow, // (tripleId) => void
  onPredicateClick, // (tripleId) => void

  // Abstraction mode props
  customContent,

  // Group mode props
  selectedGroup, // { id, name, color, memberInstanceIds }
  onUngroup,
  onGroupEdit,
  onGroupColor,

  // Pie menu button handlers
  onDelete,
  onAdd,
  onUp,
  onOpenInPanel,
  
  // Additional node action handlers
  onDecompose,
  onAbstraction,
  onEdit,
  onSave,
  onPalette,
  onMore,
  onGroup,

  // Optional navigations (shown on node mode)
  onLeftNav,
  onRightNav,
  hasLeftNav = false,
  hasRightNav = false,
}) => {
  const [animationState, setAnimationState] = useState('entering');
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setAnimationState('entering');
    } else if (shouldRender) {
      setAnimationState('exiting');
    }
  }, [isVisible]);

  const handleAnimationEnd = (e) => {
    if (e.animationName === 'unifiedBottomPanelFlyIn') {
      setAnimationState('visible');
    } else if (e.animationName === 'unifiedBottomPanelFlyOut') {
      setShouldRender(false);
      onAnimationComplete?.();
    }
  };

  useEffect(() => {
    if (animationState === 'exiting') {
      const t = setTimeout(() => {
        setShouldRender(false);
        onAnimationComplete?.();
      }, 400);
      return () => clearTimeout(t);
    }
  }, [animationState, onAnimationComplete]);

  if (!shouldRender) return null;

  const isNodes = mode === 'nodes';
  const isAbstraction = mode === 'abstraction';
  const isGroup = mode === 'group';
  const multipleSelected = isNodes && Array.isArray(selectedNodes) && selectedNodes.length > 1;

  return (
    <div
      className={`unified-bottom-panel ${typeListOpen ? 'with-typelist' : ''} ${animationState} ${className}`}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="unified-bottom-content">
        {/* Row 1: Interactive info */}
        <div className="info-row">
          {isNodes ? (
            <div className="arrow-group" style={{ marginRight: 6 }}>
              <div className="piemenu-button" onClick={onLeftNav} title="Previous" style={{ visibility: hasLeftNav ? 'visible' : 'hidden' }}>
                <ChevronLeft size={18} />
              </div>
            </div>
          ) : null}

          {isNodes ? (
            selectedNodes && selectedNodes.length > 0 ? selectedNodes.map(n => (
              <NodePill key={n.id} name={n.name} color={n.color} onClick={() => onNodeClick?.(n)} />
            )) : null
          ) : isGroup ? (
            selectedGroup ? (
              <NodePill name={selectedGroup.name} color={selectedGroup.color} />
            ) : null
          ) : isAbstraction ? (
            customContent
          ) : (
            (() => {
              // Extract unique nodes from triples
              const nodesMap = new Map();
              triples.forEach(t => {
                if (t.subject?.id) {
                  nodesMap.set(t.subject.id, {
                    id: t.subject.id,
                    name: t.subject.name,
                    color: t.subject.color
                  });
                }
                if (t.object?.id) {
                  nodesMap.set(t.object.id, {
                    id: t.object.id,
                    name: t.object.name,
                    color: t.object.color
                  });
                }
              });
              const nodes = Array.from(nodesMap.values());
              
                              // Transform triples to the format expected by UniversalNodeRenderer
                const connections = triples.map(t => ({
                  id: t.id,
                  sourceId: t.subject?.id,
                  destinationId: t.object?.id,
                  connectionName: t.predicate?.name || 'Connection',
                  color: t.predicate?.color || '#8B0000',
                  // Add directionality for arrows
                  directionality: {
                    arrowsToward: new Set([
                      ...(t.hasLeftArrow ? [t.subject?.id] : []),
                      ...(t.hasRightArrow ? [t.object?.id] : [])
                    ])
                  }
                }));
                
                return (
                <UniversalNodeRenderer
                  {...RENDERER_PRESETS.CONNECTION_PANEL}
                  nodes={nodes}
                  connections={connections}
                  containerWidth={Math.max(400, triples.length * 200)}
                  containerHeight={160}
                  onNodeClick={onNodeClick}
                  onConnectionClick={onPredicateClick}
                  onToggleArrow={(connectionId, targetNodeId) => {
                    // Determine if this is left or right arrow based on target
                    const triple = triples.find(t => t.id === connectionId);
                    if (triple && triple.subject?.id === targetNodeId) {
                      onToggleLeftArrow?.(connectionId);
                    } else if (triple && triple.object?.id === targetNodeId) {
                      onToggleRightArrow?.(connectionId);
                    }
                  }}
                />
              );
            })()
          )}

          {isNodes ? (
            <div className="arrow-group" style={{ marginLeft: 6 }}>
              <div className="piemenu-button" onClick={onRightNav} title="Next" style={{ visibility: hasRightNav ? 'visible' : 'hidden' }}>
                <ChevronRight size={18} />
              </div>
            </div>
          ) : null}
        </div>

        {/* Row 2: Pie-menu buttons */}
        <div className="piemenu-row">
          <div className="piemenu-buttons">
            {isNodes ? (
              // Node mode: Show all available node actions
              <>
                <div className="piemenu-button" onClick={onUp} title="Open Web"><ArrowUpFromDot size={18} /></div>
                {multipleSelected && (
                  <div className="piemenu-button" onClick={onGroup} title="Group Selection"><Group size={18} /></div>
                )}
                <div className="piemenu-button" onClick={onDecompose || onAdd} title="Decompose"><PackageOpen size={18} /></div>
                <div className="piemenu-button" onClick={onAbstraction || onOpenInPanel} title="Abstraction"><Layers size={18} /></div>
                <div className="piemenu-button" onClick={onDelete} title="Delete"><Trash2 size={18} /></div>
                <div className="piemenu-button" onClick={onEdit || onUp} title="Edit"><Edit3 size={18} /></div>
                <div className="piemenu-button" onClick={onSave || onAdd} title="Save"><Bookmark size={18} /></div>
                <div className="piemenu-button" onClick={onPalette || onOpenInPanel} title="Palette"><Palette size={18} /></div>
                <div className="piemenu-button" onClick={onMore || onDelete} title="More"><MoreHorizontal size={18} /></div>
              </>
            ) : isGroup ? (
              // Group mode: Show group actions (ungroup, edit, color)
              <>
                <div className="piemenu-button" onClick={onUngroup} title="Ungroup"><Ungroup size={18} /></div>
                <div className="piemenu-button" onClick={onGroupEdit} title="Edit Name"><Edit3 size={18} /></div>
                <div className="piemenu-button" onClick={onGroupColor} title="Change Color"><Palette size={18} /></div>
              </>
            ) : isAbstraction ? (
              // Abstraction mode: Show abstraction actions (add, up with dot, right, edit)
              <>
                <div className="piemenu-button" onClick={onAdd} title="Add Dimension"><Plus size={18} /></div>
                <div className="piemenu-button" onClick={onUp} title="Expand Dimension"><ArrowUpFromDot size={18} /></div>
                <div className="piemenu-button" onClick={onOpenInPanel} title="Open in Panel"><ArrowRight size={18} /></div>
                <div className="piemenu-button" onClick={onEdit} title="Edit Name"><Edit3 size={18} /></div>
                <div className="piemenu-button" onClick={onDelete} title="Delete Dimension"><Trash2 size={18} /></div>
              </>
            ) : (
              // Connection mode: Show connection actions
              <>
                <div className="piemenu-button" onClick={onDelete} title="Delete"><Trash2 size={18} /></div>
                <div className="piemenu-button" onClick={onAdd} title="Add"><Plus size={18} /></div>
                <div className="piemenu-button" onClick={onUp} title="Open definition"><ArrowUpFromDot size={18} /></div>
                <div className="piemenu-button" onClick={onOpenInPanel} title="Open in panel"><ArrowRight size={18} /></div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedBottomControlPanel;


