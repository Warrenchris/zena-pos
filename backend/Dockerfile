# Backend Dockerfile
# Using Node 18 (LTS) as it is the current stable version for this project
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Use nodemon for development (hot reload)
CMD ["npm", "run", "dev"]

