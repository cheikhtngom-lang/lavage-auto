// Essai gratuit de 7 jours pour les stations (subscription_status === 'essai',
// voir add_station_trial.sql / change_trial_to_7_days.sql) — calculs partagés
// entre la bannière station (AdminLayout.jsx) et le suivi Super Admin
// (SuperAdmin/Billing.jsx), pour que les deux affichent toujours le même
// nombre de jours.
export const TRIAL_DURATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function trialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / DAY_MS));
}

// Durée totale servant de base à la barre/à l'urgence = durée RÉELLEMENT
// accordée à cette station : de sa création (`startedAt`, début de l'essai,
// voir handle_new_station) à trial_ends_at. Les essais ne sont jamais
// raccourcis rétroactivement : une station inscrite sous l'essai de 30 jours,
// puis de 15 jours, garde le sien et sa barre reste juste. Sans date de début,
// plancher TRIAL_DURATION_DAYS (jamais de jours « utilisés » négatifs).
export function trialTotalDays(trialEndsAt, startedAt) {
  const remaining = trialDaysRemaining(trialEndsAt) ?? 0;
  if (trialEndsAt && startedAt) {
    const granted = Math.round((new Date(trialEndsAt).getTime() - new Date(startedAt).getTime()) / DAY_MS);
    if (granted > 0) return Math.max(granted, remaining);
  }
  return Math.max(TRIAL_DURATION_DAYS, remaining);
}

// 0 au premier jour, 100 le jour de l'expiration — la barre se remplit au
// fil des jours plutôt que de se vider (choix demandé pour l'essai station).
export function trialProgressPercent(trialEndsAt, startedAt) {
  const remaining = trialDaysRemaining(trialEndsAt);
  if (remaining === null) return 0;
  const total = trialTotalDays(trialEndsAt, startedAt);
  return Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
}

// Niveau d'urgence basé sur le temps RESTANT (pas écoulé) : 'ok' (>50%
// restant), 'warning' (<50%), 'danger' (<20% ou dernier jour). Calcul
// centralisé pour que la bannière station, Billing.jsx et Stations.jsx
// (Super Admin) s'accordent toujours sur la même couleur.
export function trialUrgency(trialEndsAt, startedAt) {
  const remaining = trialDaysRemaining(trialEndsAt);
  if (remaining === null) return 'ok';
  const total = trialTotalDays(trialEndsAt, startedAt);
  if (remaining <= 1 || remaining / total < 0.2) return 'danger';
  if (remaining / total < 0.5) return 'warning';
  return 'ok';
}
