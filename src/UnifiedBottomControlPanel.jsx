import React, { useEffect, useState, useMemo } from 'react';
import { Trash2, Plus, ArrowUpFromDot, ArrowRight, ChevronLeft, ChevronRight, PackageOpen, Layers, Edit3, Bookmark, Palette, MoreHorizontal } from 'lucide-react';
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

// Modes: 'nodes' | 'connections'
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
            (selectedNodes && selectedNodes.length > 0
              ? selectedNodes
              : [{ id: 'single', name: 'Node', color: '#800000' }]
            ).map(n => (
              <NodePill key={n.id} name={n.name} color={n.color} onClick={() => onNodeClick?.(n)} />
            ))
          ) : (
            triples.map(t => (
              <div className="triple-item" key={t.id}>
                <div className="triple-left">
                  <NodePill name={t.subject?.name} color={t.subject?.color} onClick={() => onNodeClick?.(t.subject)} />
                </div>
                <div className="triple-center">
                  <PredicateRail
                  color={t.predicate?.color || '#4A5568'}
                  leftActive={!!t.hasLeftArrow}
                  rightActive={!!t.hasRightArrow}
                  onToggleLeft={() => onToggleLeftArrow?.(t.id)}
                  onToggleRight={() => onToggleRightArrow?.(t.id)}
                  onClickCenter={() => onPredicateClick?.(t.id)}
                  centerWidth={Math.max(140, (t.predicate?.name?.length || 9) * 9)}
                  label={t.predicate?.name}
                  />
                </div>
                <div className="triple-right">
                  <NodePill name={t.object?.name} color={t.object?.color} onClick={() => onNodeClick?.(t.object)} />
                </div>
              </div>
            ))
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
                <div className="piemenu-button" onClick={onDecompose || onAdd} title="Decompose"><PackageOpen size={18} /></div>
                <div className="piemenu-button" onClick={onAbstraction || onOpenInPanel} title="Abstraction"><Layers size={18} /></div>
                <div className="piemenu-button" onClick={onDelete} title="Delete"><Trash2 size={18} /></div>
                <div className="piemenu-button" onClick={onEdit || onUp} title="Edit"><Edit3 size={18} /></div>
                <div className="piemenu-button" onClick={onSave || onAdd} title="Save"><Bookmark size={18} /></div>
                <div className="piemenu-button" onClick={onPalette || onOpenInPanel} title="Palette"><Palette size={18} /></div>
                <div className="piemenu-button" onClick={onMore || onDelete} title="More"><MoreHorizontal size={18} /></div>
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


