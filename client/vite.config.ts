import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Repo-root .env plus the process environment. PORT is the port users open (Vite's, in development);
  // API_PORT is where the Node server listens behind the proxy. See server/src/config.ts.
  const env = loadEnv(mode, '..', '');
  const target = `http://127.0.0.1:${env.API_PORT || 3000}`;

  return {
    plugins: [react()],
    server: {
      port: Number(env.PORT) || 5173,
      strictPort: true,
      // Everything goes through the Vite origin, so the browser never makes cross-origin requests.
      proxy: {
        '/api': target,
        '/health': target,
        '/socket.io': { target, ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
