// Accès données "Gestion d'équipe" pour l'espace station (voir add_station_team.sql).
// Utilisé par src/pages/Admin/Team.jsx.
import { supabase } from './supabaseClient';

const MAX_CUSTOM_ROLES = 10;
export { MAX_CUSTOM_ROLES };

// ─── Rôles ────────────────────────────────────────────────────────────
export async function fetchRoles(stationId) {
  const { data, error } = await supabase
    .from('station_roles')
    .select('*')
    .eq('station_id', stationId)
    .order('is_builtin', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createCustomRole(stationId, { name, description, permissions }) {
  const key = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await supabase
    .from('station_roles')
    .insert({
      station_id: stationId,
      key,
      name: name.trim(),
      description: (description || '').trim(),
      permissions: permissions || [],
      is_builtin: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCustomRole(roleId, { name, description, permissions }) {
  const patch = {};
  if (name !== undefined) patch.name = name.trim();
  if (description !== undefined) patch.description = description.trim();
  if (permissions !== undefined) patch.permissions = permissions;
  const { error } = await supabase.from('station_roles').update(patch).eq('id', roleId);
  if (error) throw new Error(error.message);
}

export async function deleteCustomRole(roleId) {
  const { error } = await supabase.from('station_roles').delete().eq('id', roleId);
  if (error) {
    // FK station_members.role_id ON DELETE RESTRICT : rôle encore attribué.
    if (error.code === '23503') throw new Error('Ce rôle est encore attribué à un membre. Changez son rôle d’abord.');
    throw new Error(error.message);
  }
}

// ─── Membres ──────────────────────────────────────────────────────────
export async function fetchMembers(stationId) {
  const { data, error } = await supabase
    .from('station_members')
    .select('*, station_roles(name, key, permissions)')
    .eq('station_id', stationId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// Renvoie { name, email } du propriétaire pour la ligne "Propriétaire".
export async function fetchStationOwner(stationId) {
  const { data } = await supabase
    .from('stations')
    .select('owner_name, owner_email')
    .eq('id', stationId)
    .single();
  return { name: data?.owner_name || 'Propriétaire', email: data?.owner_email || '' };
}

export async function inviteMember({ email, fullName, roleId }) {
  const { data, error } = await supabase.functions.invoke('invite-station-member', {
    body: { email, fullName, roleId },
  });
  if (error) {
    let detail = null;
    try { detail = await error.context?.json?.(); } catch { /* ignore */ }
    throw new Error(detail?.error || error.message || "Envoi de l'invitation impossible.");
  }
  if (data?.error) throw new Error(data.error);
  return data; // { ok, emailSent, link, warning? }
}

export async function resendInvite(member) {
  // Réutilise la même Edge Function : elle révoque l'ancien token et renvoie l'email.
  return inviteMember({ email: member.email, fullName: member.full_name, roleId: member.role_id });
}

export async function setMemberRole(memberId, roleId) {
  const { error } = await supabase.from('station_members').update({ role_id: roleId }).eq('id', memberId);
  if (error) throw new Error(error.message);
}

export async function setMemberStatus(memberId, status) {
  const { error } = await supabase.from('station_members').update({ status }).eq('id', memberId);
  if (error) throw new Error(error.message);
}

// Supprime le membre + sa fiche laveur liée (best-effort). Ne touche pas au
// compte auth : un profil 'staff' orphelin ne peut plus rien faire (aucune
// ligne station_members active), et le propriétaire peut réinviter la personne.
export async function deleteMember(member) {
  if (member.employee_id) {
    await supabase.from('employees').delete().eq('id', member.employee_id);
  }
  const { error } = await supabase.from('station_members').delete().eq('id', member.id);
  if (error) throw new Error(error.message);
}
