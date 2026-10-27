# syntax=docker/dockerfile:1
# ==============================================================================
# Real-Time AI Interviewer Platform — Backend Dockerfile (Cloud Run & Compose Ready)
# ==============================================================================
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

# Install minimal system dependencies for asyncpg/network checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root user (DevSecOps Gate 4.3)
RUN groupadd --gid 10001 appgroup && \
    useradd --uid 10001 --gid appgroup --shell /sbin/nologin --create-home appuser

# Install Python dependencies first for layer caching
COPY requirements.txt ./
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy application source & tests
COPY --chown=appuser:appgroup app ./app
COPY --chown=appuser:appgroup tests ./tests
COPY --chown=appuser:appgroup pyproject.toml ./

# Ensure writable working directory for SQLite fallback if used
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/api/v1/health" || exit 1

# Run Uvicorn with uvloop + httptools for low-latency <15ms WebSocket audio relay
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --loop uvloop --http httptools --ws websockets --proxy-headers --forwarded-allow-ips='*'"]
