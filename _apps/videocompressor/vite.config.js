import { defineConfig } from 'vite';
export default defineConfig({ base: './', optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] }, worker: { format: 'es' } });
