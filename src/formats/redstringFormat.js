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
  const {
    graphs,
    nodePrototypes,
    edges,
    openGraphIds,
    activeGraphId,
    activeDefinitionNodeId,
    expandedGraphIds,
    rightPanelTabs,
    savedNodeIds,
    savedGraphIds,
    showConnectionNames
  } = storeState;

  // Convert Maps to objects for serialization
  const graphsObj = {};
  graphs.forEach((graph, id) => {
    // Also serialize the instances Map
    const instancesObj = {};
    if (graph.instances) {
        graph.instances.forEach((instance, instanceId) => {
            instancesObj[instanceId] = instance;
        });
    }
    graphsObj[id] = {
      "@type": "Graph",
      ...graph,
      instances: instancesObj,
      spatial: {
        expanded: expandedGraphIds.has(id),
        active: id === activeGraphId
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
      "rdfs:label": prototype.name,
      "rdfs:comment": prototype.description || `RedString prototype: ${prototype.name}`,
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

  // Process abstraction chains to add subClassOf relationships
  nodePrototypes.forEach((node) => {
    if (node.abstractionChains) {
      for (const dimension in node.abstractionChains) {
        const chain = node.abstractionChains[dimension];
        if (chain && chain.length > 1) {
          for (let i = 1; i < chain.length; i++) {
            const subClassId = chain[i];
            const superClassId = chain[i - 1];
            if (nodesObj[subClassId]) {
              if (!nodesObj[subClassId].subClassOf) {
                nodesObj[subClassId].subClassOf = [];
              }
              // Add as an object to be expanded to a proper link by JSON-LD
              const superClassRef = { "@id": superClassId };
              // Avoid duplicates
              if (!nodesObj[subClassId].subClassOf.some(item => item["@id"] === superClassId)) {
                nodesObj[subClassId].subClassOf.push(superClassRef);
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
    "format": "redstring-v1.0.0",
    "metadata": {
      "created": new Date().toISOString(),
      "modified": new Date().toISOString(),
      "title": (activeGraphId && graphs.get(activeGraphId)?.name) || "Untitled Space",
      "description": (activeGraphId && graphs.get(activeGraphId)?.description) || "",
      "domain": userDomain || null,
      "userURIs": userURIs
    },
    
    "spatialContext": {
      "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
      "canvasSize": { "width": 4000, "height": 3000 }
    },
    
    "graphs": graphsObj,
    "nodePrototypes": nodesObj,
    "edges": edgesObj,
    
    "userInterface": {
      "openGraphIds": [...openGraphIds],
      "activeGraphId": activeGraphId,
      "activeDefinitionNodeId": activeDefinitionNodeId,
      "expandedGraphIds": [...expandedGraphIds],
      "rightPanelTabs": [...rightPanelTabs],
      "savedNodeIds": [...savedNodeIds],
      "savedGraphIds": [...savedGraphIds],
      "showConnectionNames": !!showConnectionNames
    }
  };
};

/**
 * Import .redstring format into Zustand store
 */
export const importFromRedstring = (redstringData, storeActions) => {
  try {
    const {
      graphs: graphsObj = {},
      nodePrototypes: nodesObj = {},
      edges: edgesObj = {},
      userInterface = {}
    } = redstringData;

    //console.log('[DEBUG] Importing edges:', edgesObj);

    // Convert objects back to Maps and import to store
    const graphsMap = new Map();
    Object.entries(graphsObj).forEach(([id, graph]) => {
      try {
        const { spatial, instances: instancesObj, ...graphData } = graph;
        
        // Convert instances object back to a Map
        const instancesMap = new Map();
        if (instancesObj) {
            Object.entries(instancesObj).forEach(([instanceId, instance]) => {
                instancesMap.set(instanceId, instance);
            });
        }

        graphsMap.set(id, {
          ...graphData,
          id, // Ensure ID is preserved
          instances: instancesMap // Use the reconstructed Map
        });
      } catch (error) {
        console.warn(`[importFromRedstring] Error processing graph ${id}:`, error);
        // Create a minimal valid graph to prevent crashes
        const fallbackGraph = {
          id,
          name: graph?.name || 'Unknown Graph',
          description: graph?.description || 'Graph with import error',
          instances: new Map(),
          edgeIds: [],
          definingNodeIds: []
        };
        graphsMap.set(id, fallbackGraph);
      }
    });

    const nodesMap = new Map();
    Object.entries(nodesObj).forEach(([id, node]) => {
      try {
        const { spatial = {}, media = {}, cognitive = {}, ...nodeData } = node;
        nodesMap.set(id, {
          ...nodeData,
          id, // Ensure ID is preserved
          x: spatial.x || 0,
          y: spatial.y || 0,
          scale: spatial.scale || 1.0,
          imageSrc: media.image,
          thumbnailSrc: media.thumbnail,
          imageAspectRatio: media.aspectRatio
        });
        // Note: subClassOf is not explicitly imported back into the store's
        // abstractionChain model, as that is derived dynamically in the UI.
        // The subClassOf relationship is preserved for RDF export fidelity.
      } catch (error) {
        console.warn(`[importFromRedstring] Error processing node ${id}:`, error);
        // Create a minimal valid node to prevent crashes
        const fallbackNode = {
          id,
          name: node?.name || 'Unknown Node',
          description: node?.description || 'Node with import error',
          color: node?.color || '#8B0000',
          x: 0,
          y: 0,
          scale: 1.0
        };
        nodesMap.set(id, fallbackNode);
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

    // Return the converted state for file storage to use
    const storeState = {
      graphs: graphsMap,
      nodePrototypes: nodesMap,
      edges: edgesMap,
      openGraphIds: Array.isArray(userInterface.openGraphIds) ? userInterface.openGraphIds : [],
      activeGraphId: userInterface.activeGraphId || null,
      activeDefinitionNodeId: userInterface.activeDefinitionNodeId || null,
      expandedGraphIds: new Set(Array.isArray(userInterface.expandedGraphIds) ? userInterface.expandedGraphIds : []),
      rightPanelTabs: Array.isArray(userInterface.rightPanelTabs) ? userInterface.rightPanelTabs : [],
      savedNodeIds: new Set(Array.isArray(userInterface.savedNodeIds) ? userInterface.savedNodeIds : []),
      savedGraphIds: new Set(Array.isArray(userInterface.savedGraphIds) ? userInterface.savedGraphIds : []),
      showConnectionNames: !!userInterface.showConnectionNames
    };

    const importedTabs = userInterface.rightPanelTabs;

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