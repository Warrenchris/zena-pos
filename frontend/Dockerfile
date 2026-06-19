# Frontend Dockerfile
# Using Node 20.19 which satisfies plugin engine requirements (@vitejs/plugin-react)
FROM node:20.19-bullseye

WORKDIR /app

# Copy lockfiles first — Docker caches this layer until dependencies change.
COPY package*.json ./
RUN npm ci

# Source code after dependencies so npm ci layer is reused across code-only edits.
COPY . .

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 5173

# Entrypoint syncs node_modules on start (dev bind-mount + named volume) then runs Vite.
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
