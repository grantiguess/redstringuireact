#!/bin/bash

# Comprehensive OAuth Fix and Deployment Script
# Fixes IAM permissions and deploys RedString with working OAuth

set -e

# Configuration
PROJECT_ID="redstring-470201"
PROJECT_NUMBER="784175375476"
REGION="us-central1"
SERVICE_NAME="redstring-prod"
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "🚀 RedString OAuth Fix and Deployment"
echo "======================================"
echo "Project: ${PROJECT_ID}"
echo "Service: ${SERVICE_NAME}"
echo "Region: ${REGION}"
echo "Service Account: ${SERVICE_ACCOUNT}"
echo ""

# Step 1: Fix OAuth permissions
echo "🔧 Step 1: Fixing OAuth permissions..."
echo ""

# Grant project-wide Secret Manager access
echo "📋 Granting project-wide Secret Manager access..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "✅ Project-wide access granted"

# Grant access to specific secrets
echo "📋 Granting access to specific GitHub OAuth secrets..."

gcloud secrets add-iam-policy-binding github-client-id \
  --project=${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

gcloud secrets add-iam-policy-binding github-client-secret \
  --project=${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "✅ Specific secret access granted"

# Step 2: Verify secrets are accessible
echo ""
echo "🔍 Step 2: Verifying secret access..."

# Test access to github-client-id
echo "Testing github-client-id access..."
if gcloud secrets versions access latest --secret="github-client-id" --project=${PROJECT_ID} > /dev/null 2>&1; then
  echo "✅ github-client-id accessible"
else
  echo "❌ github-client-id not accessible"
  exit 1
fi

# Test access to github-client-secret  
echo "Testing github-client-secret access..."
if gcloud secrets versions access latest --secret="github-client-secret" --project=${PROJECT_ID} > /dev/null 2>&1; then
  echo "✅ github-client-secret accessible"
else
  echo "❌ github-client-secret not accessible"
  exit 1
fi

# Step 3: Build and deploy
echo ""
echo "🏗️  Step 3: Building and deploying application..."

# Build the application
echo "📦 Building application..."
npm run build

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/redstring-app:latest \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --port=4000 \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=100 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production,OAUTH_PORT=3002" \
  --set-secrets="GITHUB_CLIENT_ID=github-client-id:latest,GITHUB_CLIENT_SECRET=github-client-secret:latest,VITE_GITHUB_CLIENT_ID=github-client-id:latest" \
  --project=${PROJECT_ID}

echo "✅ Deployment completed"

# Step 4: Test the deployment
echo ""
echo "🧪 Step 4: Testing deployment..."

# Wait for deployment to be ready
echo "⏳ Waiting for deployment to be ready..."
sleep 30

# Test health endpoint
echo "📋 Testing health endpoint..."
HEALTH_URL="https://${SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app/health"
HEALTH_RESPONSE=$(curl -s ${HEALTH_URL} || echo "{}")

if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed: $HEALTH_RESPONSE"
fi

# Test OAuth client ID endpoint
echo "📋 Testing OAuth client ID endpoint..."
OAUTH_URL="https://${SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app/api/github/oauth/client-id"
OAUTH_RESPONSE=$(curl -s ${OAUTH_URL} || echo "{}")

if echo "$OAUTH_RESPONSE" | grep -q "configured.*true"; then
  echo "✅ OAuth client ID endpoint working"
  echo "📋 Response: $OAUTH_RESPONSE"
else
  echo "❌ OAuth client ID endpoint failed: $OAUTH_RESPONSE"
fi

# Step 5: Show useful commands
echo ""
echo "🎉 Deployment completed!"
echo ""
echo "📋 Useful commands:"
echo ""
echo "View logs:"
echo "  gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}' --limit=50 --project=${PROJECT_ID}"
echo ""
echo "Test OAuth flow:"
echo "  curl -s https://${SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app/api/github/oauth/client-id"
echo ""
echo "Open application:"
echo "  open https://${SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app"
echo ""
echo "Check service status:"
echo "  gcloud run services describe ${SERVICE_NAME} --region=${REGION} --project=${PROJECT_ID}"
