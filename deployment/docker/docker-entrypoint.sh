#!/bin/sh

echo "🚀 Starting RedString UI React..."

# Start OAuth server in background
echo "🔐 Starting OAuth server..."
node oauth-server.js &

# Start main server
echo "🌐 Starting main server..."
node deployment/server.js