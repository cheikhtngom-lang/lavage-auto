// Annonces — voir add_announcements.sql pour l'architecture (une table,
// deux sens de diffusion : plateforme -> stations, station -> ses clients).
import { supabase } from './supabaseClient';

const rowToAnnouncement = (row) => ({
  id: row.id,
  scope: row.scope,
  stationId: row.station_id,
  stationName: row.stations?.name || '',
  title: row.title,
  message: row.message,
  active: row.active !== false,
  targetStationId: row.target_station_id || null,
  targetStationName: row.target_station?.name || '',
  targetClientIds: row.target_client_ids || [],
  createdAt: row.created_at,
});

export async function loadPlatformAnnouncements() {
  const { data, error } = await supabase
    .from('announcements').select('*, target_station:stations!target_station_id(name)')
    .eq('scope', 'platform_to_stations')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data || []).map(rowToAnnouncement);
}

// RLS scope déjà à "stations que ce client connaît" (réservation/abonnement/
// favori, voir client_knows_station_for_announcements) — aucun filtre à
// ajouter ici, la lecture se limite naturellement au bon sous-ensemble.
export async function loadStationAnnouncements() {
  const { data, error } = await supabase
    .from('announcements').select('*, stations(name)')
    .eq('scope', 'station_to_clients')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data || []).map(rowToAnnouncement);
}

export async function sendPlatformAnnouncement({ title, message, targetStationId }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('announcements').insert({
    scope: 'platform_to_stations', title: title.trim(), message: message.trim(), created_by: user?.id || null,
    target_station_id: targetStationId || null,
  });
  if (error) throw new Error(error.message);
}

export async function sendStationAnnouncement(stationId, { title, message, targetClientIds }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('announcements').insert({
    scope: 'station_to_clients', station_id: stationId, title: title.trim(), message: message.trim(), created_by: user?.id || null,
    target_client_ids: (targetClientIds && targetClientIds.length > 0) ? targetClientIds : null,
  });
  if (error) throw new Error(error.message);
}

// Clients "connus" de la station courante (abonnés avec compte + clients
// ayant réservé, dédupliqués) — alimente le sélecteur de destinataires de
// AnnouncementComposer. Voir station_known_clients() dans
// add_announcement_targeting.sql (auto-scopée à la station de l'appelant).
export async function loadStationKnownClients() {
  const { data, error } = await supabase.rpc('station_known_clients');
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    clientId: row.client_id,
    name: row.client_name,
    phone: row.client_phone,
    isSubscriber: row.is_subscriber,
    subscriptionStatus: row.subscription_status,
  }));
}

// "Retirer" une annonce déjà envoyée — désactive plutôt que supprimer, pour
// garder l'historique (badge Active/Retirée). Voir add_announcement_retire.sql.
export async function retireAnnouncement(id) {
  const { error } = await supabase.from('announcements').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}
