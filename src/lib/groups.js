// Offre « Sur mesure » : accès aux données et actions du chef d'entreprise
// (voir add_sur_mesure_groups.sql pour le modèle, les règles et les fonctions).
// Toute écriture passe par une fonction SQL ; le navigateur ne fait que lire.
import { supabase } from './supabaseClient';
import { setActiveStationId } from './accounts';

export const GROUP_STATUS = {
  en_attente: { label: 'En attente du 1er paiement', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  a_jour: { label: 'À jour', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  en_retard: { label: 'Impayé', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export const ORDER_STATUS = {
  PENDING: { label: 'En attente de paiement', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  CONFIRMED: { label: 'Payée', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  REJECTED: { label: 'Rejetée', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  CANCELLED: { label: 'Annulée', className: 'bg-white/5 text-neutral-400 border-white/10' },
};

export const JOIN_STATUS = {
  pending: { label: 'En attente du propriétaire', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  accepted: { label: 'Acceptée — à ajouter à la commande', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  refused: { label: 'Refusée', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  cancelled: { label: 'Annulée', className: 'bg-white/5 text-neutral-400 border-white/10' },
  attached: { label: 'Rattachée', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

const fail = (error) => { throw new Error(error.message); };

// Invoque une Edge Function et remonte le message JSON d'une réponse non-2xx.
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

// ─── Lecture ────────────────────────────────────────────────────────────
export async function fetchMyGroup() {
  const { data, error } = await supabase.from('organizations').select('*').maybeSingle();
  if (error) fail(error);
  return data;
}

export async function fetchPlans() {
  const { data, error } = await supabase.from('plans').select('*').order('price', { ascending: true });
  if (error) fail(error);
  return data || [];
}

// Stations du groupe + facturation + Super Admin (membre au rôle super_admin_station).
export async function fetchGroupStations(organizationId) {
  // Filtre explicite : les stations actives sont publiques, sans lui on
  // remonterait aussi celles des autres groupes.
  const { data: stations, error } = await supabase
    .from('stations')
    .select('id, name, city, status, group_origin, group_archived_at, station_billing(plan, subscription_status, next_billing_date)')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });
  if (error) fail(error);

  const ids = (stations || []).map((s) => s.id);
  let admins = {};
  if (ids.length) {
    const { data: members } = await supabase
      .from('station_members')
      .select('station_id, email, full_name, status, station_roles!inner(key)')
      .in('station_id', ids)
      .eq('station_roles.key', 'super_admin_station');
    admins = Object.fromEntries((members || []).map((m) => [m.station_id, m]));
  }

  return (stations || []).map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city || '',
    status: s.status,
    origin: s.group_origin,
    archived: !!s.group_archived_at,
    plan: s.station_billing?.plan || null,
    subscriptionStatus: s.station_billing?.subscription_status || null,
    nextBillingDate: s.station_billing?.next_billing_date || null,
    superAdmin: admins[s.id] ? { email: admins[s.id].email, name: admins[s.id].full_name, status: admins[s.id].status } : null,
  }));
}

export async function fetchOrders() {
  const { data, error } = await supabase.from('organization_orders').select('*').order('created_at', { ascending: false });
  if (error) fail(error);
  return data || [];
}

export async function fetchJoinRequests() {
  const { data, error } = await supabase
    .from('group_join_requests')
    .select('*, stations(name, city)')
    .order('created_at', { ascending: false });
  if (error) fail(error);
  return data || [];
}

// Stations actives que le patron peut solliciter (annuaire public, hors groupes).
export async function searchJoinableStations(term) {
  const q = String(term || '').trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('stations')
    .select('id, name, city, organization_id')
    .eq('status', 'active')
    .is('organization_id', null)
    .ilike('name', `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`)
    .limit(10);
  if (error) fail(error);
  return data || [];
}

// ─── Commandes ──────────────────────────────────────────────────────────
// lines : [{type:'new', name, city, plan} | {type:'existing', station_id, plan}]
export async function quoteOrder(lines) {
  const { data, error } = await supabase.rpc('group_quote', { p_lines: lines });
  if (error) fail(error);
  return data; // { lines, total, days_left, first_cycle }
}

export async function createOrder(lines) {
  const { data, error } = await supabase.rpc('create_group_order', { p_lines: lines });
  if (error) fail(error);
  return data;
}

export async function createRenewal() {
  const { data, error } = await supabase.rpc('create_group_renewal');
  if (error) fail(error);
  return data;
}

export async function setOrderPaymentInfo(orderId, method, reference) {
  const { error } = await supabase.rpc('set_group_order_payment_info', { p_order_id: orderId, p_method: method, p_reference: reference });
  if (error) fail(error);
}

// ─── Stations du groupe ─────────────────────────────────────────────────
// Le patron « entre » dans la station : profiles.station_id change côté base
// (RPC), on aligne ensuite le cache local puis l'appelant recharge /admin.
export async function openStation(stationId) {
  const { error } = await supabase.rpc('open_group_station', { p_station_id: stationId });
  if (error) fail(error);
  setActiveStationId(stationId);
}

export async function closeStation() {
  const { error } = await supabase.rpc('close_group_station');
  if (error) fail(error);
  setActiveStationId(null);
}

// mode : 'release' | 'archive' | 'delete' (delete exige le nom de la station).
export async function removeStation(stationId, mode, confirmName) {
  const { error } = await supabase.rpc('group_remove_station', { p_station_id: stationId, p_mode: mode, p_confirm_name: confirmName || null });
  if (error) fail(error);
}

export async function requestJoin(stationId, plan) {
  const { data, error } = await supabase.rpc('request_group_join', { p_station_id: stationId, p_plan: plan });
  if (error) fail(error);
  return data;
}

export async function cancelJoin(requestId) {
  const { error } = await supabase.rpc('cancel_group_join', { p_request_id: requestId });
  if (error) fail(error);
}

// Super Admin de station : un seul par station, nommé par le patron sans
// ouvrir la station (Edge Function invite-station-member).
export function nominateStationAdmin({ stationId, email, fullName }) {
  return callFunction('invite-station-member', { stationId, email, fullName, roleKey: 'super_admin_station' });
}

export async function removeStationAdmin(stationId) {
  const { error } = await supabase.rpc('group_remove_station_admin', { p_station_id: stationId });
  if (error) fail(error);
}

// ─── Propriétaire d'une station sollicitée ──────────────────────────────
// La demande de rattachement en attente de SA réponse (RLS : sa station, compte 'admin').
export async function getPendingJoinForMyStation() {
  const { data, error } = await supabase
    .from('group_join_requests')
    .select('id, plan, created_at, organizations(name)')
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function respondJoin(requestId, accept) {
  const { error } = await supabase.rpc('respond_group_join', { p_request_id: requestId, p_accept: accept });
  if (error) fail(error);
}

// Infos du groupe auquel appartient la station courante (bandeau + « Quitter »).
export async function getMyStationGroup(stationId) {
  const { data, error } = await supabase
    .from('stations')
    .select('organization_id, group_origin, organizations(name, status)')
    .eq('id', stationId)
    .maybeSingle();
  if (error || !data?.organization_id) return null;
  return {
    organizationId: data.organization_id,
    origin: data.group_origin,
    name: data.organizations?.name || 'votre groupe',
    status: data.organizations?.status || null,
  };
}

export async function leaveGroup() {
  const { error } = await supabase.rpc('leave_group');
  if (error) fail(error);
}

// ─── Super Admin ────────────────────────────────────────────────────────
export async function fetchAllGroups() {
  const [{ data: orgs, error: e1 }, { data: stations, error: e2 }, { data: orders, error: e3 }, { data: owners }] = await Promise.all([
    supabase.from('organizations').select('*').order('created_at', { ascending: false }),
    supabase.from('stations').select('id, name, city, status, organization_id, group_origin, group_archived_at, station_billing(plan, subscription_status)').not('organization_id', 'is', null),
    supabase.from('organization_orders').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, email, phone').eq('is_group_owner', true),
  ]);
  if (e1) fail(e1);
  if (e2) fail(e2);
  if (e3) fail(e3);
  const ownerById = Object.fromEntries((owners || []).map((o) => [o.id, o]));
  return (orgs || []).map((o) => ({
    ...o,
    owner: ownerById[o.owner_id] || null,
    stations: (stations || []).filter((s) => s.organization_id === o.id),
    orders: (orders || []).filter((x) => x.organization_id === o.id),
  }));
}

export async function confirmOrder(orderId) {
  const { error } = await supabase.rpc('confirm_group_order', { p_order_id: orderId });
  if (error) fail(error);
}

export async function rejectOrder(orderId) {
  const { error } = await supabase.rpc('reject_group_order', { p_order_id: orderId });
  if (error) fail(error);
}

export async function setGroupStatus(orgId, status) {
  const { error } = await supabase.rpc('superadmin_set_group_status', { p_org_id: orgId, p_status: status });
  if (error) fail(error);
}

export const fmtFcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
