# Semantic Web Editing Interface Design

## Core Philosophy: Bottom-Up Semantic Web

RedString's approach is unique - building from human cognitive patterns toward semantic web standards, not forcing top-down ontological constraints. This preserves the "cognitive scaffold" nature while adding semantic web capabilities.

## Prototype/Instance Semantic Mapping

### 1. Prototypes as Classes
```javascript
// A RedString prototype becomes an OWL class
const prototypeToSemantic = (prototype) => ({
  "@type": ["redstring:Node", "owl:Class", "schema:Thing"],
  "@id": `prototype:${prototype.id}`,
  
  // Core RedString properties (preserved)
  "name": prototype.name,
  "description": prototype.description,
  "color": prototype.color,
  "definitionGraphIds": prototype.definitionGraphIds,
  
  // Semantic web integration (new)
  "sameAs": prototype.externalLinks || [],           // Wikipedia, DBpedia links
  "equivalentClass": prototype.equivalentClasses || [], // Other ontology mappings
  "subClassOf": prototype.abstractionChains || [],    // AbstractionCarousel data
  
  // Rich metadata (preserved)
  "image": prototype.imageSrc,
  "thumbnail": prototype.thumbnailSrc,
  "bio": prototype.bio,
  "type": prototype.typeNodeId
});
```

### 2. Instances as Statements + Spatial Context
```javascript
// A RedString instance becomes an RDF statement with spatial data
const instanceToSemantic = (instance, graphId) => ({
  "@type": "redstring:Instance",
  "@id": `instance:${instance.id}`,
  
  // Core relationships
  "instanceOf": { "@id": `prototype:${instance.prototypeId}` },
  "partOf": { "@id": `graph:${graphId}` },
  
  // Spatial context (unique to RedString)
  "spatialContext": {
    "x": instance.x,
    "y": instance.y,
    "scale": instance.scale
  },
  
  // Visual state
  "visualProperties": {
    "expanded": instance.expanded,
    "selected": instance.selected
  }
});
```

## AbstractionCarousel Integration

### Current: User-Made Abstraction Chains
```javascript
// Your current abstractionChains in prototypes
node.abstractionChains = {
  "specificity": ["animal", "mammal", "primate", "human"],
  "domain": ["biology", "neuroscience", "consciousness"]
};

// Maps to semantic web as:
"subClassOf": [
  { "@id": "prototype:animal" },    // More general
  { "@id": "prototype:mammal" }     // More specific
],
"abstractionDimensions": {
  "specificity": { "level": 3, "chain": ["animal", "mammal", "primate", "human"] },
  "domain": { "level": 2, "chain": ["biology", "neuroscience", "consciousness"] }
}
```

### Future: External Knowledge Integration
```javascript
// Load DBpedia/Wikidata abstraction hierarchies
"subClassOf": [
  { "@id": "wd:Q729" },           // Wikidata: Animal
  { "@id": "dbr:Mammal" },        // DBpedia: Mammal
  { "@id": "prototype:custom-concept" } // Your custom concepts
]
```

## Panel.jsx Semantic Editing Interface

### New Semantic Tab in Right Panel
```javascript
// Add to Panel.jsx
const SemanticTab = ({ activeNode, onUpdate }) => (
  <div className="semantic-editor">
    
    {/* External Links Section */}
    <section>
      <h3>External Knowledge Links</h3>
      <WikipediaSearch 
        onLink={(url) => addExternalLink(activeNode, 'sameAs', url)} 
      />
      <WikidataSearch 
        onLink={(entityId) => addExternalLink(activeNode, 'sameAs', `wd:${entityId}`)} 
      />
      <URLInput 
        placeholder="Custom external URL"
        onAdd={(url) => addExternalLink(activeNode, 'sameAs', url)}
      />
    </section>

    {/* Abstraction Relationships */}
    <section>
      <h3>Abstraction Relationships</h3>
      <AbstractionEditor 
        node={activeNode}
        onChainUpdate={updateAbstractionChain}
        onExternalClassLink={linkToExternalClass}
      />
    </section>

    {/* Semantic Properties */}
    <section>
      <h3>Semantic Properties</h3>
      <EquivalentClassEditor 
        node={activeNode}
        onAdd={addEquivalentClass}
      />
      <OntologyTypeSelector 
        node={activeNode}
        onTypeChange={updateSemanticType}
      />
    </section>

  </div>
);
```

