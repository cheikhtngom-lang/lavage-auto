// Analyse d'une phrase dictée pour remplir le formulaire "Ajouter un véhicule"
// (type + marque + immatriculation) sans toucher l'écran — mains occupées ou
// mouillées. Exemple : « Toyota, A A 1 8 9 D S » ou « voiture Ford matricule
// DK 9875 PM ».
//
// Fonctions pures (aucun accès réseau/navigateur) : la reconnaissance vocale
// elle-même vit dans components/ui/VoiceVehicleButton.jsx, qui appelle ce
// module avec la transcription. La liste des marques est passée en paramètre
// (getBrandsForCategory, voir vehicleBrands.js) pour que les marques
// personnalisées ajoutées par les utilisateurs soient reconnues aussi.

import { formatPlate } from './plateFormat';

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function tokenize(text) {
  const words = String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return words.map((orig) => ({ orig, norm: stripAccents(orig), used: false }));
}

// ── Type de véhicule ────────────────────────────────────────────────────
// Mots-clés dits à voix haute -> valeur de VEHICLE_CATEGORIES (vehicleBrands.js).
// Le plus long (en mots) l'emporte : "camion lourd" avant "camion".
const CATEGORY_KEYWORDS = [
  ['plus de 50 places', 'Bus / Car (+50 places)'], ['50 places', 'Bus / Car (+50 places)'],
  ['grand bus', 'Bus / Car (+50 places)'], ['autocar', 'Bus / Car (+50 places)'],
  ['camion lourd', 'Camion lourd / Remorque'], ['poids lourd', 'Camion lourd / Remorque'],
  ['semi remorque', 'Camion lourd / Remorque'], ['remorque', 'Camion lourd / Remorque'],
  ['camion leger', 'Camion léger'], ['camion', 'Camion léger'],
  ['car rapide', 'Bus / Car rapide'], ['bus', 'Bus / Car rapide'],
  ['minibus', 'Utilitaire / Minibus'], ['mini bus', 'Utilitaire / Minibus'],
  ['utilitaire', 'Utilitaire / Minibus'], ['camionnette', 'Utilitaire / Minibus'], ['clando', 'Utilitaire / Minibus'],
  ['4x4', 'SUV / 4x4'], ['4 x 4', 'SUV / 4x4'], ['quatre par quatre', 'SUV / 4x4'],
  ['suv', 'SUV / 4x4'], ['tout terrain', 'SUV / 4x4'],
  ['tricycle', 'Tricycle'], ['tuk tuk', 'Tricycle'], ['tuktuk', 'Tricycle'],
  ['moto', 'Moto / Scooter'], ['scooter', 'Moto / Scooter'], ['jakarta', 'Moto / Scooter'],
  ['voiture', 'Berline / Citadine'], ['berline', 'Berline / Citadine'], ['citadine', 'Berline / Citadine'],
].map(([phrase, category]) => ({ words: phrase.split(' '), category }))
  .sort((a, b) => b.words.length - a.words.length);

// Une marque présente dans plusieurs types (Toyota : voiture, utilitaire, bus…)
// sans type précisé : on suppose le cas le plus courant — l'utilisateur peut le
// corriger en disant le type ("moto", "camion"…) ou d'un tap.
const CATEGORY_PREFERENCE = [
  'Berline / Citadine', 'SUV / 4x4', 'Utilitaire / Minibus', 'Moto / Scooter', 'Tricycle',
  'Camion léger', 'Bus / Car rapide', 'Camion lourd / Remorque', 'Bus / Car (+50 places)',
];

// ── Marque ──────────────────────────────────────────────────────────────
const BRAND_ALIASES = {
  vw: 'Volkswagen', benz: 'Mercedes-Benz', howo: 'Sinotruk (HOWO)', fuso: 'Mitsubishi Fuso',
  'range rover': 'Land Rover',
};

function buildBrandEntries(brandsByCategory) {
  const byKey = new Map(); // nom en minuscules -> { name, cats }
  for (const [category, list] of Object.entries(brandsByCategory)) {
    for (const name of list) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, { name: name.trim(), cats: new Set() });
      byKey.get(key).cats.add(category);
    }
  }
  const entries = [];
  for (const { name, cats } of byKey.values()) {
    const words = tokenize(name).map((t) => t.norm);
    entries.push({ name, cats, words, exact: true });
    // "Mercedes" pour "Mercedes-Benz", "Renault" pour "Renault Trucks"…
    if (words.length > 1 && words[0].length >= 4) entries.push({ name, cats, words: [words[0]], exact: false });
  }
  for (const [alias, target] of Object.entries(BRAND_ALIASES)) {
    const hit = byKey.get(target.toLowerCase());
    if (hit) entries.push({ name: hit.name, cats: hit.cats, words: tokenize(alias).map((t) => t.norm), exact: false });
  }
  return entries;
}

