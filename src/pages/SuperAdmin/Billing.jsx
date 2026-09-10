import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle2, AlertTriangle, Bell, Clock, Infinity as InfinityIcon, XCircle, Smartphone, Search, Wallet } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { trialDaysRemaining, trialProgressPercent, trialUrgency } from '../../lib/stationTrial';
import { validatedMRR, validatedStations, modulesMRR } from '../../lib/platformRevenue';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';

const SUB_STATUS = {
  a_jour: { label: 'À jour', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  en_retard: { label: 'Impayé', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  essai: { label: 'Essai gratuit', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  illimite: { label: 'Accès illimité', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

export default function Billing() {
  useDocumentTitle('Facturation');
  const {
    stations, PLANS, markSubscriptionPaid, markSubscriptionOverdue, sendBillingReminder, grantUnlimitedAccess, revokeUnlimitedAccess,
    stationRenewalPayments, confirmRenewalPayment, rejectRenewalPayment,
    lavagePayments, markLavagePaymentsSettled,
  } = useSuperAdminState();
  const [reminded, setReminded] = useState({});
  const [settling, setSettling] = useState({});
  const pendingRenewals = stationRenewalPayments.filter((p) => p.status === 'PENDING');

  // Lavages payés en ligne dont la part station n'a pas (encore) atteint son
  // compte PayDunya — regroupés par station, la plateforme les reverse à la
  // main (Wave/Orange Money/virement) et marque le lot comme réglé d'un
  // coup. Voir add_manual_disbursement.sql / _shared/finalizePayment.ts.
  const pendingLavagePayouts = lavagePayments.filter((p) => p.statutRedistribution === 'manuel' || p.statutRedistribution === 'echec');
  const lavagePayoutsByStation = Object.values(
    pendingLavagePayouts.reduce((acc, p) => {
      const key = p.stationId || p.stationName;
      if (!acc[key]) acc[key] = { stationId: p.stationId, stationName: p.stationName, total: 0, ids: [] };
      acc[key].total += p.partStation || 0;
      acc[key].ids.push(p.id);
      return acc;
    }, {}),
  );

  const handleSettleLavage = async (group) => {
    setSettling((prev) => ({ ...prev, [group.stationId]: true }));
    await markLavagePaymentsSettled(group.ids);
    setSettling((prev) => ({ ...prev, [group.stationId]: false }));
  };

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filteredStations = stations.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) || (s.city || '').toLowerCase().includes(search.toLowerCase())
  );
  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filteredStations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedStations = filteredStations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // MRR = uniquement les abonnements RÉELLEMENT validés (paiement à jour) —
  // hors essais gratuits, impayés et accès illimités offerts. Définition
  // partagée avec Vue d'ensemble / Analytique / Bilan (lib/platformRevenue.js).
  const paidStations = validatedStations(stations);
  const mrr = validatedMRR(stations, PLANS);
  const modMrr = modulesMRR(stations);
  const trialCount = stations.filter(s => s.subscriptionStatus === 'essai').length;
  const overdueCount = stations.filter(s => s.subscriptionStatus === 'en_retard').length;
  const overdueAmount = stations
    .filter(s => s.subscriptionStatus === 'en_retard')
    .reduce((sum, s) => sum + (PLANS[s.plan]?.price || 0), 0);

  const handleRemind = (id) => {
    sendBillingReminder(id);
    setReminded(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setReminded(prev => ({ ...prev, [id]: false })), 3000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Facturation & <span className="text-purple-400">Abonnements</span></h1>
        <p className="text-neutral-400 text-lg">Suivez les revenus récurrents de la plateforme et les impayés.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-purple-500/10 w-fit mb-4"><CreditCard className="w-6 h-6 text-purple-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Revenu Récurrent Mensuel</p>
          <h3 className="text-3xl font-bold text-white">{mrr.toLocaleString('fr-FR')} FCFA</h3>
          <p className="text-xs text-neutral-500 mt-1">
            {paidStations.length} abonnement{paidStations.length > 1 ? 's' : ''} validé{paidStations.length > 1 ? 's' : ''}
            {modMrr > 0 ? ` · +${modMrr.toLocaleString('fr-FR')} FCFA modules` : ''}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-emerald-500/10 w-fit mb-4"><CheckCircle2 className="w-6 h-6 text-emerald-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Abonnements validés</p>
          <h3 className="text-3xl font-bold text-white">{paidStations.length}</h3>
          <p className="text-xs text-neutral-500 mt-1">{trialCount} en essai gratuit</p>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-red-500/10 w-fit mb-4"><AlertTriangle className="w-6 h-6 text-red-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Stations en impayé</p>
          <h3 className="text-3xl font-bold text-white">{overdueCount}</h3>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-orange-500/10 w-fit mb-4"><Clock className="w-6 h-6 text-orange-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Montant impayé en attente</p>
          <h3 className="text-3xl font-bold text-white">{overdueAmount.toLocaleString('fr-FR')} FCFA</h3>
        </div>
      </div>

      {pendingRenewals.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden border border-blue-500/20 bg-blue-500/[0.03] mb-10">
          <div className="px-6 py-4 border-b border-blue-500/20 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Demandes de renouvellement en attente</h2>
          </div>
          <div className="divide-y divide-white/5">
            {pendingRenewals.map((p) => (
              <div key={p.id} className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-white">{p.stationName || 'Sans nom'}</p>
                  <p className="text-sm text-neutral-400">
                    {p.plan} — {(p.amount || 0).toLocaleString('fr-FR')} FCFA via {p.method || '—'}
                    {p.reference ? ` (${p.reference})` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmRenewalPayment(p.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors text-xs font-bold"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Confirmer
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`Rejeter la demande de renouvellement de ${p.stationName} ?`)) rejectRenewalPayment(p.id); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-xs font-bold"
                  >
                    <XCircle className="w-4 h-4" /> Rejeter
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lavagePayoutsByStation.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden border border-orange-500/20 bg-orange-500/[0.03] mb-10">
          <div className="px-6 py-4 border-b border-orange-500/20 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-bold text-white">Reversements lavage en attente</h2>
          </div>
          <p className="px-6 pt-4 text-sm text-neutral-400">
            Ces stations ont des lavages payés en ligne dont la part ne leur a pas encore été reversée
            automatiquement (pas de compte PayDunya renseigné, ou redistribution PER indisponible).
            Réglez-les hors application (Wave / Orange Money / virement), puis marquez le lot comme reversé.
          </p>
          <div className="divide-y divide-white/5 mt-2">
            {lavagePayoutsByStation.map((g) => (
              <div key={g.stationId} className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-white">{g.stationName || 'Sans nom'}</p>
                  <p className="text-sm text-neutral-400">{g.ids.length} paiement(s) — {g.total.toLocaleString('fr-FR')} FCFA dus</p>
                </div>
                <button
                  onClick={() => { if (window.confirm(`Confirmer avoir reversé ${g.total.toLocaleString('fr-FR')} FCFA à ${g.stationName} hors application ?`)) handleSettleLavage(g); }}
                  disabled={settling[g.stationId]}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 rounded-lg transition-colors text-xs font-bold"
                >
                  <CheckCircle2 className="w-4 h-4" /> Marquer comme reversé
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stations.length > 0 && (
        <div className="relative w-full md:w-1/3 mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <input
            type="text"
            placeholder="Rechercher une station ou une ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
      )}

      {filteredStations.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <CreditCard className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">{stations.length === 0 ? 'Aucune station à facturer' : 'Aucune station trouvée'}</h3>
          <p className="text-neutral-400">{stations.length === 0 ? "Ajoutez des stations partenaires depuis l'onglet Stations." : 'Ajustez votre recherche.'}</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-5 font-semibold text-neutral-400">Station</th>
                <th className="p-5 font-semibold text-neutral-400">Plan</th>
                <th className="p-5 font-semibold text-neutral-400">Montant</th>
                <th className="p-5 font-semibold text-neutral-400">Statut</th>
                <th className="p-5 font-semibold text-neutral-400">Prochaine échéance</th>
                <th className="p-5 font-semibold text-neutral-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStations.map((s, index) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="p-5">
                    <p className="font-bold text-white">{s.name}</p>
                    <p className="text-xs text-neutral-500">{s.city}</p>
                  </td>
                  <td className="p-5">
                    <span className="bg-white/5 text-neutral-300 px-3 py-1 rounded-md text-sm border border-white/10">{PLANS[s.plan]?.label || s.plan}</span>
                  </td>
                  <td className="p-5 text-neutral-300">
                    {s.subscriptionStatus === 'illimite'
                      ? <span className="text-purple-400 font-medium">Gratuit</span>
                      : `${(PLANS[s.plan]?.price || 0).toLocaleString('fr-FR')} FCFA`}
                  </td>
                  <td className="p-5">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full border ${SUB_STATUS[s.subscriptionStatus]?.className}`}>
                      {SUB_STATUS[s.subscriptionStatus]?.label || s.subscriptionStatus}
                    </span>
                    {s.subscriptionStatus === 'essai' && s.trialEndsAt && (() => {
                      const remaining = trialDaysRemaining(s.trialEndsAt);
                      const percent = trialProgressPercent(s.trialEndsAt);
                      const urgency = trialUrgency(s.trialEndsAt);
                      const textClass = urgency === 'danger' ? 'text-red-400' : urgency === 'warning' ? 'text-orange-400' : 'text-neutral-500';
                      const barClass = urgency === 'danger' ? 'bg-red-400' : urgency === 'warning' ? 'bg-orange-400' : 'bg-emerald-400';
                      return (
                        <div className="mt-2 max-w-[140px]">
                          <p className={`text-xs mb-1 ${textClass}`}>
                            {remaining <= 0 ? 'Essai terminé' : `${remaining} j restants`}
                          </p>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-5 text-neutral-400 text-sm">
                    {s.nextBillingDate ? new Date(s.nextBillingDate).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="p-5">
                    <div className="flex justify-end gap-2">
                      {s.subscriptionStatus === 'illimite' ? (
                        <button
                          onClick={() => { if (window.confirm(`Retirer l'accès illimité de ${s.name} et revenir à un abonnement normal ?`)) revokeUnlimitedAccess(s.id); }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors text-xs font-bold"
                          title="Retirer l'accès illimité"
                        >
                          <InfinityIcon className="w-4 h-4" /> Retirer l'illimité
                        </button>
                      ) : (
                        <>
                          {s.subscriptionStatus !== 'a_jour' && (
                            <button
                              onClick={() => markSubscriptionPaid(s.id)}
                              className="p-2 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-neutral-400 rounded-lg transition-colors"
                              title="Marquer comme payé"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {s.subscriptionStatus !== 'en_retard' && (
                            <button
                              onClick={() => markSubscriptionOverdue(s.id)}
                              className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors"
                              title="Marquer comme impayé"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemind(s.id)}
                            className="p-2 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-neutral-400 rounded-lg transition-colors"
                            title="Envoyer une relance"
                          >
                            <Bell className="w-4 h-4" />
                          </button>
                          {reminded[s.id] && <span className="text-xs text-blue-400 self-center">Envoyée ✓</span>}
                          <button
                            onClick={() => { if (window.confirm(`Donner un accès illimité (gratuit) à ${s.name} ?`)) grantUnlimitedAccess(s.id); }}
                            className="p-2 bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 text-neutral-400 rounded-lg transition-colors"
                            title="Donner un accès illimité"
                          >
                            <InfinityIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={filteredStations.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
}
