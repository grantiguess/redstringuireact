# Semantic Web & Solid Pod Integration

## Overview

This document describes the implementation of semantic web standards and Solid Pod federation in Redstring, transforming it from a local knowledge graph tool into a node in the global semantic web infrastructure.

## Core Philosophy: Neuroplasticity Through Networks

Redstring's integration with the semantic web mirrors cognitive processes - how thoughts connect, expand, and reorganize across individual and collective minds. The system serves as both storage and a Rosetta Stone for graph data interchange, enabling a new type of communication.

## RDF Export & Semantic Web Integration

### JSON-LD Context Mapping

The system uses a comprehensive JSON-LD context that maps Redstring concepts to standard semantic web vocabularies:

```json
{
  "@context": {
    "@version": 1.1,
    "@vocab": "https://redstring.org/vocab/",
    
    // Core Redstring Concepts
    "redstring": "https://redstring.org/vocab/",
    "Graph": "redstring:Graph",
    "Node": "redstring:Node", 
    "Edge": "redstring:Edge",
    
    // RDFS for class hierarchies
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "subClassOf": "rdfs:subClassOf",
    
    // RDF for statements
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "Statement": "rdf:Statement",
    "subject": { "@id": "rdf:subject", "@type": "@id" },
    "predicate": { "@id": "rdf:predicate", "@type": "@id" },
    "object": { "@id": "rdf:object", "@type": "@id" },
    
    // Standard vocabularies for interop
    "name": "http://schema.org/name",
    "description": "http://schema.org/description",
    "color": "http://schema.org/color"
  }
}
```

### Abstraction Chains → RDFS SubClassOf

Redstring's abstraction carousels are mapped to standard RDFS class hierarchies:

```javascript
// Process abstraction chains to add subClassOf relationships
nodePrototypes.forEach((node) => {
  if (node.abstractionChains) {
    for (const dimension in node.abstractionChains) {
      const chain = node.abstractionChains[dimension];
      if (chain && chain.length > 1) {
        for (let i = 1; i < chain.length; i++) {
          const subClassId = chain[i];
          const superClassId = chain[i - 1];
          // Creates: subClassId rdfs:subClassOf superClassId
        }
      }
    }
  }
});
```

### Connections → RDF Statements

Redstring connections are transformed into formal RDF statements:

```javascript
// Convert edges to RDF statements
edges.forEach((edge, id) => {
  const sourcePrototypeId = instanceToPrototypeMap.get(edge.sourceId);
  const destinationPrototypeId = instanceToPrototypeMap.get(edge.destinationId);
  const predicatePrototypeId = edge.definitionNodeIds?.[0] || edge.typeNodeId;

  edgesObj[id] = {
    "@type": "Statement",
    "subject": { "@id": `node:${sourcePrototypeId}` },
    "predicate": { "@id": `node:${predicatePrototypeId}` },
    "object": { "@id": `node:${destinationPrototypeId}` }
  };
});
```

### RDF/Turtle Export

The system exports cognitive spaces in standard Turtle format:

```javascript
export const exportToRdfTurtle = async (storeState) => {
  // 1. Get data in native JSON-LD format
  const redstringData = exportToRedstring(storeState);
  
  // 2. Convert to canonical RDF dataset
  const nquads = await jsonld.toRDF(redstringData, { format: 'application/n-quads' });
  
  // 3. Parse and serialize to Turtle
  const store = $rdf.graph();
  return new Promise((resolve, reject) => {
    $rdf.parse(nquads, store, baseURI, mimeType, (error, kb) => {
      $rdf.serialize(kb, (err, result) => resolve(result));
    });
  });
};
```

## Solid Pod Federation

### Architecture Overview

Solid Pod integration enables decentralized storage and sharing of cognitive spaces:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redstring     │    │   Solid Pod     │    │   Other Apps    │
│   Application   │◄──►│   (Personal)    │◄──►│   (Federated)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   Local Storage          WebID + RDF              Semantic Web
   (Zustand)              (Linked Data)            (Global Graph)
```

### Authentication Flow

1. **Login Initiation**: User clicks "Login to Solid Pod" in Federation tab
2. **OIDC Redirect**: Application redirects to Solid Identity Provider
3. **User Authentication**: User authenticates with their Pod provider
4. **Callback Handling**: Application handles redirect and establishes session
5. **Session Management**: Authenticated session enables Pod operations

```javascript
// Start login process
async startLogin(oidcIssuer, clientName = 'Redstring') {
  await login({
    oidcIssuer,
    redirectUrl: new URL('/callback', window.location.href).toString(),
    clientName,
    handleIncomingRedirect: false
  });
}

