// Les 14 régions du Sénégal — utilisées pour l'inscription station et la recherche.
export const SENEGAL_REGIONS = [
  { value: 'dakar', label: 'Dakar' },
  { value: 'diourbel', label: 'Diourbel' },
  { value: 'fatick', label: 'Fatick' },
  { value: 'kaffrine', label: 'Kaffrine' },
  { value: 'kaolack', label: 'Kaolack' },
  { value: 'kedougou', label: 'Kédougou' },
  { value: 'kolda', label: 'Kolda' },
  { value: 'louga', label: 'Louga' },
  { value: 'matam', label: 'Matam' },
  { value: 'saint-louis', label: 'Saint-Louis' },
  { value: 'sedhiou', label: 'Sédhiou' },
  { value: 'tambacounda', label: 'Tambacounda' },
  { value: 'thies', label: 'Thiès' },
  { value: 'ziguinchor', label: 'Ziguinchor' },
];

export function regionLabel(value) {
  return SENEGAL_REGIONS.find(r => r.value === value)?.label || value || '';
}

// Coordonnées approximatives du chef-lieu de chaque région — filet de secours quand
// la géolocalisation précise du quartier échoue (pas de réseau, quartier introuvable...).
// Sert uniquement à situer une station dans la bonne région, pas à donner une position exacte.
export const SENEGAL_REGION_CENTROIDS = {
  'dakar': { lat: 14.6928, lng: -17.4467 },
  'diourbel': { lat: 14.6522, lng: -16.2317 },
  'fatick': { lat: 14.3390, lng: -16.4110 },
  'kaffrine': { lat: 14.1059, lng: -15.5502 },
  'kaolack': { lat: 14.1652, lng: -16.0726 },
  'kedougou': { lat: 12.5556, lng: -12.1745 },
  'kolda': { lat: 12.8983, lng: -14.9412 },
  'louga': { lat: 15.6173, lng: -16.2240 },
  'matam': { lat: 15.6559, lng: -13.2548 },
  'saint-louis': { lat: 16.0179, lng: -16.4896 },
  'sedhiou': { lat: 12.7081, lng: -15.5569 },
  'tambacounda': { lat: 13.7707, lng: -13.6673 },
  'thies': { lat: 14.7910, lng: -16.9359 },
  'ziguinchor': { lat: 12.5665, lng: -16.2733 },
};

export function regionCentroid(value) {
  return SENEGAL_REGION_CENTROIDS[value] || null;
}
