# Semantic Web Integration in Redstring

## Overview

Redstring integrates with the Semantic Web (RDF/OWL) through a **dual-format approach** that maintains full application functionality while enabling semantic web interoperability. This allows Redstring cognitive spaces to be both human-readable knowledge graphs and machine-processable semantic data.

## Core Principles

### 1. Dual-Format Storage
Redstring stores data in **two complementary formats**:

- **Native Redstring Format**: Optimized for application functionality, user experience, and performance
- **RDF Format**: Standard semantic web format for interoperability, reasoning, and AI processing

### 2. Semantic Web Standards
- **RDF (Resource Description Framework)**: Triple-based data model (subject-predicate-object)
- **OWL (Web Ontology Language)**: Ontology language for defining relationships and constraints
- **JSON-LD**: JSON-based serialization of RDF for web applications
- **N-Quads**: RDF serialization format for datasets with named graphs

## Data Model Mapping

### Nodes (Concepts)
```
Redstring Node → RDF Resource
├── Instance ID → Blank Node (temporary identifier)
├── Prototype ID → Named Resource (semantic concept)
├── Name → rdfs:label
├── Description → rdfs:comment
└── Type → rdf:type
```

### Edges (Relationships)
```
Redstring Edge → RDF Statement
├── Source → Subject (semantic concept)
├── Predicate → Relationship type (semantic predicate)
├── Destination → Object (semantic concept)
└── Directionality → Bidirectional vs Unidirectional
```

### Abstraction Chains
```
Redstring Abstraction → OWL Class Hierarchy
├── Specific → SubClass
├── General → SuperClass
└── Chain → rdfs:subClassOf relationships
```

## RDF Export Process

### 1. Data Extraction
```javascript
// Extract from Zustand store
const { graphs, nodePrototypes, edges } = storeState;
```

### 2. Prototype Mapping
```javascript
// Map instance IDs to prototype IDs for semantic concepts
const instanceToPrototypeMap = new Map();
graphs.forEach(graph => {
  graph.instances.forEach(instance => {
    instanceToPrototypeMap.set(instance.id, instance.prototypeId);
  });
});
```

### 3. Edge Conversion
```javascript
// Convert edges to RDF statements
edges.forEach((edge, id) => {
  const sourcePrototypeId = instanceToPrototypeMap.get(edge.sourceId);
  const destinationPrototypeId = instanceToPrototypeMap.get(edge.destinationId);
  const predicatePrototypeId = getPredicatePrototypeId(edge);
  
  // Create RDF statement(s)
  const statements = [{
    "@type": "Statement",
    "subject": { "@id": `node:${sourcePrototypeId}` },
    "predicate": { "@id": `node:${predicatePrototypeId}` },
    "object": { "@id": `node:${destinationPrototypeId}` }
  }];
  
  // Add reverse statement for non-directional connections
  if (isNonDirectional(edge)) {
    statements.push({
      "@type": "Statement",
      "subject": { "@id": `node:${destinationPrototypeId}` },
      "predicate": { "@id": `node:${predicatePrototypeId}` },
      "object": { "@id": `node:${sourcePrototypeId}` }
    });
  }
});
```

### 4. JSON-LD to N-Quads Conversion
```javascript
// Convert to canonical RDF format
const nquads = await jsonld.toRDF(redstringData, { 
  format: 'application/n-quads' 
});
```

## Directionality in RDF

### Directional Connections
- **Single RDF Statement**: `A --[P]--> B`
- **Semantic Meaning**: A has relationship P to B
- **Example**: "Saul Goodman" --[employs]--> "Kim Wexler"

### Non-Directional Connections  
- **Two RDF Statements**: `A --[P]--> B` AND `B --[P]--> A`
- **Semantic Meaning**: A and B are symmetrically related through P
- **Example**: "Saul Goodman" --[partners_with]--> "Kim Wexler" AND "Kim Wexler" --[partners_with]--> "Saul Goodman"

## Abstraction Hierarchies

### OWL Class Structure
```javascript
// Convert abstraction chains to rdfs:subClassOf
nodePrototypes.forEach((node) => {
  if (node.abstractionChains) {
    for (const dimension in node.abstractionChains) {
      const chain = node.abstractionChains[dimension];
      for (let i = 1; i < chain.length; i++) {
        const subClassId = chain[i];
        const superClassId = chain[i - 1];
        // Add rdfs:subClassOf relationship
        nodesObj[subClassId].subClassOf = [{ "@id": superClassId }];
      }
    }
  }
});
```