// ── Immatriculation ─────────────────────────────────────────────────────
const DIGIT_WORDS = { zero: '0', un: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9' };
// Noms de lettres accentués (« bé », « dé »…) : à lire AVANT de retirer les accents.
const ACCENT_LETTERS = {
  'bé': 'B', 'cé': 'C', 'dé': 'D', 'gé': 'G', 'pé': 'P', 'té': 'T', 'vé': 'V',
  'èf': 'F', 'èl': 'L', 'èm': 'M', 'èn': 'N', 'èr': 'R', 'ès': 'S',
};
const LETTER_ALIASES = {
  bee: 'B', bi: 'B', ef: 'F', eff: 'F', ji: 'G', gi: 'G', ash: 'H', ache: 'H', hache: 'H',
  ka: 'K', el: 'L', em: 'M', emme: 'M', enne: 'N', pe: 'P', ku: 'Q', er: 'R', erre: 'R', esse: 'S',
  ve: 'V', ix: 'X', iks: 'X', igrec: 'Y', zed: 'Z', zede: 'Z',
};
// Mots courts français qu'une transcription glisse entre les éléments — ils ne
// comptent pas comme lettres de plaque, sauf juste après un chiffre : « 189 DE »
// est bien la fin de la plaque.
const FILLER = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'et', 'ou', 'au', 'aux', 'en', 'ce', 'ca', 'je', 'tu', 'il', 'on',
  'est', 'sur', 'par', 'que', 'qui', 'ici', 'moi', 'mon', 'ton', 'son', 'ma', 'ta', 'sa',
]);
const PLATE_MARKERS = new Set(['matricule', 'immatriculation', 'immat', 'plaque', 'numero']);
const NO_PLATE_PHRASES = [
  'sans plaque', 'sans matricule', 'sans immatriculation', 'sans numero',
  'pas de plaque', 'pas de matricule', 'pas d immatriculation', 'pas de numero',
  'pas encore de plaque', 'pas encore de matricule', 'pas encore d immatriculation',
  'aucune plaque', 'aucun matricule', 'aucune immatriculation',
].map((phrase) => phrase.split(' '));

const isNumeric = (t) => !!t && (/^\d+$/.test(t.norm) || t.norm in DIGIT_WORDS);

function plateCharsFrom(seq) {
  let out = '';
  seq.forEach((t, i) => {
    if (/^\d+$/.test(t.norm)) { out += t.norm; return; }
    if (t.norm in DIGIT_WORDS) { out += DIGIT_WORDS[t.norm]; return; }
    if (t.orig in ACCENT_LETTERS) { out += ACCENT_LETTERS[t.orig]; return; }
    if (t.norm in LETTER_ALIASES) { out += LETTER_ALIASES[t.norm]; return; }
    if (FILLER.has(t.norm)) { if (isNumeric(seq[i - 1])) out += t.norm; return; }
    if (/^[a-z]{1,3}$/.test(t.norm)) { out += t.norm; return; }          // A, AA, DK, DS…
    if (/^[a-z0-9]+$/.test(t.norm) && /\d/.test(t.norm)) out += t.norm; // aa189ds, 189ds…
    // Le reste (« matricule », « tiret », un nom de modèle…) est du bruit.
  });
  return out.toUpperCase();
}

// Extrait la plaque du bruit restant. Format sénégalais standard d'abord
// (2 lettres, 3-4 chiffres, 2 lettres : AA-900-DK), puis un format plus large,
// pour ignorer un modèle collé devant (« Peugeot 208 » -> "208AA189DS").
function extractPlate(seq) {
  const afterMarker = seq.slice(seq.findIndex((t) => PLATE_MARKERS.has(t.norm)) + 1);
  const hasMarker = afterMarker.length < seq.length;
  for (const candidate of hasMarker ? [afterMarker, seq] : [seq]) {
    const chars = plateCharsFrom(candidate);
    if (!/\d/.test(chars)) continue;
    const strict = chars.match(/[A-Z]{2}\d{3,4}[A-Z]{2}/) || chars.match(/[A-Z]{1,3}\d{1,5}[A-Z]{1,3}/);
    return { plate: formatPlate(strict ? strict[0] : chars), complete: !!strict };
  }
  return { plate: '', complete: false };
}

