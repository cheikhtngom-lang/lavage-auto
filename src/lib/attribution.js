// Provenance du visiteur en cours (Super Admin > Affiliés) : d'où il est
// arrivé (réseau social, recherche, lien d'affilié…) et envoi des événements
// à record_site_event() (add_affiliates_tracking.sql).
//
// Deux notions :
//   - l'ARRIVÉE de la session (classifyLanding) : compte une visite, une seule
//     fois par onglet ;
//   - la PROVENANCE retenue pour un contact (message, clic WhatsApp / appel,
//     inscription) : la dernière arrivée qui n'était pas un accès direct. Elle
//     n'est gardée 30 jours (localStorage) que si le visiteur a accepté la
//     mesure d'audience (bannière cookies, clé ccg_cookie_consent) ; sinon elle
//     ne dure que le temps de l'onglet (sessionStorage).
// Aucune donnée personnelle ici : identifiant d'onglet aléatoire, source,
// campagne, page d'arrivée. Pour compter les visiteurs UNIQUES, un identifiant
// de visiteur tiré au hasard (ccg_visitor_id, sans lien avec l'identité) est
// gardé dans le navigateur, uniquement avec l'accord de mesure d'audience ;
// sans accord, le serveur compte le même visiteur une fois par jour.
//
// Sans dépendance lourde (pas de client Supabase : simple fetch) — chargé par
// la page d'accueil via src/visit-tracker.js.
import { classifyLanding, deviceOf } from './trafficSources.js';

const KEY = 'ccg_attribution';
const SID_KEY = 'ccg_visit_sid';
const VISIT_KEY = 'ccg_visit_sent';
const VISITOR_KEY = 'ccg_visitor_id';
const TTL_MS = 30 * 86400000;
const OWN_HOSTS = ['galsenautocleaner.com'];
const APP_PATHS = /^\/(admin|superadmin|dashboard|groupe)(\/|$)/;
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp\//i;

const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

const consentGranted = () => {
  try { return localStorage.getItem('ccg_cookie_consent') === 'granted'; } catch { return false; }
};

function readJson(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) || 'null');
    return v && typeof v === 'object' && v.source ? v : null;
  } catch { return null; }
}

function save(attribution) {
  const value = JSON.stringify({ ...attribution, at: Date.now() });
  try { sessionStorage.setItem(KEY, value); } catch { /* stockage indisponible */ }
  try {
    if (consentGranted()) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch { /* navigation privée */ }
}

// Provenance retenue pour un contact (null : rien de connu).
export function currentAttribution() {
  const inTab = (() => { try { return readJson(sessionStorage); } catch { return null; } })();
  if (inTab) return inTab;
  if (!consentGranted()) return null;
  try {
    const kept = readJson(localStorage);
    if (kept && Date.now() - (kept.at || 0) < TTL_MS) return kept;
    localStorage.removeItem(KEY);
  } catch { /* navigation privée */ }
  return null;
}

export function sessionId() {
  try {
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = randomId();
      sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
  }
}

// Identifiant de visiteur anonyme (null sans accord de mesure d'audience :
// l'éventuel identifiant gardé est alors effacé).
export function visitorId() {
  try {
    if (!consentGranted()) { localStorage.removeItem(VISITOR_KEY); return null; }
    let id = localStorage.getItem(VISITOR_KEY);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id || '')) {
      id = randomId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch { return null; }
}

// À appeler à chaque chargement de page publique : renvoie l'arrivée de cette
// page (null pour une navigation interne au site) et met à jour la provenance.
export function captureLanding() {
  const landing = classifyLanding({
    search: location.search,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    pathname: location.pathname,
    ownHosts: [location.hostname, ...OWN_HOSTS],
  });
  if (landing && (landing.source !== 'direct' || landing.ref || landing.campaign || !currentAttribution())) save(landing);
  else if (!consentGranted()) { try { localStorage.removeItem(KEY); } catch { /* rien */ } }
  return landing;
}

// Robots, préproduction locale : rien n'est enregistré (en local, poser
// localStorage.ccg_track_dev = '1' pour tester l'envoi).
export function canRecord() {
  try {
    if (navigator.webdriver || BOT_UA.test(navigator.userAgent)) return false;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    return !local || localStorage.getItem('ccg_track_dev') === '1';
  } catch { return false; }
}

// Visiteur à compter : ni compte connecté (station, client, Super Admin), ni
// page de l'application.
export function isTrackable() {
  if (!canRecord()) return false;
  try {
    if (sessionStorage.getItem('userRole') || localStorage.getItem('userRole')) return false;
  } catch { /* stockage indisponible : on compte */ }
  return !APP_PATHS.test(location.pathname);
}

export function visitAlreadySent() {
  try { return sessionStorage.getItem(VISIT_KEY) === '1'; } catch { return false; }
}
export function markVisitSent() {
  try { sessionStorage.setItem(VISIT_KEY, '1'); } catch { /* rien */ }
}

// Paramètres de record_site_event() pour un événement (`from` : arrivée ou
// provenance à utiliser, sinon la provenance retenue).
export function siteEventArgs(kind, from) {
  const a = from || currentAttribution() || { source: 'direct' };
  return {
    p_kind: kind,
    p_session: sessionId(),
    p_source: a.source || 'direct',
    p_medium: a.medium || null,
    p_campaign: a.campaign || null,
    p_ref: a.ref || null,
    p_referrer_host: a.referrerHost || null,
    p_landing_path: a.landingPath || null,
    p_device: deviceOf(navigator.userAgent, window.innerWidth),
    p_visitor: visitorId(),
  };
}

// Base pas encore à jour (add_influencers_facebook_ads.sql non exécuté) :
// record_site_event() sans p_visitor. Renvoie les paramètres à réessayer, sinon null.
function argsWithoutVisitor(args, status) {
  return (status === 404 || status === 300) && args.p_visitor ? { ...args, p_visitor: undefined } : null;
}

// Envoi anonyme (clé publique), sans attendre la réponse : ne bloque jamais la page.
export function sendSiteEvent(kind, from) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const post = (args) => fetch(`${url}/rest/v1/rpc/record_site_event`, {
    method: 'POST',
    keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  try {
    const args = siteEventArgs(kind, from);
    post(args).then((res) => {
      const retry = argsWithoutVisitor(args, res.status);
      if (retry) return post(retry);
      return null;
    }).catch(() => {});
  } catch { /* rien */ }
}

// Provenance jointe à un message du formulaire Contact (Edge Function
// send-contact-message).
export function messageAttribution() {
  const a = currentAttribution();
  if (!a) return null;
  return {
    source: a.source, medium: a.medium || null, campaign: a.campaign || null, ref: a.ref || null,
    referrer_host: a.referrerHost || null, landing_path: a.landingPath || null,
  };
}
