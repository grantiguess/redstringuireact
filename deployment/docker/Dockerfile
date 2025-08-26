FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built frontend (already built in Cloud Build)
COPY dist ./dist

# Copy server files
COPY deployment/server.js ./
COPY oauth-server.js ./

# Copy startup script
COPY deployment/docker/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose ports
EXPOSE 4000 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["./docker-entrypoint.sh"]