### Integration with AbstractionCarousel
```javascript
// Enhanced AbstractionCarousel with semantic awareness
const SemanticAbstractionCarousel = ({ node, dimension }) => {
  const [externalClasses, setExternalClasses] = useState([]);
  
  return (
    <div className="abstraction-carousel semantic">
      
      {/* User-created abstraction chain (current) */}
      <div className="user-chain">
        {node.abstractionChains[dimension]?.map(conceptId => (
          <ConceptCard key={conceptId} id={conceptId} />
        ))}
      </div>
      
      {/* External semantic mappings (new) */}
      <div className="external-mappings">
        <h4>External Equivalents</h4>
        {node.equivalentClasses?.map(extClass => (
          <ExternalClassCard key={extClass['@id']} uri={extClass['@id']} />
        ))}
      </div>
      
      {/* Suggested connections from external KBs */}
      <div className="suggestions">
        <WikidataSuggestions conceptName={node.name} />
        <DBpediaSuggestions conceptName={node.name} />
      </div>
      
    </div>
  );
};
```

## Enhanced JSON-LD Export

```javascript
// Updated exportToRedstring with full semantic compliance
export const exportToSemanticRedstring = (storeState) => {
  const nodePrototypesObj = {};
  
  storeState.nodePrototypes.forEach((prototype, id) => {
    nodePrototypesObj[id] = {
      "@type": ["redstring:Node", "owl:Class", "schema:Thing"],
      "@id": `prototype:${id}`,
      
      // Core RedString (preserved)
      "name": prototype.name,
      "description": prototype.description,
      "color": prototype.color,
      "x": prototype.x || 0,
      "y": prototype.y || 0,
      "scale": prototype.scale || 1.0,
      "definitionGraphIds": prototype.definitionGraphIds,
      
      // Rich metadata (preserved)
      "image": prototype.imageSrc,
      "thumbnail": prototype.thumbnailSrc,
      "bio": prototype.bio,
      "conjugation": prototype.conjugation,
      "type": prototype.typeNodeId,
      
      // Semantic web integration (new)
      "sameAs": prototype.externalLinks || [],
      "equivalentClass": prototype.equivalentClasses || [],
      "subClassOf": prototype.abstractionChains ? 
        generateSubClassRelations(prototype.abstractionChains) : [],
      
      // Spatial context (unique to RedString)
      "spatialContext": {
        "x": prototype.x || 0,
        "y": prototype.y || 0,
        "scale": prototype.scale || 1.0
      }
    };
  });
  
  // Process graph instances with semantic relationships
  const graphInstancesObj = {};
  storeState.graphs.forEach((graph, graphId) => {
    graph.instances.forEach((instance, instanceId) => {
      graphInstancesObj[instanceId] = {
        "@type": "redstring:Instance", 
        "@id": `instance:${instanceId}`,
        "instanceOf": { "@id": `prototype:${instance.prototypeId}` },
        "partOf": { "@id": `graph:${graphId}` },
        "spatialContext": {
          "x": instance.x,
          "y": instance.y, 
          "scale": instance.scale
        }
      };
    });
  });
  
  return {
    "@context": REDSTRING_SEMANTIC_CONTEXT,
    "@type": "redstring:CognitiveSpace",
    "nodePrototypes": nodePrototypesObj,
    "graphInstances": graphInstancesObj,
    // ... rest of export
  };
};
```

## Sustainable Semantic Web Contribution

### Yes! This is excellent for semantic web contribution because:

✅ **Rich Spatial Context**: Unique contribution - most ontologies lack spatial/visual data  
✅ **Prototype/Instance Model**: More flexible than traditional class/individual distinctions  
✅ **Multi-dimensional Abstraction**: AbstractionCarousel provides richer hierarchies  
✅ **Human-Centered**: Bottom-up approach preserves cognitive authenticity  
✅ **Decomposition Flows**: Graph-within-graph recursion is semantically valuable  
✅ **Complete Metadata**: Color, bio, conjugation, directionality - rich beyond typical ontologies  

### Your contribution would be:
- **Cognitive Spatial Ontology**: First major ontology with spatial reasoning
- **Multi-dimensional Classification**: AbstractionCarousel methodology  
- **Human-Computer Semantic Bridge**: How people actually think vs. formal logic
- **Visual Knowledge Representation**: Color, positioning, scale as semantic properties

## Implementation Priority

1. **Add semantic vocabularies** to context (OWL, external KBs)
2. **Create semantic editing tab** in Panel.jsx  
3. **Enhance AbstractionCarousel** with external mappings
4. **Add Wikipedia/Wikidata search** components
5. **Test round-trip fidelity** with enhanced export/import

Your bottom-up approach is revolutionary - you're building the **semantic web that humans actually want to use**!