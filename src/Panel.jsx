import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef, useCallback, useMemo } from 'react';
import { useDrag, useDrop, useDragLayer } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend'; // Import for hiding default preview
import { HEADER_HEIGHT, NODE_CORNER_RADIUS, THUMBNAIL_MAX_DIMENSION, NODE_DEFAULT_COLOR } from './constants';
import { ArrowLeftFromLine, ArrowRightFromLine, Info, ImagePlus, XCircle, BookOpen, LayoutGrid, Plus, Bookmark, ArrowUpFromDot, Palette, ArrowBigRightDash, X, Globe, Wand, Settings, RotateCcw, Send, Bot, User, Key, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import './Panel.css'
import { generateThumbnail } from './utils'; // Import thumbnail generator
import ToggleButton from './ToggleButton'; // Import the new component
import PanelResizerHandle from './components/PanelResizerHandle.jsx';
import ColorPicker from './ColorPicker'; // Import the new ColorPicker component
import NodeSelectionGrid from './NodeSelectionGrid'; // Import NodeSelectionGrid for type selection
import useGraphStore, {
    getActiveGraphId,
    getHydratedNodesForGraph,
    getActiveGraphData,
    getEdgesForGraph,
    getNodePrototypeById,
} from './store/graphStore';
import { shallow } from 'zustand/shallow';
import GraphListItem from './GraphListItem'; // <<< Import the new component
import GitNativeFederation from './GitNativeFederation'; // Import Git-Native Federation component
// Inline AI Collaboration Panel as internal component below
import './ai/AICollaborationPanel.css';
import APIKeySetup from './ai/components/APIKeySetup.jsx';
import mcpClient from './services/mcpClient.js';
import { bridgeFetch } from './services/bridgeConfig.js';
import apiKeyManager from './services/apiKeyManager.js';

// Helper function to determine the correct article ("a" or "an")
const getArticleFor = (word) => {
  if (!word) return 'a';
  const firstLetter = word.trim()[0].toLowerCase();
  return ['a', 'e', 'i', 'o', 'u'].includes(firstLetter) ? 'an' : 'a';
};

// Define Item Type for react-dnd
const ItemTypes = {
  TAB: 'tab',
  SPAWNABLE_NODE: 'spawnable_node'
};

// --- Custom Drag Layer --- A component to render the preview
const CustomDragLayer = ({ tabBarRef }) => {
  const { itemType, isDragging, item, initialOffset, currentOffset } = useDragLayer(
    (monitor) => ({
      item: monitor.getItem(),
      itemType: monitor.getItemType(),
      initialOffset: monitor.getInitialSourceClientOffset(),
      currentOffset: monitor.getSourceClientOffset(),
      isDragging: monitor.isDragging(),
    })
  );

  if (!isDragging || itemType !== ItemTypes.TAB || !initialOffset || !currentOffset) {
    return null;
  }

  // Get the tab data from the item
  const { tab } = item; // Assuming tab data is passed in item

  // Style for the layer element
  const layerStyles = {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: 1, // Lower z-index to be below buttons (which are zIndex: 2)
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
  };

  // Function to calculate clamped transform
  const getItemStyles = (initialOffset, currentOffset, tabBarRef) => {
    if (!initialOffset || !currentOffset) {
      return { display: 'none' };
    }

    let clampedX = currentOffset.x;
    const tabBarBounds = tabBarRef.current?.getBoundingClientRect();

    if (tabBarBounds) {
      // Clamp the x position within the tab bar bounds
      clampedX = Math.max(
        tabBarBounds.left,
        Math.min(currentOffset.x, tabBarBounds.right - 150) // Adjust right bound by approx tab width
      );
    }

    // Use clamped X for horizontal, initial Y for vertical
    const transform = `translate(${clampedX}px, ${initialOffset.y}px)`;
    return {
      transform,
      WebkitTransform: transform,
    };
  }

  // Style the preview element itself (similar to the original tab)
  const previewStyles = {
    backgroundColor: '#bdb5b5', // Active tab color for preview
    borderTopLeftRadius: '10px',
    borderTopRightRadius: '10px',
    color: '#260000',
    fontWeight: 'bold',
    fontSize: '0.9rem',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0px 8px',
    height: '40px', // Match tab height
    maxWidth: '150px',
    // boxShadow: '0 4px 8px rgba(0,0,0,0.3)', // Removed shadow
    opacity: 0.9, // Slightly transparent
  };

  return (
    <div style={layerStyles}>
      <div style={{ ...previewStyles, ...getItemStyles(initialOffset, currentOffset, tabBarRef) }}>
         {/* Simplified content for preview */}
        <span style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginRight: '8px',
          userSelect: 'none'
        }}>
          {item.title} {/* Use title from item */} 
        </span>
        {/* No close button in preview */}
      </div>
    </div>
  );
};

const SavedNodeItem = ({ node, onClick, onDoubleClick, onUnsave, isActive }) => {
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: ItemTypes.SPAWNABLE_NODE,
    item: { prototypeId: node.id },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }), [node.id]);

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return (
    <div
      ref={drag}
      key={node.id}
      title={node.name}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'relative',
        backgroundColor: node.color || NODE_DEFAULT_COLOR,
        color: '#bdb5b5',
        borderRadius: '10px',
        padding: '4px 6px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
        textAlign: 'center',
        cursor: 'pointer',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        userSelect: 'none',
        borderWidth: '4px',
        borderStyle: 'solid',
        borderColor: isActive ? 'black' : 'transparent',
        boxSizing: 'border-box',
        transition: 'opacity 0.3s ease, border-color 0.2s ease',
        margin: '4px',
        minWidth: '100px',
        opacity: isDragging ? 0.5 : 1,
        fontFamily: "'EmOne', sans-serif",
      }}
    >
      {node.name || 'Unnamed'}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            cursor: 'pointer',
            zIndex: 10,
            backgroundColor: '#000000', 
            borderRadius: '50%',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onUnsave(node.id);
          }}
          title="Unsave this item"
        >
          <XCircle 
            size={16}
            style={{
              color: '#999999',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#999999'}
          />
        </div>
      )}
    </div>
  );
};

