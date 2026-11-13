// Tapis et moquettes déposés à la station (voir add_carpet_cleaning.sql), et
// chaussures sur le même principe (add_shoe_cleaning.sql : même table, colonne
// `activity`). Partagé par les rubriques station (/admin/tapis,
// /admin/chaussures), l'espace automobiliste (/dashboard/tapis, « Mes
// dépôts ») et la page publique du lien de suivi (/tapis.html).
import { supabase } from './supabaseClient';
import { whatsappLink } from './subscriptionReminders';

// Service inscrit dans `transactions` à l'encaissement : c'est lui qui range
// la recette à part en Comptabilité / Analytique / Bilan.
export const CARPET_SERVICE = 'Tapis';
export const isCarpetRevenue = (entry) => entry.service === CARPET_SERVICE;

export const CARPET_KINDS = ['Tapis de salon', 'Moquette', 'Tapis de prière', 'Tapis de voiture', 'Autre'];

// ─── Activités : tapis, chaussures, salon, pressing ──────────────────
// Même parcours (dépôt, ticket, lien de suivi, étapes, encaissement) ; ce qui
// change : libellés, types de pièces, service inscrit en Comptabilité, et
// quelques options (traitement par article et express pour le pressing,
// intervention à domicile pour le salon, collecte et livraison pour le
// pressing). Chaque activité est un module payant que le Super Admin active
// pour une station (lib/stationModules.js, add_salon_pressing.sql).
export const SHOE_SERVICE = 'Chaussures';
export const SHOE_KINDS = ['Baskets', 'Chaussures en cuir', 'Daim / nubuck', 'Talons', 'Bottes', 'Sandales', 'Autre'];
export const SALON_SERVICE = 'Salon';
export const SALON_KINDS = ['Canapé 2 places', 'Canapé 3 places', "Canapé d'angle", 'Fauteuil', 'Chaise', 'Pouf', 'Matelas', 'Coussins', 'Autre'];
export const PRESSING_SERVICE = 'Pressing';
export const PRESSING_KINDS = [
  'Chemise', 'Pantalon', 'Costume', 'Veste', 'Robe', 'Grand boubou', 'Boubou, caftan', 'Taille basse', 'Jupe',
  'T-shirt, polo', 'Jean', 'Drap', 'Couette', 'Rideau', 'Nappe', 'Cravate', 'Autre',
];
// Traitements d'un article de pressing : le prix de base de l'article
// (Tarifs) multiplié par le coefficient (modifiable dans Tarifs).
export const PRESSING_TREATMENTS = [
  { key: 'lavage', label: 'Lavage + repassage', factor: 1 },
  { key: 'sec', label: 'Nettoyage à sec', factor: 1.5 },
  { key: 'repassage', label: 'Repassage seul', factor: 0.5 },
  { key: 'detachage', label: 'Détachage', factor: 1.2 },
];
export const DEFAULT_TREATMENT = PRESSING_TREATMENTS[0].label;

// Étapes et libellés par défaut (tapis, chaussures).
const DEFAULT_STEPS = ['Déposé', 'Lavage', 'Séchage', 'Prêt'];
const DEFAULT_STATUS_LABELS = { depose: 'Déposé', lavage: 'En lavage', sechage: 'Au séchage', pret: 'Prêt à récupérer', recupere: 'Récupéré', annule: 'Annulé' };
const DEFAULT_ACTIONS = { depose: 'Mettre en lavage', lavage: 'Mettre au séchage', sechage: 'Marquer prêt', pret: 'Remis au client' };

