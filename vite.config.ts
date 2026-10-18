import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5376,
    proxy: {
      // Keep the browser's Host so share and invite links point at the app, not at :8080.
      '/api': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
});
