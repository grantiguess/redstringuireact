import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import NodeCanvas from './NodeCanvas';
import SpawningNodeDragLayer from './SpawningNodeDragLayer';
// import BridgeClient from './ai/BridgeClient.jsx';
import GlobalContextMenu from './components/GlobalContextMenu.jsx';
import './App.css';

function App() {
  return (
    <>
      <DndProvider backend={HTML5Backend}>
        <NodeCanvas />
        <SpawningNodeDragLayer />
        {/* <BridgeClient /> */}
      </DndProvider>
      <GlobalContextMenu />
    </>
  );
}

export default App;
