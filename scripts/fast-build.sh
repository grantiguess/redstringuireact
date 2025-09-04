#!/bin/bash

# Ultra-Fast Local Docker Build Script for M4 Pro
# Optimized for maximum speed with parallel operations

set -e

PROJECT_ID="redstring-470201"
SERVICE_NAME="redstring-test-784175375476"
REGION="us-central1"
PORT="8080"

echo "🚀 Starting FAST local Docker build for M4 Pro..."

# Use BuildKit for faster builds and parallel operations
export DOCKER_BUILDKIT=1

# Build the Docker image with max parallelism
echo "📦 Building Docker image with M4 Pro optimization..."
docker build \
    --platform linux/amd64 \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --progress=plain \
    -t gcr.io/${PROJECT_ID}/${SERVICE_NAME}:local \
    -f deployment/docker/Dockerfile .

echo "✅ Docker image built successfully"

# Push and deploy in parallel using background jobs
echo "📤 Starting parallel push and deploy..."

# Start push in background
(
    echo "  📤 Pushing to GCR..."
    docker push gcr.io/${PROJECT_ID}/${SERVICE_NAME}:local
    echo "  ✅ Push complete"
) &
PUSH_PID=$!

# Wait for push to complete before deploying
wait $PUSH_PID

echo "🚀 Deploying to Cloud Run with M4 Pro specs..."

# Deploy with high-performance settings
gcloud run deploy ${SERVICE_NAME} \
    --image gcr.io/${PROJECT_ID}/${SERVICE_NAME}:local \
    --region ${REGION} \
    --platform managed \
    --allow-unauthenticated \
    --port ${PORT} \
    --memory 2Gi \
    --cpu 2 \
    --concurrency 200 \
    --max-instances 3 \
    --timeout 300 \
    --cpu-boost \
    --execution-environment gen2 \
    --set-env-vars "NODE_ENV=production" \
    --set-secrets "GITHUB_CLIENT_ID=github-client-id:latest,GITHUB_CLIENT_SECRET=github-client-secret:latest,GITHUB_APP_ID=github-app-id:latest,GITHUB_APP_PRIVATE_KEY=github-app-private-key:latest,GITHUB_CLIENT_ID_DEV=github-client-id-dev:latest,GITHUB_CLIENT_SECRET_DEV=github-client-secret-dev:latest,GITHUB_APP_ID_DEV=github-app-id-dev:latest,GITHUB_APP_PRIVATE_KEY_DEV=github-app-private-key-dev:latest,GITHUB_APP_SLUG_DEV=github-app-slug-dev:latest" \
    --quiet

echo "✅ M4 Pro optimized build and deployment complete!"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format='value(status.url)')
echo "🌐 Service URL: ${SERVICE_URL}"

echo ""
echo "⚡ M4 Pro Performance Settings Applied:"
echo "   • 2 CPU cores (max for Cloud Run)"
echo "   • 2GB RAM"
echo "   • CPU boost enabled"
echo "   • Gen2 execution environment"
echo "   • 200 concurrent requests"
echo "   • BuildKit optimized Docker builds"
echo ""
echo "📝 For your dev GitHub App, use:"
echo "   Homepage: ${SERVICE_URL}/"
echo "   OAuth callback: ${SERVICE_URL}/oauth/callback"
echo "   Webhook: ${SERVICE_URL}/api/github/app/webhook"
