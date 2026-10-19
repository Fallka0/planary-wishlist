import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5376,
    proxy: {
      // The Worker (`npm run api:dev`). Keep the browser's Host so share and invite links point at the app.
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  // The Worker has its own tests, which run inside the Workers runtime (worker/vitest.config.ts).
  test: { include: ['src/**/*.test.{ts,tsx}'] },
});
