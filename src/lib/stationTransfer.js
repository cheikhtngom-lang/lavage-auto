// Cession d'une station à un nouveau propriétaire (voir add_station_transfer.sql
// pour le flux complet et les règles d'accès).
import { supabase } from './supabaseClient';

export const TRANSFER_STATUS = {
  pending: { label: 'En attente du propriétaire', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  ceded: { label: 'Cédée — activation en attente', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  completed: { label: 'Terminée', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  rejected: { label: 'Refusée par le propriétaire', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  cancelled: { label: 'Annulée', className: 'bg-white/5 text-neutral-400 border-white/10' },
};

// Les demandes encore ouvertes (qui bloquent une nouvelle cession).
export const isTransferOpen = (t) => t.status === 'pending' || t.status === 'ceded';

// Invoque une Edge Function et remonte le message d'erreur JSON de la réponse
// (supabase-js ne le met que dans error.context pour un statut non-2xx).
async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detail = null;
    try { detail = await error.context?.json?.(); } catch { /* ignore */ }
    throw new Error(detail?.error || error.message || 'Erreur réseau.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ─── Super Admin ────────────────────────────────────────────────────────
export async function listTransferRequests() {
  const { data, error } = await supabase
    .from('station_transfer_requests')
    .select('*')
    .order('requested_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createTransferRequest({ stationId, acquirerName, acquirerEmail, note }) {
  const { data, error } = await supabase.rpc('create_station_transfer', {
    p_station_id: stationId,
    p_acquirer_name: acquirerName,
    p_acquirer_email: acquirerEmail,
    p_note: note || '',
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelTransferRequest(requestId) {
  const { data, error } = await supabase.rpc('cancel_station_transfer', { p_request_id: requestId });
  if (error) throw new Error(error.message);
  return data;
}

// Renvoie { emailSent, link? } — `link` n'est présent que si l'email a échoué.
export function resendTransferLink(requestId) {
  return callFunction('station-transfer', { action: 'resend', requestId });
}

// ─── Propriétaire de la station ─────────────────────────────────────────
// La demande en attente de SA décision (RLS : uniquement sa station, et
// uniquement pour un compte 'admin'), ou null.
export async function getPendingTransferForMyStation() {
  const { data, error } = await supabase
    .from('station_transfer_requests')
    .select('id, station_id, station_name, acquirer_name, acquirer_email, note, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

export function cedeStation(requestId) {
  return callFunction('station-transfer', { action: 'cede', requestId });
}

export function rejectTransfer(requestId) {
  return callFunction('station-transfer', { action: 'reject', requestId });
}
