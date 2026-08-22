// Essai gratuit d'un mois pour les stations (subscription_status === 'essai',
// voir add_station_trial.sql) — calculs partagés entre la bannière station
// (AdminLayout.jsx) et le suivi Super Admin (SuperAdmin/Billing.jsx), pour
// que les deux affichent toujours le même nombre de jours.
export const TRIAL_DURATION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function trialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / DAY_MS));
}

// 0 au premier jour, 100 le jour de l'expiration — la barre se remplit au
// fil des jours plutôt que de se vider (choix demandé pour l'essai station).
export function trialProgressPercent(trialEndsAt) {
  const remaining = trialDaysRemaining(trialEndsAt);
  if (remaining === null) return 0;
  return Math.min(100, Math.max(0, ((TRIAL_DURATION_DAYS - remaining) / TRIAL_DURATION_DAYS) * 100));
}
