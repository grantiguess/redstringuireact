import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// GitHub OAuth token exchange endpoint
app.post('/api/github/oauth/token', async (req, res) => {
  console.log('[OAuth Server] Token exchange request received');
  
  try {
    const { code, state, redirect_uri } = req.body;
    
    console.log('[OAuth Server] Request params:', { 
      hasCode: !!code, 
      hasState: !!state, 
      redirect_uri 
    });
    
    if (!code || !state) {
      console.error('[OAuth Server] Missing required parameters');
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    console.log('[OAuth Server] Environment check:', { 
      hasClientId: !!clientId, 
      hasClientSecret: !!clientSecret 
    });
    
    if (!clientId || !clientSecret) {
      console.error('[OAuth Server] GitHub OAuth not configured');
      return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }
    
    console.log('[OAuth Server] Exchanging code with GitHub...');
    
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirect_uri
      })
    });
    
    console.log('[OAuth Server] GitHub response status:', tokenResponse.status);
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('[OAuth Server] GitHub OAuth error:', tokenData.error, tokenData.error_description);
      return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    }
    
    console.log('[OAuth Server] Token exchange successful');
    
    res.json({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      scope: tokenData.scope
    });
    
  } catch (error) {
    console.error('OAuth token exchange error:', error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`OAuth server running on port ${PORT}`);
  console.log(`GitHub OAuth callback URL: http://localhost:${PORT}/oauth/callback`);
}); 