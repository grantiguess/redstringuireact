import { LocalSemanticQuery } from './src/services/localSemanticQuery.js';
import { findRelatedConcepts } from './src/services/semanticWebQuery.js';

async function testEnhancedSemanticSearch() {
  console.log('🧪 Testing Enhanced Semantic Search...\n');

  // Test 1: Local semantic query with external results
  console.log('1. Testing Local Semantic Query with external results...');
  try {
    const localQuery = new LocalSemanticQuery();
    const results = await localQuery.findRelatedEntities('littlebigplanet', {
      maxResults: 15,
      includeExternal: true,
      semanticSimilarity: true
    });
    
    console.log(`   Found ${results.length} results:`);
    results.forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.name} (${result.type || 'unknown'}) - Relevance: ${result.relevance.toFixed(2)}`);
      if (result.metadata?.isExternal) {
        console.log(`       External source: ${result.metadata.source}`);
      }
    });
  } catch (error) {
    console.error('   ❌ Local query failed:', error.message);
  }

  console.log('\n2. Testing Direct External Semantic Web Query...');
  try {
    const externalResults = await findRelatedConcepts('littlebigplanet', {
      limit: 15,
      includeCategories: true
    });
    
    console.log(`   Found ${externalResults.length} external results:`);
    externalResults.forEach((result, index) => {
      const name = result.itemLabel?.value || result.label?.value || 'Unknown';
      const description = result.itemDescription?.value || result.comment?.value || '';
      console.log(`   ${index + 1}. ${name}`);
      if (description) {
        console.log(`       ${description.substring(0, 100)}...`);
      }
    });
  } catch (error) {
    console.error('   ❌ External query failed:', error.message);
  }

  console.log('\n3. Testing Category-based Search...');
  try {
    // Test with a broader gaming term
    const gamingResults = await findRelatedConcepts('video game', {
      limit: 10,
      includeCategories: true
    });
    
    console.log(`   Found ${gamingResults.length} gaming-related results:`);
    gamingResults.slice(0, 5).forEach((result, index) => {
      const name = result.itemLabel?.value || result.label?.value || 'Unknown';
      console.log(`   ${index + 1}. ${name}`);
    });
  } catch (error) {
    console.error('   ❌ Category search failed:', error.message);
  }

  console.log('\n✅ Enhanced Semantic Search Test Complete!');
}

// Run the test
testEnhancedSemanticSearch().catch(console.error);
