/**
 * Semantic Web Query Service
 * 
 * Direct SPARQL queries and Wikipedia API integration 
 * for immediate semantic web data access
 */

/**
 * Query Wikidata directly using fetch
 * @param {string} entityName - Entity name to search for
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Wikidata results
 */
export async function queryWikidata(entityName, options = {}) {
  const { timeout = 15000, limit = 10, searchType = 'fuzzy' } = options;
  
  let query;
  if (searchType === 'exact') {
    // Exact label match
    query = `
      SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
        ?item rdfs:label "${entityName}"@en .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      } LIMIT ${limit}
    `;
  } else {
    // Fuzzy search with broader matching
    query = `
      SELECT DISTINCT ?item ?itemLabel ?itemDescription ?itemAltLabel WHERE {
        {
          ?item rdfs:label "${entityName}"@en .
        } UNION {
          ?item skos:altLabel "${entityName}"@en .
        } UNION {
          ?item rdfs:label ?itemAltLabel .
          FILTER(CONTAINS(LCASE(?itemAltLabel), LCASE("${entityName}")))
        }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      } LIMIT ${limit}
    `;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST', 
      headers: {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RedString-SemanticWeb/1.0'
      },
      body: `query=${encodeURIComponent(query)}`,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Wikidata HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.results && data.results.bindings) {
      return data.results.bindings.map(binding => ({
        item: binding.item,
        itemLabel: binding.itemLabel,
        itemDescription: binding.itemDescription
      }));
    }
    
    return [];

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[SemanticWebQuery] Wikidata query failed:', error);
    return [];
  }
}

/**
 * Query DBpedia directly using fetch
 * @param {string} entityName - Entity name to search for
 * @param {Object} options - Query options
 * @returns {Promise<Array>} DBpedia results
 */
