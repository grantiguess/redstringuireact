const calculatePanOffset = (data) => {
    const {
      mouseX,
      mouseY,
      panStart,
      currentPanOffset,
      viewportSize,
      canvasSize,
      zoomLevel
    } = data;
  
    const dx = mouseX - panStart.x;
    const dy = mouseY - panStart.y;
  
    let newPanOffsetX = currentPanOffset.x + dx;
    let newPanOffsetY = currentPanOffset.y + dy;
  
    const maxPanOffsetX = 0;
    const maxPanOffsetY = 0;
    const minPanOffsetX = viewportSize.width - canvasSize.width * zoomLevel;
    const minPanOffsetY = viewportSize.height - canvasSize.height * zoomLevel;
  
    newPanOffsetX = Math.min(Math.max(newPanOffsetX, minPanOffsetX), maxPanOffsetX);
    newPanOffsetY = Math.min(Math.max(newPanOffsetY, minPanOffsetY), maxPanOffsetY);
  
    return {
      x: newPanOffsetX,
      y: newPanOffsetY
    };
  };
  
  const calculateNodePositions = (data) => {
    const { nodes, draggingNode, mouseX, mouseY, panOffset, zoomLevel, canvasSize, viewportSize } = data;
    
    return nodes.map(node => {
      if (node.id === draggingNode?.id) {
        const rect = { left: 0, top: 0 }; // Worker doesn't have access to DOM
        const currentX = (mouseX - rect.left - panOffset.x) / zoomLevel;
        const currentY = (mouseY - rect.top - panOffset.y) / zoomLevel;
        
        const newNodeX = Math.min(
          Math.max(currentX - draggingNode.offsetX, 0),
          canvasSize.width - draggingNode.width
        );
        const newNodeY = Math.min(
          Math.max(currentY - draggingNode.offsetY, 0),
          canvasSize.height - draggingNode.height
        );
        
        return {
          ...node,
          x: newNodeX,
          y: newNodeY
        };
      }
      return node;
    });
  };
  
  const calculateSelectionRect = (data) => {
    const { selectionStart, currentX, currentY } = data;
    
    return {
      x: Math.min(selectionStart.x, currentX),
      y: Math.min(selectionStart.y, currentY),
      width: Math.abs(currentX - selectionStart.x),
      height: Math.abs(currentY - selectionStart.y)
    };
  };
  
  const calculateZoom = (data) => {
    const {
      deltaY,
      currentZoom,
      mousePos,
      panOffset,
      viewportSize,
      canvasSize,
      MIN_ZOOM,
      MAX_ZOOM
    } = data;
  
    let zoomFactor;
    if (deltaY < 0) {
      zoomFactor = 1.1;
    } else if (deltaY > 0) {
      zoomFactor = 1 / 1.1;
    } else {
      return { zoomLevel: currentZoom, panOffset };
    }
  
    let newZoomLevel = currentZoom * zoomFactor;
    newZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));
    
    zoomFactor = newZoomLevel / currentZoom;
  
    const panOffsetDeltaX = (mousePos.x - panOffset.x) * (1 - zoomFactor);
    const panOffsetDeltaY = (mousePos.y - panOffset.y) * (1 - zoomFactor);
  
    let newPanOffsetX = panOffset.x + panOffsetDeltaX;
    let newPanOffsetY = panOffset.y + panOffsetDeltaY;
  
    const maxPanOffsetX = 0;
    const maxPanOffsetY = 0;
    const minPanOffsetX = viewportSize.width - canvasSize.width * newZoomLevel;
    const minPanOffsetY = viewportSize.height - canvasSize.height * newZoomLevel;
  
    newPanOffsetX = Math.min(Math.max(newPanOffsetX, minPanOffsetX), maxPanOffsetX);
    newPanOffsetY = Math.min(Math.max(newPanOffsetY, minPanOffsetY), maxPanOffsetY);
  
    return {
      zoomLevel: newZoomLevel,
      panOffset: { x: newPanOffsetX, y: newPanOffsetY }
    };
  };
  
  // Message handler
  self.onmessage = (e) => {
    const { type, data } = e.data;
  
    switch (type) {
      case 'CALCULATE_PAN':
        self.postMessage({
          type: 'PAN_RESULT',
          data: calculatePanOffset(data)
        });
        break;
  
      case 'CALCULATE_NODE_POSITIONS':
        self.postMessage({
          type: 'NODE_POSITIONS_RESULT',
          data: calculateNodePositions(data)
        });
        break;
  
      case 'CALCULATE_SELECTION':
        self.postMessage({
          type: 'SELECTION_RESULT',
          data: calculateSelectionRect(data)
        });
        break;
  
      case 'CALCULATE_ZOOM':
        self.postMessage({
          type: 'ZOOM_RESULT',
          data: calculateZoom(data)
        });
        break;
    }
  };