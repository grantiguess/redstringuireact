import React from 'react';
import { NODE_WIDTH, NODE_HEIGHT } from './constants';
import './Node.css';

const Node = ({ node, isSelected, isDragging, onMouseDown }) => {
  return (
    <g
      className={`node ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={onMouseDown}
      style={{
        transform: `scale(${node.scale})`,
        transformOrigin: `${node.x + NODE_WIDTH / 2}px ${node.y + NODE_HEIGHT / 2}px`,
        cursor: 'pointer'
      }}
    >
      <rect
        x={node.x}
        y={node.y}
        rx={40}
        ry={40}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        fill="maroon"
        stroke={isSelected ? 'black' : 'none'}
        strokeWidth={4}
      />
      <foreignObject x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEIGHT}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            userSelect: 'none',
            fontSize: '16px',
            fontWeight: 'bold',
            fontFamily: 'Helvetica',
            color: '#bdb5b5',
            textAlign: 'center',
            overflow: 'hidden'
          }}
        >
          {node.name}
        </div>
      </foreignObject>
    </g>
  );
};

export default Node;
