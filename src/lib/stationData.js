// Accès aux données PUBLIQUES/anonymisées d'une station — utilisé par les pages
// automobiliste (recherche, réservation, suivi), où l'on compare/estime des
// stations qui ne sont pas la sienne. RLS interdit à un client de lire les
// réservations des AUTRES clients (comportement volontaire — l'ancien système
// localStorage n'avait aucune protection de ce type) : les fonctions ci-dessous
// lisent donc un cache alimenté par des fonctions SQL agrégées (SECURITY DEFINER,
// voir supabase/schema.sql) qui ne renvoient jamais de nom/véhicule de client,
// seulement des compteurs et la composition (catégorie/service) de la file.
//
// Les données propres au client connecté (SES réservations, SES transactions)
// vivent dans useClientAccount.jsx, pas ici — RLS les rend directement lisibles
// (client_id = auth.uid()) sans avoir besoin d'anonymisation.

import { supabase } from './supabaseClient';
import { DEFAULT_PRICING, DEFAULT_DURATION } from './washDefaults';
import { DEFAULT_PROMO } from './promoDefaults';

// ─── Cache Supabase (alimenté par useSuperAdminState.jsx à chaque poll) ──
let stationsCache = {};
let pricingCache = {};
let queueSnapshot = [];
let publicStats = {};
let reviewsCache = {};

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

export function setQueueSnapshotCache(rows) {
  queueSnapshot = rows || [];
}

export function setPublicStatsCache(rows) {
  publicStats = {};
  (rows || []).forEach((r) => {
    publicStats[r.station_id] = {
      waitingCount: Number(r.waiting_count) || 0,
      activeCount: Number(r.active_count) || 0,
      activeEmployees: Number(r.active_employees) || 0,
    };
  });
}

export function setReviewsCache(rows) {
  reviewsCache = {};
  (rows || []).forEach((r) => { (reviewsCache[r.station_id] ||= []).push(r); });
}

// Un automobiliste ne peut pas avoir plus de N véhicules actifs (en file
// d'attente OU en lavage) en même temps dans une même station. Une fois qu'un
// de ses véhicules est terminé (ou retiré), il peut réserver à nouveau.
export const MAX_ACTIVE_VEHICLES_PER_CLIENT = 2;

export function getStationOperationalProfile(stationId) {
  const s = stationsCache[stationId];
  if (!s) return null;
  return {
    name: s.name, phone: s.ownerPhone, address: s.address, quartier: s.quartier, region: s.region,
    openTime: s.openTime, closeTime: s.closeTime, logo: s.logo, cachet: s.cachet,
  };
}

// Nom de station à afficher (ex: notification "votre lavage a été
// enregistré") sans avoir à recomposer tout le profil opérationnel.
export function getStationName(stationId) {
  return stationsCache[stationId]?.name || 'la station';
}

// Retrouve le compte automobiliste propriétaire d'une plaque (véhicule déjà
// enregistré dans son garage) — utilisé quand une station saisit un lavage
// manuellement pour un client de passage, afin de relier automatiquement la
// réservation à son compte s'il est déjà "habitué" (voir find_vehicle_owner,
// add_plate_lookup.sql : security definer, contourne RLS vehicles_select
// qui bloquerait sinon la lecture du véhicule d'un autre par l'admin).
export async function findVehicleOwnerByPlate(plate) {
  if (!plate || !plate.trim()) return null;
  const { data, error } = await supabase.rpc('find_vehicle_owner', { p_plate: plate.trim() });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return { ownerId: row.owner_id, ownerName: row.owner_name, vehicleId: row.vehicle_id, category: row.category, brand: row.brand };
}

export function getStationPricing(stationId) {
  return pricingCache[stationId]?.pricing || DEFAULT_PRICING;
}

export function getStationDurationConfig(stationId) {
  return pricingCache[stationId]?.duration || DEFAULT_DURATION;
}

export function getStationPromo(stationId) {
  return stationsCache[stationId]?.promoConfig || DEFAULT_PROMO;
}

export function getStationWaitingCount(stationId) {
  return publicStats[stationId]?.waitingCount || 0;
}

export function getStationActiveCount(stationId) {
  return publicStats[stationId]?.activeCount || 0;
}

