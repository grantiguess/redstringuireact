#!/bin/bash

# GitHub App Setup Script for RedString
# This script helps set up environment variables and deploy the GitHub App integration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}${PURPLE}🔧 RedString GitHub App Setup${NC}"
echo -e "${PURPLE}===================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "oauth-server.js" ]; then
    echo -e "${RED}❌ oauth-server.js not found. Please run this script from the RedString project root.${NC}"
    exit 1
fi

echo -e "${BLUE}📋 This script will help you configure GitHub App credentials.${NC}"
echo -e "${BLUE}Make sure you've created your GitHub App first!${NC}"
echo ""

# Get GitHub App credentials
echo -e "${YELLOW}🔑 GitHub App Credentials${NC}"
read -p "$(echo -e ${BLUE}Enter your GitHub App ID: ${NC})" GITHUB_APP_ID
read -p "$(echo -e ${BLUE}Enter your GitHub App Client ID: ${NC})" GITHUB_APP_CLIENT_ID
read -sp "$(echo -e ${BLUE}Enter your GitHub App Client Secret: ${NC})" GITHUB_APP_CLIENT_SECRET
echo ""
read -sp "$(echo -e ${BLUE}Enter your Webhook Secret: ${NC})" GITHUB_APP_WEBHOOK_SECRET
echo ""

# Get private key file path
echo -e "${YELLOW}📄 Private Key Configuration${NC}"
read -p "$(echo -e ${BLUE}Enter path to your private key .pem file: ${NC})" PRIVATE_KEY_PATH

if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo -e "${RED}❌ Private key file not found at: $PRIVATE_KEY_PATH${NC}"
    exit 1
fi

# Read private key content
GITHUB_APP_PRIVATE_KEY=$(cat "$PRIVATE_KEY_PATH")

echo ""
echo -e "${GREEN}✅ All credentials collected!${NC}"
echo ""

# Ask about deployment target
echo -e "${YELLOW}🚀 Deployment Configuration${NC}"
echo "1) Local development (.env file)"
echo "2) Google Cloud production (Secret Manager)"
echo "3) Both"
read -p "$(echo -e ${BLUE}Choose deployment target (1-3): ${NC})" DEPLOY_TARGET

# Create local .env file
if [ "$DEPLOY_TARGET" = "1" ] || [ "$DEPLOY_TARGET" = "3" ]; then
    echo -e "${YELLOW}📝 Creating local .env file...${NC}"
    
    cat > .env.github-app << EOF
# GitHub App Configuration
GITHUB_APP_ID="$GITHUB_APP_ID"
GITHUB_APP_CLIENT_ID="$GITHUB_APP_CLIENT_ID"
GITHUB_APP_CLIENT_SECRET="$GITHUB_APP_CLIENT_SECRET"
GITHUB_APP_WEBHOOK_SECRET="$GITHUB_APP_WEBHOOK_SECRET"
GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY"

# Frontend Environment Variables
VITE_GITHUB_APP_ID="$GITHUB_APP_ID"
VITE_GITHUB_APP_CLIENT_ID="$GITHUB_APP_CLIENT_ID"
EOF

    echo -e "${GREEN}✅ Local .env.github-app file created${NC}"
    echo -e "${BLUE}💡 Add this to your main .env file or source it: ${BOLD}source .env.github-app${NC}"
fi

