// Publicités payantes des stations (broadcast plateforme) — distinctes du
// bandeau promo gratuit (stations.promo_config, visible uniquement sur la
// fiche de LA station, voir promoDefaults.js). Une pub est diffusée sur le
// tableau de bord de TOUS les automobilistes de la plateforme, contre
// paiement à la plateforme. Même logique de confirmation manuelle que
// super_user_subscriptions (pas de vraie passerelle Wave/OM sur ce projet) :
// le paiement crée une ligne PENDING dans `station_ads`, seul le Super Admin
// la fait passer à ACTIVE une fois l'argent effectivement reçu.
import { supabase } from './supabaseClient';

// Offres de diffusion — la station choisit l'une des trois au moment du
// paiement (voir Admin > Réglages > Publicité) ; la durée réellement
// appliquée est celle stockée sur la ligne (station_ads.duration_days), pas
// une constante globale, pour que chaque pub garde SA durée même si ces
// offres changent plus tard.
export const AD_PLANS = [
  { id: '3d', label: '3 jours', days: 3, price: 5000 },
  { id: '7d', label: '1 semaine', days: 7, price: 10000 },
  { id: '30d', label: '1 mois', days: 30, price: 30000 },
];
export const DEFAULT_AD_PLAN_ID = '7d';
export const MAX_AD_IMAGE_SIZE = 1.5 * 1024 * 1024; // 1.5 Mo — même limite que le logo station

// Statut affichable dérivé de la ligne : une ligne ACTIVE en base dont
// expires_at est dépassée s'affiche EXPIRED sans écriture (pas de cron sur ce
// projet) — même logique que deriveSuperUserStatus dans lib/superUser.js.
export function deriveAdStatus(ad) {
  if (!ad) return null;
  if (ad.status === 'ACTIVE') {
    return ad.expiresAt && new Date(ad.expiresAt) > new Date() ? 'ACTIVE' : 'EXPIRED';
  }
  return ad.status;
}

// Crée une demande de paiement (PENDING) — jamais activée directement ici.
export async function createAdPayment(stationId, { message, imageUrl, method, reference, planId }) {
  const plan = AD_PLANS.find((p) => p.id === planId) || AD_PLANS.find((p) => p.id === DEFAULT_AD_PLAN_ID);
  const { data, error } = await supabase.from('station_ads').insert({
    station_id: stationId, message: message.trim(), image_url: imageUrl || null,
    status: 'PENDING', amount: plan.price, duration_days: plan.days, method: method || null, reference: reference || null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}
