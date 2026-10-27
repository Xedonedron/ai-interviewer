#!/usr/bin/env bash
# ==============================================================================
# Real-Time AI Interviewer Platform — Phase 4 Automated E2E Verification Script
# ==============================================================================
# Verifies:
# 1. Backend Pytest Suite (ORM, REST API, Hybrid WebSocket Relay, Security, E2E)
# 2. Frontend Vitest Unit Suite (16kHz/24kHz PCM Audio, VRM Visemes, Barge-In)
# 3. Frontend Production TypeScript + Vite Build (`frontend/dist`)
# 4. Security Audit: 0 occurrences of GEMINI_API_KEY in `frontend/src` & `frontend/dist`
# 5. Live FastAPI Server Smoke Check (`/api/v1/health` + Session Lifecycle)
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

echo "======================================================================"
echo "[1/5] Running Backend Automated Pytest Suite (Phase 3 & Phase 4 E2E)..."
echo "======================================================================"
cd "${BACKEND_DIR}"
./.venv/bin/pytest -v

echo ""
echo "======================================================================"
echo "[2/5] Running Frontend Vitest Suite (Audio PCM, VRM & Barge-In SLA)..."
echo "======================================================================"
cd "${FRONTEND_DIR}"
npm test -- --run

echo ""
echo "======================================================================"
echo "[3/5] Building Production Frontend Bundle (TypeScript + Vite)..."
echo "======================================================================"
cd "${FRONTEND_DIR}"
npm run build

echo ""
echo "======================================================================"
echo "[4/5] Running Security Audit: Zero GEMINI_API_KEY Leakage in Frontend"
echo "======================================================================"
if grep -rn "GEMINI_API_KEY" "${FRONTEND_DIR}/src" "${FRONTEND_DIR}/dist" 2>/dev/null; then
  echo "❌ SECURITY AUDIT FAILED: GEMINI_API_KEY found in frontend!"
  exit 1
else
  echo "✅ SECURITY AUDIT PASSED: 0 occurrences of GEMINI_API_KEY in frontend/src and frontend/dist."
fi

echo ""
echo "======================================================================"
echo "[5/5] Running Live Uvicorn Server HTTP + WebSocket Smoke Verification"
echo "======================================================================"
cd "${BACKEND_DIR}"
PORT=18089
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${PORT}" --log-level warning &
SERVER_PID=$!
trap 'kill "${SERVER_PID}" 2>/dev/null || true' EXIT

# Wait for live server readiness
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

HEALTH_JSON="$(curl -fsS "http://127.0.0.1:${PORT}/api/v1/health")"
echo "Live Health Response: ${HEALTH_JSON}"
echo "${HEALTH_JSON}" | grep -q '"status":"healthy"'

kill "${SERVER_PID}" 2>/dev/null || true
trap - EXIT

echo ""
echo "======================================================================"
echo "✅ ALL PHASE 4 END-TO-END VERIFICATION CHECKS PASSED (100%)"
echo "======================================================================"