// Une station sans horaires configurés est considérée ouverte par défaut
// (ne pas bloquer les réservations d'une station qui vient de s'inscrire).
export function isStationOpenNow(profile) {
  if (!profile?.openTime || !profile?.closeTime) return true;
  const [oh, om] = profile.openTime.split(':').map(Number);
  const [ch, cm] = profile.closeTime.split(':').map(Number);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = oh * 60 + om;
  const closeMinutes = ch * 60 + cm;
  // Plage nocturne (ex: 20:00 -> 06:00, fermeture le lendemain) : ouvert si on
  // est après l'heure d'ouverture OU avant l'heure de fermeture. Sans ce cas,
  // une station qui ferme après minuit apparaissait "Fermé" 24h/24.
  if (closeMinutes <= openMinutes) return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

// Utilisé côté admin (StationDashboard "Go", Washers "Reprendre service") pour
// bloquer uniquement APRÈS l'heure de fermeture — contrairement à
// isStationOpenNow ci-dessus (badge Ouvert/Fermé côté client), on ne bloque
// pas avant l'heure d'ouverture : un gérant qui prépare la station ou un
// laveur qui pointe en avance ne doit pas se retrouver bloqué.
export function isPastClosingTime(profile) {
  if (!profile?.closeTime) return false;
  const [closeH, closeM] = profile.closeTime.split(':').map(Number);
  if (Number.isNaN(closeH) || Number.isNaN(closeM)) return false;
  const now = new Date();
  const closeAt = new Date(now);
  closeAt.setHours(closeH, closeM, 0, 0);
  return now >= closeAt;
}

// Position dans la file (1 = prochain) et temps d'attente estimé pour UNE
// réservation dont on connaît déjà l'horodatage de création (le client a accès
// à sa propre réservation via RLS — voir useClientAccount.jsx — ce module ne
// fait que situer cette réservation dans la file anonymisée des autres).
export function getItemPosition(stationId, itemCreatedAt) {
  const t = new Date(itemCreatedAt).getTime();
  return queueSnapshot.filter((r) => r.station_id === stationId && r.status === 'attente' && new Date(r.created_at).getTime() < t).length + 1;
}

export function estimateItemWaitTime(stationId, itemCreatedAt) {
  const t = new Date(itemCreatedAt).getTime();
  const durationConfig = getStationDurationConfig(stationId);
  const timeFor = (r) => durationConfig?.[r.category]?.[r.service] ?? 30;

  const activeWashes = queueSnapshot.filter((r) => r.station_id === stationId && r.status === 'en_cours');
  let total = 0;
  activeWashes.forEach((r) => {
    // Temps RÉELLEMENT restant (durée - temps déjà écoulé depuis started_at),
    // pas une estimation à plat — sinon un lavage commencé il y a 18 min sur
    // 20 comptait encore pour 10 min restantes dans l'attente affichée au client.
    const durationMin = timeFor(r);
    const elapsedMin = r.started_at ? (Date.now() - new Date(r.started_at).getTime()) / 60000 : durationMin / 2;
    total += Math.max(0, durationMin - elapsedMin);
  });
  queueSnapshot
    .filter((r) => r.station_id === stationId && r.status === 'attente' && new Date(r.created_at).getTime() < t)
    .forEach((r) => { total += timeFor(r); });

  // Pas de division par une "capacité parallèle" : le temps d'attente est la
  // somme du temps restant des véhicules en lavage + le temps de lavage de
  // chacun des véhicules devant nous dans la file (formule confirmée par le
  // gérant). Diviser par le nombre d'employés "présents" aujourd'hui
  // (station_public_stats.active_employees) sous-estimait fortement l'attente,
  // ce chiffre incluant souvent du personnel qui ne lave pas en parallèle
  // (caissier, gardien...) alors qu'une seule voiture à la fois est lavée.
  return Math.round(total);
}

// ─── Réservation / encaissement (écriture côté client) ───────────────────
export async function createReservation(stationId, { clientId, clientName, vehicleLabel, category, service, paid, amount, paymentMethod, reservationGroupId, groupSize }) {
  const { data, error } = await supabase.from('reservations').insert({
    station_id: stationId, client_id: clientId, client_name: clientName, vehicle_label: vehicleLabel,
    category, service, paid: !!paid, amount, payment_method: paymentMethod || null,
    reservation_group_id: reservationGroupId, group_size: groupSize,
  }).select('id, created_at').single();
  if (error) throw new Error(error.message);
  return data;
}

// Repasse la réservation en "non payée" si l'encaissement échoue après coup
// (ex: solde d'abonnement insuffisant rejeté par le trigger côté DB) — sans
// ça la réservation resterait marquée payée sans transaction correspondante,
// et la station pourrait lancer un lavage jamais réglé.
export async function markReservationUnpaid(reservationId) {
  await supabase.from('reservations').update({ paid: false, payment_method: null }).eq('id', reservationId);
}

// Utilisé quand le client paie en ligne (Wave / Orange Money) au moment de la
// réservation, plutôt que via l'encaissement sur place côté station.
export async function recordClientTransaction(stationId, { reservationId, clientId, clientName, vehicleLabel, service, method, amount }) {
  const { error } = await supabase.from('transactions').insert({
    station_id: stationId, reservation_id: reservationId, client_id: clientId, client_name: clientName,
    vehicle_label: vehicleLabel, service, method, amount,
  });
  // Pour un paiement 'Abonnement', le trigger deduct_subscription_balance
  // (voir recreate_subscriptions.sql) rejette l'insertion si le solde est
  // insuffisant ou si aucun abonnement actif ne correspond — il ne faut donc
  // plus avaler l'erreur ici, sinon le client croit avoir payé pour rien.
  if (error) throw new Error(error.message);
}

// ─── Avis & notes ─────────────────────────────────────────────────────--
export function getStationRatingSummary(stationId) {
  const reviews = reviewsCache[stationId] || [];
  if (reviews.length === 0) return { average: null, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return { average: sum / reviews.length, count: reviews.length };
}

export function hasClientReviewedTransaction(stationId, transactionId) {
  return (reviewsCache[stationId] || []).some((r) => r.transaction_id === transactionId);
}

export async function addStationReview(stationId, { clientId, rating, comment, transactionId }) {
  const { error } = await supabase.from('station_reviews').insert({
    station_id: stationId, client_id: clientId,
    rating: Math.max(1, Math.min(5, Math.round(rating))), comment: comment || '', transaction_id: transactionId ?? null,
  });
  if (error) throw new Error(error.message);
}
