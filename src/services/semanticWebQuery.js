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
  const { timeout = 15000, limit = 5 } = options;
  
  const query = `
    SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
      ?item rdfs:label "${entityName}"@en .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    } LIMIT ${limit}
  `;

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
  const { timeout = 15000, limit = 5 } = options;
  
  const query = `
    SELECT DISTINCT ?resource ?comment WHERE {
      ?resource rdfs:label "${entityName}"@en .
      OPTIONAL { ?resource rdfs:comment ?comment . FILTER(LANG(?comment) = "en") }
    } LIMIT ${limit}
  `;

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
        comment: binding.comment
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