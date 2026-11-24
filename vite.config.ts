import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> };

// GitHub Pages serves the site under /Video-game/; Vercel (VERCEL=1 at build time) serves from the root.
const base = process.env.VERCEL ? '/' : '/Video-game/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4600,
    rollupOptions: {
      output: {
        manualChunks: (id: string): string | undefined => {
          if (id.includes('rapier')) return 'rapier';
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('postprocessing')) return 'post';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173 },
});
