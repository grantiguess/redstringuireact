import React, { useMemo, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { getNodeDimensions } from '../utils.js';
import { NODE_CORNER_RADIUS, NODE_PADDING, NODE_DEFAULT_COLOR } from '../constants';
import { candidateToConcept } from '../services/candidates.js';

const SPAWNABLE_NODE = 'spawnable_node';

const DRAG_MARGIN = 18;

const DraggableOrbitItem = ({ candidate, x, y, width, height }) => {
  const concept = useMemo(() => candidateToConcept(candidate), [candidate]);

  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: SPAWNABLE_NODE,
    item: {
      prototypeId: null,
      nodeId: null,
      nodeName: candidate.name,
      nodeColor: candidate.color || NODE_DEFAULT_COLOR,
      fromOrbitOverlay: true,
      conceptData: concept,
      needsMaterialization: true
    },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }), [candidate, concept]);

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const label = candidate.name || 'Untitled';
  const fill = candidate.color || NODE_DEFAULT_COLOR;

  return (
    <g style={{ opacity: isDragging ? 0.5 : 1 }}>
      <rect
        x={x + 6}
        y={y + 6}
        rx={NODE_CORNER_RADIUS - 6}
        ry={NODE_CORNER_RADIUS - 6}
        width={width - 12}
        height={height - 12}
        fill={fill}
        stroke={'none'}
      />
      <foreignObject
        x={x}
        y={y}
        width={width}
        height={height}
        style={{ overflow: 'visible' }}
        ref={drag}
      >
        <div
          style={{
            width: `${width}px`,
            height: `${height}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 22px',
            boxSizing: 'border-box',
            cursor: 'grab',
            userSelect: 'none',
            fontFamily: "'EmOne', sans-serif",
            color: '#bdb5b5',
            fontWeight: 'bold',
            fontSize: '20px',
            lineHeight: '32px',
            textAlign: 'center',
            wordBreak: 'break-word',
            overflowWrap: 'break-word'
          }}
          title={`${label}`}
        >
          {label}
        </div>
      </foreignObject>
    </g>
  );
};

const computeRingRadius = (items, centerRadius, spacing, count) => {
  const maxWidth = items.reduce((m, it) => Math.max(m, it.dims.currentWidth), 0);
  const chordNeeded = maxWidth + spacing;
  const dTheta = (Math.PI * 2) / Math.max(1, count);
  const minR = chordNeeded / (2 * Math.sin(dTheta / 2));
  return Math.max(centerRadius + spacing + maxWidth / 2, minR);
};

const measureCandidates = (candidates) => {
  return candidates.map((c) => {
    const tempNode = {
      id: `orbit-${c.id}`,
      x: 0,
      y: 0,
      scale: 1,
      prototypeId: null,
      name: c.name,
      color: c.color || NODE_DEFAULT_COLOR,
      definitionGraphIds: []
    };
    const dims = getNodeDimensions(tempNode, false, null);
    return { candidate: c, dims };
  });
};

export default function OrbitOverlay({
  centerX,
  centerY,
  focusWidth,
  focusHeight,
  innerCandidates,
  outerCandidates
}) {
  console.log('🎨 OrbitOverlay render:', { 
    centerX, 
    centerY, 
    focusWidth, 
    focusHeight, 
    innerCandidatesCount: innerCandidates?.length || 0,
    outerCandidatesCount: outerCandidates?.length || 0
  });

  if (!innerCandidates || innerCandidates.length === 0) {
    console.log('❌ No inner candidates to show in orbit');
    return null;
  }

  if (!outerCandidates || outerCandidates.length === 0) {
    console.log('❌ No outer candidates to show in orbit');
    return null;
  }

  const measuredInner = useMemo(() => measureCandidates(innerCandidates), [innerCandidates]);
  const measuredOuter = useMemo(() => measureCandidates(outerCandidates), [outerCandidates]);

  const centerRadius = useMemo(() => {
    return Math.max(focusWidth, focusHeight) / 2;
  }, [focusWidth, focusHeight]);

  const innerRadius = useMemo(() => computeRingRadius(measuredInner, centerRadius, DRAG_MARGIN, Math.max(1, measuredInner.length)), [measuredInner, centerRadius]);
  const outerRadius = useMemo(() => computeRingRadius(measuredOuter, innerRadius + DRAG_MARGIN, DRAG_MARGIN, Math.max(1, measuredOuter.length)), [measuredOuter, innerRadius]);

  const innerPositions = useMemo(() => {
    const n = Math.max(1, measuredInner.length);
    const positions = [];
    for (let i = 0; i < measuredInner.length; i++) {
      const { candidate, dims } = measuredInner[i];
      const theta = (2 * Math.PI * i) / n;
      const cx = centerX + innerRadius * Math.cos(theta);
      const cy = centerY + innerRadius * Math.sin(theta);
      positions.push({ candidate, dims, x: cx - dims.currentWidth / 2, y: cy - dims.currentHeight / 2 });
    }
    return positions;
  }, [measuredInner, innerRadius, centerX, centerY]);

  const outerPositions = useMemo(() => {
    const n = Math.max(1, measuredOuter.length);
    const positions = [];
    const offset = Math.PI / Math.max(2, n); // half-step bricklaying
    for (let i = 0; i < measuredOuter.length; i++) {
      const { candidate, dims } = measuredOuter[i];
      const theta = (2 * Math.PI * i) / n + offset;
      const cx = centerX + outerRadius * Math.cos(theta);
      const cy = centerY + outerRadius * Math.sin(theta);
      positions.push({ candidate, dims, x: cx - dims.currentWidth / 2, y: cy - dims.currentHeight / 2 });
    }
    return positions;
  }, [measuredOuter, outerRadius, centerX, centerY]);

  return (
    <g>
      {innerPositions.map(({ candidate, dims, x, y }) => (
        <DraggableOrbitItem
          key={`inner-${candidate.id}`}
          candidate={candidate}
          x={x}
          y={y}
          width={dims.currentWidth}
          height={dims.currentHeight}
        />
      ))}
      {outerPositions.map(({ candidate, dims, x, y }) => (
        <DraggableOrbitItem
          key={`outer-${candidate.id}`}
          candidate={candidate}
          x={x}
          y={y}
          width={dims.currentWidth}
          height={dims.currentHeight}
        />
      ))}
    </g>
  );
}


