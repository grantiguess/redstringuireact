async function testSparqlQuery() {
  console.log('🧪 Testing SPARQL Query Directly...\n');

  // Test the exact query that should find entities related to LittleBigPlanet
  const query = `
    SELECT DISTINCT ?resource ?resourceLabel ?comment WHERE {
      ?resource <http://dbpedia.org/ontology/wikiPageWikiLink> <http://dbpedia.org/resource/Media_Molecule> .
      ?resource rdfs:label ?resourceLabel . FILTER(LANG(?resourceLabel) = "en")
      OPTIONAL { ?resource rdfs:comment ?comment . FILTER(LANG(?comment) = "en") }
      FILTER(?resource != <http://dbpedia.org/resource/LittleBigPlanet>)
    } LIMIT 10
  `;

  console.log('Query:', query);
  console.log('\nExecuting query...');

  try {
    const response = await fetch('https://dbpedia.org/sparql', {
      method: 'POST',
      headers: {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RedString-SemanticWeb/1.0'
      },
      body: `query=${encodeURIComponent(query)}`
    });

    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Found ${data.results?.bindings?.length || 0} results`);
      
      if (data.results?.bindings) {
        data.results.bindings.forEach((result, index) => {
          console.log(`\n${index + 1}. ${result.resourceLabel?.value || 'Unknown'}`);
          console.log(`   Resource: ${result.resource?.value || 'N/A'}`);
          if (result.comment?.value) {
            console.log(`   Comment: ${result.comment.value.substring(0, 150)}...`);
          }
        });
      }
    } else {
      console.log(`Response failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log('Error details:', errorText);
    }
  } catch (error) {
    console.error('❌ Query failed:', error.message);
  }

  console.log('\n✅ SPARQL Test Complete!');
}

// Run the test
testSparqlQuery().catch(console.error);