export const ACTIVITIES = {
  tapis: {
    key: 'tapis', service: CARPET_SERVICE, nav: 'Tapis', title: 'Tapis et moquettes', href: '/admin/tapis', module: 'mod_tapis',
    kinds: CARPET_KINDS, unit: 'pièce', units: 'pièces', unitCap: 'Pièce', things: 'tapis',
    piecesLegend: 'Pièces déposées', editorHint: "Touchez le type de pièce pour l'ajouter. Chaque pièce a sa taille, son prix et sa note.",
    sizeLabel: 'Taille', sizePlaceholder: '2 x 3 m', pricePlaceholder: '5000', notePlaceholder: 'Taches, franges abîmées…',
    intro: 'Dépôts des clients et des stations partenaires, avancement du lavage et lien de suivi.',
    empty: 'Enregistrez les tapis et moquettes déposés par vos clients. Ils reçoivent un lien pour suivre le lavage et savoir quand passer les récupérer.',
    suggested: { 'Tapis de salon': 5000, Moquette: 6000, 'Tapis de prière': 1500, 'Tapis de voiture': 1000 },
    // Pesage : tapis au kilo (même procédure que le pressing).
    kilo: { kind: 'Tapis au kilo', services: [
      { code: 'LAV-01', label: 'Lavage seul', price: 800, hours: 48 },
      { code: 'LAV-02', label: 'Lavage + Séchage', price: 1000, hours: 72 },
    ] },
  },
  chaussures: {
    key: 'chaussures', service: SHOE_SERVICE, nav: 'Chaussures', title: 'Lavage de chaussures', href: '/admin/chaussures', module: 'mod_chaussures',
    kinds: SHOE_KINDS, unit: 'paire', units: 'paires', unitCap: 'Paire', things: 'chaussures',
    piecesLegend: 'Paires déposées', editorHint: 'Touchez le type de chaussures pour ajouter une paire. Chaque paire a sa pointure, son prix et sa note.',
    sizeLabel: 'Pointure, couleur', sizePlaceholder: '42, blanches', pricePlaceholder: '2000', notePlaceholder: "Semelle décollée, tache d'encre…",
    intro: 'Chaussures déposées par les clients et les stations partenaires, avancement du lavage et lien de suivi.',
    empty: 'Enregistrez les chaussures déposées par vos clients. Ils reçoivent un lien pour suivre le lavage et savoir quand passer les récupérer.',
    suggested: { Baskets: 2000, 'Chaussures en cuir': 2500, 'Daim / nubuck': 3000, Talons: 2000, Bottes: 3000, Sandales: 1500 },
  },
  salon: {
    key: 'salon', service: SALON_SERVICE, nav: 'Salon', title: 'Salons et fauteuils', href: '/admin/salon', module: 'mod_salon',
    kinds: SALON_KINDS, unit: 'pièce', units: 'pièces', unitCap: 'Pièce', things: 'meubles',
    piecesLegend: 'Pièces à nettoyer', editorHint: "Touchez le type de meuble pour l'ajouter. Chaque pièce a son tissu, son prix et sa note.",
    sizeLabel: 'Tissu, couleur', sizePlaceholder: 'Velours gris', pricePlaceholder: '10000', notePlaceholder: 'Tache de jus, poils d’animaux…',
    intro: 'Canapés, fauteuils et matelas, à la station ou chez le client : rendez-vous, avancement et lien de suivi.',
    empty: 'Enregistrez les salons à nettoyer, à la station ou à domicile. Le client reçoit un lien pour suivre le nettoyage.',
    suggested: { 'Canapé 2 places': 10000, 'Canapé 3 places': 15000, "Canapé d'angle": 25000, Fauteuil: 5000, Chaise: 1500, Pouf: 2000, Matelas: 10000, Coussins: 500 },
    steps: ['Enregistré', 'Nettoyage', 'Séchage', 'Prêt'],
    statusLabels: { depose: 'Enregistré', lavage: 'Nettoyage', sechage: 'Séchage', pret: 'Prêt', recupere: 'Terminé' },
    actions: { depose: 'Commencer le nettoyage', lavage: 'Mettre au séchage', sechage: 'Marquer prêt', pret: 'Terminé' },
    // Intervention chez le client : adresse et frais de déplacement.
    places: [['station', 'À la station'], ['domicile', 'À domicile']],
    homeLabel: 'Intervention à domicile', feeLabel: 'Frais de déplacement',
  },
  pressing: {
    key: 'pressing', service: PRESSING_SERVICE, nav: 'Pressing', title: 'Pressing', href: '/admin/pressing', module: 'mod_pressing',
    kinds: PRESSING_KINDS, unit: 'article', units: 'articles', unitCap: 'Article', things: 'vêtements',
    piecesLegend: 'Articles déposés', editorHint: 'Touchez un article pour l’ajouter, puis choisissez le traitement : le prix suit vos tarifs.',
    sizeLabel: 'Couleur, marque', sizePlaceholder: 'Blanche, Zara', pricePlaceholder: '500', notePlaceholder: 'Bouton manquant, tache d’huile…',
    intro: 'Vêtements et linge : ticket et étiquettes, avance, emplacement, livraison et lien de suivi.',
    empty: 'Enregistrez les vêtements déposés : chaque article a son traitement, son prix et son étiquette. Le client suit son linge avec un lien.',
    suggested: {
      Chemise: 500, Pantalon: 700, Costume: 3000, Veste: 2000, Robe: 1500, 'Grand boubou': 3000, 'Boubou, caftan': 1500, 'Taille basse': 1500,
      Jupe: 700, 'T-shirt, polo': 400, Jean: 700, Drap: 1000, Couette: 3500, Rideau: 2000, Nappe: 1000, Cravate: 500,
    },
    steps: ['Reçu', 'Nettoyage', 'Repassage', 'Prêt'],
    statusLabels: { depose: 'Reçu', lavage: 'Au nettoyage', sechage: 'Au repassage', pret: 'Prêt à retirer', recupere: 'Retiré' },
    actions: { depose: 'Mettre au nettoyage', lavage: 'Mettre au repassage', sechage: 'Marquer prêt', pret: 'Remis au client' },
    treatments: true, express: true, racks: true, labels: true, defaultDelay: 72,
    // Pesage (13/11/2026) : linge au kilo, prix au kilo et heures de travail fixés par le pressing.
    kilo: { kind: 'Linge au kilo', services: [
      { code: 'LAV-01', label: 'Lavage seul', price: 500, hours: 24 },
      { code: 'LAV-02', label: 'Lavage + Séchage', price: 700, hours: 48 },
      { code: 'LAV-03', label: 'Lavage + Séchage + Repassage', price: 1000, hours: 72 },
    ] },
    places: [['station', 'Dépôt à la station'], ['domicile', 'Collecte et livraison']],
    homeLabel: 'Livraison à domicile', feeLabel: 'Frais de livraison',
  },
};
export { ACTIVITY_KEYS, stationHasActivity } from './stationModules';
export const activityConfig = (key) => ACTIVITIES[key] || ACTIVITIES.tapis;
// Services inscrits dans `transactions` par les dépôts (hors lavage auto).
export const DEPOSIT_SERVICES = Object.values(ACTIVITIES).map((a) => a.service);
export const isDepositService = (service) => DEPOSIT_SERVICES.includes(service);
// « 1 pièce », « 3 paires »
export const unitCount = (n, cfg) => `${n} ${n > 1 ? cfg.units : cfg.unit}`;
// Rubrique de l'espace automobiliste qui regroupe tous les dépôts.
export const CLIENT_DEPOSITS_LABEL = 'Mes dépôts';

