import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// clientID botla aynı uygulamadan gelir; yalnız bu herkese açık değer
// istemciye gömülür, token/clientSecret asla.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../app', 'clientID');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': '/src' } },
    define: {
      __CLIENT_ID__: JSON.stringify(env.clientID ?? ''),
    },
    server: {
      port: 5173,
      // Yalnız yerel önizleme: /api'yi önizleme API'sine (veritabanı kopyası) yönlendirir.
      proxy: { '/api': 'http://127.0.0.1:3091' },
    },
    build: { chunkSizeWarningLimit: 900 },
  };
});