### Example Hierarchy
```
Legal Professional
├── rdfs:subClassOf → Professional
    ├── rdfs:subClassOf → Person
        └── rdfs:subClassOf → Entity
```

## File Format

### Redstring Native Format (.redstring)
```json
{
  "@context": "https://redstring.org/context",
  "@type": "redstring:CognitiveSpace",
  "edges": {
    "connection-1": {
      "id": "connection-1",
      "sourceId": "instance-a",
      "destinationId": "instance-b", 
      "directionality": { "arrowsToward": [] },
      "rdfStatements": [
        {
          "@type": "Statement",
          "subject": { "@id": "node:prototype-a" },
          "predicate": { "@id": "node:relationship-type" },
          "object": { "@id": "node:prototype-b" }
        }
      ]
    }
  }
}
```

### RDF Export Format (.nq)
```n3
_:b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement> .
_:b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#subject> <node:prototype-a> .
_:b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#predicate> <node:relationship-type> .
_:b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#object> <node:prototype-b> .
```

## Benefits

### 1. Application Functionality
- **Full Redstring Features**: All native functionality preserved
- **Performance**: Optimized data structures for real-time interaction
- **User Experience**: Intuitive visual interface and interactions

### 2. Semantic Web Interoperability
- **Machine Readable**: AI systems can process and reason over the data
- **Standards Compliant**: Works with existing RDF/OWL tools and libraries
- **Linked Data**: Can connect to external semantic web resources

### 3. Future Capabilities
- **AI Reasoning**: Automated inference and knowledge discovery
- **Cross-Pod Linking**: Connect knowledge across different Solid Pods
- **Semantic Search**: Find concepts by meaning, not just keywords
- **Knowledge Integration**: Merge with external ontologies and datasets

## Testing and Validation

### External Validation
```python
# test_nquads.py - Python script for RDF analysis
import rdflib
g = rdflib.Graph()
g.parse('cognitive-space.nq', format='nquads')

# Count RDF statements
statements = list(g.triples((None, rdflib.RDF.type, rdflib.RDF.Statement)))
print(f"Found {len(statements)} RDF statements")
```

### Quality Checks
- **RDF Statement Count**: Verify edges are converted to statements
- **Prototype Mapping**: Ensure instance→prototype conversion works
- **Directionality**: Check bidirectional vs unidirectional handling
- **Abstraction Hierarchies**: Validate subClassOf relationships

## Future Enhancements

### 1. OWL Reasoning
- **Class Inference**: Automatically infer new relationships
- **Consistency Checking**: Validate knowledge graph consistency
- **Query Expansion**: Enhance searches with semantic reasoning

### 2. External Integration
- **Solid Pods**: Store and retrieve from decentralized data stores
- **WebID**: Link to personal identity and preferences
- **Linked Data**: Connect to external knowledge bases

### 3. Advanced Semantics
- **OWL Restrictions**: Define constraints and rules
- **Property Chains**: Complex relationship patterns
- **Semantic Annotations**: Rich metadata and provenance

## Technical Implementation

### Key Files
- `src/formats/redstringFormat.js`: Dual-format export/import
- `src/formats/rdfExport.js`: RDF serialization
- `test_nquads.py`: External validation script

### Dependencies
- `jsonld`: JSON-LD processing and RDF conversion
- `rdflib.js`: RDF parsing and manipulation (future use)
- `@inrupt/solid-client`: Solid Pod integration (future use)

This integration enables Redstring to bridge the gap between human cognitive modeling and machine semantic processing, creating a foundation for collective intelligence and AI-augmented knowledge work.

---

# Solid Pod Federation

## Architecture Overview

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

## Authentication Flow

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

## Pod Data Structure

Cognitive spaces are stored in a structured hierarchy within the user's Pod:

```
https://user.pod.com/
├── redstring/
│   ├── spaces.ttl                    # Index of all cognitive spaces
│   ├── my_research.redstring         # Individual cognitive space
│   ├── project_ideas.redstring       # Another cognitive space
│   └── ...
```

## Spaces Index (RDF/Turtle)

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

## CRUD Operations

### Save Cognitive Space
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

### Load Cognitive Space
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

### List Cognitive Spaces
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
