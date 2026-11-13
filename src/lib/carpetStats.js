// Super Admin > Tapis et chaussures : chiffres des dépôts (tapis ou chaussures,
// la page filtre l'activité avant l'appel) de TOUTES
// les stations (voir add_carpet_cleaning.sql et add_carpet_partner_stations.sql).
// Fonctions pures, sans accès à la base (testées par carpetStats.test.js) :
// la page lit les lignes brutes de `carpet_orders` et les encaissements
// « Tapis » de `transactions`, puis tout est calculé ici.
//
// Définitions (écrites aussi en bas de la page) :
//  - « reçus » : dépôts enregistrés sur la période, sauf annulés ;
//  - « en cours » : Déposé, Lavage ou Séchage, à l'instant présent ;
//  - « en retard » : en cours et date promise dépassée ;
//  - « rendus » : remis au client sur la période (picked_up_at) ;
//  - chiffre d'affaires : encaissements « Tapis » des stations sur la période,
//    comme leur Comptabilité (un dépôt payé à une station partenaire compte
//    chez celle qui a lavé).
// Les dates sont découpées en jours UTC, comme le reste des tableaux de bord
// (le Sénégal est en UTC).

const DAY = 86400000;
export const OPEN_STATUSES = ['depose', 'lavage', 'sechage'];

const toInt = (v) => parseInt(String(v ?? '').replace(/\s/g, ''), 10) || 0;
const ms = (v) => (v ? new Date(v).getTime() : NaN);
const inRange = (v, from, to) => { const t = ms(v); return t >= +from && t < +to; };
const delta = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null);
const avg = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);

export const isOpenOrder = (o) => OPEN_STATUSES.includes(o.status);
export const isLateOrder = (o, now = new Date()) => isOpenOrder(o) && ms(o.promised_at) < +now;
export const isCancelled = (o) => o.status === 'annule';
export const pieces = (o) => Math.max(1, toInt(o.piece_count) || 1);
// Dépôt qui concerne deux stations : apporté par une station (from_station_id)
// ou confié à une station partenaire (partner_order_id).
export const isPartnerOrder = (o) => !!(o.from_station_id || o.partner_order_id);
export const toCollect = (o) => (!o.paid && !isCancelled(o) ? toInt(o.amount) : 0);

// Couleurs des types de pièces (CARPET_KINDS, lib/carpets.js).
export const KIND_COLORS = {
  'Tapis de salon': '#12a8dc',
  Moquette: '#10b981',
  'Tapis de prière': '#f59e0b',
  'Tapis de voiture': '#4f78d0',
  // Chaussures (SHOE_KINDS, lib/carpets.js).
  Baskets: '#12a8dc',
  'Chaussures en cuir': '#10b981',
  'Daim / nubuck': '#f59e0b',
  Talons: '#ef4444',
  Bottes: '#4f78d0',
  Sandales: '#06b6d4',
  Autre: '#688c9e',
  'Non précisé': '#475569',
};

// Nombre de pièces par type d'un dépôt. Anciens dépôts { kind, qty } et
// nouveaux (une entrée par pièce) se lisent pareil ; sans détail, le nombre
// de pièces du dépôt est rangé dans « Non précisé ».
export function kindCounts(order) {
  const out = new Map();
  for (const it of Array.isArray(order.items) ? order.items : []) {
    if (!it) continue;
    const n = Math.max(1, toInt(it.qty) || 1);
    const kind = String(it.kind || '').trim() || 'Autre';
    out.set(kind, (out.get(kind) || 0) + n);
  }
  if (!out.size) out.set('Non précisé', pieces(order));
  return out;
}