// Délais proposés au dépôt, en heures.
export const CARPET_DELAYS = [24, 48, 72, 120];
export const DEFAULT_CARPET_DELAY = 48;

// Étapes visibles par le client, dans l'ordre (libellés propres à l'activité).
const STEP_KEYS = ['depose', 'lavage', 'sechage', 'pret'];
export const stepsFor = (activity) => {
  const labels = activityConfig(activity).steps || DEFAULT_STEPS;
  return STEP_KEYS.map((key, i) => ({ key, label: labels[i] }));
};
export const CARPET_STEPS = stepsFor('tapis');

export const CARPET_STATUS = {
  depose: { label: 'Déposé', tone: 'neutral' },
  lavage: { label: 'En lavage', tone: 'blue' },
  sechage: { label: 'Au séchage', tone: 'cyan' },
  pret: { label: 'Prêt à récupérer', tone: 'emerald' },
  recupere: { label: 'Récupéré', tone: 'neutral' },
  annule: { label: 'Annulé', tone: 'red' },
};
// Libellé d'un statut pour une activité ; pressing livré : « Prêt à livrer », « Livré ».
export function statusInfo(activity, status, place) {
  const base = CARPET_STATUS[status] || CARPET_STATUS.depose;
  const cfg = activityConfig(activity);
  let label = (cfg.statusLabels || DEFAULT_STATUS_LABELS)[status] || base.label;
  if (place === 'domicile' && activity === 'pressing') {
    if (status === 'pret') label = 'Prêt à livrer';
    if (status === 'recupere') label = 'Livré';
  }
  return { ...base, label };
}

// Statut suivant proposé par le bouton principal de la station.
export const NEXT_STATUS = { depose: 'lavage', lavage: 'sechage', sechage: 'pret', pret: 'recupere' };
export const NEXT_ACTION_LABEL = DEFAULT_ACTIONS;
export function actionLabel(activity, status, place) {
  if (place === 'domicile' && activity === 'pressing' && status === 'pret') return 'Livré au client';
  return (activityConfig(activity).actions || DEFAULT_ACTIONS)[status];
}

