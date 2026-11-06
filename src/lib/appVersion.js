// Version déployée : à chaque build, vite.config.js écrit /version.json
// ({ id }) et injecte le même identifiant dans le code (__BUILD_ID__). Un
// onglet resté ouvert depuis le matin (tablette de station) compare les deux
// pour savoir qu'une nouvelle version est en ligne — sinon il garde l'ancien
// code (et ses anciens défauts) jusqu'à ce que quelqu'un recharge la page.

// eslint-disable-next-line no-undef
export const CURRENT_BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'inconnu';

export function isNewerBuild(deployedId, currentId = CURRENT_BUILD_ID) {
  return typeof deployedId === 'string' && deployedId.length > 0 && deployedId !== currentId;
}

// Identifiant en ligne, ou null (hors-ligne, page d'erreur, développement).
export async function fetchDeployedBuildId() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.id === 'string' ? data.id : null;
  } catch {
    return null;
  }
}

// Peut-on recharger sans gêner personne ? Jamais pendant un lavage en cours :
// après un rechargement, le navigateur garde le son bloqué jusqu'au prochain
// toucher de l'écran, et le bip de fin de lavage serait muet. Sinon : onglet
// en arrière-plan, ou écran pas touché depuis `idleMs` sans champ de saisie
// actif ni fenêtre ouverte.
export function canReloadSilently({ washInProgress, hidden, idleForMs, typing, dialogOpen }, idleMs = 3 * 60 * 1000) {
  if (washInProgress) return false;
  if (hidden) return true;
  return idleForMs >= idleMs && !typing && !dialogOpen;
}