// ─── Courbe : un point par jour, semaine (lundi) ou mois ───────────────
function bucketStart(t, bucket) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (bucket === 'month') return Date.UTC(y, m, 1);
  const start = Date.UTC(y, m, d.getUTCDate());
  if (bucket === 'week') return start - ((new Date(start).getUTCDay() + 6) % 7) * DAY;
  return start;
}
function nextBucket(t, bucket) {
  if (bucket === 'month') { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  return t + (bucket === 'week' ? 7 : 1) * DAY;
}
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

// Points vides de `from` jusqu'à aujourd'hui (ou `to` s'il est passé) :
// « Ce mois » ne montre pas de jours à venir à zéro.
export function emptyTrend(from, to, bucket, now = new Date()) {
  const end = Math.min(+to, bucketStart(+now, 'day') + DAY);
  const out = [];
  for (let t = bucketStart(+from, bucket); t < end && out.length < 400; t = nextBucket(t, bucket)) {
    out.push({ label: isoDay(t), revenue: 0, pieces: 0, orders: 0 });
  }
  return out;
}

// ─── Calcul principal ──────────────────────────────────────────────────
// orders   : lignes de carpet_orders (snake_case), toutes dates ;
// payments : transactions « Tapis » { id, station_id, amount, created_at }
//            de `prevFrom` (début de la période précédente) à `to` ;
// from/to  : période choisie (to exclu) ; bucket : 'day' | 'week' | 'month'.
export function computeCarpetStats({ orders = [], payments = [], from, to, bucket = 'day', now = new Date() }) {
  const span = +to - +from;
  const prevFrom = new Date(+from - span);
  const live = orders.filter((o) => !isCancelled(o));

  const received = live.filter((o) => inRange(o.created_at, from, to));
  const receivedPrev = live.filter((o) => inRange(o.created_at, prevFrom, from));
  const returned = live.filter((o) => o.status === 'recupere' && inRange(o.picked_up_at, from, to));
  const returnedPrev = live.filter((o) => o.status === 'recupere' && inRange(o.picked_up_at, prevFrom, from));
  // Prêts sur la période : délai réel (dépôt → prêt) et respect de la date promise.
  const readyIn = live.filter((o) => ['pret', 'recupere'].includes(o.status) && inRange(o.ready_at, from, to));
  const open = live.filter(isOpenOrder);
  const late = open.filter((o) => isLateOrder(o, now));
  const ready = live.filter((o) => o.status === 'pret');
  const pay = payments.filter((p) => inRange(p.created_at, from, to));
  const payPrev = payments.filter((p) => inRange(p.created_at, prevFrom, from));

  // Encaissements d'un dépôt apporté par une station partenaire (facturés entre stations).
  const partnerTx = new Set(orders.filter((o) => o.from_station_id && o.transaction_id).map((o) => o.transaction_id));
  const sumPieces = (list) => list.reduce((s, o) => s + pieces(o), 0);
  const sumAmount = (list) => list.reduce((s, p) => s + toInt(p.amount), 0);
  const readyHours = (list) => avg(list.map((o) => (ms(o.ready_at) - ms(o.created_at)) / 3600000).filter((h) => Number.isFinite(h) && h >= 0));
  const onTime = (list) => {
    const known = list.filter((o) => o.promised_at && o.ready_at);
    return known.length ? known.filter((o) => ms(o.ready_at) <= ms(o.promised_at)).length / known.length : null;
  };

  const totals = {
    receivedOrders: received.length,
    receivedPieces: sumPieces(received),
    receivedPiecesPrev: sumPieces(receivedPrev),
    receivedFromPartners: received.filter((o) => o.from_station_id).length,
    returnedOrders: returned.length,
    returnedPieces: sumPieces(returned),
    returnedPiecesPrev: sumPieces(returnedPrev),
    openOrders: open.length,
    openPieces: sumPieces(open),
    lateOrders: late.length,
    readyOrders: ready.length,
    readyPieces: sumPieces(ready),
    avgReadyHours: readyHours(readyIn),
    onTimeRate: onTime(readyIn),
    revenue: sumAmount(pay),
    revenuePrev: sumAmount(payPrev),
    payments: pay.length,
    partnerRevenue: sumAmount(pay.filter((p) => partnerTx.has(p.id))),
    toCollect: live.reduce((s, o) => s + toCollect(o), 0),
    cancelledOrders: orders.length - live.length,
  };
  const deltas = {
    receivedPieces: delta(totals.receivedPieces, totals.receivedPiecesPrev),
    returnedPieces: delta(totals.returnedPieces, totals.returnedPiecesPrev),
    revenue: delta(totals.revenue, totals.revenuePrev),
  };

  // Courbe : argent encaissé et pièces reçues.
  const trend = emptyTrend(from, to, bucket, now);
  const byLabel = new Map(trend.map((p) => [p.label, p]));
  const pointOf = (v) => byLabel.get(isoDay(bucketStart(ms(v), bucket)));
  pay.forEach((p) => { const pt = pointOf(p.created_at); if (pt) pt.revenue += toInt(p.amount); });
  received.forEach((o) => { const pt = pointOf(o.created_at); if (pt) { pt.pieces += pieces(o); pt.orders += 1; } });

  // Types de pièces reçues sur la période.
  const kinds = new Map();
  received.forEach((o) => kindCounts(o).forEach((n, k) => kinds.set(k, (kinds.get(k) || 0) + n)));
  const byKind = [...kinds].map(([label, value]) => ({ label, value, color: KIND_COLORS[label] || KIND_COLORS.Autre }))
    .sort((a, b) => b.value - a.value);

  // Par station : toute station qui a déjà eu un dépôt, ou un encaissement sur la période.
  const ids = new Set([...orders.map((o) => o.station_id), ...pay.map((p) => p.station_id)]);
  const perStation = [...ids].filter(Boolean).map((id) => {
    const mine = (list) => list.filter((o) => o.station_id === id);
    const revenue = sumAmount(mine(pay));
    const revenuePrev = sumAmount(mine(payPrev));
    return {
      station_id: id,
      revenue,
      revenuePrev,
      revenueDelta: delta(revenue, revenuePrev),
      receivedOrders: mine(received).length,
      receivedPieces: sumPieces(mine(received)),
      openPieces: sumPieces(mine(open)),
      lateOrders: mine(late).length,
      readyOrders: mine(ready).length,
      returnedPieces: sumPieces(mine(returned)),
      avgReadyHours: readyHours(mine(readyIn)),
      onTimeRate: onTime(mine(readyIn)),
      toCollect: mine(live).reduce((s, o) => s + toCollect(o), 0),
      totalOrders: mine(orders).length,
    };
  });

  return { totals, deltas, trend, byKind, perStation, partners: partnerFlows(orders) };
}

// ─── Stations partenaires ──────────────────────────────────────────────
// Une ligne par couple « station qui confie → station qui lave », toutes
// dates : dépôts, pièces, montant facturé par la station qui lave, encaissé.
export function partnerFlows(orders) {
  const flows = new Map();
  for (const o of orders) {
    if (!o.from_station_id || isCancelled(o)) continue;
    const key = `${o.from_station_id}>${o.station_id}`;
    const f = flows.get(key) || { key, fromId: o.from_station_id, toId: o.station_id, orders: 0, pieces: 0, billed: 0, collected: 0, open: 0, ready: 0, lastAt: null };
    f.orders += 1;
    f.pieces += pieces(o);
    f.billed += toInt(o.amount);
    if (o.paid) f.collected += toInt(o.amount);
    if (isOpenOrder(o)) f.open += 1;
    if (o.status === 'pret') f.ready += 1;
    if (!f.lastAt || ms(o.created_at) > ms(f.lastAt)) f.lastAt = o.created_at;
    flows.set(key, f);
  }
  return [...flows.values()].sort((a, b) => ms(b.lastAt) - ms(a.lastAt));
}

// ─── Liste des dépôts : filtres ────────────────────────────────────────
export const ORDER_FILTERS = [
  { key: 'tous', label: 'Tous', test: () => true },
  { key: 'en_cours', label: 'En cours', test: (o) => isOpenOrder(o) },
  { key: 'retard', label: 'En retard', test: (o, now) => isLateOrder(o, now) },
  { key: 'prets', label: 'Prêts', test: (o) => o.status === 'pret' },
  { key: 'rendus', label: 'Rendus', test: (o) => o.status === 'recupere' },
  { key: 'a_encaisser', label: 'À encaisser', test: (o) => toCollect(o) > 0 },
  { key: 'partenaires', label: 'Entre stations', test: (o) => isPartnerOrder(o) },
  { key: 'annules', label: 'Annulés', test: (o) => isCancelled(o) },
];

// Recherche : n° de ticket, client, téléphone ou station.
export function matchesSearch(order, query, stationName = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  if (/^(n°\s*)?\d+$/.test(q) && String(order.ticket_no) === digits) return true;
  return [order.client_name, stationName].some((v) => String(v || '').toLowerCase().includes(q))
    || (digits.length >= 4 && String(order.client_phone || '').replace(/\D/g, '').includes(digits));
}
