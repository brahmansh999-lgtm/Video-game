import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Video-game/',
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
