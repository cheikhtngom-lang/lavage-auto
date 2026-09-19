// Registre des pays servis par la plateforme et de leurs subdivisions de premier
// niveau, utilisées pour l'inscription d'une station et pour la recherche.
// Remplace la liste unique des régions du Sénégal (regions.js n'est plus qu'un
// point d'entrée de compatibilité vers ce fichier).
//
// Périmètre actuel : zone FCFA francophone. Même monnaie (FCFA / XOF) et même
// langue que le Sénégal : aucune adaptation de devise ni de traduction.
//
// « Déclaré » ici = une station peut s'y inscrire (recrutement des stations
// pilotes). « Ouvert » = visible des clients : c'est l'interrupteur
// platform_countries.open (Super Admin > Paramètres), voir add_country_support.sql.
//
// Niveaux administratifs retenus (à corriger ici si l'exploitant en veut un autre) :
//   SN régions (14) · CI districts (14) · ML régions + district de Bamako (11) ·
//   BF régions (13) · BJ départements (12) · TG régions (5) · NE régions + Niamey (8).
// Les coordonnées sont celles du chef-lieu (ou de la ville principale) : elles ne
// servent qu'à situer approximativement une station quand le quartier saisi est
// introuvable (voir geocoding.js), pas à afficher une position exacte.
//
// Sans dépendance : importable depuis les pages HTML (type="module"), React et Node.

export const DEFAULT_COUNTRY = 'SN';

const r = (value, label, lat, lng) => ({ value, label, lat, lng });

