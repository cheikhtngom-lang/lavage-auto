import React, { useEffect, useState } from 'react';
import { Wallet, CheckCircle2, Clock, Building2, Search } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';
import {
  PAYOUT_FILTERS, payoutStatus, isPendingPayout, isSettledPayout, sumPart, serviceTypeLabel, formatPayoutDate, groupPayoutsByStation,
} from '../../lib/payouts';

// Rubrique « Reversements » du Super Admin (anciennement un bloc de
// Facturation) : pour chaque station, le nom et le montant à lui reverser
// sur les paiements en ligne dont la part n'a pas atteint son compte
// PayDunya, plus l'historique complet. La plateforme règle hors application
// (Wave / Orange Money / virement) puis marque le lot comme reversé
// (RPC mark_lavage_payments_settled, add_manual_disbursement.sql).
export default function Payouts() {
  useDocumentTitle('Reversements');
  const { lavagePayments, markLavagePaymentsSettled } = useSuperAdminState();
  const [settling, setSettling] = useState({});

  const byStation = groupPayoutsByStation(lavagePayments);
  const pending = lavagePayments.filter(isPendingPayout);
  const stationsOwed = byStation.filter((g) => g.pendingTotal > 0).length;

  const [stationSearch, setStationSearch] = useState('');
  const shownStations = byStation.filter((g) => (g.stationName || '').toLowerCase().includes(stationSearch.toLowerCase()));

  // Historique : filtre station + statut, paginé.
  const [stationFilter, setStationFilter] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const match = (PAYOUT_FILTERS.find((f) => f.key === filter) || PAYOUT_FILTERS[0]).match;
  const history = lavagePayments.filter((p) => match(p) && (!stationFilter || p.stationId === stationFilter));
  useEffect(() => { setPage(1); }, [filter, stationFilter]);
  const totalPages = Math.max(1, Math.ceil(history.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = history.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSettle = async (g) => {
    if (!window.confirm(`Confirmer avoir reversé ${g.pendingTotal.toLocaleString('fr-FR')} FCFA à ${g.stationName || 'cette station'} hors application ?`)) return;
    setSettling((prev) => ({ ...prev, [g.stationId]: true }));
    await markLavagePaymentsSettled(g.pendingIds);
    setSettling((prev) => ({ ...prev, [g.stationId]: false }));
  };

  const chip = (on) => `px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${on ? 'bg-purple-600/20 border-purple-500/50 text-purple-300' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Reversements <span className="text-purple-400">aux stations</span></h1>
        <p className="text-neutral-400 text-lg">Parts des paiements en ligne à reverser à chaque station, et historique complet.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="glass-card rounded-2xl p-6 border border-orange-500/20 bg-orange-500/[0.03]">
          <div className="p-3 bg-orange-500/20 rounded-xl w-fit mb-4"><Clock className="w-6 h-6 text-orange-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Total à reverser</p>
          <h3 className="text-3xl font-bold text-white">{sumPart(pending).toLocaleString('fr-FR')} FCFA</h3>
          <p className="text-neutral-500 text-xs mt-2">{pending.length} paiement{pending.length > 1 ? 's' : ''} en attente</p>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 bg-purple-500/20 rounded-xl w-fit mb-4"><Building2 className="w-6 h-6 text-purple-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Stations à régler</p>
          <h3 className="text-3xl font-bold text-white">{stationsOwed}</h3>
          <p className="text-neutral-500 text-xs mt-2">sur {byStation.length} station{byStation.length > 1 ? 's' : ''} ayant reçu des paiements en ligne</p>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-emerald-500/20 bg-emerald-500/[0.03]">
          <div className="p-3 bg-emerald-500/20 rounded-xl w-fit mb-4"><CheckCircle2 className="w-6 h-6 text-emerald-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Déjà reversé</p>
          <h3 className="text-3xl font-bold text-white">{sumPart(lavagePayments.filter(isSettledPayout)).toLocaleString('fr-FR')} FCFA</h3>
          <p className="text-neutral-500 text-xs mt-2">tous paiements confondus</p>
        </div>
      </div>

      {/* Par station */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-white">Par station</h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input type="text" placeholder="Rechercher une station..." value={stationSearch} onChange={(e) => setStationSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
        </div>
      </div>
      {shownStations.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10 mb-10">
          <Wallet className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-400">{byStation.length === 0 ? 'Aucun paiement en ligne pour le moment.' : 'Aucune station trouvée.'}</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto mb-10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-5 font-semibold text-neutral-400">Station</th>
                <th className="p-5 font-semibold text-neutral-400">À reverser</th>
                <th className="p-5 font-semibold text-neutral-400">Déjà reversé</th>
                <th className="p-5 font-semibold text-neutral-400">Dernier paiement</th>
                <th className="p-5 font-semibold text-neutral-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shownStations.map((g) => (
                <tr key={g.stationId || g.stationName} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="p-5">
                    <p className="font-bold text-white">{g.stationName || 'Sans nom'}</p>
                    <p className="text-xs text-neutral-500">{g.count} paiement{g.count > 1 ? 's' : ''} en ligne</p>
                  </td>
                  <td className="p-5 whitespace-nowrap">
                    {g.pendingTotal > 0
                      ? <><p className="text-orange-400 font-bold">{g.pendingTotal.toLocaleString('fr-FR')} FCFA</p><p className="text-xs text-neutral-500">{g.pendingIds.length} paiement{g.pendingIds.length > 1 ? 's' : ''}</p></>
                      : <span className="text-neutral-500">—</span>}
                  </td>
                  <td className="p-5 text-neutral-300 whitespace-nowrap">{g.settledTotal.toLocaleString('fr-FR')} FCFA</td>
                  <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{g.lastAt ? formatPayoutDate(g.lastAt) : '—'}</td>
                  <td className="p-5 text-right">
                    {g.pendingTotal > 0 ? (
                      <button onClick={() => handleSettle(g)} disabled={settling[g.stationId]}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 rounded-lg transition-colors text-xs font-bold whitespace-nowrap">
                        <CheckCircle2 className="w-4 h-4" /> Marquer comme reversé
                      </button>
                    ) : <span className="text-xs text-emerald-400">À jour</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Historique */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-white">Historique</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}
            className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500">
            <option value="">Toutes les stations</option>
            {byStation.filter((g) => g.stationId).map((g) => <option key={g.stationId} value={g.stationId}>{g.stationName || 'Sans nom'}</option>)}
          </select>
          {PAYOUT_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={chip(filter === f.key)}>{f.label}</button>
          ))}
        </div>
      </div>
      {history.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <p className="text-neutral-400">Aucun paiement dans ce filtre.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-5 font-semibold text-neutral-400">Date</th>
                <th className="p-5 font-semibold text-neutral-400">Station</th>
                <th className="p-5 font-semibold text-neutral-400">Prestation</th>
                <th className="p-5 font-semibold text-neutral-400">Encaissé</th>
                <th className="p-5 font-semibold text-neutral-400">Part station</th>
                <th className="p-5 font-semibold text-neutral-400">Commission</th>
                <th className="p-5 font-semibold text-neutral-400">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const status = payoutStatus(p);
                return (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="p-5 text-neutral-300 text-sm whitespace-nowrap">{formatPayoutDate(p.createdAt)}</td>
                    <td className="p-5 text-white font-medium">{p.stationName || 'Sans nom'}</td>
                    <td className="p-5"><span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-white/5 text-neutral-400 border-white/10">{serviceTypeLabel(p.typeService)}</span></td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{(p.montantTotal || 0).toLocaleString('fr-FR')} FCFA</td>
                    <td className="p-5 text-white font-semibold whitespace-nowrap">{(p.partStation || 0).toLocaleString('fr-FR')} FCFA</td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{(p.partPlateforme || 0).toLocaleString('fr-FR')} FCFA</td>
                    <td className="p-5"><span className={`text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap ${status.className}`}>{status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={history.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
}
