# syntax=docker/dockerfile:1
# ==============================================================================
# Real-Time AI Interviewer Platform — Frontend Multi-Stage Dockerfile
# Stage 1: Node 20 Alpine TypeScript + Vite Production Build
# Stage 2: Nginx 1.27 Alpine Static Asset Server + API/WebSocket Reverse Proxy
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Accept safe build-time Vite public variables (NEVER GEMINI_API_KEY)
ARG VITE_API_BASE_URL=""
ARG VITE_WS_BASE_URL=""
ARG VITE_USE_MOCK_SIMULATOR="false"

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_WS_BASE_URL=${VITE_WS_BASE_URL} \
    VITE_USE_MOCK_SIMULATOR=${VITE_USE_MOCK_SIMULATOR}

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src

RUN npm run build

# Stage 2: Nginx Alpine Runtime
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
