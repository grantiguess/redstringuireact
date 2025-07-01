/**
 * Redstring Native Format Handler
 * Handles import/export of .redstring files with JSON-LD context
 */

import { v4 as uuidv4 } from 'uuid';

// JSON-LD Context for Redstring
export const REDSTRING_CONTEXT = {
  "@version": 1.1,
  "@vocab": "https://redstring.org/vocab/",
  
  // Core Redstring Concepts
  "redstring": "https://redstring.org/vocab/",
  "Graph": "redstring:Graph",
  "Node": "redstring:Node", 
  "Edge": "redstring:Edge",
  "SpatialContext": "redstring:SpatialContext",
  
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
  
  // Spatial & UI State
  "x": "redstring:xCoordinate",
  "y": "redstring:yCoordinate", 
  "scale": "redstring:scale",
  "viewport": "redstring:viewport",
  "expanded": "redstring:expanded",
  "visible": "redstring:visible",
  
  // Cognitive Concepts
  "saved": "redstring:bookmarked",
  "active": "redstring:activeInContext",
  "definitionIndex": "redstring:currentDefinitionIndex",
  "contextKey": "redstring:contextKey",
  
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
 */
export const exportToRedstring = (storeState) => {
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
    savedGraphIds
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

  const nodesObj = {};
  nodePrototypes.forEach((node, id) => {
    nodesObj[id] = {
      "@type": "Node",
      ...node,
      spatial: {
        x: node.x || 0,
        y: node.y || 0,
        scale: node.scale || 1.0
      },
      media: {
        image: node.imageSrc,
        thumbnail: node.thumbnailSrc,
        aspectRatio: node.imageAspectRatio
      },
      cognitive: {
        saved: savedNodeIds.has(id),
        lastViewed: new Date().toISOString()
      }
    };
  });

  const edgesObj = {};
  edges.forEach((edge, id) => {
    // Convert directionality Set to Array for JSON serialization
    const edgeData = { ...edge };
    if (edgeData.directionality && edgeData.directionality.arrowsToward instanceof Set) {
      edgeData.directionality = {
        ...edgeData.directionality,
        arrowsToward: Array.from(edgeData.directionality.arrowsToward)
      };
    }
    
    edgesObj[id] = {
      "@type": "Edge",
      ...edgeData
    };
  });

  return {
    "@context": REDSTRING_CONTEXT,
    "@type": "redstring:CognitiveSpace",
    "format": "redstring-v1.0.0",
    "metadata": {
      "created": new Date().toISOString(),
      "modified": new Date().toISOString(),
      "title": graphs.get(activeGraphId)?.name || "Untitled Space",
      "description": graphs.get(activeGraphId)?.description || ""
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
      "savedGraphIds": [...savedGraphIds]
    }
  };
};

/**
 * Import .redstring format into Zustand store
 */
export const importFromRedstring = (redstringData, storeActions) => {
  const {
    graphs: graphsObj = {},
    nodePrototypes: nodesObj = {},
    edges: edgesObj = {},
    userInterface = {}
  } = redstringData;

  // Convert objects back to Maps and import to store
  const graphsMap = new Map();
  Object.entries(graphsObj).forEach(([id, graph]) => {
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
  });

  const nodesMap = new Map();
  Object.entries(nodesObj).forEach(([id, node]) => {
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
  });

  const edgesMap = new Map();
  Object.entries(edgesObj).forEach(([id, edge]) => {
    const edgeData = {
      ...edge,
      id // Ensure ID is preserved
    };
    
    // Convert directionality.arrowsToward from Array back to Set if it exists
    if (edgeData.directionality && Array.isArray(edgeData.directionality.arrowsToward)) {
      edgeData.directionality.arrowsToward = new Set(edgeData.directionality.arrowsToward);
    } else if (!edgeData.directionality) {
      // Ensure directionality exists for backwards compatibility
      edgeData.directionality = { arrowsToward: new Set() };
    }
    
    edgesMap.set(id, edgeData);
  });

  // Return the converted state for file storage to use
  const storeState = {
    graphs: graphsMap,
    nodePrototypes: nodesMap,
    edges: edgesMap,
    openGraphIds: userInterface.openGraphIds || [],
    activeGraphId: userInterface.activeGraphId,
    activeDefinitionNodeId: userInterface.activeDefinitionNodeId,
    expandedGraphIds: new Set(userInterface.expandedGraphIds || []),
    rightPanelTabs: userInterface.rightPanelTabs || [],
    savedNodeIds: new Set(userInterface.savedNodeIds || []),
    savedGraphIds: new Set(userInterface.savedGraphIds || [])
  };

  const importedTabs = userInterface.rightPanelTabs;

  // If no tabs are loaded or the array is empty, default to the home tab.
  if (!Array.isArray(importedTabs) || importedTabs.length === 0) {
    storeState.rightPanelTabs = [{ type: 'home', isActive: true }];
  } else {
    // Ensure at least one tab is active
    const isAnyTabActive = importedTabs.some(tab => tab.isActive);
    if (!isAnyTabActive && importedTabs.length > 0) {
      // Find the home tab and make it active, or the first tab as a fallback
      const homeTabIndex = importedTabs.findIndex(tab => tab.type === 'home');
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