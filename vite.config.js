import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Chemins gérés par l'app React (dashboard.html) — voir public/_redirects.
// En dev, Vite ne lit pas _redirects : ce plugin reproduit la même règle
// pour qu'un accès direct/rafraîchissement sur /admin/queue, /superadmin, etc.
// serve bien dashboard.html au lieu de retomber sur index.html (page vitrine statique).
const REACT_APP_PATHS = [/^\/admin(\/|$)/, /^\/superadmin(\/|$)/, /^\/stations(\/|$)/, /^\/dashboard(\/|$)/];

function reactAppDevFallback() {
  return {
    name: 'react-app-dev-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url && REACT_APP_PATHS.some((re) => re.test(url))) {
          req.url = '/dashboard.html';
        }
        next();
      });
    },
  };
}

import removeConsole from 'vite-plugin-remove-console'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), reactAppDevFallback(), removeConsole()],
  base: '/',           // URLs absolues pour le déploiement web
  publicDir: 'public', // Dossier des fichiers statiques (sitemap.xml, robots.txt)
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        login: resolve(__dirname, 'login.html'),
        resetPassword: resolve(__dirname, 'reset-password.html'),
      }
    }
  }
})
