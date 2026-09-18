// Essai gratuit de 15 jours pour les stations (subscription_status === 'essai',
// voir add_station_trial.sql / change_trial_to_15_days.sql) — calculs partagés
// entre la bannière station (AdminLayout.jsx) et le suivi Super Admin
// (SuperAdmin/Billing.jsx), pour que les deux affichent toujours le même
// nombre de jours.
export const TRIAL_DURATION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

export function trialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / DAY_MS));
}

// Durée totale servant de base à la barre/à l'urgence. Les stations inscrites
// AVANT le passage à 15 jours ont un essai de 30 jours en base (trial_ends_at
// n'est pas raccourci rétroactivement) : sans ce plancher, leurs jours
// restants (ex: 25) dépasseraient TRIAL_DURATION_DAYS et donneraient un
// nombre de jours "utilisés" négatif.
export function trialTotalDays(trialEndsAt) {
  const remaining = trialDaysRemaining(trialEndsAt);
  return Math.max(TRIAL_DURATION_DAYS, remaining ?? 0);
}

// 0 au premier jour, 100 le jour de l'expiration — la barre se remplit au
// fil des jours plutôt que de se vider (choix demandé pour l'essai station).
export function trialProgressPercent(trialEndsAt) {
  const remaining = trialDaysRemaining(trialEndsAt);
  if (remaining === null) return 0;
  const total = trialTotalDays(trialEndsAt);
  return Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
}

// Niveau d'urgence basé sur le temps RESTANT (pas écoulé) : 'ok' (>50%
// restant), 'warning' (<50%), 'danger' (<20% ou dernier jour). Calcul
// centralisé pour que la bannière station, Billing.jsx et Stations.jsx
// (Super Admin) s'accordent toujours sur la même couleur.
export function trialUrgency(trialEndsAt) {
  const remaining = trialDaysRemaining(trialEndsAt);
  if (remaining === null) return 'ok';
  const total = trialTotalDays(trialEndsAt);
  if (remaining <= 1 || remaining / total < 0.2) return 'danger';
  if (remaining / total < 0.5) return 'warning';
  return 'ok';
}
