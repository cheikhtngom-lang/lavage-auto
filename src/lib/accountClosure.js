// Fermeture de compte en libre-service (voir add_account_closure.sql) :
// automobiliste, station (propriétaire) et chef d'entreprise Sur mesure.
// La demande bloque le compte tout de suite ; 30 jours pour annuler en se
// reconnectant ; ensuite une tâche quotidienne supprime les comptes et
// anonymise l'historique. Tout passe par des fonctions SQL.
import { supabase } from './supabaseClient';

export const CLOSURE_DELAY_DAYS = 30;

// null, ou { kind, label, scheduled_for, requested_at, can_cancel } — la
// demande du compte connecté, ou celle de la station où travaille un collaborateur.
export async function getMyClosure() {
  const { data, error } = await supabase.rpc('my_account_closure');
  if (error) throw new Error(error.message);
  return data || null;
}

export async function requestClosure(confirm, reason) {
  const { data, error } = await supabase.rpc('request_account_closure', { p_confirm: confirm, p_reason: reason || null });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelClosure() {
  const { error } = await supabase.rpc('cancel_account_closure');
  if (error) throw new Error(error.message);
}

export const fmtClosureDate = (iso) => (iso
  ? new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  : '—');