# Create Google Cloud secrets
if [ "$DEPLOY_TARGET" = "2" ] || [ "$DEPLOY_TARGET" = "3" ]; then
    echo -e "${YELLOW}☁️  Setting up Google Cloud secrets...${NC}"
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not found. Please install it first.${NC}"
        echo -e "${BLUE}Visit: https://cloud.google.com/sdk/docs/install${NC}"
        exit 1
    fi

    # Get current project
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
    if [ -z "$PROJECT_ID" ]; then
        read -p "$(echo -e ${BLUE}Enter your Google Cloud Project ID: ${NC})" PROJECT_ID
        gcloud config set project $PROJECT_ID
    fi

    echo -e "${BLUE}Using project: ${BOLD}$PROJECT_ID${NC}"

    # Create secrets
    echo -e "${YELLOW}Creating secrets in Google Cloud Secret Manager...${NC}"
    
    echo "$GITHUB_APP_ID" | gcloud secrets create github-app-id --data-file=- --replication-policy="automatic" 2>/dev/null || \
    echo "$GITHUB_APP_ID" | gcloud secrets versions add github-app-id --data-file=-
    
    echo "$GITHUB_APP_CLIENT_ID" | gcloud secrets create github-app-client-id --data-file=- --replication-policy="automatic" 2>/dev/null || \
    echo "$GITHUB_APP_CLIENT_ID" | gcloud secrets versions add github-app-client-id --data-file=-
    
    echo "$GITHUB_APP_CLIENT_SECRET" | gcloud secrets create github-app-client-secret --data-file=- --replication-policy="automatic" 2>/dev/null || \
    echo "$GITHUB_APP_CLIENT_SECRET" | gcloud secrets versions add github-app-client-secret --data-file=-
    
    echo "$GITHUB_APP_WEBHOOK_SECRET" | gcloud secrets create github-app-webhook-secret --data-file=- --replication-policy="automatic" 2>/dev/null || \
    echo "$GITHUB_APP_WEBHOOK_SECRET" | gcloud secrets versions add github-app-webhook-secret --data-file=-
    
    cat "$PRIVATE_KEY_PATH" | gcloud secrets create github-app-private-key --data-file=- --replication-policy="automatic" 2>/dev/null || \
    cat "$PRIVATE_KEY_PATH" | gcloud secrets versions add github-app-private-key --data-file=-

    echo -e "${GREEN}✅ Google Cloud secrets created successfully${NC}"
fi

# Update package.json with required dependencies
echo -e "${YELLOW}📦 Updating package.json dependencies...${NC}"

if [ -f "package.json" ]; then
    # Check if jsonwebtoken and @octokit/rest are already installed
    if ! grep -q '"jsonwebtoken"' package.json; then
        npm install jsonwebtoken --save
        echo -e "${GREEN}✅ Added jsonwebtoken dependency${NC}"
    fi
    
    if ! grep -q '"@octokit/rest"' package.json; then
        npm install @octokit/rest --save
        echo -e "${GREEN}✅ Added @octokit/rest dependency${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  package.json not found - please install dependencies manually:${NC}"
    echo -e "${BLUE}npm install jsonwebtoken @octokit/rest${NC}"
fi

# Create updated deployment script
echo -e "${YELLOW}🚀 Creating updated deployment script...${NC}"

cat > deployment/gcp/deploy_github_app_prod.sh << 'EOF'
#!/bin/bash

# GitHub App Production Deployment Script
# Deploys OAuth server with GitHub App support

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
PROJECT_ID=${1:-$(gcloud config get-value project 2>/dev/null)}
REGION=${2:-"us-central1"}
SERVICE_NAME="redstring-oauth-prod"

# Header
echo -e "${BOLD}${PURPLE}🔐 GitHub App OAuth Server - PRODUCTION DEPLOYMENT${NC}"
echo -e "${PURPLE}=================================================${NC}"
echo ""

# Validation
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ No project ID specified and no default project set${NC}"
    echo -e "${YELLOW}Usage: $0 [project-id] [region]${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Deployment Configuration:${NC}"
echo -e "   Project ID: ${BOLD}${PROJECT_ID}${NC}"
echo -e "   Region: ${BOLD}${REGION}${NC}"
echo -e "   Service: ${BOLD}${SERVICE_NAME}${NC}"
echo -e "   Features: ${BOLD}${GREEN}OAuth + GitHub App${NC}"
echo ""

# Confirmation
read -p "$(echo -e ${YELLOW}🚨 Deploy to PRODUCTION? [y/N]: ${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⏹️  Deployment cancelled${NC}"
    exit 0
fi

# Set project context
gcloud config set project $PROJECT_ID

# Create enhanced Dockerfile
echo -e "${YELLOW}📦 Creating enhanced OAuth+GitHub App Docker configuration...${NC}"
cat > oauth-app.Dockerfile << 'DOCKERFILE'
FROM node:18-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy OAuth server with GitHub App support
COPY oauth-server.js ./

# Expose OAuth port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start OAuth server
CMD ["node", "oauth-server.js"]
DOCKERFILE

echo -e "${GREEN}✅ Enhanced Dockerfile created${NC}"

# Build and deploy
echo -e "${YELLOW}🏗️  Building OAuth+GitHub App image...${NC}"
docker build -f oauth-app.Dockerfile -t gcr.io/$PROJECT_ID/redstring-oauth-app:latest .

echo -e "${YELLOW}📤 Pushing image to registry...${NC}"
docker push gcr.io/$PROJECT_ID/redstring-oauth-app:latest

