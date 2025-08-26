/**
 * Production Server for RedString UI React
 * Serves static files and handles OAuth for multiple clients
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const OAUTH_PORT = process.env.OAUTH_PORT || 3002;

// In Docker, we're in /app and dist is at /app/dist 
const distPath = path.join(process.cwd(), 'dist');

// Enable JSON parsing for OAuth requests
app.use(express.json());

// Proxy OAuth requests to internal OAuth server
app.get('/api/github/oauth/client-id', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:${OAUTH_PORT}/api/github/oauth/client-id`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('OAuth proxy error (client-id):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

app.get('/api/github/oauth/health', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:${OAUTH_PORT}/health`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('OAuth proxy error (health):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

app.post('/api/github/oauth/token', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:${OAUTH_PORT}/api/github/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('OAuth proxy error (token):', error);
    res.status(500).json({ error: 'OAuth service unavailable' });
  }
});

// Serve static files from the dist directory
app.use(express.static(distPath));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'redstring-server' });
});

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 RedString server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
});

export default app;