import React from 'react';
import NodeCanvas from './NodeCanvas';
import SpawningNodeDragLayer from './SpawningNodeDragLayer';
// import BridgeClient from './ai/BridgeClient.jsx';
import GlobalContextMenu from './components/GlobalContextMenu.jsx';
import GitFederationBootstrap from './components/GitFederationBootstrap.jsx';
import './App.css';

function App() {
  return (
    <>
      {/* GitFederationBootstrap enabled but with controlled initialization to prevent spam */}
      <GitFederationBootstrap enableEagerInit={true} />
      <NodeCanvas />
      <SpawningNodeDragLayer />
      {/* <BridgeClient /> */}
      <GlobalContextMenu />
    </>
  );
}

export default App;
