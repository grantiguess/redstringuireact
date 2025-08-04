/**
 * AI Collaboration Panel Component
 * Provides interface for human-AI collaboration with Redstring's cognitive knowledge graph
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, 
  MessageSquare, 
  Lightbulb, 
  Network, 
  Search, 
  Plus, 
  Settings, 
  Play, 
  Pause, 
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Send,
  Bot,
  User,
  Sparkles,
  Target,
  Layers,
  GitBranch,
  Clock,
  BookOpen
} from 'lucide-react';
import mcpClient from './services/mcpClient.js';
import useGraphStore from './store/graphStore.js';
import './AICollaborationPanel.css';

const AICollaborationPanel = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeMode, setActiveMode] = useState('chat');
  const [collaborationHistory, setCollaborationHistory] = useState([]);
  const [aiInsights, setAiInsights] = useState([]);
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [operationResults, setOperationResults] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Get store state
  const activeGraphId = useGraphStore((state) => state.activeGraphId);
  const graphs = useGraphStore((state) => state.graphs);
  const nodePrototypes = useGraphStore((state) => state.nodePrototypes);

  // Available AI operations
  const aiOperations = [
    {
      id: 'explore_knowledge',
      name: 'Explore Knowledge',
      description: 'Semantically explore the knowledge graph',
      icon: Search,
      category: 'exploration'
    },
    {
      id: 'create_concept_map',
      name: 'Create Concept Map',
      description: 'Generate concept map from unstructured information',
      icon: Network,
      category: 'creation'
    },
    {
      id: 'analyze_literature',
      name: 'Literature Analysis',
      description: 'Systematic analysis of knowledge sources',
      icon: BookOpen,
      category: 'analysis'
    },
    {
      id: 'identify_patterns',
      name: 'Pattern Recognition',
      description: 'Identify recurring patterns in the graph',
      icon: Target,
      category: 'analysis'
    },
    {
      id: 'build_abstractions',
      name: 'Build Abstractions',
      description: 'Create higher-level conceptual frameworks',
      icon: Layers,
      category: 'creation'
    },
    {
      id: 'spatial_reasoning',
      name: 'Spatial Reasoning',
      description: 'Analyze spatial-semantic relationships',
      icon: GitBranch,
      category: 'reasoning'
    },
    {
      id: 'recursive_exploration',
      name: 'Recursive Exploration',
      description: 'Deep recursive knowledge exploration',
      icon: RotateCcw,
      category: 'exploration'
    },
    {
      id: 'collaborative_reasoning',
      name: 'Collaborative Reasoning',
      description: 'Iterative human-AI reasoning process',
      icon: MessageSquare,
      category: 'collaboration'
    }
  ];

  // Initialize MCP connection
  useEffect(() => {
    console.log('[AI Collaboration Panel] Initializing connection...');
    initializeConnection();
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initializeConnection = async () => {
    try {
      setIsProcessing(true);
      const result = await mcpClient.initialize();
      setIsConnected(true);
      setSessionInfo(result);
      
      // Add welcome message
      addMessage('ai', `AI Assistant connected! Session ID: ${result.sessionId.slice(0, 8)}...`);
      
      // Claude Desktop MCP server is available
      addMessage('ai', 'Claude Desktop connected! 🧠✨\n\n**Available MCP Tools:**\n• `list_available_graphs` - See all your knowledge graphs\n• `set_active_graph` - Switch between graphs (main, better-call-saul)\n• `explore_knowledge` - Search for concepts in your graphs\n• `get_node_details` - Get detailed info about specific nodes\n• `create_concept_map` - Visualize graph relationships\n• `add_node` - Add new nodes to any graph\n• `remove_node` - Remove nodes from graphs\n• `move_node` - Reposition nodes in the graph\n• `format_graph` - Organize graph layout (circular, grid, etc.)\n• `add_edge` - Create relationships between nodes\n• `remove_edge` - Remove relationships\n• `update_node` - Modify node properties\n• `duplicate_node` - Copy existing nodes\n• `merge_nodes` - Combine multiple nodes\n• `create_graph` - Create new knowledge graphs\n• `delete_graph` - Remove entire graphs\n• `export_graph` - Export data in various formats\n• `collaborative_reasoning` - AI-powered analysis\n\n**I can do everything a person could do with your knowledge graphs!** 🚀\n\n**To use these tools:**\n1. Open Claude Desktop\n2. Look for the "Search and tools" icon (slider icon)\n3. Use the Redstring MCP tools\n4. Start with `list_available_graphs` to see your graphs!\n\nWhat would you like to explore or modify in your Redstring graphs?');
      addMessage('system', `Claude Desktop: ${result.claudeMessage}`);
      
    } catch (error) {
      console.error('[AI Collaboration] Connection failed:', error);
      setIsConnected(false);
      addMessage('system', `Connection failed: ${error.message}`);
      addMessage('ai', 'I\'m having trouble connecting to the knowledge graph, but I can still help you with basic operations. Try refreshing the page or check the console for more details.');
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
    setCurrentInput('');
    addMessage('user', userMessage);

    setIsProcessing(true);

    try {
      // Analyze user input to determine intent
      const intent = analyzeUserIntent(userMessage);
      
      if (intent.type === 'operation') {
        await executeAIOperation(intent.operation, intent.parameters);
      } else if (intent.type === 'question') {
        await handleQuestion(userMessage);
      } else {
        await handleGeneralInput(userMessage);
      }
    } catch (error) {
      console.error('[AI Collaboration] Error processing message:', error);
      addMessage('system', `Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const analyzeUserIntent = (input) => {
    const lowerInput = input.toLowerCase();
    
    // Check for operation keywords
    if (lowerInput.includes('explore') || lowerInput.includes('search')) {
      return { type: 'operation', operation: 'explore_knowledge', parameters: { query: input } };
    }
    if (lowerInput.includes('create') && (lowerInput.includes('map') || lowerInput.includes('concept'))) {
      return { type: 'operation', operation: 'create_concept_map', parameters: { query: input } };
    }
    if (lowerInput.includes('analyze') || lowerInput.includes('literature')) {
      return { type: 'operation', operation: 'analyze_literature', parameters: { query: input } };
    }
    if (lowerInput.includes('pattern') || lowerInput.includes('identify')) {
      return { type: 'operation', operation: 'identify_patterns', parameters: { query: input } };
    }
    if (lowerInput.includes('abstract') || lowerInput.includes('build')) {
      return { type: 'operation', operation: 'build_abstractions', parameters: { query: input } };
    }
    if (lowerInput.includes('spatial') || lowerInput.includes('position')) {
      return { type: 'operation', operation: 'spatial_reasoning', parameters: { query: input } };
    }
    if (lowerInput.includes('recursive') || lowerInput.includes('deep')) {
      return { type: 'operation', operation: 'recursive_exploration', parameters: { query: input } };
    }
    if (lowerInput.includes('collaborate') || lowerInput.includes('reason')) {
      return { type: 'operation', operation: 'collaborative_reasoning', parameters: { query: input } };
    }
    
    // Default to question
    return { type: 'question', query: input };
  };

  const executeAIOperation = async (operationId, parameters) => {
    try {
      addMessage('ai', `Executing ${operationId.replace('_', ' ')}...`);
      
      let result;
      
      switch (operationId) {
        case 'explore_knowledge':
          result = await mcpClient.exploreKnowledge(parameters.query, {
            maxDepth: 3,
            includePatterns: true
          });
          break;
          
        case 'create_concept_map':
          const concepts = extractConceptsFromInput(parameters.query);
          result = await mcpClient.createConceptMap('user_domain', concepts, {
            autoConnect: true,
            confidenceThreshold: 0.7
          });
          break;
          
        case 'analyze_literature':
          result = await mcpClient.analyzeLiterature(parameters.query, [], {
            analysisDepth: 'detailed',
            includeConceptMapping: true
          });
          break;
          
        case 'identify_patterns':
          result = await mcpClient.executeTool('identify_patterns', {
            pattern_type: 'semantic',
            min_occurrences: 2
          });
          break;
          
        case 'build_abstractions':
          result = await mcpClient.buildAbstractions(['pattern_ids'], {
            abstractionName: 'AI Generated Abstraction',
            abstractionDescription: 'Higher-level concept from pattern analysis'
          });
          break;
          
        case 'spatial_reasoning':
          result = await mcpClient.spatialSemanticReasoning(parameters.query, {
            includeSpatialPatterns: true,
            includeSemanticPatterns: true
          });
          break;
          
        case 'recursive_exploration':
          result = await mcpClient.recursiveExploration(parameters.query, {
            maxDepth: 3,
            includeAbstractions: true
          });
          break;
          
        case 'collaborative_reasoning':
          result = await mcpClient.collaborativeReasoning(parameters.query, {
            maxIterations: 3,
            confidenceThreshold: 0.8
          });
          break;
          
        default:
          throw new Error(`Unknown operation: ${operationId}`);
      }
      
      // Process and display results
      await processOperationResults(operationId, result);
      
    } catch (error) {
      console.error(`[AI Collaboration] Operation failed:`, error);
      addMessage('system', `Operation failed: ${error.message}`);
    }
  };

  const processOperationResults = async (operationId, result) => {
    setOperationResults({ operationId, result });
    
    // Generate summary for user
    const summary = generateOperationSummary(operationId, result);
    addMessage('ai', summary);
    
    // Extract insights
    const insights = extractInsightsFromResults(result);
    if (insights.length > 0) {
      setAiInsights(prev => [...prev, ...insights]);
      addMessage('ai', `Key insights: ${insights.map(i => i.description).join(', ')}`);
    }
    
                    // Add to collaboration history
                setCollaborationHistory(prev => [...prev, {
                  id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  operation: operationId,
                  result,
                  timestamp: new Date().toISOString()
                }]);
  };

  const generateOperationSummary = (operationId, result) => {
    switch (operationId) {
      case 'explore_knowledge':
        const { total_nodes_visited } = result.exploration.result;
        return `Explored ${total_nodes_visited} related entities in your knowledge graph.`;
        
      case 'create_concept_map':
        const { entities, relationships } = result;
        return `Created concept map with ${entities.length} entities and ${relationships.length} relationships.`;
        
      case 'identify_patterns':
        const { total_patterns_found } = result.result;
        return `Identified ${total_patterns_found} recurring patterns in your knowledge structure.`;
        
      case 'spatial_reasoning':
        return 'Analyzed spatial-semantic relationships in your knowledge graph.';
        
      case 'recursive_exploration':
        return 'Completed deep recursive exploration of your knowledge network.';
        
      case 'collaborative_reasoning':
        const { iterations } = result;
        return `Completed collaborative reasoning in ${iterations.length} iterations.`;
        
      default:
        return 'Operation completed successfully.';
    }
  };

  const extractInsightsFromResults = (result) => {
    const insights = [];
    
    if (result.insights) {
      insights.push(...result.insights);
    }
    
    if (result.integratedInsights) {
      insights.push(...result.integratedInsights);
    }
    
    if (result.finalInsights) {
      insights.push(...result.finalInsights);
    }
    
    return insights;
  };

  const handleQuestion = async (question) => {
    try {
      // Check if the question is asking about a specific node
      const graphData = useGraphStore.getState();
      const nodes = Object.values(graphData.nodePrototypes);
      const nodeNames = nodes.map(node => node.name.toLowerCase());
      
      // Check if the question contains a node name
      const questionLower = question.toLowerCase();
      const matchingNode = nodes.find(node => 
        questionLower.includes(node.name.toLowerCase()) ||
        node.name.toLowerCase().includes(questionLower)
      );
      
      if (matchingNode) {
        // If it's about a specific node, use exploration
        const exploration = await mcpClient.exploreKnowledge(matchingNode.name, {
          maxDepth: 2,
          includePatterns: false
        });
        
        const answer = generateAnswerFromExploration(question, exploration);
        addMessage('ai', answer);
      } else {
        // If it's a general question, use collaborative reasoning
        const result = await mcpClient.collaborativeReasoning(question, {
          maxIterations: 2,
          confidenceThreshold: 0.7
        });
        
        console.log('[AI Panel] Collaborative reasoning result:', result);
        
        if (result.claudeDesktopReady) {
          addMessage('ai', 'Ready for Claude Desktop! 🧠✨\n\n**Available MCP Tools:**\n• `list_available_graphs` - See all your knowledge graphs\n• `set_active_graph` - Switch between graphs (main, better-call-saul)\n• `explore_knowledge` - Search for concepts in your graphs\n• `get_node_details` - Get detailed info about specific nodes\n• `create_concept_map` - Visualize graph relationships\n• `add_node` - Add new nodes to any graph\n• `remove_node` - Remove nodes from graphs\n• `move_node` - Reposition nodes in the graph\n• `format_graph` - Organize graph layout (circular, grid, etc.)\n• `collaborative_reasoning` - AI-powered analysis\n\n**To use these tools:**\n1. Open Claude Desktop\n2. Look for the "Search and tools" icon (slider icon)\n3. Use the Redstring MCP tools\n4. Start with `list_available_graphs` to see your graphs!\n\nWhat would you like to explore in your Redstring graphs?');
        } else {
          const response = result.finalInsights && result.finalInsights.length > 0 
            ? result.finalInsights[0]
            : "I've analyzed your question in the context of your knowledge graph. Could you be more specific about which concepts you'd like me to explore?";
          
          addMessage('ai', response);
        }
      }
      
    } catch (error) {
      console.error('[AI Collaboration] Question handling failed:', error);
      addMessage('ai', 'I encountered an error while processing your question. Could you rephrase it or ask about a specific concept in your knowledge graph?');
    }
  };

  const generateAnswerFromExploration = (question, exploration) => {
    if (!exploration.exploration || !exploration.exploration.result) {
      return "I couldn't find relevant information in your knowledge graph to answer that question.";
    }
    
    const { traversal_results, total_nodes_visited } = exploration.exploration.result;
    
    if (total_nodes_visited === 0) {
      return "I couldn't find any relevant entities in your knowledge graph for this question.";
    }
    
    const relevantEntities = traversal_results
      .filter(r => r.semantic_similarity > 0.5)
      .slice(0, 3)
      .map(r => r.name);
    
    if (relevantEntities.length === 0) {
      return "I found some related information, but the connections aren't strong enough to provide a confident answer.";
    }
    
    return `Based on your knowledge graph, I found ${total_nodes_visited} related entities. The most relevant are: ${relevantEntities.join(', ')}. Would you like me to explore any of these in more detail?`;
  };

  const handleGeneralInput = async (input) => {
    try {
      // Use collaborative reasoning for general input
      const result = await mcpClient.collaborativeReasoning(input, {
        maxIterations: 2,
        confidenceThreshold: 0.7
      });
      
      console.log('[AI Panel] General input result:', result);
      
      if (result.claudeDesktopReady) {
        addMessage('ai', 'Ready for Claude Desktop! 🧠✨\n\nTo use collaborative reasoning:\n1. Open Claude Desktop\n2. Look for the "Search and tools" icon (slider icon)\n3. Use the Redstring MCP tools for collaborative reasoning\n4. Ask Claude Desktop about your knowledge graph\n\nWhat would you like to explore in your Redstring graph?');
      } else {
        const response = result.finalInsights && result.finalInsights.length > 0 
          ? result.finalInsights[0]
          : "I've processed your input and updated my understanding of your knowledge graph.";
        
        addMessage('ai', response);
      }
      
    } catch (error) {
      console.error('[AI Collaboration] General input handling failed:', error);
      addMessage('ai', 'I processed your input and will incorporate it into my understanding of your knowledge graph.');
    }
  };

  const extractConceptsFromInput = (input) => {
    // Simple concept extraction - could be enhanced with NLP
    const words = input.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 5)
      .map(word => ({
        name: word.charAt(0).toUpperCase() + word.slice(1),
        description: `Concept extracted from user input: ${word}`
      }));
  };

  const handleOperationSelect = (operation) => {
    setSelectedOperation(operation);
    setActiveMode('operation');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setCollaborationHistory([]);
    setAiInsights([]);
    setOperationResults(null);
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
            className="ai-header-button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            title="Advanced Options"
          >
            <Settings size={16} />
          </button>
          <button 
            className="ai-header-button"
            onClick={clearHistory}
            title="Clear History"
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

      {/* Mode Tabs */}
      <div className="ai-mode-tabs">
        <button 
          className={`ai-mode-tab ${activeMode === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveMode('chat')}
        >
          <MessageSquare size={16} />
          Chat
        </button>
        <button 
          className={`ai-mode-tab ${activeMode === 'operations' ? 'active' : ''}`}
          onClick={() => setActiveMode('operations')}
        >
          <Sparkles size={16} />
          Operations
        </button>
        <button 
          className={`ai-mode-tab ${activeMode === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveMode('insights')}
        >
          <Lightbulb size={16} />
          Insights
        </button>
      </div>

      {/* Main Content */}
      <div className="ai-panel-content">
        {activeMode === 'chat' && (
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
        )}

        {activeMode === 'operations' && (
          <div className="ai-operations-mode">
            <div className="ai-operations-grid">
              {aiOperations.map((operation) => (
                <button
                  key={operation.id}
                  className="ai-operation-card"
                  onClick={() => handleOperationSelect(operation)}
                >
                  <operation.icon size={20} />
                  <div className="ai-operation-info">
                    <h4>{operation.name}</h4>
                    <p>{operation.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {selectedOperation && (
              <div className="ai-operation-details">
                <div className="ai-operation-header">
                  <h4>{selectedOperation.name}</h4>
                  <button 
                    className="ai-close-button"
                    onClick={() => setSelectedOperation(null)}
                  >
                    ×
                  </button>
                </div>
                <p>{selectedOperation.description}</p>
                <button 
                  className="ai-execute-button"
                  onClick={() => executeAIOperation(selectedOperation.id, { query: 'Execute operation' })}
                  disabled={isProcessing}
                >
                  <Play size={16} />
                  Execute
                </button>
              </div>
            )}
          </div>
        )}

        {activeMode === 'insights' && (
          <div className="ai-insights-mode">
            <div className="ai-insights-header">
              <h4>AI Insights</h4>
              <span className="ai-insights-count">{aiInsights.length} insights</span>
            </div>
            
            <div className="ai-insights-list">
              {aiInsights.length === 0 ? (
                <div className="ai-empty-state">
                  <Lightbulb size={24} />
                  <p>No insights yet. Try exploring your knowledge graph!</p>
                </div>
              ) : (
                aiInsights.map((insight, index) => (
                  <div key={index} className="ai-insight-card">
                    <div className="ai-insight-header">
                      <span className="ai-insight-type">{insight.type}</span>
                      <span className="ai-insight-confidence">
                        {Math.round(insight.confidence * 100)}%
                      </span>
                    </div>
                    <p className="ai-insight-description">{insight.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="ai-advanced-options">
          <div className="ai-advanced-header">
            <h4>Advanced Options</h4>
            <button 
              className="ai-close-button"
              onClick={() => setShowAdvanced(false)}
            >
              ×
            </button>
          </div>
          
          <div className="ai-advanced-content">
            <div className="ai-advanced-section">
              <h5>Session Information</h5>
              {sessionInfo && (
                <div className="ai-session-info">
                  <p><strong>Session ID:</strong> {sessionInfo.sessionId}</p>
                  <p><strong>Server:</strong> {sessionInfo.serverInfo.name}</p>
                  <p><strong>Version:</strong> {sessionInfo.serverInfo.version}</p>
                </div>
              )}
            </div>
            
            <div className="ai-advanced-section">
              <h5>Available Tools</h5>
              <div className="ai-tools-list">
                {sessionInfo?.capabilities?.tools && 
                  Object.keys(sessionInfo.capabilities.tools).map(tool => (
                    <span key={tool} className="ai-tool-tag">{tool}</span>
                  ))
                }
              </div>
            </div>
            
            <div className="ai-advanced-section">
              <h5>Collaboration History</h5>
              <div className="ai-history-list">
                {collaborationHistory.map((item) => (
                  <div key={item.id} className="ai-history-item">
                    <span className="ai-history-operation">{item.operation}</span>
                    <span className="ai-history-time">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AICollaborationPanel; 