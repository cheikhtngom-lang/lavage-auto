import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Mail, Phone, RefreshCw } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';
import { fetchAllGroups, confirmOrder, rejectOrder, setGroupStatus, GROUP_STATUS, ORDER_STATUS, fmtFcfa } from '../../lib/groups';

const KIND_LABEL = { commande: 'Commande', renouvellement: 'Renouvellement' };

// Super Admin > Groupes : les comptes « Sur mesure » (chefs d'entreprise
// multi-stations), leurs stations, et la confirmation MANUELLE des paiements
// hors ligne (Wave / Orange Money) — comme pour les autres abonnements, rien
// ne s'active sans que l'argent soit réellement arrivé. Voir add_sur_mesure_groups.sql.
export default function Groups() {
  useDocumentTitle('Groupes');
  const { PLANS } = useSuperAdminState();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    try {
      setGroups(await fetchAllGroups());
    } catch (err) {
      setError(err.message);
      setGroups([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (groups === null) return <div className="p-8 text-neutral-500">Chargement…</div>;

  const price = (plan) => PLANS[plan]?.price || 0;
  const activeStations = (g) => g.stations.filter((s) => !s.group_archived_at && s.status === 'active');
  const monthly = (g) => activeStations(g).reduce((sum, s) => sum + price(s.station_billing?.plan), 0);
  const pending = groups.flatMap((g) => g.orders.filter((o) => o.status === 'PENDING').map((o) => ({ ...o, groupName: g.name })));

  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = groups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Groupes <span className="text-purple-400">Sur mesure</span></h1>
          <p className="text-neutral-400 text-lg">Les chefs d’entreprise multi-stations et leurs paiements groupés.</p>
        </div>
        <button onClick={load} className="p-3 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-xl transition-colors" title="Actualiser">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {error && <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}

      {pending.length > 0 && (
        <div className="glass-card rounded-2xl p-5 border border-orange-500/30 bg-orange-500/[0.04] mb-8">
          <h2 className="text-lg font-bold text-white mb-1">Paiements en attente de confirmation</h2>
          <p className="text-sm text-neutral-400 mb-4">Confirmez uniquement une fois l’argent reçu : les stations sont alors créées / renouvelées.</p>
          <div className="space-y-2">
            {pending.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 bg-black/20 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-semibold text-white">{o.groupName} <span className="text-neutral-500 font-normal">· {KIND_LABEL[o.kind]}</span></p>
                  <p className="text-xs text-neutral-500">
                    {o.method || o.reference ? `Déclaré : ${o.method || '—'}${o.reference ? ` · réf. ${o.reference}` : ''}` : 'Aucun paiement déclaré (le patron peut encore payer en ligne)'}
                  </p>
                </div>
                <span className="font-bold text-white">{fmtFcfa(o.amount)}</span>
                <button
                  onClick={() => run(`c-${o.id}`, () => confirmOrder(o.id), `Confirmer la réception de ${fmtFcfa(o.amount)} pour « ${o.groupName} » ?`)}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-semibold px-3 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  {busy === `c-${o.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirmer
                </button>
                <button
                  onClick={() => run(`r-${o.id}`, () => rejectOrder(o.id), `Rejeter cette commande de « ${o.groupName} » ?`)}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 font-semibold px-3 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Rejeter
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Briefcase className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Aucun groupe pour l’instant</h3>
          <p className="text-neutral-400">Les comptes créés depuis la page « Offre sur mesure » apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginated.map((g) => {
            const st = GROUP_STATUS[g.status];
            const isOpen = open === g.id;
            return (
              <div key={g.id} className="glass-card rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-bold text-white text-lg">{g.name}</p>
                    <p className="text-sm text-neutral-400">{g.owner?.full_name || '—'}</p>
                    <div className="flex flex-wrap gap-x-4 text-xs text-neutral-500 mt-0.5">
                      {g.owner?.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {g.owner.email}</span>}
                      {g.owner?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {g.owner.phone}</span>}
                    </div>
                  </div>
                  <div className="text-sm">
                    <p className="text-neutral-400">{activeStations(g).length} station{activeStations(g).length > 1 ? 's' : ''} active{activeStations(g).length > 1 ? 's' : ''}</p>
                    <p className="text-white font-semibold">{fmtFcfa(monthly(g))}/mois</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-neutral-400">Échéance</p>
                    <p className="text-white">{g.next_billing_date ? new Date(g.next_billing_date).toLocaleDateString('fr-FR') : '—'}</p>
                  </div>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap ${st.className}`}>{st.label}</span>
                  <button onClick={() => setOpen(isOpen ? null : g.id)} className="p-2 text-neutral-400 hover:text-white">
                    {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-white/5 p-5 space-y-5">
                    <div className="flex gap-2 flex-wrap">
                      {g.status !== 'en_retard' ? (
                        <button onClick={() => run(`s-${g.id}`, () => setGroupStatus(g.id, 'en_retard'), `Marquer « ${g.name} » impayé ? Toutes ses stations seront bloquées.`)} disabled={busy !== null}
                          className="px-4 py-2 rounded-lg bg-red-600/15 hover:bg-red-600/25 text-red-400 border border-red-500/30 text-sm font-semibold disabled:opacity-50">Marquer impayé</button>
                      ) : (
                        <button onClick={() => run(`s-${g.id}`, () => setGroupStatus(g.id, 'a_jour'), `Remettre « ${g.name} » à jour ? Ses stations seront débloquées.`)} disabled={busy !== null}
                          className="px-4 py-2 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/30 text-sm font-semibold disabled:opacity-50">Remettre à jour</button>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-neutral-300 mb-2">Stations</h3>
                      {g.stations.length === 0 ? <p className="text-sm text-neutral-500">Aucune station.</p> : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {g.stations.map((s) => (
                            <div key={s.id} className="flex justify-between bg-black/20 rounded-lg px-3 py-2 text-sm">
                              <span className="text-neutral-200">{s.name}{s.city ? ` · ${s.city}` : ''}{s.group_archived_at ? ' (archivée)' : ''}</span>
                              <span className="text-neutral-500">{PLANS[s.station_billing?.plan]?.label || s.station_billing?.plan} · {s.group_origin === 'joined' ? 'rattachée' : 'créée'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-neutral-300 mb-2">Commandes et renouvellements</h3>
                      {g.orders.length === 0 ? <p className="text-sm text-neutral-500">Aucune commande.</p> : (
                        <div className="space-y-1.5">
                          {g.orders.map((o) => (
                            <div key={o.id} className="flex flex-wrap justify-between gap-2 bg-black/20 rounded-lg px-3 py-2 text-sm">
                              <span className="text-neutral-300">{KIND_LABEL[o.kind]} · {new Date(o.created_at).toLocaleDateString('fr-FR')}</span>
                              <span className="flex items-center gap-3">
                                <span className="text-white font-medium">{fmtFcfa(o.amount)}</span>
                                <span className={`text-xs px-2.5 py-0.5 rounded-full border ${ORDER_STATUS[o.status]?.className}`}>{ORDER_STATUS[o.status]?.label}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <Pagination page={currentPage} pageSize={pageSize} totalItems={groups.length} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
        </div>
      )}
    </div>
  );
}
