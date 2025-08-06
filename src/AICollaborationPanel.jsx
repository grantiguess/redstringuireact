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
  Key
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
      
      // Add welcome message
      if (mcpClient.isSimulated) {
        addMessage('ai', `🤖 **Redstring AI (Simulated)**\nThis is a simulated environment. For full functionality, connect to the live Redstring MCP server.`);
      } else {
        addMessage('ai', `🤖 **Redstring AI Chat Connected!**\nNow connected to the live Redstring store via **${mcpClient.sessionInfo.serverInfo.name} v${mcpClient.sessionInfo.serverInfo.version}**.`);
      }

      // Show available tools
      if (hasAPIKey) {
        const toolList = result.tools.map(tool => `• **${tool.name}** - ${tool.description}`).join('\n');
        addMessage('ai', `**Available MCP Tools (Real Redstring Store):**\n\n${toolList}\n\nI can work with your REAL Redstring knowledge graphs! 🚀\n\nTry asking me to:\n• "Show me all available graphs"\n• "What's the current active graph?"`);
      } else {
        addMessage('ai', `Please set up your API key by clicking the key icon (🔑) in the header to start collaborating.`);
      }
      
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
      metadata
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

      // Analyze user input to determine intent
      await handleQuestion(userMessage);
    } catch (error) {
      console.error('[AI Collaboration] Error processing message:', error);
      addMessage('system', `Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };







  const handleQuestion = async (question) => {
    try {
      // Send the message to the AI model through the MCP server
      const result = await mcpClient.callTool('chat', { 
        message: question,
        context: {
          activeGraphId: activeGraphId,
          graphCount: graphs.size,
          hasAPIKey: hasAPIKey
        }
      });
      
      if (result && typeof result === 'string') {
        // Direct string response
        addMessage('ai', result);
      } else if (result?.content && Array.isArray(result.content)) {
        // Content array response
        for (const content of result.content) {
          if (content && typeof content.text === 'string') {
            addMessage('ai', content.text);
          }
        }
      } else if (result?.content && typeof result.content === 'string') {
        // Single content string
        addMessage('ai', result.content);
      } else {
        addMessage('ai', "I'm having trouble understanding. Could you rephrase your question?");
      }
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
          {!hasAPIKey && (
            <button 
              className="ai-header-button api-key-button"
              onClick={() => setShowAPIKeySetup(true)}
              title="Setup API Key"
            >
              <Key size={16} />
            </button>
          )}
          {hasAPIKey && (
            <button 
              className="ai-header-button api-key-button"
              onClick={() => setShowAPIKeySetup(true)}
              title="Manage API Key"
            >
              <Key size={16} />
            </button>
          )}
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

      {/* Graph Context */}
      <div className="ai-graph-context">
        <div className="ai-graph-info">
          <span className="ai-graph-name">{graphInfo.name}</span>
          <span className="ai-graph-stats">
            {graphInfo.nodeCount} nodes • {graphInfo.edgeCount} edges
          </span>
        </div>
      </div>



      {/* Main Content */}
      <div className="ai-panel-content">
        <div className="ai-chat-mode">
          {/* Messages */}
          <div className="ai-messages">
            {messages.map((message) => (
              <div key={message.id} className={`ai-message ai-message-${message.sender}`}>
                <div className="ai-message-avatar">
                  {message.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="ai-message-content">
                  <div className="ai-message-text">{message.content}</div>
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
              placeholder="Ask me anything about your knowledge graph..."
              disabled={isProcessing}
              className="ai-input"
              rows={2}
            />
            <button
              onClick={handleSendMessage}
              disabled={!currentInput.trim() || isProcessing}
              className="ai-send-button"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>



      {/* API Key Setup Modal */}
      {showAPIKeySetup && (
        <div className="api-key-modal-overlay">
          <div className="api-key-modal">
            <APIKeySetup 
              onKeySet={handleAPIKeySet}
              onClose={() => setShowAPIKeySetup(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AICollaborationPanel; 