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

// ─── Activités : tapis ou chaussures ──────────────────────────────────
// Même parcours (dépôt, ticket, lien de suivi, étapes, encaissement) ; ce qui
// change : libellés, types de pièces et service inscrit en Comptabilité.
export const SHOE_SERVICE = 'Chaussures';
export const SHOE_KINDS = ['Baskets', 'Chaussures en cuir', 'Daim / nubuck', 'Talons', 'Bottes', 'Sandales', 'Autre'];
export const ACTIVITIES = {
  tapis: {
    key: 'tapis', service: CARPET_SERVICE, nav: 'Tapis', title: 'Tapis et moquettes', href: '/admin/tapis',
    kinds: CARPET_KINDS, unit: 'pièce', units: 'pièces', unitCap: 'Pièce', things: 'tapis',
    piecesLegend: 'Pièces déposées', editorHint: "Touchez le type de pièce pour l'ajouter. Chaque pièce a sa taille, son prix et sa note.",
    sizeLabel: 'Taille', sizePlaceholder: '2 x 3 m', pricePlaceholder: '5000', notePlaceholder: 'Taches, franges abîmées…',
    intro: 'Dépôts des clients et des stations partenaires, avancement du lavage et lien de suivi.',
    empty: 'Enregistrez les tapis et moquettes déposés par vos clients. Ils reçoivent un lien pour suivre le lavage et savoir quand passer les récupérer.',
  },
  chaussures: {
    key: 'chaussures', service: SHOE_SERVICE, nav: 'Chaussures', title: 'Lavage de chaussures', href: '/admin/chaussures',
    kinds: SHOE_KINDS, unit: 'paire', units: 'paires', unitCap: 'Paire', things: 'chaussures',
    piecesLegend: 'Paires déposées', editorHint: 'Touchez le type de chaussures pour ajouter une paire. Chaque paire a sa pointure, son prix et sa note.',
    sizeLabel: 'Pointure, couleur', sizePlaceholder: '42, blanches', pricePlaceholder: '2000', notePlaceholder: "Semelle décollée, tache d'encre…",
    intro: 'Chaussures déposées par les clients et les stations partenaires, avancement du lavage et lien de suivi.',
    empty: 'Enregistrez les chaussures déposées par vos clients. Ils reçoivent un lien pour suivre le lavage et savoir quand passer les récupérer.',
  },
};
export const activityConfig = (key) => ACTIVITIES[key] || ACTIVITIES.tapis;
// « 1 pièce », « 3 paires »
export const unitCount = (n, cfg) => `${n} ${n > 1 ? cfg.units : cfg.unit}`;
// Rubrique de l'espace automobiliste qui regroupe tapis et chaussures.
export const CLIENT_DEPOSITS_LABEL = 'Mes dépôts';

// Délais proposés au dépôt, en heures.
export const CARPET_DELAYS = [24, 48, 72, 120];
export const DEFAULT_CARPET_DELAY = 48;

// Étapes visibles par le client, dans l'ordre.
export const CARPET_STEPS = [
  { key: 'depose', label: 'Déposé' },
  { key: 'lavage', label: 'Lavage' },
  { key: 'sechage', label: 'Séchage' },
  { key: 'pret', label: 'Prêt' },
];

export const CARPET_STATUS = {
  depose: { label: 'Déposé', tone: 'neutral' },
  lavage: { label: 'En lavage', tone: 'blue' },
  sechage: { label: 'Au séchage', tone: 'cyan' },
  pret: { label: 'Prêt à récupérer', tone: 'emerald' },
  recupere: { label: 'Récupéré', tone: 'neutral' },
  annule: { label: 'Annulé', tone: 'red' },
};

// Statut suivant proposé par le bouton principal de la station.
export const NEXT_STATUS = { depose: 'lavage', lavage: 'sechage', sechage: 'pret', pret: 'recupere' };
export const NEXT_ACTION_LABEL = { depose: 'Mettre en lavage', lavage: 'Mettre au séchage', sechage: 'Marquer prêt', pret: 'Remis au client' };

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
export const newPiece = (kind) => ({ id: pieceId(), kind, qty: 1, size: '', price: '', note: '' });
const toInt = (v) => parseInt(String(v ?? '').replace(/\s/g, ''), 10) || 0;

