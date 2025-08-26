import React from 'react';
import UnifiedBottomControlPanel from './UnifiedBottomControlPanel';
import useGraphStore from './store/graphStore';

const NodeControlPanel = ({
  selectedNodePrototypes = [],
  isVisible = true,
  typeListOpen = false,
  onAnimationComplete,
  onDelete,
  onAdd,
  onUp,
  onOpenInPanel,
  onLeftNav,
  onRightNav,
  hasLeftNav = false,
  hasRightNav = false,
}) => {
  const openRightPanelNodeTab = useGraphStore((s) => s.openRightPanelNodeTab);

  const nodes = selectedNodePrototypes.map(p => ({ id: p.id, name: p.name, color: p.color }));

  return (
    <UnifiedBottomControlPanel
      mode="nodes"
      isVisible={isVisible}
      typeListOpen={typeListOpen}
      onAnimationComplete={onAnimationComplete}
      selectedNodes={nodes}
      onNodeClick={(node) => openRightPanelNodeTab?.(node.id, node.name)}
      onDelete={onDelete}
      onAdd={onAdd}
      onUp={onUp}
      onOpenInPanel={onOpenInPanel}
      onLeftNav={onLeftNav}
      onRightNav={onRightNav}
      hasLeftNav={hasLeftNav}
      hasRightNav={hasRightNav}
    />
  );
};

export default NodeControlPanel;


