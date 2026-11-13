// Offres station (23 septembre 2026, voir add_service_station_offer.sql) :
//   • Starter et Pro : la station de LAVAGE (file d'attente, équipe, comptabilité…) ;
//   • Station de service : tout Pro + Pompistes (carburant), Boutique, Vidange et Bilan.
//
// La clé interne de l'offre Station de service reste 'Business' (station_billing.plan,
// commandes de groupe, fonctions SQL) : seul son libellé a changé. Comparer à cette
// constante plutôt qu'à la chaîne, pour que le lien clé ↔ nom reste lisible.
export const SERVICE_STATION_PLAN = 'Business';
export const SERVICE_STATION_LABEL = 'Station de service';

export const isServiceStationPlan = (plan) => plan === SERVICE_STATION_PLAN;

// Offre « Pressing » (13/11/2026, add_pressing_offer.sql) : un pressing sans
// lavage auto, 15 000 F/mois. Son espace s'ouvre sur la rubrique Pressing et
// ne montre aucune rubrique du lavage auto ; il n'apparaît pas dans
// l'annuaire des stations de lavage (stations.business_type).
export const PRESSING_PLAN = 'Pressing';
export const isPressingPlan = (plan) => plan === PRESSING_PLAN;

// Modules compris dans une offre : jamais facturés en plus (même règle en
// base : plan_included_modules, add_pressing_offer.sql).
export const PLAN_INCLUDED_MODULES = {
  [SERVICE_STATION_PLAN]: ['mod_vidange', 'mod_bilan', 'mod_boutique'],
  [PRESSING_PLAN]: ['mod_pressing'],
};
export const planIncludesModule = (plan, moduleId) => (PLAN_INCLUDED_MODULES[plan] || []).includes(moduleId);

// Photo de fond de l'offre (public/images) — Hans Eiskonen / Unsplash (licence Unsplash).
export const SERVICE_STATION_IMAGE = '/images/offre-station-service.jpg';

// Annonces aux clients et publicité payante : à partir de Pro (24/09/2026) — une
// station Starter n'y a pas accès. Même règle côté base : station_has_marketing
// (add_marketing_plan_gate.sql, policies announcements_insert et station_ads_insert).
export const MARKETING_PLANS = ['Pro', SERVICE_STATION_PLAN];
// Comptabilité : Pro, Station de service et Pressing (voir RequireAccountingAccess, App.jsx).
export const ACCOUNTING_PLANS = ['Pro', SERVICE_STATION_PLAN, PRESSING_PLAN];
export const stationHasMarketing = (billing) => MARKETING_PLANS.includes(billing?.plan);