// ─── Tarifs de la station (deposit_price_lists, add_salon_pressing.sql) ─
// prices : { "Chemise": 500, … } ; options : { expressRate: 50, travelFee: 1000,
// factors: { sec: 1.5, … } }. Une liste vide = aucun prix proposé.
export const DEFAULT_EXPRESS_RATE = 50;
export const emptyPriceList = () => ({ prices: {}, options: {} });
export const treatmentFactor = (priceList, label) => {
  const t = PRESSING_TREATMENTS.find((x) => x.label === label) || PRESSING_TREATMENTS[0];
  const custom = Number(priceList?.options?.factors?.[t.key]);
  return custom > 0 ? custom : t.factor;
};
// Prix proposé pour une pièce : tarif de l'article × coefficient du traitement, arrondi à 50 F.
export function suggestedPiecePrice(priceList, kind, treatment) {
  const base = parseInt(priceList?.prices?.[kind], 10) || 0;
  if (!base) return '';
  const factor = treatment ? treatmentFactor(priceList, treatment) : 1;
  return String(Math.round((base * factor) / 50) * 50);
}
export const expressRate = (priceList) => {
  const raw = priceList?.options?.expressRate;
  const r = Number(raw);
  return raw !== undefined && raw !== '' && r >= 0 ? r : DEFAULT_EXPRESS_RATE;
};
export const expressFeeFor = (piecesSum, rate) => Math.round(((piecesSum || 0) * (rate || 0)) / 100 / 50) * 50;