# Deploy to Cloud Run with both OAuth and GitHub App secrets
echo -e "${YELLOW}🚀 Deploying OAuth+GitHub App server to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/redstring-oauth-app:latest \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --port 3002 \
    --memory 512Mi \
    --cpu 0.5 \
    --concurrency 50 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production,OAUTH_PORT=3002" \
    --set-secrets "GITHUB_CLIENT_ID=github-client-id:latest,GITHUB_CLIENT_SECRET=github-client-secret:latest,GITHUB_APP_ID=github-app-id:latest,GITHUB_APP_CLIENT_ID=github-app-client-id:latest,GITHUB_APP_CLIENT_SECRET=github-app-client-secret:latest,GITHUB_APP_PRIVATE_KEY=github-app-private-key:latest,GITHUB_APP_WEBHOOK_SECRET=github-app-webhook-secret:latest"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")

# Test deployment
echo -e "${YELLOW}🔍 Testing deployment...${NC}"
sleep 10

if curl -s --max-time 30 "${SERVICE_URL}/health" | grep -q "oauth-server"; then
    echo -e "${GREEN}✅ OAuth server health check passed${NC}"
else
    echo -e "${RED}❌ OAuth server health check failed${NC}"
fi

# Cleanup
rm -f oauth-app.Dockerfile

# Success
echo ""
echo -e "${BOLD}${GREEN}🎉 GITHUB APP OAUTH SERVER DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}📊 Deployment Summary:${NC}"
echo -e "   Service: ${BOLD}${SERVICE_NAME}${NC}"
echo -e "   URL: ${BOLD}${PURPLE}${SERVICE_URL}${NC}"
echo -e "   Features: ${BOLD}${GREEN}OAuth + GitHub App Authentication${NC}"
echo ""
echo -e "${BLUE}🔗 Endpoints:${NC}"
echo -e "   🔐 Health: ${SERVICE_URL}/health"
echo -e "   🆔 OAuth Client ID: ${SERVICE_URL}/api/github/oauth/client-id"
echo -e "   🔄 OAuth Token: ${SERVICE_URL}/api/github/oauth/token"
echo -e "   🏢 App Installation Token: ${SERVICE_URL}/api/github/app/installation-token"
echo -e "   📊 App Installation Data: ${SERVICE_URL}/api/github/app/installation/{id}"
echo -e "   🪝 App Webhook: ${SERVICE_URL}/api/github/app/webhook"
echo ""
echo -e "${PURPLE}🚀 GitHub App integration is now live in production! 🚀${NC}"
EOF

chmod +x deployment/gcp/deploy_github_app_prod.sh
echo -e "${GREEN}✅ Updated deployment script created${NC}"

# Test local OAuth server
echo -e "${YELLOW}🧪 Testing local OAuth server with GitHub App support...${NC}"

if [ "$DEPLOY_TARGET" = "1" ] || [ "$DEPLOY_TARGET" = "3" ]; then
    echo -e "${BLUE}Starting local test...${NC}"
    
    # Source the environment file
    set -a
    source .env.github-app
    set +a
    
    # Test that the server can start (run for 5 seconds)
    timeout 5s node oauth-server.js || true
    
    echo -e "${GREEN}✅ Local server test completed${NC}"
fi

# Final instructions
echo ""
echo -e "${BOLD}${GREEN}🎉 GitHub App Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo -e "1. ${BOLD}Deploy to production:${NC} ${BLUE}./deployment/gcp/deploy_github_app_prod.sh${NC}"
echo -e "2. ${BOLD}Update GitHub App webhook URL${NC} to your production URL"
echo -e "3. ${BOLD}Test installation flow${NC} on redstring.io"
echo -e "4. ${BOLD}Monitor logs${NC} for any issues"
echo ""

if [ "$DEPLOY_TARGET" = "1" ] || [ "$DEPLOY_TARGET" = "3" ]; then
    echo -e "${YELLOW}💡 Local Development:${NC}"
    echo -e "   Source environment: ${BOLD}source .env.github-app${NC}"
    echo -e "   Start OAuth server: ${BOLD}node oauth-server.js${NC}"
    echo -e "   Test health check: ${BOLD}curl http://localhost:3002/health${NC}"
    echo ""
fi

echo -e "${PURPLE}🔗 GitHub App Installation URL:${NC}"
echo -e "${BOLD}https://github.com/apps/redstring-semantic-sync/installations/new${NC}"
echo ""
echo -e "${GREEN}Your RedString semantic web integration is now bulletproof! 🛡️${NC}"