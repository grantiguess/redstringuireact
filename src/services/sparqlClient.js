/**
 * SPARQL Client Service
 * 
 * Handles queries to external SPARQL endpoints for semantic web data integration.
 */

import { SimpleClient as SparqlHttpClient } from 'sparql-http-client';

// Predefined SPARQL endpoints for major knowledge bases
const PREDEFINED_ENDPOINTS = {
  wikidata: {
    name: 'Wikidata',
    url: 'https://query.wikidata.org/sparql',
    description: 'Wikimedia knowledge base',
    defaultGraph: null,
    rateLimit: 1000, // ms between requests
    timeout: 30000, // 30 seconds
    headers: {
      'User-Agent': 'Redstring-SPARQL-Client/1.0'
    }
  },
  dbpedia: {
    name: 'DBpedia',
    url: 'https://dbpedia.org/sparql',
    description: 'Structured data from Wikipedia',
    defaultGraph: 'http://dbpedia.org',
    rateLimit: 500,
    timeout: 20000,
    headers: {
      'Accept': 'application/sparql-results+json'
    }
  },
  schema: {
    name: 'Schema.org',
    url: 'https://schema.org/sparql',
    description: 'Schema.org vocabulary',
    defaultGraph: 'https://schema.org',
    rateLimit: 1000,
    timeout: 15000,
    headers: {}
  }
};

export class SPARQLClient {
  constructor() {
    this.endpoints = new Map(Object.entries(PREDEFINED_ENDPOINTS));
    this.clients = new Map();
    this.lastRequestTime = new Map();
    this.queryCache = new Map();
    this.CACHE_TTL = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Add a custom SPARQL endpoint
   * @param {string} key - Endpoint identifier
   * @param {Object} config - Endpoint configuration
   */
  addEndpoint(key, config) {
    this.endpoints.set(key, {
      ...config,
      rateLimit: config.rateLimit || 1000,
      timeout: config.timeout || 20000,
      headers: config.headers || {}
    });
    
    // Clear cached client
    this.clients.delete(key);
  }

  /**
   * Remove a custom endpoint
   * @param {string} key - Endpoint identifier
   */
  removeEndpoint(key) {
    if (PREDEFINED_ENDPOINTS[key]) {
      throw new Error(`Cannot remove predefined endpoint: ${key}`);
    }
    
    this.endpoints.delete(key);
    this.clients.delete(key);
  }

  /**
   * Get endpoint configuration
   * @param {string} key - Endpoint identifier
   * @returns {Object} Endpoint configuration
   */
  getEndpoint(key) {
    return this.endpoints.get(key);
  }

  /**
   * List all available endpoints
   * @returns {Array} Array of endpoint configurations
   */
  listEndpoints() {
    return Array.from(this.endpoints.entries()).map(([key, config]) => ({
      key,
      ...config
    }));
  }

  /**
   * Execute a SPARQL query
   * @param {string} endpointKey - Endpoint identifier
   * @param {string} query - SPARQL query string
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query results
   */
  async executeQuery(endpointKey, query, options = {}) {
    const endpoint = this.endpoints.get(endpointKey);
    if (!endpoint) {
      throw new Error(`Unknown endpoint: ${endpointKey}`);
    }

    // Check rate limiting
    await this._checkRateLimit(endpointKey, endpoint.rateLimit);

    // Check cache
    const cacheKey = `${endpointKey}:${this._hashQuery(query)}`;
    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
      this.queryCache.delete(cacheKey);
    }

    try {
      const client = await this._getClient(endpointKey, endpoint);
      const result = await client.query.select(query, {
        signal: AbortSignal.timeout(endpoint.timeout),
        headers: { ...endpoint.headers, ...options.headers }
      });

      const parsedResult = await this._parseQueryResult(result);
      
      // Cache the result
      this.queryCache.set(cacheKey, {
        data: parsedResult,
        timestamp: Date.now()
      });

      return parsedResult;
    } catch (error) {
      console.error(`[SPARQL Client] Query failed for ${endpointKey}:`, error);
      throw new Error(`SPARQL query failed: ${error.message}`);
    }
  }

