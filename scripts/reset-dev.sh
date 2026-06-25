#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Stopping all ZANA containers..."
docker compose down

echo "==> Removing stale node_modules volumes..."
docker volume rm -f empty_backend_node_modules 2>/dev/null || true
docker volume rm -f empty_frontend_node_modules 2>/dev/null || true
docker volume rm -f zana_backend_node_modules 2>/dev/null || true
docker volume rm -f zana_frontend_node_modules 2>/dev/null || true

# Remove anonymous node_modules volumes left from older compose files
docker volume ls -q | while read -r vol; do
  mount="$(docker volume inspect "$vol" --format '{{json .Mountpoint}}' 2>/dev/null || echo '')"
  if echo "$mount" | grep -q node_modules; then
    docker volume rm -f "$vol" 2>/dev/null || true
  fi
done

echo "==> Rebuilding images..."
docker compose build --no-cache backend frontend

echo "==> Starting services..."
docker compose up -d

echo "==> Waiting for backend dependency check..."
for i in $(seq 1 30); do
  if docker compose exec -T backend node scripts/check-dependencies.js >/dev/null 2>&1; then
    echo "Backend dependencies OK"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Backend dependency check timed out" >&2
    docker compose logs backend --tail 50
    exit 1
  fi
  sleep 4
done

echo "==> Verifying backend health endpoint..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/system/health >/dev/null; then
    echo "Backend health check passed"
    exit 0
  fi
  sleep 4
done

echo "Backend health check timed out" >&2
docker compose logs backend --tail 50
exit 1
