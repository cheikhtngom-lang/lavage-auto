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
  createdAt: row.created_at,
});

export async function loadPlatformAnnouncements() {
  const { data, error } = await supabase
    .from('announcements').select('*')
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

export async function sendPlatformAnnouncement({ title, message }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('announcements').insert({
    scope: 'platform_to_stations', title: title.trim(), message: message.trim(), created_by: user?.id || null,
  });
  if (error) throw new Error(error.message);
}

export async function sendStationAnnouncement(stationId, { title, message }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('announcements').insert({
    scope: 'station_to_clients', station_id: stationId, title: title.trim(), message: message.trim(), created_by: user?.id || null,
  });
  if (error) throw new Error(error.message);
}

// "Retirer" une annonce déjà envoyée — désactive plutôt que supprimer, pour
// garder l'historique (badge Active/Retirée). Voir add_announcement_retire.sql.
export async function retireAnnouncement(id) {
  const { error } = await supabase.from('announcements').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}
