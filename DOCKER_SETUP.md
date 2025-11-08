# Docker Development Environment Setup

## Overview

This project uses Docker Compose to orchestrate all development services:
- **Backend** (Node.js/Express) - Port 3000
- **Frontend** (React/Vite) - Port 5173
- **AI Service** (Python/FastAPI) - Port 8000
- **MySQL** (Database) - Port 3307

## Quick Start

### Using Makefile (Recommended)

```bash
# Start all services
make dev-up

# View logs
make dev-logs

# Stop all services
make dev-down

# See all available commands
make help
```

### Using npm scripts

```bash
# Start all services
npm run dev:all

# View logs
npm run dev:logs

# Stop all services
npm run dev:down
```

### Using Docker Compose directly

```bash
# Start all services
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Prerequisites

1. **Docker Desktop** installed and running
2. **Environment variables** configured (see below)

## Environment Configuration

### Backend (`backend/.env`)

```env
# Database Configuration
DB_NAME=zana_pos
DB_USER=root
DB_PASS=
DB_HOST=mysql  # Use 'mysql' for Docker, 'host.docker.internal' for external MySQL
DB_PORT=3306   # Use 3306 for Docker MySQL, 3307 for external MySQL

# JWT Configuration
# NOTE: This project has migrated to RS256 (asymmetric) tokens.
# The backend signs tokens with a private key and services validate with the public key.
# Place your private key at `backend/jwt_private_key.pem` and the public key at `ai_service/jwt_public_key.pem`.
# If you prefer HS256, you can set JWT_SECRET instead, but RS256 is recommended.
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=3000
NODE_ENV=development

# AI Service Configuration
AI_SERVICE_URL=http://ai_service:8000  # Use service name in Docker

# Permission Cache
PERMISSION_CACHE_TTL=3600000
```

### AI Service (`ai_service/.env`)

```env
# JWT Configuration (AI service verifies RS256 tokens signed by backend)
# Ensure the public key `jwt_public_key.pem` is present in the `ai_service` folder.
JWT_ALGORITHM=RS256
JWT_PUBLIC_KEY_PATH=./jwt_public_key.pem
```

### Frontend

Frontend uses Vite environment variables. Create `frontend/.env` if needed:

```env
VITE_API_URL=http://localhost:3000
```

## Using Existing MySQL Container

If you already have MySQL running in Docker (as shown in your Docker Desktop), you have two options:

### Option 1: Use External MySQL (Recommended)

1. Create `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  mysql:
    profiles: ["disabled"]  # Disable the MySQL service

  backend:
    environment:
      - DB_HOST=host.docker.internal
      - DB_PORT=3307
```

2. Update `backend/.env`:
```env
DB_HOST=host.docker.internal
DB_PORT=3307
```

3. Start services (MySQL will be skipped):
```bash
make dev-up
```

### Option 2: Use Existing Container Network

If your existing MySQL container is on a Docker network, you can connect to it by:
1. Finding the network: `docker inspect zana-mysql | grep NetworkMode`
2. Adding your services to that network in `docker-compose.yml`

## Service URLs

Once started, services are available at:

- **Backend API**: http://localhost:3000
- **Frontend**: http://localhost:5173
- **AI Service**: http://localhost:8000
- **MySQL**: localhost:3307

## Common Commands

### View Logs

```bash
# All services
make dev-logs

# Individual services
make backend-logs
make frontend-logs
make ai-logs
make mysql-logs
```

### Access Container Shells

```bash
# Backend shell
make backend-shell

# Frontend shell
make frontend-shell

# AI service shell
make ai-shell

# MySQL shell
make mysql-shell
```

### Health Checks

```bash
# Check all services
make health

# Or use npm
npm run health
```

### Database Operations

```bash
# Run migrations
make db-migrate

# Seed database
make db-seed
```

## Troubleshooting

### Port Already in Use

If a port is already in use, you can:

1. **Change port in docker-compose.yml**:
```yaml
services:
  backend:
    ports:
      - "3001:3000"  # Change host port
```

2. **Stop the conflicting service**:
```bash
# Find what's using the port
netstat -ano | findstr :3000

# Stop the process or service
```

### Services Can't Connect

1. **Check network**: Ensure all services are on the same Docker network
2. **Check service names**: Use service names (e.g., `mysql`, `backend`) not `localhost` in Docker
3. **Check environment variables**: Ensure `DB_HOST` and `AI_SERVICE_URL` use service names

### Database Connection Issues

1. **If using external MySQL**: Ensure `DB_HOST=host.docker.internal` and correct port
2. **If using Docker MySQL**: Ensure `DB_HOST=mysql` and `DB_PORT=3306`
3. **Check MySQL is healthy**: `docker-compose ps` should show MySQL as healthy

### Hot Reload Not Working

1. **Check volumes**: Ensure volumes are mounted correctly in `docker-compose.yml`
2. **Check file permissions**: Ensure Docker has access to your project files
3. **Restart services**: `make dev-restart`

## Development Workflow

1. **Start services**: `make dev-up`
2. **Make code changes**: Edit files in your IDE
3. **View changes**: Services auto-reload (hot reload enabled)
4. **View logs**: `make dev-logs` to see what's happening
5. **Stop services**: `make dev-down` when done

## Production Considerations

For production:

1. **Remove `--reload` flags** from Dockerfiles
2. **Use production builds** (e.g., `npm run build` for frontend)
3. **Set proper environment variables**
4. **Use secrets management** (not `.env` files)
5. **Enable proper logging** and monitoring
6. **Use production database** (not development MySQL)

## Cleanup

```bash
# Stop and remove containers
make dev-down

# Remove everything including volumes and images
make dev-clean
```

**Warning**: `dev-clean` will remove all data including the MySQL database!

## Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Makefile Commands](#makefile-commands) - See Makefile for all available commands
- [Environment Variables](#environment-configuration) - See above for required env vars

