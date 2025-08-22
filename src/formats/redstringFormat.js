/**
 * Redstring Native Format Handler
 * Handles import/export of .redstring files with JSON-LD context
 */

import { v4 as uuidv4 } from 'uuid';
import uriGenerator from '../services/uriGenerator.js';

// Enhanced JSON-LD Context for Redstring with Full RDF Schema Support
export const REDSTRING_CONTEXT = {
  "@version": 1.1,
  "@vocab": "https://redstring.io/vocab/",
  
  // Core Redstring Concepts - Enhanced with Three-Layer Architecture
  "redstring": "https://redstring.io/vocab/",
  "Graph": "redstring:Graph",
  "Node": "redstring:Node", 
  "Edge": "redstring:Edge",
  "SpatialContext": "redstring:SpatialContext",
  "CognitiveSpace": "redstring:CognitiveSpace",
  
  // Three-Layer Architecture
  "SemanticType": "redstring:SemanticType",
  "Prototype": "redstring:Prototype", 
  "Instance": "redstring:Instance",
  "PrototypeSpace": "redstring:PrototypeSpace",
  "SpatialGraph": "redstring:SpatialGraph",
  "SpatialGraphCollection": "redstring:SpatialGraphCollection",
  
  // Recursive Composition (The Heart of Redstring)
  "defines": "redstring:defines",
  "definedBy": "redstring:definedBy", 
  "expandsTo": "redstring:expandsTo",
  "contractsFrom": "redstring:contractsFrom",
  "contextualDefinition": "redstring:contextualDefinition",
  
  // Standard Vocabularies for Interop
  "name": "http://schema.org/name",
  "description": "http://schema.org/description",
  "color": "http://schema.org/color",
  "image": "http://schema.org/image",
  "thumbnail": "http://schema.org/thumbnail",
  "contains": "http://purl.org/dc/terms/hasPart",
  "partOf": "http://purl.org/dc/terms/isPartOf",
  "composedOf": "http://purl.org/vocab/frbr/core#embodiment",
  "composes": "http://purl.org/vocab/frbr/core#embodimentOf",
  
  // Complete RDF Schema Vocabulary
  "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
  "Class": "rdfs:Class",
  "subClassOf": { "@id": "rdfs:subClassOf", "@type": "@id" },
  "subPropertyOf": { "@id": "rdfs:subPropertyOf", "@type": "@id" },
  "domain": { "@id": "rdfs:domain", "@type": "@id" },
  "range": { "@id": "rdfs:range", "@type": "@id" },
  "label": "rdfs:label",
  "comment": "rdfs:comment",
  "seeAlso": { "@id": "rdfs:seeAlso", "@type": "@id" },
  "isDefinedBy": { "@id": "rdfs:isDefinedBy", "@type": "@id" },
  "Resource": "rdfs:Resource",
  "Literal": "rdfs:Literal",
  "Datatype": "rdfs:Datatype",
  "Container": "rdfs:Container",
  "member": { "@id": "rdfs:member", "@type": "@id" },

  // Complete RDF Core Vocabulary
  "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "type": { "@id": "rdf:type", "@type": "@id" },
  "Property": "rdf:Property",
  "Statement": "rdf:Statement",
  "subject": { "@id": "rdf:subject", "@type": "@id" },
  "predicate": { "@id": "rdf:predicate", "@type": "@id" },
  "object": { "@id": "rdf:object", "@type": "@id" },
  "value": "rdf:value",
  "first": { "@id": "rdf:first", "@type": "@id" },
  "rest": { "@id": "rdf:rest", "@type": "@id" },
  "nil": { "@id": "rdf:nil", "@type": "@id" },

  // Complete OWL Vocabulary for Semantic Web Integration
  "owl": "http://www.w3.org/2002/07/owl#",
  "sameAs": { "@id": "owl:sameAs", "@type": "@id" },
  "equivalentClass": { "@id": "owl:equivalentClass", "@type": "@id" },
  "equivalentProperty": { "@id": "owl:equivalentProperty", "@type": "@id" },
  "differentFrom": { "@id": "owl:differentFrom", "@type": "@id" },
  "disjointWith": { "@id": "owl:disjointWith", "@type": "@id" },
  "inverseOf": { "@id": "owl:inverseOf", "@type": "@id" },
  "functionalProperty": "owl:FunctionalProperty",
  "inverseFunctionalProperty": "owl:InverseFunctionalProperty",
  "transitiveProperty": "owl:TransitiveProperty",
  "symmetricProperty": "owl:SymmetricProperty",
  
  // External Knowledge Bases - Rosetta Stone Mappings
  "wd": "http://www.wikidata.org/entity/",
  "wdt": "http://www.wikidata.org/prop/direct/",
  "dbr": "http://dbpedia.org/resource/",
  "dbo": "http://dbpedia.org/ontology/",
  "schema": "http://schema.org/",
  
  // Academic & Research Integration
  "doi": "https://doi.org/",
  "pubmed": "https://pubmed.ncbi.nlm.nih.gov/",
  "arxiv": "https://arxiv.org/abs/",
  "orcid": "https://orcid.org/",
  "researchgate": "https://www.researchgate.net/publication/",
  "semanticscholar": "https://www.semanticscholar.org/paper/",
  
  // Citation and Bibliography
  "cites": "http://purl.org/spar/cito/cites",
  "citedBy": "http://purl.org/spar/cito/citedBy",
  "isDocumentedBy": "http://purl.org/spar/cito/isDocumentedBy",
  "documents": "http://purl.org/spar/cito/documents",
  
  // Academic Metadata
  "author": "http://schema.org/author",
  "datePublished": "http://schema.org/datePublished",
  "publisher": "http://schema.org/publisher",
  "journal": "http://schema.org/isPartOf",
  "citation": "http://schema.org/citation",
  "abstract": "http://schema.org/abstract",
  "keywords": "http://schema.org/keywords",
  
  // RedString Spatial Properties (Unique Contribution to Semantic Web)
  "spatialContext": "redstring:spatialContext",
  "xCoordinate": "redstring:xCoordinate",
  "yCoordinate": "redstring:yCoordinate", 
  "spatialScale": "redstring:spatialScale",
  "viewport": "redstring:viewport",
  "canvasSize": "redstring:canvasSize",
  
  // RedString Visual Properties
  "visualProperties": "redstring:visualProperties",
  "cognitiveColor": "redstring:cognitiveColor",
  "expanded": "redstring:expanded",
  "visible": "redstring:visible",
  "thumbnailSrc": "redstring:thumbnailSrc",
  "imageSrc": "redstring:imageSrc",
  "imageAspectRatio": "redstring:imageAspectRatio",
  
  // RedString Semantic Properties (Three-Layer Architecture)
  "hasDefinition": { "@id": "redstring:hasDefinition", "@type": "@id" },
  "definitionGraphIds": "redstring:definitionGraphIds",
  "prototypeId": { "@id": "redstring:prototypeId", "@type": "@id" },
  "instanceOf": { "@id": "redstring:instanceOf", "@type": "@id" },
  "containedIn": { "@id": "redstring:containedIn", "@type": "@id" },
  "abstractionChains": "redstring:abstractionChains",
  "abstractionDimensions": "redstring:abstractionDimensions",
  
  // RedString Cognitive Properties
  "cognitiveProperties": "redstring:cognitiveProperties",
  "bookmarked": "redstring:bookmarked",
  "activeInContext": "redstring:activeInContext",
  "currentDefinitionIndex": "redstring:currentDefinitionIndex",
  "contextKey": "redstring:contextKey",
  "personalMeaning": "redstring:personalMeaning",
  "cognitiveAssociations": "redstring:cognitiveAssociations",
  "lastViewed": "redstring:lastViewed",
  
  // RedString Relationship Properties
  "relationshipDirection": "redstring:relationshipDirection",
  "relationshipStrength": "redstring:relationshipStrength",
  "bidirectional": "redstring:bidirectional",
  "arrowsToward": "redstring:arrowsToward",
  "directionality": "redstring:directionality",
  
  // RedString Metadata Properties
  "bio": "redstring:bio",
  "conjugation": "redstring:conjugation",
  "externalLinks": "redstring:externalLinks",
  "citations": "redstring:citations",
  "typeNodeId": { "@id": "redstring:typeNodeId", "@type": "@id" },
  
  // Temporal & Versioning
  "created": "http://purl.org/dc/terms/created",
  "modified": "http://purl.org/dc/terms/modified",
  "version": "http://purl.org/dc/terms/hasVersion",
  
  // Solid Pod Federation
  "pod": "https://www.w3.org/ns/solid/terms#pod",
  "webId": "http://xmlns.com/foaf/0.1/webId",
  "references": "redstring:references",
  "linkedThinking": "redstring:linkedThinking"
};

