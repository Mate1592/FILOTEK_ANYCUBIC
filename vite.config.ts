import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** En desarrollo, el preámbulo de HMR usa scripts inline: quitamos la CSP solo en `serve`. */
const devCsp = (): Plugin => ({
  name: 'filoteca-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, ''),
});

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), devCsp()],
  server: { port: 5199, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome120', chunkSizeWarningLimit: 1500 },
});
