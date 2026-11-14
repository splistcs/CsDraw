import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob: csdraw-media:",
  "media-src 'self' blob: csdraw-media:",
  "connect-src 'self' csdraw-media:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

const productionCsp = {
  name: 'csdraw-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
};

export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [react(), productionCsp],
  server: { port: 5173, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true }
});
