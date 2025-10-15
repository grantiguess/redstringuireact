import React, { useEffect, useState, useMemo } from 'react';
import { Trash2, Plus, ArrowUpFromDot, ArrowRight, ChevronLeft, ChevronRight, PackageOpen, Layers, Edit3, Bookmark, Palette, MoreHorizontal, Group, Ungroup, SquarePlus } from 'lucide-react';
import UniversalNodeRenderer from './UniversalNodeRenderer';
import { RENDERER_PRESETS } from './UniversalNodeRenderer.presets';
import useGraphStore from "./store/graphStore.jsx";
import { getNodeDimensions } from './utils.js';
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
  onConvertToNodeGroup,

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
            selectedNodes && selectedNodes.length > 0 ? (
              <UniversalNodeRenderer
                nodes={selectedNodes.map((node, index) => {
                  // Use the exact same getNodeDimensions function as Node.jsx
                  const dims = getNodeDimensions(node, false, null);
                  
                  // Scale down for multiple selections but keep proportions
                  // More granular scaling: single=1.0, 2-3=0.75, 4-6=0.55, 7+=0.4
                  const scaleFactor = selectedNodes.length === 1 ? 1.0 : 
                                    selectedNodes.length <= 3 ? 0.75 : 
                                    selectedNodes.length <= 6 ? 0.55 : 0.4;
                  
                  return {
                    ...node,
                    x: index * (dims.currentWidth * scaleFactor + 20), // Use actual calculated spacing
                    y: 0,
                    width: dims.currentWidth * scaleFactor,
                    height: dims.currentHeight * scaleFactor
                  };
                })}
                connections={[]}
                containerWidth={Math.max(400, selectedNodes.reduce((total, node, index) => {
                  const dims = getNodeDimensions(node, false, null);
                  const scaleFactor = selectedNodes.length === 1 ? 1.0 : 
                                    selectedNodes.length <= 3 ? 0.75 : 
                                    selectedNodes.length <= 6 ? 0.55 : 0.4;
                  return total + (dims.currentWidth * scaleFactor) + (index < selectedNodes.length - 1 ? 20 : 0);
                }, 40))}
                containerHeight={Math.max(80, selectedNodes.reduce((maxHeight, node) => {
                  const dims = getNodeDimensions(node, false, null);
                  const scaleFactor = selectedNodes.length === 1 ? 1.0 : 
                                    selectedNodes.length <= 3 ? 0.75 : 
                                    selectedNodes.length <= 6 ? 0.55 : 0.4;
                  return Math.max(maxHeight, dims.currentHeight * scaleFactor);
                }, 40) + 20)}
                alignNodesHorizontally={true}
                minHorizontalSpacing={(() => {
                  // Dynamic spacing based on node count - more compact for more nodes
                  if (selectedNodes.length === 1) return 0;
                  if (selectedNodes.length <= 3) return 16;
                  if (selectedNodes.length <= 6) return 12;
                  return 8;
                })()}
                padding={10}
                onNodeClick={onNodeClick}
                interactive={true}
              />
            ) : null
          ) : isGroup ? (
            selectedGroup ? (
              <UniversalNodeRenderer
                nodes={[{
                  ...selectedGroup,
                  x: 0,
                  y: 0,
                  isGroup: true // Flag to enable group-specific styling
                  // Let getNodeDimensions calculate proper width/height
                }]}
                connections={[]}
                containerWidth={280} // Larger container for bigger group text
                containerHeight={90} // Taller for larger text
                padding={12}
                interactive={false}
              />
            ) : null
          ) : isAbstraction ? (
            customContent
          ) : (
            (() => {
              // Get edges from store for preserving definitionNodeIds
              const edges = useGraphStore.getState().edges;
              
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
                const connections = triples.map(t => {
                  // Get the original edge to preserve definitionNodeIds
                  const originalEdge = edges.get(t.id);
                  return {
                    id: t.id,
                    sourceId: t.subject?.id,
                    destinationId: t.object?.id,
                    connectionName: t.predicate?.name || 'Connection',
                    color: t.predicate?.color || '#000000',
                    // Preserve original edge data for proper name resolution
                    definitionNodeIds: originalEdge?.definitionNodeIds,
                    typeNodeId: originalEdge?.typeNodeId,
                    // Add directionality for arrows
                    directionality: {
                      arrowsToward: new Set([
                        ...(t.hasLeftArrow ? [t.subject?.id] : []),
                        ...(t.hasRightArrow ? [t.object?.id] : [])
                      ])
                    }
                  };
                });
                
                // Calculate appropriate spacing based on connection names and node count
                const maxConnectionNameLength = connections.reduce((max, conn) => {
                  return Math.max(max, (conn.connectionName || 'Connection').length);
                }, 0);
                
                // Proportional spacing calculation that accounts for text and gives more breathing room
                // Base spacing: 12-15 pixels per character, with larger minimum for better proportions
                const textSpacing = Math.max(200, maxConnectionNameLength * 12);
                
                // Additional spacing based on node count to prevent overcrowding
                const nodeCountMultiplier = Math.max(1, nodes.length * 0.8);
                const proportionalSpacing = textSpacing * nodeCountMultiplier;
                
                // Calculate container width with better proportions - more generous for readability
                const dynamicWidth = Math.max(600, nodes.length * (150 + proportionalSpacing));
                
                return (
                <UniversalNodeRenderer
                  {...RENDERER_PRESETS.CONNECTION_PANEL}
                  nodes={nodes}
                  connections={connections}
                  containerWidth={dynamicWidth}
                  containerHeight={160}
                  minHorizontalSpacing={proportionalSpacing}
                  onNodeClick={onNodeClick}
                  onConnectionClick={onPredicateClick}
                  onToggleArrow={(connectionId, targetNodeId) => {
                    // Ensure connectionId is a string, not an object
                    const edgeId = typeof connectionId === 'string' ? connectionId : connectionId?.id || connectionId;
                    
                    // Determine if this is left or right arrow based on target
                    const triple = triples.find(t => t.id === edgeId);
                    if (triple && triple.subject?.id === targetNodeId) {
                      onToggleLeftArrow?.(edgeId);
                    } else if (triple && triple.object?.id === targetNodeId) {
                      onToggleRightArrow?.(edgeId);
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
              // Group mode: Show group actions (ungroup, edit, color, convert to node-group)
              <>
                <div className="piemenu-button" onClick={onUngroup} title="Ungroup"><Ungroup size={18} /></div>
                <div className="piemenu-button" onClick={onGroupEdit} title="Edit Name"><Edit3 size={18} /></div>
                <div className="piemenu-button" onClick={onGroupColor} title="Change Color"><Palette size={18} /></div>
                <div className="piemenu-button" onClick={onConvertToNodeGroup} title="Convert to Thing-Group"><SquarePlus size={18} /></div>
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


