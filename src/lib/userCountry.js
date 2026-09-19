// Quel pays montrer à un visiteur / un client ? — logique commune à la page
// d'accueil (index.html), à la recherche React (Client/Stations.jsx) et au footer.
//
// Ordre de décision (resolveCountry, fonction pure) :
//   1. pays choisi à la main (lien « Pays : … ») ou passé dans l'URL (?country=ci)
//      s'il est OUVERT ;
//   2. sinon pays détecté automatiquement (en-tête Vercel x-vercel-ip-country, via
//      api/country.js) : s'il est ouvert on l'utilise ; s'il est hors périmètre ou pas
//      encore ouvert on NE retombe PAS sur le Sénégal — statut « unavailable », l'écran
//      affiche « pas encore disponible dans votre pays » ;
//   3. détection impossible (réseau, dev local, en-tête absent) : dernier pays choisi
//      sur le compte (profiles.country), sinon le Sénégal.
//
// Sans dépendance React : importable depuis les pages HTML (type="module").

import { DEFAULT_COUNTRY, getCountry } from './countries.js';

const OVERRIDE_KEY = 'ccg_country';          // choix manuel, persistant (localStorage)
const DETECTED_KEY = 'ccg_country_detected'; // détection, valable le temps de la session

function read(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
function write(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key); else storage.setItem(key, value);
  } catch { /* stockage indisponible : on redétecte à chaque page */ }
}

const isCode = (v) => typeof v === 'string' && /^[A-Z]{2}$/.test(v);

export function getCountryOverride() {
  const v = read(window.localStorage, OVERRIDE_KEY);
  return isCode(v) ? v : null;
}

export function setCountryOverride(code) {
  write(window.localStorage, OVERRIDE_KEY, isCode(code) ? code : null);
}

// ?country=ci dans l'URL (liens du footer) : valable pour cette visite seulement,
// jamais mémorisé — c'est un lien, pas un choix de l'utilisateur.
export function getUrlCountry() {
  try {
    const v = (new URLSearchParams(window.location.search).get('country') || '').toUpperCase();
    return isCode(v) ? v : null;
  } catch { return null; }
}

// Retire ?country=… de l'adresse (choix manuel de l'utilisateur : il prime sur le lien).
export function clearUrlCountry() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('country')) return;
    url.searchParams.delete('country');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* non bloquant */ }
}

// Pays de la connexion, ou null. Cache de session pour ne pas rappeler l'API
// à chaque composant / page.
export async function detectCountry() {
  const cached = read(window.sessionStorage, DETECTED_KEY);
  if (isCode(cached)) return cached;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('/api/country', { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const { country } = await res.json();
    if (isCode(country)) {
      write(window.sessionStorage, DETECTED_KEY, country);
      return country;
    }
  } catch { /* hors ligne, dev local sans /api, bloqueur… */ }
  return null;
}

// Codes des pays ouverts aux clients (table platform_countries). En cas d'erreur
// on ne suppose que le Sénégal : mieux vaut un pays de moins qu'un pays ouvert à tort.
export async function fetchOpenCountries(supabase) {
  try {
    const { data, error } = await supabase.from('platform_countries').select('code').eq('open', true);
    if (error) throw error;
    const codes = (data || []).map((row) => row.code).filter((c) => !!getCountry(c));
    return codes.length ? codes : [DEFAULT_COUNTRY];
  } catch {
    return [DEFAULT_COUNTRY];
  }
}

// Décision pure (testable) — voir l'ordre en tête de fichier.
export function resolveCountry({ override = null, detected = null, openCodes = [DEFAULT_COUNTRY], profileCountry = null } = {}) {
  const isOpen = (c) => !!c && !!getCountry(c) && openCodes.includes(c);
  if (isOpen(override)) return { status: 'ok', code: override, source: 'manual', detected };
  if (detected) {
    if (isOpen(detected)) return { status: 'ok', code: detected, source: 'auto', detected };
    return { status: 'unavailable', code: null, source: 'auto', detected };
  }
  if (isOpen(profileCountry)) return { status: 'ok', code: profileCountry, source: 'profile', detected: null };
  if (isOpen(DEFAULT_COUNTRY)) return { status: 'ok', code: DEFAULT_COUNTRY, source: 'default', detected: null };
  return { status: 'unavailable', code: null, source: 'default', detected: null };
}

// Dernier pays choisi sur le compte connecté (profiles.country) — repli uniquement.
export async function fetchProfileCountry(supabase) {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id;
    if (!uid) return null;
    const { data } = await supabase.from('profiles').select('country').eq('id', uid).maybeSingle();
    return isCode(data?.country) ? data.country : null;
  } catch { return null; }
}

// Mémorise le choix sur le compte connecté (au mieux : sans session ou en cas
// d'erreur, le choix local suffit).
export async function saveProfileCountry(supabase, code) {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id;
    if (uid && isCode(code)) await supabase.from('profiles').update({ country: code }).eq('id', uid);
  } catch { /* non bloquant */ }
}

// Calcule tout d'un coup : ce que fait chaque page au chargement.
export async function loadCountryState(supabase) {
  const [openCodes, detected] = await Promise.all([fetchOpenCountries(supabase), detectCountry()]);
  const override = getUrlCountry() || getCountryOverride();
  const profileCountry = detected || override ? null : await fetchProfileCountry(supabase);
  return { openCodes, ...resolveCountry({ override, detected, openCodes, profileCountry }) };
}
