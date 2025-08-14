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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'oauth-server',
    port: PORT,
    configured: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
  });
});

// Get GitHub OAuth client ID
app.get('/api/github/oauth/client-id', (req, res) => {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID || null;
    res.json({ 
      clientId, 
      configured: !!clientId,
      service: 'oauth-server' 
    });
  } catch (error) {
    console.error('[OAuth] Failed to get client ID:', error);
    res.status(500).json({ error: 'Failed to get client ID' });
  }
});

// Exchange OAuth code for access token
app.post('/api/github/oauth/token', async (req, res) => {
  try {
    const { code, state, redirect_uri } = req.body;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(500).json({ 
        error: 'GitHub OAuth not configured',
        hint: 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables'
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
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri,
        state
      })
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[OAuth] GitHub API error:', tokenResponse.status, errorText);
      throw new Error(`GitHub API error: ${tokenResponse.status}`);
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
    console.error('[OAuth] Token exchange failed:', error);
    res.status(500).json({ 
      error: error.message,
      service: 'oauth-server'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🔐 OAuth Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    console.log('✅ GitHub OAuth configured');
  } else {
    console.log('⚠️  GitHub OAuth not configured - set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔐 OAuth Server shutting down...');
  process.exit(0);
});
