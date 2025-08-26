/**
 * Production Server for RedString UI React
 * Serves static files and handles OAuth for multiple clients
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// In Docker, we're in /app and dist is at /app/dist 
const distPath = path.join(process.cwd(), 'dist');

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