import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, DoorOpen, UserCog, LogOut as LeaveIcon, Plus, X, Loader2, Search, AlertTriangle, ShoppingCart, Send } from 'lucide-react';
import { useGroup } from '../../components/layout/GroupLayout';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { groupMonthly } from '../../lib/groupPricing';
import {
  fetchGroupStations, fetchJoinRequests, openStation, removeStation, nominateStationAdmin, removeStationAdmin,
  searchJoinableStations, requestJoin, cancelJoin, JOIN_STATUS, placeLabel, fmtFcfa,
} from '../../lib/groups';

const SUB_LABEL = {
  a_jour: ['À jour', 'text-emerald-400'],
  en_retard: ['Impayé', 'text-red-400'],
  essai: ['Essai', 'text-blue-400'],
  illimite: ['Illimité', 'text-purple-400'],
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>
        <h2 className="text-xl font-bold text-white mb-4 pr-8">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500';

// ─── Retirer une station ────────────────────────────────────────────────
function RemoveModal({ station, onClose, onDone }) {
  const joined = station.origin === 'joined';
  const [mode, setMode] = useState(joined ? 'release' : 'archive');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ok = mode !== 'delete' || confirmName.trim().toLowerCase() === station.name.trim().toLowerCase();

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await removeStation(station.id, mode, confirmName);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const Option = ({ value, title, text }) => (
    <label className={`block cursor-pointer rounded-xl border p-3 mb-2 transition-colors ${mode === value ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 hover:border-white/20'}`}>
      <div className="flex items-start gap-3">
        <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-emerald-500" />
        <div><p className="font-semibold text-white text-sm">{title}</p><p className="text-xs text-neutral-400 mt-0.5">{text}</p></div>
      </div>
    </label>
  );

  return (
    <Modal title={`Retirer « ${station.name} »`} onClose={onClose}>
      {joined ? (
        <Option value="release" title="Sortir du groupe"
          text="La station redevient indépendante avec son propre propriétaire et son propre abonnement. Ses données ne sont pas touchées. Elle ne vous appartient pas : vous ne pouvez pas la supprimer." />
      ) : (
        <>
          <Option value="archive" title="Archiver (recommandé)"
            text="La station est masquée et n’est plus facturée au prochain renouvellement. Ses données sont conservées ; vous pourrez la réactiver depuis une commande." />
          <Option value="delete" title="Supprimer définitivement"
            text="Irréversible : la station et toutes ses données disparaissent." />
        </>
      )}

      {mode === 'delete' && (
        <div className="mt-3">
          <p className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> Cette action ne peut pas être annulée.
          </p>
          <label className="block text-sm text-neutral-400 mb-1.5">Tapez le nom de la station pour confirmer : <span className="text-white">{station.name}</span></label>
          <input className={inputCls} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={station.name} />
        </div>
      )}

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      <button onClick={submit} disabled={!ok || busy}
        className={`mt-4 w-full flex items-center justify-center gap-2 font-bold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mode === 'delete' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {mode === 'delete' ? 'Supprimer définitivement' : mode === 'archive' ? 'Archiver la station' : 'Sortir du groupe'}
      </button>
    </Modal>
  );
}

// ─── Super Admin de la station (un seul) ────────────────────────────────
function AdminModal({ station, onClose, onDone }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const sa = station.superAdmin;

  const nominate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await nominateStationAdmin({ stationId: station.id, email, fullName });
      if (res.emailSent === false && res.link) setInfo(`L’email n’a pas pu partir. Transmettez ce lien : ${res.link}`);
      else onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Retirer ${sa.name || sa.email} comme Super Admin de « ${station.name} » ? Son compte perdra l’accès à la station.`)) return;
    setBusy(true);
    setError('');
    try {
      await removeStationAdmin(station.id);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Super Admin — ${station.name}`} onClose={onClose}>
      <p className="text-sm text-neutral-400 mb-4">
        Un seul par station. Il gère l’équipe de cette station et peut y définir des rôles ; vous restez au-dessus de lui (facturation, retrait du groupe, cession…).
      </p>
      {sa ? (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="font-semibold text-white">{sa.name || '—'}</p>
          <p className="text-sm text-neutral-400">{sa.email}</p>
          <p className={`text-xs mt-1 ${sa.status === 'active' ? 'text-emerald-400' : 'text-orange-400'}`}>
            {sa.status === 'active' ? 'Compte actif' : sa.status === 'invited' ? 'Invitation envoyée — pas encore activée' : 'Suspendu'}
          </p>
          <button onClick={remove} disabled={busy} className="mt-3 text-sm text-red-400 hover:text-red-300 disabled:opacity-50">Retirer ce Super Admin</button>
        </div>
      ) : (
        <form onSubmit={nominate} className="space-y-3">
          <input required maxLength={100} className={inputCls} placeholder="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input required type="email" maxLength={150} className={inputCls} placeholder="Email (jamais utilisé sur la plateforme)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Nommer et inviter
          </button>
        </form>
      )}
      {info && <p className="text-xs text-orange-300 mt-3 break-all">{info}</p>}
      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
    </Modal>
  );
}

// ─── Rattacher une station existante ────────────────────────────────────
function JoinModal({ plans, onClose, onDone }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [plan, setPlan] = useState(plans[0]?.key || 'Starter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { searchJoinableStations(term).then(setResults).catch(() => setResults([])); }, 300);
    return () => clearTimeout(t);
  }, [term]);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await requestJoin(picked.id, plan);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Rattacher une station existante" onClose={onClose}>
      <p className="text-sm text-neutral-400 mb-4">
        Le propriétaire de la station doit accepter : vous verrez alors tout son activité et pourrez y agir, et la facturation passera par votre groupe.
      </p>
      {!picked ? (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input className={`${inputCls} pl-10`} placeholder="Nom de la station…" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            {results.map((s) => (
              <button key={s.id} onClick={() => setPicked(s)} className="w-full text-left bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 transition-colors">
                <p className="font-semibold text-white">{s.name}</p>
                <p className="text-xs text-neutral-500">{s.city || 'Ville non renseignée'}</p>
              </button>
            ))}
            {term.trim().length >= 2 && results.length === 0 && <p className="text-sm text-neutral-500">Aucune station libre trouvée.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 mb-3 flex justify-between items-center">
            <div><p className="font-semibold text-white">{picked.name}</p><p className="text-xs text-neutral-500">{picked.city}</p></div>
            <button onClick={() => setPicked(null)} className="text-xs text-neutral-400 hover:text-white">Changer</button>
          </div>
          <label className="block text-sm text-neutral-400 mb-1.5">Abonnement proposé</label>
          <select className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)}>
            {plans.map((p) => <option key={p.key} value={p.key}>{p.label} — {fmtFcfa(p.price)}/mois</option>)}
          </select>
          {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
          <button onClick={send} disabled={busy} className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer la demande au propriétaire
          </button>
        </>
      )}
    </Modal>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────
export default function Stations() {
  useDocumentTitle('Mes stations');
  const { org, plans, tiers, loaded, reload } = useGroup();
  const [stations, setStations] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [adminFor, setAdminFor] = useState(null);
  const [showJoin, setShowJoin] = useState(false);

  const load = useCallback(async () => {
    if (!org) return;
    try {
      const [s, r] = await Promise.all([fetchGroupStations(org.id), fetchJoinRequests()]);
      setStations(s);
      setRequests(r);
    } catch (err) {
      setError(err.message);
      setStations([]);
    }
  }, [org]);
  useEffect(() => { load(); }, [load]);

  const open = async (s) => {
    setOpening(s.id);
    setError('');
    try {
      await openStation(s.id);
      window.location.href = '/admin/queue'; // rechargement complet : l'interface station repart de zéro
    } catch (err) {
      setError(err.message);
      setOpening(null);
    }
  };

  const refreshAll = () => { setRemoving(null); setAdminFor(null); setShowJoin(false); load(); reload(); };

  if (!loaded || stations === null) return <div className="p-8 text-neutral-500">Chargement…</div>;

  const active = stations.filter((s) => !s.archived);
  const planPrice = (key) => plans.find((p) => p.key === key)?.price || 0;
  // Coût du prochain renouvellement : stations actives, remise de volume comprise (lib/groupPricing.js).
  const monthly = groupMonthly(active.filter((s) => s.status === 'active').map((s) => planPrice(s.plan)), tiers);
  const nextDate = org?.next_billing_date ? new Date(org.next_billing_date).toLocaleDateString('fr-FR') : '—';
  const openRequests = requests.filter((r) => r.status === 'pending' || r.status === 'accepted');

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Mes <span className="text-emerald-400">stations</span></h1>
          <p className="text-neutral-400 mt-1">Ouvrez une station pour y travailler avec tous les droits.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowJoin(true)} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-5 py-3 rounded-xl font-semibold transition-colors">
            <Plus className="w-4 h-4" /> Station existante
          </button>
          <Link to="/groupe/commande" className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-500/20">
            <ShoppingCart className="w-4 h-4" /> Nouvelle commande
          </Link>
        </div>
      </div>

      {org?.status === 'en_retard' && (
        <div className="mb-6 flex items-center justify-between gap-3 text-sm bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3">
          <span>Votre groupe est en retard de paiement : vos stations sont bloquées tant que vous n’avez pas renouvelé.</span>
          <Link to="/groupe/facturation" className="font-bold underline whitespace-nowrap">Renouveler</Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[['Stations actives', active.length, null], ['Coût mensuel', fmtFcfa(monthly.total), monthly.pct > 0 ? `Remise de ${monthly.pct} % incluse` : (monthly.next ? `−${monthly.next.pct} % dès ${monthly.next.min_stations} stations` : null)], ['Prochaine échéance', nextDate, null]].map(([label, value, hint]) => (
          <div key={label} className="glass-card rounded-2xl p-5 border border-white/10">
            <p className="text-sm text-neutral-400">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {hint && <p className="text-xs text-emerald-400/80 mt-1">{hint}</p>}
          </div>
        ))}
      </div>

      {error && <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}

      {stations.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Building2 className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Aucune station pour l’instant</h3>
          <p className="text-neutral-400 mb-5">Composez votre offre : vos stations sont créées dès le paiement confirmé.</p>
          <Link to="/groupe/commande" className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold">
            <ShoppingCart className="w-4 h-4" /> Passer ma première commande
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {stations.map((s) => {
            const [subLabel, subCls] = SUB_LABEL[s.subscriptionStatus] || ['—', 'text-neutral-400'];
            return (
              <div key={s.id} className={`glass-card rounded-2xl p-5 border ${s.archived ? 'border-white/5 opacity-60' : 'border-white/10'}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-bold text-lg truncate">{s.name}</p>
                    <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {placeLabel(s) || 'Lieu non renseigné'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-neutral-300">{s.origin === 'joined' ? 'Rattachée' : 'Créée par vous'}</span>
                    {s.archived && <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">Archivée</span>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-3">
                  <span className="text-neutral-300">{plans.find((p) => p.key === s.plan)?.label || s.plan || '—'}</span>
                  <span className={subCls}>{subLabel}</span>
                </div>
                <p className="text-xs text-neutral-500 mb-4 flex items-center gap-1.5">
                  <UserCog className="w-3.5 h-3.5" />
                  {s.superAdmin ? `Super Admin : ${s.superAdmin.name || s.superAdmin.email}${s.superAdmin.status === 'invited' ? ' (invité)' : ''}` : 'Pas de Super Admin'}
                </p>

                <div className="flex gap-2 flex-wrap">
                  {!s.archived && (
                    <button onClick={() => open(s)} disabled={opening !== null} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
                      {opening === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <DoorOpen className="w-4 h-4" />} Ouvrir
                    </button>
                  )}
                  {!s.archived && (
                    <button onClick={() => setAdminFor(s)} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 px-4 py-2 rounded-lg text-sm transition-colors">
                      <UserCog className="w-4 h-4" /> Super Admin
                    </button>
                  )}
                  {!s.archived && (
                    <button onClick={() => setRemoving(s)} className="flex items-center gap-2 bg-white/5 hover:bg-red-500/15 hover:text-red-400 border border-white/10 text-neutral-400 px-4 py-2 rounded-lg text-sm transition-colors">
                      <LeaveIcon className="w-4 h-4" /> Retirer
                    </button>
                  )}
                  {s.archived && <p className="text-xs text-neutral-500">Réactivez-la depuis « Nouvelle commande ».</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {requests.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold mb-3">Demandes de rattachement</h2>
          <div className="glass-card rounded-2xl border border-white/10 divide-y divide-white/5">
            {requests.map((r) => {
              const st = JOIN_STATUS[r.status] || JOIN_STATUS.cancelled;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-[160px]">
                    <p className="font-semibold">{r.stations?.name || 'Station'}</p>
                    <p className="text-xs text-neutral-500">{plans.find((p) => p.key === r.plan)?.label || r.plan}</p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full border ${st.className}`}>{st.label}</span>
                  {(r.status === 'pending' || r.status === 'accepted') && (
                    <button onClick={async () => { try { await cancelJoin(r.id); load(); } catch (err) { setError(err.message); } }} className="text-xs text-neutral-400 hover:text-red-400">Annuler</button>
                  )}
                </div>
              );
            })}
          </div>
          {openRequests.some((r) => r.status === 'accepted') && (
            <p className="text-sm text-emerald-400 mt-3">Une station a accepté : ajoutez-la depuis <Link to="/groupe/commande" className="underline font-semibold">Nouvelle commande</Link>.</p>
          )}
        </div>
      )}

      {removing && <RemoveModal station={removing} onClose={() => setRemoving(null)} onDone={refreshAll} />}
      {adminFor && <AdminModal station={adminFor} onClose={() => setAdminFor(null)} onDone={refreshAll} />}
      {showJoin && <JoinModal plans={plans} onClose={() => setShowJoin(false)} onDone={refreshAll} />}
    </div>
  );
}
