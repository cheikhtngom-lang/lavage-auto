// Expiration de session sur inactivité — 30 min sans interaction => déconnexion.
//
// Supabase ne coupe jamais la session de lui-même (autoRefreshToken par défaut,
// jeton rafraîchi en silence, stockage localStorage). Le time-box côté serveur
// (Dashboard > Auth > Sessions) est réservé au plan Pro. On gère donc ça côté
// client : un horodatage "dernière activité" partagé entre onglets (localStorage),
// remis à zéro à chaque interaction, et vérifié périodiquement. Passé le délai,
// on appelle signOut() + clearSession() et on renvoie vers login.html?expired=1.
// Délai surchargeable par navigateur via localStorage ccg_idle_max_minutes.
//
// N'affecte que l'app React (voir App.jsx). Les visiteurs non connectés de la
// page publique /stations ne sont jamais redirigés : on vérifie qu'une session
// existe réellement avant de déconnecter.
import { supabase } from './supabaseClient';
import { clearSession } from './accounts';

const DEFAULT_IDLE_MINUTES = 30;        // 30 min d'inactivité par défaut
const CHECK_INTERVAL_MS = 30 * 1000;    // fréquence de vérification
const WRITE_THROTTLE_MS = 10 * 1000;    // on ne réécrit l'horodatage qu'au plus toutes les 10 s

const ACTIVITY_KEY = 'ccg_last_activity'; // partagé entre onglets
const LOGOUT_KEY = 'ccg_session_expired'; // diffusion "déconnexion" aux autres onglets
// Horodatage (epoch ms) du départ du lavage en cours le plus récent, écrit
// par useAppState. Tant qu'il est frais (< 3 h), on ne déconnecte pas : le
// gérant est au travail. Au-delà, on laisse expirer — l'écran verrouillé
// (setSessionExpiredHandler) prend alors le relais pour continuer d'alerter.
const BUSY_KEY = 'ccg_active_wash_since';
const BUSY_GRACE_MS = 3 * 60 * 60 * 1000;

// Optionnel : un composant (AdminLayout) peut intercepter l'expiration pour
// afficher un écran verrouillé plutôt que de quitter la page — ça permet de
// continuer à surveiller la file et à biper même déconnecté. Si aucun
// handler n'est posé, comportement historique : redirection vers login.html.
let onExpireHandler = null;
export function setSessionExpiredHandler(fn) {
  onExpireHandler = typeof fn === 'function' ? fn : null;
}
// Surcharge par navigateur (tests, réglage support) : localStorage
// ccg_idle_max_minutes = "2" => déconnexion après 2 min. Borné 1..1440.
const LIMIT_KEY = 'ccg_idle_max_minutes';

function idleLimitMs() {
  let min = DEFAULT_IDLE_MINUTES;
  try {
    const raw = parseFloat(localStorage.getItem(LIMIT_KEY));
    if (Number.isFinite(raw) && raw > 0) min = Math.min(1440, Math.max(1, raw));
  } catch { /* stockage indisponible : on garde le défaut */ }
  return min * 60 * 1000;
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'pointerdown', 'scroll', 'wheel'];

let started = false;
let loggingOut = false;
let lastWrite = 0;
let intervalId = null;

function now() {
  return Date.now();
}

function readLastActivity() {
  const raw = Number(localStorage.getItem(ACTIVITY_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function markActivity(force = false) {
  const t = now();
  if (!force && t - lastWrite < WRITE_THROTTLE_MS) return;
  lastWrite = t;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(t));
  } catch {
    /* stockage indisponible (mode privé strict) : la veille se fait alors
       en mémoire via lastWrite, sans partage entre onglets. */
  }
}

async function expireSession() {
  if (loggingOut) return;
  loggingOut = true;
  try {
    localStorage.setItem(LOGOUT_KEY, String(now())); // réveille les autres onglets
  } catch { /* ignore */ }
  try {
    await supabase.auth.signOut();
  } catch { /* réseau coupé : on redirige quand même */ }
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch { /* ignore */ }
  if (onExpireHandler) {
    // Un composant prend le relais (écran verrouillé). On NE quitte PAS la
    // page et on garde le cache de rôle local (clearSession différé au clic
    // "Se reconnecter") pour que l'écran verrouillé sache quelle station suivre.
    try { onExpireHandler(); return; } catch { /* on retombe sur la redirection */ }
  }
  clearSession();
  window.location.replace('/login.html?expired=1');
}

async function checkIdle() {
  if (loggingOut) return;
  const last = readLastActivity();
  if (last == null) {
    // Premier passage sans horodatage : on l'initialise (ex. juste après login).
    markActivity(true);
    return;
  }
  if (now() - last < idleLimitMs()) return;

  // Délai dépassé — on ne déconnecte que s'il y a vraiment une session
  // (sinon : visiteur anonyme sur /stations, on le laisse tranquille).
  let session = null;
  try {
    ({ data: { session } } = await supabase.auth.getSession());
  } catch {
    return; // erreur transitoire : on retentera au prochain tick
  }
  if (!session) {
    markActivity(true); // pas de session : on repart de zéro, sans rien couper
    return;
  }
  // Un lavage récent est en cours : le gérant est au travail, on ne le
  // déconnecte pas. Passé BUSY_GRACE_MS sans nouveau départ, on laisse expirer.
  try {
    const busySince = Number(localStorage.getItem(BUSY_KEY));
    if (Number.isFinite(busySince) && busySince > 0 && now() - busySince < BUSY_GRACE_MS) {
      markActivity(true);
      return;
    }
  } catch { /* stockage indisponible : on poursuit vers l'expiration */ }
  await expireSession();
}

function onActivity() {
  markActivity();
}

function onVisibility() {
  if (document.visibilityState === 'visible') checkIdle();
}

function onStorage(e) {
  if (e.key === LOGOUT_KEY && e.newValue && !loggingOut) {
    // Un autre onglet a expiré : on suit.
    loggingOut = true;
    if (onExpireHandler) {
      try { onExpireHandler(); return; } catch { /* on retombe sur la redirection */ }
    }
    clearSession();
    window.location.replace('/login.html?expired=1');
  }
}

// Démarre la veille d'inactivité. Idempotent. Retourne une fonction d'arrêt.
export function startIdleWatch() {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  if (readLastActivity() == null) markActivity(true);

  ACTIVITY_EVENTS.forEach((evt) =>
    window.addEventListener(evt, onActivity, { passive: true })
  );
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onVisibility);
  window.addEventListener('storage', onStorage);
  intervalId = setInterval(checkIdle, CHECK_INTERVAL_MS);

  // Vérification immédiate : couvre le cas d'un onglet resté ouvert toute la nuit
  // puis rechargé (l'horodatage en localStorage est alors déjà périmé).
  checkIdle();

  return function stopIdleWatch() {
    started = false;
    ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onVisibility);
    window.removeEventListener('storage', onStorage);
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  };
}