// ── Analyse complète ────────────────────────────────────────────────────
// Cherche la suite de mots `words` parmi les mots pas encore consommés ; si
// elle y est, la marque comme consommée et retourne true.
function consumeWords(tokens, words) {
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (words.every((w, k) => !tokens[i + k].used && tokens[i + k].norm === w)) {
      for (let k = 0; k < words.length; k++) tokens[i + k].used = true;
      return true;
    }
  }
  return false;
}

function findCategory(tokens) {
  for (const kw of CATEGORY_KEYWORDS) {
    if (consumeWords(tokens, kw.words)) return kw.category;
  }
  return '';
}

// « sans plaque », « pas de plaque »… — le véhicule n'a pas (encore) de plaque.
function findNoPlate(tokens) {
  return NO_PLATE_PHRASES.some((words) => consumeWords(tokens, words));
}

// Comparaison lexicographique de deux scores [a, b, c].
const beats = (a, b) => {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
  return false;
};

function findBrand(tokens, entries, preferredCategory) {
  let best = null;
  for (const entry of entries) {
    const n = entry.words.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (!entry.words.every((w, k) => !tokens[i + k].used && tokens[i + k].norm === w)) continue;
      // « 189 MG » : un sigle court juste après un chiffre est la fin de la plaque, pas la marque.
      if (n === 1 && entry.words[0].length <= 3 && isNumeric(tokens[i - 1])) continue;
      const score = [n, preferredCategory && entry.cats.has(preferredCategory) ? 1 : 0, entry.exact ? 1 : 0];
      if (!best || beats(score, best.score)) best = { entry, start: i, n, score };
    }
  }
  if (!best) return null;
  for (let k = 0; k < best.n; k++) tokens[best.start + k].used = true;
  return best.entry;
}

function parseOne(transcript, { entries, currentCategory }) {
  const tokens = tokenize(transcript);
  const noPlate = findNoPlate(tokens);
  const spokenCategory = findCategory(tokens);
  const brandEntry = findBrand(tokens, entries, spokenCategory || currentCategory);
  // « Sans plaque » l'emporte sur d'éventuels chiffres restants (un modèle, une année…).
  const { plate, complete } = noPlate ? { plate: '', complete: false } : extractPlate(tokens.filter((t) => !t.used));

  let category = spokenCategory;
  if (!category && brandEntry && !(currentCategory && brandEntry.cats.has(currentCategory))) {
    category = CATEGORY_PREFERENCE.find((c) => brandEntry.cats.has(c)) || [...brandEntry.cats][0] || '';
  }
  const score = (brandEntry ? 2 : 0) + (plate ? 1 : 0) + (complete || noPlate ? 2 : 0) + (spokenCategory ? 1 : 0);
  return { category, brand: brandEntry ? brandEntry.name : '', plate, noPlate, heard: transcript, score };
}

// `alternatives` : les hypothèses de la reconnaissance vocale (la meilleure
// d'abord) — on garde celle qui donne le résultat le plus exploitable, une
// marque mal entendue étant fréquente.
// `brandsByCategory` : { [valeur de catégorie]: string[] }.
// `currentCategory` : type déjà choisi dans le formulaire ('' si aucun).
// Retourne { category, brand, plate, heard } — `category` n'est renseigné que
// s'il faut CHANGER le type courant ; une valeur vide = ne rien modifier.
export function parseVehicleSpeech(alternatives, { brandsByCategory, currentCategory = '' }) {
  const entries = buildBrandEntries(brandsByCategory);
  const list = (Array.isArray(alternatives) ? alternatives : [alternatives]).filter(Boolean);
  let best = null;
  for (const text of list) {
    const parsed = parseOne(text, { entries, currentCategory });
    if (!best || parsed.score > best.score) best = parsed;
  }
  if (!best) return { category: '', brand: '', plate: '', noPlate: false, heard: '' };
  const { score, ...result } = best;
  return result;
}

// Applique un résultat vocal à un état { category, brand, plate, noPlate } de
// formulaire : ne remplace que ce qui a été entendu, et vide la marque si le
// type change (une marque n'est valable que pour son type — voir BrandDropdown).
// « sans plaque » coche `noPlate` et vide la plaque ; dicter une plaque le décoche.
export function applyVoiceToVehicleForm(form, { category, brand, plate, noPlate }) {
  const nextCategory = category || form.category;
  const categoryChanged = nextCategory !== form.category;
  return {
    ...form,
    category: nextCategory,
    brand: brand || (categoryChanged ? '' : form.brand),
    plate: noPlate ? '' : (plate || form.plate),
    noPlate: noPlate || (plate ? false : !!form.noPlate),
  };
}