export async function loadPriceList(stationId, activity) {
  if (!stationId || stationId === 'default') return emptyPriceList();
  const { data, error } = await supabase.from('deposit_price_lists').select('prices, options').eq('station_id', stationId).eq('activity', activity).maybeSingle();
  if (error || !data) return emptyPriceList();
  return { prices: data.prices || {}, options: data.options || {} };
}
export async function savePriceList(stationId, activity, list) {
  const clean = Object.fromEntries(Object.entries(list.prices || {}).map(([k, v]) => [k, parseInt(String(v).replace(/\s/g, ''), 10) || 0]).filter(([, v]) => v > 0));
  const row = { station_id: stationId, activity, prices: clean, options: list.options || {}, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('deposit_price_lists').upsert(row, { onConflict: 'station_id,activity' });
  if (error) throw new Error(error.message);
  return { prices: clean, options: row.options };
}

export const isOpenCarpet = (o) => !['recupere', 'annule'].includes(o.status);
export const stepIndex = (status) => {
  if (status === 'recupere') return CARPET_STEPS.length - 1;
  return Math.max(0, CARPET_STEPS.findIndex((s) => s.key === status));
};
// En retard : date promise dépassée et pas encore prêt.
export const isLateCarpet = (o, now = new Date()) => ['depose', 'lavage', 'sechage'].includes(o.status) && new Date(o.promisedAt) < now;

// ─── Pièces ───────────────────────────────────────────────────────────
// Une entrée de `items` par pièce : { id, kind, qty: 1, size, price }.
// Les premiers dépôts (avant le 11/11/2026 au soir) avaient une entrée par
// type avec une quantité { kind, qty } : ils restent lisibles.
const pieceId = () => Math.random().toString(36).slice(2, 10);
// `service` : traitement d'un article de pressing (« Nettoyage à sec »…), vide ailleurs.
export const newPiece = (kind, extra = {}) => ({ id: pieceId(), kind, qty: 1, size: '', price: '', note: '', service: '', ...extra });
const toInt = (v) => parseInt(String(v ?? '').replace(/\s/g, ''), 10) || 0;

// Une ligne par pièce réelle (une ancienne entrée « 3 moquettes » donne 3 lignes sans prix).
export function pieceLines(items) {
  const out = [];
  for (const it of items || []) {
    if (!it) continue;
    const qty = Math.max(1, toInt(it.qty) || 1);
    for (let i = 0; i < qty; i += 1) {
      out.push({
        id: it.id || `${it.kind}-${out.length}`, kind: it.kind || 'Pièce', size: it.size || '', service: it.service || '', price: qty === 1 ? toInt(it.price) : 0,
        // Lot pesé : code de prestation, poids (kg), prix au kilo, heures de travail.
        ...(it.code ? { code: it.code, weight: Number(it.weight) || 0, rate: toInt(it.rate), hours: toInt(it.hours) } : {}),
      });
    }
  }
  return out;
}
// Somme des prix des pièces.
export const piecesTotal = (items) => (items || []).reduce((s, it) => s + toInt(it.price) * Math.max(1, toInt(it.qty) || 1), 0);
// Pièces sans prix (prix à fixer au retrait).
export const piecesWithoutPrice = (items) => pieceLines(items).filter((p) => !p.price).length;

// « 2 tapis de salon, 1 moquette » (regroupé par type) ;
// chaussures : « 3 paires : baskets ×2, bottes ».
export function itemsSummary(items, pieceCount, activity) {
  const byKind = new Map();
  for (const it of items || []) {
    if (!it || !(toInt(it.qty) > 0)) continue;
    byKind.set(it.kind || 'pièce', (byKind.get(it.kind || 'pièce') || 0) + toInt(it.qty));
  }
  if (activity === 'chaussures' || activity === 'pressing') {
    const [one, many] = activity === 'pressing' ? ['article', 'articles'] : ['paire', 'paires'];
    const total = [...byKind.values()].reduce((s, n) => s + n, 0) || pieceCount || 1;
    const list = [...byKind].map(([kind, n]) => `${String(kind).toLowerCase()}${n > 1 ? ` ×${n}` : ''}`).join(', ');
    return `${total} ${total > 1 ? many : one}${list ? ` : ${list}` : ''}`;
  }
  if (!byKind.size) return `${pieceCount || 1} pièce${(pieceCount || 1) > 1 ? 's' : ''}`;
  return [...byKind].map(([kind, n]) => `${n} ${String(kind).toLowerCase()}`).join(', ');
}
// Résumé d'un dépôt (ligne de la base ou objet de rowToCarpet).
export const orderSummary = (o) => itemsSummary(o.items, o.pieceCount ?? o.piece_count, o.activity);
export const countPieces = (items) => (items || []).reduce((s, it) => s + (toInt(it.qty) || 0), 0);
// « Tapis de salon · 2 × 3 m », « Chemise · Repassage seul · blanche »
export const pieceLabel = (p) => [p.kind, p.code ? `${p.code} ${p.service}` : p.service, p.code ? weightLine(p) : null, p.size].filter(Boolean).join(' · ');

// ─── Pesage (prix au kilo) ────────────────────────────────────────────
// « 4,5 kg × 700 F »
export const formatKg = (kg) => `${(Number(kg) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
export const weightLine = (p) => `${formatKg(p.weight)}${p.rate ? ` × ${toInt(p.rate).toLocaleString('fr-FR')} F` : ''}`;
// Prestations au kilo de la station : celles de l'activité, avec ses prix et heures (Tarifs).
export function kiloServices(priceList, activity) {
  const cfg = activityConfig(activity);
  if (!cfg.kilo) return [];
  const own = priceList?.options?.kilo || {};
  return cfg.kilo.services.map((s) => ({
    ...s,
    price: toInt(own[s.code]?.price),
    hours: toInt(own[s.code]?.hours) || s.hours,
    suggestedPrice: s.price,
  }));
}
// Prix d'un lot : poids × prix au kilo, arrondi à 50 F.
export const lotPrice = (weight, rate) => Math.round(((Number(String(weight).replace(',', '.')) || 0) * toInt(rate)) / 50) * 50;
export const newLot = (activity, service) => ({
  id: pieceId(), kind: activityConfig(activity).kilo?.kind || 'Au kilo', qty: 1, size: '', note: '',
  code: service.code, service: service.label, weight: '', rate: service.price ? String(service.price) : '', hours: service.hours, price: '',
});
// Temps de travail prévu d'un dépôt : la plus longue prestation au kilo (0 sans lot pesé).
export const workHours = (items) => (items || []).reduce((m, it) => Math.max(m, it?.code ? toInt(it.hours) : 0), 0);
export const totalWeight = (items) => (items || []).reduce((s, it) => s + (it?.code ? Number(it.weight) || 0 : 0), 0);
// Code d'étiquette d'un article : « 12-3 » (ticket 12, article 3).
export const pieceTag = (ticketNo, index) => `${ticketNo}-${index + 1}`;

export const fcfa = (n) => `${(parseInt(n, 10) || 0).toLocaleString('fr-FR')} FCFA`;

// « jeudi 13 novembre à 15 h » (minutes seulement si non nulles)
export function formatPromise(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const h = d.getHours();
  const m = d.getMinutes();
  // Espaces insécables : « 8 h 16 » ne se coupe jamais en fin de ligne.
  const nb = ' ';
  return `${day} à ${h}${nb}h${m ? `${nb}${String(m).padStart(2, '0')}` : ''}`;
}

// Temps restant avant la date promise : « dans 2 j », « dans 5 h », « en retard de 3 h ».
export function timeLeftLabel(iso, now = new Date()) {
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const hours = Math.round(abs / 3600000);
  const text = hours >= 48 ? `${Math.round(hours / 24)} j` : hours >= 1 ? `${hours} h` : `${Math.max(1, Math.round(abs / 60000))} min`;
  return diff >= 0 ? `dans ${text}` : `en retard de ${text}`;
}

export function carpetTrackingUrl(token) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://galsenautocleaner.com';
  return `${origin}/tapis.html?t=${token}`;
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// Message WhatsApp envoyé au dépôt : ticket, pièces (taille, prix), délai promis et lien de suivi.
export function depositMessage(order, stationName) {
  const lines = pieceLines(order.items);
  return [
    `Bonjour ${firstName(order.clientName)},`,
    `${stationName || 'La station'} a bien reçu votre dépôt (ticket n° ${order.ticketNo}) :`,
    ...lines.map((p) => `• ${pieceLabel(p)}${p.price ? ` : ${fcfa(p.price)}` : ''}`),
    order.expressFee > 0 ? `• Express : ${fcfa(order.expressFee)}` : null,
    order.travelFee > 0 ? `• ${activityConfig(order.activity).feeLabel || 'Déplacement'} : ${fcfa(order.travelFee)}` : null,
    order.amount > 0 ? `Total : ${fcfa(order.amount)}${order.paid ? ' (payé)' : order.amountPaid > 0 ? ` (avance ${fcfa(order.amountPaid)}, reste ${fcfa(amountDue(order))})` : ''}` : null,
    workHours(order.items) ? `Temps de travail prévu : ${workHours(order.items)} h.` : null,
    order.place === 'domicile' && order.activity === 'salon'
      ? `Intervention prévue le ${formatPromise(order.promisedAt)}.`
      : `Prêt au plus tard le ${formatPromise(order.promisedAt)}.`,
    '',
    `Suivez l'avancement ici, et créez votre compte pour être prévenu : ${carpetTrackingUrl(order.publicToken)}`,
  ].filter((l) => l !== null).join('\n');
}

