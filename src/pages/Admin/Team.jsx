import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Plus, X, Check, ShieldCheck, Mail, Ban, RotateCcw, Trash2, Pencil, Loader2, Copy,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useAppState } from '../../hooks/useAppState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { getCurrentStationId } from '../../lib/accounts';
import { hasPerm, PERMISSIONS, PERMISSION_GROUPS, permLabel } from '../../lib/permissions';
import { maxTeamSeats, usedTeamSeats } from '../../lib/planLimits';
import {
  fetchRoles, fetchMembers, fetchStationOwner, inviteMember, resendInvite,
  setMemberRole, setMemberStatus, deleteMember,
  createCustomRole, updateCustomRole, deleteCustomRole, MAX_CUSTOM_ROLES,
} from '../../lib/stationTeam';

const STATUS_META = {
  active:    { label: 'Actif',    cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  invited:   { label: 'Invité',   cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  suspended: { label: 'Suspendu', cls: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30' },
};

function initials(name, email) {
  const src = (name || email || '?').trim();
  return src.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function Team() {
  useDocumentTitle('Équipe');
  const { myPermissions, stationBilling } = useAppState();
  const stationId = getCurrentStationId();
  const canManage = hasPerm(myPermissions || [], 'team.manage');

  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const seatLimit = maxTeamSeats(stationBilling?.plan);
  const seatsUsed = usedTeamSeats(members);
  const atSeatLimit = seatsUsed >= seatLimit;

  const reload = useCallback(async () => {
    if (!stationId || stationId === 'default') { setLoading(false); return; }
    try {
      const [r, m, o] = await Promise.all([fetchRoles(stationId), fetchMembers(stationId), fetchStationOwner(stationId)]);
      setRoles(r); setMembers(m); setOwner(o); setPageError('');
    } catch (e) {
      setPageError(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const customRoles = roles.filter((r) => !r.is_builtin);
  const roleName = (id) => roles.find((r) => r.id === id)?.name || '—';

  // ─── Invitation ────────────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', fullName: '', roleId: '' });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null); // { type, text, link? }

  const openInvite = () => {
    setInviteForm({ email: '', fullName: '', roleId: roles[0]?.id || '' });
    setInviteMsg(null);
    setShowInvite(true);
  };

  const submitInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.roleId) return;
    setInviteBusy(true); setInviteMsg(null);
    try {
      const res = await inviteMember(inviteForm);
      await reload();
      if (res?.emailSent === false && res?.link) {
        setInviteMsg({ type: 'warn', text: "Email non envoyé. Partagez ce lien manuellement :", link: res.link });
      } else {
        setInviteMsg({ type: 'ok', text: `Invitation envoyée à ${inviteForm.email}.` });
        setInviteForm((f) => ({ ...f, email: '', fullName: '' }));
      }
    } catch (err) {
      setInviteMsg({ type: 'err', text: err.message });
    } finally {
      setInviteBusy(false);
    }
  };

  // ─── Actions membre ───────────────────────────────────────────────
  const [rowBusy, setRowBusy] = useState(null);
  const runRow = async (id, fn) => {
    setRowBusy(id);
    try { await fn(); await reload(); }
    catch (err) { alert(err.message); }
    finally { setRowBusy(null); }
  };

  // ─── Éditeur de rôle ─────────────────────────────────────────────
  const [roleModal, setRoleModal] = useState(null); // null | 'new' | role
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] });
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleErr, setRoleErr] = useState('');

  const openNewRole = () => { setRoleForm({ name: '', description: '', permissions: [] }); setRoleErr(''); setRoleModal('new'); };
  const openEditRole = (role) => {
    setRoleForm({ name: role.name, description: role.description || '', permissions: [...(role.permissions || [])] });
    setRoleErr(''); setRoleModal(role);
  };
  const togglePerm = (key) => setRoleForm((f) => ({
    ...f,
    permissions: f.permissions.includes(key) ? f.permissions.filter((k) => k !== key) : [...f.permissions, key],
  }));

  const submitRole = async (e) => {
    e.preventDefault();
    if (!roleForm.name.trim()) { setRoleErr('Le nom est requis.'); return; }
    if (roleForm.permissions.length === 0) { setRoleErr('Sélectionnez au moins une permission.'); return; }
    setRoleBusy(true); setRoleErr('');
    try {
      if (roleModal === 'new') await createCustomRole(stationId, roleForm);
      else await updateCustomRole(roleModal.id, roleForm);
      await reload();
      setRoleModal(null);
    } catch (err) {
      setRoleErr(err.message);
    } finally {
      setRoleBusy(false);
    }
  };

  const removeRole = async (role) => {
    if (!window.confirm(`Supprimer le rôle « ${role.name} » ?`)) return;
    try { await deleteCustomRole(role.id); await reload(); }
    catch (err) { alert(err.message); }
  };

  // ─── Rendu ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-neutral-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Chargement de l'équipe…
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
          Gestion de l'<span className="text-blue-400">équipe</span>
        </h1>
        <p className="text-neutral-400">Invitez des collaborateurs par email et définissez leurs accès par rôle.</p>
      </div>

      {pageError && (
        <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{pageError}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ═══ Collaborateurs ═══ */}
        <div className="lg:col-span-2">
          <Card className="border-white/5 bg-white/[0.02]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-white">Collaborateurs</h2>
                {canManage && (
                  <button
                    onClick={openInvite}
                    disabled={atSeatLimit}
                    title={atSeatLimit ? `Limite de ${seatLimit} comptes atteinte pour ce forfait` : undefined}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" /> Inviter
                  </button>
                )}
              </div>
              <p className={`text-xs mb-5 ${atSeatLimit ? 'text-amber-400' : 'text-neutral-500'}`}>
                {seatsUsed}/{seatLimit >= 9999 ? '∞' : seatLimit} comptes utilisés (propriétaire compris)
                {atSeatLimit && ' — passez à un forfait supérieur pour inviter plus de collaborateurs.'}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[560px]">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                      <th className="py-3 pr-4 font-semibold">Membre</th>
                      <th className="py-3 pr-4 font-semibold">Rôle</th>
                      <th className="py-3 pr-4 font-semibold">Statut</th>
                      <th className="py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Propriétaire */}
                    {owner && (
                      <tr className="border-b border-white/5">
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-xs font-bold text-white">
                              {initials(owner.name, owner.email)}
                            </div>
                            <div>
                              <p className="font-semibold text-white text-sm">{owner.name}</p>
                              <p className="text-xs text-neutral-500">{owner.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 pr-4"><span className="text-neutral-200 text-sm font-medium">Propriétaire</span></td>
                        <td className="py-4 pr-4">
                          <Badge variant="outline" className={`${STATUS_META.active.cls} text-xs`}>Actif</Badge>
                        </td>
                        <td className="py-4 text-right text-neutral-600">—</td>
                      </tr>
                    )}

                    {/* Membres */}
                    {members.map((m) => {
                      const st = STATUS_META[m.status] || STATUS_META.invited;
                      const busy = rowBusy === m.id;
                      return (
                        <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 pr-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-neutral-700 to-neutral-600 flex items-center justify-center text-xs font-bold text-white">
                                {initials(m.full_name, m.email)}
                              </div>
                              <div>
                                <p className="font-semibold text-white text-sm">{m.full_name || '—'}</p>
                                <p className="text-xs text-neutral-500">{m.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 pr-4">
                            {canManage && m.status !== 'invited' ? (
                              <select
                                value={m.role_id}
                                disabled={busy}
                                onChange={(e) => runRow(m.id, () => setMemberRole(m.id, e.target.value))}
                                className="bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500"
                              >
                                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                            ) : (
                              <span className="text-neutral-300 text-sm">{roleName(m.role_id)}</span>
                            )}
                          </td>
                          <td className="py-4 pr-4">
                            <Badge variant="outline" className={`${st.cls} text-xs`}>{st.label}</Badge>
                          </td>
                          <td className="py-4">
                            <div className="flex justify-end items-center gap-1.5">
                              {busy && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
                              {canManage && m.status === 'invited' && (
                                <button title="Renvoyer l'invitation" disabled={busy}
                                  onClick={() => runRow(m.id, () => resendInvite(m))}
                                  className="p-2 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-neutral-400 rounded-lg transition-colors">
                                  <Mail className="w-4 h-4" />
                                </button>
                              )}
                              {canManage && m.status === 'active' && (
                                <button title="Suspendre" disabled={busy}
                                  onClick={() => runRow(m.id, () => setMemberStatus(m.id, 'suspended'))}
                                  className="p-2 bg-white/5 hover:bg-amber-500/20 hover:text-amber-400 text-neutral-400 rounded-lg transition-colors">
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}
                              {canManage && m.status === 'suspended' && (
                                <button title="Réactiver" disabled={busy}
                                  onClick={() => runRow(m.id, () => setMemberStatus(m.id, 'active'))}
                                  className="p-2 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-neutral-400 rounded-lg transition-colors">
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                              {canManage && (
                                <button title="Retirer de l'équipe" disabled={busy}
                                  onClick={() => {
                                    if (window.confirm(`Retirer ${m.full_name || m.email} de l'équipe ?`)) runRow(m.id, () => deleteMember(m));
                                  }}
                                  className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {members.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-neutral-500 text-sm">
                          Aucun collaborateur pour l'instant. Cliquez sur « Inviter » pour commencer.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ Rôles de la Station ═══ */}
        <div>
          <Card className="border-white/5 bg-white/[0.02]">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-bold text-white">Rôles de la station</h2>
                {canManage && (
                  <button
                    onClick={openNewRole}
                    disabled={customRoles.length >= MAX_CUSTOM_ROLES}
                    className="bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nouveau
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-500 mb-5">
                {customRoles.length}/{MAX_CUSTOM_ROLES} rôles personnalisés
              </p>

              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                {roles.map((role) => {
                  const all = (role.permissions || []).includes('*');
                  return (
                    <div key={role.id} className="bg-neutral-900/60 border border-white/5 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-white text-sm">{role.name}</p>
                          {role.description && <p className="text-xs text-neutral-500 mt-0.5">{role.description}</p>}
                        </div>
                        {!role.is_builtin && canManage && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => openEditRole(role)}
                              className="p-1.5 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-neutral-400 rounded-md transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => removeRole(role)}
                              className="p-1.5 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-md transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {role.is_builtin && (
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-500">
                          <ShieldCheck className="w-3.5 h-3.5" /> Rôle du catalogue (géré par la plateforme)
                        </p>
                      )}

                      <div className="mt-3 space-y-1.5">
                        {all ? (
                          <p className="flex items-center gap-2 text-xs text-emerald-400">
                            <Check className="w-3.5 h-3.5" /> Tous les droits sur la station
                          </p>
                        ) : (
                          (role.permissions || []).map((k) => (
                            <p key={k} className="flex items-center gap-2 text-xs text-neutral-300">
                              <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> {permLabel(k)}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ Modal Invitation ═══ */}
      <AnimatePresence>
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button onClick={() => setShowInvite(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold text-white mb-1">Inviter un collaborateur</h2>
              <p className="text-sm text-neutral-500 mb-5">Il recevra un email pour choisir son mot de passe.</p>

              <form onSubmit={submitInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Email</label>
                  <input type="email" required value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="collaborateur@email.com"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Nom complet</label>
                  <input type="text" value={inviteForm.fullName}
                    onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                    placeholder="Amadou Diop"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Rôle</label>
                  <select required value={inviteForm.roleId}
                    onChange={(e) => setInviteForm({ ...inviteForm, roleId: e.target.value })}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
                    <option value="" disabled>Choisir un rôle…</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                {inviteMsg && (
                  <div className={`text-sm rounded-lg px-3 py-2 ${
                    inviteMsg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : inviteMsg.type === 'warn' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    <p>{inviteMsg.text}</p>
                    {inviteMsg.link && (
                      <button type="button" onClick={() => navigator.clipboard?.writeText(inviteMsg.link)}
                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold underline">
                        <Copy className="w-3.5 h-3.5" /> Copier le lien
                      </button>
                    )}
                  </div>
                )}

                <button type="submit" disabled={inviteBusy}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {inviteBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                  Envoyer l'invitation
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ Modal Rôle personnalisé ═══ */}
      <AnimatePresence>
        {roleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button onClick={() => setRoleModal(null)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold text-white mb-5">
                {roleModal === 'new' ? 'Nouveau rôle' : `Modifier « ${roleModal.name} »`}
              </h2>

              <form onSubmit={submitRole} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Nom du rôle</label>
                  <input type="text" required value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    placeholder="Ex : Responsable de nuit"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Description</label>
                  <input type="text" value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    placeholder="Courte description de ce que fait ce rôle"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Permissions</label>
                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1.5">{group}</p>
                        <div className="space-y-1.5">
                          {PERMISSIONS.filter((p) => p.group === group).map((p) => (
                            <label key={p.key} className="flex items-center gap-2.5 text-sm text-neutral-300 cursor-pointer">
                              <input type="checkbox" checked={roleForm.permissions.includes(p.key)}
                                onChange={() => togglePerm(p.key)}
                                className="w-4 h-4 rounded accent-blue-600" />
                              {p.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {roleErr && <p className="text-sm text-red-400">{roleErr}</p>}

                <button type="submit" disabled={roleBusy}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {roleBusy && <Loader2 className="w-5 h-5 animate-spin" />}
                  {roleModal === 'new' ? 'Créer le rôle' : 'Enregistrer'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
