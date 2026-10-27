#!/usr/bin/env bash
# ==============================================================================
# Unified Cloud Run Container Entrypoint (`scripts/docker-entrypoint.sh`)
# Starts Uvicorn backend on 127.0.0.1:8000, seeds initial session, and runs Nginx on $PORT
# ==============================================================================

set -euo pipefail

PORT="${PORT:-8080}"
echo "[entrypoint] Initializing Unified AI Interviewer container on port ${PORT}..."

# 1. Substitute dynamic Cloud Run $PORT into Nginx configuration
rm -f /etc/nginx/sites-enabled/default || true
envsubst '${PORT}' < /app/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "[entrypoint] Nginx configured to listen on port ${PORT}."

# 2. Start Uvicorn FastAPI backend on 127.0.0.1:8000
echo "[entrypoint] Starting FastAPI backend on 127.0.0.1:8000..."
(
    cd /app/backend
    exec uvicorn app.main:app --host 127.0.0.1 --port 8000 --loop uvloop --http httptools --ws websockets --workers 1
) &
BACKEND_PID=$!

# Trap signals for graceful shutdown
cleanup() {
    echo "[entrypoint] Caught signal, shutting down gracefully..."
    kill -TERM "$BACKEND_PID" 2>/dev/null || true
    nginx -s quit 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# 3. Wait for FastAPI health check to be ready
echo "[entrypoint] Polling FastAPI healthcheck at http://127.0.0.1:8000/api/v1/health..."
MAX_RETRIES=30
for i in $(seq 1 "$MAX_RETRIES"); do
    if curl -fsS http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
        echo "[entrypoint] FastAPI backend is ready and database is connected!"
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "[entrypoint] ERROR: FastAPI process terminated unexpectedly." >&2
        exit 1
    fi
    sleep 0.5
done

# 4. Automatically seed template candidate session if DB is freshly created
echo "[entrypoint] Running session seeder..."
python3 /app/scripts/seed_demo_session.py || echo "[entrypoint] Seeder completed with warnings."

# 5. Start Nginx in foreground
echo "[entrypoint] Starting Nginx in foreground on port ${PORT}..."
exec nginx -g "daemon off;"
