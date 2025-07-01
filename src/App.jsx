import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import NodeCanvas from './NodeCanvas';
import SpawningNodeDragLayer from './SpawningNodeDragLayer';
import './App.css';

function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <NodeCanvas />
      <SpawningNodeDragLayer />
    </DndProvider>
  );
}

export default App;
