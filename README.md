# RedString UI React - Semantic Knowledge Base

This repository contains the RedString UI React application with semantic data management capabilities.

## Quick Start

### OAuth Fix (If experiencing 404 errors)

The OAuth permissions are now automatically configured during deployment. If you're experiencing OAuth 404 errors, simply redeploy:

**For Production:**
```bash
./deployment/gcp/deploy_prod.sh
```

**For Test Environment:**
```bash
./deployment/gcp/deploy_test.sh
```

These scripts automatically fix the IAM permissions needed for OAuth secrets.

## Structure

- `schema/` - Contains semantic files in Turtle (.ttl) format
- `profile/` - User profile and preferences  
- `vocabulary/` - Ontology and schema definitions
- `federation/` - Federation and subscription data
- `deployment/` - Deployment configuration and scripts
- `src/` - React application source code

## OAuth Configuration

The application uses GitHub OAuth for authentication. OAuth secrets are stored in Google Cloud Secret Manager and accessed by the Cloud Run service.

### Required Environment Variables

- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app client secret
- `VITE_GITHUB_CLIENT_ID` - Client ID for frontend
- `OAUTH_PORT` - Port for internal OAuth server (default: 3002)

### GitHub OAuth App Settings

- **Redirect URI:** `https://redstring-prod-784175375476.us-central1.run.app/oauth/callback`
- **Homepage URL:** `https://redstring-prod-784175375476.us-central1.run.app`

## Deployment

### Production Deployment

```bash
# Deploy to production (includes OAuth fix)
./deployment/gcp/deploy_prod.sh
```

### Manual Deployment

```bash
# Build the application
npm run build

# Deploy to Cloud Run
gcloud run deploy redstring-prod \
  --image gcr.io/redstring-470201/redstring-app:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=4000 \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=100 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production,OAUTH_PORT=3002" \
  --set-secrets="GITHUB_CLIENT_ID=github-client-id:latest,GITHUB_CLIENT_SECRET=github-client-secret:latest,VITE_GITHUB_CLIENT_ID=github-client-id:latest" \
  --project=redstring-470201
```

## Troubleshooting

For OAuth issues, see the comprehensive troubleshooting guide:

[OAUTH_TROUBLESHOOTING.md](./OAUTH_TROUBLESHOOTING.md)

### Common Issues

1. **OAuth 404 Error:** Cloud Run service account lacks Secret Manager access
2. **Empty Client ID:** OAuth secrets not properly configured
3. **CORS Issues:** Frontend cannot access OAuth endpoints

### Debug Commands

```bash
# Test OAuth endpoints
curl -s https://redstring-prod-784175375476.us-central1.run.app/api/github/oauth/client-id

# View Cloud Run logs
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=redstring-prod' --limit=50 --project=redstring-470201

# Check service status
gcloud run services describe redstring-prod --region=us-central1 --project=redstring-470201
```

## Getting Started

This repository was automatically initialized by RedString UI React. You can now start adding semantic data through the application interface.

## Architecture

```
Frontend (Port 4000)
    ↓
Main Server (deployment/server.js)
    ↓ (proxy)
OAuth Server (oauth-server.js, Port 3002)
    ↓
GitHub OAuth API
```

The application uses a microservices architecture with:
- **Main Server:** Serves static files and proxies OAuth requests
- **OAuth Server:** Handles GitHub OAuth flow
- **Frontend:** React application for semantic data management

## Git Federation

See `GIT_FEDERATION.md` for a single-source overview of how Git-first universes, syncing, and provider auth work in the current system.
