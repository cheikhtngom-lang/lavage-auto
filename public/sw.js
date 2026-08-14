// Service worker minimal : rend le site installable (PWA) et utilisable
// hors-ligne pour ce qui a déjà été visité. Stratégie volontairement simple
// pour ne jamais servir une vieille version bloquée après un déploiement :
//  - Pages (navigation HTML)      -> réseau d'abord, cache en secours (hors-ligne)
//  - Assets same-origin (JS/CSS/images, noms hashés par Vite) -> cache d'abord,
//    revalidés en arrière-plan (stale-while-revalidate)
//  - Tout le reste (autres origines : Firebase, polices, etc.) -> pas d'interception

const CACHE_NAME = 'ccg-shell-v1';
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {}) // best-effort, ne bloque pas l'installation si hors-ligne
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // laisse passer les autres origines

  // Navigation (chargement de page) : réseau d'abord, cache en secours si hors-ligne
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Assets statiques : cache d'abord, revalidation en arrière-plan
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