// Internal Left Library View (Saved Things)
const LeftLibraryView = ({
  savedNodesByType,
  sectionCollapsed,
  sectionMaxHeights,
  toggleSection,
  panelWidth,
  sectionContentRefs,
  activeDefinitionNodeId,
  openGraphTab,
  createAndAssignGraphDefinition,
  toggleSavedNode,
  openRightPanelNodeTab,
}) => {
  return (
    <div className="panel-content-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, color: '#260000', userSelect: 'none', fontSize: '1.1rem', fontWeight: 'bold', fontFamily: "'EmOne', sans-serif" }}>
          Saved Things
        </h2>
      </div>

      {savedNodesByType.size === 0 ? (
        <div style={{ color: '#666', fontSize: '0.9rem', fontFamily: "'EmOne', sans-serif", textAlign: 'center', marginTop: '20px' }}>
          No saved nodes.
        </div>
      ) : (
        Array.from(savedNodesByType.entries()).map(([typeId, group], index, array) => {
          const { typeInfo, nodes } = group;
          const isCollapsed = sectionCollapsed[typeId] ?? false;
          const maxHeight = sectionMaxHeights[typeId] || '0px';
          const isLastSection = index === array.length - 1;
          return (
            <div key={typeId}>
              <div style={{ marginBottom: '10px' }}>
                <div
                  onClick={() => toggleSection(typeId)}
                  style={{
                    backgroundColor: typeInfo.color,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#bdb5b5',
                    fontWeight: 'bold',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: '12px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'translateY(0px)'; }}
                >
                  <span>{typeInfo.name} ({nodes.length})</span>
                  <span style={{ display: 'inline-block', transition: 'transform 0.2s ease', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', fontSize: '14px', fontFamily: "'EmOne', sans-serif" }}>▶</span>
                </div>

                {!isCollapsed && (
                  <div style={{ overflow: 'hidden', transition: 'max-height 0.2s ease-out', maxHeight }}>
                    <div
                      ref={(el) => {
                        if (el) { sectionContentRefs.current.set(typeId, el); } else { sectionContentRefs.current.delete(typeId); }
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: panelWidth > 250 ? '1fr 1fr' : '1fr',
                        gap: panelWidth > 250 ? '8px' : '0px',
                        marginTop: '8px',
                        paddingBottom: '8px',
                      }}
                    >
                      {nodes.map(node => {
                        const handleSingleClick = () => {
                          if (node.definitionGraphIds && node.definitionGraphIds.length > 0) {
                            const graphIdToOpen = node.definitionGraphIds[0];
                            openGraphTab?.(graphIdToOpen, node.id);
                          } else if (createAndAssignGraphDefinition) {
                            createAndAssignGraphDefinition(node.id);
                          } else {
                            console.error('[Panel Saved Node Click] Missing required actions');
                          }
                        };
                        const handleDoubleClick = () => { openRightPanelNodeTab?.(node.id); };
                        const handleUnsave = () => { toggleSavedNode?.(node.id); };
                        return (
                          <SavedNodeItem
                            key={node.id}
                            node={node}
                            onClick={handleSingleClick}
                            onDoubleClick={handleDoubleClick}
                            onUnsave={handleUnsave}
                            isActive={node.id === activeDefinitionNodeId}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {!isLastSection && (<div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>)}
            </div>
          );
        })
      )}
    </div>
  );
};

// Internal Left Grid View (Open Things)
const LeftGridView = ({
  openGraphsForList,
  panelWidth,
  listContainerRef,
  activeGraphId,
  expandedGraphIds,
  handleGridItemClick,
  closeGraph,
  toggleGraphExpanded,
}) => {
  return (
    <div className="panel-content-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <h2 style={{ margin: 0, color: '#260000', userSelect: 'none', fontSize: '1.1rem', fontWeight: 'bold', fontFamily: "'EmOne', sans-serif" }}>
          Open Things
        </h2>
      </div>

      <div
        ref={listContainerRef}
        className="hide-scrollbar"
        style={{ flexGrow: 1, overflowY: 'auto', paddingLeft: '5px', paddingRight: '5px', paddingBottom: '30px', minHeight: 0 }}
      >
        {openGraphsForList.map((graph) => (
          <GraphListItem
            key={graph.id}
            graphData={graph}
            panelWidth={panelWidth}
            isActive={graph.id === activeGraphId}
            isExpanded={expandedGraphIds.has(graph.id)}
            onClick={handleGridItemClick}
            onClose={closeGraph}
            onToggleExpand={toggleGraphExpanded}
          />
        ))}
        {openGraphsForList.length === 0 && (
          <div style={{ color: '#666', textAlign: 'center', marginTop: '20px', fontFamily: "'EmOne', sans-serif" }}>No graphs currently open.</div>
        )}
      </div>
    </div>
  );
};

// Internal AI Collaboration View component (migrated from src/ai/AICollaborationPanel.jsx)
const LeftAIView = () => {
  const [isConnected, setIsConnected] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [currentInput, setCurrentInput] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showAPIKeySetup, setShowAPIKeySetup] = React.useState(false);
  const [hasAPIKey, setHasAPIKey] = React.useState(false);
  const [apiKeyInfo, setApiKeyInfo] = React.useState(null);
  const [isAutonomousMode, setIsAutonomousMode] = React.useState(true);
  const [currentAgentRequest, setCurrentAgentRequest] = React.useState(null);
  const messagesEndRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const STORAGE_KEY = 'rs.aiChat.messages.v1';
  const RESET_TS_KEY = 'rs.aiChat.resetTs';

  const activeGraphId = useGraphStore((state) => state.activeGraphId);
  const graphs = useGraphStore((state) => state.graphs);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  React.useEffect(() => {
    try {
      if (mcpClient && mcpClient.isConnected) setIsConnected(true);
    } catch {}
    let resetTs = 0;
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      const rt = localStorage.getItem(RESET_TS_KEY);
      resetTs = rt ? Number(rt) || 0 : 0;
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {}
    (async () => {
      try {
        if (messages.length > 0) return;
        const res = await bridgeFetch('/api/bridge/telemetry');
        if (res.ok) {
          const data = await res.json();
          const chat = Array.isArray(data?.chat) ? data.chat : [];
          if (chat.length > 0) {
            const hydrated = chat
              .filter((c) => !resetTs || (typeof c.ts === 'number' && c.ts >= resetTs))
              .map((c) => ({
                id: `${c.ts || Date.now()}_${Math.random().toString(36).slice(2,9)}`,
                sender: c.role === 'user' ? 'user' : (c.role === 'ai' ? 'ai' : 'system'),
                content: c.text || '',
                timestamp: new Date(c.ts || Date.now()).toISOString(),
                metadata: {}
              }));
            setMessages((prev) => (prev.length === 0 ? hydrated : prev));
          }
        }
      } catch {}
    })();
  }, []);

  React.useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  React.useEffect(() => { checkAPIKey(); }, []);
  const checkAPIKey = async () => {
    try {
      const hasKey = await apiKeyManager.hasAPIKey();
      const keyInfo = await apiKeyManager.getAPIKeyInfo();
      setHasAPIKey(hasKey);
      setApiKeyInfo(keyInfo);
    } catch (error) { console.error('Failed to check API key:', error); }
  };

  const addMessage = (sender, content, metadata = {}) => {
    const message = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender,
      content,
      timestamp: new Date().toISOString(),
      metadata,
      toolCalls: (metadata.toolCalls || []).map(tc => ({ ...tc, expanded: false }))
    };
    setMessages(prev => [...prev, message]);
  };

  const upsertToolCall = (toolUpdate) => {
    setMessages(prev => {
      const updated = [...prev];
      let idx = updated.length - 1;
      while (idx >= 0 && updated[idx].sender !== 'ai') idx--;
      if (idx < 0) {
        updated.push({ id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, sender: 'ai', content: '', timestamp: new Date().toISOString(), toolCalls: [] });
        idx = updated.length - 1;
      }
      const msg = { ...updated[idx] };
      const calls = Array.isArray(msg.toolCalls) ? [...msg.toolCalls] : [];
      const matchIndex = calls.findIndex(c => (toolUpdate.id && c.id === toolUpdate.id)
        || (toolUpdate.cid && c.cid === toolUpdate.cid && c.name === toolUpdate.name)
        || (!toolUpdate.cid && c.name === toolUpdate.name));
      if (matchIndex >= 0) {
        calls[matchIndex] = { ...calls[matchIndex], ...toolUpdate };
      } else {
        calls.push({ expanded: false, status: toolUpdate.status || 'running', ...toolUpdate });
      }
      msg.toolCalls = calls;
      updated[idx] = msg;
      return updated;
    });
  };

  React.useEffect(() => {
    const handler = (e) => {
      const items = Array.isArray(e.detail) ? e.detail : [];
      items.forEach((t) => {
        if (t.type === 'tool_call') {
          const status = t.status || (t.leased ? 'running' : 'running');
          upsertToolCall({ id: t.id, name: t.name || 'tool', status, args: t.args, cid: t.cid });
          return;
        }
        if (t.type === 'agent_queued') {
          if (messages.length > 0) upsertToolCall({ name: 'agent', status: 'queued', args: { queued: t.queued, graphId: t.graphId }, cid: t.cid });
          return;
        }
        if (t.type === 'info') {
          upsertToolCall({ name: t.name || 'info', status: 'completed', result: t.message, cid: t.cid });
          return;
        }
        if (t.type === 'agent_answer') {
          const finalText = (t.text || '').trim();
          setMessages(prev => {
            const isDefault = /\bwhat will we (make|build) today\?/i.test(finalText);
            if (prev.length === 0 && isDefault) return prev;
            const updated = [...prev];
            let idx = updated.length - 1;
            while (idx >= 0 && updated[idx].sender !== 'ai') idx--;
            if (idx >= 0) {
              updated[idx] = { ...updated[idx], content: finalText };
              return updated;
            }
            if (updated.length === 0 && isDefault) return updated;
            return [...updated, { id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, sender: 'ai', content: finalText, timestamp: new Date().toISOString(), toolCalls: [] }];
          });
          return;
        }
      });
    };
    window.addEventListener('rs-telemetry', handler);
    return () => window.removeEventListener('rs-telemetry', handler);
  }, []);

  React.useEffect(() => {
    if (hasAPIKey && !isConnected && !isProcessing) {
      if (mcpClient && mcpClient.isConnected) { setIsConnected(true); return; }
      initializeConnection();
    }
  }, [hasAPIKey]);

  const initializeConnection = async () => {
    try {
      setIsProcessing(true);
      await mcpClient.connect();
      setIsConnected(true);
    } catch (error) {
      console.error('[AI Collaboration] Connection failed:', error);
      setIsConnected(false);
      addMessage('system', `Connection failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const refreshBridgeConnection = async () => {
    try {
      setIsProcessing(true);
      const s = useGraphStore.getState();
      const bridgeData = {
        graphs: Array.from(s.graphs.entries()).map(([id, graph]) => ({
          id,
          name: graph.name,
          description: graph.description || '',
          instanceCount: graph.instances?.size || 0,
          instances: id === s.activeGraphId && graph.instances ?
            Object.fromEntries(Array.from(graph.instances.entries()).map(([instanceId, instance]) => [
              instanceId, { id: instance.id, prototypeId: instance.prototypeId, x: instance.x || 0, y: instance.y || 0, scale: instance.scale || 1 }
            ])) : undefined
        })),
        nodePrototypes: Array.from(s.nodePrototypes.entries()).map(([nid, prototype]) => ({ id: nid, name: prototype.name })),
        activeGraphId: s.activeGraphId,
        activeGraphName: s.activeGraphId ? (s.graphs.get(s.activeGraphId)?.name || null) : null,
        openGraphIds: s.openGraphIds,
        summary: { totalGraphs: s.graphs.size, totalPrototypes: s.nodePrototypes.size, lastUpdate: Date.now() }
      };
      try {
        const resp = await bridgeFetch('/api/bridge/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bridgeData) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      } catch (e) { console.warn('[AI Panel] Bridge state refresh failed:', e); }
      try { if (typeof window !== 'undefined' && typeof window.rsBridgeManualReconnect === 'function') { window.rsBridgeManualReconnect(); } } catch {}
      await initializeConnection();
      try {
        const now = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        localStorage.setItem(RESET_TS_KEY, String(now));
      } catch {}
      setMessages([]);
    } catch (e) {
      addMessage('system', `Refresh failed: ${e.message}`);
    } finally { setIsProcessing(false); }
  };

  const handleSendMessage = async () => {
    if (!currentInput.trim() || isProcessing) return;
    const userMessage = currentInput.trim();
    addMessage('user', userMessage);
    setCurrentInput('');
    setIsProcessing(true);
    try {
      if (!hasAPIKey) { addMessage('ai', 'Please set up your API key first by clicking the key icon (🔑) in the header.'); setIsProcessing(false); return; }
      if (!mcpClient.isConnected) { await initializeConnection(); if (!mcpClient.isConnected) { setIsProcessing(false); return; } }
      if (isAutonomousMode) { await handleAutonomousAgent(userMessage); } else { await handleQuestion(userMessage); }
    } catch (error) {
      console.error('[AI Collaboration] Error processing message:', error);
      addMessage('system', `Error: ${error.message}`);
    } finally { setIsProcessing(false); setCurrentAgentRequest(null); }
  };

  const handleStopAgent = () => {
    if (currentAgentRequest) {
      currentAgentRequest.abort();
      setCurrentAgentRequest(null);
      setIsProcessing(false);
      addMessage('system', '🛑 Agent execution stopped by user.');
    }
  };

  const handleAutonomousAgent = async (question) => {
    try {
      const apiConfig = await apiKeyManager.getAPIKeyInfo();
      const apiKey = await apiKeyManager.getAPIKey();
      if (!apiKey) { addMessage('ai', 'No API key found. Please set up your API key first.'); return; }
      if (!apiConfig) { addMessage('ai', 'API configuration not found. Please set up your API key first.'); return; }
      const abortController = new AbortController();
      setCurrentAgentRequest(abortController);
      const response = await bridgeFetch('/api/ai/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ message: question, systemPrompt: 'You are an AI assistant with access to Redstring knowledge graph tools.', context: { activeGraphId, graphCount: graphs.size, hasAPIKey, apiConfig: apiConfig ? { provider: apiConfig.provider, endpoint: apiConfig.endpoint, model: apiConfig.model, settings: apiConfig.settings } : null } }),
        signal: abortController.signal
      });
      if (!response.ok) throw new Error(`Agent request failed: ${response.status} ${response.statusText}`);
      const result = await response.json();
      addMessage('ai', result.response || '', { toolCalls: result.toolCalls || [], iterations: result.iterations, mode: 'autonomous', isComplete: result.isComplete });
    } catch (error) {
      if (error.name !== 'AbortError') { console.error('[AI Collaboration] Autonomous agent failed:', error); addMessage('ai', `Agent error: ${error.message}`); }
    }
  };

  const handleQuestion = async (question) => {
    try {
      const apiConfig = await apiKeyManager.getAPIKeyInfo();
      if (!apiConfig) { addMessage('ai', 'Please set up your API key first by clicking the key icon in the header.'); return; }
      const apiKey = await apiKeyManager.getAPIKey();
      const response = await bridgeFetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify({ message: question, systemPrompt: `You are Claude, a **knowledge graph architect** with advanced spatial reasoning, helping with Redstring - a visual knowledge graph system for emergent human-AI cognition.

## **🧠 Your Identity**
You facilitate **emergent knowledge** - complex understanding that emerges from simple connections between ideas. You help humans discover hidden patterns, model complex systems, and visualize abstract concepts through intelligent spatial organization.

## **🌌 Spatial Intelligence**
You can "see" and reason about canvas layouts:
- **\`get_spatial_map\`** - View coordinates, clusters, empty regions, and layout analysis
- **Cluster detection** - Understand semantic groupings and relationships  
- **Smart positioning** - Place concepts to create visual flow and logical organization
- **Panel awareness** - Avoid UI constraints (left panel: 0-300px, header: 0-80px)

## **🔧 Core Tools**
**High-Level (Recommended):**
- **\`generate_knowledge_graph\`** - Create entire graphs with multiple concepts and intelligent layouts 🚀
- **\`addNodeToGraph\`** - Add individual concepts with intelligent spatial positioning
- **\`get_spatial_map\`** - Understand current layout and find optimal placement
- **\`verify_state\`** - Check system state and debug issues
- **\`search_nodes\`** - Find existing concepts to connect or reference

**Graph Navigation:**
- **\`list_available_graphs\`** - Explore knowledge spaces
- **\`get_active_graph\`** - Understand current context
- **\`create_edge\`** - Connect related concepts

## **🎯 Spatial-Semantic Workflow**
1. **Assess** → Use \`get_spatial_map\` to understand current layout
2. **Plan** → Consider both semantic relationships and visual organization  
3. **Position** → Place concepts near related clusters or in optimal empty regions
4. **Connect** → Create meaningful relationships that enhance understanding
5. **Explain** → Describe your spatial reasoning and layout decisions

## **📍 Context**
- Active graph: ${activeGraphId ? 'Yes' : 'No'}  
- Total graphs: ${graphs.size}
- Mode: Interactive collaboration

**Think systemically. Organize spatially. Build knowledge together.** 🚀`, context: { activeGraphId, graphCount: graphs.size, hasAPIKey, apiConfig: { provider: apiConfig.provider, endpoint: apiConfig.endpoint, model: apiConfig.model, settings: apiConfig.settings } } }) });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
      }
      const result = await response.json();
      if (result && typeof result === 'object' && 'response' in result) { addMessage('ai', (result.response || '').trim(), { toolCalls: result.toolCalls || [] }); return; }
      const aiResponse = typeof result === 'string' ? result : 'I had trouble forming a response.';
      addMessage('ai', aiResponse.trim(), { toolCalls: [] });
    } catch (error) {
      console.error('[AI Collaboration] Question handling failed:', error);
      addMessage('ai', 'I encountered an error while processing your question. Please try again or check your connection to the MCP server.');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const getGraphInfo = () => {
    if (!activeGraphId || !graphs.has(activeGraphId)) { return { name: 'No active graph', nodeCount: 0, edgeCount: 0 }; }
    const graph = graphs.get(activeGraphId);
    return { name: graph.name, nodeCount: graph.instances.size, edgeCount: graph.edgeIds.length };
  };
  const graphInfo = getGraphInfo();
  const toggleClearance = HEADER_HEIGHT + 14;
  const [fileStatus, setFileStatus] = React.useState(null);
  React.useEffect(() => {
    let mounted = true;
    const fetchFileStatus = async () => {
      try {
        const mod = await import('./store/fileStorage.js');
        if (typeof mod.getFileStatus === 'function') {
          const status = mod.getFileStatus();
          if (mounted) setFileStatus(status);
        }
      } catch {}
    };
    fetchFileStatus();
    const t = setInterval(fetchFileStatus, 3000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  return (
    <div className="ai-collaboration-panel">
      <div className="ai-panel-header">
        <div className="ai-mode-dropdown">
          <div className="ai-status-indicator-wrapper">
            <div className={`ai-status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
          </div>
          <select className="ai-mode-select" value={isAutonomousMode ? 'wizard' : 'chat'} onChange={(e) => setIsAutonomousMode(e.target.value === 'wizard')} aria-label="Mode">
            <option value="wizard">Wizard</option>
            <option value="chat">Chat</option>
          </select>
        </div>

        {/* Left aligned graph info next to Wizard */}
        <div className="ai-graph-info-left">
          <span className="ai-graph-name">{graphInfo.name}</span>
          <span className="ai-graph-stats">{graphInfo.nodeCount} nodes • {graphInfo.edgeCount} edges</span>
        </div>

        {/* Right aligned header actions */}
        <div className="ai-header-actions">
          <button 
            className={`ai-flat-button ${showAPIKeySetup ? 'active' : ''}`} 
            onClick={() => setShowAPIKeySetup(!showAPIKeySetup)} 
            title={hasAPIKey ? 'Manage API Key' : 'Setup API Key'}
          >
            <Key size={20} />
          </button>
          <button 
            className="ai-flat-button" 
            onClick={() => setShowAdvanced(!showAdvanced)} 
            title="Advanced Options"
          >
            <Settings size={20} />
          </button>
          <button 
            className={`ai-flat-button ${isConnected ? 'ai-refresh-button' : 'ai-connect-button'}`} 
            onClick={refreshBridgeConnection} 
            title={isConnected ? 'Refresh Connection' : 'Connect to MCP Server'} 
            disabled={isProcessing}
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>



      {showAPIKeySetup && (
        <div className="ai-api-setup-section">
          <APIKeySetup onKeySet={() => checkAPIKey()} onClose={() => setShowAPIKeySetup(false)} inline={true} />
        </div>
      )}

      <div className="ai-panel-content">
        <div className="ai-chat-mode">
          <div className="ai-messages" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: messages.length === 0 ? 'center' : 'flex-start' }}>
            {isConnected && messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#555', fontFamily: "'EmOne', sans-serif", fontSize: '14px' }}>What will we build today?</div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`ai-message ai-message-${message.sender}`} style={{ alignSelf: message.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div className="ai-message-avatar">{message.sender === 'user' ? <User size={16} /> : <Bot size={16} />}</div>
                <div className="ai-message-content">
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="ai-tool-calls">
                      {message.toolCalls.map((toolCall, index) => (
                        <div key={index} className={`ai-tool-call ai-tool-call-${toolCall.status || 'running'}`}>
                          <div className="ai-tool-call-header" style={{ cursor: 'pointer' }} onClick={() => {
                            setMessages(prev => prev.map(m => {
                              if (m.id !== message.id) return m;
                              const copy = { ...m };
                              copy.toolCalls = copy.toolCalls.map((c, ci) => ci === index ? { ...c, expanded: !c.expanded } : c);
                              return copy;
                            }));
                          }}>
                            <div className="ai-tool-call-icon" aria-hidden>
                              {toolCall.status === 'completed' ? <Square style={{ transform: 'rotate(45deg)' }} size={12} /> : toolCall.status === 'failed' ? <Square size={12} /> : <RotateCcw size={12} />}
                            </div>
                            <span className="ai-tool-call-name">{toolCall.name}</span>
                            <span className="ai-tool-call-status">{toolCall.status === 'completed' ? 'Completed' : toolCall.status === 'failed' ? 'Failed' : 'Running...'}</span>
                          </div>
                          {toolCall.args && toolCall.expanded && (<div className="ai-tool-call-args"><small>{JSON.stringify(toolCall.args, null, 2)}</small></div>)}
                          {toolCall.result && toolCall.expanded && (<div className="ai-tool-call-result"><div className="ai-tool-call-result-content">{toolCall.result}</div></div>)}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="ai-message-text" style={{ userSelect: 'text', cursor: 'text' }}>{message.content}</div>
                  <div className="ai-message-timestamp">{new Date(message.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="ai-message ai-message-ai" style={{ alignSelf: 'flex-start' }}>
                <div className="ai-message-avatar"><Bot size={16} /></div>
                <div className="ai-message-content">
                  <div className="ai-message-text">
                    <div className="ai-typing-spinner" aria-label="AI is thinking" />
                    <div className="ai-processing-status">{isAutonomousMode ? 'Agent thinking and using tools...' : 'Thinking...'}</div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="ai-input-container" style={{ marginBottom: toggleClearance }}>
            <textarea ref={inputRef} value={currentInput} onChange={(e) => setCurrentInput(e.target.value)} onKeyPress={handleKeyPress} placeholder={isAutonomousMode ? "Tell me what you want to accomplish (I'll use multiple tools to complete it)..." : "Ask me anything about your knowledge graph..."} disabled={isProcessing} className="ai-input" rows={2} />
            {isProcessing && currentAgentRequest ? (
              <button onClick={handleStopAgent} className="ai-stop-button" title="Stop Agent"><Square size={16} /></button>
            ) : (
              <button onClick={handleSendMessage} disabled={!currentInput.trim() || isProcessing} className="ai-send-button"><Send size={24} /></button>
            )}
          </div>
        </div>
      </div>
      
    </div>
  );
};

// Draggable Tab Component
const DraggableTab = ({ tab, index, displayTitle, dragItemTitle, moveTabAction, activateTabAction, closeTabAction }) => {
  const ref = useRef(null);

  const [, drop] = useDrop({
    accept: ItemTypes.TAB,
    hover(item, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index - 1;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientX = clientOffset.x - hoverBoundingRect.left;

      if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
        return;
      }
      if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
        return;
      }

      moveTabAction(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemTypes.TAB,
    item: () => ({
      id: tab.nodeId,
      index: index - 1,
      title: dragItemTitle,
      tab: tab
    }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const opacity = isDragging ? 0.4 : 1;
  const cursorStyle = isDragging ? 'grabbing' : 'pointer';
  const isActive = tab.isActive;
  const bg = isActive ? '#bdb5b5' : '#979090';

  drag(drop(ref));

  return (
    <div
      ref={ref}
      className="panel-tab"
      style={{
        opacity,
        backgroundColor: bg,
        borderTopLeftRadius: '10px',
        borderTopRightRadius: '10px',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        color: '#260000',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        fontFamily: "'EmOne', sans-serif",
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0px 8px',
        marginRight: '6px',
        height: '100%',
        cursor: cursorStyle,
        maxWidth: '150px',
        minWidth: '60px',
        flexShrink: 0,
        transition: 'opacity 0.1s ease'
      }}
      onClick={() => activateTabAction(index)}
    >
      <span style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginRight: '8px',
        userSelect: 'none'
      }}>
        {displayTitle}
      </span>
      <XCircle
        size={16}
        style={{
          marginLeft: 'auto',
          cursor: 'pointer',
          color: '#5c5c5c',
          zIndex: 2
        }}
        onClick={(e) => {
          e.stopPropagation();
          console.log('[DraggableTab Close Click] Tab object:', tab);
          closeTabAction(tab.nodeId);
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#260000'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#5c5c5c'}
      />
    </div>
  );
};

/**
 * Panel
 * 
 * - Home tab at index 0 (locked).
 * - Node tabs afterwards.
 * - Double-click logic is handled in NodeCanvas, which calls openNodeTab(nodeId, nodeName).
 * - "onSaveNodeData" merges bio/image (and now name) into the NodeCanvas state.
 * - Image is scaled horizontally with "objectFit: contain."
 * - The circle around X has a fade‑in transition on hover.
 */
const MIN_PANEL_WIDTH = 100;
const INITIAL_PANEL_WIDTH = 250;

// Helper to read width from storage
const getInitialWidth = (side, defaultValue) => {
  try {
    const storedWidth = localStorage.getItem(`panelWidth_${side}`);
    if (storedWidth !== null) {
      const parsedWidth = JSON.parse(storedWidth);
      if (typeof parsedWidth === 'number' && parsedWidth >= MIN_PANEL_WIDTH && parsedWidth <= window.innerWidth) {
         return parsedWidth;
      }
    }
  } catch (error) {
    console.error(`Error reading panelWidth_${side} from localStorage:`, error);
  }
  return defaultValue; 
};

// Helper to read the last *non-default* width
const getInitialLastCustomWidth = (side, defaultValue) => {
    // Attempt to read specific key first
    try {
      const stored = localStorage.getItem(`lastCustomPanelWidth_${side}`);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        // Ensure it's valid and not the default width itself
        if (typeof parsed === 'number' && parsed >= MIN_PANEL_WIDTH && parsed <= window.innerWidth && parsed !== INITIAL_PANEL_WIDTH) {
           return parsed;
        }
      }
    } catch (error) {
      console.error(`Error reading lastCustomPanelWidth_${side} from localStorage:`, error);
    }
    // Fallback: Read the current width, use if it's not the default
    const currentWidth = getInitialWidth(side, defaultValue);
    return currentWidth !== INITIAL_PANEL_WIDTH ? currentWidth : defaultValue;
  };

let panelRenderCount = 0; // Add counter outside component


const Panel = forwardRef(
  ({
    isExpanded,
    onToggleExpand,
    onFocusChange,
    side = 'right',
    // Add props for store data/actions
    activeGraphId, 
    storeActions,
    renderTrigger,
    graphName, 
    graphDescription,
    activeDefinitionNodeId: propActiveDefinitionNodeId,
    nodeDefinitionIndices = new Map(), // Context-specific definition indices 
    onStartHurtleAnimationFromPanel, // <<< Add new prop for animation
  }, ref) => {
    const [isScrolling, setIsScrolling] = useState(false);
    const [isHoveringScrollbar, setIsHoveringScrollbar] = useState(false);
    const scrollTimeoutRef = useRef(null);
    const scrollbarHoverTimeoutRef = useRef(null);
    panelRenderCount++; // Increment counter
    // --- Zustand State and Actions ---
    /* // Store subscription remains commented out
    const selector = useCallback(
        (state) => {
            // Select only ID and actions reactively
            const currentActiveGraphId = getActiveGraphId(state);
            return {
                activeGraphId: currentActiveGraphId,
                createNewGraph: state.createNewGraph,
                setActiveGraph: state.setActiveGraph,
                openRightPanelNodeTab: state.openRightPanelNodeTab,
                closeRightPanelTab: state.closeRightPanelTab,
                activateRightPanelTab: state.activateRightPanelTab,
                moveRightPanelTab: state.moveRightPanelTab,
                updateNode: state.updateNode,
                updateGraph: state.updateGraph,
            };
        },
        [side] // Side prop is stable, but keep it just in case?
    );

    const store = useGraphStore(selector, shallow);
    */

    // Destructure selected state and actions (Use props now)
    const createNewGraph = storeActions?.createNewGraph;
    const setActiveGraph = storeActions?.setActiveGraph;
    const openRightPanelNodeTab = storeActions?.openRightPanelNodeTab;
    const closeRightPanelTab = storeActions?.closeRightPanelTab;
    const activateRightPanelTab = storeActions?.activateRightPanelTab;
    const moveRightPanelTab = storeActions?.moveRightPanelTab;
    const updateNode = storeActions?.updateNode;
    const updateGraph = storeActions?.updateGraph;
    const closeGraph = storeActions?.closeGraph;
    const toggleGraphExpanded = storeActions?.toggleGraphExpanded;
    const toggleSavedNode = storeActions?.toggleSavedNode;
    const setActiveDefinitionNode = storeActions?.setActiveDefinitionNode;
    const createAndAssignGraphDefinition = storeActions?.createAndAssignGraphDefinition;
    const cleanupOrphanedData = storeActions?.cleanupOrphanedData;
    
    // activeGraphId is now directly available as a prop

    /* // Remove Dummy Values
    const activeGraphId = null;
    const createNewGraph = () => console.log("Dummy createNewGraph");
    const setActiveGraph = (id) => console.log("Dummy setActiveGraph", id);
    const openRightPanelNodeTab = (id) => console.log("Dummy openRightPanelNodeTab", id);
    const closeRightPanelTab = (index) => console.log("Dummy closeRightPanelTab", index);
    const activateRightPanelTab = (index) => console.log("Dummy activateRightPanelTab", index);
    const moveRightPanelTab = (from, to) => console.log("Dummy moveRightPanelTab", from, to);
    const updateNode = (id, fn) => console.log("Dummy updateNode", id, fn);
    const updateGraph = (id, fn) => console.log("Dummy updateGraph", id, fn);
    */

    // Get openGraphTab explicitly if not already done (ensure it's available)
    const openGraphTab = storeActions?.openGraphTab; 

    // Derive the array needed for the left panel grid (ALL graphs)
    const graphsForGrid = useMemo(() => {
        // Use getState() inside memo
        const currentGraphsMap = useGraphStore.getState().graphs;
        return Array.from(currentGraphsMap.values()).map(g => ({ id: g.id, name: g.name }));
    }, []); // No reactive dependencies needed?

    // <<< Select openGraphIds reactively >>>
    const openGraphIds = useGraphStore(state => state.openGraphIds);

    // <<< Select expanded state reactively >>>
    const expandedGraphIds = useGraphStore(state => state.expandedGraphIds); // <<< Select the Set

    // <<< ADD BACK: Select last created ID reactively >>>
    const lastCreatedGraphId = useGraphStore(state => state.lastCreatedGraphId);

    // <<< Select graphs map reactively >>>
    const graphsMap = useGraphStore(state => state.graphs);

    // <<< ADD: Select nodes and edges maps reactively >>>
    const nodePrototypesMap = useGraphStore(state => state.nodePrototypes);
    const edgesMap = useGraphStore(state => state.edges);
    const savedNodeIds = useGraphStore(state => state.savedNodeIds);
    // <<< ADD: Read activeDefinitionNodeId directly from the store >>>
    const activeDefinitionNodeId = useGraphStore(state => state.activeDefinitionNodeId);
    // <<< ADD: Select rightPanelTabs reactively >>>
    const rightPanelTabs = useGraphStore(state => state.rightPanelTabs);

    // Reserve bottom space for TypeList footer bar when visible
    const typeListMode = useGraphStore(state => state.typeListMode);
    const isTypeListVisible = typeListMode !== 'closed';
    const bottomSafeArea = isTypeListVisible ? HEADER_HEIGHT + 10 : 0; // footer height + small gap
    let effectiveBottomPadding = isTypeListVisible ? bottomSafeArea : 0; // refined after leftViewActive initializes

    // Derive saved nodes array reactively
    const savedNodes = useMemo(() => {
        return Array.from(savedNodeIds).map(id => nodePrototypesMap.get(id)).filter(Boolean);
    }, [savedNodeIds, nodePrototypesMap]);

    // Group saved nodes by their types
    const savedNodesByType = useMemo(() => {
        const groups = new Map();
        
        savedNodes.forEach(node => {
            // Get the type info for this node
            let typeId = node.typeNodeId;
            let typeInfo = null;
            
            if (typeId && nodePrototypesMap.has(typeId)) {
                // Node has a specific type
                const typeNode = nodePrototypesMap.get(typeId);
                typeInfo = {
                    id: typeId,
                    name: typeNode.name || 'Thing',
                    color: typeNode.color || '#8B0000'
                };
            } else {
                // Node has no type or invalid type, use default "Thing"
                typeId = 'default-thing';
                typeInfo = {
                    id: 'default-thing', 
                    name: 'Thing',
                    color: '#8B0000' // Default maroon color for untyped nodes
                };
            }
            
            if (!groups.has(typeId)) {
                groups.set(typeId, {
                    typeInfo,
                    nodes: []
                });
            }
            
            groups.get(typeId).nodes.push(node);
        });
        
        return groups;
    }, [savedNodes, nodePrototypesMap]);

    // <<< ADD Ref for the scrollable list container >>>
    const listContainerRef = useRef(null);

    // <<< ADD Ref to track previous open IDs >>>
    const prevOpenGraphIdsRef = useRef(openGraphIds);

    // <<< ADD BACK: Derive data for open graphs for the left panel list view >>>
    const openGraphsForList = useMemo(() => {
        return openGraphIds.map(id => {
            const graphData = graphsMap.get(id); // Use reactive graphsMap
            if (!graphData) return null; // Handle case where graph might not be found
            
            // Derive color from the defining node
            const definingNodeId = graphData.definingNodeIds?.[0];
            const definingNode = definingNodeId ? nodePrototypesMap.get(definingNodeId) : null;
            const graphColor = definingNode?.color || graphData.color || NODE_DEFAULT_COLOR;
            
            // Fetch nodes and edges using the REACTIVE maps
            const instances = graphData.instances ? Array.from(graphData.instances.values()) : [];
            const edgeIds = graphData.edgeIds || [];
            
            const nodes = instances.map(instance => {
                const prototype = nodePrototypesMap.get(instance.prototypeId);
                return { ...prototype, ...instance };
            }).filter(Boolean);

            const edges = edgeIds.map(edgeId => edgesMap.get(edgeId)).filter(Boolean); // Use edgesMap
            return { ...graphData, color: graphColor, nodes, edges }; // Combine graph data with its nodes/edges
        }).filter(Boolean); // Filter out any nulls
    }, [openGraphIds, graphsMap, nodePrototypesMap, edgesMap]); // Add nodePrototypesMap

    // ALL STATE DECLARATIONS - MOVED TO TOP TO AVOID INITIALIZATION ERRORS
    // Panel width state
    const [panelWidth, setPanelWidth] = useState(INITIAL_PANEL_WIDTH);
    const [lastCustomWidth, setLastCustomWidth] = useState(INITIAL_PANEL_WIDTH);
    const [isWidthInitialized, setIsWidthInitialized] = useState(false);
    const [isAnimatingWidth, setIsAnimatingWidth] = useState(false);
    const [isHandleHover, setIsHandleHover] = useState(false);
    
    // Editing state
    const [editingTitle, setEditingTitle] = useState(false); // Used by right panel node tabs
    const [tempTitle, setTempTitle] = useState(''); // Used by right panel node tabs
    const [editingProjectTitle, setEditingProjectTitle] = useState(false); // Used by right panel home tab
    const [tempProjectTitle, setTempProjectTitle] = useState(''); // Used by right panel home tab

    // Left panel view state and collapsed sections
    const [leftViewActive, setLeftViewActive] = useState('library'); // 'library', 'grid', 'federation', or 'ai'
    // Now that leftViewActive is initialized, refine the padding to avoid raising AI view
    if (side === 'left' && leftViewActive === 'ai') {
        effectiveBottomPadding = 0;
    }
    const [sectionCollapsed, setSectionCollapsed] = useState({});
    const [sectionMaxHeights, setSectionMaxHeights] = useState({});

    // Color picker state
    const [colorPickerVisible, setColorPickerVisible] = useState(false);
    const [colorPickerPosition, setColorPickerPosition] = useState({ x: 0, y: 0 });
    const [colorPickerNodeId, setColorPickerNodeId] = useState(null);

    // Add new state for type creation dialog
    const [typeNamePrompt, setTypeNamePrompt] = useState({ visible: false, name: '', color: null, targetNodeId: null, targetNodeName: '' });
    const [typeDialogColorPickerVisible, setTypeDialogColorPickerVisible] = useState(false);
    const [typeDialogColorPickerPosition, setTypeDialogColorPickerPosition] = useState({ x: 0, y: 0 });
    const [nodeSelectionGrid, setNodeSelectionGrid] = useState({ visible: false, position: { x: 0, y: 0 } });

    // Refs
    const isResizing = useRef(false);
    const panelRef = useRef(null);
    const titleInputRef = useRef(null); // Used by right panel
    const projectTitleInputRef = useRef(null); // Used by right panel
    const tabBarRef = useRef(null); // Used by right panel
    const initialWidthsSet = useRef(false); // Ref to track initialization
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);
    const projectBioTextareaRef = useRef(null);
    const nodeBioTextareaRef = useRef(null);
    const sectionContentRefs = useRef(new Map());

    const toggleSection = (name) => {
        // Simply toggle the collapsed state
        setSectionCollapsed(prev => ({ ...prev, [name]: !prev[name] }));
        console.log(`[toggleSection] Toggled section '${name}'. New collapsed state: ${!sectionCollapsed[name]}`);
    };

    // <<< Effect to scroll to TOP when new item added >>>
    useEffect(() => {
        // Only scroll if it's the left panel and the ref exists
        if (side === 'left' && listContainerRef.current) {
            // Check if the first ID is new compared to the previous render
            const firstId = openGraphIds.length > 0 ? openGraphIds[0] : null;
            const prevFirstId = prevOpenGraphIdsRef.current.length > 0 ? prevOpenGraphIdsRef.current[0] : null;
            
            // Only scroll if the first ID actually changed (and isn't null)
            if (firstId && firstId !== prevFirstId) {
                const container = listContainerRef.current;
                // Remove requestAnimationFrame to start scroll sooner
                // requestAnimationFrame(() => {
                if (container) {
                    console.log(`[Panel Effect] New item detected at top. Scrolling list container to top. Current scrollTop: ${container.scrollTop}`);
                    container.scrollTo({ top: 0, behavior: 'smooth' }); // <<< Keep smooth
                }
                // });
            }
        }
        
        // Update the ref for the next render *after* the effect runs
        prevOpenGraphIdsRef.current = openGraphIds;

    // Run when openGraphIds array reference changes OR side changes
    }, [openGraphIds, side]); 

    // Effect to update maxHeights for all sections when content changes or visibility toggles
    useEffect(() => {
        // Don't run if panelWidth hasn't been initialized yet
        if (!isWidthInitialized) {
            return;
        }

        const newMaxHeights = {};
        
        // Calculate heights for each type section
        savedNodesByType.forEach((group, typeId) => {
            const sectionRef = sectionContentRefs.current.get(typeId);
            let maxHeight = '0px'; // Default to collapsed height

            if (sectionRef) {
                const currentScrollHeight = sectionRef.scrollHeight;
            const potentialOpenHeight = `${currentScrollHeight}px`; 

            // Decide whether to use the calculated height or 0px
                if (!sectionCollapsed[typeId]) {
                // Section is OPEN, use the calculated height
                    maxHeight = potentialOpenHeight;
            } else {
                // Section is CLOSED, maxHeight remains '0px'
                    maxHeight = '0px';
            }
        } else {
            // Fallback if ref isn't ready (might happen on initial render)
                maxHeight = sectionCollapsed[typeId] ? '0px' : '500px';
        }

            newMaxHeights[typeId] = maxHeight;
        });

        // Set the state
        setSectionMaxHeights(newMaxHeights);

    }, [savedNodesByType, sectionCollapsed, panelWidth, isWidthInitialized]); // Rerun when savedNodesByType, collapsed state, or panel width changes

    // Effect to close color pickers when type dialog closes
    useEffect(() => {
        if (!typeNamePrompt.visible) {
            setTypeDialogColorPickerVisible(false);
        }
    }, [typeNamePrompt.visible]);

    // Effect to close color pickers when switching between views/contexts
    useEffect(() => {
        // Close any open color pickers when panel side or context changes
        setColorPickerVisible(false);
        setColorPickerNodeId(null);
        setTypeDialogColorPickerVisible(false);
    }, [leftViewActive]); // Close when switching left panel views

    useEffect(() => {
      // Load initial widths from localStorage ONCE on mount
      if (!initialWidthsSet.current) {
          const initialWidth = getInitialWidth(side, INITIAL_PANEL_WIDTH);
          const initialLastCustom = getInitialLastCustomWidth(side, INITIAL_PANEL_WIDTH);
          setPanelWidth(initialWidth);
          setLastCustomWidth(initialLastCustom);
          setIsWidthInitialized(true);
          initialWidthsSet.current = true; // Mark as set
          // console.log(`[Panel ${side} Mount Effect] Loaded initial widths:`, { initialWidth, initialLastCustom });
      }
    }, [side]); // Run once on mount (and if side changes, though unlikely)

    useEffect(() => {
      if (editingTitle && titleInputRef.current) {
        const inputElement = titleInputRef.current;

        // Function to calculate and set width
        const updateInputWidth = () => {
          const text = inputElement.value; // Use current value from input directly
          const style = window.getComputedStyle(inputElement);

          const tempSpan = document.createElement('span');
          tempSpan.style.font = style.font; // Includes family, size, weight, etc.
          tempSpan.style.letterSpacing = style.letterSpacing;
          tempSpan.style.visibility = 'hidden';
          tempSpan.style.position = 'absolute';
          tempSpan.style.whiteSpace = 'pre'; // Handles spaces correctly

          // Use a non-empty string for measurement if text is empty
          tempSpan.innerText = text || ' '; // Measure at least a space to get padding/border accounted for by font style
          
          document.body.appendChild(tempSpan);
          const textWidth = tempSpan.offsetWidth;
          document.body.removeChild(tempSpan);

          const paddingLeft = parseFloat(style.paddingLeft) || 0;
          const paddingRight = parseFloat(style.paddingRight) || 0;
          const borderLeft = parseFloat(style.borderLeftWidth) || 0;
          const borderRight = parseFloat(style.borderRightWidth) || 0;

          // Total width is text width (which includes its own padding if span styled so) 
          // or text width + input's padding + input's border
          // Let's try with textWidth from span (assuming span has no extra padding/border) + structural parts of input
          let newWidth = textWidth + paddingLeft + paddingRight + borderLeft + borderRight;

          const minWidth = 40; // Minimum pixel width for the input
          if (newWidth < minWidth) {
            newWidth = minWidth;
          }

          inputElement.style.width = `${newWidth}px`;
        };

        inputElement.focus();
        inputElement.select();
        updateInputWidth(); // Initial width set

        inputElement.addEventListener('input', updateInputWidth);

        // Cleanup
        return () => {
          inputElement.removeEventListener('input', updateInputWidth);
          // Optionally reset width if the component is re-rendered without editingTitle
          // This might be needed if the style.width persists undesirably
           if (inputElement) { // Check if still mounted
            inputElement.style.width = 'auto'; // Or initial fixed width if it had one
           }
        };
      } else if (titleInputRef.current) {
        // If editingTitle becomes false, reset width for the next time it's opened
        titleInputRef.current.style.width = 'auto';
      }
    }, [editingTitle]); // Effect for focus, select, and dynamic width

    useEffect(() => {
      if (editingProjectTitle && projectTitleInputRef.current) {
        const inputElement = projectTitleInputRef.current;

        const updateInputWidth = () => {
          const text = inputElement.value;
          const style = window.getComputedStyle(inputElement);
          const tempSpan = document.createElement('span');
          tempSpan.style.font = style.font;
          tempSpan.style.letterSpacing = style.letterSpacing;
          tempSpan.style.visibility = 'hidden';
          tempSpan.style.position = 'absolute';
          tempSpan.style.whiteSpace = 'pre';
          tempSpan.innerText = text || ' ';
          document.body.appendChild(tempSpan);
          const textWidth = tempSpan.offsetWidth;
          document.body.removeChild(tempSpan);

          const paddingLeft = parseFloat(style.paddingLeft) || 0;
          const paddingRight = parseFloat(style.paddingRight) || 0;
          const borderLeft = parseFloat(style.borderLeftWidth) || 0;
          const borderRight = parseFloat(style.borderRightWidth) || 0;
          let newWidth = textWidth + paddingLeft + paddingRight + borderLeft + borderRight;
          const minWidth = 60; // Slightly larger min-width for project title?
          if (newWidth < minWidth) {
            newWidth = minWidth;
          }
          inputElement.style.width = `${newWidth}px`;
        };

        inputElement.focus();
        inputElement.select();
        updateInputWidth(); // Initial width set

        inputElement.addEventListener('input', updateInputWidth);

        return () => {
          inputElement.removeEventListener('input', updateInputWidth);
          if (inputElement) {
            inputElement.style.width = 'auto';
          }
        };
      } else if (projectTitleInputRef.current) {
        projectTitleInputRef.current.style.width = 'auto';
      }
    }, [editingProjectTitle]);

    // Exposed so NodeCanvas can open tabs
    const openNodeTab = (nodeId) => {
       if (side !== 'right') return;
       // console.log(`[Panel ${side}] Imperative openNodeTab called for ${nodeId}`);
       openRightPanelNodeTab(nodeId);
       setEditingTitle(false);
    };

    useImperativeHandle(ref, () => ({
      openNodeTab,
    }));

    // --- Resize Handlers (Reordered definitions) ---
    const updateWidthForClientX = useCallback((clientX) => {
      const dx = clientX - resizeStartX.current;
      let newWidth;
      if (side === 'left') {
        newWidth = resizeStartWidth.current + dx;
      } else {
        newWidth = resizeStartWidth.current - dx;
      }
      const maxWidth = window.innerWidth / 2;
      const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, maxWidth));
      setPanelWidth(clampedWidth);
    }, [side]);

    const handleResizeMouseMove = useCallback((e) => {
      if (!isResizing.current) return;
      updateWidthForClientX(e.clientX);
    }, [updateWidthForClientX]);

    const handleResizeTouchMove = useCallback((e) => {
      if (!isResizing.current) return;
      if (e.touches && e.touches.length > 0) {
        updateWidthForClientX(e.touches[0].clientX);
      }
    }, [updateWidthForClientX]);

    const handleResizeMouseUp = useCallback(() => {
      if (isResizing.current) {
        isResizing.current = false;
        window.removeEventListener('mousemove', handleResizeMouseMove);
        window.removeEventListener('touchmove', handleResizeTouchMove);
        window.removeEventListener('mouseup', handleResizeMouseUp);
        window.removeEventListener('touchend', handleResizeMouseUp);
        document.body.style.userSelect = ''; 
        document.body.style.cursor = ''; 

        // Wrap state update and localStorage access in requestAnimationFrame
        requestAnimationFrame(() => { 
            try {
                const finalWidth = panelRef.current?.offsetWidth; // Get final width
                if (finalWidth) {
                    // Save current width
                    localStorage.setItem(`panelWidth_${side}`, JSON.stringify(finalWidth));
                    // If it's not the default AND different from the current lastCustomWidth, save as last custom width
                    if (finalWidth !== INITIAL_PANEL_WIDTH && finalWidth !== lastCustomWidth) {
                      setLastCustomWidth(finalWidth); // Update state inside RAF only if different
                      localStorage.setItem(`lastCustomPanelWidth_${side}`, JSON.stringify(finalWidth));
                    }
                    // Notify global listeners (e.g., NodeCanvas overlay resizers)
                    try {
                      window.dispatchEvent(new CustomEvent('panelWidthChanged', { detail: { side, width: finalWidth } }));
                    } catch {}
                }
            } catch (error) {
                console.error(`Error saving panelWidth_${side} to localStorage:`, error);
            }
        });
      }
    }, [side, handleResizeMouseMove, handleResizeTouchMove, lastCustomWidth]); // <<< Added lastCustomWidth to dependencies

    const handleResizeMouseDown = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = panelRef.current?.offsetWidth || panelWidth;
      window.addEventListener('mousemove', handleResizeMouseMove);
      window.addEventListener('mouseup', handleResizeMouseUp);
      window.addEventListener('touchmove', handleResizeTouchMove, { passive: false });
      window.addEventListener('touchend', handleResizeMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }, [handleResizeMouseMove, handleResizeMouseUp, handleResizeTouchMove, panelWidth]);

    const handleResizeTouchStart = useCallback((e) => {
      if (!(e.touches && e.touches.length > 0)) return;
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      resizeStartX.current = e.touches[0].clientX;
      resizeStartWidth.current = panelRef.current?.offsetWidth || panelWidth;
      window.addEventListener('touchmove', handleResizeTouchMove, { passive: false });
      window.addEventListener('touchend', handleResizeMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }, [handleResizeTouchMove, handleResizeMouseUp, panelWidth]);

    // --- Double Click Handler ---
    const handleHeaderDoubleClick = useCallback((e) => {
      // console.log('[Panel DblClick] Handler triggered');
      const target = e.target;

      // Check if the click originated within a draggable tab element
      if (target.closest('.panel-tab')) { 
        // console.log('[Panel DblClick] Click originated inside a .panel-tab, exiting.');
        return;
      }
      
      // If we reach here, the click was on the header bar itself or empty space within it.
      // console.log('[Panel DblClick] Click target OK (not inside a tab).');

      let newWidth;
      // console.log('[Panel DblClick] Before toggle:', { currentWidth: panelWidth, lastCustom: lastCustomWidth });
      
      if (panelWidth === INITIAL_PANEL_WIDTH) {
        // Toggle to last custom width (if it's different)
        newWidth = (lastCustomWidth !== INITIAL_PANEL_WIDTH) ? lastCustomWidth : panelWidth; 
        // console.log('[Panel DblClick] Was default, toggling to last custom (or current if same):', newWidth);
      } else {
        // Current width is custom, save it as last custom and toggle to default
        // console.log('[Panel DblClick] Was custom, saving current as last custom:', panelWidth);
        setLastCustomWidth(panelWidth); // Update state
        try { // Separate try/catch for this specific save
          localStorage.setItem(`lastCustomPanelWidth_${side}`, JSON.stringify(panelWidth));
        } catch (error) {
          console.error(`Error saving lastCustomPanelWidth_${side} before toggle:`, error);
        }
        newWidth = INITIAL_PANEL_WIDTH;
        // console.log('[Panel DblClick] Toggling to default:', newWidth);
      }

      if (newWidth !== panelWidth) {
        setIsAnimatingWidth(true);
        setPanelWidth(newWidth);
        try {
          localStorage.setItem(`panelWidth_${side}`, JSON.stringify(newWidth));
          // Broadcast change so external overlays can sync
          try {
            window.dispatchEvent(new CustomEvent('panelWidthChanged', { detail: { side, width: newWidth } }));
          } catch {}
        } catch (error) {
          console.error(`Error saving panelWidth_${side} after double click:`, error);
        }
      } else {
        // console.log('[Panel DblClick] Width did not change, no update needed.');
      }
    }, [panelWidth, lastCustomWidth, side]);

    // Listen for external resizer overlay updates from NodeCanvas for low-latency sync
    useEffect(() => {
      const onChanging = (e) => {
        if (!e?.detail) return;
        const { side: evtSide, width } = e.detail;
        if (evtSide === side && typeof width === 'number') {
          setPanelWidth(width);
        }
      };
      const onChanged = (e) => {
        if (!e?.detail) return;
        const { side: evtSide, width } = e.detail;
        if (evtSide === side && typeof width === 'number') {
          setPanelWidth(width);
          try {
            localStorage.setItem(`panelWidth_${side}`, JSON.stringify(width));
          } catch {}
        }
      };
      window.addEventListener('panelWidthChanging', onChanging);
      window.addEventListener('panelWidthChanged', onChanged);
      return () => {
        window.removeEventListener('panelWidthChanging', onChanging);
        window.removeEventListener('panelWidthChanged', onChanged);
      };
    }, [side]);

    // Effect for cleanup
    useEffect(() => {
      // Cleanup function to remove listeners if component unmounts while resizing
      return () => {
        if (isResizing.current) {
          window.removeEventListener('mousemove', handleResizeMouseMove);
          window.removeEventListener('mouseup', handleResizeMouseUp);
          document.body.style.userSelect = ''; 
          document.body.style.cursor = ''; 
        }
      };
    }, [handleResizeMouseMove, handleResizeMouseUp]);

    // Scrollbar hover detection
    const handleScrollbarMouseEnter = useCallback((e) => {
        // Check if mouse is over the scrollbar area (right edge of the element)
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const scrollbarWidth = 20; // Should match CSS scrollbar width
        
        if (mouseX >= rect.width - scrollbarWidth) {
            setIsHoveringScrollbar(true);
            if (scrollbarHoverTimeoutRef.current) {
                clearTimeout(scrollbarHoverTimeoutRef.current);
            }
        }
    }, []);

    const handleScrollbarMouseMove = useCallback((e) => {
        // Check if mouse is still over the scrollbar area
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const scrollbarWidth = 20; // Should match CSS scrollbar width
        
        const isOverScrollbar = mouseX >= rect.width - scrollbarWidth;
        
        if (isOverScrollbar && !isHoveringScrollbar) {
            setIsHoveringScrollbar(true);
            if (scrollbarHoverTimeoutRef.current) {
                clearTimeout(scrollbarHoverTimeoutRef.current);
            }
        } else if (!isOverScrollbar && isHoveringScrollbar) {
            // Start timeout to fade scrollbar after leaving
            scrollbarHoverTimeoutRef.current = setTimeout(() => {
                setIsHoveringScrollbar(false);
            }, 300); // 300ms delay before fading
        }
    }, [isHoveringScrollbar]);

    const handleScrollbarMouseLeave = useCallback(() => {
        // Start timeout to fade scrollbar after leaving the element
        scrollbarHoverTimeoutRef.current = setTimeout(() => {
            setIsHoveringScrollbar(false);
        }, 300); // 300ms delay before fading
    }, []);

    // Cleanup scrollbar hover timeout on unmount
    useEffect(() => {
        return () => {
            if (scrollbarHoverTimeoutRef.current) {
                clearTimeout(scrollbarHoverTimeoutRef.current);
            }
        };
    }, []);

    // <<< Add Effect to reset animation state after transition >>>
    useEffect(() => {
        let timeoutId = null;
        if (isAnimatingWidth) {
          // Set timeout matching the transition duration
          timeoutId = setTimeout(() => {
            setIsAnimatingWidth(false);
          }, 200); // Duration of width transition
        }
        // Cleanup the timeout if the component unmounts or state changes again
        return () => clearTimeout(timeoutId);
      }, [isAnimatingWidth]);
    // --- End Resize Handlers & related effects ---

    // --- Determine Active View/Tab --- 
    // Get tabs reactively if side is 'right'
    const activeRightPanelTab = useMemo(() => {
        if (side !== 'right') return null;
        return rightPanelTabs.find((t) => t.isActive);
    }, [side, rightPanelTabs]); // Depend on side and the reactive tabs

    // Derive nodes for active graph on right side (Calculate on every render)
    const activeGraphNodes = useMemo(() => {
        if (side !== 'right' || !activeGraphId) return [];
        // Use the new hydrated selector which is more efficient
        return getHydratedNodesForGraph(activeGraphId)(useGraphStore.getState());
    }, [activeGraphId, side]); // Removed unnecessary dependencies

    // Auto-resize project bio textarea when content changes or tab becomes active
    React.useLayoutEffect(() => {
      if (side === 'right' && activeRightPanelTab?.type === 'home') {
        autoResizeTextarea(projectBioTextareaRef);
      }
    }, [side, activeRightPanelTab?.type, graphDescription]);

    // Auto-resize node bio textarea when content changes or tab becomes active
    React.useLayoutEffect(() => {
      if (side === 'right' && activeRightPanelTab?.type === 'node') {
        // Trigger auto-resize immediately without delay
        autoResizeTextarea(nodeBioTextareaRef);
      }
    }, [side, activeRightPanelTab?.type, activeRightPanelTab?.nodeId, activeGraphId, nodeDefinitionIndices, graphsMap]);

    // --- Action Handlers defined earlier --- 
    const handleAddImage = (nodeId) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (loadEvent) => {
          const fullImageSrc = loadEvent.target?.result;
          if (typeof fullImageSrc !== 'string') return;
          const img = new Image();
          img.onload = async () => {
            try {
              const aspectRatio = (img.naturalHeight > 0 && img.naturalWidth > 0) ? img.naturalHeight / img.naturalWidth : 1;
              const thumbSrc = await generateThumbnail(fullImageSrc, THUMBNAIL_MAX_DIMENSION);
              const nodeDataToSave = { imageSrc: fullImageSrc, thumbnailSrc: thumbSrc, imageAspectRatio: aspectRatio };
              console.log('Calling store updateNodePrototype with image data:', nodeId, nodeDataToSave); // Keep log for this one
              // Call store action directly (using prop)
              storeActions.updateNodePrototype(nodeId, draft => { Object.assign(draft, nodeDataToSave); });
            } catch (error) {
              // console.error("Thumbnail/save failed:", error);
              // Handle error appropriately, e.g., show a message to the user
            }
          };
          img.onerror = (error) => { 
             // console.error('Image load failed:', error);
             // Handle error appropriately
           };
          img.src = fullImageSrc;
        };
        reader.onerror = (error) => {
          // console.error('FileReader failed:', error);
          // Handle error appropriately
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    const handleBioChange = (nodeId, newBio) => {
        if (!activeGraphId) return;
        
        // Get the node data to check if it has definitions
        const nodeData = nodePrototypesMap.get(nodeId);
        
        // If node has definitions, update the current definition graph's description
        if (nodeData && nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0) {
            // Get the context-specific definition index
            const contextKey = `${nodeId}-${activeGraphId}`;
            const currentIndex = nodeDefinitionIndices.get(contextKey) || 0;
            
            // Get the graph ID for the current definition
            const currentDefinitionGraphId = nodeData.definitionGraphIds[currentIndex] || nodeData.definitionGraphIds[0];
            
            // Update the definition graph's description
            if (currentDefinitionGraphId) {
                updateGraph(currentDefinitionGraphId, draft => { draft.description = newBio; });
                return;
            }
        }
        
        // Fallback: update the node's own description
        storeActions.updateNodePrototype(nodeId, draft => { draft.description = newBio; });
    };

    const commitProjectTitleChange = () => {
      // Get CURRENT activeGraphId directly from store
      const currentActiveId = useGraphStore.getState().activeGraphId;
      if (!currentActiveId) {
        console.warn("commitProjectTitleChange: No active graph ID found in store.");
        setEditingProjectTitle(false); // Still stop editing
        return;
      }
      const newName = tempProjectTitle.trim() || 'Untitled';
      // Call store action directly (using prop and current ID)
      updateGraph(currentActiveId, draft => { draft.name = newName; });
      setEditingProjectTitle(false);
    };

    // Handle color picker change
    const handleColorChange = (newColor) => {
      if (colorPickerNodeId && storeActions?.updateNodePrototype) {
        storeActions.updateNodePrototype(colorPickerNodeId, draft => {
          draft.color = newColor;
        });
      }
    };

    // Handle opening color picker with toggle behavior
    const handleOpenColorPicker = (nodeId, iconElement, event) => {
      event.stopPropagation();
      
      // If already open for the same node, close it (toggle behavior)
      if (colorPickerVisible && colorPickerNodeId === nodeId) {
        setColorPickerVisible(false);
        setColorPickerNodeId(null);
        return;
      }
      
      // Open color picker - align right edges
      const rect = iconElement.getBoundingClientRect();
      setColorPickerPosition({ x: rect.right, y: rect.bottom });
      setColorPickerNodeId(nodeId);
      setColorPickerVisible(true);
    };

    // Handle closing color picker
    const handleCloseColorPicker = () => {
      setColorPickerVisible(false);
      setColorPickerNodeId(null);
    };

    // Auto-resize textarea helper function
    const autoResizeTextarea = (textareaRef) => {
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        // Reset height to auto to get the scrollHeight
        textarea.style.height = 'auto';
        // Set height to scrollHeight (content height) with min and max bounds
        const minHeight = 60; // Minimum height in pixels
        const maxHeight = 300; // Maximum height in pixels
        const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
        textarea.style.height = `${newHeight}px`;
      }
    };

    // Add new handler for type creation
    const handleOpenTypeDialog = (nodeId, clickEvent) => {
      // Prevent opening type dialog for the base "Thing" type
      if (nodeId === 'base-thing-prototype') {
        console.log(`Cannot change type of base "Thing" - it must remain the fundamental type.`);
        return;
      }
      
      const nodeName = nodePrototypesMap.get(nodeId)?.name || 'this thing';
      // Truncate long node names to keep dialog manageable
      const truncatedNodeName = nodeName.length > 20 ? nodeName.substring(0, 20) + '...' : nodeName;
      
      setTypeNamePrompt({ 
        visible: true, 
        name: '', 
        color: null, 
        targetNodeId: nodeId,
        targetNodeName: truncatedNodeName
      });
      
      // Calculate position for the node selection grid - dynamic based on dialog content
      const dialogTop = HEADER_HEIGHT + 25;
      // More accurate height estimate for larger dialog with explanatory text
      const dialogHeight = 160; // Increased from 120 to account for explanatory text
      const gridTop = dialogTop + dialogHeight + 10; // 10px spacing below dialog
      const dialogWidth = 300; // Match dialog width
      const gridLeft = window.innerWidth / 2 - dialogWidth / 2; // Center to match dialog
      
      setNodeSelectionGrid({ 
        visible: true, 
        position: { x: gridLeft, y: gridTop } 
      });
    };

    const handleCloseTypePrompt = () => {
      setTypeNamePrompt({ visible: false, name: '', color: null, targetNodeId: null, targetNodeName: '' });
      setTypeDialogColorPickerVisible(false);
      setNodeSelectionGrid({ visible: false, position: { x: 0, y: 0 } });
    };

    const handleTypePromptSubmit = () => {
      const name = typeNamePrompt.name.trim();
      const targetNodeId = typeNamePrompt.targetNodeId;
      
      if (name && targetNodeId) {
        // Create new type prototype
        const newTypeId = uuidv4();
        const newTypeData = {
          id: newTypeId,
          name: name,
          description: '',
          color: typeNamePrompt.color || '#8B0000', // Default to maroon
          definitionGraphIds: [],
          typeNodeId: null, // Types have no parent type
        };
        
        // Add the prototype to the store
        storeActions.addNodePrototype(newTypeData);
        
        // Set this node's type to the new type
        storeActions.setNodeType(targetNodeId, newTypeId);
        
        console.log(`Created new type "${name}" and assigned to node ${targetNodeId}`);
      }
      
      handleCloseTypePrompt();
    };

    // Type dialog color picker handlers
    const handleTypeDialogColorPickerOpen = (iconElement, event) => {
      event.stopPropagation();
      const rect = iconElement.getBoundingClientRect();
      setTypeDialogColorPickerPosition({ x: rect.right, y: rect.bottom });
      setTypeDialogColorPickerVisible(true);
    };

    const handleTypeDialogColorPickerClose = () => {
      setTypeDialogColorPickerVisible(false);
    };

    const handleTypeDialogColorChange = (color) => {
      setTypeNamePrompt(prev => ({ ...prev, color }));
    };

    // Handle selecting an existing node as a type
    const handleNodeSelectionForType = (selectedPrototype) => {
      const targetNodeId = typeNamePrompt.targetNodeId;
      if (targetNodeId && selectedPrototype) {
        // Set the selected prototype as the type for the target node
        storeActions.setNodeType(targetNodeId, selectedPrototype.id);
        console.log(`Set type of node ${targetNodeId} to existing type: ${selectedPrototype.name}`);
      }
      handleCloseTypePrompt();
    };

    // --- Generate Content based on Side ---
    let panelContent = null;
    if (side === 'left') {
        if (leftViewActive === 'library') {
            panelContent = (
              <LeftLibraryView
                savedNodesByType={savedNodesByType}
                sectionCollapsed={sectionCollapsed}
                sectionMaxHeights={sectionMaxHeights}
                toggleSection={toggleSection}
                panelWidth={panelWidth}
                sectionContentRefs={sectionContentRefs}
                activeDefinitionNodeId={activeDefinitionNodeId}
                openGraphTab={openGraphTab}
                createAndAssignGraphDefinition={createAndAssignGraphDefinition}
                toggleSavedNode={toggleSavedNode}
                openRightPanelNodeTab={openRightPanelNodeTab}
              />
            );
        } else if (leftViewActive === 'grid') {
            const handleGridItemClick = (graphId) => { if (leftViewActive === 'grid') setActiveGraph(graphId); };
            panelContent = (
              <LeftGridView
                openGraphsForList={openGraphsForList}
                panelWidth={panelWidth}
                listContainerRef={listContainerRef}
                activeGraphId={activeGraphId}
                expandedGraphIds={expandedGraphIds}
                handleGridItemClick={handleGridItemClick}
                closeGraph={closeGraph}
                toggleGraphExpanded={toggleGraphExpanded}
              />
            );
        } else if (leftViewActive === 'federation') {
            // Git-Native Federation view for revolutionary protocol
            panelContent = (
                <div className="panel-content-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <GitNativeFederation />
                </div>
            );
        } else if (leftViewActive === 'ai') {
            // AI Collaboration view (inlined)
            panelContent = (
                <div className="panel-content-inner ai-panel" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    height: '100%', 
                    padding: 0
                }}>
                    <LeftAIView />
                </div>
            );
        }
    } else { // side === 'right'
        if (!activeRightPanelTab) {
            panelContent = <div className="panel-content-inner">No tab selected...</div>;
        } else if (activeRightPanelTab.type === 'home') {
            // Get the defining node for the current graph to show its data
            const currentGraph = graphsMap.get(activeGraphId);
            let definingNodeId = currentGraph?.definingNodeIds?.[0];
            let definingNodeData = definingNodeId ? nodePrototypesMap.get(definingNodeId) : null;
            
            // If no defining node exists, create one to represent this graph
            if (!definingNodeData && currentGraph) {
                console.log(`[Panel] Graph ${activeGraphId} has no defining node. Creating one.`);
                
                definingNodeId = uuidv4();
                const newDefiningNodeData = {
                    id: definingNodeId,
                    name: currentGraph.name || 'Untitled Graph',
                    description: currentGraph.description || '',
                    color: currentGraph.color || NODE_DEFAULT_COLOR,
                    typeNodeId: null,
                    definitionGraphIds: [activeGraphId]
                };
                
                // Update the store with the new defining node
                storeActions.addNodePrototype(newDefiningNodeData);
                storeActions.updateGraph(activeGraphId, draft => {
                    if (!draft.definingNodeIds) {
                        draft.definingNodeIds = [];
                    }
                    if (!draft.definingNodeIds.includes(definingNodeId)) {
                        draft.definingNodeIds.unshift(definingNodeId);
                    }
                });
                
                definingNodeData = newDefiningNodeData;
                console.log(`[Panel] Created defining node ${definingNodeId} for graph ${activeGraphId}.`);
            }

            // Get type information for the defining node
            const getTypeInfo = () => {
                if (!definingNodeData || !definingNodeData.typeNodeId) {
                    return { typeName: 'Thing', typeColor: '#8B0000' }; // Default to Thing
                }
                const typeNode = nodePrototypesMap.get(definingNodeData.typeNodeId);
                return {
                    typeName: typeNode?.name || 'Thing',
                    typeColor: typeNode?.color || '#8B0000'
                };
            };

            const { typeName, typeColor } = getTypeInfo();

            // Check if expand button should be disabled (can't expand to current graph)
            const hasDefinitions = definingNodeData?.definitionGraphIds?.length > 0;
            const firstDefinitionGraphId = definingNodeData?.definitionGraphIds?.[0];
            const isExpandDisabled = firstDefinitionGraphId === activeGraphId;

            panelContent = (
                <div className="panel-content-inner home-tab">
                    {/* Header with title and buttons - same layout as node tabs */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        {editingProjectTitle ? (
                            <input
                                ref={projectTitleInputRef}
                                type="text"
                                id="project-title-input"
                                name="projectTitleInput"
                                className="editable-title-input"
                                value={tempProjectTitle}
                                onChange={(e) => setTempProjectTitle(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitProjectTitleChange(); }}
                                onBlur={commitProjectTitleChange}
                                onFocus={() => onFocusChange?.(true)}
                                style={{ fontFamily: "'EmOne', sans-serif" }}
                            />
                        ) : (
                            <div
                                style={{
                                    backgroundColor: definingNodeData?.color || NODE_DEFAULT_COLOR,
                                    borderRadius: '8px',
                                    padding: '5px 10px',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    userSelect: 'none',
                                    fontSize: '1.1rem',
                                    fontWeight: 'bold',
                                    fontFamily: "'EmOne', sans-serif",
                                    color: '#bdb5b5',
                                    margin: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    minHeight: '32px', // Match the height that the input would have
                                    boxSizing: 'border-box'
                                }}
                                onDoubleClick={() => {
                                    setEditingProjectTitle(true);
                                    setTempProjectTitle(graphName);
                                }}
                            >
                                <span style={{
                                    display: 'inline-block',
                                    maxWidth: '210px',
                                    whiteSpace: 'normal',
                                    overflowWrap: 'break-word',
                                    verticalAlign: 'bottom',
                                    fontFamily: "'EmOne', sans-serif"
                                }}>
                                    {graphName ?? 'Loading...'}
                                </span>
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
                            {/* Color Picker Icon */}
                            <Palette
                                size={20}
                                color="#260000"
                                style={{ cursor: 'pointer', flexShrink: 0 }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (definingNodeId) {
                                        handleOpenColorPicker(definingNodeId, e.currentTarget, e);
                                    }
                                }}
                                title="Change color"
                            />
                            {/* Expand Icon - Unified logic: always show, handle both cases */}
                            <ArrowUpFromDot
                                size={20}
                                color="#260000"
                                style={{ 
                                    cursor: isExpandDisabled ? 'not-allowed' : 'pointer', 
                                    flexShrink: 0,
                                    opacity: isExpandDisabled ? 0.3 : 1,
                                    transition: 'opacity 0.2s ease',
                                }}
                                onClick={(e) => {
                                    if (isExpandDisabled || !definingNodeId) return;

                                    if (hasDefinitions) {
                                        // Has definitions - animate to existing definition
                                        if (onStartHurtleAnimationFromPanel && firstDefinitionGraphId) {
                                            const iconRect = e.currentTarget.getBoundingClientRect();
                                            onStartHurtleAnimationFromPanel(definingNodeId, firstDefinitionGraphId, definingNodeId, iconRect);
                                        } else if (storeActions?.openGraphTabAndBringToTop && firstDefinitionGraphId) {
                                            storeActions.openGraphTabAndBringToTop(firstDefinitionGraphId, definingNodeId);
                                        }
                                    } else {
                                        // No definitions - create one first, then animate (with delay like node tab)
                                        const iconRect = e.currentTarget.getBoundingClientRect();
                                        storeActions.createAndAssignGraphDefinitionWithoutActivation(definingNodeId);
                                        setTimeout(() => {
                                            const currentState = useGraphStore.getState();
                                            const updatedNodeData = currentState.nodePrototypes.get(definingNodeId);
                                            if (updatedNodeData?.definitionGraphIds?.length > 0) {
                                                const newGraphId = updatedNodeData.definitionGraphIds[updatedNodeData.definitionGraphIds.length - 1];
                                                onStartHurtleAnimationFromPanel(definingNodeId, newGraphId, definingNodeId, iconRect);
                                            }
                                        }, 150);
                                    }
                                }}
                                title={
                                    isExpandDisabled 
                                        ? "This graph is already open" 
                                        : hasDefinitions 
                                            ? "Open definition in new tab"
                                            : "Create new definition"
                                }
                            />
                            <ImagePlus
                                size={20}
                                color="#260000"
                                style={{ cursor: 'pointer', flexShrink: 0 }}
                                onClick={() => definingNodeId && handleAddImage(definingNodeId)}
                            />
                        </div>
                    </div>

                    {/* Type information */}
                    <div style={{ 
                        marginBottom: '8px', 
                        fontSize: '0.9rem', 
                        fontFamily: "'EmOne', sans-serif",
                        color: '#555',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <span style={{ fontFamily: "'EmOne', sans-serif" }}>Is {getArticleFor(typeName)} </span>
                        <span 
                          style={{
                            backgroundColor: typeColor,
                            color: '#bdb5b5',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            fontFamily: "'EmOne', sans-serif",
                            cursor: definingNodeId === 'base-thing-prototype' ? 'default' : 'pointer',
                            transition: 'opacity 0.2s ease',
                            opacity: definingNodeId === 'base-thing-prototype' ? 0.7 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (definingNodeId !== 'base-thing-prototype') {
                              e.currentTarget.style.opacity = '0.8';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (definingNodeId !== 'base-thing-prototype') {
                              e.currentTarget.style.opacity = '1';
                            }
                          }}
                          onClick={(e) => {
                            if (definingNodeId && definingNodeId !== 'base-thing-prototype') {
                              handleOpenTypeDialog(definingNodeId, e);
                            }
                          }}
                          title={definingNodeId === 'base-thing-prototype' ? "Thing is the base type and cannot be changed" : "Click to change type"}
                        >
                            {typeName}
                        </span>
                    </div>

                    {/* Divider above bio */}
                    <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

                    {/* --- Bio Section --- */}
                    <h3 style={{ 
                        marginTop: 0, 
                        marginBottom: '10px', 
                        color: '#333', 
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        userSelect: 'none',
                        fontFamily: "'EmOne', sans-serif"
                    }}>
                        Bio
                    </h3>
                    <div style={{ padding: '0 0 0 0' }}>
                    <textarea
                        ref={(el) => {
                          projectBioTextareaRef.current = el;
                          if (el) {
                            // Auto-resize immediately when element is created
                            requestAnimationFrame(() => autoResizeTextarea(projectBioTextareaRef));
                          }
                        }}
                        placeholder="Add a bio..."
                        id="project-bio-textarea"
                        name="projectBioTextarea"
                        className="panel-bio-textarea"
                        style={{
                            width: '100%',
                            maxWidth: '100%',
                            boxSizing: 'border-box',
                            resize: 'vertical',
                            minHeight: '60px',
                            maxHeight: '300px',
                            color: '#260000',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            padding: '0.5rem',
                            backgroundColor: '#bdb5b5',
                            fontSize: '14px',
                            lineHeight: '1.4',
                            fontFamily: "'EmOne', sans-serif",
                            overflow: 'auto',
                        }}
                        value={graphDescription}
                        onFocus={() => onFocusChange?.(true)}
                        onBlur={() => onFocusChange?.(false)}
                        onChange={(e) => {
                            if (activeGraphId && storeActions?.updateGraph) {
                                storeActions.updateGraph(activeGraphId, draft => { draft.description = e.target.value; });
                            }
                            // Auto-resize on input
                            autoResizeTextarea(projectBioTextareaRef);
                        }}
                        onKeyDown={(e) => {
                            if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
                                e.stopPropagation();
                            }
                        }}
                    />
                    </div>

                    {/* Divider above forms */}
                    <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

                    {/* --- Forms Section --- */}
                    <h3 style={{ 
                        marginTop: 0, 
                        marginBottom: '15px', 
                        color: '#333', 
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        userSelect: 'none',
                        fontFamily: "'EmOne', sans-serif"
                    }}>
                        Forms
                    </h3>
                    <div style={{ padding: '0 0 0 0' }}>
                        {definingNodeData ? (
                            <>
                                {/* As a Thing Subsection */}
                                <h4 style={{ 
                                    marginTop: 0, 
                                    marginBottom: '8px', 
                                    color: '#555', 
                                    fontSize: '0.9rem',
                                    fontWeight: 'normal',
                                    userSelect: 'none',
                                    fontFamily: "'EmOne', sans-serif"
                                }}>
                                    As a Thing
                                </h4>
                                
                                {/* Thing Name (styled like title) */}
                                <div style={{ marginBottom: '8px' }}>
                                    <div
                                        style={{
                                            backgroundColor: definingNodeData?.color || NODE_DEFAULT_COLOR,
                                            borderRadius: '8px',
                                            padding: '8px 12px',
                                            overflow: 'hidden',
                                            userSelect: 'none',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            color: '#bdb5b5',
                                            margin: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            minHeight: '32px',
                                            boxSizing: 'border-box',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}
                                    >
                                        {definingNodeData.name || 'Untitled'}
                                    </div>
                                </div>

                                {/* Plural */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ 
                                        fontSize: '12px', 
                                        color: '#666', 
                                        display: 'block', 
                                        marginBottom: '3px',
                                        userSelect: 'none',
                                        fontFamily: "'EmOne', sans-serif"
                                    }}>
                                        Plural
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g., cars, people, ideas"
                                        value={definingNodeData.conjugations?.plural || ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                            storeActions.updateNodePrototype(definingNodeData.id, draft => {
                                                if (!draft.conjugations) draft.conjugations = {};
                                                draft.conjugations.plural = capitalizedValue;
                                            });
                                        }}
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '6px 8px',
                                            fontSize: '14px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            backgroundColor: '#bdb5b5',
                                            color: '#260000',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}
                                        onFocus={() => onFocusChange?.(true)}
                                        onBlur={() => onFocusChange?.(false)}
                                    />
                                </div>

                                {/* As a Connection Subsection */}
                                <h4 style={{ 
                                    marginTop: 0, 
                                    marginBottom: '8px', 
                                    color: '#555', 
                                    fontSize: '0.9rem',
                                    fontWeight: 'normal',
                                    userSelect: 'none',
                                    fontFamily: "'EmOne', sans-serif"
                                }}>
                                    As a Connection
                                </h4>

                                {/* Verb Forms in 2-column layout */}
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: '1fr 1fr', 
                                    gap: '8px',
                                    marginBottom: '8px'
                                }}>
                                    {/* Present Singular */}
                                    <div>
                                        <label style={{ 
                                            fontSize: '12px', 
                                            color: '#666', 
                                            display: 'block', 
                                            marginBottom: '3px',
                                            userSelect: 'none',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}>
                                            Present Singular
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="is"
                                            value={definingNodeData.conjugations?.presentSingular || ''}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                                storeActions.updateNodePrototype(definingNodeData.id, draft => {
                                                    if (!draft.conjugations) draft.conjugations = {};
                                                    draft.conjugations.presentSingular = capitalizedValue;
                                                });
                                            }}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: '6px 8px',
                                                fontSize: '14px',
                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                                backgroundColor: '#bdb5b5',
                                                color: '#260000',
                                                fontFamily: "'EmOne', sans-serif"
                                            }}
                                            onFocus={() => onFocusChange?.(true)}
                                            onBlur={() => onFocusChange?.(false)}
                                        />
                                    </div>

                                    {/* Present Plural */}
                                    <div>
                                        <label style={{ 
                                            fontSize: '12px', 
                                            color: '#666', 
                                            display: 'block', 
                                            marginBottom: '3px',
                                            userSelect: 'none',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}>
                                            Present Plural
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="are"
                                            value={definingNodeData.conjugations?.presentPlural || ''}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                                storeActions.updateNodePrototype(definingNodeData.id, draft => {
                                                    if (!draft.conjugations) draft.conjugations = {};
                                                    draft.conjugations.presentPlural = capitalizedValue;
                                                });
                                            }}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: '6px 8px',
                                                fontSize: '14px',
                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                                backgroundColor: '#bdb5b5',
                                                color: '#260000',
                                                fontFamily: "'EmOne', sans-serif"
                                            }}
                                            onFocus={() => onFocusChange?.(true)}
                                            onBlur={() => onFocusChange?.(false)}
                                        />
                                    </div>

                                    {/* Past Singular */}
                                    <div>
                                        <label style={{ 
                                            fontSize: '12px', 
                                            color: '#666', 
                                            display: 'block', 
                                            marginBottom: '3px',
                                            userSelect: 'none',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}>
                                            Past Singular
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="was"
                                            value={definingNodeData.conjugations?.pastSingular || ''}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                                storeActions.updateNodePrototype(definingNodeData.id, draft => {
                                                    if (!draft.conjugations) draft.conjugations = {};
                                                    draft.conjugations.pastSingular = capitalizedValue;
                                                });
                                            }}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: '6px 8px',
                                                fontSize: '14px',
                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                                backgroundColor: '#bdb5b5',
                                                color: '#260000',
                                                fontFamily: "'EmOne', sans-serif"
                                            }}
                                            onFocus={() => onFocusChange?.(true)}
                                            onBlur={() => onFocusChange?.(false)}
                                        />
                                    </div>

                                    {/* Past Plural */}
                                    <div>
                                        <label style={{ 
                                            fontSize: '12px', 
                                            color: '#666', 
                                            display: 'block', 
                                            marginBottom: '3px',
                                            userSelect: 'none',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}>
                                            Past Plural
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="were"
                                            value={definingNodeData.conjugations?.pastPlural || ''}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                                storeActions.updateNodePrototype(definingNodeData.id, draft => {
                                                    if (!draft.conjugations) draft.conjugations = {};
                                                    draft.conjugations.pastPlural = capitalizedValue;
                                                });
                                            }}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: '6px 8px',
                                                fontSize: '14px',
                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                                backgroundColor: '#bdb5b5',
                                                color: '#260000',
                                                fontFamily: "'EmOne', sans-serif"
                                            }}
                                            onFocus={() => onFocusChange?.(true)}
                                            onBlur={() => onFocusChange?.(false)}
                                        />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ 
                                padding: '10px', 
                                color: '#999', 
                                fontStyle: 'italic',
                                fontSize: '14px',
                                fontFamily: "'EmOne', sans-serif"
                            }}>
                                No defining node found for this graph.
                            </div>
                        )}
                    </div>

                    {/* Show image if the defining node has one */}
                    {definingNodeData?.imageSrc && (
                        <>
                            {/* Divider above image */}
                            <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>
                            <div
                                style={{
                                    marginTop: '8px',
                                    position: 'relative',
                                    width: '100%',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                }}
                            >
                                <img
                                    src={definingNodeData.imageSrc}
                                    alt="Graph"
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        height: 'auto',
                                        objectFit: 'contain',
                                        borderRadius: '6px'
                                    }}
                                />
                            </div>
                        </>
                    )}

                    {/* Divider Line - always present below bio/image */}
                    <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

                    {/* Components section */}
                    <h3 style={{ 
                        marginTop: 0, 
                        marginBottom: '10px', 
                        color: '#555', 
                        fontSize: '0.9rem',
                        userSelect: 'none',
                        fontFamily: "'EmOne', sans-serif"
                    }}>
                        Components ({activeGraphNodes.length})
                    </h3>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '8px',
                            maxHeight: '300px',
                            overflowY: 'auto',
                        }}
                    >
                        {activeGraphNodes.map((node) => (
                            <div
                                key={node.id}
                                style={{
                                    backgroundColor: 'maroon',
                                    borderRadius: NODE_CORNER_RADIUS,
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: '0 5px',
                                    overflow: 'hidden'
                                }}
                                title={node.name}
                                onClick={() => openNodeTab(node.id)}
                            >
                                <span style={{
                                    color: '#bdb5b5',
                                    fontSize: '0.8rem',
                                    width: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    textAlign: 'center',
                                    padding: '0 10px',
                                    boxSizing: 'border-box',
                                    userSelect: 'none',
                                    fontFamily: "'EmOne', sans-serif"
                                }}>
                                    {node.name}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Component Of Section */}
                    {(() => {
                        if (!activeGraphId) return null;
                        
                        // Find nodes from OTHER graphs that define this current graph
                        const componentOfNodes = Array.from(nodePrototypesMap.values()).filter(node => 
                            Array.isArray(node.definitionGraphIds) && 
                            node.definitionGraphIds.includes(activeGraphId)
                        );

                        if (componentOfNodes.length === 0) return null;

                        return (
                            <>
                                {/* Divider Line */}
                                <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

                                <h3 style={{ 
                                    marginTop: 0, 
                                    marginBottom: '10px', 
                                    color: '#555', 
                                    fontSize: '0.9rem',
                                    userSelect: 'none',
                                    fontFamily: "'EmOne', sans-serif"
                                }}>
                                    Component Of ({componentOfNodes.length})
                                </h3>

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '8px',
                                        maxHeight: '300px',
                                        overflowY: 'auto',
                                    }}
                                >
                                    {componentOfNodes.map((node) => (
                                        <div
                                            key={node.id}
                                            style={{
                                                backgroundColor: node.color || NODE_DEFAULT_COLOR,
                                                borderRadius: NODE_CORNER_RADIUS,
                                                height: '40px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                padding: '0 5px',
                                                overflow: 'hidden'
                                            }}
                                            title={node.name}
                                            onClick={() => openNodeTab(node.id)}
                                        >
                                            <span style={{
                                                color: '#bdb5b5',
                                                fontSize: '0.8rem',
                                                width: '100%',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                textAlign: 'center',
                                                padding: '0 10px',
                                                boxSizing: 'border-box',
                                                userSelect: 'none',
                                                fontFamily: "'EmOne', sans-serif"
                                            }}>
                                                {node.name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        );
                    })()}

                    {/* Defines Section */}
                    {(() => {
                        if (!activeGraphId) return null;
                        
                        // Find nodes that are defining the current active graph
                        // These are nodes that have the current graph in their definitionGraphIds
                        const currentGraph = graphsMap.get(activeGraphId);
                        if (!currentGraph || !currentGraph.definingNodeIds) return null;
                        
                        const definitionNodes = currentGraph.definingNodeIds
                            .map(nodeId => nodePrototypesMap.get(nodeId))
                            .filter(Boolean); // Remove any null/undefined nodes

                        if (definitionNodes.length === 0) return null;

                        return (
                            <>
                                {/* Divider Line */}
                                <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

                                <h3 style={{ 
                                    marginTop: 0, 
                                    marginBottom: '10px', 
                                    color: '#555', 
                                    fontSize: '0.9rem',
                                    userSelect: 'none',
                                    fontFamily: "'EmOne', sans-serif"
                                }}>
                                    Defines ({definitionNodes.length})
                                </h3>

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '8px',
                                        maxHeight: '300px',
                                        overflowY: 'auto',
                                    }}
                                >
                                    {definitionNodes.map((node) => {
                                        // The "definitionNodes" are nodes that define the current active graph
                                        // We need to find which definition this node represents by looking at 
                                        // the position of the current activeGraphId in this node's definitionGraphIds array
                                        let definitionOrder = 1; // Default to 1 if we can't determine
                                        
                                        if (Array.isArray(node.definitionGraphIds) && activeGraphId) {
                                            const orderIndex = node.definitionGraphIds.indexOf(activeGraphId);
                                            if (orderIndex !== -1) {
                                                definitionOrder = orderIndex + 1; // Convert to 1-based
                                            }
                                        }
                                        
                                        return (
                                            <div
                                                key={node.id}
                                                style={{
                                                    position: 'relative',
                                                    backgroundColor: node.color || NODE_DEFAULT_COLOR, // Use actual node color
                                                    borderRadius: NODE_CORNER_RADIUS,
                                                    height: '40px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    padding: '0 5px',
                                                    overflow: 'visible' // Changed to visible for bubble
                                                }}
                                                title={`${node.name} (Definition ${definitionOrder})`}
                                                onClick={() => openNodeTab(node.id)}
                                            >
                                                <span style={{
                                                    color: '#bdb5b5',
                                                    fontSize: '0.8rem',
                                                    width: '100%',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    textAlign: 'center',
                                                    padding: '0 10px',
                                                    boxSizing: 'border-box',
                                                    userSelect: 'none',
                                                    fontFamily: "'EmOne', sans-serif"
                                                }}>
                                                    {node.name}
                                                </span>
                                                
                                                {/* Definition Order Notification Bubble */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '2px',
                                                    right: '-2px',
                                                    backgroundColor: 'black',
                                                    color: '#bdb5b5',
                                                    borderRadius: '50%',
                                                    width: '16px',
                                                    height: '16px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.6rem',
                                                    fontWeight: 'bold',
                                                    userSelect: 'none',
                                                    zIndex: 1,
                                                    fontFamily: "'EmOne', sans-serif"
                                                }}>
                                                    {definitionOrder}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        );
                    })()}
                </div>
            );
        } else if (activeRightPanelTab.type === 'node') {
            const nodeId = activeRightPanelTab.nodeId;
            // --- Fetch node data globally using the tab's nodeId ---
            const nodeData = useGraphStore.getState().nodePrototypes.get(nodeId);

            if (!nodeData) {
                // Node data doesn't exist globally - error case
                panelContent = (
                    <div style={{ padding: '10px', color: '#aaa', fontFamily: "'EmOne', sans-serif" }}>Node data not found globally...</div>
                );
            } else {
                // --- Node data found globally - Render the full editable view --- 
                
                // Helper to get the current definition description for this node
                const getCurrentDefinitionDescription = () => {
                    // Check if node has definitions and we have context tracking
                    if (nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0 && activeGraphId) {
                        // Get the context-specific definition index
                        const contextKey = `${nodeId}-${activeGraphId}`;
                        const currentIndex = nodeDefinitionIndices.get(contextKey) || 0;
                        
                        // Get the graph ID for the current definition
                        const currentDefinitionGraphId = nodeData.definitionGraphIds[currentIndex] || nodeData.definitionGraphIds[0];
                        
                        // Get the graph data and return its description
                        if (currentDefinitionGraphId) {
                            const definitionGraphData = graphsMap.get(currentDefinitionGraphId);
                            if (definitionGraphData && definitionGraphData.description) {
                                return definitionGraphData.description;
                            }
                        }
                    }
                    
                    // Fallback to node's own description
                    return nodeData.description || '';
                };
                
                const displayBio = getCurrentDefinitionDescription();
                const displayTitle = nodeData.name || 'Untitled';

                // Function to commit the title change (on blur or Enter key)
                const commitTitleChange = () => {
                    const newName = tempTitle.trim();
                    if (newName && newName !== activeRightPanelTab.title) {
                        // Update the node data
                        storeActions.updateNodePrototype(nodeId, draft => { draft.name = newName; });
                    }
                    setEditingTitle(false);
                };

                // --- NEW ---: Determine if the expand icon should be disabled
                const contextKey = `${nodeId}-${activeGraphId}`;
                const currentIndex = nodeDefinitionIndices.get(contextKey) || 0;
                const graphIdToOpen = (nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0)
                  ? (nodeData.definitionGraphIds[currentIndex] || nodeData.definitionGraphIds[0])
                  : null;
                const isExpandDisabled = graphIdToOpen === activeGraphId;

                panelContent = (
                    <div className="panel-content-inner node-tab">
                        {/* --- Top Section: Title, Type, Buttons --- */}
                        <div style={{ padding: '0 0 0 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                {editingTitle ? (
                                    <input
                                        ref={titleInputRef}
                                        type="text"
                                        id={`node-title-input-${nodeId}`}
                                        name={`nodeTitleInput-${nodeId}`}
                                        className="editable-title-input"
                                        value={tempTitle}
                                        onChange={(e) => setTempTitle(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') commitTitleChange(); }}
                                        onBlur={commitTitleChange}
                                        onFocus={() => onFocusChange?.(true)}
                                        style={{ fontFamily: "'EmOne', sans-serif" }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            backgroundColor: nodeData?.color || NODE_DEFAULT_COLOR,
                                            borderRadius: '8px',
                                            padding: '5px 10px',
                                            cursor: 'pointer',
                                            overflow: 'hidden',
                                            userSelect: 'none',
                                            fontSize: '1.1rem',
                                            fontWeight: 'bold',
                                            color: '#bdb5b5',
                                            margin: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            minHeight: '32px', // Match the height that the input would have
                                            boxSizing: 'border-box',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}
                                        onDoubleClick={() => {
                                            setEditingTitle(true);
                                            setTempTitle(displayTitle);
                                        }}
                                    >
                                        <span style={{
                                            display: 'inline-block',
                                            maxWidth: '210px',
                                            whiteSpace: 'normal',
                                            overflowWrap: 'break-word',
                                            verticalAlign: 'bottom'
                                        }}>
                                            {displayTitle}
                                        </span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
                                    {/* Color Picker Icon */}
                                    <Palette
                                        size={20}
                                        color="#260000"
                                        style={{ cursor: 'pointer', flexShrink: 0 }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenColorPicker(nodeId, e.currentTarget, e);
                                        }}
                                        title="Change color"
                                    />
                                    {/* Expand Icon - Always show, behavior depends on whether definitions exist */}
                                    <ArrowUpFromDot
                                        size={20}
                                        color="#260000"
                                        style={{ 
                                            cursor: isExpandDisabled ? 'not-allowed' : 'pointer', 
                                            flexShrink: 0,
                                            opacity: isExpandDisabled ? 0.3 : 1, // Consistent opacity - same as other buttons
                                            transition: 'opacity 0.2s ease',
                                        }}
                                        onClick={(e) => {
                                            if (isExpandDisabled) return; // Do nothing if disabled

                                            if (nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0) {
                                                // Node has definitions - open existing definition
                                                const contextKey = `${nodeId}-${activeGraphId}`;
                                                const currentIndex = nodeDefinitionIndices.get(contextKey) || 0;
                                                const graphIdToOpen = nodeData.definitionGraphIds[currentIndex] || nodeData.definitionGraphIds[0];
                                                
                                                if (onStartHurtleAnimationFromPanel) {
                                                    const iconRect = e.currentTarget.getBoundingClientRect();
                                                    onStartHurtleAnimationFromPanel(nodeId, graphIdToOpen, nodeId, iconRect);
                                                } else {
                                                    if (storeActions?.openGraphTabAndBringToTop) {
                                                        storeActions.openGraphTabAndBringToTop(graphIdToOpen, nodeId);
                                                    }
                                                }
                                            } else {
                                                // Node has no definitions - create new definition first, then open it
                                                const iconRect = e.currentTarget.getBoundingClientRect();
                                                storeActions.createAndAssignGraphDefinitionWithoutActivation(nodeId);
                                                setTimeout(() => {
                                                    const currentState = useGraphStore.getState();
                                                    const updatedNodeData = currentState.nodePrototypes.get(nodeId);
                                                    if (updatedNodeData?.definitionGraphIds?.length > 0) {
                                                        const newGraphId = updatedNodeData.definitionGraphIds[updatedNodeData.definitionGraphIds.length - 1];
                                                        onStartHurtleAnimationFromPanel(nodeId, newGraphId, nodeId, iconRect);
                                                    }
                                                }, 150);
                                            }
                                        }}
                                        title={
                                            isExpandDisabled 
                                                ? "This graph is already open" 
                                                : (nodeData.definitionGraphIds && nodeData.definitionGraphIds.length > 0)
                                                    ? "Open definition in new tab"
                                                    : "Create new definition"
                                        }
                                    />
                                    <ImagePlus
                                        size={20}
                                        color="#260000"
                                        style={{ cursor: 'pointer', flexShrink: 0 }}
                                        onClick={() => handleAddImage(nodeId)}
                                    />
                                </div>
                            </div>
                            {/* Type information for node tabs */}
                            {(() => {
                                // Get type information for this node
                                const getNodeTypeInfo = () => {
                                    if (!nodeData.typeNodeId) {
                                        return { typeName: 'Thing', typeColor: '#8B0000' }; // Default to Thing
                                    }
                                    const typeNode = nodePrototypesMap.get(nodeData.typeNodeId);
                                    return {
                                        typeName: typeNode?.name || 'Thing',
                                        typeColor: typeNode?.color || '#8B0000'
                                    };
                                };

                                const { typeName, typeColor } = getNodeTypeInfo();

                                return (
                                    <div style={{ 
                                        marginBottom: '8px', 
                                        fontSize: '0.9rem', 
                                        color: '#555',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontFamily: "'EmOne', sans-serif"
                                    }}>
                                        <span>Is {getArticleFor(typeName)} </span>
                                        <span 
                                          style={{
                                            backgroundColor: typeColor,
                                            color: '#bdb5b5',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            fontWeight: 'bold',
                                            cursor: nodeId === 'base-thing-prototype' ? 'default' : 'pointer',
                                            transition: 'opacity 0.2s ease',
                                            opacity: nodeId === 'base-thing-prototype' ? 0.7 : 1,
                                            fontFamily: "'EmOne', sans-serif"
                                          }}
                                          onMouseEnter={(e) => {
                                            if (nodeId !== 'base-thing-prototype') {
                                              e.currentTarget.style.opacity = '0.8';
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            if (nodeId !== 'base-thing-prototype') {
                                              e.currentTarget.style.opacity = '1';
                                            }
                                          }}
                                          onClick={(e) => {
                                            if (nodeId !== 'base-thing-prototype') {
                                              handleOpenTypeDialog(nodeId, e);
                                            }
                                          }}
                                          title={nodeId === 'base-thing-prototype' ? "Thing is the base type and cannot be changed" : "Click to change type"}
                                        >
                                            {typeName}
                                        </span>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Divider above bio */}
                        <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

                        {/* --- Bio Section --- */}
                        <h3 style={{ 
                            marginTop: 0, 
                            marginBottom: '10px', 
                            color: '#333', 
                            fontSize: '1.1rem',
                            fontWeight: 'bold',
                            userSelect: 'none',
                            fontFamily: "'EmOne', sans-serif"
                        }}>
                            Bio
                        </h3>
                        <div style={{ padding: '0 0 0 0' }}>
                            <textarea
                                ref={(el) => {
                                  nodeBioTextareaRef.current = el;
                                  if (el) {
                                    // Auto-resize immediately when element is created
                                    requestAnimationFrame(() => autoResizeTextarea(nodeBioTextareaRef));
                                  }
                                }}
                                placeholder="Add a bio..."
                                id={`node-bio-textarea-${nodeId}`}
                                name={`nodeBioTextarea-${nodeId}`}
                                className="panel-bio-textarea"
                                style={{
                                    width: '100%',
                                    maxWidth: '100%',
                                    boxSizing: 'border-box',
                                    resize: 'vertical',
                                    minHeight: '60px',
                                    maxHeight: '300px',
                                    color: '#260000',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                    padding: '0.5rem',
                                    backgroundColor: '#bdb5b5',
                                    fontSize: '14px',
                                    lineHeight: '1.4',
                                    fontFamily: "'EmOne', sans-serif",
                                    userSelect: 'text',
                                    overflow: 'auto',
                                }}
                                value={displayBio}
                                onFocus={() => onFocusChange?.(true)}
                                onBlur={() => onFocusChange?.(false)}
                                onChange={(e) => {
                                    handleBioChange(nodeId, e.target.value);
                                    // Auto-resize on input
                                    autoResizeTextarea(nodeBioTextareaRef);
                                }}
                                onKeyDown={(e) => {
                                    if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
                                        e.stopPropagation();
                                    }
                                }}
                            />
                        </div>

                        {/* Divider above forms */}
                        <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

                        {/* --- Forms Section --- */}
                        <h3 style={{ 
                            marginTop: 0, 
                            marginBottom: '15px', 
                            color: '#333', 
                            fontSize: '1.1rem',
                            fontWeight: 'bold',
                            userSelect: 'none',
                            fontFamily: "'EmOne', sans-serif"
                        }}>
                            Forms
                        </h3>
                        <div style={{ padding: '0 0 0 0' }}>
                            {/* As a Thing Subsection */}
                            <h4 style={{ 
                                marginTop: 0, 
                                marginBottom: '8px', 
                                color: '#555', 
                                fontSize: '0.9rem',
                                fontWeight: 'normal',
                                userSelect: 'none',
                                fontFamily: "'EmOne', sans-serif"
                            }}>
                                As a Thing
                            </h4>
                            
                            {/* Thing Name (styled like title) */}
                            <div style={{ marginBottom: '8px' }}>
                                <div
                                    style={{
                                        backgroundColor: nodeData?.color || NODE_DEFAULT_COLOR,
                                        borderRadius: '8px',
                                        padding: '8px 12px',
                                        overflow: 'hidden',
                                        userSelect: 'none',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        color: '#bdb5b5',
                                        margin: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        minHeight: '32px',
                                        boxSizing: 'border-box',
                                        fontFamily: "'EmOne', sans-serif"
                                    }}
                                >
                                    {nodeData.name || 'Untitled'}
                                </div>
                            </div>

                            {/* Plural */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ 
                                    fontSize: '12px', 
                                    color: '#666', 
                                    display: 'block', 
                                    marginBottom: '3px',
                                    userSelect: 'none',
                                    fontFamily: "'EmOne', sans-serif"
                                }}>
                                    Plural
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., cars, people, ideas"
                                    value={nodeData.conjugations?.plural || ''}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                        storeActions.updateNodePrototype(nodeId, draft => {
                                            if (!draft.conjugations) draft.conjugations = {};
                                            draft.conjugations.plural = capitalizedValue;
                                        });
                                    }}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '6px 8px',
                                        fontSize: '14px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        backgroundColor: '#bdb5b5',
                                        color: '#260000',
                                        fontFamily: "'EmOne', sans-serif"
                                    }}
                                    onFocus={() => onFocusChange?.(true)}
                                    onBlur={() => onFocusChange?.(false)}
                                />
                            </div>

                            {/* As a Connection Subsection */}
                            <h4 style={{ 
                                marginTop: 0, 
                                marginBottom: '8px', 
                                color: '#555', 
                                fontSize: '0.9rem',
                                fontWeight: 'normal',
                                userSelect: 'none',
                                fontFamily: "'EmOne', sans-serif"
                            }}>
                                As a Connection
                            </h4>

                            {/* Verb Forms in 2-column layout */}
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '1fr 1fr', 
                                gap: '8px',
                                marginBottom: '8px'
                            }}>
                                {/* Present Singular */}
                                <div>
                                    <label style={{ 
                                        fontSize: '12px', 
                                        color: '#666', 
                                        display: 'block', 
                                        marginBottom: '3px',
                                        userSelect: 'none',
                                        fontFamily: "'EmOne', sans-serif"
                                    }}>
                                        Present Singular
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="is"
                                        value={nodeData.conjugations?.presentSingular || ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                            storeActions.updateNodePrototype(nodeId, draft => {
                                                if (!draft.conjugations) draft.conjugations = {};
                                                draft.conjugations.presentSingular = capitalizedValue;
                                            });
                                        }}
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '6px 8px',
                                            fontSize: '14px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            backgroundColor: '#bdb5b5',
                                            color: '#260000',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}
                                        onFocus={() => onFocusChange?.(true)}
                                        onBlur={() => onFocusChange?.(false)}
                                    />
                                </div>

                                {/* Present Plural */}
                                <div>
                                    <label style={{ 
                                        fontSize: '12px', 
                                        color: '#666', 
                                        display: 'block', 
                                        marginBottom: '3px',
                                        userSelect: 'none',
                                        fontFamily: "'EmOne', sans-serif"
                                    }}>
                                        Present Plural
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="are"
                                        value={nodeData.conjugations?.presentPlural || ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                            storeActions.updateNodePrototype(nodeId, draft => {
                                                if (!draft.conjugations) draft.conjugations = {};
                                                draft.conjugations.presentPlural = capitalizedValue;
                                            });
                                        }}
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '6px 8px',
                                            fontSize: '14px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            backgroundColor: '#bdb5b5',
                                            color: '#260000',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}
                                        onFocus={() => onFocusChange?.(true)}
                                        onBlur={() => onFocusChange?.(false)}
                                    />
                                </div>

                                {/* Past Singular */}
                                <div>
                                    <label style={{ 
                                        fontSize: '12px', 
                                        color: '#666', 
                                        display: 'block', 
                                        marginBottom: '3px',
                                        userSelect: 'none',
                                        fontFamily: "'EmOne', sans-serif"
                                    }}>
                                        Past Singular
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="was"
                                        value={nodeData.conjugations?.pastSingular || ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                            storeActions.updateNodePrototype(nodeId, draft => {
                                                if (!draft.conjugations) draft.conjugations = {};
                                                draft.conjugations.pastSingular = capitalizedValue;
                                            });
                                        }}
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '6px 8px',
                                            fontSize: '14px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            backgroundColor: '#bdb5b5',
                                            color: '#260000',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}
                                        onFocus={() => onFocusChange?.(true)}
                                        onBlur={() => onFocusChange?.(false)}
                                    />
                                </div>

                                {/* Past Plural */}
                                <div>
                                    <label style={{ 
                                        fontSize: '12px', 
                                        color: '#666', 
                                        display: 'block', 
                                        marginBottom: '3px',
                                        userSelect: 'none',
                                        fontFamily: "'EmOne', sans-serif"
                                    }}>
                                        Past Plural
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="were"
                                        value={nodeData.conjugations?.pastPlural || ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
                                            storeActions.updateNodePrototype(nodeId, draft => {
                                                if (!draft.conjugations) draft.conjugations = {};
                                                draft.conjugations.pastPlural = capitalizedValue;
                                            });
                                        }}
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '6px 8px',
                                            fontSize: '14px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            backgroundColor: '#bdb5b5',
                                            color: '#260000',
                                            fontFamily: "'EmOne', sans-serif"
                                        }}
                                        onFocus={() => onFocusChange?.(true)}
                                        onBlur={() => onFocusChange?.(false)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* --- Rest of the content (image, Components, etc.) --- */}
                        <div style={{ padding: '0 0 0 0' }}>
                            {nodeData.imageSrc && (
                                <>
                                    {/* Divider above image */}
                                    <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>
                                    <div
                                        style={{
                                            marginTop: '8px',
                                            position: 'relative',
                                            width: '100%',
                                            maxWidth: '100%',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <img
                                            src={nodeData.imageSrc}
                                            alt="Node"
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                height: 'auto',
                                                objectFit: 'contain',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                            
                            {/* Divider Line - always present below bio/image */}
                            <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>
                            {/* ... existing code ... */}
                        </div>
                    </div>
                );
            }
        }
    }
    

    // --- Positioning and Animation Styles based on side ---
    const positionStyle = side === 'left' ? { left: 0 } : { right: 0 };
    const transformStyle = side === 'left'
        ? (isExpanded ? 'translateX(0%)' : 'translateX(-100%)')
        : (isExpanded ? 'translateX(0%)' : 'translateX(100%)');

    // Dynamically build transition string, removing backgroundColor
    const transitionStyle = `transform 0.2s ease${isAnimatingWidth ? ', width 0.2s ease' : ''}`;

    const handleBaseColor = '#260000'; // header maroon
    const handleOpacity = isResizing.current ? 1 : (isHandleHover ? 0.18 : 0.08);
    const handleStyle = {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '14px',
        cursor: 'col-resize',
        zIndex: 10001,
        backgroundColor: `rgba(38,0,0,${handleOpacity})`,
        transition: 'background-color 0.15s ease, opacity 0.15s ease',
        borderRadius: '2px',
        touchAction: 'none'
    };
    if (side === 'left') {
        handleStyle.right = '-6px';
    } else { // side === 'right'
        handleStyle.left = '-6px';
    }

    // --- Tab Bar Scroll Handler ---
    const handleTabBarWheel = useCallback((e) => {
          
      if (tabBarRef.current) {
        e.preventDefault();
        e.stopPropagation();

        const element = tabBarRef.current;
        

        let scrollAmount = 0;
        // Prioritize axis with larger absolute delta
        if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
          scrollAmount = e.deltaY;
        } else {
          scrollAmount = e.deltaX;
        }

        const sensitivity = 0.5; 
        const scrollChange = scrollAmount * sensitivity;

        // Only try to scroll if there's actually scrollable content
        if (element.scrollWidth > element.clientWidth) {
          console.log('[Tab Wheel] Attempting to scroll by:', scrollChange);
          element.scrollLeft += scrollChange;
          console.log('[Tab Wheel] New scrollLeft:', element.scrollLeft);
        } else {
          console.log('[Tab Wheel] No overflow - not scrolling');
        }
      } else {
        console.log('[Tab Wheel] No ref found!');
      }
    }, []); // No dependencies needed since it only uses refs

    // --- Effect to manually add non-passive wheel listener ---
    useEffect(() => {
      const tabBarNode = tabBarRef.current;
      console.log('[Tab Wheel Effect] Running with:', { 
        hasNode: !!tabBarNode, 
        side, 
        isExpanded,
        nodeTagName: tabBarNode?.tagName,
        nodeClassList: tabBarNode?.classList.toString()
      });
      
      if (tabBarNode && side === 'right' && isExpanded) {
        console.log('[Tab Wheel Effect] Adding wheel listener to:', tabBarNode);
        // Add listener with passive: false to allow preventDefault
        tabBarNode.addEventListener('wheel', handleTabBarWheel, { passive: false });

        // Cleanup function
        return () => {
          console.log('[Tab Wheel Effect] Removing wheel listener');
          tabBarNode.removeEventListener('wheel', handleTabBarWheel, { passive: false });
        };
      }
    }, [side, isExpanded, handleTabBarWheel]); // Re-run when dependencies change

    return (
        <>
            {/* Pass side prop to ToggleButton */}
            <ToggleButton isExpanded={isExpanded} onClick={onToggleExpand} side={side} />

            {/* Main Sliding Panel Container */}
            <div
                ref={panelRef} // Assign ref here
                style={{
                    position: 'fixed',
                    top: HEADER_HEIGHT, 
                    ...positionStyle, 
                    bottom: 0, 
                    width: `${panelWidth}px`, // Use state variable for width
                    backgroundColor: '#bdb5b5', // <<< Set back to static color
                    boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
                    zIndex: 10000,
                    overflow: 'hidden', // Keep hidden to clip content
                    display: 'flex',
                    flexDirection: 'column',
                    transform: transformStyle, 
                    transition: transitionStyle, // Animate transform and width
                }}
            >
                {/* Resize Handle disabled; handled by NodeCanvas overlay */}

                {/* Main Header Row Container */}
                <div 
                    style={{
                        height: 40,
                        backgroundColor: '#716C6C',
                        display: 'flex',
                        alignItems: 'stretch',
                        position: 'relative',
                    }}
                    onDoubleClick={handleHeaderDoubleClick} // Uncommented
                >
                    {/* === Conditional Header Content === */}
                    {side === 'left' ? (
                        // --- Left Panel Header --- 
                        <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'stretch' }}>
                            {/* Library Button -> Saved Things */} 
                            <div 
                                title="Saved Things" 
                                style={{ /* Common Button Styles */ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: leftViewActive === 'library' ? '#bdb5b5' : '#979090', zIndex: 2 }}
                                onClick={() => setLeftViewActive('library')}
                            >
                                <Bookmark size={20} color="#260000" />
                            </div>
                            {/* Grid Button -> Open Things */} 
                            <div 
                                title="Open Things" 
                                style={{ /* Common Button Styles */ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: leftViewActive === 'grid' ? '#bdb5b5' : '#979090', zIndex: 2 }}
                                onClick={() => setLeftViewActive('grid')}
                            >
                                <BookOpen size={20} color="#260000" />
                            </div>
                            {/* Federation Button -> Solid Pods */} 
                            <div 
                                title="Federation" 
                                style={{ /* Common Button Styles */ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: leftViewActive === 'federation' ? '#bdb5b5' : '#979090', zIndex: 2 }}
                                onClick={() => setLeftViewActive('federation')}
                            >
                                <Globe size={20} color="#260000" />
                            </div>

                            {/* AI Collaboration Button */}
                            <div 
                                title="Wizard" 
                                style={{ /* Common Button Styles */ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: leftViewActive === 'ai' ? '#bdb5b5' : '#979090', zIndex: 2 }}
                                onClick={() => setLeftViewActive('ai')}
                            >
                                <Wand size={20} color="#260000" />
                            </div>
                        </div>
                    ) : (
                        // --- Right Panel Header (Uses store state `rightPanelTabs`) ---
                        <> 
                            {/* Home Button (checks store state) */}
                            {isExpanded && (() => {
                                const tabs = rightPanelTabs;
                                const isActive = tabs[0]?.isActive;
                                const bg = isActive ? '#bdb5b5' : '#979090';
                                return (
                                    <div
                                        title="Home"
                                        key="home"
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderTopRightRadius: 0,
                                            borderBottomLeftRadius: 0,
                                            borderBottomRightRadius: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            backgroundColor: bg,
                                            flexShrink: 0,
                                            zIndex: 2
                                        }}
                                        onClick={() => activateRightPanelTab(0)}
                                    >
                                        <Info size={22} color="#260000" />
                                    </div>
                                );
                            })()}


                            {/* Scrollable Tab Area (uses store state) */} 
                            {isExpanded && (
                                <div style={{ flex: '1 1 0', position: 'relative', height: '100%', minWidth: 0 }}>
                                    <div 
                                        ref={tabBarRef} 
                                        className="hide-scrollbar"
                                        data-panel-tabs="true"
                                        style={{ 
                                            position: 'relative',
                                            height: '100%', 
                                            display: 'flex', 
                                            alignItems: 'stretch', 
                                            paddingLeft: '8px', 
                                            paddingRight: '42px',
                                            overflowX: 'auto',
                                            overflowY: 'hidden', 
                                        }}
                                    >
                                        {/* Map ONLY node tabs (index > 0) - get tabs non-reactively */}
                                        {rightPanelTabs.slice(1).map((tab, i) => { // Use different index variable like `i`
                                            const nodeCurrentName = nodePrototypesMap.get(tab.nodeId)?.name || tab.title; // Get current name for display and drag
                                            return (
                                                <DraggableTab
                                                    key={tab.nodeId} // Use nodeId as key
                                                    tab={tab} // Pass tab data from store
                                                    index={i + 1} // Pass absolute index (1..N) based on map index `i`
                                                    displayTitle={nodeCurrentName} // Pass live name for display
                                                    dragItemTitle={nodeCurrentName} // Pass live name for drag item
                                                    moveTabAction={moveRightPanelTab}
                                                    activateTabAction={activateRightPanelTab}
                                                    closeTabAction={closeRightPanelTab}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    {/* === End Conditional Header Content === */}
                </div>

                {/* Content Area */} 
                <div 
                    className={`panel-content ${isScrolling ? 'scrolling' : ''} ${isHoveringScrollbar ? 'hovering-scrollbar' : ''}`}
                    style={{ flex: 1, paddingBottom: effectiveBottomPadding }}
                    onScroll={() => {
                        setIsScrolling(true);
                        if (scrollTimeoutRef.current) {
                            clearTimeout(scrollTimeoutRef.current);
                        }
                        scrollTimeoutRef.current = setTimeout(() => {
                            setIsScrolling(false);
                        }, 1500);
                    }}
                    onMouseEnter={handleScrollbarMouseEnter}
                    onMouseMove={handleScrollbarMouseMove}
                    onMouseLeave={handleScrollbarMouseLeave}
                >
                    {panelContent}
                </div>
            </div>

            {/* Color Picker Component */}
            {colorPickerVisible && (
                <ColorPicker
                    isVisible={colorPickerVisible}
                    onClose={handleCloseColorPicker}
                    onColorChange={handleColorChange}
                    currentColor={colorPickerNodeId ? nodePrototypesMap.get(colorPickerNodeId)?.color || '#8B0000' : '#8B0000'}
                    position={colorPickerPosition}
                    direction="down-left"
                />
            )}

            

            {/* Type Creation Dialog - simplified "Name Your Thing" for types */}
            {typeNamePrompt.visible && (
              <>
                <div 
                  style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 1000 }} 
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      handleCloseTypePrompt();
                    }
                  }}
                />
                <div
                  style={{
                    position: 'fixed',
                    top: HEADER_HEIGHT + 25,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#bdb5b5',
                    padding: '20px',
                    borderRadius: '10px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                    zIndex: 1001,
                    width: '300px',
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div style={{ position: 'absolute', top: '10px', right: '10px', cursor: 'pointer' }}>
                    <X size={20} color="#999" onClick={handleCloseTypePrompt} />
                  </div>
                        <div style={{ textAlign: 'center', marginBottom: '8px', color: 'black', fontFamily: "'EmOne', sans-serif" }}>
        <strong style={{ fontSize: '18px' }}>Name Your Thing</strong>
      </div>
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '15px', 
        color: '#555', 
        fontSize: '13px',
        lineHeight: '1.4',
        maxWidth: '280px',
        margin: '0 auto 15px auto',
        wordWrap: 'break-word',
        hyphens: 'auto',
        fontFamily: "'EmOne', sans-serif"
      }}>
        a more generic way to refer to {typeNamePrompt.targetNodeName},<br/>also known as a superclass
      </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
            <Palette
              size={20}
              color="#260000"
              style={{ cursor: 'pointer', flexShrink: 0, marginRight: '8px' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleTypeDialogColorPickerOpen(e.currentTarget, e);
              }}
              title="Change color"
            />
            <input
              type="text"
              value={typeNamePrompt.name}
              onChange={(e) => setTypeNamePrompt({ ...typeNamePrompt, name: e.target.value })}
              onKeyDown={(e) => { 
                if (e.key === 'Enter') handleTypePromptSubmit();
                if (e.key === 'Escape') handleCloseTypePrompt();
                // Stop propagation to prevent canvas shortcuts
                e.stopPropagation();
              }}
              style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', marginRight: '10px', fontFamily: "'EmOne', sans-serif" }}
              autoFocus
            />
            <button
              onClick={handleTypePromptSubmit}
              style={{ 
                padding: '10px', 
                backgroundColor: typeNamePrompt.color || '#8B0000', 
                color: '#bdb5b5', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '50px',
                minHeight: '44px',
                fontFamily: "'EmOne', sans-serif"
              }}
              title="Create type"
            >
              <ArrowBigRightDash size={16} color="#bdb5b5" />
            </button>
          </div>
                </div>
              </>
            )}

            {/* Type Dialog Color Picker Component */}
            {typeDialogColorPickerVisible && (
              <ColorPicker
                isVisible={typeDialogColorPickerVisible}
                onClose={handleTypeDialogColorPickerClose}
                onColorChange={handleTypeDialogColorChange}
                currentColor={typeNamePrompt.color || '#8B0000'}
                position={typeDialogColorPickerPosition}
                direction="down-left"
              />
            )}

            {/* NodeSelectionGrid for type creation */}
            {nodeSelectionGrid.visible && (
              <NodeSelectionGrid
                isVisible={nodeSelectionGrid.visible}
                onNodeSelect={handleNodeSelectionForType}
                onClose={handleCloseTypePrompt}
                position={nodeSelectionGrid.position}
                width={300}
                bottomOffset={20}
                searchTerm={typeNamePrompt.name}
              />
            )}


        </>
    );
}
);

export default Panel;