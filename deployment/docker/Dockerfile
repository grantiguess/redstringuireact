FROM node:18-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source files
COPY . .

# Build the React app
RUN npm run build

# Expose ports
EXPOSE 4000 3002

# Simple startup command
CMD ["sh", "-c", "node oauth-server.js & node deployment/server.js & wait"]