import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const httpProxyTarget = env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8010';
  const wsProxyTarget = httpProxyTarget.replace(/^http/, 'ws');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: httpProxyTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: wsProxyTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    },
  };
});
