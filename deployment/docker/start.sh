#!/bin/sh

# Startup script for RedString application
# Starts OAuth server in background, then main server

echo "🚀 Starting RedString application..."

# Start OAuth server in background
echo "🔐 Starting OAuth server on port 3002..."
node oauth-server.js &
OAUTH_PID=$!

# Wait a moment for OAuth server to start
sleep 3

# Check if OAuth server is running
if ! kill -0 $OAUTH_PID 2>/dev/null; then
    echo "❌ OAuth server failed to start"
    exit 1
fi

echo "✅ OAuth server started successfully (PID: $OAUTH_PID)"

# Start main server
echo "🌐 Starting app + semantic server on port 4000..."
node deployment/app-semantic-server.js
