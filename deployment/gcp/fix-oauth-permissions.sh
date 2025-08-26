#!/bin/bash

# Fix OAuth 404 Error - Grant Secret Manager Access to Cloud Run Service Account
# This script fixes the IAM permission issues preventing OAuth token exchange

set -e

# Configuration
PROJECT_ID="redstring-470201"
PROJECT_NUMBER="784175375476"
REGION="us-central1"
SERVICE_NAME="redstring-prod"

# Service account that Cloud Run uses
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "🔧 Fixing OAuth permissions for Cloud Run service account..."
echo "Project: ${PROJECT_ID}"
echo "Service Account: ${SERVICE_ACCOUNT}"
echo ""

# Method 1: Grant project-wide Secret Manager access
echo "📋 Granting project-wide Secret Manager access..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "✅ Project-wide access granted"

# Method 2: Grant access to specific secrets (more secure)
echo "📋 Granting access to specific GitHub OAuth secrets..."

# Grant access to github-client-id secret
gcloud secrets add-iam-policy-binding github-client-id \
  --project=${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

# Grant access to github-client-secret secret  
gcloud secrets add-iam-policy-binding github-client-secret \
  --project=${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "✅ Specific secret access granted"

# Verify the secrets exist and are accessible
echo "🔍 Verifying secret access..."

# Test access to github-client-id
echo "Testing github-client-id access..."
gcloud secrets versions access latest \
  --secret="github-client-id" \
  --project=${PROJECT_ID} > /dev/null 2>&1 && echo "✅ github-client-id accessible" || echo "❌ github-client-id not accessible"

# Test access to github-client-secret  
echo "Testing github-client-secret access..."
gcloud secrets versions access latest \
  --secret="github-client-secret" \
  --project=${PROJECT_ID} > /dev/null 2>&1 && echo "✅ github-client-secret accessible" || echo "❌ github-client-secret not accessible"

echo ""
echo "🚀 Permissions fixed! The Cloud Run service should now be able to access OAuth secrets."
echo ""
echo "📋 Next steps:"
echo "1. Redeploy the application to apply the new permissions:"
echo "   gcloud run deploy ${SERVICE_NAME} --region=${REGION} --project=${PROJECT_ID}"
echo ""
echo "2. Test the OAuth flow:"
echo "   curl -s https://${SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app/api/github/oauth/client-id"
echo ""
echo "3. Check Cloud Run logs for any remaining issues:"
echo "   gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}' --limit=50 --project=${PROJECT_ID}"
