# Backend Dockerfile
# Using Node 18 (LTS) as it is the current stable version for this project
FROM node:18-alpine

WORKDIR /app

# Install dependencies in a separate layer so rebuilds are fast when only source changes.
# package*.json are copied first; npm ci installs exactly what package-lock.json specifies.
COPY package*.json ./
RUN npm ci

# Application source is copied after node_modules so dependency layer stays cached.
COPY . .

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000

# Entrypoint syncs node_modules on start (dev bind-mount + named volume) then runs nodemon.
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
