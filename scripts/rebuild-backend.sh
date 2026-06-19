#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Stopping backend..."
docker compose stop backend

echo "==> Removing backend node_modules volume..."
docker volume rm -f empty_backend_node_modules 2>/dev/null || true
docker volume rm -f zana_backend_node_modules 2>/dev/null || true

echo "==> Rebuilding backend image..."
docker compose build --no-cache backend

echo "==> Starting backend..."
docker compose up -d backend

echo "==> Verifying dependencies in container..."
for i in $(seq 1 30); do
  if docker compose exec -T backend node scripts/check-dependencies.js; then
    echo "Dependency verification passed"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Dependency verification failed" >&2
    docker compose logs backend --tail 50
    exit 1
  fi
  sleep 4
done

echo "==> Checking backend health..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/system/health >/dev/null; then
    echo "Backend is healthy"
    exit 0
  fi
  sleep 4
done

echo "Backend health check failed" >&2
docker compose logs backend --tail 50
exit 1
