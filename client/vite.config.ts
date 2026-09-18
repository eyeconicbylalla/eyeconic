import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: same-origin /api → the website server (default :5000), so the
// student session cookie works identically in dev and production.
const devApiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api': {
        target: devApiTarget,
        changeOrigin: true,
      },
    },
  },
});
