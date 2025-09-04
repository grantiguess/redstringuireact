/**
 * RedString App + Semantic Web Server
 * - Serves static UI
 * - Proxies OAuth to the OAuth server
 * - Exposes local semantic web endpoints (JSON-LD, N-Quads, Turtle)
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs/promises';
import jsonld from 'jsonld';
import * as $rdf from 'rdflib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const PORT = process.env.PORT || 4000;
const OAUTH_PORT = process.env.OAUTH_PORT || 3002;
const OAUTH_HOST = process.env.OAUTH_HOST || 'localhost';
const DEFAULT_UNIVERSE_SLUG = process.env.UNIVERSE_SLUG || 'default';

// Build OAuth server URL
const oauthBaseUrl = OAUTH_HOST === 'localhost' 
  ? `http://localhost:${OAUTH_PORT}`
  : OAUTH_HOST.startsWith('http') 
    ? OAUTH_HOST 
    : `https://${OAUTH_HOST}`;

// In Docker, we're in /app and dist is at /app/dist 
const distPath = path.join(process.cwd(), 'dist');

// Enable JSON parsing for OAuth requests and general API
app.use(express.json({ limit: '5mb' }));
// Enable CORS for semantic web routes (safe for read-only endpoints)
app.use(cors());

// Proxy OAuth requests to internal OAuth server
app.get('/api/github/oauth/client-id', async (req, res) => {
  try {
    const response = await fetch(`${oauthBaseUrl}/api/github/oauth/client-id`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('OAuth proxy error (client-id):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

app.get('/api/github/oauth/health', async (req, res) => {
  try {
    const response = await fetch(`${oauthBaseUrl}/health`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('OAuth proxy error (health):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

app.post('/api/github/oauth/token', async (req, res) => {
  try {
    const response = await fetch(`${oauthBaseUrl}/api/github/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('OAuth proxy error (token):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

// GitHub App client-id proxy to OAuth server
app.get('/api/github/app/client-id', async (req, res) => {
  try {
    const response = await fetch(`${oauthBaseUrl}/api/github/app/client-id`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('OAuth proxy error (app client-id):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

// GitHub App proxies to OAuth server
app.post('/api/github/app/installation-token', async (req, res) => {
  try {
    const response = await fetch(`${oauthBaseUrl}/api/github/app/installation-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('OAuth proxy error (installation-token):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

app.get('/api/github/app/installation/:installation_id', async (req, res) => {
  try {
    const { installation_id } = req.params;
    const response = await fetch(`${oauthBaseUrl}/api/github/app/installation/${encodeURIComponent(installation_id)}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('OAuth proxy error (installation details):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

// List GitHub App installations (fallback endpoint)
app.get('/api/github/app/installations', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:${OAUTH_PORT}/api/github/app/installations`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('OAuth proxy error (installations list):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

// Create repository via GitHub App installation
app.post('/api/github/app/create-repository', async (req, res) => {
  try {
    const response = await fetch(`${oauthBaseUrl}/api/github/app/create-repository`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('OAuth proxy error (create repository):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

// Create repository via OAuth user authentication (recommended)
app.post('/api/github/oauth/create-repository', async (req, res) => {
  try {
    const response = await fetch(`${oauthBaseUrl}/api/github/oauth/create-repository`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('OAuth proxy error (OAuth create repository):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

// Serve static files from the dist directory
app.use(express.static(distPath));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'redstring-server' });
});

// --- Local Semantic Web Hosting ---

// Resolve universe file path by slug
const getUniverseFilePath = (slug) => {
  const safeSlug = (slug || DEFAULT_UNIVERSE_SLUG).replace(/[^a-z0-9-_]/gi, '').toLowerCase() || DEFAULT_UNIVERSE_SLUG;
  return path.join(process.cwd(), 'universes', safeSlug, 'universe.redstring');
};

// Load JSON-LD (.redstring) safely
const loadUniverseJson = async (slug) => {
  const filePath = getUniverseFilePath(slug);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
};

// Convert JSON-LD to Turtle using rdflib
const jsonldToTurtle = async (json, baseUri) => {
  return new Promise((resolve, reject) => {
    try {
      const store = $rdf.graph();
      const jsonString = typeof json === 'string' ? json : JSON.stringify(json);
      // Parse JSON-LD directly into the rdflib store
      $rdf.parse(jsonString, store, baseUri, 'application/ld+json');
      $rdf.serialize(undefined, store, baseUri, 'text/turtle', (err, result) => {
        if (err) return reject(err);
        resolve(result || '');
      });
    } catch (e) {
      reject(e);
    }
  });
};

// Serve JSON-LD
app.get(['/semantic/universe.jsonld', '/semantic/:slug/universe.jsonld'], async (req, res) => {
  try {
    const slug = req.params.slug || DEFAULT_UNIVERSE_SLUG;
    const data = await loadUniverseJson(slug);
    res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
    res.status(200).send(JSON.stringify(data, null, 2));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Universe not found' });
    }
    console.error('Semantic JSON-LD error:', err);
    res.status(500).json({ error: 'Failed to load universe' });
  }
});

// Serve N-Quads (RDF)
app.get(['/semantic/universe.nq', '/semantic/:slug/universe.nq'], async (req, res) => {
  try {
    const slug = req.params.slug || DEFAULT_UNIVERSE_SLUG;
    const data = await loadUniverseJson(slug);
    const nquads = await jsonld.toRDF(data, { format: 'application/n-quads' });
    res.setHeader('Content-Type', 'application/n-quads; charset=utf-8');
    res.status(200).send(nquads);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Universe not found' });
    }
    logger.error('Semantic N-Quads error:', err);
    res.status(500).json({ error: 'Failed to convert universe to N-Quads' });
  }
});

// Serve Turtle (best-effort)
app.get(['/semantic/universe.ttl', '/semantic/:slug/universe.ttl'], async (req, res) => {
  try {
    const slug = req.params.slug || DEFAULT_UNIVERSE_SLUG;
    const data = await loadUniverseJson(slug);
    const baseUri = process.env.SEMANTIC_BASE_URI || `http://localhost:${PORT}/semantic/${slug}/`;
    const turtle = await jsonldToTurtle(data, baseUri);
    res.setHeader('Content-Type', 'text/turtle; charset=utf-8');
    res.status(200).send(turtle);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Universe not found' });
    }
    logger.error('Semantic Turtle error:', err);
    res.status(500).json({ error: 'Failed to convert universe to Turtle' });
  }
});

// Update universe via JSON-LD (bidirectional sync entry point)
app.post(['/semantic/universe.jsonld', '/semantic/:slug/universe.jsonld'], async (req, res) => {
  try {
    const slug = req.params.slug || DEFAULT_UNIVERSE_SLUG;
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Expected JSON-LD body' });
    }
    // Basic validation: must include @context
    if (!body['@context']) {
      return res.status(422).json({ error: 'Missing @context in JSON-LD' });
    }
    const filePath = getUniverseFilePath(slug);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf8');
    res.status(200).json({ status: 'ok', slug, path: filePath });
  } catch (err) {
    logger.error('Semantic JSON-LD write error:', err);
    res.status(500).json({ error: 'Failed to write universe' });
  }
});

// Minimal SPARQL endpoint placeholder (future enhancement)
app.post(['/sparql', '/semantic/:slug/sparql'], (req, res) => {
  res.status(501).json({ error: 'SPARQL endpoint not implemented yet. Use /semantic/* JSON-LD or N-Quads for now.' });
});

// GitHub App callback route - log and redirect to frontend with params
app.get('/github/app/callback', (req, res) => {
  const { installation_id, setup_action, state } = req.query;
  
  logger.debug('[GitHub App Callback] ===== CALLBACK RECEIVED =====');
  logger.debug('[GitHub App Callback] Query params:', req.query);
  logger.debug('[GitHub App Callback] Headers:', {
    'user-agent': req.headers['user-agent'],
    'referer': req.headers.referer,
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-real-ip': req.headers['x-real-ip']
  });
  logger.debug('[GitHub App Callback] Full URL:', req.url);
  logger.debug('[GitHub App Callback] =====================================');
  
  // Redirect to the frontend with the parameters preserved
  const params = new URLSearchParams();
  if (installation_id) params.set('installation_id', installation_id);
  if (setup_action) params.set('setup_action', setup_action);
  if (state) params.set('state', state);
  
  const redirectUrl = `/?${params.toString()}`;
  logger.info('[GitHub App Callback] Redirecting to:', redirectUrl);
  
  res.redirect(redirectUrl);
});

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  logger.info(`🚀 RedString server running on port ${PORT}`);
  logger.info(`📋 Health check: http://localhost:${PORT}/health`);
});

export default app;


