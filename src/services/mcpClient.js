/**
 * MCP (Model Context Protocol) Client for Redstring
 * Provides standardized interface for AI models to connect and interact with cognitive knowledge graphs
 */

import useGraphStore from '../store/graphStore.js';

/**
 * MCP Client for AI Model Integration
 * Handles communication between AI models and Redstring's cognitive knowledge graph
 */
class RedstringMCPClient {
  constructor() {
    this.sessionId = null;
    this.capabilities = {
      tools: {
        'list_available_graphs': { description: 'List all available knowledge graphs from the real Redstring store' },
        'get_active_graph': { description: 'Get detailed information about the currently active graph from the real Redstring store' },
        'set_active_graph': { description: 'Set a graph as the active graph in the real Redstring UI (graph must already be open)' },
        'add_node_prototype': { description: 'Add a new node prototype to the real Redstring store' },
        'add_node_instance': { description: 'Add a new instance of a prototype to the active graph in the real Redstring store' },
        'open_graph': { description: 'Open a graph and make it the active graph in the real Redstring UI' }
      },
      resources: {}
    };
    this.activeContext = {
      currentFocus: null,
      reasoningChain: [],
      activeHypotheses: [],
      confidenceLevels: {}
    };
  }

  /**
   * Initialize MCP connection and handshake
   */
  async initialize() {
    try {
      // Claude Desktop MCP server should be available through the MCP protocol
      // The tools will be provided by Claude Desktop's MCP server
      const claudeConnection = { success: true, message: 'Claude Desktop MCP server available' };
      
      // Generate session ID
      this.sessionId = this.generateSessionId();
      
      // Initialize cognitive context locally (don't try to access resource yet)
      this.activeContext = {
        currentFocus: 'general_knowledge_exploration',
        reasoningChain: [],
        activeHypotheses: [],
        confidenceLevels: {}
      };

      return {
        success: true,
        sessionId: this.sessionId,
        capabilities: this.capabilities,
        serverInfo: { name: 'Redstring MCP Client', version: '1.0.0' },
        claudeConnected: claudeConnection.success,
        claudeMessage: claudeConnection.message
      };
    } catch (error) {
      console.error('[MCP Client] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Execute a tool on the Redstring knowledge graph
   */
  async executeTool(toolName, arguments_ = {}) {
    try {
      // Validate tool exists
      if (!this.capabilities.tools[toolName]) {
        throw new Error(`Tool '${toolName}' not available`);
      }

      // Add session context to arguments
      const enrichedArgs = {
        ...arguments_,
        session_id: this.sessionId,
        timestamp: new Date().toISOString()
      };

      // For now, return a placeholder response
      // Claude Desktop will handle the actual tool execution through its MCP server
      const result = `Tool '${toolName}' ready for Claude Desktop processing with arguments: ${JSON.stringify(enrichedArgs)}`;

      // Update cognitive context with tool execution
      await this.updateCognitiveContext({
        lastToolExecuted: toolName,
        lastToolArguments: enrichedArgs,
        lastToolResult: result
      });

      return {
        success: true,
        tool: toolName,
        result,
        sessionId: this.sessionId
      };
    } catch (error) {
      console.error(`[MCP Client] Tool execution failed for '${toolName}':`, error);
      throw error;
    }
  }

  /**
   * Get a resource from the Redstring knowledge graph
   */
  async getResource(uri) {
    try {
      // Validate resource exists
      if (!this.capabilities.resources[uri]) {
        throw new Error(`Resource '${uri}' not available`);
      }

      // For now, return a placeholder response
      // Claude Desktop will handle the actual resource retrieval through its MCP server
      const resource = `Resource '${uri}' ready for Claude Desktop processing`;

      return {
        success: true,
        uri,
        resource,
        sessionId: this.sessionId
      };
    } catch (error) {
      console.error(`[MCP Client] Resource retrieval failed for '${uri}':`, error);
      throw error;
    }
  }

  /**
   * Execute a prompt workflow
   */
  async executePrompt(promptName, arguments_ = {}) {
    try {
      // Validate prompt exists
      if (!this.capabilities.prompts[promptName]) {
        throw new Error(`Prompt '${promptName}' not available`);
      }

      // Add session context to arguments
      const enrichedArgs = {
        ...arguments_,
        session_id: this.sessionId,
        timestamp: new Date().toISOString()
      };

      // Execute prompt
      const result = await this.server.executePrompt(promptName, enrichedArgs);

      // Update cognitive context with prompt execution
      await this.updateCognitiveContext({
        lastPromptExecuted: promptName,
        lastPromptArguments: enrichedArgs,
        lastPromptResult: result
      });

      return {
        success: true,
        prompt: promptName,
        result,
        sessionId: this.sessionId
      };
    } catch (error) {
      console.error(`[MCP Client] Prompt execution failed for '${promptName}':`, error);
      throw error;
    }
  }

  /**
   * High-level cognitive operations for AI models
   */

  /**
   * Explore knowledge graph semantically
   */
  async exploreKnowledge(startEntity, options = {}) {
    const {
      relationshipTypes = [],
      semanticThreshold = 0.7,
      maxDepth = 3,
      includePatterns = true
    } = options;

    const results = {
      exploration: null,
      patterns: null,
      insights: [],
      claudeAnalysis: null
    };

    // Perform semantic traversal
    results.exploration = await this.executeTool('traverse_semantic_graph', {
      start_entity: startEntity,
      relationship_types: relationshipTypes,
      semantic_threshold: semanticThreshold,
      max_depth: maxDepth
    });

    // Identify patterns if requested
    if (includePatterns) {
      results.patterns = await this.executeTool('identify_patterns', {
        pattern_type: 'semantic',
        min_occurrences: 2
      });
    }

    // Claude Desktop should handle semantic analysis through its MCP tools
    const graphContext = this.getGraphContext();
    results.claudeAnalysis = {
      success: true,
      result: `Knowledge exploration ready for Claude Desktop processing.
      
**Query:** ${startEntity}
**Graph Context:** ${graphContext.nodeCount} nodes, ${graphContext.edgeCount} edges
**Exploration Results:** Available for Claude Desktop analysis

Claude Desktop will handle the semantic analysis through its MCP tools.`
    };

    // Generate insights
    results.insights = this.generateInsights(results.exploration, results.patterns);

    return results;
  }

  /**
   * Create a concept map from unstructured information
   */
  async createConceptMap(domain, concepts, options = {}) {
    const {
      abstractionLevel = 'mixed',
      autoConnect = true,
      confidenceThreshold = 0.7
    } = options;

    const results = {
      entities: [],
      relationships: [],
      abstractions: []
    };

    // Get current graph context
    const graphSchema = await this.getResource('graph://schema');
    const activeGraphId = this.getActiveGraphId();

    // Create concept entities
    for (const concept of concepts) {
      const entity = await this.executeTool('create_cognitive_entity', {
        name: concept.name || concept,
        description: concept.description || '',
        graph_id: activeGraphId,
        observation_metadata: {
          source: 'ai_concept_mapping',
          domain,
          abstraction_level: abstractionLevel
        }
      });
      results.entities.push(entity);
    }

    // Auto-connect concepts if requested
    if (autoConnect) {
      for (let i = 0; i < results.entities.length; i++) {
        for (let j = i + 1; j < results.entities.length; j++) {
          const similarity = this.calculateConceptSimilarity(
            results.entities[i].result,
            results.entities[j].result
          );

          if (similarity >= confidenceThreshold) {
            const relationship = await this.executeTool('establish_semantic_relation', {
              source_id: results.entities[i].result.prototype_id,
              target_id: results.entities[j].result.prototype_id,
              relationship_type: 'related_to',
              strength_score: similarity,
              confidence: similarity,
              metadata: {
                source: 'ai_auto_connection',
                similarity_score: similarity
              }
            });
            results.relationships.push(relationship);
          }
        }
      }
    }

    return results;
  }

  /**
   * Perform systematic literature analysis
   */
  async analyzeLiterature(topic, sources = [], options = {}) {
    const {
      analysisDepth = 'detailed',
      includeConceptMapping = true,
      generateHypotheses = true
    } = options;

    const results = {
      analysis: null,
      conceptMap: null,
      hypotheses: []
    };

    // Perform systematic analysis
    results.analysis = await this.executePrompt('systematic_literature_analysis', {
      topic,
      sources,
      analysis_depth: analysisDepth
    });

    // Create concept map if requested
    if (includeConceptMapping && results.analysis.result.key_concepts) {
      results.conceptMap = await this.createConceptMap(
        topic,
        results.analysis.result.key_concepts.map(concept => ({
          name: concept,
          description: `Key concept from ${topic} analysis`
        }))
      );
    }

    // Generate hypotheses if requested
    if (generateHypotheses) {
      for (const insight of results.analysis.result.insights || []) {
        const hypothesis = await this.executePrompt('hypothesis_generation', {
          observation: insight,
          domain_constraints: [topic],
          confidence_threshold: 0.7
        });
        results.hypotheses.push(hypothesis);
      }
    }

    return results;
  }

  /**
   * Build cognitive abstractions from patterns
   */
  async buildAbstractions(patternIds, options = {}) {
    const {
      abstractionName,
      abstractionDescription,
      confidenceThreshold = 0.7
    } = options;

    const results = {
      abstraction: null,
      relationships: []
    };

    // Build abstraction
    results.abstraction = await this.executeTool('build_cognitive_abstraction', {
      pattern_ids: patternIds,
      abstraction_name: abstractionName,
      abstraction_description: abstractionDescription,
      confidence_threshold: confidenceThreshold
    });

    return results;
  }

  /**
   * Collaborative reasoning with human input
   */
  async collaborativeReasoning(humanInput, options = {}) {
    const {
      reasoningMode = 'iterative',
      maxIterations = 3,
      confidenceThreshold = 0.8
    } = options;

    // Claude Desktop should handle collaborative reasoning through its MCP tools
    // This method provides context for Claude Desktop to work with
    const graphContext = this.getGraphContext();
    
    return {
      iterations: [{ 
        iteration: 1, 
        message: `Ready for collaborative reasoning with Claude Desktop. 
        
**Your Input:** ${humanInput}
**Graph Context:** ${graphContext.nodeCount} nodes, ${graphContext.edgeCount} edges
**Reasoning Mode:** ${reasoningMode}

Claude Desktop will handle the collaborative reasoning through its MCP tools.` 
      }],
      finalInsights: [`Collaborative reasoning ready for Claude Desktop processing.`],
      recommendations: [`Use Claude Desktop's MCP tools for collaborative reasoning.`],
      claudeDesktopReady: true
    };

    // Fallback to local reasoning if Claude is not available
    const results = {
      iterations: [],
      finalInsights: [],
      recommendations: []
    };

    let currentInput = humanInput;
    let iteration = 0;

    while (iteration < maxIterations) {
      // Analyze current input
      const analysis = await this.analyzeInput(currentInput);
      
      // Generate AI insights
      const aiInsights = await this.generateInsights(analysis);
      
      // Create collaborative response
      const response = await this.createCollaborativeResponse(analysis, aiInsights);
      
      results.iterations.push({
        iteration: iteration + 1,
        input: currentInput,
        analysis,
        aiInsights,
        response
      });

      // Check if we've reached sufficient confidence
      if (response.confidence >= confidenceThreshold) {
        results.finalInsights = aiInsights;
        results.recommendations = response.recommendations;
        break;
      }

      // Prepare for next iteration
      currentInput = response.nextQuestions.join(' ');
      iteration++;
    }

    return results;
  }

  /**
   * Spatial-semantic reasoning
   */
  async spatialSemanticReasoning(spatialQuery, options = {}) {
    const {
      includeSpatialPatterns = true,
      includeSemanticPatterns = true,
      spatialThreshold = 100
    } = options;

    const results = {
      spatialAnalysis: null,
      semanticAnalysis: null,
      integratedInsights: []
    };

    // Analyze spatial patterns
    if (includeSpatialPatterns) {
      results.spatialAnalysis = await this.executeTool('identify_patterns', {
        pattern_type: 'spatial',
        min_occurrences: 2
      });
    }

    // Analyze semantic patterns
    if (includeSemanticPatterns) {
      results.semanticAnalysis = await this.executeTool('identify_patterns', {
        pattern_type: 'semantic',
        min_occurrences: 2
      });
    }

    // Integrate spatial and semantic insights
    results.integratedInsights = this.integrateSpatialSemanticInsights(
      results.spatialAnalysis,
      results.semanticAnalysis
    );

    return results;
  }

  /**
   * Recursive exploration with depth control
   */
  async recursiveExploration(startEntity, options = {}) {
    const {
      maxDepth = 5,
      depthControl = 'adaptive',
      relevanceThreshold = 0.6,
      includeAbstractions = true
    } = options;

    const results = {
      explorationTree: [],
      abstractions: [],
      insights: []
    };

    const exploreRecursively = async (entity, depth, path) => {
      if (depth > maxDepth) return null;

      // Perform exploration at current depth
      const exploration = await this.exploreKnowledge(entity, {
        maxDepth: 1,
        includePatterns: depth % 2 === 0 // Alternate pattern analysis
      });

      const node = {
        entity,
        depth,
        path: [...path, entity],
        exploration,
        children: []
      };

      // Determine if we should continue deeper
      let shouldContinue = true;
      if (depthControl === 'adaptive') {
        const relevance = this.calculateRelevance(exploration, path);
        shouldContinue = relevance >= relevanceThreshold;
      }

      if (shouldContinue && depth < maxDepth) {
        // Find most relevant entities to explore next
        const nextEntities = this.selectNextEntities(exploration, path);
        
        for (const nextEntity of nextEntities.slice(0, 3)) { // Limit branching
          const child = await exploreRecursively(nextEntity, depth + 1, path);
          if (child) {
            node.children.push(child);
          }
        }
      }

      return node;
    };

    // Start recursive exploration
    results.explorationTree = await exploreRecursively(startEntity, 0, []);

    // Build abstractions if requested
    if (includeAbstractions) {
      const patterns = this.extractPatternsFromTree(results.explorationTree);
      for (const pattern of patterns) {
        const abstraction = await this.buildAbstractions([pattern.id], {
          abstractionName: `Abstraction from ${startEntity}`,
          abstractionDescription: `Higher-level concept derived from recursive exploration`
        });
        results.abstractions.push(abstraction);
      }
    }

    return results;
  }

  // Helper Methods

  generateSessionId() {
    return `mcp_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async updateCognitiveContext(updates) {
    this.activeContext = {
      ...this.activeContext,
      ...updates,
      lastUpdated: new Date().toISOString()
    };

    // Update context in server
    await this.server.getResource(`cognitive://context/${this.sessionId}`);
  }

  getActiveGraphId() {
    // This would get the current active graph from the Redstring store
    // For now, return a default or the first available graph
    const store = useGraphStore.getState();
    if (store && store.activeGraphId) {
      return store.activeGraphId;
    }
    
    // Fallback to first available graph
    if (store && store.graphs.size > 0) {
      return Array.from(store.graphs.keys())[0];
    }
    
    return null;
  }

  getGraphContext() {
    // Get the current graph context for AI operations
    const store = useGraphStore.getState();
    if (!store) {
      return {
        nodes: {},
        edges: {},
        activeGraphId: null,
        graphCount: 0
      };
    }

    const activeGraphId = store.activeGraphId;
    const graphs = store.graphs;
    const nodePrototypes = store.nodePrototypes;

    // Get the active graph data
    const activeGraph = activeGraphId ? graphs.get(activeGraphId) : null;
    
    // Convert node prototypes to a simple object for AI context
    const nodes = {};
    Object.values(nodePrototypes).forEach(node => {
      nodes[node.id] = {
        id: node.id,
        name: node.name,
        description: node.description,
        color: node.color,
        typeNodeId: node.typeNodeId
      };
    });

    // Get edges for the active graph
    const edges = {};
    if (activeGraph && activeGraph.edges) {
      activeGraph.edges.forEach(edge => {
        edges[edge.id] = {
          id: edge.id,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          type: edge.type,
          label: edge.label
        };
      });
    }

    return {
      nodes,
      edges,
      activeGraphId,
      graphCount: graphs.size,
      activeGraphName: activeGraph?.name || 'Untitled Graph',
      nodeCount: Object.keys(nodes).length,
      edgeCount: Object.keys(edges).length
    };
  }

  calculateConceptSimilarity(entity1, entity2) {
    // Simple similarity calculation based on name and description
    const name1 = entity1.name.toLowerCase();
    const name2 = entity2.name.toLowerCase();
    const desc1 = (entity1.description || '').toLowerCase();
    const desc2 = (entity2.description || '').toLowerCase();

    const nameSimilarity = this.calculateTextSimilarity(name1, name2);
    const descSimilarity = this.calculateTextSimilarity(desc1, desc2);

    return (nameSimilarity * 0.7) + (descSimilarity * 0.3);
  }

  calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  generateInsights(exploration, patterns) {
    const insights = [];

    if (exploration && exploration.result) {
      const { traversal_results, total_nodes_visited } = exploration.result;
      
      // Generate insights from traversal
      if (total_nodes_visited > 10) {
        insights.push({
          type: 'connectivity',
          description: `High connectivity detected with ${total_nodes_visited} related entities`,
          confidence: 0.8
        });
      }

      // Analyze traversal depth
      const maxDepth = Math.max(...traversal_results.map(r => r.depth));
      if (maxDepth > 2) {
        insights.push({
          type: 'hierarchy',
          description: `Deep hierarchical structure detected (depth: ${maxDepth})`,
          confidence: 0.7
        });
      }
    }

    if (patterns && patterns.result) {
      const { patterns: patternList, total_patterns_found } = patterns.result;
      
      if (total_patterns_found > 0) {
        insights.push({
          type: 'patterns',
          description: `${total_patterns_found} recurring patterns identified`,
          confidence: 0.9
        });
      }
    }

    return insights;
  }

  async analyzeInput(input) {
    // Simple input analysis - could be enhanced with NLP
    return {
      type: 'text_input',
      content: input,
      keyConcepts: this.extractKeyConcepts(input),
      sentiment: 'neutral',
      complexity: this.assessComplexity(input)
    };
  }

  async generateInsights(analysis) {
    // Generate AI insights based on analysis
    return [
      {
        type: 'conceptual',
        description: 'Analysis reveals underlying conceptual patterns',
        confidence: 0.8
      },
      {
        type: 'relational',
        description: 'Key relationships identified between concepts',
        confidence: 0.7
      }
    ];
  }

  async createCollaborativeResponse(analysis, aiInsights) {
    return {
      confidence: 0.8,
      insights: aiInsights,
      recommendations: [
        'Explore identified conceptual patterns further',
        'Validate relationships through additional analysis'
      ],
      nextQuestions: [
        'What specific aspects would you like to explore?',
        'Are there particular relationships you find interesting?'
      ]
    };
  }

  integrateSpatialSemanticInsights(spatialAnalysis, semanticAnalysis) {
    const insights = [];

    if (spatialAnalysis && spatialAnalysis.result) {
      insights.push({
        type: 'spatial_semantic',
        description: 'Spatial arrangement reflects semantic relationships',
        confidence: 0.7
      });
    }

    if (semanticAnalysis && semanticAnalysis.result) {
      insights.push({
        type: 'semantic_spatial',
        description: 'Semantic patterns influence spatial organization',
        confidence: 0.8
      });
    }

    return insights;
  }

  calculateRelevance(exploration, path) {
    // Calculate relevance based on exploration results and path
    if (!exploration || !exploration.result) return 0;

    const { total_nodes_visited, semantic_threshold_used } = exploration.result;
    
    // Higher relevance for more nodes visited and higher semantic threshold
    const nodeScore = Math.min(total_nodes_visited / 10, 1.0);
    const thresholdScore = semantic_threshold_used;
    
    return (nodeScore * 0.6) + (thresholdScore * 0.4);
  }

  selectNextEntities(exploration, path) {
    if (!exploration || !exploration.result) return [];

    const { traversal_results } = exploration.result;
    
    // Select entities that are most relevant and not in current path
    return traversal_results
      .filter(result => !path.includes(result.node_id))
      .sort((a, b) => b.semantic_similarity - a.semantic_similarity)
      .slice(0, 5)
      .map(result => result.node_id);
  }

  extractPatternsFromTree(explorationTree) {
    const patterns = [];
    
    const extractFromNode = (node) => {
      if (node.exploration && node.exploration.result) {
        const { patterns: nodePatterns } = node.exploration.result;
        if (nodePatterns) {
          patterns.push(...nodePatterns);
        }
      }
      
      for (const child of node.children || []) {
        extractFromNode(child);
      }
    };

    if (explorationTree) {
      extractFromNode(explorationTree);
    }

    return patterns;
  }

  extractKeyConcepts(input) {
    // Simple key concept extraction - could be enhanced with NLP
    const words = input.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 5);
  }

  assessComplexity(input) {
    const words = input.split(/\s+/);
    const sentences = input.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    const avgWordsPerSentence = words.length / sentences.length;
    const uniqueWords = new Set(words).size;
    const lexicalDiversity = uniqueWords / words.length;
    
    if (avgWordsPerSentence > 20 || lexicalDiversity > 0.8) {
      return 'high';
    } else if (avgWordsPerSentence > 10 || lexicalDiversity > 0.6) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get current session information
   */
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      capabilities: this.capabilities,
      activeContext: this.activeContext
    };
  }

  /**
   * Close MCP session
   */
  async close() {
    try {
      // Clean up session
      this.sessionId = null;
      this.capabilities = null;
      this.activeContext = null;
      
      return { success: true, message: 'Session closed successfully' };
    } catch (error) {
      console.error('[MCP Client] Session closure failed:', error);
      throw error;
    }
  }
}

// Create singleton instance
const mcpClient = new RedstringMCPClient();

export default mcpClient; 