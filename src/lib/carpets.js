// Tapis et moquettes déposés à la station (voir add_carpet_cleaning.sql).
// Partagé par la rubrique station (/admin/tapis), l'espace automobiliste
// (/dashboard/tapis) et la page publique du lien de suivi (/tapis.html).
import { supabase } from './supabaseClient';
import { whatsappLink } from './subscriptionReminders';

// Service inscrit dans `transactions` à l'encaissement : c'est lui qui range
// la recette à part en Comptabilité / Analytique / Bilan.
export const CARPET_SERVICE = 'Tapis';
export const isCarpetRevenue = (entry) => entry.service === CARPET_SERVICE;

export const CARPET_KINDS = ['Tapis de salon', 'Moquette', 'Tapis de prière', 'Tapis de voiture', 'Autre'];

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

// « 2 tapis de salon, 1 moquette »
export function itemsSummary(items, pieceCount) {
  const list = (items || []).filter((it) => it && it.qty > 0);
  if (!list.length) return `${pieceCount || 1} pièce${(pieceCount || 1) > 1 ? 's' : ''}`;
  return list.map((it) => `${it.qty} ${String(it.kind || 'pièce').toLowerCase()}`).join(', ');
}
export const countPieces = (items) => (items || []).reduce((s, it) => s + (parseInt(it.qty, 10) || 0), 0);

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

// Message WhatsApp envoyé au dépôt : ticket, délai promis et lien de suivi.
export function depositMessage(order, stationName) {
  const pieces = itemsSummary(order.items, order.pieceCount);
  return [
    `Bonjour ${firstName(order.clientName)},`,
    `${stationName || 'La station'} a bien reçu : ${pieces} (ticket n° ${order.ticketNo}).`,
    `Prêt au plus tard le ${formatPromise(order.promisedAt)}.`,
    order.amount > 0 ? `Montant : ${fcfa(order.amount)}${order.paid ? ' (payé)' : ''}.` : null,
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
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

export async function createCarpetOrder(stationId, { clientName, clientPhone, items, amount, promisedAt, note }) {
  const clean = (items || []).filter((it) => it.qty > 0).map((it) => ({ kind: it.kind, qty: parseInt(it.qty, 10) }));
  const { data, error } = await supabase.from('carpet_orders').insert({
    station_id: stationId,
    ticket_no: 0, // remplacé par le trigger
    client_name: clientName.trim(),
    client_phone: (clientPhone || '').trim() || null,
    items: clean,
    piece_count: Math.max(1, countPieces(clean)),
    amount: parseInt(amount, 10) || 0,
    promised_at: promisedAt,
    note: (note || '').trim() || null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return rowToCarpet(data);
}

export async function setCarpetStatus(id, status) {
  const { data, error } = await supabase.from('carpet_orders').update({ status }).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return rowToCarpet(data);
}

export async function updateCarpetOrder(id, patch) {
  const row = {};
  if ('promisedAt' in patch) row.promised_at = patch.promisedAt;
  if ('amount' in patch) row.amount = parseInt(patch.amount, 10) || 0;
  if ('clientPhone' in patch) row.client_phone = (patch.clientPhone || '').trim() || null;
  if ('note' in patch) row.note = (patch.note || '').trim() || null;
  const { data, error } = await supabase.from('carpet_orders').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return rowToCarpet(data);
}

export async function recordCarpetPayment(id, method, amount) {
  const { error } = await supabase.rpc('carpet_record_payment', { p_order_id: id, p_method: method, p_amount: parseInt(amount, 10) || null });
  if (error) throw new Error(error.message);
}

// Lien ouvert avant l'inscription : le jeton attend dans le navigateur
// jusqu'à ce que « Mes tapis » le rattache au compte (voir login.html).
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
