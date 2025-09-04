/**
 * Dedicated OAuth Server
 * Handles GitHub OAuth flow with clean separation from AI bridge
 * Neuroplastic architecture - each server has one clear purpose
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

// Load environment variables
dotenv.config();

// Environment-based logging control
const isProduction = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info');

// Create a logger that respects environment settings
const logger = {
  info: (...args) => {
    if (LOG_LEVEL === 'info' || LOG_LEVEL === 'debug') {
      console.log(...args);
    }
  },
  warn: (...args) => {
    if (LOG_LEVEL === 'warn' || LOG_LEVEL === 'info' || LOG_LEVEL === 'debug') {
      console.warn(...args);
    }
  },
  error: (...args) => {
    // Always log errors
    console.error(...args);
  },
  debug: (...args) => {
    if (LOG_LEVEL === 'debug') {
      console.log('[DEBUG]', ...args);
    }
  }
};

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

// Helper to detect if request comes from dev environment (localhost only for now)
function isLocalRequest(req) {
  try {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().toLowerCase();
    return host.includes('localhost') || 
           host.includes('127.0.0.1');
           // Temporarily use PROD app for test deployment until dev app is created
  } catch { return false; }
}

// Get GitHub OAuth client ID with enhanced validation and dev/prod selection
app.get('/api/github/oauth/client-id', (req, res) => {
  try {
    const useDev = isLocalRequest(req);
    const clientId = useDev
      ? (process.env.GITHUB_CLIENT_ID_DEV || process.env.GITHUB_CLIENT_ID || null)
      : (process.env.GITHUB_CLIENT_ID || null);
    const clientSecret = useDev
      ? (process.env.GITHUB_CLIENT_SECRET_DEV || process.env.GITHUB_CLIENT_SECRET || null)
      : (process.env.GITHUB_CLIENT_SECRET || null);
    
    // Enhanced validation
    const isConfigured = !!(clientId && clientSecret);
    const clientIdValid = clientId && clientId.trim().length > 0;
    const clientSecretValid = clientSecret && clientSecret.trim().length > 0;
    
    logger.debug('[OAuth] Client ID request:', {
      configured: isConfigured,
      clientIdValid,
      clientSecretValid,
      clientIdLength: clientId ? clientId.length : 0,
      clientSecretLength: clientSecret ? clientSecret.length : 0,
      selection: useDev ? 'dev' : 'prod'
    });
    
    res.json({ 
      clientId: clientIdValid ? clientId.trim() : null, 
      configured: isConfigured,
      clientIdValid,
      clientSecretValid,
      selection: useDev ? 'dev' : 'prod',
      service: 'oauth-server' 
    });
  } catch (error) {
    logger.error('[OAuth] Failed to get client ID:', error);
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
    
    logger.debug('[OAuth] Refresh token request:', {
      hasRefreshToken: !!refresh_token,
      refreshTokenLength: refresh_token ? refresh_token.length : 0
    });
    
    if (!refresh_token) {
      return res.status(400).json({ 
        error: 'Missing refresh token',
        service: 'oauth-server'
      });
    }
    
    // Select dev/prod OAuth credentials based on redirect_uri or request origin
    const redirectHost = (() => {
      try { return new URL(redirect_uri).host.toLowerCase(); } catch { return ''; }
    })();
    const isLocal = redirectHost.includes('localhost') || isLocalRequest(req);
    const clientId = isLocal
      ? (process.env.GITHUB_CLIENT_ID_DEV || process.env.GITHUB_CLIENT_ID)
      : process.env.GITHUB_CLIENT_ID;
    const clientSecret = isLocal
      ? (process.env.GITHUB_CLIENT_SECRET_DEV || process.env.GITHUB_CLIENT_SECRET)
      : process.env.GITHUB_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(500).json({ 
        error: 'GitHub OAuth not configured',
        service: 'oauth-server'
      });
    }
    
    logger.debug('[OAuth] Refreshing access token...');
    
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
    
    logger.debug('[OAuth] Token exchange request:', {
      hasCode: !!code,
      hasState: !!state,
      hasRedirectUri: !!redirect_uri,
      redirect_uri: redirect_uri,
      redirect_uri_exact: JSON.stringify(redirect_uri),
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
    
    // Select dev/prod OAuth credentials based on redirect_uri or request origin
    const redirectHost = (() => {
      try { return new URL(redirect_uri).host.toLowerCase(); } catch { return ''; }
    })();
    const isLocal = redirectHost.includes('localhost') || isLocalRequest(req);
    const clientId = isLocal
      ? (process.env.GITHUB_CLIENT_ID_DEV || process.env.GITHUB_CLIENT_ID)
      : process.env.GITHUB_CLIENT_ID;
    const clientSecret = isLocal
      ? (process.env.GITHUB_CLIENT_SECRET_DEV || process.env.GITHUB_CLIENT_SECRET)
      : process.env.GITHUB_CLIENT_SECRET;
    
    // Enhanced validation with detailed error messages
    if (!clientId || !clientSecret) {
      logger.error('[OAuth] Missing credentials:', {
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
      logger.error('[OAuth] Invalid credentials format:', {
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
    
    logger.debug('[OAuth] Exchanging code for token...');
    
    const requestPayload = {
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      code,
      redirect_uri,
      state
    };
    
    logger.debug('[OAuth] Sending to GitHub:', JSON.stringify(requestPayload, null, 2));
    
    // Exchange code for access token with GitHub
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Redstring-OAuth-Server/1.0'
      },
      body: JSON.stringify(requestPayload)
    });
    
    logger.debug('[OAuth] GitHub response status:', tokenResponse.status);
    
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
    
    logger.info('[OAuth] Token exchange successful');
    
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

// Create repository via OAuth user authentication (recommended approach)
app.post('/api/github/oauth/create-repository', async (req, res) => {
  try {
    const { access_token, name, private: isPrivate, description, auto_init } = req.body;
    
    if (!access_token || !name) {
      return res.status(400).json({
        error: 'Access token and repository name are required',
        service: 'oauth-server'
      });
    }

    logger.debug('[OAuth] Creating repository via user authentication:', { name, isPrivate });

    // Create repository using user's access token
    const createRepoResponse = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${access_token}`,
        'User-Agent': 'Redstring-OAuth-Server/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name.trim(),
        private: isPrivate !== false, // Default to private
        description: description || `RedString universe: ${name}`,
        auto_init: auto_init !== false, // Default to true (create README)
        has_issues: false,
        has_projects: false,
        has_wiki: false
      })
    });

    if (!createRepoResponse.ok) {
      const errorText = await createRepoResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: errorText };
      }

      logger.error('[OAuth] Repository creation failed:', {
        status: createRepoResponse.status,
        statusText: createRepoResponse.statusText,
        error: errorData,
        service: 'oauth-server'
      });

      return res.status(createRepoResponse.status).json({
        error: 'Repository creation failed',
        details: errorData.message || errorText,
        github_error: JSON.stringify(errorData),
        service: 'oauth-server'
      });
    }

    const newRepo = await createRepoResponse.json();
    
    logger.info('[OAuth] Repository created successfully:', {
      name: newRepo.full_name,
      private: newRepo.private,
      html_url: newRepo.html_url
    });

    res.json({
      id: newRepo.id,
      name: newRepo.name,
      full_name: newRepo.full_name,
      description: newRepo.description,
      private: newRepo.private,
      html_url: newRepo.html_url,
      clone_url: newRepo.clone_url,
      default_branch: newRepo.default_branch,
      created_at: newRepo.created_at,
      service: 'oauth-server'
    });

  } catch (error) {
    console.error('[OAuth] Repository creation error:', error);
    res.status(500).json({
      error: error.message,
      service: 'oauth-server'
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

    const useDev = isLocalRequest(req);
    const appId = useDev
      ? (process.env.GITHUB_APP_ID_DEV || process.env.GITHUB_APP_ID)
      : process.env.GITHUB_APP_ID;
    const privateKey = useDev
      ? (process.env.GITHUB_APP_PRIVATE_KEY_DEV || process.env.GITHUB_APP_PRIVATE_KEY)
      : process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      return res.status(500).json({
        error: 'GitHub App not configured',
        hint: 'Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY environment variables',
        service: 'oauth-server'
      });
    }

    logger.debug('[GitHubApp] Generating installation token for installation:', installation_id);

    // Generate JWT for app authentication
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
    logger.info('[GitHubApp] Installation token generated successfully');

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

// List GitHub App installations (for fallback when callback params are missing)
app.get('/api/github/app/installations', async (req, res) => {
  try {
    const useDevList = isLocalRequest(req);
    const appId = useDevList
      ? (process.env.GITHUB_APP_ID_DEV || process.env.GITHUB_APP_ID)
      : process.env.GITHUB_APP_ID;
    const privateKey = useDevList
      ? (process.env.GITHUB_APP_PRIVATE_KEY_DEV || process.env.GITHUB_APP_PRIVATE_KEY)
      : process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      return res.status(500).json({
        error: 'GitHub App not configured',
        service: 'oauth-server'
      });
    }

    logger.debug('[GitHubApp] Listing installations...');

    // Generate JWT for app authentication
    const payload = {
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + (10 * 60),
      iss: parseInt(appId, 10)
    };

    const appJWT = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    // Get all installations for this app
    const installationsResponse = await fetch('https://api.github.com/app/installations', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${appJWT}`,
        'User-Agent': 'Redstring-GitHubApp-Server/1.0'
      }
    });

    if (!installationsResponse.ok) {
      const errorText = await installationsResponse.text();
      console.error('[GitHubApp] List installations failed:', {
        status: installationsResponse.status,
        statusText: installationsResponse.statusText,
        errorText
      });
      throw new Error(`GitHub API error: ${installationsResponse.status} ${errorText}`);
    }

    const installations = await installationsResponse.json();
    logger.info('[GitHubApp] Found installations:', installations.length);

    // Return installations sorted by most recent
    const sortedInstallations = installations.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );

    res.json(sortedInstallations);

  } catch (error) {
    console.error('[GitHubApp] List installations failed:', error);
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
    
    const useDevGet = isLocalRequest(req);
    const appId = useDevGet
      ? (process.env.GITHUB_APP_ID_DEV || process.env.GITHUB_APP_ID)
      : process.env.GITHUB_APP_ID;
    const privateKey = useDevGet
      ? (process.env.GITHUB_APP_PRIVATE_KEY_DEV || process.env.GITHUB_APP_PRIVATE_KEY)
      : process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      return res.status(500).json({
        error: 'GitHub App not configured',
        service: 'oauth-server'
      });
    }

    // Generate JWT for app authentication
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

    // First get installation access token (repositories endpoint requires installation token, not app JWT)
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
      logger.error('[GitHubApp] Installation token request failed:', {
        status: tokenResponse.status,
        error: errorText,
        installation_id
      });
      throw new Error(`Failed to get installation token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const installationToken = tokenData.token;

    // Now use installation token to get repositories (this is the correct way)
    const reposUrl = `https://api.github.com/installation/repositories`;
    logger.debug('[GitHubApp] Attempting to fetch repositories with installation token:', {
      url: reposUrl,
      installation_id,
      hasInstallationToken: !!installationToken
    });
    
    const reposResponse = await fetch(reposUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${installationToken}`,
        'User-Agent': 'Redstring-GitHubApp-Server/1.0'
      }
    });

    let repositories = [];
    if (reposResponse.ok) {
      const reposData = await reposResponse.json();
      
      // DEBUG: Log the actual response structure to understand the issue
      logger.debug('[GitHubApp] Repositories API response structure:', {
        keys: Object.keys(reposData),
        total_count: reposData.total_count,
        repositories_length: reposData.repositories?.length,
        full_response: JSON.stringify(reposData, null, 2)
      });
      
      // GitHub API returns { total_count: N, repositories: [...] }
      repositories = reposData.repositories || [];
      
      // Additional logging for debugging
      if (repositories.length === 0) {
        logger.warn('[GitHubApp] No repositories found for installation:', installation_id);
        logger.warn('[GitHubApp] Response total_count:', reposData.total_count);
        logger.warn('[GitHubApp] This may indicate: 1) No repos selected during installation, 2) App lacks repository permissions, 3) All repos were deselected');
      }
    } else {
      const errorText = await reposResponse.text();
      logger.error('[GitHubApp] Repositories request failed:', {
        status: reposResponse.status,
        error: errorText,
        installation_id
      });
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

// Create repository via GitHub App installation
app.post('/api/github/app/create-repository', async (req, res) => {
  try {
    const { installation_id, name, private: isPrivate, description, auto_init } = req.body;
    
    if (!installation_id || !name) {
      return res.status(400).json({
        error: 'Installation ID and repository name are required',
        service: 'oauth-server'
      });
    }

    const useDevCreate = isLocalRequest(req);
    const appId = useDevCreate
      ? (process.env.GITHUB_APP_ID_DEV || process.env.GITHUB_APP_ID)
      : process.env.GITHUB_APP_ID;
    const privateKey = useDevCreate
      ? (process.env.GITHUB_APP_PRIVATE_KEY_DEV || process.env.GITHUB_APP_PRIVATE_KEY)
      : process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      return res.status(500).json({
        error: 'GitHub App not configured',
        hint: 'Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY environment variables',
        service: 'oauth-server'
      });
    }

    logger.debug('[GitHubApp] Creating repository via installation:', { installation_id, name, isPrivate });

    // Generate JWT for app authentication
    const payload = {
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + (10 * 60),
      iss: parseInt(appId, 10)
    };

    const appJWT = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    // Get installation access token first
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
      console.error('[GitHubApp] Installation token failed:', errorText);
      return res.status(tokenResponse.status).json({
        error: `Failed to get installation token: ${errorText}`,
        service: 'oauth-server'
      });
    }

    const tokenData = await tokenResponse.json();
    const installationToken = tokenData.token;

    // Create repository using the installation token
    const createRepoResponse = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${installationToken}`,
        'User-Agent': 'Redstring-GitHubApp-Server/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        private: !!isPrivate,
        description: description || 'RedString knowledge graph repository',
        auto_init: !!auto_init
      })
    });

    if (!createRepoResponse.ok) {
      const errorText = await createRepoResponse.text();
      console.error('[GitHubApp] Repository creation failed:', {
        status: createRepoResponse.status,
        statusText: createRepoResponse.statusText,
        errorText
      });
      
      // Return detailed error for 403 Forbidden
      if (createRepoResponse.status === 403) {
        return res.status(403).json({
          error: 'Repository creation forbidden',
          details: 'GitHub App installation does not have permission to create repositories. Please check the app permissions or create the repository manually.',
          github_error: errorText,
          service: 'oauth-server'
        });
      }
      
      return res.status(createRepoResponse.status).json({
        error: `Repository creation failed: ${createRepoResponse.status}`,
        details: errorText,
        service: 'oauth-server'
      });
    }

    const newRepo = await createRepoResponse.json();
    
    logger.info('[GitHubApp] Repository created successfully:', {
      name: newRepo.full_name,
      private: newRepo.private,
      installation_id
    });

    res.json({
      id: newRepo.id,
      name: newRepo.name,
      full_name: newRepo.full_name,
      description: newRepo.description,
      private: newRepo.private,
      html_url: newRepo.html_url,
      clone_url: newRepo.clone_url,
      default_branch: newRepo.default_branch,
      created_at: newRepo.created_at,
      service: 'oauth-server'
    });

  } catch (error) {
    console.error('[GitHubApp] Repository creation error:', error);
    res.status(500).json({
      error: error.message,
      service: 'oauth-server'
    });
  }
});

// Provide GitHub App slug/name for installation URL, selecting dev when local
app.get('/api/github/app/client-id', (req, res) => {
  try {
    const useDev = isLocalRequest(req);
    const prodSlug = process.env.GITHUB_APP_SLUG || 'redstring-semantic-sync';
    const devSlug = process.env.GITHUB_APP_SLUG_DEV || process.env.GITHUB_APP_SLUG || 'redstring-semantic-sync-dev';
    const appName = useDev ? devSlug : prodSlug;

    res.json({
      appName,
      selection: useDev ? 'dev' : 'prod',
      prodSlug,
      devSlug,
      service: 'oauth-server'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to determine app name', details: error.message, service: 'oauth-server' });
  }
});

// GitHub App webhook handler
app.post('/api/github/app/webhook', async (req, res) => {
  const event = req.headers['x-github-event'];
  const signature = req.headers['x-hub-signature-256'];
  const payload = req.body;

  logger.debug('[GitHubApp] Webhook received:', {
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
        logger.info('[GitHubApp] New installation:', {
          installationId: payload.installation.id,
          account: payload.installation.account.login,
          repositories: payload.repositories?.length || 0
        });
      } else if (payload.action === 'deleted') {
        logger.info('[GitHubApp] Installation removed:', payload.installation.id);
      }
      break;

    case 'installation_repositories':
      logger.info('[GitHubApp] Repository access changed:', {
        installationId: payload.installation.id,
        added: payload.repositories_added?.length || 0,
        removed: payload.repositories_removed?.length || 0
        });
      break;

    default:
      logger.debug('[GitHubApp] Unhandled webhook event:', event);
  }

  res.status(200).json({ received: true });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🔐 OAuth Server running on port ${PORT}`);
  logger.info(`📋 Health check: http://localhost:${PORT}/health`);
  
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  
  if (clientId && clientSecret) {
    logger.info('✅ GitHub OAuth configured');
    logger.debug(`📋 Client ID length: ${clientId.length}`);
    logger.debug(`📋 Client Secret length: ${clientSecret.length}`);
  } else {
    logger.warn('⚠️  GitHub OAuth not configured - set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET');
  }

  if (appId && privateKey) {
    logger.info('✅ GitHub App configured');
    logger.debug(`📋 App ID: ${appId}`);
    logger.debug(`📋 Private Key length: ${privateKey.length}`);
  } else {
    logger.warn('⚠️  GitHub App not configured - set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY');
    logger.warn('🔍 Check Secret Manager permissions for Cloud Run service account');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('🔐 OAuth Server shutting down...');
  process.exit(0);
});
