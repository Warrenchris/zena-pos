# Docker Quick Start Guide

## 🚀 Quick Start

### Option 1: Using Makefile (Recommended)

```bash
# Start all services
make dev-up

# View logs
make dev-logs

# Stop services
make dev-down
```

### Option 2: Using npm

```bash
# Start all services
npm run dev:all

# View logs
npm run dev:logs

# Stop services
npm run dev:down
```

### Option 3: Using Docker Compose

```bash
# Start all services
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 📋 Prerequisites

1. **Docker Desktop** installed and running
2. **Environment variables** configured:
   - `backend/.env` - Backend configuration
   - `ai_service/.env` - AI service configuration

## 🔧 Using Existing MySQL Container

If you already have MySQL running (like `zana-mysql`), you can use it instead of the Docker Compose MySQL:

1. **Create `docker-compose.override.yml`**:
```yaml
version: '3.8'

services:
  mysql:
    profiles: ["disabled"]  # Disable Docker Compose MySQL

  backend:
    environment:
      - DB_HOST=host.docker.internal
      - DB_PORT=3307
```

2. **Update `backend/.env`**:
```env
DB_HOST=host.docker.internal
DB_PORT=3307
```

3. **Start services** (MySQL service will be skipped):
```bash
make dev-up
```

## 🌐 Service URLs

- **Backend**: http://localhost:3000
- **Frontend**: http://localhost:5173
- **AI Service**: http://localhost:8000
- **MySQL**: localhost:3307

## 📚 More Information

See [DOCKER_SETUP.md](./DOCKER_SETUP.md) for detailed documentation.

