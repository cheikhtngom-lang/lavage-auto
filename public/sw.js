// Service worker minimal : rend le site installable (PWA) et utilisable
// hors-ligne pour ce qui a déjà été visité. Stratégie volontairement simple
// pour ne jamais servir une vieille version bloquée après un déploiement :
//  - Pages (navigation HTML)      -> réseau d'abord, cache en secours (hors-ligne)
//  - Assets Vite (/assets/, noms hashés, immuables) -> cache d'abord
//  - Icônes et images             -> cache d'abord, revalidées en arrière-plan
//  - Tout le reste (API, vidéos, autres origines : Supabase, polices…) -> pas d'interception
//
// v2 : ne touche plus aux vidéos (Safari iOS exige des réponses partielles 206
// et refusait la vidéo servie en entier depuis le cache), ni à /api (données
// toujours fraîches) ; cache borné, purgé à chaque nouvelle version.

const CACHE_NAME = 'ccg-shell-v2';
const MAX_ENTRIES = 120;
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

// Garde le cache sous MAX_ENTRIES (les plus anciennes entrées partent d'abord)
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

function store(req, res) {
  if (!res || res.status !== 200 || res.type !== 'basic') return;
  const copy = res.clone();
  caches.open(CACHE_NAME)
    .then((cache) => cache.put(req, copy).then(() => trim(cache)))
    .catch(() => {}); // quota plein (iOS) : on continue sans cache
}

// Safari refuse une page servie par le service worker si la réponse a suivi une redirection
function clean(res) {
  if (!res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // laisse passer les autres origines
  if (url.pathname.startsWith('/api/')) return; // données : toujours le réseau
  if (req.headers.has('range') || req.destination === 'video' || req.destination === 'audio' || url.pathname.startsWith('/videos/')) return;

  // Navigation (chargement de page) : réseau d'abord, cache en secours si hors-ligne
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          store(req, res);
          return clean(res);
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  const immutable = url.pathname.startsWith('/assets/');
  const media = url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/') || url.pathname === '/manifest.webmanifest';
  if (!immutable && !media) return; // scripts non hashés (register-sw, cookie-consent…) : le réseau décide
  if (url.pathname.endsWith('.wasm')) return; // module photo de 14 Mo : pas dans le cache du service worker

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached && immutable) return cached;
      const network = fetch(req)
        .then((res) => { store(req, res); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
