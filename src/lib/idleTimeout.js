// Expiration de session sur inactivité — 3 h sans interaction => déconnexion.
//
// Supabase ne coupe jamais la session de lui-même (autoRefreshToken par défaut,
// jeton rafraîchi en silence, stockage localStorage). Le time-box côté serveur
// (Dashboard > Auth > Sessions) est réservé au plan Pro. On gère donc ça côté
// client : un horodatage "dernière activité" partagé entre onglets (localStorage),
// remis à zéro à chaque interaction, et vérifié périodiquement. Passé le délai,
// on appelle signOut() + clearSession() et on renvoie vers login.html?expired=1.
// Délai surchargeable par navigateur via localStorage ccg_idle_max_minutes.
//
// Session perdue : la session Supabase peut aussi disparaître sans passer par
// ce minuteur (jeton de rafraîchissement refusé après une longue veille,
// déconnexion depuis un autre onglet…). L'appli gardait alors le rôle en cache
// et affichait le tableau de bord avec des rubriques vides, chaque requête
// étant refusée — il fallait fermer le site et le rouvrir. Désormais, dès que
// la session manque sur une page d'espace connecté, on renvoie à la connexion.
//
// N'affecte que l'app React (voir App.jsx). Les visiteurs non connectés de la
// page publique /stations ne sont jamais redirigés : on vérifie qu'une session
// existe réellement avant de déconnecter.
import { supabase } from './supabaseClient';
import { clearSession, getCurrentRole } from './accounts';

const DEFAULT_IDLE_MINUTES = 180;       // 3 h d'inactivité par défaut
const CHECK_INTERVAL_MS = 30 * 1000;    // fréquence de vérification
const WRITE_THROTTLE_MS = 10 * 1000;    // on ne réécrit l'horodatage qu'au plus toutes les 10 s
// Une déconnexion volontaire (bouton, cession de station…) appelle signOut()
// puis efface le cache local et change de page juste après. On lui laisse ce
// délai avant de traiter l'événement SIGNED_OUT comme une session perdue.
const SIGNED_OUT_GRACE_MS = 1500;

const ACTIVITY_KEY = 'ccg_last_activity'; // partagé entre onglets
const LOGOUT_KEY = 'ccg_session_expired'; // diffusion "déconnexion" aux autres onglets
// Horodatage (epoch ms) du départ du lavage en cours le plus récent, écrit
// par useAppState. Tant qu'il est frais (< 3 h), on ne déconnecte pas : le
// gérant est au travail. Au-delà, on laisse expirer.
const BUSY_KEY = 'ccg_active_wash_since';
const BUSY_GRACE_MS = 3 * 60 * 60 * 1000;

// Pages des espaces connectés (station, automobiliste, patron, Super Admin).
const PROTECTED_PATH = /^\/(admin|dashboard|groupe|superadmin)(\/|$)/;

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

// Réglage exposé dans Paramètres (espace patron) : même clé, donc propre à cet
// appareil/navigateur. null = retour au défaut.
export const IDLE_MINUTES_DEFAULT = DEFAULT_IDLE_MINUTES;
export function getIdleMinutes() {
  return Math.round(idleLimitMs() / 60000);
}
export function setIdleMinutes(min) {
  try {
    if (min == null || min === DEFAULT_IDLE_MINUTES) localStorage.removeItem(LIMIT_KEY);
    else localStorage.setItem(LIMIT_KEY, String(min));
  } catch { /* stockage indisponible : le réglage ne tient pas, le défaut s'applique */ }
}

const ACTIVITY_EVENTS =['mousedown', 'keydown', 'touchstart', 'pointerdown', 'scroll', 'wheel'];

let started = false;
let loggingOut = false;
let checking = false;
let lastWrite = 0;
let intervalId = null;
let authSubscription = null;

function now() {
  return Date.now();
}

function onProtectedPage() {
  return PROTECTED_PATH.test(window.location.pathname);
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

// Page de connexion, sans détour : cache local effacé, l'historique ne
// permet pas de revenir sur le tableau de bord avec le bouton Retour.
function goToLogin() {
  loggingOut = true;
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch { /* ignore */ }
  clearSession();
  window.location.replace('/login.html?expired=1');
}

// Session Supabase lue dans le stockage (rafraîchie au besoin). Renvoie
// undefined si la lecture échoue (réseau coupé) : on ne conclut rien.
async function readSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return undefined;
    return data?.session || null;
  } catch {
    return undefined;
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
  goToLogin();
}

async function checkIdle() {
  if (loggingOut || checking) return;
  checking = true;
  try {
    // Session perdue alors que l'appli croit encore l'utilisateur connecté.
    if (onProtectedPage() && getCurrentRole()) {
      const session = await readSession();
      if (session === null) {
        goToLogin();
        return;
      }
    }

    const last = readLastActivity();
    if (last == null) {
      // Premier passage sans horodatage : on l'initialise (ex. juste après login).
      markActivity(true);
      return;
    }
    if (now() - last < idleLimitMs()) return;

    // Délai dépassé — on ne déconnecte que s'il y a vraiment une session
    // (sinon : visiteur anonyme sur /stations, on le laisse tranquille).
    const session = await readSession();
    if (session === undefined) return; // erreur transitoire : on retentera au prochain tick
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
  } finally {
    checking = false;
  }
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
    goToLogin();
  }
}

// Supabase signale la fin de session (jeton refusé, déconnexion ailleurs).
// Pas d'appel Supabase ici : le rappel s'exécute sous le verrou d'auth.
function onAuthChange(event) {
  if (event !== 'SIGNED_OUT' || loggingOut) return;
  setTimeout(() => {
    if (loggingOut || !getCurrentRole() || !onProtectedPage()) return;
    goToLogin();
  }, SIGNED_OUT_GRACE_MS);
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
  authSubscription = supabase.auth.onAuthStateChange(onAuthChange)?.data?.subscription || null;

  // Vérification immédiate : couvre le cas d'un onglet resté ouvert toute la nuit
  // puis rechargé (l'horodatage en localStorage est alors déjà périmé), et
  // celui d'une session déjà perdue à l'ouverture du site.
  checkIdle();

  return function stopIdleWatch() {
    started = false;
    ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onVisibility);
    window.removeEventListener('storage', onStorage);
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    authSubscription?.unsubscribe?.();
    authSubscription = null;
  };
}
