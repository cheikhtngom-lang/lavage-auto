// Offre Super User (5000 FCFA/mois) — débloque plus de 2 véhicules pour un
// automobiliste. Le paiement (Wave/Orange Money) n'active JAMAIS le compte
// tout seul : il crée une ligne `super_user_subscriptions` en PENDING, que
// seul le Super Admin peut faire passer à ACTIVE une fois l'argent
// effectivement reçu (même logique que markSubscriptionPaid pour les
// stations, voir useSuperAdminState.jsx) — voir aussi la policy RLS
// `super_user_subscriptions_update` dans supabase/schema.sql, qui interdit
// à un client de s'auto-activer.
//
// La limite de 2 véhicules gratuits est appliquée ICI pour l'UX (messages
// clairs, pas d'aller-retour réseau inutile), mais la vraie protection est
// côté serveur : policy RLS `vehicles_insert` dans supabase/schema.sql.
import { supabase } from './supabaseClient';

export const MAX_FREE_VEHICLES = 2;
export const SUPER_USER_MONTHLY_PRICE = 5000;

// Dernier abonnement (peu importe son statut) d'un client — sert à la fois à
// afficher "Mon abonnement" et à déterminer si la limite gratuite s'applique.
export async function getLatestSubscription(clientId) {
  if (!clientId) return null;
  const { data, error } = await supabase
    .from('super_user_subscriptions')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

// Statut affichable dérivé de la ligne la plus récente : pas de tâche
// planifiée pour repasser une ligne ACTIVE expirée en EXPIRED en base (pas
// d'Edge Function sur ce projet) — on le calcule à la volée à chaque lecture,
// comme isStationOpenNow() le fait déjà pour les horaires de station.
export function deriveSuperUserStatus(sub) {
  if (!sub) return 'FREE';
  if (sub.status === 'ACTIVE') {
    return sub.expires_at && new Date(sub.expires_at) > new Date() ? 'ACTIVE' : 'EXPIRED';
  }
  if (sub.status === 'PENDING') return 'PENDING';
  return 'FREE'; // CANCELLED / FAILED / déjà EXPIRED -> compte gratuit
}

export function isSuperUserActive(sub) {
  return deriveSuperUserStatus(sub) === 'ACTIVE';
}

// Crée une demande de paiement (PENDING) — jamais activée directement ici.
export async function createSuperUserPayment(clientId, { method, reference }) {
  const { data, error } = await supabase.from('super_user_subscriptions').insert({
    client_id: clientId, status: 'PENDING', amount: SUPER_USER_MONTHLY_PRICE,
    method: method || null, reference: reference || null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}
