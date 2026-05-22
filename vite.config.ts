import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  base: '/sweatervision/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') }
  },
  define: {
    'process.env.PACKAGE_VERSION': JSON.stringify(process.env.npm_package_version)
  }
});