  /**
   * Execute a CONSTRUCT query and return RDF triples
   * @param {string} endpointKey - Endpoint identifier
   * @param {string} query - SPARQL CONSTRUCT query
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of RDF triples
   */
  async executeConstructQuery(endpointKey, query, options = {}) {
    const endpoint = this.endpoints.get(endpointKey);
    if (!endpoint) {
      throw new Error(`Unknown endpoint: ${endpointKey}`);
    }

    await this._checkRateLimit(endpointKey, endpoint.rateLimit);

    try {
      const client = await this._getClient(endpointKey, endpoint);
      const result = await client.query.construct(query, {
        signal: AbortSignal.timeout(endpoint.timeout),
        headers: { ...endpoint.headers, ...options.headers }
      });

      return await this._parseConstructResult(result);
    } catch (error) {
      console.error(`[SPARQL Client] CONSTRUCT query failed for ${endpointKey}:`, error);
      throw new Error(`SPARQL CONSTRUCT query failed: ${error.message}`);
    }
  }

  /**
   * Query for equivalent classes
   * @param {string} endpointKey - Endpoint identifier
   * @param {string} classUri - URI of the class to find equivalents for
   * @returns {Promise<Array>} Array of equivalent class URIs
   */
  async findEquivalentClasses(endpointKey, classUri) {
    const query = `
      SELECT DISTINCT ?equivalentClass WHERE {
        {
          <${classUri}> owl:equivalentClass ?equivalentClass .
        }
        UNION
        {
          ?equivalentClass owl:equivalentClass <${classUri}> .
        }
        UNION
        {
          <${classUri}> owl:sameAs ?equivalentClass .
        }
        UNION
        {
          ?equivalentClass owl:sameAs <${classUri}> .
        }
      }
      LIMIT 50
    `;

    const result = await this.executeQuery(endpointKey, query);
    return result.results.map(binding => binding.equivalentClass?.value).filter(Boolean);
  }

  /**
   * Query for subclasses
   * @param {string} endpointKey - Endpoint identifier
   * @param {string} classUri - URI of the parent class
   * @returns {Promise<Array>} Array of subclass URIs
   */
  async findSubClasses(endpointKey, classUri) {
    const query = `
      SELECT DISTINCT ?subClass WHERE {
        ?subClass rdfs:subClassOf <${classUri}> .
      }
      LIMIT 100
    `;

    const result = await this.executeQuery(endpointKey, query);
    return result.results.map(binding => binding.subClass?.value).filter(Boolean);
  }

  /**
   * Query for superclasses
   * @param {string} endpointKey - Endpoint identifier
   * @param {string} classUri - URI of the child class
   * @returns {Promise<Array>} Array of superclass URIs
   */
  async findSuperClasses(endpointKey, classUri) {
    const query = `
      SELECT DISTINCT ?superClass WHERE {
        <${classUri}> rdfs:subClassOf ?superClass .
      }
      LIMIT 50
    `;

    const result = await this.executeQuery(endpointKey, query);
    return result.results.map(binding => binding.superClass?.value).filter(Boolean);
  }

  /**
   * Search for entities by label
   * @param {string} endpointKey - Endpoint identifier
   * @param {string} searchTerm - Search term
   * @param {string} entityType - Type of entity to search for (e.g., 'Class', 'Property')
   * @returns {Promise<Array>} Array of matching entities
   */
  async searchEntities(endpointKey, searchTerm, entityType = null) {
    let typeFilter = '';
    if (entityType) {
      typeFilter = `FILTER(?type = <${entityType}>) .`;
    }

    const query = `
      SELECT DISTINCT ?entity ?label ?type WHERE {
        ?entity rdfs:label ?label .
        ?entity a ?type .
        FILTER(CONTAINS(LCASE(?label), LCASE("${searchTerm}")) || 
               CONTAINS(LCASE(?entity), LCASE("${searchTerm}"))) .
        ${typeFilter}
      }
      LIMIT 20
    `;

    const result = await this.executeQuery(endpointKey, query);
    return result.results.map(binding => ({
      uri: binding.entity?.value,
      label: binding.label?.value,
      type: binding.type?.value
    })).filter(item => item.uri && item.label);
  }

