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
    // The dev URL is documented as http://localhost:5173 everywhere
    // (README, scripts/dev-all.ps1). If another project occupies the port,
    // fail loudly instead of silently serving from :5174+ — a silent bump
    // means the muscle-memory URL shows a different app and looks like
    // "dev is broken".
    strictPort: true,
    proxy: {
      '/api': {
        target: devApiTarget,
        changeOrigin: true,
      },
    },
  },
});
