// Provenance des visiteurs (Super Admin > Affiliés) : catalogue des sources et
// règles de reconnaissance, partagés par le site public (src/visit-tracker.js,
// lib/attribution.js) et la page Super Admin (pages/SuperAdmin/Affiliates.jsx).
//
// Fichier sans dépendance (ni React, ni Supabase) : chargé sur la page
// d'accueil, il doit rester léger.
//
// Les clés de SOURCES doivent rester identiques à celles acceptées par
// record_site_event() (add_affiliates_tracking.sql) et par l'Edge Function
// send-contact-message (SOURCES).

export const SOURCES = [
  { key: 'facebook', label: 'Facebook', color: '#3b82f6', social: true },
  { key: 'instagram', label: 'Instagram', color: '#ec4899', social: true },
  { key: 'tiktok', label: 'TikTok', color: '#06b6d4', social: true },
  { key: 'whatsapp', label: 'WhatsApp', color: '#22c55e', social: true },
  { key: 'linkedin', label: 'LinkedIn', color: '#6366f1', social: true },
  { key: 'youtube', label: 'YouTube', color: '#ef4444', social: true },
  { key: 'x', label: 'X (Twitter)', color: '#a3a3a3', social: true },
  { key: 'snapchat', label: 'Snapchat', color: '#facc15', social: true },
  { key: 'telegram', label: 'Telegram', color: '#38bdf8', social: true },
  { key: 'google', label: 'Google', color: '#f59e0b' },
  { key: 'recherche', label: 'Autres moteurs de recherche', color: '#fb923c' },
  { key: 'site', label: 'Autres sites', color: '#a855f7' },
  { key: 'direct', label: 'Accès direct', color: '#64748b' },
  { key: 'autre', label: 'Autre / campagne', color: '#78716c' },
];

const BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s]));
// Source vide en base : message reçu avant la mise en place du suivi, ou
// navigateur qui bloque le stockage.
const UNKNOWN = { key: 'inconnu', label: 'Non renseignée', color: '#525252' };

export const sourceInfo = (key) => BY_KEY[key] || (key ? BY_KEY.autre : UNKNOWN);
export const isSourceKey = (key) => Object.prototype.hasOwnProperty.call(BY_KEY, key);

// Réseaux proposés pour un lien de suivi ou un affilié.
export const LINK_NETWORKS = SOURCES.filter((s) => s.social || s.key === 'site' || s.key === 'autre');

// Valeurs libres de ?utm_source= / ?src= → clé du catalogue.
const ALIASES = {
  fb: 'facebook', facebook: 'facebook', meta: 'facebook', messenger: 'facebook',
  ig: 'instagram', insta: 'instagram', instagram: 'instagram',
  tt: 'tiktok', tiktok: 'tiktok',
  wa: 'whatsapp', whatsapp: 'whatsapp', 'whatsapp-status': 'whatsapp',
  li: 'linkedin', linkedin: 'linkedin',
  yt: 'youtube', youtube: 'youtube',
  x: 'x', twitter: 'x',
  snap: 'snapchat', snapchat: 'snapchat',
  tg: 'telegram', telegram: 'telegram',
  google: 'google', gmb: 'google', 'google-maps': 'google',
  bing: 'recherche', yahoo: 'recherche', duckduckgo: 'recherche',
};

export function normalizeSourceParam(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  return ALIASES[v] || (isSourceKey(v) ? v : 'autre');
}

// Domaine du site précédent → source. Les sous-domaines comptent
// (l.facebook.com, m.youtube.com…).
const HOSTS = [
  ['facebook', ['facebook.com', 'fb.com', 'fb.me', 'messenger.com']],
  ['instagram', ['instagram.com']],
  ['tiktok', ['tiktok.com']],
  ['whatsapp', ['whatsapp.com', 'wa.me']],
  ['linkedin', ['linkedin.com', 'lnkd.in']],
  ['youtube', ['youtube.com', 'youtu.be']],
  ['x', ['t.co', 'twitter.com', 'x.com']],
  ['snapchat', ['snapchat.com']],
  ['telegram', ['t.me', 'telegram.org', 'telegram.me']],
  ['recherche', ['bing.com', 'yahoo.com', 'duckduckgo.com', 'ecosia.org', 'qwant.com', 'yandex.com', 'brave.com']],
];
const matchesHost = (host, domain) => host === domain || host.endsWith(`.${domain}`);

