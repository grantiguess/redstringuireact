import React from 'react';
import { useDragLayer }from 'react-dnd';
import useGraphStore from './store/graphStore';
import Node from './Node.jsx';
import { getNodeDimensions } from './utils.js';

const SPAWNABLE_NODE = 'spawnable_node';

const layerStyles = {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: 15000,
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
};

function getItemStyles(currentOffset) {
    if (!currentOffset) {
        return { display: 'none' };
    }
    const { x, y } = currentOffset;
    const transform = `translate(${x}px, ${y}px)`;
    return {
        transform,
        WebkitTransform: transform,
    };
}

const SpawningNodeDragLayer = () => {
    const { itemType, isDragging, item, currentOffset } = useDragLayer((monitor) => ({
        item: monitor.getItem(),
        itemType: monitor.getItemType(),
        isDragging: monitor.isDragging(),
        currentOffset: monitor.getClientOffset(),
    }));

    const node = useGraphStore(state => (item?.prototypeId ? state.nodePrototypes.get(item.prototypeId) : null));

    if (!isDragging || itemType !== SPAWNABLE_NODE || !currentOffset || !node) {
        return null;
    }

    const dimensions = getNodeDimensions(node, false, null);
    const scale = 0.8;
    const nodeX = - (dimensions.currentWidth * scale) / 2;
    const nodeY = - (dimensions.currentHeight * scale) / 2;

    const clonedNode = {
        ...node,
        x: nodeX,
        y: nodeY,
        scale,
    };

    return (
        <div style={layerStyles}>
            <div style={getItemStyles(currentOffset)}>
                <svg 
                    width={dimensions.currentWidth * scale} 
                    height={dimensions.currentHeight * scale} 
                    style={{ overflow: 'visible' }}
                >
                    <Node
                        node={clonedNode}
                        isSelected={false}
                        isDragging={true}
                        onMouseDown={() => {}}
                        currentWidth={dimensions.currentWidth}
                        currentHeight={dimensions.currentHeight}
                        textAreaHeight={dimensions.textAreaHeight}
                        imageWidth={dimensions.imageWidth}
                        imageHeight={dimensions.calculatedImageHeight}
                        descriptionAreaHeight={dimensions.descriptionAreaHeight}
                        isPreviewing={false}
                    />
                </svg>
            </div>
        </div>
    );
};

export default SpawningNodeDragLayer; 