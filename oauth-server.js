/**
 * Dedicated OAuth Server
 * Handles GitHub OAuth flow with clean separation from AI bridge
 * Neuroplastic architecture - each server has one clear purpose
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.OAUTH_PORT || 3002;

// CORS for frontend communication
app.use(cors({ origin: true }));
app.use(express.json());

// Enhanced health check with detailed configuration status
app.get('/health', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  
  res.json({ 
    status: 'healthy', 
    service: 'oauth-server',
    port: PORT,
    configured: !!(clientId && clientSecret),
    clientIdConfigured: !!clientId,
    clientSecretConfigured: !!clientSecret,
    clientIdLength: clientId ? clientId.length : 0,
    clientSecretLength: clientSecret ? clientSecret.length : 0,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get GitHub OAuth client ID with enhanced validation
app.get('/api/github/oauth/client-id', (req, res) => {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID || null;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || null;
    
    // Enhanced validation
    const isConfigured = !!(clientId && clientSecret);
    const clientIdValid = clientId && clientId.trim().length > 0;
    const clientSecretValid = clientSecret && clientSecret.trim().length > 0;
    
    console.log('[OAuth] Client ID request:', {
      configured: isConfigured,
      clientIdValid,
      clientSecretValid,
      clientIdLength: clientId ? clientId.length : 0,
      clientSecretLength: clientSecret ? clientSecret.length : 0
    });
    
    res.json({ 
      clientId: clientIdValid ? clientId.trim() : null, 
      configured: isConfigured,
      clientIdValid,
      clientSecretValid,
      service: 'oauth-server' 
    });
  } catch (error) {
    console.error('[OAuth] Failed to get client ID:', error);
    res.status(500).json({ 
      error: 'Failed to get client ID',
      service: 'oauth-server',
      details: error.message
    });
  }
});

// Exchange OAuth code for access token with enhanced error handling
app.post('/api/github/oauth/token', async (req, res) => {
  try {
    const { code, state, redirect_uri } = req.body;
    
    console.log('[OAuth] Token exchange request:', {
      hasCode: !!code,
      hasState: !!state,
      hasRedirectUri: !!redirect_uri,
      codeLength: code ? code.length : 0,
      stateLength: state ? state.length : 0
    });
    
    if (!code || !state) {
      return res.status(400).json({ 
        error: 'Missing code or state',
        service: 'oauth-server',
        received: { hasCode: !!code, hasState: !!state }
      });
    }
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    // Enhanced validation with detailed error messages
    if (!clientId || !clientSecret) {
      console.error('[OAuth] Missing credentials:', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        clientIdLength: clientId ? clientId.length : 0,
        clientSecretLength: clientSecret ? clientSecret.length : 0
      });
      
      return res.status(500).json({ 
        error: 'GitHub OAuth not configured',
        hint: 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables',
        service: 'oauth-server',
        details: {
          clientIdConfigured: !!clientId,
          clientSecretConfigured: !!clientSecret,
          clientIdLength: clientId ? clientId.length : 0,
          clientSecretLength: clientSecret ? clientSecret.length : 0
        }
      });
    }
    
    // Validate credential format
    const clientIdValid = clientId.trim().length > 0;
    const clientSecretValid = clientSecret.trim().length > 0;
    
    if (!clientIdValid || !clientSecretValid) {
      console.error('[OAuth] Invalid credentials format:', {
        clientIdValid,
        clientSecretValid,
        clientIdLength: clientId.length,
        clientSecretLength: clientSecret.length
      });
      
      return res.status(500).json({
        error: 'Invalid OAuth credentials format',
        service: 'oauth-server',
        details: {
          clientIdValid,
          clientSecretValid,
          clientIdLength: clientId.length,
          clientSecretLength: clientSecret.length
        }
      });
    }
    
    console.log('[OAuth] Exchanging code for token...');
    
    // Exchange code for access token with GitHub
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Redstring-OAuth-Server/1.0'
      },
      body: JSON.stringify({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        code,
        redirect_uri,
        state
      })
    });
    
    console.log('[OAuth] GitHub response status:', tokenResponse.status);
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[OAuth] GitHub API error:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorText,
        headers: Object.fromEntries(tokenResponse.headers.entries())
      });
      
      // Provide more specific error messages based on status code
      let errorMessage = `GitHub API error: ${tokenResponse.status}`;
      if (tokenResponse.status === 404) {
        errorMessage = 'GitHub OAuth credentials invalid or OAuth app not found (404)';
      } else if (tokenResponse.status === 400) {
        errorMessage = 'Invalid OAuth request parameters (400)';
      } else if (tokenResponse.status === 401) {
        errorMessage = 'GitHub OAuth credentials invalid (401)';
      }
      
      throw new Error(errorMessage);
    }
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('[OAuth] GitHub OAuth error:', tokenData);
      throw new Error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
    }
    
    console.log('[OAuth] Token exchange successful');
    
    // Return token data to frontend
    res.json({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'bearer',
      scope: tokenData.scope,
      service: 'oauth-server'
    });
    
  } catch (error) {
    console.error('[OAuth] Token exchange failed:', {
      error: error.message,
      stack: error.stack,
      service: 'oauth-server'
    });
    
    res.status(500).json({ 
      error: error.message,
      service: 'oauth-server',
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🔐 OAuth Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  
  if (clientId && clientSecret) {
    console.log('✅ GitHub OAuth configured');
    console.log(`📋 Client ID length: ${clientId.length}`);
    console.log(`📋 Client Secret length: ${clientSecret.length}`);
  } else {
    console.log('⚠️  GitHub OAuth not configured - set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET');
    console.log('🔍 Check Secret Manager permissions for Cloud Run service account');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔐 OAuth Server shutting down...');
  process.exit(0);
});
