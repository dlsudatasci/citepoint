import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dashboard/dist', 
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/dashboard/main.jsx', 
      output: {
        entryFileNames: 'dashboard.bundle.js',
        assetFileNames: 'dashboard.bundle.css',
        chunkFileNames: '[name].js'
      }
    }
  }
});