  /**
   * Test endpoint connectivity
   * @param {string} endpointKey - Endpoint identifier
   * @returns {Promise<Object>} Connectivity test result
   */
  async testEndpoint(endpointKey) {
    const endpoint = this.endpoints.get(endpointKey);
    if (!endpoint) {
      throw new Error(`Unknown endpoint: ${endpointKey}`);
    }

    try {
      const startTime = Date.now();
      const result = await this.executeQuery(endpointKey, 'SELECT ?s WHERE { ?s ?p ?o } LIMIT 1');
      const responseTime = Date.now() - startTime;

      return {
        endpoint: endpointKey,
        status: 'connected',
        responseTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        endpoint: endpointKey,
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get SPARQL client for an endpoint
   * @private
   */
  async _getClient(endpointKey, endpoint) {
    if (!this.clients.has(endpointKey)) {
      const client = new SparqlHttpClient({
        endpointUrl: endpoint.url,
        defaultGraph: endpoint.defaultGraph
      });
      this.clients.set(endpointKey, client);
    }
    return this.clients.get(endpointKey);
  }

  /**
   * Check rate limiting for an endpoint
   * @private
   */
  async _checkRateLimit(endpointKey, rateLimit) {
    const lastRequest = this.lastRequestTime.get(endpointKey) || 0;
    const timeSinceLastRequest = Date.now() - lastRequest;
    
    if (timeSinceLastRequest < rateLimit) {
      const waitTime = rateLimit - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime.set(endpointKey, Date.now());
  }

  /**
   * Parse SELECT query results
   * @private
   */
  async _parseQueryResult(result) {
    const bindings = [];
    
    for await (const binding of result) {
      const parsedBinding = {};
      for (const [key, value] of binding.entries()) {
        parsedBinding[key] = {
          value: value.value,
          type: value.termType,
          datatype: value.datatype?.value,
          language: value.language
        };
      }
      bindings.push(parsedBinding);
    }

    return {
      head: { vars: result.variables },
      results: { bindings }
    };
  }

  /**
   * Parse CONSTRUCT query results
   * @private
   */
  async _parseConstructResult(result) {
    const triples = [];
    
    for await (const quad of result) {
      triples.push({
        subject: quad.subject.value,
        predicate: quad.predicate.value,
        object: quad.object.value,
        graph: quad.graph?.value || null
      });
    }

    return triples;
  }

  /**
   * Hash a query string for caching
   * @private
   */
  _hashQuery(query) {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Clear query cache
   * @param {string} endpointKey - Optional endpoint to clear specific cache
   */
  clearCache(endpointKey = null) {
    if (endpointKey) {
      // Clear specific endpoint cache
      for (const key of this.queryCache.keys()) {
        if (key.startsWith(endpointKey + ':')) {
          this.queryCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.queryCache.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp < this.CACHE_TTL) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }
    
    return {
      totalEntries: this.queryCache.size,
      validEntries,
      expiredEntries
    };
  }
}

// Export singleton instance
export const sparqlClient = new SPARQLClient();

// Export utility functions
export const executeQuery = (endpointKey, query, options) => 
  sparqlClient.executeQuery(endpointKey, query, options);
export const findEquivalentClasses = (endpointKey, classUri) => 
  sparqlClient.findEquivalentClasses(endpointKey, classUri);
export const searchEntities = (endpointKey, searchTerm, entityType) => 
  sparqlClient.searchEntities(endpointKey, searchTerm, entityType);
export const testEndpoint = (endpointKey) => 
  sparqlClient.testEndpoint(endpointKey);