// Une ligne par pièce réelle (une ancienne entrée « 3 moquettes » donne 3 lignes sans prix).
export function pieceLines(items) {
  const out = [];
  for (const it of items || []) {
    if (!it) continue;
    const qty = Math.max(1, toInt(it.qty) || 1);
    for (let i = 0; i < qty; i += 1) {
      out.push({ id: it.id || `${it.kind}-${out.length}`, kind: it.kind || 'Pièce', size: it.size || '', price: qty === 1 ? toInt(it.price) : 0 });
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
  if (activity === 'chaussures') {
    const total = [...byKind.values()].reduce((s, n) => s + n, 0) || pieceCount || 1;
    const list = [...byKind].map(([kind, n]) => `${String(kind).toLowerCase()}${n > 1 ? ` ×${n}` : ''}`).join(', ');
    return `${total} paire${total > 1 ? 's' : ''}${list ? ` : ${list}` : ''}`;
  }
  if (!byKind.size) return `${pieceCount || 1} pièce${(pieceCount || 1) > 1 ? 's' : ''}`;
  return [...byKind].map(([kind, n]) => `${n} ${String(kind).toLowerCase()}`).join(', ');
}
// Résumé d'un dépôt (ligne de la base ou objet de rowToCarpet).
export const orderSummary = (o) => itemsSummary(o.items, o.pieceCount ?? o.piece_count, o.activity);
export const countPieces = (items) => (items || []).reduce((s, it) => s + (toInt(it.qty) || 0), 0);
// « Tapis de salon · 2 × 3 m »
export const pieceLabel = (p) => [p.kind, p.size].filter(Boolean).join(' · ');

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
    order.amount > 0 ? `Total : ${fcfa(order.amount)}${order.paid ? ' (payé)' : ''}` : null,
    `Prêt au plus tard le ${formatPromise(order.promisedAt)}.`,
    '',
    `Suivez l'avancement ici, et créez votre compte pour être prévenu : ${carpetTrackingUrl(order.publicToken)}`,
  ].filter((l) => l !== null).join('\n');
}

// Message WhatsApp « c'est prêt ».
export function readyMessage(order, stationName) {
  return [
    `Bonjour ${firstName(order.clientName)},`,
    `Bonne nouvelle : votre dépôt (ticket n° ${order.ticketNo}) est prêt chez ${stationName || 'la station'}.`,
    order.amount > 0 && !order.paid ? `Montant à régler au retrait : ${fcfa(order.amount)}.` : null,
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
}));
const piecesToNotes = (pieces) => Object.fromEntries((pieces || []).filter((p) => p.note && String(p.note).trim()).map((p) => [p.id, String(p.note).trim()]));

// `pieces` : [{ id, kind, size, price, note }] — le total est la somme des prix.
export async function createCarpetOrder(stationId, { clientName, clientPhone, pieces, promisedAt, note, fromStationId, activity = 'tapis' }) {
  const items = piecesToItems(pieces);
  const { data, error } = await supabase.from('carpet_orders').insert({
    station_id: stationId,
    activity,
    ticket_no: 0, // remplacé par le trigger
    client_name: clientName.trim(),
    client_phone: (clientPhone || '').trim() || null,
    items,
    piece_count: Math.max(1, countPieces(items)),
    amount: piecesTotal(items),
    promised_at: promisedAt,
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
  if (patch.pieces) {
    row.items = piecesToItems(patch.pieces);
    row.piece_count = Math.max(1, countPieces(row.items));
    // Un dépôt encaissé garde le montant encaissé (la transaction est faite).
    // Ancien dépôt sans prix par pièce : son total reste tant qu'aucun prix
    // de pièce n'est saisi (changer la date ne doit pas le remettre à 0).
    if (!order.paid) { const t = piecesTotal(row.items); row.amount = t > 0 ? t : order.amount; }
  }
  const { data, error } = await supabase.from('carpet_orders').update(row).eq('id', order.id).select('*').single();
  if (error) throw new Error(error.message);
  const notes = ('note' in patch || patch.pieces)
    ? await saveNotes(order.id, order.stationId, 'note' in patch ? patch.note : order.note, patch.pieces ? piecesToNotes(patch.pieces) : order.pieceNotes)
    : { note: order.note, pieceNotes: order.pieceNotes };
  return { ...rowToCarpet(data), ...notes };
}
// Pièces d'un dépôt existant, prêtes pour l'éditeur (notes comprises).
export const orderToPieces = (order) => pieceLines(order.items).map((p) => ({ ...p, price: p.price ? String(p.price) : '', note: order.pieceNotes?.[p.id] || '' }));

export async function recordCarpetPayment(id, method, amount) {
  const { error } = await supabase.rpc('carpet_record_payment', { p_order_id: id, p_method: method, p_amount: parseInt(amount, 10) || null });
  if (error) throw new Error(error.message);
}

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
export async function loadPartnerStations(myStationId) {
  const { data, error } = await supabase.from('stations').select('id, name, owner_phone, quartier, city, region').eq('status', 'active').order('name');
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
