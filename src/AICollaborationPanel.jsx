/**
 * AI Collaboration Panel Component
 * Provides interface for human-AI collaboration with Redstring's cognitive knowledge graph
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, 
  Settings, 
  RotateCcw,
  Send,
  Bot,
  User,
  Key,
  Square
} from 'lucide-react';
import mcpClient from './services/mcpClient.js';
import apiKeyManager from './services/apiKeyManager.js';
import APIKeySetup from './components/APIKeySetup.jsx';
import useGraphStore from './store/graphStore.js';
import './AICollaborationPanel.css';

const AICollaborationPanel = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAPIKeySetup, setShowAPIKeySetup] = useState(false);
  const [hasAPIKey, setHasAPIKey] = useState(false);
  const [apiKeyInfo, setApiKeyInfo] = useState(null);
  const [isAutonomousMode, setIsAutonomousMode] = useState(true);
  const [currentAgentRequest, setCurrentAgentRequest] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Get store state
  const activeGraphId = useGraphStore((state) => state.activeGraphId);
  const graphs = useGraphStore((state) => state.graphs);





  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check for API key on component mount
  useEffect(() => {
    checkAPIKey();
  }, []);

  const checkAPIKey = async () => {
    try {
      const hasKey = await apiKeyManager.hasAPIKey();
      const keyInfo = await apiKeyManager.getAPIKeyInfo();
      
      setHasAPIKey(hasKey);
      setApiKeyInfo(keyInfo);
    } catch (error) {
      console.error('Failed to check API key:', error);
    }
  };

  const handleAPIKeySet = async (provider) => {
    await checkAPIKey();
  };

  const initializeConnection = async () => {
    try {
      setIsProcessing(true);
      const result = await mcpClient.connect();
      setIsConnected(true);
      
      // No banner messages; keep panel clean on connect
      
    } catch (error) {
      console.error('[AI Collaboration] Connection failed:', error);
      setIsConnected(false);
      addMessage('system', `Connection failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const addMessage = (sender, content, metadata = {}) => {
    const message = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender, // 'user', 'ai', 'system'
      content,
      timestamp: new Date().toISOString(),
      metadata,
      toolCalls: metadata.toolCalls || []
    };
    setMessages(prev => [...prev, message]);
  };

  const handleSendMessage = async () => {
    if (!currentInput.trim() || isProcessing) return;

    const userMessage = currentInput.trim();
    addMessage('user', userMessage);
    setCurrentInput('');

    setIsProcessing(true);

    try {
      // Check if we have an API key
      if (!hasAPIKey) {
        addMessage('ai', 'Please set up your API key first by clicking the key icon (🔑) in the header.');
        setIsProcessing(false);
        return;
      }

      // Auto-connect if not already connected
      if (!mcpClient.isConnected) {
        await initializeConnection();
        // Check connection status again after attempting to connect
        if (!mcpClient.isConnected) {
          setIsProcessing(false);
          return;
        }
      }

      // Choose between autonomous agent mode or single-call mode
      if (isAutonomousMode) {
        await handleAutonomousAgent(userMessage);
      } else {
        await handleQuestion(userMessage);
      }
    } catch (error) {
      console.error('[AI Collaboration] Error processing message:', error);
      addMessage('system', `Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setCurrentAgentRequest(null);
    }
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
      // Get API configuration and actual API key
      const apiConfig = await apiKeyManager.getAPIKeyInfo();
      const apiKey = await apiKeyManager.getAPIKey();
      
      if (!apiKey) {
        addMessage('ai', 'No API key found. Please set up your API key first.');
        return;
      }
      
      if (!apiConfig) {
        addMessage('ai', 'API configuration not found. Please set up your API key first.');
        return;
      }
      
      // Prepare conversation history (last 10 messages for context)
      const conversationHistory = messages.slice(-10).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Create abort controller for stop functionality
      const abortController = new AbortController();
      setCurrentAgentRequest(abortController);

      // Call the autonomous agent endpoint
      const response = await fetch('http://localhost:3001/api/ai/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          message: question,
          systemPrompt: 'You are an AI assistant with access to Redstring knowledge graph tools.',
          context: {
            activeGraphId: activeGraphId,
            graphCount: graphs.size,
            hasAPIKey: hasAPIKey,
            apiConfig: apiConfig ? {
              provider: apiConfig.provider,
              endpoint: apiConfig.endpoint,
              model: apiConfig.model,
              settings: apiConfig.settings
            } : null
          }
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Agent request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Add streamed-like messages: assistant thought then tool calls
      addMessage('ai', result.response || '', {
        toolCalls: result.toolCalls || [],
        iterations: result.iterations,
        mode: 'autonomous',
        isComplete: result.isComplete
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[Agent] Request was aborted');
      } else {
        console.error('[AI Collaboration] Autonomous agent failed:', error);
        addMessage('ai', `Agent error: ${error.message}`);
      }
    }
  };







  const handleQuestion = async (question) => {
    try {
      // Get API configuration for the chat request
      const apiConfig = await apiKeyManager.getAPIKeyInfo();
      
      if (!apiConfig) {
        addMessage('ai', 'Please set up your API key first by clicking the key icon in the header.');
        return;
      }
      
      // Prepare conversation history (last 10 messages for context)
      const conversationHistory = messages.slice(-10).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
      
      // Get the actual API key
      const apiKey = await apiKeyManager.getAPIKey();
      
      // Send the message to the AI model through the HTTP endpoint
      const response = await fetch('http://localhost:3001/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          message: question,
          systemPrompt: `You are Claude, a **knowledge graph architect** with advanced spatial reasoning, helping with Redstring - a visual knowledge graph system for emergent human-AI cognition.

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

**Think systemically. Organize spatially. Build knowledge together.** 🚀`,
          context: {
            activeGraphId: activeGraphId,
            graphCount: graphs.size,
            hasAPIKey: hasAPIKey,
            apiConfig: {
              provider: apiConfig.provider,
              endpoint: apiConfig.endpoint,
              model: apiConfig.model,
              settings: apiConfig.settings
            }
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
      }
      
      const result = await response.json();
      
      // Prefer structured toolCalls if provided by server
      if (result && typeof result === 'object' && 'response' in result) {
        addMessage('ai', (result.response || '').trim(), { toolCalls: result.toolCalls || [] });
        return;
      }
      
      // Fallback: string-only response
      const aiResponse = typeof result === 'string' ? result : 'I had trouble forming a response.';
      addMessage('ai', aiResponse.trim(), { toolCalls: [] });
    } catch (error) {
      console.error('[AI Collaboration] Question handling failed:', error);
      addMessage('ai', 'I encountered an error while processing your question. Please try again or check your connection to the MCP server.');
    }
  };









  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };



  const getGraphInfo = () => {
    if (!activeGraphId || !graphs.has(activeGraphId)) {
      return { name: 'No active graph', nodeCount: 0, edgeCount: 0 };
    }
    
    const graph = graphs.get(activeGraphId);
    return {
      name: graph.name,
      nodeCount: graph.instances.size,
      edgeCount: graph.edgeIds.length
    };
  };

  const graphInfo = getGraphInfo();

  return (
    <div className="ai-collaboration-panel">
      {/* Header */}
      <div className="ai-panel-header">
        <div className="ai-header-left">
          <Brain className="ai-header-icon" />
          <div className="ai-header-info">
            <h3>AI Collaboration</h3>
            <div className="ai-connection-status">
              <div className={`ai-status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
              <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
        <div className="ai-header-actions">
          <button 
            className={`ai-header-button api-key-button ${showAPIKeySetup ? 'active' : ''}`}
            onClick={() => setShowAPIKeySetup(!showAPIKeySetup)}
            title={hasAPIKey ? "Manage API Key" : "Setup API Key"}
          >
            <Key size={16} />
          </button>
          <button 
            className="ai-header-button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            title="Advanced Options"
          >
            <Settings size={16} />
          </button>

          <button
            className={`ai-header-button ${isConnected ? 'ai-refresh-button' : 'ai-connect-button'}`}
            onClick={initializeConnection}
            title={isConnected ? "Refresh Connection" : "Connect to MCP Server"}
            disabled={isProcessing}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Graph Context & Agent Mode */}
      <div className="ai-graph-context">
        <div className="ai-graph-info">
          <span className="ai-graph-name">{graphInfo.name}</span>
          <span className="ai-graph-stats">
            {graphInfo.nodeCount} nodes • {graphInfo.edgeCount} edges
          </span>
        </div>
        <div className="ai-mode-toggle">
          <label className="ai-toggle-label">
            <input
              type="checkbox"
              checked={isAutonomousMode}
              onChange={(e) => setIsAutonomousMode(e.target.checked)}
              className="ai-toggle-input"
            />
            <span className="ai-toggle-slider"></span>
            <span className="ai-toggle-text">
              {isAutonomousMode ? '🤖 Autonomous Agent' : '🔧 Single Tool Mode'}
            </span>
          </label>
        </div>
      </div>



      {/* API Key Setup Section */}
      {showAPIKeySetup && (
        <div className="ai-api-setup-section">
          <APIKeySetup 
            onKeySet={handleAPIKeySet}
            onClose={() => setShowAPIKeySetup(false)}
            inline={true}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="ai-panel-content">
          <div className="ai-chat-mode">
          {/* Messages */}
            <div className="ai-messages" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Empty connected state */}
              {isConnected && messages.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{
                    textAlign: 'center',
                    color: '#555',
                    fontFamily: "'EmOne', sans-serif",
                    fontSize: '14px'
                  }}>
                    What will we make today?
                  </div>
                </div>
              )}
            {messages.map((message) => (
              <div key={message.id} className={`ai-message ai-message-${message.sender}`}>
                <div className="ai-message-avatar">
                  {message.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="ai-message-content">
                  {/* Tool Calls Display (Cursor-style) */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="ai-tool-calls">
                      {message.toolCalls.map((toolCall, index) => (
                        <div key={index} className={`ai-tool-call ai-tool-call-${toolCall.status || 'running'}`}>
                          <div className="ai-tool-call-header">
                            <div className="ai-tool-call-icon">
                              {toolCall.status === 'completed' ? '✅' : 
                               toolCall.status === 'failed' ? '❌' : '🔄'}
                            </div>
                            <span className="ai-tool-call-name">{toolCall.name}</span>
                            <span className="ai-tool-call-status">
                              {toolCall.status === 'completed' ? 'Completed' :
                               toolCall.status === 'failed' ? 'Failed' : 'Running...'}
                            </span>
                          </div>
                          {toolCall.args && (
                            <div className="ai-tool-call-args">
                              <small>{JSON.stringify(toolCall.args, null, 2)}</small>
                            </div>
                          )}
                          {toolCall.result && (
                            <div className="ai-tool-call-result">
                              <div className="ai-tool-call-result-content">
                                {toolCall.result}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Regular Message Content */}
                  <div className="ai-message-text" style={{ userSelect: 'text', cursor: 'text' }}>
                    {message.content}
                  </div>
                  <div className="ai-message-timestamp">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="ai-message ai-message-ai">
                <div className="ai-message-avatar">
                  <Bot size={16} />
                </div>
                <div className="ai-message-content">
                  <div className="ai-message-text">
                    <div className="ai-typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <div className="ai-processing-status">
                      {isAutonomousMode ? 'Agent thinking and using tools...' : 'Thinking...'}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="ai-input-container">
            <textarea
              ref={inputRef}
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isAutonomousMode ? 
                "Tell me what you want to accomplish (I'll use multiple tools to complete it)..." : 
                "Ask me anything about your knowledge graph..."}
              disabled={isProcessing}
              className="ai-input"
              rows={2}
            />
            {isProcessing && currentAgentRequest ? (
              <button
                onClick={handleStopAgent}
                className="ai-stop-button"
                title="Stop Agent"
              >
                <Square size={16} />
              </button>
            ) : (
              <button
                onClick={handleSendMessage}
                disabled={!currentInput.trim() || isProcessing}
                className="ai-send-button"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>



    </div>
  );
};

export default AICollaborationPanel; 