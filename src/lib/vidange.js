// Vidange — prestation de rendez-vous (date + heure choisies à l'avance),
// distincte du lavage (file d'attente en direct). Voir add_vidange_feature.sql
// pour l'architecture complète (tables séparées de wash_pricing/reservations,
// grand livre des reversements paiements_lavage réutilisé via type_service).
import { supabase } from './supabaseClient';

export const OIL_TYPES = ['Minérale', 'Semi-Synthèse', 'Synthèse'];

// La station a-t-elle droit à la vidange ? (plan Business, ou module
// mod_vidange) — le vrai contrôle est côté Postgres (station_has_vidange +
// trigger sur stations.vidange_enabled, voir add_plan_gating.sql) ; ceci
// sert à l'affichage (masquer l'onglet Réglages, le lien de menu...).
export function stationHasVidange(billing) {
  if (!billing) return false;
  return billing.plan === 'Business' || (billing.activeModules || []).includes('mod_vidange');
}

// Mêmes 4 catégories que la grille tarifaire lavage (Settings.jsx), dupliquées
// ici volontairement : ce fichier ne doit dépendre d'aucune page.
export const VIDANGE_CATEGORY_GRID = [
  { category: 'Moto', title: 'Moto / Tricycle', icon: '🏍️' },
  { category: 'Particulier', title: 'Véhicule Particulier', icon: '🚗' },
  { category: 'Transport', title: 'Transport / Utilitaire', icon: '🚐' },
  { category: 'Camion', title: 'Camion et Bus +50 places', icon: '🚛' },
];

// ─── Lecture (cache alimenté par useSuperAdminState.jsx, voir stationData.js) ───
export {
  getVidangePricing,
  getVidangeStationConfig,
} from './stationData';

// ─── Créneaux ──────────────────────────────────────────────────────────--
// Créneaux candidats entre l'ouverture et la fermeture de la station pour une
// date donnée, marqués complets si déjà à pleine capacité (bookedSlots =
// horodatages ISO renvoyés par get_vidange_booked_slots, un par rendez-vous
// confirmé). Les créneaux déjà passés (si la date choisie est aujourd'hui)
// sont exclus plutôt que marqués complets.
export function computeVidangeSlots({ dateStr, openTime, closeTime, slotMinutes, dailyCapacity, bookedSlots }) {
  const slots = [];
  const [oh, om] = (openTime || '08:00').split(':').map(Number);
  const [ch, cm] = (closeTime || '20:00').split(':').map(Number);
  const step = Math.max(15, slotMinutes || 60);
  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);

  const countAt = (d) => (bookedSlots || []).filter((iso) => new Date(iso).getTime() === d.getTime()).length;

  let cursor = new Date(`${dateStr}T00:00:00`);
  cursor.setHours(oh, om, 0, 0);
  const end = new Date(`${dateStr}T00:00:00`);
  end.setHours(ch, cm, 0, 0);
  // Station ouvrant/fermant le lendemain (ex: 20:00 -> 06:00) : cas rare pour
  // une vidange (contrairement au lavage 24h/24), on s'arrête simplement à
  // minuit plutôt que de gérer la bascule de jour.
  const safeEnd = end > cursor ? end : new Date(`${dateStr}T23:59:59`);

  while (cursor < safeEnd) {
    if (!isToday || cursor > now) {
      slots.push({
        iso: cursor.toISOString(),
        label: cursor.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        available: countAt(cursor) < Math.max(1, dailyCapacity || 1),
      });
    }
    cursor = new Date(cursor.getTime() + step * 60000);
  }
  return slots;
}

// Créneaux déjà réservés (confirmés) pour une station à une date donnée —
// lecture publique anonymisée (voir get_vidange_booked_slots dans
// add_vidange_feature.sql), sert uniquement à calculer la disponibilité.
export async function loadVidangeBookedSlots(stationId, dateStr) {
  const { data, error } = await supabase.rpc('get_vidange_booked_slots', { p_station_id: stationId, p_day: dateStr });
  if (error) { console.error(error); return []; }
  return (data || []).map((r) => r.scheduled_at);
}

// Prix total d'une vidange compte tenu des options — base (catégorie × type
// d'huile) + suppléments fixes filtre à huile / filtre à air, configurés par
// la station (null = option non proposée, jamais ajoutée au total).
export function vidangeOptionsPrice(stationConfig, { filtreHuile, filtreAir }) {
  let total = 0;
  if (filtreHuile && stationConfig?.filtreHuilePrice) total += stationConfig.filtreHuilePrice;
  if (filtreAir && stationConfig?.filtreAirPrice) total += stationConfig.filtreAirPrice;
  return total;
}

// ─── Écriture (paiement sur place — voir lib/paydunya.js:payVidangeOnline
// pour le paiement en ligne, qui passe par l'Edge Function) ────────────--
export async function createVidangeBooking(stationId, {
  clientId, clientName, vehicleLabel, category, oilType, filtreHuile, filtreAir, mileage, scheduledAt, amount, paid, paymentMethod,
}) {
  const { data, error } = await supabase.from('vidange_bookings').insert({
    station_id: stationId, client_id: clientId, client_name: clientName, vehicle_label: vehicleLabel,
    category, oil_type: oilType, filtre_huile: !!filtreHuile, filtre_air: !!filtreAir,
    mileage: mileage || null, scheduled_at: scheduledAt, amount, paid: !!paid, payment_method: paymentMethod || null,
  }).select('id, scheduled_at').single();
  if (error) throw new Error(error.message);
  return data;
}
