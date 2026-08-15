// Accès direct aux données opérationnelles d'UNE station donnée, par son id —
// utilisé par les pages publiques (recherche/réservation/suivi client), où l'on
// consulte des données qui ne sont pas forcément celles de la session active
// (useAppState ne représente que "ma" station, côté admin connecté).
//
// File/transactions/employés/avis restent en localStorage pour l'instant
// (mêmes clés que useAppState.jsx, `${base}_${stationId}`) — prochaine étape
// de la migration Supabase. Profil/tarifs/promo sont déjà sur Supabase (voir
// [[backend_migration]]) : plutôt que de rendre chaque fonction ci-dessous
// asynchrone (gros impact sur tous les appelants), useSuperAdminState.jsx
// alimente un cache module-level via setStationsCache/setWashPricingCache à
// chaque rafraîchissement, lu ici de façon synchrone comme avant.

import { DEFAULT_PRICING, DEFAULT_DURATION } from './washDefaults';
import { DEFAULT_PROMO } from './promoDefaults';

function readList(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
const sameClient = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

// ─── Cache Supabase (alimenté par useSuperAdminState.jsx) ───────────────
let stationsCache = {};
let pricingCache = {};

export function setStationsCache(stations) {
  stationsCache = {};
  (stations || []).forEach((s) => { stationsCache[s.id] = s; });
}

export function setWashPricingCache(rows) {
  pricingCache = {};
  (rows || []).forEach((row) => {
    const entry = (pricingCache[row.station_id] ||= { pricing: {}, duration: {} });
    (entry.pricing[row.category] ||= {})[row.service] = row.price;
    (entry.duration[row.category] ||= {})[row.service] = row.duration_minutes;
  });
}

// Un automobiliste ne peut pas avoir plus de N véhicules actifs (en file
// d'attente OU en lavage) en même temps dans une même station. Une fois qu'un
// de ses véhicules est terminé (ou retiré), il peut réserver à nouveau.
export const MAX_ACTIVE_VEHICLES_PER_CLIENT = 2;

export function getStationQueue(stationId) {
  return readList(`washQueue_${stationId}`, []);
}
export function getStationActiveWashes(stationId) {
  return readList(`activeWashes_${stationId}`, []);
}
export function getStationCompletedWashes(stationId) {
  return readList(`completedWashes_${stationId}`, []);
}
export function getStationTransactions(stationId) {
  return readList(`washTransactions_${stationId}`, []);
}
export function getStationEmployees(stationId) {
  return readList(`washEmployees_${stationId}`, []);
}
export function getStationDurationConfig(stationId) {
  return pricingCache[stationId]?.duration || DEFAULT_DURATION;
}

export function addToStationQueue(stationId, washData) {
  const queue = getStationQueue(stationId);
  const entry = { id: Date.now(), status: 'attente', ...washData };
  writeList(`washQueue_${stationId}`, [...queue, entry]);
  return entry;
}

// Enregistre une transaction pour une station donnée — utilisé quand le client
// paie en ligne (Wave / Orange Money) au moment de la réservation, plutôt que
// via l'encaissement sur place côté station (voir validatePayment dans useAppState).
export function addStationTransaction(stationId, tx) {
  const transactions = getStationTransactions(stationId);
  const entry = { id: Date.now(), ...tx };
  writeList(`washTransactions_${stationId}`, [entry, ...transactions]);
  return entry;
}

export function getStationOperationalProfile(stationId) {
  const s = stationsCache[stationId];
  if (!s) return null;
  return {
    name: s.name, phone: s.ownerPhone, address: s.address, quartier: s.quartier, region: s.region,
    openTime: s.openTime, closeTime: s.closeTime, logo: s.logo, cachet: s.cachet,
  };
}

export function getStationPricing(stationId) {
  return pricingCache[stationId]?.pricing || DEFAULT_PRICING;
}

export function getStationPromo(stationId) {
  return stationsCache[stationId]?.promoConfig || DEFAULT_PROMO;
}

// Une station sans horaires configurés est considérée ouverte par défaut
// (ne pas bloquer les réservations d'une station qui vient de s'inscrire).
export function isStationOpenNow(profile) {
  if (!profile?.openTime || !profile?.closeTime) return true;
  const [oh, om] = profile.openTime.split(':').map(Number);
  const [ch, cm] = profile.closeTime.split(':').map(Number);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= (oh * 60 + om) && nowMinutes < (ch * 60 + cm);
}

// Même formule que useAppState.getEstimatedWaitTime, appliquée à une station
// donnée par son id plutôt qu'à "ma" station de session.
export function estimateStationWaitTime(stationId, clientName) {
  const queue = getStationQueue(stationId);
  const activeWashes = getStationActiveWashes(stationId);
  const durationConfig = getStationDurationConfig(stationId);
  const employees = getStationEmployees(stationId);

  const clientIndex = queue.findIndex(q => sameClient(q.client, clientName));
  if (clientIndex === -1) return 0;

  let totalWaitTime = 0;
  activeWashes.forEach(wash => {
    const cat = wash.category || 'Particulier';
    const time = durationConfig?.[cat]?.[wash.service] ?? 30;
    totalWaitTime += time / 2;
  });
  for (let i = 0; i < clientIndex; i++) {
    const wash = queue[i];
    const cat = wash.category || 'Particulier';
    const time = durationConfig?.[cat]?.[wash.service] ?? 30;
    totalWaitTime += time;
  }
  const activeEmployees = employees.filter(e => e?.present || e?.dailyStatus === 'present').length || 1;
  return Math.round(totalWaitTime / activeEmployees);
}

// Nombre de véhicules d'un client actuellement actifs (file + en lavage) dans
// UNE station donnée — sert à appliquer le plafond MAX_ACTIVE_VEHICLES_PER_CLIENT
// au moment de la réservation.
export function countClientActiveVehicles(stationId, clientName) {
  const inQueue = getStationQueue(stationId).filter(q => sameClient(q.client, clientName)).length;
  const inWash = getStationActiveWashes(stationId).filter(q => sameClient(q.client, clientName)).length;
  return inQueue + inWash;
}

// Toutes les réservations actives (file + en lavage) d'un client, à travers
// TOUTES les stations réelles fournies — contrairement à findClientReservation
// (singulier, une seule), nécessaire depuis qu'un client peut avoir plusieurs
// véhicules actifs en même temps (jusqu'à MAX_ACTIVE_VEHICLES_PER_CLIENT).
export function findClientReservations(stations, clientName) {
  const results = [];
  for (const station of stations) {
    getStationActiveWashes(station.id)
      .filter(q => sameClient(q.client, clientName))
      .forEach(item => results.push({ station, item, isWashing: true, position: 0 }));

    getStationQueue(station.id).forEach((item, index) => {
      if (sameClient(item.client, clientName)) {
        results.push({ station, item, isWashing: false, position: index + 1 });
      }
    });
  }
  return results;
}

// Cherche LA réservation active d'un client (par nom) à travers TOUTES les
// stations réelles fournies. Retourne null si aucune réservation en cours.
// Conservée pour compat (usages qui ne montrent qu'un seul statut à la fois) —
// pour tout afficher, utiliser findClientReservations (pluriel) ci-dessus.
export function findClientReservation(stations, clientName) {
  return findClientReservations(stations, clientName)[0] || null;
}

// Comme estimateStationWaitTime, mais par identifiant d'item précis plutôt que
// par nom de client — indispensable pour estimer correctement l'attente de
// CHAQUE véhicule quand un même client en a plusieurs dans la même file.
export function estimateItemWaitTime(stationId, itemId) {
  const queue = getStationQueue(stationId);
  const activeWashes = getStationActiveWashes(stationId);
  const durationConfig = getStationDurationConfig(stationId);
  const employees = getStationEmployees(stationId);

  const itemIndex = queue.findIndex(q => q.id === itemId);
  if (itemIndex === -1) return 0;

  let totalWaitTime = 0;
  activeWashes.forEach(wash => {
    const cat = wash.category || 'Particulier';
    const time = durationConfig?.[cat]?.[wash.service] ?? 30;
    totalWaitTime += time / 2;
  });
  for (let i = 0; i < itemIndex; i++) {
    const wash = queue[i];
    const cat = wash.category || 'Particulier';
    const time = durationConfig?.[cat]?.[wash.service] ?? 30;
    totalWaitTime += time;
  }
  const activeEmployees = employees.filter(e => e?.present || e?.dailyStatus === 'present').length || 1;
  return Math.round(totalWaitTime / activeEmployees);
}

// Agrège les transactions payées d'un client à travers toutes les stations,
// avec le nom de la station attaché à chaque ligne (pour l'historique).
export function getClientTransactions(stations, clientName) {
  const rows = [];
  for (const station of stations) {
    const txs = getStationTransactions(station.id).filter(tx => sameClient(tx.client, clientName));
    txs.forEach(tx => rows.push({ ...tx, stationId: station.id, stationName: station.name }));
  }
  return rows;
}

// Stations avec lesquelles un client a déjà interagi (réservation en file,
// lavage en cours/terminé, ou transaction) — quel que soit le stade actuel de
// cette interaction. Sert à afficher "Mes Stations" côté automobiliste, en
// ne montrant que les stations réellement visitées (pas tout le registre).
export function getVisitedStations(stations, clientName) {
  return stations.filter(station => (
    getStationQueue(station.id).some(q => sameClient(q.client, clientName)) ||
    getStationActiveWashes(station.id).some(q => sameClient(q.client, clientName)) ||
    getStationCompletedWashes(station.id).some(q => sameClient(q.client, clientName)) ||
    getStationTransactions(station.id).some(tx => sameClient(tx.client, clientName))
  ));
}

// ─── Avis & notes ───────────────────────────────────────────────────────
export function getStationReviews(stationId) {
  return readList(`stationReviews_${stationId}`, []);
}

export function addStationReview(stationId, { clientName, rating, comment, transactionId }) {
  const reviews = getStationReviews(stationId);
  const entry = {
    id: Date.now(),
    clientName,
    rating: Math.max(1, Math.min(5, Math.round(rating))),
    comment: comment || '',
    transactionId: transactionId ?? null,
    createdAt: new Date().toISOString(),
  };
  writeList(`stationReviews_${stationId}`, [entry, ...reviews]);
  return entry;
}

export function getStationRatingSummary(stationId) {
  const reviews = getStationReviews(stationId);
  if (reviews.length === 0) return { average: null, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return { average: sum / reviews.length, count: reviews.length };
}

export function hasClientReviewedTransaction(stationId, transactionId) {
  return getStationReviews(stationId).some(r => r.transactionId === transactionId);
}
