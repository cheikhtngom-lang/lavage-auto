// Grille tarifaire et durées par défaut d'une nouvelle station — partagées entre
// useAppState (session admin de sa propre station) et stationData (lecture de
// n'importe quelle station depuis l'espace automobiliste), pour que les deux
// affichent les mêmes valeurs tant que l'admin n'a pas encore personnalisé les
// siennes dans Paramètres > Grille tarifaire / Temps estimés.
// Deux-roues (Moto / tricycle, Jakarta, Vélo) : une seule prestation proposée,
// "Lavage Complet" — pas de Simple/Moteur. Jakarta et Vélo (demande des
// stations, 13/11/2026) ont chacun leur prix, à côté de la moto.
export const DEFAULT_PRICING = {
  "Moto": { "Lavage Complet": 2000 },
  "Jakarta": { "Lavage Complet": 1500 },
  "Vélo": { "Lavage Complet": 1000 },
  "Particulier": { "Lavage Simple": 2500, "Lavage Complet": 5000, "Lavage Moteur": 4000 },
  "Transport": { "Lavage Simple": 3000, "Lavage Complet": 6000, "Lavage Moteur": 5000 },
  "Camion": { "Lavage Simple": 10000, "Lavage Complet": 20000, "Lavage Moteur": 15000 },
};

export const DEFAULT_DURATION = {
  "Moto": { "Lavage Complet": 20 },
  "Jakarta": { "Lavage Complet": 15 },
  "Vélo": { "Lavage Complet": 10 },
  "Particulier": { "Lavage Simple": 15, "Lavage Complet": 30, "Lavage Moteur": 25 },
  "Transport": { "Lavage Simple": 20, "Lavage Complet": 40, "Lavage Moteur": 35 },
  "Camion": { "Lavage Simple": 30, "Lavage Complet": 45, "Lavage Moteur": 40 },
};

// Catégories à prestation unique (« Lavage Complet ») : les deux-roues.
export const SINGLE_SERVICE_CATEGORIES = ['Moto', 'Jakarta', 'Vélo'];
export const isSingleServiceCategory = (category) => SINGLE_SERVICE_CATEGORIES.includes(category);

// Services proposés par catégorie de tarif : une moto / un tricycle, une
// Jakarta ou un vélo n'a que « Lavage Complet » (seule ligne de sa grille).
// Tout chemin qui crée une réservation passe par normalizeService — sinon
// « Moto + Lavage Simple » ne trouve aucun prix (0 F, ou le prix de secours)
// au lieu de celui de la station.
export const WASH_SERVICES = ['Lavage Simple', 'Lavage Complet', 'Lavage Moteur'];
export const servicesFor = (category) => (isSingleServiceCategory(category) ? ['Lavage Complet'] : WASH_SERVICES);
export const normalizeService = (category, service) => {
  const allowed = servicesFor(category);
  return allowed.includes(service) ? service : allowed[0];
};

// Grille d'une station (lignes de wash_pricing) complétée par les valeurs par
// défaut des catégories qu'elle n'a pas encore enregistrées (ex. Jakarta et
// Vélo pour une station inscrite avant leur ajout).
export function withDefaultCategories(config, defaults) {
  const out = {};
  Object.keys(defaults).forEach((cat) => { out[cat] = { ...defaults[cat] }; });
  Object.entries(config || {}).forEach(([cat, services]) => { out[cat] = { ...(out[cat] || {}), ...services }; });
  return out;
}
