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

// Refresh OAuth access token
app.post('/api/github/oauth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    console.log('[OAuth] Refresh token request:', {
      hasRefreshToken: !!refresh_token,
      refreshTokenLength: refresh_token ? refresh_token.length : 0
    });
    
    if (!refresh_token) {
      return res.status(400).json({ 
        error: 'Missing refresh token',
        service: 'oauth-server'
      });
    }
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(500).json({ 
        error: 'GitHub OAuth not configured',
        service: 'oauth-server'
      });
    }
    
    console.log('[OAuth] Refreshing access token...');
    
    // GitHub doesn't actually support refresh tokens in the traditional sense
    // But we can validate the existing token and return it if still valid
    // In a real implementation, you'd store refresh tokens and manage them properly
    
    // For now, we'll treat the "refresh_token" as an indication to validate current auth
    // This is a simplified implementation - in production you'd want proper refresh token flow
    
    res.status(501).json({
      error: 'Token refresh not yet implemented',
      message: 'GitHub OAuth uses long-lived tokens. Please re-authenticate if your token has expired.',
      service: 'oauth-server'
    });
    
  } catch (error) {
    console.error('[OAuth] Token refresh failed:', error);
    res.status(500).json({ 
      error: error.message,
      service: 'oauth-server'
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

// GitHub App endpoints
// Generate installation access token (server-side only for security)
app.post('/api/github/app/installation-token', async (req, res) => {
  try {
    const { installation_id } = req.body;
    
    if (!installation_id) {
      return res.status(400).json({
        error: 'Installation ID is required',
        service: 'oauth-server'
      });
    }

    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      return res.status(500).json({
        error: 'GitHub App not configured',
        hint: 'Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY environment variables',
        service: 'oauth-server'
      });
    }

    console.log('[GitHubApp] Generating installation token for installation:', installation_id);

    // Generate JWT for app authentication
    const jwt = require('jsonwebtoken');
    const payload = {
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + (10 * 60),
      iss: parseInt(appId, 10)
    };

    const appJWT = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    // Get installation access token
    const tokenResponse = await fetch(`https://api.github.com/app/installations/${installation_id}/access_tokens`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${appJWT}`,
        'User-Agent': 'Redstring-GitHubApp-Server/1.0'
      }
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[GitHubApp] Installation token request failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorText
      });
      throw new Error(`GitHub API error: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('[GitHubApp] Installation token generated successfully');

    res.json({
      token: tokenData.token,
      expires_at: tokenData.expires_at,
      permissions: tokenData.permissions,
      service: 'oauth-server'
    });

  } catch (error) {
    console.error('[GitHubApp] Installation token generation failed:', error);
    res.status(500).json({
      error: error.message,
      service: 'oauth-server'
    });
  }
});

// Get installation data
app.get('/api/github/app/installation/:installation_id', async (req, res) => {
  try {
    const { installation_id } = req.params;
    
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      return res.status(500).json({
        error: 'GitHub App not configured',
        service: 'oauth-server'
      });
    }

    // Generate JWT for app authentication
    const jwt = require('jsonwebtoken');
    const payload = {
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + (10 * 60),
      iss: parseInt(appId, 10)
    };

    const appJWT = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    // Get installation data
    const installationResponse = await fetch(`https://api.github.com/app/installations/${installation_id}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${appJWT}`,
        'User-Agent': 'Redstring-GitHubApp-Server/1.0'
      }
    });

    if (!installationResponse.ok) {
      throw new Error(`GitHub API error: ${installationResponse.status}`);
    }

    const installationData = await installationResponse.json();

    // Get installation repositories
    const reposResponse = await fetch(`https://api.github.com/app/installations/${installation_id}/repositories`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${appJWT}`,
        'User-Agent': 'Redstring-GitHubApp-Server/1.0'
      }
    });

    let repositories = [];
    if (reposResponse.ok) {
      const reposData = await reposResponse.json();
      repositories = reposData.repositories || [];
    }

    res.json({
      installation: installationData,
      repositories,
      account: installationData.account,
      permissions: installationData.permissions,
      service: 'oauth-server'
    });

  } catch (error) {
    console.error('[GitHubApp] Installation data request failed:', error);
    res.status(500).json({
      error: error.message,
      service: 'oauth-server'
    });
  }
});

// GitHub App webhook handler
app.post('/api/github/app/webhook', async (req, res) => {
  const event = req.headers['x-github-event'];
  const signature = req.headers['x-hub-signature-256'];
  const payload = req.body;

  console.log('[GitHubApp] Webhook received:', {
    event,
    action: payload.action,
    installationId: payload.installation?.id
  });

  // TODO: Verify webhook signature for security
  // const isValid = verifyWebhookSignature(signature, JSON.stringify(payload));
  // if (!isValid) {
  //   return res.status(401).json({ error: 'Invalid signature' });
  // }

  switch (event) {
    case 'installation':
      if (payload.action === 'created') {
        console.log('[GitHubApp] New installation:', {
          installationId: payload.installation.id,
          account: payload.installation.account.login,
          repositories: payload.repositories?.length || 0
        });
      } else if (payload.action === 'deleted') {
        console.log('[GitHubApp] Installation removed:', payload.installation.id);
      }
      break;

    case 'installation_repositories':
      console.log('[GitHubApp] Repository access changed:', {
        installationId: payload.installation.id,
        added: payload.repositories_added?.length || 0,
        removed: payload.repositories_removed?.length || 0
      });
      break;

    default:
      console.log('[GitHubApp] Unhandled webhook event:', event);
  }

  res.status(200).json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`🔐 OAuth Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  
  if (clientId && clientSecret) {
    console.log('✅ GitHub OAuth configured');
    console.log(`📋 Client ID length: ${clientId.length}`);
    console.log(`📋 Client Secret length: ${clientSecret.length}`);
  } else {
    console.log('⚠️  GitHub OAuth not configured - set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET');
  }

  if (appId && privateKey) {
    console.log('✅ GitHub App configured');
    console.log(`📋 App ID: ${appId}`);
    console.log(`📋 Private Key length: ${privateKey.length}`);
  } else {
    console.log('⚠️  GitHub App not configured - set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY');
    console.log('🔍 Check Secret Manager permissions for Cloud Run service account');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔐 OAuth Server shutting down...');
  process.exit(0);
});
