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

// Photo de fond de l'offre (public/images) — Hans Eiskonen / Unsplash (licence Unsplash).
export const SERVICE_STATION_IMAGE = '/images/offre-station-service.jpg';