// Message WhatsApp « c'est prêt ».
export function readyMessage(order, stationName) {
  return [
    `Bonjour ${firstName(order.clientName)},`,
    order.place === 'domicile' && order.activity === 'pressing'
      ? `Bonne nouvelle : votre linge (ticket n° ${order.ticketNo}) est prêt. ${stationName || 'La station'} vous le livre.`
      : `Bonne nouvelle : votre dépôt (ticket n° ${order.ticketNo}) est prêt chez ${stationName || 'la station'}.`,
    order.amount > 0 && !order.paid ? `Montant à régler : ${fcfa(amountDue(order))}.` : null,
    `Détails : ${carpetTrackingUrl(order.publicToken)}`,
  ].filter(Boolean).join('\n');
}

export const carpetWhatsAppLink = (order, message) => whatsappLink(order.clientPhone, message);

// ─── Lecture / écriture ────────────────────────────────────────────────
export function rowToCarpet(row) {
  return {
    id: row.id,
    stationId: row.station_id,
    // 'tapis' ou 'chaussures' (add_shoe_cleaning.sql).
    activity: row.activity || 'tapis',
    ticketNo: row.ticket_no,
    publicToken: row.public_token,
    clientId: row.client_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    items: Array.isArray(row.items) ? row.items : [],
    pieceCount: row.piece_count,
    amount: row.amount || 0,
    paid: !!row.paid,
    // Avance déjà encaissée, express, livraison / domicile, emplacement (add_salon_pressing.sql).
    amountPaid: row.amount_paid || 0,
    express: !!row.express,
    expressFee: row.express_fee || 0,
    travelFee: row.travel_fee || 0,
    place: row.place || 'station',
    address: row.address || '',
    rack: row.rack || '',
    paymentMethod: row.payment_method,
    status: row.status,
    promisedAt: row.promised_at,
    // Stations partenaires (add_carpet_partner_stations.sql) : sur un dépôt
    // apporté par une autre station, sa station et son dépôt d'origine ; sur
    // un dépôt confié, le dépôt créé chez la station partenaire.
    fromStationId: row.from_station_id || null,
    fromOrderId: row.from_order_id || null,
    partnerOrderId: row.partner_order_id || null,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    // Notes internes : table carpet_order_notes, lue par la station seule
    // (add_carpet_piece_notes.sql). Absentes côté client.
    ...notesFromRow(row),
    createdAt: row.created_at,
  };
}

function notesFromRow(row) {
  const n = Array.isArray(row.carpet_order_notes) ? row.carpet_order_notes[0] : row.carpet_order_notes;
  return { note: n?.note || row.note || '', pieceNotes: n?.piece_notes || {} };
}
// Colonnes lues par la station (le client lit `*` sans les notes).
export const STATION_CARPET_SELECT = '*, carpet_order_notes(note, piece_notes)';