// Handle redirect completion
async handleRedirect() {
  await handleIncomingRedirect({
    restorePreviousSession: true
  });
  this.notifySessionChange();
}
```

### Pod Data Structure

Cognitive spaces are stored in a structured hierarchy within the user's Pod:

```
https://user.pod.com/
├── redstring/
│   ├── spaces.ttl                    # Index of all cognitive spaces
│   ├── my_research.redstring         # Individual cognitive space
│   ├── project_ideas.redstring       # Another cognitive space
│   └── ...
```

### Spaces Index (RDF/Turtle)

The system maintains an RDF index of all cognitive spaces:

```turtle
@prefix schema: <http://schema.org/> .
@prefix redstring: <https://redstring.org/vocab/> .
@prefix dc: <http://purl.org/dc/terms/> .

<#my_research> a redstring:CognitiveSpace ;
    schema:name "My Research" ;
    schema:title "Climate Change Economics" ;
    schema:description "Exploring the intersection of climate policy and economic systems" ;
    redstring:spaceLocation "https://user.pod.com/redstring/my_research.redstring" ;
    dc:modified "2024-01-01T12:00:00Z" .
```

### CRUD Operations

#### Save Cognitive Space
```javascript
async saveCognitiveSpace(storeState, spaceName) {
  // 1. Ensure container exists
  await this.ensureRedstringContainer();
  
  // 2. Export to Redstring format
  const redstringData = exportToRedstring(storeState);
  
  // 3. Save to Pod
  const spaceUrl = this.getPodResourceUrl(`redstring/${spaceName}.redstring`);
  await overwriteFile(spaceUrl, jsonBlob, { fetch: authenticatedFetch });
  
  // 4. Update index
  await this.updateSpacesIndex(spaceName, spaceUrl, redstringData.metadata);
}
```

#### Load Cognitive Space
```javascript
async loadCognitiveSpace(spaceUrl) {
  const fetch = this.getAuthenticatedFetch();
  const file = await getFile(spaceUrl, { fetch });
  const jsonText = await file.text();
  const redstringData = JSON.parse(jsonText);
  
  // Import into store
  const { storeState } = importFromRedstring(redstringData, storeActions);
  storeActions.loadUniverseFromFile(storeState);
}
```

#### List Cognitive Spaces
```javascript
async listCognitiveSpaces() {
  const indexUrl = this.getPodResourceUrl('redstring/spaces.ttl');
  const dataset = await getSolidDataset(indexUrl, { fetch: authenticatedFetch });
  
  const spaceThings = getThingAll(dataset);
  return spaceThings.map(thing => ({
    name: getStringNoLocale(thing, 'http://schema.org/name'),
    title: getStringNoLocale(thing, 'http://schema.org/title'),
    description: getStringNoLocale(thing, 'http://schema.org/description'),
    spaceUrl: getUrl(thing, 'https://redstring.org/vocab/spaceLocation'),
    modified: getStringNoLocale(thing, 'http://purl.org/dc/terms/modified')
  }));
}
```

## User Interface Integration

### Federation Tab

A new "Federation" tab in the left panel provides:

1. **Login Interface**: Connect to Solid Pod with configurable identity provider
2. **User Status**: Display current WebID and connection status
3. **Space Management**: Save current cognitive space to Pod
4. **Space Browser**: List, load, and delete cognitive spaces from Pod
5. **Error Handling**: Comprehensive error display and recovery

### RDF Export Menu

Added "Export as RDF/Turtle" option to the main menu:

1. **Format Conversion**: Transforms current state to RDF/Turtle
2. **File Download**: Generates downloadable .ttl file
3. **Semantic Compliance**: Ensures W3C standards compliance

## Technical Implementation

### Dependencies

```json
{
  "@inrupt/solid-client": "^2.0.0",
  "@inrupt/solid-client-authn-browser": "^2.0.0",
  "jsonld": "^8.0.0",
  "rdflib": "^2.0.0"
}
```

### Service Architecture

```
src/
├── services/
│   ├── solidAuth.js      # Authentication & session management
│   └── solidData.js      # Pod CRUD operations
├── formats/
│   ├── redstringFormat.js # Native format with RDF mapping
│   └── rdfExport.js      # RDF/Turtle export
└── Federation.jsx        # UI component
```

### Error Handling

Comprehensive error handling for network issues, authentication failures, and data corruption:

```javascript
try {
  await solidData.saveCognitiveSpace(currentState, spaceName);
} catch (err) {
  console.error('[Federation] Failed to save cognitive space:', err);
  setError(`Failed to save space: ${err.message}`);
}
```

## Future Enhancements

### Planned Features

1. **Cross-Pod References**: Link nodes across different Pods
2. **Access Control**: Granular permissions for shared spaces
3. **Real-time Sync**: WebSocket notifications for collaborative editing
4. **Vocabulary Alignment**: Automatic mapping to standard ontologies
5. **Query Interface**: SPARQL endpoint for semantic queries

### Federation Protocols

1. **ActivityPub Integration**: Social features for cognitive spaces
2. **WebSub Notifications**: Real-time updates across Pods
3. **Verifiable Credentials**: Trust and provenance tracking
4. **Interoperability**: Import/export from other graph tools