/**
 * Export current Zustand store state to .redstring format
 * @param {Object} storeState - The current state from the Zustand store
 * @param {string} [userDomain] - User's domain for dynamic URI generation
 * @returns {Object} Redstring data with dynamic URIs
 */
export const exportToRedstring = (storeState, userDomain = null) => {
  try {
    if (!storeState) {
      throw new Error('Store state is required for export');
    }

    const {
      graphs = new Map(),
      nodePrototypes = new Map(),
      edges = new Map(),
      openGraphIds = [],
      activeGraphId = null,
      activeDefinitionNodeId = null,
      expandedGraphIds = new Set(),
      rightPanelTabs = [],
      savedNodeIds = new Set(),
      savedGraphIds = new Set(),
      showConnectionNames = false
    } = storeState;

  // Three-Layer Architecture: Export Spatial Graphs with Instance Collections
  const spatialGraphs = {};
  graphs.forEach((graph, graphId) => {
    // Export instances as positioned individuals with rdf:type relationships
    const spatialInstances = {};
    if (graph.instances) {
      graph.instances.forEach((instance, instanceId) => {
        spatialInstances[instanceId] = {
          // RDF Schema typing - instance is an individual
          "@type": "redstring:Instance",
          "@id": `instance:${instanceId}`,
          
          // RDF Schema: this individual belongs to prototype class
          "rdf:type": { "@id": `prototype:${instance.prototypeId}` },
          "rdfs:label": instance.name || null, // Don't generate fallback labels
          "rdfs:comment": instance.description || null,
          
          // RedString: this instance is contained within specific graph
          "redstring:containedIn": { "@id": `graph:${graphId}` },
          
          // Unique spatial positioning data (RedString's contribution to semantic web)
          "redstring:spatialContext": {
            "redstring:xCoordinate": instance.x,
            "redstring:yCoordinate": instance.y,
            "redstring:spatialScale": instance.scale
          },
          
          // Visual state properties
          "redstring:visualProperties": {
            "redstring:expanded": instance.expanded,
            "redstring:visible": instance.visible
          },
          
          // Preserve original prototype reference for internal use
          "redstring:prototypeId": instance.prototypeId
        };
      });
    }
    
    spatialGraphs[graphId] = {
      "@type": "redstring:SpatialGraph", 
      "@id": `graph:${graphId}`,
      "rdfs:label": graph.name || `Graph ${graphId}`,
      "rdfs:comment": graph.description || "RedString spatial graph",
      
      // Graph-level properties
      "redstring:definingNodeIds": graph.definingNodeIds || [],
      "redstring:edgeIds": graph.edgeIds || [],
      
      // Spatial instances collection
      "redstring:instances": spatialInstances,
      
      // UI state for this graph
      "redstring:visualProperties": {
        "redstring:expanded": expandedGraphIds.has(graphId),
        "redstring:activeInContext": graphId === activeGraphId
      }
    };
  });

  // Three-Layer Architecture: Export Prototypes as Semantic Classes
  const prototypeSpace = {};
  nodePrototypes.forEach((prototype, id) => {
    prototypeSpace[id] = {
      // RDF Schema typing - prototype is a class
      "@type": ["redstring:Prototype", "rdfs:Class", "schema:Thing"],
      "@id": `prototype:${id}`,
      
      // RDF Schema standard properties (W3C compliant)
      "rdfs:label": prototype.name || 'Untitled',
      "rdfs:comment": prototype.description || `RedString prototype: ${prototype.name || 'Untitled'}`,
      "rdfs:seeAlso": prototype.externalLinks || [],
      "rdfs:isDefinedBy": { "@id": "https://redstring.dev" },
      
      // Type hierarchy - automatic rdfs:subClassOf relationships
      "rdfs:subClassOf": prototype.typeNodeId ? 
        { "@id": `type:${prototype.typeNodeId}` } : null,
      
      // Rosetta Stone mechanism - core semantic web linking
      "owl:sameAs": prototype.externalLinks || [],
      "owl:equivalentClass": prototype.equivalentClasses || [],
      
      // RedString spatial properties (unique contribution to semantic web)
      "redstring:spatialContext": {
        "redstring:xCoordinate": prototype.x || 0,
        "redstring:yCoordinate": prototype.y || 0,
        "redstring:spatialScale": prototype.scale || 1.0
      },
      
      // RedString visual properties
      "redstring:visualProperties": {
        "redstring:cognitiveColor": prototype.color,
        "redstring:imageSrc": prototype.imageSrc,
        "redstring:thumbnailSrc": prototype.thumbnailSrc,
        "redstring:imageAspectRatio": prototype.imageAspectRatio
      },
      
      // RedString semantic properties
      "redstring:definitionGraphIds": prototype.definitionGraphIds || [],
      "redstring:bio": prototype.bio,
      "redstring:conjugation": prototype.conjugation,
      "redstring:typeNodeId": prototype.typeNodeId,
      "redstring:citations": prototype.citations || [],
      
      // RedString cognitive properties
      "redstring:cognitiveProperties": {
        "redstring:bookmarked": savedNodeIds.has(id),
        "redstring:lastViewed": new Date().toISOString(),
        "redstring:personalMeaning": prototype.personalMeaning,
        "redstring:cognitiveAssociations": prototype.cognitiveAssociations || []
      },
      
      // Abstraction chains for rdfs:subClassOf generation
      "redstring:abstractionChains": prototype.abstractionChains || {}
    };
  });

  // Process abstraction chains to add additional subClassOf relationships
  nodePrototypes.forEach((node, nodeId) => {
    if (node.abstractionChains) {
      for (const dimension in node.abstractionChains) {
        const chain = node.abstractionChains[dimension];
        if (chain && chain.length > 1) {
          for (let i = 1; i < chain.length; i++) {
            const subClassId = chain[i];
            const superClassId = chain[i - 1];
            if (prototypeSpace[subClassId]) {
              if (!prototypeSpace[subClassId]['rdfs:subClassOf']) {
                prototypeSpace[subClassId]['rdfs:subClassOf'] = [];
              }
              // Add as an object to be expanded to a proper link by JSON-LD
              const superClassRef = { "@id": `prototype:${superClassId}` };
              // Avoid duplicates
              const existingSubClasses = Array.isArray(prototypeSpace[subClassId]['rdfs:subClassOf']) 
                ? prototypeSpace[subClassId]['rdfs:subClassOf'] 
                : [prototypeSpace[subClassId]['rdfs:subClassOf']];
              if (!existingSubClasses.some(item => item?.["@id"] === `prototype:${superClassId}`)) {
                existingSubClasses.push(superClassRef);
                prototypeSpace[subClassId]['rdfs:subClassOf'] = existingSubClasses;
              }
            }
          }
        }
      }
    }
  });

  // Create a map of instanceId -> prototypeId for efficient lookup
  const instanceToPrototypeMap = new Map();
  graphs.forEach(graph => {
    if (graph.instances) {
      graph.instances.forEach(instance => {
        instanceToPrototypeMap.set(instance.id, instance.prototypeId);
      });
    }
  });

  const edgesObj = {};
  edges.forEach((edge, id) => {
    //console.log('[DEBUG] Exporting edge:', id, edge);
    const sourcePrototypeId = instanceToPrototypeMap.get(edge.sourceId);
    const destinationPrototypeId = instanceToPrototypeMap.get(edge.destinationId);
    
    // Get the predicate prototype ID by mapping from definition node ID to its prototype ID
    let predicatePrototypeId = edge.typeNodeId; // fallback to type node ID
    if (edge.definitionNodeIds?.[0]) {
      // Find the definition node and get its prototype ID
      const definitionNodeId = edge.definitionNodeIds[0];
      const definitionNode = nodePrototypes.get(definitionNodeId);
      if (definitionNode) {
        predicatePrototypeId = definitionNode.prototypeId || definitionNode.typeNodeId;
      }
    }

    // console.log('[DEBUG] Edge mapping:', {
    //   sourceId: edge.sourceId,
    //   sourcePrototypeId,
    //   destinationId: edge.destinationId,
    //   destinationPrototypeId,
    //   predicatePrototypeId,
    //   definitionNodeIds: edge.definitionNodeIds
    // });

    // Prepare a JSON-serializable directionality (convert Set -> Array)
    const serializedDirectionality = (() => {
      if (!edge.directionality || typeof edge.directionality !== 'object') {
        return { arrowsToward: [] };
      }
      const maybeSetOrArray = edge.directionality.arrowsToward;
      let arrowsArray;
      if (maybeSetOrArray instanceof Set) {
        arrowsArray = Array.from(maybeSetOrArray);
      } else if (Array.isArray(maybeSetOrArray)) {
        arrowsArray = maybeSetOrArray;
      } else {
        arrowsArray = [];
      }
      return { ...edge.directionality, arrowsToward: arrowsArray };
    })();

    // Store both native Redstring format and RDF format
    edgesObj[id] = {
      // Native Redstring format (for application use)
      "id": edge.id,
      "sourceId": edge.sourceId,
      "destinationId": edge.destinationId,
      "name": edge.name,
      "description": edge.description,
      "typeNodeId": edge.typeNodeId,
      "definitionNodeIds": edge.definitionNodeIds,
      "directionality": serializedDirectionality,
      
      // RDF format (for semantic web integration)
      "rdfStatements": sourcePrototypeId && destinationPrototypeId && predicatePrototypeId ? (() => {
        const statements = [];
        
        // Always add the forward direction
        statements.push({
          "@type": "Statement",
          "subject": { "@id": `node:${sourcePrototypeId}` },
          "predicate": { "@id": `node:${predicatePrototypeId}` },
          "object": { "@id": `node:${destinationPrototypeId}` },
        });
        
        // For non-directional connections, add the reverse direction
        if (edge.directionality && edge.directionality.arrowsToward && 
            (edge.directionality.arrowsToward instanceof Set ? 
             (edge.directionality.arrowsToward.size === 0) : 
             Array.isArray(edge.directionality.arrowsToward) ? 
             (edge.directionality.arrowsToward.length === 0) : true)) {
          statements.push({
            "@type": "Statement", 
            "subject": { "@id": `node:${destinationPrototypeId}` },
            "predicate": { "@id": `node:${predicatePrototypeId}` },
            "object": { "@id": `node:${sourcePrototypeId}` },
          });
        }
        
        return statements;
      })() : null,
      
      // Metadata for both formats
      "sourcePrototypeId": sourcePrototypeId,
      "destinationPrototypeId": destinationPrototypeId,
      "predicatePrototypeId": predicatePrototypeId,
    };
    
    //console.log('[DEBUG] Created dual-format edge:', id, edgesObj[id]);
  });

  // Note: abstractionChains are now stored directly on node prototypes
  // No separate abstraction axes needed

  // Generate dynamic context if user domain is provided
  const context = userDomain ? uriGenerator.generateContext(userDomain) : REDSTRING_CONTEXT;
  
  // Generate user URIs if domain is provided
  const userURIs = userDomain ? uriGenerator.generateUserURIs(userDomain) : null;
  
  return {
    "@context": context,
    "@type": "redstring:CognitiveSpace",
    "format": "redstring-v2.0.0-semantic",
    "metadata": {
      "created": new Date().toISOString(),
      "modified": new Date().toISOString(),
      "title": (activeGraphId && graphs.get(activeGraphId)?.name) || "Untitled Space",
      "description": (activeGraphId && graphs.get(activeGraphId)?.description) || "",
      "domain": userDomain || null,
      "userURIs": userURIs,
      "semanticWebCompliant": true,
      "rdfSchemaVersion": "1.1",
      "owlVersion": "2.0"
    },
    
    // Separated Storage Architecture
    "prototypeSpace": {
      "@type": "redstring:PrototypeSpace",
      "@id": "space:prototypes",
      "rdfs:label": "RedString Prototype Space",
      "rdfs:comment": "Collection of semantic classes with spatial properties",
      "prototypes": prototypeSpace
    },
    
    "spatialGraphs": {
      "@type": "redstring:SpatialGraphCollection", 
      "@id": "space:graphs",
      "rdfs:label": "RedString Spatial Graphs",
      "rdfs:comment": "Collection of positioned instances within spatial graphs",
      "graphs": spatialGraphs
    },
    
    // Relationships as RDF statements/properties
    "relationships": {
      "@type": "redstring:RelationshipCollection",
      "@id": "space:relationships", 
      "rdfs:label": "RedString Relationships",
      "rdfs:comment": "RDF statements representing connections between instances",
      "edges": edgesObj
    },
    
    // Global spatial context
    "globalSpatialContext": {
      "@type": "redstring:SpatialContext",
      "redstring:viewport": { "x": 0, "y": 0, "zoom": 1.0 },
      "redstring:canvasSize": { "width": 4000, "height": 3000 }
    },
    
    // User interface state (preserved for application functionality)
    "userInterface": {
      "@type": "redstring:UserInterfaceState",
      "redstring:openGraphIds": [...openGraphIds],
      "redstring:activeGraphId": activeGraphId,
      "redstring:activeDefinitionNodeId": activeDefinitionNodeId,
      "redstring:expandedGraphIds": [...expandedGraphIds],
      "redstring:rightPanelTabs": [...rightPanelTabs],
      "redstring:savedNodeIds": [...savedNodeIds],
      "redstring:savedGraphIds": [...savedGraphIds],
      "redstring:showConnectionNames": !!showConnectionNames
    },
    
    // Legacy compatibility (for backwards compatibility during transition)
    "legacy": {
      "graphs": spatialGraphs,
      "nodePrototypes": prototypeSpace,
      "edges": edgesObj
    }
  };
  } catch (error) {
    console.error('[exportToRedstring] Error during export:', error);
    throw new Error(`Failed to export to Redstring format: ${error.message}`);
  }
};

