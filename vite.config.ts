import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL?.replace(/\/+$/, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@contracts': fileURLToPath(new URL('./packages/contracts/index.ts', import.meta.url)),
      },
    },
    server: supabaseUrl
      ? {
        proxy: {
          '/supabase': {
            target: supabaseUrl,
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/supabase/, ''),
          },
        },
      }
      : undefined,
  };
});