// Enregistre les notes internes (dépôt + pièces) ; supprime la ligne si tout est vide.
async function saveNotes(order, stationId, note, pieceNotes) {
  const clean = Object.fromEntries(Object.entries(pieceNotes || {}).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v));
  const text = String(note || '').trim();
  if (!text && !Object.keys(clean).length) {
    await supabase.from('carpet_order_notes').delete().eq('order_id', order);
    return { note: '', pieceNotes: {} };
  }
  const { error } = await supabase.from('carpet_order_notes').upsert({ order_id: order, station_id: stationId, note: text || null, piece_notes: clean, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { note: text, pieceNotes: clean };
}
// Pièces telles qu'enregistrées dans `items` (sans les notes, privées).
const piecesToItems = (pieces) => (pieces || []).map((p) => ({
  id: p.id || pieceId(), kind: p.kind, qty: Math.max(1, toInt(p.qty) || 1), size: String(p.size || '').trim(), price: toInt(p.price),
  ...(p.service ? { service: p.service } : {}),
  ...(p.code ? { code: p.code, weight: Number(String(p.weight).replace(',', '.')) || 0, rate: toInt(p.rate), hours: toInt(p.hours) } : {}),
}));
const piecesToNotes = (pieces) => Object.fromEntries((pieces || []).filter((p) => p.note && String(p.note).trim()).map((p) => [p.id, String(p.note).trim()]));

// `pieces` : [{ id, kind, size, price, note }] — le total est la somme des prix.
// Options : express + expressFee (pressing), place 'domicile' + address + travelFee (salon, pressing), rack.
export async function createCarpetOrder(stationId, {
  clientName, clientPhone, pieces, promisedAt, note, fromStationId, activity = 'tapis',
  express = false, expressFee = 0, place = 'station', address = '', travelFee = 0, rack = '',
}) {
  const items = piecesToItems(pieces);
  const home = place === 'domicile';
  const extras = (express ? toInt(expressFee) : 0) + (home ? toInt(travelFee) : 0);
  const { data, error } = await supabase.from('carpet_orders').insert({
    station_id: stationId,
    activity,
    ticket_no: 0, // remplacé par le trigger
    client_name: clientName.trim(),
    client_phone: (clientPhone || '').trim() || null,
    items,
    piece_count: Math.max(1, countPieces(items)),
    amount: piecesTotal(items) + extras,
    promised_at: promisedAt,
    express: !!express,
    express_fee: express ? toInt(expressFee) : 0,
    place: home ? 'domicile' : 'station',
    address: home ? (String(address || '').trim() || null) : null,
    travel_fee: home ? toInt(travelFee) : 0,
    rack: String(rack || '').trim() || null,
    // Client = une station Galsen : elle suit le dépôt et son paiement devient une dépense chez elle.
    ...(fromStationId ? { from_station_id: fromStationId } : {}),
  }).select('*').single();
  if (error) throw new Error(error.message);
  const notes = await saveNotes(data.id, stationId, note, piecesToNotes(pieces));
  return { ...rowToCarpet(data), ...notes };
}

export async function setCarpetStatus(id, status) {
  const { data, error } = await supabase.from('carpet_orders').update({ status }).eq('id', id).select(STATION_CARPET_SELECT).single();
  if (error) throw new Error(error.message);
  return rowToCarpet(data);
}

// patch : promisedAt, clientPhone, note, pieces (pièces modifiées : le total suit).
export async function updateCarpetOrder(order, patch) {
  const row = {};
  if ('promisedAt' in patch) row.promised_at = patch.promisedAt;
  if ('clientPhone' in patch) row.client_phone = (patch.clientPhone || '').trim() || null;
  if ('rack' in patch) row.rack = String(patch.rack || '').trim() || null;
  if ('address' in patch) row.address = String(patch.address || '').trim() || null;
  if ('expressFee' in patch) row.express_fee = toInt(patch.expressFee);
  if ('travelFee' in patch) row.travel_fee = toInt(patch.travelFee);
  if (patch.pieces) {
    row.items = piecesToItems(patch.pieces);
    row.piece_count = Math.max(1, countPieces(row.items));
    // Un dépôt encaissé garde le montant encaissé (la transaction est faite).
    // Ancien dépôt sans prix par pièce : son total reste tant qu'aucun prix
    // de pièce n'est saisi (changer la date ne doit pas le remettre à 0).
    if (!order.paid) {
      const t = piecesTotal(row.items);
      const extras = ('express_fee' in row ? row.express_fee : order.expressFee || 0) + ('travel_fee' in row ? row.travel_fee : order.travelFee || 0);
      row.amount = t > 0 ? t + extras : order.amount;
    }
  }
  const { data, error } = await supabase.from('carpet_orders').update(row).eq('id', order.id).select('*').single();
  if (error) throw new Error(error.message);
  const notes = ('note' in patch || patch.pieces)
    ? await saveNotes(order.id, order.stationId, 'note' in patch ? patch.note : order.note, patch.pieces ? piecesToNotes(patch.pieces) : order.pieceNotes)
    : { note: order.note, pieceNotes: order.pieceNotes };
  return { ...rowToCarpet(data), ...notes };
}
// Pièces d'un dépôt existant, prêtes pour l'éditeur (notes comprises).
export const orderToPieces = (order) => pieceLines(order.items).map((p) => ({
  ...p, price: p.price ? String(p.price) : '', note: order.pieceNotes?.[p.id] || '',
  ...(p.code ? { weight: p.weight ? String(p.weight) : '', rate: p.rate ? String(p.rate) : '' } : {}),
}));

// advance = true : avance (acompte), le dépôt reste « à encaisser » pour le reste.
// Sinon : solde, le dépôt passe « payé » (le montant final = tout ce qui a été encaissé).
export async function recordCarpetPayment(id, method, amount, advance = false) {
  const args = { p_order_id: id, p_method: method, p_amount: parseInt(amount, 10) || null };
  if (advance) args.p_advance = true;
  const { error } = await supabase.rpc('carpet_record_payment', args);
  if (error) throw new Error(error.message);
}
// Reste à payer d'un dépôt.
export const amountDue = (o) => (o.paid ? 0 : Math.max(0, (o.amount || 0) - (o.amountPaid || 0)));
// Nombre de jours depuis que le dépôt est prêt (articles non réclamés au-delà de 30).
export const UNCLAIMED_DAYS = 30;
export const daysSinceReady = (o, now = new Date()) => (o.status === 'pret' && o.readyAt ? Math.floor((now - new Date(o.readyAt)) / 86400000) : 0);

// Lien ouvert avant l'inscription : le jeton attend dans le navigateur
// jusqu'à ce que « Mes dépôts » le rattache au compte (voir login.html).
export const PENDING_CLAIM_KEY = 'ccg_carpet_claim';
export function rememberCarpetClaim(token) {
  try { localStorage.setItem(PENDING_CLAIM_KEY, token); } catch { /* stockage indisponible */ }
}
export async function claimPendingCarpet() {
  let token = null;
  try { token = localStorage.getItem(PENDING_CLAIM_KEY); } catch { return null; }
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { error } = await supabase.rpc('carpet_claim', { p_token: token });
  try { localStorage.removeItem(PENDING_CLAIM_KEY); } catch { /* idem */ }
  return error ? { error: error.message } : { ok: true };
}

// ─── Stations partenaires ──────────────────────────────────────────────
// Stations Galsen actives (annuaire public, RLS stations_select), sauf la sienne.
// Seules les stations qui ont activé la même activité peuvent recevoir un dépôt
// (fonction carpet_partner_stations, add_salon_pressing.sql).
export async function loadPartnerStations(myStationId, activity = 'tapis') {
  const { data, error } = await supabase.rpc('carpet_partner_stations', { p_activity: activity });
  if (error) throw new Error(error.message);
  return (data || []).filter((st) => st.id !== myStationId && (st.name || '').trim());
}
export const stationPlace = (st) => [...new Set([st?.quartier, st?.city].map((v) => (v || '').trim()).filter(Boolean))].join(', ');

export async function outsourceCarpet(orderId, partnerStationId, promisedAt) {
  const { data, error } = await supabase.rpc('carpet_outsource', { p_order_id: orderId, p_partner_station_id: partnerStationId, p_promised_at: promisedAt || null });
  if (error) throw new Error(error.message);
  return data;
}
export async function cancelOutsource(orderId) {
  const { error } = await supabase.rpc('carpet_outsource_cancel', { p_order_id: orderId });
  if (error) throw new Error(error.message);
}

// Dépôts de la station chez ses partenaires (lus grâce à from_station_id).
export const SENT_CARPET_SELECT = '*, partner:stations!carpet_orders_station_id_fkey(name, owner_phone, quartier, city, lat, lng)';
export const rowToSentCarpet = (row) => ({ ...rowToCarpet(row), partner: row.partner || null });