export const COUNTRIES = [
  {
    code: 'SN', name: 'Sénégal', dialCode: '+221', geocodeCode: 'sn', regionWord: 'Région',
    regions: [
      r('dakar', 'Dakar', 14.6928, -17.4467),
      r('diourbel', 'Diourbel', 14.6522, -16.2317),
      r('fatick', 'Fatick', 14.3390, -16.4110),
      r('kaffrine', 'Kaffrine', 14.1059, -15.5502),
      r('kaolack', 'Kaolack', 14.1652, -16.0726),
      r('kedougou', 'Kédougou', 12.5556, -12.1745),
      r('kolda', 'Kolda', 12.8983, -14.9412),
      r('louga', 'Louga', 15.6173, -16.2240),
      r('matam', 'Matam', 15.6559, -13.2548),
      r('saint-louis', 'Saint-Louis', 16.0179, -16.4896),
      r('sedhiou', 'Sédhiou', 12.7081, -15.5569),
      r('tambacounda', 'Tambacounda', 13.7707, -13.6673),
      r('thies', 'Thiès', 14.7910, -16.9359),
      r('ziguinchor', 'Ziguinchor', 12.5665, -16.2733),
    ],
  },
  {
    code: 'CI', name: "Côte d'Ivoire", dialCode: '+225', geocodeCode: 'ci', regionWord: 'District',
    regions: [
      r('abidjan', 'Abidjan', 5.3600, -4.0083),
      r('yamoussoukro', 'Yamoussoukro', 6.8276, -5.2893),
      r('bas-sassandra', 'Bas-Sassandra', 4.7485, -6.6363),
      r('comoe', 'Comoé', 6.7280, -3.4900),
      r('denguele', 'Denguélé', 9.5100, -7.5600),
      r('goh-djiboua', 'Gôh-Djiboua', 6.1319, -5.9506),
      r('lacs', 'Lacs', 6.6500, -4.7100),
      r('lagunes', 'Lagunes', 5.3300, -4.3800),
      r('montagnes', 'Montagnes', 7.4125, -7.5538),
      r('sassandra-marahoue', 'Sassandra-Marahoué', 6.8828, -6.4502),
      r('savanes', 'Savanes', 9.4580, -5.6290),
      r('vallee-du-bandama', 'Vallée du Bandama', 7.6900, -5.0300),
      r('woroba', 'Woroba', 7.9600, -6.6700),
      r('zanzan', 'Zanzan', 8.0400, -2.8000),
    ],
  },
  {
    code: 'ML', name: 'Mali', dialCode: '+223', geocodeCode: 'ml', regionWord: 'Région',
    regions: [
      r('bamako', 'Bamako (district)', 12.6392, -8.0029),
      r('kayes', 'Kayes', 14.4469, -11.4444),
      r('koulikoro', 'Koulikoro', 12.8628, -7.5599),
      r('sikasso', 'Sikasso', 11.3176, -5.6666),
      r('segou', 'Ségou', 13.4317, -6.2157),
      r('mopti', 'Mopti', 14.4843, -4.1830),
      r('tombouctou', 'Tombouctou', 16.7666, -3.0026),
      r('gao', 'Gao', 16.2717, -0.0447),
      r('kidal', 'Kidal', 18.4411, 1.4078),
      r('menaka', 'Ménaka', 15.9156, 2.3960),
      r('taoudenit', 'Taoudénit', 22.6767, -3.9838),
    ],
  },
  {
    code: 'BF', name: 'Burkina Faso', dialCode: '+226', geocodeCode: 'bf', regionWord: 'Région',
    regions: [
      r('boucle-du-mouhoun', 'Boucle du Mouhoun', 12.4636, -3.4600),
      r('cascades', 'Cascades', 10.6333, -4.7667),
      r('centre', 'Centre', 12.3714, -1.5197),
      r('centre-est', 'Centre-Est', 11.7833, -0.3667),
      r('centre-nord', 'Centre-Nord', 13.0917, -1.0844),
      r('centre-ouest', 'Centre-Ouest', 12.2500, -2.3667),
      r('centre-sud', 'Centre-Sud', 11.6667, -1.0667),
      r('est', 'Est', 12.0619, 0.3592),
      r('hauts-bassins', 'Hauts-Bassins', 11.1771, -4.2979),
      r('nord', 'Nord', 13.5828, -2.4216),
      r('plateau-central', 'Plateau-Central', 12.5833, -1.3000),
      r('sahel', 'Sahel', 14.0353, -0.0300),
      r('sud-ouest', 'Sud-Ouest', 10.3333, -3.1833),
    ],
  },
  {
    code: 'BJ', name: 'Bénin', dialCode: '+229', geocodeCode: 'bj', regionWord: 'Département',
    regions: [
      r('alibori', 'Alibori', 11.1300, 2.9400),
      r('atacora', 'Atacora', 10.3000, 1.3800),
      r('atlantique', 'Atlantique', 6.6600, 2.1500),
      r('borgou', 'Borgou', 9.3400, 2.6300),
      r('collines', 'Collines', 7.7500, 2.1800),
      r('couffo', 'Couffo', 6.9300, 1.6800),
      r('donga', 'Donga', 9.7100, 1.6700),
      r('littoral', 'Littoral (Cotonou)', 6.3703, 2.3912),
      r('mono', 'Mono', 6.6400, 1.7200),
      r('oueme', 'Ouémé', 6.4969, 2.6289),
      r('plateau', 'Plateau', 6.9800, 2.6700),
      r('zou', 'Zou', 7.1800, 1.9900),
    ],
  },
  {
    code: 'TG', name: 'Togo', dialCode: '+228', geocodeCode: 'tg', regionWord: 'Région',
    regions: [
      r('maritime', 'Maritime (Lomé)', 6.1319, 1.2228),
      r('plateaux', 'Plateaux', 7.5333, 1.1333),
      r('centrale', 'Centrale', 8.9833, 1.1333),
      r('kara', 'Kara', 9.5511, 1.1861),
      r('savanes', 'Savanes', 10.8600, 0.2100),
    ],
  },
  {
    code: 'NE', name: 'Niger', dialCode: '+227', geocodeCode: 'ne', regionWord: 'Région',
    regions: [
      r('niamey', 'Niamey', 13.5116, 2.1254),
      r('agadez', 'Agadez', 16.9742, 7.9911),
      r('diffa', 'Diffa', 13.3150, 12.6110),
      r('dosso', 'Dosso', 13.0490, 3.1937),
      r('maradi', 'Maradi', 13.5000, 7.1017),
      r('tahoua', 'Tahoua', 14.8888, 5.2692),
      r('tillaberi', 'Tillabéri', 14.2100, 1.4500),
      r('zinder', 'Zinder', 13.8070, 8.9881),
    ],
  },
];

export function getCountry(code) {
  return COUNTRIES.find((c) => c.code === code) || null;
}

export function isKnownCountry(code) {
  return !!getCountry(code);
}

export function countryName(code) {
  return getCountry(code)?.name || code || '';
}

// Régions d'un pays : [{ value, label, lat, lng }]. Pays inconnu = liste vide.
export function regionsOf(code) {
  return getCountry(code)?.regions || [];
}

// Libellé d'une région. Une même valeur peut exister dans deux pays (ex. « savanes »
// en Côte d'Ivoire et au Togo) : on cherche d'abord dans le pays donné, puis ailleurs.
export function regionLabel(value, country = DEFAULT_COUNTRY) {
  if (!value) return '';
  const own = regionsOf(country).find((x) => x.value === value);
  if (own) return own.label;
  for (const c of COUNTRIES) {
    const hit = c.regions.find((x) => x.value === value);
    if (hit) return hit.label;
  }
  return value;
}

export function regionCentroid(value, country = DEFAULT_COUNTRY) {
  const hit = regionsOf(country).find((x) => x.value === value);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}