/**
 * Import .redstring format into Zustand store
 */
export const importFromRedstring = (redstringData, storeActions) => {
  try {
    // Handle both new separated storage format and legacy format
    let graphsObj = {};
    let nodesObj = {};
    let edgesObj = {};
    let userInterface = {};
    
    if (redstringData.prototypeSpace && redstringData.spatialGraphs) {
      // New separated storage format (v2.0.0-semantic)
      nodesObj = redstringData.prototypeSpace.prototypes || {};
      graphsObj = redstringData.spatialGraphs.graphs || {};
      edgesObj = redstringData.relationships?.edges || {};
      userInterface = redstringData.userInterface || {};
    } else if (redstringData.legacy) {
      // Fallback to legacy section if available
      graphsObj = redstringData.legacy.graphs || {};
      nodesObj = redstringData.legacy.nodePrototypes || {};
      edgesObj = redstringData.legacy.edges || {};
      userInterface = redstringData.userInterface || {};
    } else {
      // Legacy format (v1.0.0)
      graphsObj = redstringData.graphs || {};
      nodesObj = redstringData.nodePrototypes || {};
      edgesObj = redstringData.edges || {};
      userInterface = redstringData.userInterface || {};
    }

    //console.log('[DEBUG] Importing edges:', edgesObj);

    // Convert spatial graphs back to Maps and import to store
    const graphsMap = new Map();
    Object.entries(graphsObj).forEach(([id, graph]) => {
      try {
        // Handle both new semantic format and legacy format
        let instancesObj = {};
        let graphName = '';
        let graphDescription = '';
        let definingNodeIds = [];
        let edgeIds = [];
        
        if (graph['@type'] === 'redstring:SpatialGraph') {
          // New semantic format
          instancesObj = graph['redstring:instances'] || {};
          graphName = graph['rdfs:label'] || `Graph ${id}`;
          graphDescription = graph['rdfs:comment'] || '';
          definingNodeIds = graph['redstring:definingNodeIds'] || [];
          edgeIds = graph['redstring:edgeIds'] || [];
        } else {
          // Legacy format - handle both old nested structure and flat structure
          instancesObj = graph.instances || {};
          graphName = graph.name || `Graph ${id}`;
          graphDescription = graph.description || '';
          definingNodeIds = graph.definingNodeIds || [];
          edgeIds = graph.edgeIds || [];
        }
        
        // Convert instances back to Map with proper format conversion
        const instancesMap = new Map();
        Object.entries(instancesObj).forEach(([instanceId, instance]) => {
          let convertedInstance = {};
          
          if (instance['@type'] === 'redstring:Instance') {
            // Convert from new semantic format
            convertedInstance = {
              id: instanceId,
              prototypeId: instance['redstring:prototypeId'] || instance['rdf:type']?.['@id']?.replace('prototype:', ''),
              name: instance['rdfs:label'] || undefined, // Only preserve explicit names, not generated ones
              description: instance['rdfs:comment'] || undefined,
              x: instance['redstring:spatialContext']?.['redstring:xCoordinate'] || 0,
              y: instance['redstring:spatialContext']?.['redstring:yCoordinate'] || 0,
              scale: instance['redstring:spatialContext']?.['redstring:spatialScale'] || 1.0,
              expanded: instance['redstring:visualProperties']?.['redstring:expanded'] || false,
              visible: instance['redstring:visualProperties']?.['redstring:visible'] !== false
            };
          } else {
            // Legacy format - ensure all required properties exist
            convertedInstance = {
              id: instanceId,
              prototypeId: instance.prototypeId,
              name: instance.name,
              description: instance.description,
              x: instance.x || 0,
              y: instance.y || 0,
              scale: instance.scale || 1.0,
              expanded: instance.expanded || false,
              visible: instance.visible !== false,
              ...instance
            };
          }
          
          instancesMap.set(instanceId, convertedInstance);
        });

        graphsMap.set(id, {
          id,
          name: graphName,
          description: graphDescription,
          instances: instancesMap,
          definingNodeIds: definingNodeIds || [],
          edgeIds: edgeIds || []
        });
      } catch (error) {
        console.warn(`[importFromRedstring] Error processing graph ${id}:`, error);
        // Create a minimal valid graph to prevent crashes
        const fallbackGraph = {
          id,
          name: graph?.name || graph?.['rdfs:label'] || 'Unknown Graph',
          description: graph?.description || graph?.['rdfs:comment'] || 'Graph with import error',
          instances: new Map(),
          edgeIds: [],
          definingNodeIds: []
        };
        graphsMap.set(id, fallbackGraph);
      }
    });

    const nodesMap = new Map();
    Object.entries(nodesObj).forEach(([id, prototype]) => {
      try {
        let convertedPrototype = {};
        
        if (prototype['@type']?.includes('redstring:Prototype')) {
          // Convert from new semantic format
          convertedPrototype = {
            id,
            name: prototype['rdfs:label'] || prototype.name || 'Untitled',
            description: prototype['rdfs:comment']?.replace(/^RedString prototype: /, '') || prototype.description || '',
            
            // Extract from spatial properties
            x: prototype['redstring:spatialContext']?.['redstring:xCoordinate'] || 0,
            y: prototype['redstring:spatialContext']?.['redstring:yCoordinate'] || 0,
            scale: prototype['redstring:spatialContext']?.['redstring:spatialScale'] || 1.0,
            
            // Extract from visual properties
            color: prototype['redstring:visualProperties']?.['redstring:cognitiveColor'],
            imageSrc: prototype['redstring:visualProperties']?.['redstring:imageSrc'],
            thumbnailSrc: prototype['redstring:visualProperties']?.['redstring:thumbnailSrc'],
            imageAspectRatio: prototype['redstring:visualProperties']?.['redstring:imageAspectRatio'],
            
            // Extract semantic properties
            externalLinks: prototype['owl:sameAs'] || [],
            equivalentClasses: prototype['owl:equivalentClass'] || [],
            citations: prototype['redstring:citations'] || [],
            definitionGraphIds: prototype['redstring:definitionGraphIds'] || [],
            bio: prototype['redstring:bio'],
            conjugation: prototype['redstring:conjugation'],
            typeNodeId: prototype['redstring:typeNodeId'] || 
                       prototype['rdfs:subClassOf']?.['@id']?.replace('type:', ''),
            
            // Extract abstraction chains
            abstractionChains: prototype['redstring:abstractionChains'] || {},
            
            // Extract cognitive properties
            personalMeaning: prototype['redstring:cognitiveProperties']?.['redstring:personalMeaning'],
            cognitiveAssociations: prototype['redstring:cognitiveProperties']?.['redstring:cognitiveAssociations'] || []
          };
        } else {
          // Legacy format - handle old structure
          const { spatial = {}, media = {}, cognitive = {}, semantic = {}, ...nodeData } = prototype;
          convertedPrototype = {
            ...nodeData,
            id,
            x: spatial.x || 0,
            y: spatial.y || 0,
            scale: spatial.scale || 1.0,
            imageSrc: media.image,
            thumbnailSrc: media.thumbnail,
            imageAspectRatio: media.aspectRatio,
            externalLinks: semantic.externalLinks || [],
            equivalentClasses: semantic.equivalentClasses || [],
            citations: semantic.citations || []
          };
        }
        
        nodesMap.set(id, convertedPrototype);
        
        // Note: rdfs:subClassOf relationships are preserved in the semantic format
        // but don't need to be imported back into abstractionChains as they are
        // generated dynamically from abstractionChains during export
      } catch (error) {
        console.warn(`[importFromRedstring] Error processing prototype ${id}:`, error);
        // Create a minimal valid prototype to prevent crashes
        const fallbackPrototype = {
          id,
          name: prototype?.['rdfs:label'] || prototype?.name || 'Unknown Prototype',
          description: prototype?.['rdfs:comment'] || prototype?.description || 'Prototype with import error',
          color: prototype?.['redstring:visualProperties']?.['redstring:cognitiveColor'] || 
                 prototype?.color || '#8B0000',
          x: 0,
          y: 0,
          scale: 1.0,
          externalLinks: [],
          equivalentClasses: [],
          definitionGraphIds: [],
          abstractionChains: {}
        };
        nodesMap.set(id, fallbackPrototype);
      }
    });

    const edgesMap = new Map();
    Object.entries(edgesObj).forEach(([id, edge]) => {
      try {
        //console.log('[DEBUG] Processing edge:', id, edge);
        let edgeData;
        
        // Check if this is the new dual-format (has both native and RDF data)
        if (edge.sourceId && edge.destinationId && edge.hasOwnProperty('rdfStatements')) {
          //console.log('[DEBUG] Edge is in dual format');
          // Use the native Redstring format for the application
          edgeData = {
            id: edge.id,
            sourceId: edge.sourceId,
            destinationId: edge.destinationId,
            name: edge.name,
            description: edge.description,
            typeNodeId: edge.typeNodeId,
            definitionNodeIds: edge.definitionNodeIds,
            directionality: edge.directionality,
          };
        }
        // Check if this is an old RDF statement format (legacy)
        else if (edge['@type'] === 'Statement' && edge.subject && edge.object) {
          //console.log('[DEBUG] Edge is in legacy RDF statement format');
          // Reconstruct from RDF statement format
          edgeData = {
            id,
            name: edge.name,
            description: edge.description,
            sourceId: edge.originalSourceId || edge.subject['@id'].replace('node:', ''),
            destinationId: edge.originalDestinationId || edge.object['@id'].replace('node:', ''),
            typeNodeId: edge.predicate?.['@id'].replace('node:', ''),
          };
        }
        // This is the old format - use the edge data directly
        else {
          //console.log('[DEBUG] Edge is in old format');
          edgeData = {
            ...edge,
            id // Ensure ID is preserved
          };
        }
        
        //console.log('[DEBUG] Final edge data:', edgeData);
        
        // Convert directionality.arrowsToward from Array back to Set if it exists
        if (edgeData.directionality && edgeData.directionality.arrowsToward) {
          if (Array.isArray(edgeData.directionality.arrowsToward)) {
            edgeData.directionality.arrowsToward = new Set(edgeData.directionality.arrowsToward);
          } else if (edgeData.directionality.arrowsToward instanceof Set) {
            // Already a Set, no conversion needed
          } else {
            // Invalid format, reset to empty Set
            edgeData.directionality.arrowsToward = new Set();
          }
        } else if (!edgeData.directionality) {
          // Ensure directionality exists for backwards compatibility
          edgeData.directionality = { arrowsToward: new Set() };
        } else if (!edgeData.directionality.arrowsToward) {
          // directionality exists but arrowsToward is missing
          edgeData.directionality.arrowsToward = new Set();
        }
        
        edgesMap.set(id, edgeData);
      } catch (error) {
        console.warn(`[importFromRedstring] Error processing edge ${id}:`, error);
        // Create a minimal valid edge to prevent crashes
        const fallbackEdge = {
          id,
          sourceId: edge?.sourceId || `unknown-${id}`,
          destinationId: edge?.destinationId || `unknown-${id}`,
          name: edge?.name || 'Unknown Edge',
          description: edge?.description || 'Edge with import error',
          typeNodeId: edge?.typeNodeId || null,
          definitionNodeIds: edge?.definitionNodeIds || [],
          directionality: { arrowsToward: new Set() }
        };
        edgesMap.set(id, fallbackEdge);
      }
    });

    //console.log('[DEBUG] Final edges map:', edgesMap);

    // Note: abstractionChains are stored directly on node prototypes

    // Extract UI state from either new format or legacy format
    const uiState = userInterface || {};
    const extractedOpenGraphIds = uiState['redstring:openGraphIds'] || uiState.openGraphIds || [];
    const extractedActiveGraphId = uiState['redstring:activeGraphId'] || uiState.activeGraphId || null;
    const extractedActiveDefinitionNodeId = uiState['redstring:activeDefinitionNodeId'] || uiState.activeDefinitionNodeId || null;
    const extractedExpandedGraphIds = uiState['redstring:expandedGraphIds'] || uiState.expandedGraphIds || [];
    const extractedRightPanelTabs = uiState['redstring:rightPanelTabs'] || uiState.rightPanelTabs || [];
    const extractedSavedNodeIds = uiState['redstring:savedNodeIds'] || uiState.savedNodeIds || [];
    const extractedSavedGraphIds = uiState['redstring:savedGraphIds'] || uiState.savedGraphIds || [];
    const extractedShowConnectionNames = uiState['redstring:showConnectionNames'] || uiState.showConnectionNames || false;

    // Return the converted state for file storage to use
    const storeState = {
      graphs: graphsMap,
      nodePrototypes: nodesMap,
      edges: edgesMap,
      openGraphIds: Array.isArray(extractedOpenGraphIds) ? extractedOpenGraphIds : [],
      activeGraphId: extractedActiveGraphId,
      activeDefinitionNodeId: extractedActiveDefinitionNodeId,
      expandedGraphIds: new Set(Array.isArray(extractedExpandedGraphIds) ? extractedExpandedGraphIds : []),
      rightPanelTabs: Array.isArray(extractedRightPanelTabs) ? extractedRightPanelTabs : [],
      savedNodeIds: new Set(Array.isArray(extractedSavedNodeIds) ? extractedSavedNodeIds : []),
      savedGraphIds: new Set(Array.isArray(extractedSavedGraphIds) ? extractedSavedGraphIds : []),
      showConnectionNames: !!extractedShowConnectionNames
    };

    const importedTabs = extractedRightPanelTabs;

    // If no tabs are loaded or the array is empty, default to the home tab.
    if (!Array.isArray(importedTabs) || importedTabs.length === 0) {
      storeState.rightPanelTabs = [{ type: 'home', isActive: true }];
    } else {
      // Ensure at least one tab is active
      const isAnyTabActive = importedTabs.some(tab => tab && tab.isActive);
      if (!isAnyTabActive && importedTabs.length > 0) {
        // Find the home tab and make it active, or the first tab as a fallback
        const homeTabIndex = importedTabs.findIndex(tab => tab && tab.type === 'home');
        if (homeTabIndex > -1) {
          importedTabs[homeTabIndex].isActive = true;
        } else {
          importedTabs[0].isActive = true;
        }
      }
      storeState.rightPanelTabs = importedTabs;
    }
    
    return {
      storeState,
      errors: [] // For now, no error handling
    };
  } catch (error) {
    console.error('[importFromRedstring] Critical error during import:', error);
    // Return a minimal valid state to prevent complete failure
    return {
      storeState: {
        graphs: new Map(),
        nodePrototypes: new Map(),
        edges: new Map(),
        openGraphIds: [],
        activeGraphId: null,
        activeDefinitionNodeId: null,
        expandedGraphIds: new Set(),
        rightPanelTabs: [{ type: 'home', isActive: true }],
        savedNodeIds: new Set(),
        savedGraphIds: new Set(),
        showConnectionNames: false
      },
      errors: [error.message]
    };
  }
};

/**
 * Generate file download for .redstring format
 */
export const downloadRedstringFile = (storeState, filename = 'cognitive-space.redstring') => {
  const redstringData = exportToRedstring(storeState);
  const jsonString = JSON.stringify(redstringData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Handle file upload and import
 */
export const uploadRedstringFile = (file, storeActions) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const redstringData = JSON.parse(e.target.result);
        importFromRedstring(redstringData, storeActions);
        resolve(redstringData);
      } catch (error) {
        reject(new Error(`Failed to parse Redstring file: ${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}; 