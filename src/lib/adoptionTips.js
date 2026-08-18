// Astuces contextuelles "adoption" (voir [[design_onboarding_backlog]]) : déclenchées
// par une action que l'utilisateur vient de faire, affichées une seule fois puis
// mémorisées comme vues — préférence d'affichage pure, pas une donnée métier, donc
// localStorage suffit (même logique que les autres flags UI-only de l'app).
const STORAGE_KEY = 'ccg_seen_tips';

function readSeen() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

export function hasSeenTip(tipId) {
  if (!tipId) return true;
  return !!readSeen()[tipId];
}

export function markTipSeen(tipId) {
  if (!tipId) return;
  const seen = readSeen();
  seen[tipId] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
}
