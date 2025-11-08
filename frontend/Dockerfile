# Frontend Dockerfile
# Use Node 20.19 which satisfies plugin engine requirements (@vitejs/plugin-react)
FROM node:20.19-bullseye

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Use `npm install` here to avoid build failures when package.json and
# package-lock.json are out of sync in development branches. For reproducible
# CI builds prefer `npm ci` after syncing the lockfile locally and committing it.
RUN npm install --no-audit --no-fund

# Copy application code
COPY . .

# Expose port (Vite default is 5173)
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

