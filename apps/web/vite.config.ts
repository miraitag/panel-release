/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Lee el .env de la raíz del monorepo (solo variables VITE_* llegan al navegador).
  const env = loadEnv(mode, '../../', '');
  const apiTarget = `http://${env.HOST ?? '127.0.0.1'}:${env.PORT ?? '4310'}`;
  return {
    envDir: '../../',
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      // El navegador nunca ve tokens: todo pasa por el backend.
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    test: { environment: 'jsdom', globals: false },
  };
});
