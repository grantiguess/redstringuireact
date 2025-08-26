# OAuth Troubleshooting Guide

## Problem Summary

The Redstring application OAuth flow fails with a 404 error when exchanging the authorization code for an access token.

**Error:** `POST https://redstring-prod-784175375476.us-central1.run.app/api/github/oauth/token 500 (Internal Server Error)`

## Root Cause

Cloud Run service cannot access GitHub OAuth secrets due to IAM permission issues. The logs show:
```
Permission denied on secret: projects/784175375476/secrets/github-client-id/versions/latest
for Revision service account 784175375476-compute@developer.gserviceaccount.com
```

## Quick Fix

Run the permission fix script:

```bash
./deployment/gcp/fix-oauth-permissions.sh
```

Or run the comprehensive deployment script:

```bash
./deployment/gcp/deploy-with-oauth-fix.sh
```

## Manual Fix Steps

### 1. Grant Secret Manager Access

```bash
# Set variables
PROJECT_ID="redstring-470201"
PROJECT_NUMBER="784175375476"
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant project-wide access
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Grant access to specific secrets
gcloud secrets add-iam-policy-binding github-client-id \
  --project=${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding github-client-secret \
  --project=${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

### 2. Redeploy the Application

```bash
# Build and deploy
npm run build

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

## Testing the Fix

### 1. Test OAuth Client ID Endpoint

```bash
curl -s https://redstring-prod-784175375476.us-central1.run.app/api/github/oauth/client-id
```

**Expected Response:**
```json
{
  "clientId": "Ov23liYygPgJ9Tzcbvg6",
  "configured": true,
  "clientIdValid": true,
  "clientSecretValid": true,
  "service": "oauth-server"
}
```

### 2. Test Health Endpoint

```bash
curl -s https://redstring-prod-784175375476.us-central1.run.app/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "redstring-server"
}
```

### 3. Test OAuth Server Health

```bash
curl -s https://redstring-prod-784175375476.us-central1.run.app/api/github/oauth/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "oauth-server",
  "port": 3002,
  "configured": true,
  "clientIdConfigured": true,
  "clientSecretConfigured": true,
  "clientIdLength": 20,
  "clientSecretLength": 40,
  "environment": "production"
}
```

## Debugging Commands

### View Cloud Run Logs

```bash
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=redstring-prod' \
  --limit=50 \
  --project=redstring-470201
```

### Check Service Status

```bash
gcloud run services describe redstring-prod \
  --region=us-central1 \
  --project=redstring-470201
```

### Verify Secret Access

```bash
# Test github-client-id access
gcloud secrets versions access latest \
  --secret="github-client-id" \
  --project=redstring-470201

# Test github-client-secret access
gcloud secrets versions access latest \
  --secret="github-client-secret" \
  --project=redstring-470201
```

### Check IAM Permissions

```bash
# Check project IAM
gcloud projects get-iam-policy redstring-470201 \
  --flatten="bindings[].members" \
  --format="table(bindings.role)" \
  --filter="bindings.members:784175375476-compute@developer.gserviceaccount.com"

# Check secret IAM
gcloud secrets get-iam-policy github-client-id \
  --project=redstring-470201

gcloud secrets get-iam-policy github-client-secret \
  --project=redstring-470201
```

## Common Issues and Solutions

### Issue 1: Empty Client ID/Secret

**Symptoms:** OAuth client ID endpoint returns `null` or empty values

**Cause:** Cloud Run service account lacks Secret Manager access

**Solution:** Run the permission fix script

### Issue 2: 404 Error from GitHub

**Symptoms:** GitHub returns 404 when exchanging authorization code

**Cause:** Invalid or empty OAuth credentials sent to GitHub

**Solution:** Ensure secrets are properly configured and accessible

### Issue 3: OAuth Server Not Responding

**Symptoms:** Internal OAuth server (port 3002) not accessible

**Cause:** OAuth server not starting or crashing

**Solution:** Check OAuth server logs and ensure environment variables are set

### Issue 4: CORS Issues

**Symptoms:** Frontend cannot access OAuth endpoints

**Cause:** CORS configuration issues

**Solution:** Verify CORS settings in both main server and OAuth server

## Architecture Overview

```
Frontend (Port 4000)
    ↓
Main Server (deployment/server.js)
    ↓ (proxy)
OAuth Server (oauth-server.js, Port 3002)
    ↓
GitHub OAuth API
```

**Key Files:**
- `oauth-server.js` - Dedicated OAuth server
- `deployment/server.js` - Main server with OAuth proxy
- `cloudbuild.yaml` - Deployment configuration
- `deployment/gcp/fix-oauth-permissions.sh` - Permission fix script

## Environment Variables

**Required for OAuth:**
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app client secret
- `VITE_GITHUB_CLIENT_ID` - Client ID for frontend (same as above)
- `OAUTH_PORT` - Port for internal OAuth server (default: 3002)

**Set via Cloud Run secrets:**
```bash
--set-secrets="GITHUB_CLIENT_ID=github-client-id:latest,GITHUB_CLIENT_SECRET=github-client-secret:latest,VITE_GITHUB_CLIENT_ID=github-client-id:latest"
```

## GitHub OAuth App Configuration

**Redirect URI:** `https://redstring-prod-784175375476.us-central1.run.app/oauth/callback`

**Homepage URL:** `https://redstring-prod-784175375476.us-central1.run.app`

**Authorization callback URL:** `https://redstring-prod-784175375476.us-central1.run.app/oauth/callback`

## Monitoring and Alerts

### Key Metrics to Monitor

1. **OAuth Success Rate:** Percentage of successful token exchanges
2. **OAuth Error Rate:** Percentage of failed OAuth requests
3. **Secret Access Errors:** Permission denied errors for Secret Manager
4. **Response Times:** OAuth endpoint response times

### Log Patterns to Watch

- `[OAuth] Token exchange successful` - Normal operation
- `[OAuth] GitHub API error: 404` - Credential issues
- `Permission denied on secret` - IAM permission issues
- `GitHub OAuth not configured` - Missing environment variables

## Recovery Procedures

### Emergency Rollback

If OAuth breaks after deployment:

```bash
# Rollback to previous revision
gcloud run services update-traffic redstring-prod \
  --to-revisions=redstring-prod-00001-abc=100 \
  --region=us-central1 \
  --project=redstring-470201
```

### Manual Secret Update

If secrets need to be updated:

```bash
# Update github-client-id
echo "new-client-id" | gcloud secrets versions add github-client-id \
  --data-file=- \
  --project=redstring-470201

# Update github-client-secret
echo "new-client-secret" | gcloud secrets versions add github-client-secret \
  --data-file=- \
  --project=redstring-470201
```

## Support Contacts

- **Primary:** Development team
- **Escalation:** Cloud infrastructure team
- **Documentation:** This troubleshooting guide
