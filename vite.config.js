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
import { renderSiteFooter, renderContactModal, renderLegalNav } from './src/lib/siteFooter.js'

// Version affichée dans le footer : date du build (AAAA.MM.JJ) — elle change à
// chaque déploiement, donc ne ment jamais sur la fraîcheur du site.
const BUILD_VERSION = 'v' + new Date().toISOString().slice(0, 10).replace(/-/g, '.')

// Footer, fenêtre Contact et navigation légale : une seule source
// (src/lib/siteFooter.js) injectée dans chaque page HTML à la place des
// marqueurs <!--@site-footer-->, <!--@contact-modal--> et <!--@legal-nav-->.
// order 'pre' : le <script type="module"> injecté est ensuite traité (bundlé)
// par Vite comme s'il était écrit à la main dans la page.
function htmlPartials() {
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const slug = (ctx.path || '').replace(/^\//, '').replace(/\.html$/, '')
        return html
          .replace('<!--@site-footer-->', () => renderSiteFooter({ version: BUILD_VERSION }) + '\n' + renderContactModal())
          .replace('<!--@contact-modal-->', () => renderContactModal())
          .replace('<!--@legal-nav-->', () => renderLegalNav(slug))
      },
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), reactAppDevFallback(), htmlPartials(), removeConsole()],
  define: { __BUILD_VERSION__: JSON.stringify(BUILD_VERSION) },
  base: '/',           // URLs absolues pour le déploiement web
  publicDir: 'public', // Dossier des fichiers statiques (sitemap.xml, robots.txt)
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        login: resolve(__dirname, 'login.html'),
        resetPassword: resolve(__dirname, 'reset-password.html'),
        acceptInvitation: resolve(__dirname, 'accept-invitation.html'),
        // Pages autonomes : traitées par Vite (Tailwind compilé) au lieu d'être
        // copiées depuis public/ avec le CDN cdn.tailwindcss.com.
        notFound: resolve(__dirname, '404.html'),
        merci: resolve(__dirname, 'merci.html'),
        confidentialite: resolve(__dirname, 'confidentialite.html'),
        conditionsGenerales: resolve(__dirname, 'conditions-generales.html'),
        mentionsLegales: resolve(__dirname, 'mentions-legales.html'),
        reglement: resolve(__dirname, 'reglement.html'),
        accordTraitement: resolve(__dirname, 'accord-traitement-donnees.html'),
        paiementSucces: resolve(__dirname, 'paiement-succes.html'),
        paiementAnnule: resolve(__dirname, 'paiement-annule.html'),
      }
    }
  }
})
