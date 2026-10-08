import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../components/ui/Card';
import { Clock, CheckCircle2, Smartphone, Wallet } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';
import {
  PAYOUT_FILTERS, payoutStatus, isPendingPayout, isSettledPayout, isInProgressPayout, sumPart, serviceTypeLabel, formatPayoutDate,
} from '../../lib/payouts';

// Rubrique « Reversements » de la station (anciennement un bloc de
// Comptabilité) : ce que la plateforme lui doit sur les paiements en ligne
// (lavage, vidange, boutique) et l'historique complet. Lecture seule : quand
// le Super Admin marque un lot comme reversé, le statut passe à « Reversé »
// ici en direct (Realtime paiements_lavage, voir useAppState).
export default function Payouts() {
  useDocumentTitle('Reversements');
  const { lavagePayments } = useAppState();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const pending = lavagePayments.filter(isPendingPayout);
  const settled = lavagePayments.filter(isSettledPayout);
  const inProgress = lavagePayments.filter(isInProgressPayout);

  const match = (PAYOUT_FILTERS.find((f) => f.key === filter) || PAYOUT_FILTERS[0]).match;
  const filtered = lavagePayments.filter(match);
  useEffect(() => { setPage(1); }, [filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Reversements <span className="text-blue-400">en ligne</span></h1>
        <p className="text-neutral-400 text-lg">Ce que la plateforme vous reverse sur les lavages, vidanges et achats payés en ligne.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="border-white/5 bg-gradient-to-br from-orange-900/20 to-black">
          <CardContent className="p-6">
            <div className="p-3 bg-orange-500/20 rounded-xl w-fit mb-4"><Clock className="w-6 h-6 text-orange-400" /></div>
            <p className="text-neutral-400 text-sm font-medium mb-1">En attente de reversement</p>
            <h3 className="text-3xl font-bold text-white">{sumPart(pending).toLocaleString('fr-FR')} FCFA</h3>
            <p className="text-neutral-500 text-xs mt-2">{pending.length} paiement{pending.length > 1 ? 's' : ''} à recevoir de la plateforme</p>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-gradient-to-br from-emerald-900/20 to-black">
          <CardContent className="p-6">
            <div className="p-3 bg-emerald-500/20 rounded-xl w-fit mb-4"><CheckCircle2 className="w-6 h-6 text-emerald-400" /></div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Déjà reversé</p>
            <h3 className="text-3xl font-bold text-white">{sumPart(settled).toLocaleString('fr-FR')} FCFA</h3>
            <p className="text-neutral-500 text-xs mt-2">{settled.length} paiement{settled.length > 1 ? 's' : ''} réglé{settled.length > 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-gradient-to-br from-blue-900/20 to-black">
          <CardContent className="p-6">
            <div className="p-3 bg-blue-500/20 rounded-xl w-fit mb-4"><Smartphone className="w-6 h-6 text-blue-400" /></div>
            <p className="text-neutral-400 text-sm font-medium mb-1">Redistribution automatique en cours</p>
            <h3 className="text-3xl font-bold text-white">{inProgress.length}</h3>
            <p className="text-neutral-500 text-xs mt-2">Arrive directement sur votre compte PayDunya</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-white">Historique des reversements</h2>
        <div className="flex flex-wrap gap-1.5">
          {PAYOUT_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filter === f.key ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Wallet className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-400">{lavagePayments.length === 0 ? "Aucun paiement en ligne pour l'instant." : 'Aucun reversement dans ce filtre.'}</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-5 font-semibold text-neutral-400">Date</th>
                <th className="p-5 font-semibold text-neutral-400">Prestation</th>
                <th className="p-5 font-semibold text-neutral-400">Encaissé</th>
                <th className="p-5 font-semibold text-neutral-400">Votre part</th>
                <th className="p-5 font-semibold text-neutral-400">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const status = payoutStatus(p);
                return (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="p-5 text-neutral-300 text-sm whitespace-nowrap">
                      {formatPayoutDate(p.createdAt)}
                      {isSettledPayout(p) && p.redistributionDetail && <p className="text-neutral-500 text-xs mt-0.5">{p.redistributionDetail}</p>}
                    </td>
                    <td className="p-5"><span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-white/5 text-neutral-400 border-white/10">{serviceTypeLabel(p.typeService)}</span></td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{(p.montantTotal || 0).toLocaleString('fr-FR')} FCFA</td>
                    <td className="p-5 text-white font-semibold whitespace-nowrap">{(p.partStation || 0).toLocaleString('fr-FR')} FCFA</td>
                    <td className="p-5"><span className={`text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap ${status.className}`}>{status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
}
