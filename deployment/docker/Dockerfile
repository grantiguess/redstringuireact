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

# Copy and use startup script
COPY deployment/docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Use startup script
CMD ["/app/start.sh"]