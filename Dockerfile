# syntax=docker/dockerfile:1
# ==============================================================================
# Unified Single-Container Dockerfile for Google Cloud Run (ADR-005)
# Stage 1: Build Frontend (Vite + React 19 + Three.js + 3D VRM 1.0 Assets)
# Stage 2: Runtime Container (Python 3.12 + FastAPI Uvicorn + Nginx Reverse Proxy)
# ==============================================================================

# ── Stage 1: Frontend Builder ────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Unified Runtime (Python 3.12 + Nginx) ───────────────────────────
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080 \
    DATABASE_URL="sqlite+aiosqlite:////app/ai_interviewer.db" \
    GOOGLE_GENAI_USE_VERTEXAI="true" \
    GOOGLE_CLOUD_PROJECT="dev-nixon-daniel" \
    GOOGLE_CLOUD_LOCATION="us-central1"

# Install system dependencies: Nginx, gettext-base (for envsubst), and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    gettext-base \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python backend dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend application source
COPY backend/app /app/backend/app

# Copy deployment configurations & scripts
COPY nginx.conf.template /app/nginx.conf.template
COPY scripts /app/scripts

# Copy compiled frontend SPA from Stage 1 into Nginx web root
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

RUN chmod +x /app/scripts/docker-entrypoint.sh /app/scripts/seed_demo_session.py

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8080}/api/v1/health" || exit 1

CMD ["/app/scripts/docker-entrypoint.sh"]