export async function queryDBpedia(entityName, options = {}) {
  const { timeout = 15000, limit = 10, searchType = 'fuzzy', includeProperties = true } = options;
  
  let query;
  if (searchType === 'exact') {
    // Exact label match with properties
    query = `
      SELECT DISTINCT ?resource ?comment ?label ?genre ?developer ?publisher ?platform ?series ?character ?gameplay ?engine WHERE {
        ?resource rdfs:label "${entityName}"@en .
        BIND("${entityName}" AS ?label)
        OPTIONAL { ?resource rdfs:comment ?comment . FILTER(LANG(?comment) = "en") }
        ${includeProperties ? `
        OPTIONAL { ?resource dbo:genre ?genre }
        OPTIONAL { ?resource dbo:developer ?developer }
        OPTIONAL { ?resource dbo:publisher ?publisher }
        OPTIONAL { ?resource dbo:platform ?platform }
        OPTIONAL { ?resource dbo:series ?series }
        OPTIONAL { ?resource dbo:character ?character }
        OPTIONAL { ?resource dbo:gameplay ?gameplay }
        OPTIONAL { ?resource dbo:engine ?engine }
        ` : ''}
      } LIMIT ${limit}
    `;
  } else {
    // Fuzzy search with broader matching and properties
    query = `
      SELECT DISTINCT ?resource ?comment ?label ?genre ?developer ?publisher ?platform ?series ?character ?gameplay ?engine WHERE {
        {
          ?resource rdfs:label "${entityName}"@en .
          BIND("${entityName}" AS ?label)
        } UNION {
          ?resource rdfs:label ?label .
          FILTER(CONTAINS(LCASE(?label), LCASE("${entityName}")))
        }
        OPTIONAL { ?resource rdfs:comment ?comment . FILTER(LANG(?comment) = "en") }
        ${includeProperties ? `
        OPTIONAL { ?resource dbo:genre ?genre }
        OPTIONAL { ?resource dbo:developer ?developer }
        OPTIONAL { ?resource dbo:publisher ?publisher }
        OPTIONAL { ?resource dbo:platform ?platform }
        OPTIONAL { ?resource dbo:series ?series }
        OPTIONAL { ?resource dbo:character ?character }
        OPTIONAL { ?resource dbo:gameplay ?gameplay }
        OPTIONAL { ?resource dbo:engine ?engine }
        ` : ''}
      } LIMIT ${limit}
    `;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch('https://dbpedia.org/sparql', {
      method: 'POST',
      headers: {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RedString-SemanticWeb/1.0'
      },
      body: `query=${encodeURIComponent(query)}`,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`DBpedia HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.results && data.results.bindings) {
      return data.results.bindings.map(binding => ({
        resource: binding.resource,
        comment: binding.comment,
        label: binding.label,
        genre: binding.genre,
        developer: binding.developer,
        publisher: binding.publisher,
        platform: binding.platform,
        series: binding.series,
        character: binding.character,
        gameplay: binding.gameplay,
        engine: binding.engine
      }));
    }
    
    return [];

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[SemanticWebQuery] DBpedia query failed:', error);
    return [];
  }
}

/**
 * Query Wikipedia API for basic entity info
 * @param {string} entityName - Entity name to search for
 * @param {Object} options - Query options
 * @returns {Promise<Object|null>} Wikipedia result
 */
export async function queryWikipedia(entityName, options = {}) {
  const { timeout = 10000 } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // First try direct page summary
    const summaryResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(entityName)}`,
      { signal: controller.signal }
    );

    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json();
      clearTimeout(timeoutId);
      
      return {
        title: summaryData.title,
        description: summaryData.extract,
        url: summaryData.content_urls?.desktop?.page,
        thumbnail: summaryData.thumbnail?.source,
        source: 'wikipedia'
      };
    }

    // Fallback to search API
    const searchResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/search?q=${encodeURIComponent(entityName)}&limit=1`,
      { signal: controller.signal }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData.pages && searchData.pages.length > 0) {
        const page = searchData.pages[0];
        clearTimeout(timeoutId);
        
        return {
          title: page.title,
          description: page.excerpt,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          thumbnail: page.thumbnail?.source,
          source: 'wikipedia'
        };
      }
    }

    clearTimeout(timeoutId);
    return null;

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[SemanticWebQuery] Wikipedia query failed:', error);
    return null;
  }
}

/**
 * Comprehensive semantic web enrichment
 * @param {string} entityName - Entity name to enrich
 * @param {Object} options - Enrichment options
 * @returns {Promise<Object>} Enrichment results
 */
export async function enrichFromSemanticWeb(entityName, options = {}) {
  const results = {
    entityName,
    sources: {},
    suggestions: {
      externalLinks: [],
      description: null,
      equivalentClasses: [],
      confidence: 0
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Query all sources in parallel
    const [wikidataResults, dbpediaResults, wikipediaResult] = await Promise.allSettled([
      queryWikidata(entityName, options),
      queryDBpedia(entityName, options), 
      queryWikipedia(entityName, options)
    ]);

    // Process Wikidata results
    if (wikidataResults.status === 'fulfilled' && wikidataResults.value.length > 0) {
      const wdResult = wikidataResults.value[0];
      results.sources.wikidata = {
        found: true,
        results: wikidataResults.value
      };
      
      if (wdResult.item?.value) {
        results.suggestions.externalLinks.push(wdResult.item.value);
      }
      if (wdResult.itemDescription?.value) {
        results.suggestions.description = wdResult.itemDescription.value;
        results.suggestions.confidence = Math.max(results.suggestions.confidence, 0.9);
      }
    } else {
      results.sources.wikidata = {
        found: false,
        error: wikidataResults.reason?.message
      };
    }

    // Process DBpedia results
    if (dbpediaResults.status === 'fulfilled' && dbpediaResults.value.length > 0) {
      const dbResult = dbpediaResults.value[0];
      results.sources.dbpedia = {
        found: true,
        results: dbpediaResults.value
      };
      
      if (dbResult.resource?.value) {
        results.suggestions.externalLinks.push(dbResult.resource.value);
      }
      if (dbResult.comment?.value && !results.suggestions.description) {
        results.suggestions.description = dbResult.comment.value;
        results.suggestions.confidence = Math.max(results.suggestions.confidence, 0.8);
      }
    } else {
      results.sources.dbpedia = {
        found: false,
        error: dbpediaResults.reason?.message
      };
    }

    // Process Wikipedia results
    if (wikipediaResult.status === 'fulfilled' && wikipediaResult.value) {
      const wpResult = wikipediaResult.value;
      results.sources.wikipedia = {
        found: true,
        result: wpResult
      };
      
      if (wpResult.url) {
        results.suggestions.externalLinks.push(wpResult.url);
      }
      if (wpResult.description && !results.suggestions.description) {
        results.suggestions.description = wpResult.description;
        results.suggestions.confidence = Math.max(results.suggestions.confidence, 0.7);
      }
    } else {
      results.sources.wikipedia = {
        found: false,
        error: wikipediaResult.reason?.message
      };
    }

    // Remove duplicates from external links
    results.suggestions.externalLinks = [...new Set(results.suggestions.externalLinks)];

    console.log(`[SemanticWebQuery] Enriched "${entityName}" with ${results.suggestions.externalLinks.length} links, confidence: ${results.suggestions.confidence}`);
    
    return results;

  } catch (error) {
    console.error('[SemanticWebQuery] Enrichment failed:', error);
    return {
      entityName,
      sources: {},
      suggestions: { externalLinks: [], description: null, equivalentClasses: [], confidence: 0 },
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Find semantically related concepts using broader search strategies
 * @param {string} entityName - Entity name to search for
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Related concepts
 */
export async function findRelatedConcepts(entityName, options = {}) {
  const { timeout = 15000, limit = 15, includeCategories = true } = options;
  
  try {
    // 1. Direct entity search
    const directResults = await Promise.allSettled([
      queryWikidata(entityName, { ...options, searchType: 'fuzzy' }),
      queryDBpedia(entityName, { ...options, searchType: 'fuzzy' })
    ]);
    
    const results = [];
    
    // Process Wikidata results
    if (directResults[0].status === 'fulfilled') {
      results.push(...directResults[0].value.map(item => ({
        ...item,
        source: 'wikidata',
        type: 'direct'
      })));
    }
    
    // Process DBpedia results
    if (directResults[1].status === 'fulfilled') {
      results.push(...directResults[1].value.map(item => ({
        ...item,
        source: 'dbpedia',
        type: 'direct'
      })));
    }
    
    // 2. Category-based search for broader concepts
    if (includeCategories) {
      const categoryResults = await findCategoryConcepts(entityName, { timeout, limit: 10 });
      results.push(...categoryResults.map(item => ({
        ...item,
        source: 'category',
        type: 'related'
      })));
    }
    
    // 3. DBpedia property-based search for semantic relationships
    try {
      const propertyResults = await findRelatedThroughDBpediaProperties(entityName, { 
        timeout, 
        limit: 15,
        propertyTypes: ['genre', 'developer', 'publisher', 'platform', 'series', 'character']
      });
      
      results.push(...propertyResults.map(item => ({
        ...item,
        source: 'dbpedia_properties',
        type: 'property_related',
        connectionInfo: {
          type: item.connectionType,
          value: item.connectionValue
        }
      })));
    } catch (error) {
      console.warn('[SemanticWebQuery] Property-based search failed:', error);
    }
    
    // 3. Remove duplicates and limit results
    const uniqueResults = results.filter((item, index, self) => 
      index === self.findIndex(t => 
        (t.itemLabel?.value || t.label?.value) === (item.itemLabel?.value || item.label?.value)
      )
    );
    
    return uniqueResults.slice(0, limit);
    
  } catch (error) {
    console.warn('[SemanticWebQuery] Related concepts search failed:', error);
    return [];
  }
}

/**
 * Find concepts in related categories
 * @param {string} entityName - Entity name to search for
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Category concepts
 */
async function findCategoryConcepts(entityName, options = {}) {
  const { timeout = 15000, limit = 10 } = options;
  
  // Define common categories that might be related
  const relatedCategories = {
    'game': ['video game', 'game', 'gaming', 'playstation', 'xbox', 'nintendo', 'pc game'],
    'technology': ['technology', 'software', 'hardware', 'digital', 'electronic', 'computer'],
    'media': ['media', 'entertainment', 'video', 'audio', 'film', 'television'],
    'company': ['company', 'corporation', 'business', 'developer', 'publisher', 'studio'],
    'platform': ['platform', 'console', 'system', 'device', 'hardware']
  };
  
  const results = [];
  
  // Find which categories the entity might belong to
  const entityLower = entityName.toLowerCase();
  const relevantCategories = [];
  
  for (const [category, keywords] of Object.entries(relatedCategories)) {
    if (keywords.some(keyword => entityLower.includes(keyword))) {
      relevantCategories.push(category);
    }
  }
  
  // If no specific category found, try general search
  if (relevantCategories.length === 0) {
    relevantCategories.push('general');
  }
  
  // Search for concepts in relevant categories
  for (const category of relevantCategories.slice(0, 3)) {
    try {
      const categoryQuery = `
        SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
          ?item wdt:P31 ?type .
          ?type rdfs:label ?typeLabel .
          FILTER(CONTAINS(LCASE(?typeLabel), "${category}"))
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
        } LIMIT 5
      `;
      
      const response = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: {
          'Accept': 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RedString-SemanticWeb/1.0'
        },
        body: `query=${encodeURIComponent(categoryQuery)}`,
        signal: AbortSignal.timeout(timeout)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.results?.bindings) {
          results.push(...data.results.bindings);
        }
      }
    } catch (error) {
      console.warn(`[SemanticWebQuery] Category search failed for ${category}:`, error);
    }
  }
  
  return results.slice(0, limit);
}

/**
 * Find related entities through DBpedia properties
 * @param {string} entityName - Entity name to search for
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Related entities through properties
 */
export async function findRelatedThroughDBpediaProperties(entityName, options = {}) {
  const { timeout = 15000, limit = 20 } = options;
  
  try {
    // Get all available properties for the entity
    const allProperties = await discoverDBpediaProperties(entityName, { 
      limit: 100, 
      specificProperties: false 
    });
    
    if (!allProperties || allProperties.length === 0) {
      return [];
    }
    
    const results = [];
    
    console.log(`[SemanticWebQuery] Processing ${allProperties.length} properties for ${entityName}`);
    
    // Look for wikiPageWikiLink properties that create entity relationships
    for (const prop of allProperties) {
      if (!prop.value) {
        console.log(`[SemanticWebQuery] Skipping property without value:`, prop);
        continue;
      }
      
      const valueUri = prop.value;
      const propertyUri = prop.property;
      
      console.log(`[SemanticWebQuery] Checking property: ${propertyUri} -> ${valueUri}`);
      
      // Focus on wikiPageWikiLink properties that create entity relationships
      if (propertyUri === 'http://dbpedia.org/ontology/wikiPageWikiLink' && 
          valueUri.includes('dbpedia.org/resource/')) {
        
        console.log(`[SemanticWebQuery] Found wikiPageWikiLink property: ${prop.valueLabel} -> ${valueUri}`);
        
        // Find other entities that also link to this same entity
        const relatedQuery = `
          SELECT DISTINCT ?resource ?resourceLabel ?comment WHERE {
            ?resource <http://dbpedia.org/ontology/wikiPageWikiLink> <${valueUri}> .
            ?resource rdfs:label ?resourceLabel . FILTER(LANG(?resourceLabel) = "en")
            OPTIONAL { ?resource rdfs:comment ?comment . FILTER(LANG(?comment) = "en") }
            FILTER(?resource != <http://dbpedia.org/resource/${entityName.replace(/\s+/g, '_')}>)
          } LIMIT 5
        `;
        
        console.log(`[SemanticWebQuery] Executing query for ${prop.valueLabel}:`, relatedQuery);
        
        try {
          const response = await fetch('https://dbpedia.org/sparql', {
            method: 'POST',
            headers: {
              'Accept': 'application/sparql-results+json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'RedString-SemanticWeb/1.0'
            },
            body: `query=${encodeURIComponent(relatedQuery)}`,
            signal: AbortSignal.timeout(timeout)
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.results?.bindings) {
              results.push(...data.results.bindings.map(item => ({
                ...item,
                connectionType: 'related_via',
                connectionValue: prop.valueLabel || prop.value?.split('/').pop() || 'Unknown',
                originalEntity: prop.valueLabel || prop.value?.split('/').pop() || 'Unknown'
              })));
            }
          }
        } catch (error) {
          console.warn(`[SemanticWebQuery] Related entity search failed for ${valueUri}:`, error);
        }
      }
    }
    
    // Remove duplicates and limit results
    const uniqueResults = results.filter((item, index, self) => 
      index === self.findIndex(t => t.resource?.value === item.resource?.value)
    );
    
    return uniqueResults.slice(0, limit);
    
  } catch (error) {
    console.warn('[SemanticWebQuery] DBpedia property-based search failed:', error);
    return [];
  }
}

/**
 * Discover available properties for an entity
 * @param {string} entityName - Entity name to search for
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Available properties and their values
 */
export async function discoverDBpediaProperties(entityName, options = {}) {
  const { timeout = 15000, limit = 50, specificProperties = false } = options;
  
  try {
    let query;
    if (specificProperties) {
      // Look for specific properties we're interested in
      query = `
        SELECT DISTINCT ?property ?propertyLabel ?value ?valueLabel WHERE {
          ?resource rdfs:label "${entityName}"@en .
          ?resource ?property ?value .
          OPTIONAL { ?property rdfs:label ?propertyLabel . FILTER(LANG(?propertyLabel) = "en") }
          OPTIONAL { ?value rdfs:label ?valueLabel . FILTER(LANG(?valueLabel) = "en") }
          FILTER(?property IN (dbo:genre, dbo:developer, dbo:publisher, dbo:platform, dbo:series, dbo:character, dbo:gameplay, dbo:engine, dbo:releaseDate, dbo:type, dbo:abstract, dbo:thumbnail))
        } LIMIT ${limit}
      `;
    } else {
      // Look for ALL properties to see what's actually available
      query = `
        SELECT DISTINCT ?property ?propertyLabel ?value ?valueLabel WHERE {
          ?resource rdfs:label "${entityName}"@en .
          ?resource ?property ?value .
          OPTIONAL { ?property rdfs:label ?propertyLabel . FILTER(LANG(?propertyLabel) = "en") }
          OPTIONAL { ?value rdfs:label ?valueLabel . FILTER(LANG(?valueLabel) = "en") }
          FILTER(STRSTARTS(STR(?property), "http://dbpedia.org/ontology/"))
        } LIMIT ${limit}
      `;
    }
    
    const response = await fetch('https://dbpedia.org/sparql', {
      method: 'POST',
      headers: {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RedString-SemanticWeb/1.0'
      },
      body: `query=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(timeout)
    });
    
    if (!response.ok) {
      throw new Error(`DBpedia HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.results && data.results.bindings) {
      return data.results.bindings.map(binding => ({
        property: binding.property?.value,
        propertyLabel: binding.propertyLabel?.value,
        value: binding.value?.value,
        valueLabel: binding.valueLabel?.value
      }));
    }
    
    return [];
    
  } catch (error) {
    console.warn('[SemanticWebQuery] Property discovery failed:', error);
    return [];
  }
}