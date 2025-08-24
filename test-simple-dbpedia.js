import { discoverDBpediaProperties } from './src/services/semanticWebQuery.js';

async function testSimpleDBpedia() {
  console.log('🧪 Testing Simple DBpedia Related Entity Search...\n');

  // Test 1: Get properties for LittleBigPlanet
  console.log('1. Getting properties for LittleBigPlanet...');
  try {
    const properties = await discoverDBpediaProperties('LittleBigPlanet', { 
      limit: 50, 
      specificProperties: false 
    });
    
    console.log(`   Found ${properties.length} properties`);
    
    // Look for properties that link to other entities
    const entityLinks = properties.filter(prop => 
      prop.value?.value && prop.value.value.includes('dbpedia.org/resource/')
    );
    
    console.log(`   Found ${entityLinks.length} entity links`);
    
    // Show first few entity links
    entityLinks.slice(0, 10).forEach((prop, index) => {
      const propertyName = prop.propertyLabel || prop.property?.split('/').pop() || 'Unknown';
      const valueName = prop.valueLabel || prop.value?.split('/').pop() || 'Unknown';
      console.log(`   ${index + 1}. ${propertyName} -> ${valueName}`);
      console.log(`       URI: ${prop.value.value}`);
    });
    
    // Show first few properties to understand the structure
    console.log('\n   First 10 properties (all types):');
    properties.slice(0, 10).forEach((prop, index) => {
      console.log(`   ${index + 1}. Raw property object:`, JSON.stringify(prop, null, 2));
    });
    
    // Test 2: Try to find entities related to one of these values
    if (entityLinks.length > 0) {
      const testProperty = entityLinks[0];
      const testValueUri = testProperty.value.value;
      const testValueName = testProperty.valueLabel?.value || testProperty.value.value.split('/').pop();
      
      console.log(`\n2. Testing related entity search for "${testValueName}"...`);
      
      const testQuery = `
        SELECT DISTINCT ?resource ?resourceLabel ?comment WHERE {
          ?resource <${testProperty.property.value}> <${testValueUri}> .
          ?resource rdfs:label ?resourceLabel . FILTER(LANG(?resourceLabel) = "en")
          OPTIONAL { ?resource rdfs:comment ?comment . FILTER(LANG(?comment) = "en") }
          FILTER(?resource != <http://dbpedia.org/resource/LittleBigPlanet>)
        } LIMIT 5
      `;
      
      console.log(`   Query: ${testQuery}`);
      
      try {
        const response = await fetch('https://dbpedia.org/sparql', {
          method: 'POST',
          headers: {
            'Accept': 'application/sparql-results+json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'RedString-SemanticWeb/1.0'
          },
          body: `query=${encodeURIComponent(testQuery)}`
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`   Response status: ${response.status}`);
          console.log(`   Found ${data.results?.bindings?.length || 0} results`);
          
          if (data.results?.bindings) {
            data.results.bindings.forEach((result, index) => {
              console.log(`   ${index + 1}. ${result.resourceLabel?.value || 'Unknown'}`);
              if (result.comment?.value) {
                console.log(`       ${result.comment.value.substring(0, 100)}...`);
              }
            });
          }
        } else {
          console.log(`   Response failed: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error('   ❌ Query failed:', error.message);
      }
    }
    
  } catch (error) {
    console.error('   ❌ Property discovery failed:', error.message);
  }

  console.log('\n✅ Simple DBpedia Test Complete!');
}

// Run the test
testSimpleDBpedia().catch(console.error);
