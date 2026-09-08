// Renouvellement en libre-service de l'abonnement d'une station en fin de
// vie (essai expiré ou marquée impayée, voir isSubscriptionEnded ci-dessous)
// — le paiement Wave/Orange Money ne réactive JAMAIS la station toute
// seule : il crée une ligne PENDING dans `station_renewal_payments`, que
// seul le Super Admin peut confirmer une fois l'argent réellement reçu
// (même logique que super_user_subscriptions/station_ads, voir
// lib/superUser.js et lib/ads.js) — voir aussi la policy RLS
// `station_renewal_payments_update` dans add_station_subscription_gate.sql.
import { supabase } from './supabaseClient';
import { trialDaysRemaining } from './stationTrial';

// Vrai une fois l'abonnement bel et bien terminé : marquée impayée par le
// Super Admin (en_retard), ou essai gratuit écoulé sans être passée à un
// abonnement payant. Ne déclenche rien tout seul (voir schema.sql) — sert
// uniquement à décider, côté lecture, si l'accès doit être bloqué.
export function isSubscriptionEnded(billing) {
  if (!billing) return false;
  if (billing.subscriptionStatus === 'en_retard') return true;
  if (billing.subscriptionStatus === 'essai' && billing.trialEndsAt) return trialDaysRemaining(billing.trialEndsAt) <= 0;
  return false;
}

export async function createRenewalPayment(stationId, { plan, amount, method, reference }) {
  const { data, error } = await supabase.from('station_renewal_payments').insert({
    station_id: stationId, status: 'PENDING', plan, amount, method: method || null, reference: reference || null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getLatestRenewalPayment(stationId) {
  const { data, error } = await supabase
    .from('station_renewal_payments')
    .select('*')
    .eq('station_id', stationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}