export function sourceFromHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!h) return null;
  // google.com, google.sn, google.co.uk… (mais pas les sites Google hors recherche).
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'google';
  for (const [key, domains] of HOSTS) {
    if (domains.some((d) => matchesHost(h, d))) return key;
  }
  return 'site';
}

// Navigateur intégré d'une appli (le site a été ouvert depuis l'appli, qui
// n'envoie souvent pas d'adresse d'origine).
export function sourceFromUserAgent(ua) {
  const u = String(ua || '');
  if (/Instagram/i.test(u)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(u)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok|trill_/i.test(u)) return 'tiktok';
  if (/LinkedInApp/i.test(u)) return 'linkedin';
  if (/Snapchat/i.test(u)) return 'snapchat';
  if (/Telegram/i.test(u)) return 'telegram';
  if (/Twitter/i.test(u)) return 'x';
  return null;
}

// Identifiants de clic ajoutés par les plateformes à leurs liens.
const CLICK_IDS = [['fbclid', 'facebook'], ['igshid', 'instagram'], ['ttclid', 'tiktok'], ['gclid', 'google'], ['li_fat_id', 'linkedin'], ['twclid', 'x'], ['sccid', 'snapchat']];

const clip = (v, n) => {
  const s = String(v || '').trim();
  return s ? s.slice(0, n) : null;
};
export const normalizeRef = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,29}$/.test(s) ? s : null;
};

// Provenance d'une arrivée sur le site. `ownHosts` : domaines du site lui-même
// (navigation interne → null, ce n'est pas une nouvelle arrivée).
export function classifyLanding({ search = '', referrer = '', userAgent = '', pathname = '/', ownHosts = [] }) {
  const params = new URLSearchParams(search);
  let referrerHost = null;
  try { referrerHost = referrer ? new URL(referrer).hostname.toLowerCase().replace(/^www\./, '') : null; } catch { referrerHost = null; }
  const internal = referrerHost && ownHosts.some((h) => matchesHost(referrerHost, h.replace(/^www\./, '')));
  const rawSource = params.get('utm_source') || params.get('src');
  const tagged = Boolean(rawSource || params.get('ref') || params.get('utm_campaign') || params.get('c'));
  if (internal && !tagged) return null;
  if (internal) referrerHost = null;

  const ref = normalizeRef(params.get('ref'));
  let source = normalizeSourceParam(rawSource);
  let campaign = clip(params.get('utm_campaign') || params.get('c'), 60);
  // Source libre inconnue (« newsletter »…) : gardée comme nom de campagne.
  if (source === 'autre' && !campaign) campaign = clip(rawSource, 60);
  if (!source && referrerHost) source = sourceFromHost(referrerHost);
  if (!source) source = sourceFromUserAgent(userAgent);
  if (!source) {
    const hit = CLICK_IDS.find(([p]) => params.has(p));
    if (hit) source = hit[1];
  }
  return {
    source: source || 'direct',
    medium: clip(params.get('utm_medium'), 60),
    campaign,
    ref,
    referrerHost: clip(referrerHost, 120),
    landingPath: clip(pathname, 200),
  };
}

export function deviceOf(ua, width) {
  const u = String(ua || '');
  if (/iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u))) return 'tablette';
  if (/Mobi|iPhone|iPod|Android/i.test(u) || (width && width < 640)) return 'mobile';
  return 'ordinateur';
}

// Lien de suivi à partager sur un réseau (ou par un affilié).
export function trackedLink(origin, { source, campaign, ref } = {}) {
  const url = new URL('/', origin);
  if (ref) url.searchParams.set('ref', ref);
  if (source) {
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', ref ? 'affilie' : (BY_KEY[source]?.social ? 'social' : 'lien'));
  }
  const c = String(campaign || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 60);
  if (c) url.searchParams.set('utm_campaign', c);
  return url.toString();
}

// Code d'affilié proposé à partir de son nom (« Awa Diop » → « awa-diop »).
export function slugCode(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30).replace(/^-+|-+$/g, '');
}
