// Catégories de véhicules + marques associées, pour le formulaire "Ajouter un véhicule"
// du garage automobiliste (src/pages/Client/Garage.jsx).
//
// Les marques personnalisées ajoutées par les utilisateurs (marque absente de la liste)
// sont persistées dans localStorage et fusionnées avec la liste de base, pour toute
// l'application (en attendant un vrai backend partagé).

const CUSTOM_BRANDS_KEY = 'customVehicleBrands';

// `pricingCategory` correspond aux clés de pricingConfig/durationConfig (useAppState) —
// utilisé pour facturer correctement une réservation faite avec un véhicule du garage.
export const VEHICLE_CATEGORIES = [
  { value: 'Moto / Scooter', label: '🏍️ Moto / Scooter', pricingCategory: 'Moto' },
  { value: 'Berline / Citadine', label: '🚗 Berline / Citadine', pricingCategory: 'Particulier' },
  { value: 'SUV / 4x4', label: '🚙 SUV / 4x4', pricingCategory: 'Particulier' },
  { value: 'Utilitaire / Minibus', label: '🚐 Minibus (6 places) / Utilitaire', pricingCategory: 'Transport' },
  { value: 'Bus / Car rapide', label: '🚌 Bus / Car rapide', pricingCategory: 'Transport' },
  { value: 'Camion léger', label: '🚚 Camion léger', pricingCategory: 'Camion' },
  { value: 'Camion lourd / Remorque', label: '🚛 Camion lourd / Remorque', pricingCategory: 'Camion' },
  { value: 'Bus / Car (+50 places)', label: '🚍 Bus / Car (+50 places)', pricingCategory: 'Camion' },
];

export function getPricingCategory(category) {
  return VEHICLE_CATEGORIES.find((c) => c.value === category)?.pricingCategory || 'Particulier';
}

// Libellés conviviaux des catégories de tarification (pricingConfig/durationConfig),
// utilisés partout où l'admin ou le client voit une catégorie brute affichée
// (grille tarifaire, badge de la file d'attente...).
export const PRICING_CATEGORY_LABELS = {
  Moto: 'Moto / Scooter',
  Particulier: 'Voitures Particulières',
  Transport: 'Bus et Minibus',
  Camion: 'Camion et Bus +50 places',
};

const MOTO_BRANDS = [
  'Yamaha', 'Honda', 'Suzuki', 'Kawasaki', 'TVS', 'Bajaj', 'Hero', 'Haojue',
  'SYM', 'KTM', 'Peugeot Motocycles', 'Piaggio', 'Vespa', 'Royal Enfield',
  'CFMoto', 'Lifan', 'Zongshen', 'Kymco', 'Sanya', 'Loncin', 'Qlink', 'Sanili',
];

const CAR_BRANDS = [
  'Toyota', 'Renault', 'Peugeot', 'Hyundai', 'Kia', 'Nissan', 'Mercedes-Benz',
  'BMW', 'Audi', 'Volkswagen', 'Ford', 'Chevrolet', 'Suzuki', 'Mitsubishi',
  'Mazda', 'Honda', 'Dacia', 'Citroën', 'Fiat', 'Opel', 'Skoda', 'Seat',
  'Volvo', 'Land Rover', 'Jeep', 'Lexus', 'Subaru', 'Isuzu', 'Chery',
  'Geely', 'Haval', 'BYD', 'MG', 'Changan', 'JAC', 'Dongfeng', 'Foton',
  'Tata', 'Mahindra', 'SsangYong', 'Infiniti', 'Jaguar', 'Porsche', 'Mini',
  'Alfa Romeo', 'Daihatsu',
];

const UTILITY_BRANDS = [
  'Toyota', 'Renault', 'Peugeot', 'Hyundai', 'Mercedes-Benz', 'Ford', 'Fiat',
  'Citroën', 'Nissan', 'Volkswagen', 'Iveco', 'Isuzu', 'Kia', 'Opel',
];

const TRUCK_BRANDS = [
  'Mercedes-Benz', 'MAN', 'Volvo', 'Scania', 'Iveco', 'Isuzu', 'Tata',
  'Ashok Leyland', 'Renault Trucks', 'DAF', 'Hino', 'FAW', 'Foton', 'JAC',
  'Dongfeng', 'Sinotruk (HOWO)', 'Mitsubishi Fuso',
];

const BUS_BRANDS = [
  'Mercedes-Benz', 'Toyota', 'Higer', 'King Long', 'Golden Dragon', 'Yutong',
  'Ashok Leyland', 'Tata', 'Iveco', 'MAN', 'Volvo', 'Scania',
];

const BRANDS_BY_CATEGORY = {
  'Moto / Scooter': MOTO_BRANDS,
  'Berline / Citadine': CAR_BRANDS,
  'SUV / 4x4': CAR_BRANDS,
  'Utilitaire / Minibus': UTILITY_BRANDS,
  'Bus / Car rapide': BUS_BRANDS,
  'Camion léger': TRUCK_BRANDS,
  'Camion lourd / Remorque': TRUCK_BRANDS,
  'Bus / Car (+50 places)': BUS_BRANDS,
};

function readCustomBrands() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_BRANDS_KEY)) || {}; } catch { return {}; }
}

function writeCustomBrands(map) {
  localStorage.setItem(CUSTOM_BRANDS_KEY, JSON.stringify(map));
}

export function getBrandsForCategory(category) {
  const base = BRANDS_BY_CATEGORY[category] || [];
  const custom = readCustomBrands()[category] || [];
  const seen = new Set();
  const merged = [];
  for (const brand of [...base, ...custom]) {
    const key = brand.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(brand.trim());
  }
  return merged.sort((a, b) => a.localeCompare(b, 'fr'));
}

// Ajoute une nouvelle marque à la liste d'une catégorie (persisté dans localStorage,
// pris en compte pour toute l'application dès le prochain rendu de la liste).
export function addCustomBrand(category, brand) {
  const clean = (brand || '').trim();
  if (!clean) return getBrandsForCategory(category);

  const existing = getBrandsForCategory(category);
  const alreadyThere = existing.some((b) => b.toLowerCase() === clean.toLowerCase());
  if (!alreadyThere) {
    const map = readCustomBrands();
    map[category] = [...(map[category] || []), clean];
    writeCustomBrands(map);
  }
  return getBrandsForCategory(category);
}
