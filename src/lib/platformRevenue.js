// Source de vérité UNIQUE pour les revenus récurrents de la plateforme (Super
// Admin) — importée par Vue d'ensemble, Analytique, Facturation et Bilan pour
// que le MRR affiché soit partout le même chiffre, calculé de la même façon.
//
// « Abonnement validé » = station dont le paiement d'abonnement est confirmé
// (station_billing.subscription_status = 'a_jour'). Sont donc EXCLUS du MRR :
//   - 'essai'     : période d'essai d'un mois, la station ne paie pas encore
//   - 'en_retard' : abonnement impayé
//   - 'illimite'  : accès gratuit à vie accordé manuellement par le Super Admin
//
// Voir add_unlimited_access.sql (valeurs possibles du statut) et
// useSuperAdminState.jsx (markSubscriptionPaid / confirmRenewalPayment).
import { STATION_MODULES } from './stationModules';

export const PAID_SUBSCRIPTION_STATUS = 'a_jour';

// Métadonnées d'affichage partagées (libellé + couleur) — reprises telles
// quelles par les répartitions de Analytique et Bilan, pour ne plus avoir
// trois définitions divergentes de "Impayé" / "Essai gratuit"…
export const SUBSCRIPTION_STATUS_META = {
  a_jour: { key: 'a_jour', label: 'Abonnement validé', color: '#10b981' },
  essai: { key: 'essai', label: 'Essai gratuit', color: '#3b82f6' },
  en_retard: { key: 'en_retard', label: 'Impayé', color: '#ef4444' },
  illimite: { key: 'illimite', label: 'Accès illimité (offert)', color: '#a855f7' },
};

const planPrice = (PLANS, key) => (PLANS && PLANS[key] && Number(PLANS[key].price)) || 0;

// Prix mensuel d'un module add-on : "8 000 FCFA/mois" -> 8000.
export function moduleMonthlyPrice(mod) {
  if (!mod || !mod.price) return 0;
  const digits = String(mod.price).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export const MODULE_PRICE_BY_ID = Object.fromEntries(
  STATION_MODULES.map((m) => [m.id, moduleMonthlyPrice(m)]),
);

// Stations dont l'abonnement est réellement validé (paiement à jour).
export function validatedStations(stations) {
  return (stations || []).filter((s) => s.subscriptionStatus === PAID_SUBSCRIPTION_STATUS);
}

// MRR réel = somme des prix de plan des seuls abonnements validés.
export function validatedMRR(stations, PLANS) {
  return validatedStations(stations).reduce((sum, s) => sum + planPrice(PLANS, s.plan), 0);
}

// Revenu récurrent des modules & add-ons activés. Par défaut, uniquement pour
// les stations à abonnement validé (un module facturé à une station qui ne
// paie pas encore son abonnement de base n'est pas un revenu acquis) —
// `includeAll` pour le potentiel théorique.
export function modulesMRR(stations, { includeAll = false } = {}) {
  return (stations || [])
    .filter((s) => (includeAll ? s.subscriptionStatus !== 'illimite' : s.subscriptionStatus === PAID_SUBSCRIPTION_STATUS))
    .reduce(
      (sum, s) => sum + (s.activeModules || []).reduce((a, id) => a + (MODULE_PRICE_BY_ID[id] || 0), 0),
      0,
    );
}

// Répartition des stations par statut d'abonnement : nombre + MRR théorique
// associé (0 pour l'accès illimité, qui ne facture rien).
export function subscriptionBreakdown(stations, PLANS) {
  return Object.values(SUBSCRIPTION_STATUS_META).map((meta) => {
    const list = (stations || []).filter((s) => (s.subscriptionStatus || 'essai') === meta.key);
    return {
      ...meta,
      count: list.length,
      mrr: meta.key === 'illimite' ? 0 : list.reduce((sum, s) => sum + planPrice(PLANS, s.plan), 0),
    };
  });
}
