#!/usr/bin/env node

/**
 * OAuth Fix Verification Script
 * Tests the OAuth endpoints to verify the fix is working
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://redstring-prod-784175375476.us-central1.run.app';

async function testEndpoint(endpoint, description) {
  try {
    console.log(`🔍 Testing ${description}...`);
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const data = await response.json();
    
    console.log(`📋 Status: ${response.status}`);
    console.log(`📋 Response:`, JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log(`✅ ${description} - PASSED\n`);
      return true;
    } else {
      console.log(`❌ ${description} - FAILED\n`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${description} - ERROR: ${error.message}\n`);
    return false;
  }
}

async function main() {
  console.log('🧪 OAuth Fix Verification Test');
  console.log('==============================\n');
  
  const tests = [
    {
      endpoint: '/health',
      description: 'Main Server Health Check'
    },
    {
      endpoint: '/api/github/oauth/health',
      description: 'OAuth Server Health Check'
    },
    {
      endpoint: '/api/github/oauth/client-id',
      description: 'OAuth Client ID Endpoint'
    }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const result = await testEndpoint(test.endpoint, test.description);
    if (result) passed++;
  }
  
  console.log('📊 Test Results');
  console.log('===============');
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Success Rate: ${Math.round((passed/total) * 100)}%`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! OAuth should be working correctly.');
    console.log('\n📋 Next steps:');
    console.log('1. Try the OAuth flow in the application');
    console.log('2. Check the browser console for any errors');
    console.log('3. Monitor Cloud Run logs for OAuth activity');
  } else {
    console.log('\n⚠️  Some tests failed. Check the troubleshooting guide:');
    console.log('   https://github.com/your-repo/OAUTH_TROUBLESHOOTING.md');
  }
}

main().catch(console.error);
