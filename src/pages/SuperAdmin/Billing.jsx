import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, CheckCircle2, AlertTriangle, Bell, Clock, Infinity as InfinityIcon, XCircle, Smartphone, Search, Gift, X } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { trialDaysRemaining, trialProgressPercent, trialUrgency, trialLabel, FREE_ACCESS_OPTIONS, freeAccessPlan } from '../../lib/stationTrial';
import { stationDueDate } from '../../lib/subscriptionReminders';
import { validatedMRR, validatedStations, modulesMRR, stationPrice } from '../../lib/platformRevenue';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';

const SUB_STATUS = {
  a_jour: { label: 'À jour', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  en_retard: { label: 'Impayé', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  essai: { label: 'Essai gratuit', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  illimite: { label: 'Accès illimité', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  a_payer: { label: 'En attente de paiement', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

const frDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// Fenêtre « Offrir un accès gratuit » : durée au choix (FREE_ACCESS_OPTIONS),
// effet expliqué avant de valider (freeAccessPlan, lib/stationTrial.js).
function FreeAccessModal({ station, planLabel, onClose, onGrant }) {
  const [days, setDays] = useState(FREE_ACCESS_OPTIONS[0].days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = freeAccessPlan(station, days);
  const effect = plan.mode === 'echeance'
    ? `Abonnement déjà payé jusqu'au ${frDate(plan.from)} : la prochaine échéance passera au ${frDate(plan.until)}.`
    : plan.mode === 'prolongation'
      ? `Accès gratuit en cours jusqu'au ${frDate(plan.from)} : il sera prolongé jusqu'au ${frDate(plan.until)}.`
      : `La station aura accès à son espace gratuitement jusqu'au ${frDate(plan.until)}. Ensuite, elle devra payer son offre (${planLabel}) pour continuer.`;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onGrant(station.id, days);
      onClose();
    } catch (err) {
      setError(err?.message || "L'accès n'a pas pu être offert. Réessayez.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        role="dialog" aria-modal="true" aria-labelledby="free-access-title"
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} disabled={busy} aria-label="Fermer" className="modal-close">
          <X className="w-6 h-6" />
        </button>
        <div className="p-3 rounded-xl bg-purple-500/10 w-fit mb-4"><Gift className="w-6 h-6 text-purple-400" /></div>
        <h2 id="free-access-title" className="text-2xl font-bold text-white mb-1">Offrir un accès gratuit</h2>
        <p className="text-neutral-400 mb-6">{station.name}</p>

        <div className="grid grid-cols-3 gap-2 mb-5" role="radiogroup" aria-label="Durée offerte">
          {FREE_ACCESS_OPTIONS.map((o) => {
            const active = o.days === days;
            return (
              <button
                key={o.days}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDays(o.days)}
                className={`rounded-xl border px-3 py-3 text-center transition-colors ${active ? 'border-purple-500 bg-purple-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]'}`}
              >
                <span className="block font-bold">{o.label}</span>
                <span className="block text-xs text-neutral-400 mt-0.5">{o.days} jours</span>
              </button>
            );
          })}
        </div>

        <p className="text-sm text-neutral-300 leading-relaxed rounded-xl bg-white/[0.03] border border-white/5 p-4 mb-5">{effect}</p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 rounded-xl transition-colors">Annuler</button>
          <button type="button" onClick={submit} disabled={busy} className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            <Gift className="w-4 h-4" /> {busy ? 'Enregistrement…' : 'Offrir'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function Billing() {
  useDocumentTitle('Facturation');
  const {
    stations, PLANS, markSubscriptionPaid, markSubscriptionOverdue, sendBillingReminder, grantUnlimitedAccess, revokeUnlimitedAccess, grantFreeAccess,
    stationRenewalPayments, confirmRenewalPayment, rejectRenewalPayment,
  } = useSuperAdminState();
  const [reminded, setReminded] = useState({});
  const [freeAccessFor, setFreeAccessFor] = useState(null); // station à qui offrir un accès gratuit
  const pendingRenewals = stationRenewalPayments.filter((p) => p.status === 'PENDING');

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
    .reduce((sum, s) => sum + stationPrice(PLANS, s), 0);

  const handleRemind = (id) => {
    sendBillingReminder(id);
    setReminded(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setReminded(prev => ({ ...prev, [id]: false })), 3000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Facturation & <span className="text-purple-400">Abonnements</span></h1>
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
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto">
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
                      : `${stationPrice(PLANS, s).toLocaleString('fr-FR')} FCFA`}
                  </td>
                  <td className="p-5">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full border ${SUB_STATUS[s.subscriptionStatus]?.className}`}>
                      {s.subscriptionStatus === 'essai' ? trialLabel(!!s.trialStartedAt) : (SUB_STATUS[s.subscriptionStatus]?.label || s.subscriptionStatus)}
                    </span>
                    {s.subscriptionStatus === 'essai' && s.trialEndsAt && (() => {
                      const remaining = trialDaysRemaining(s.trialEndsAt);
                      const percent = trialProgressPercent(s.trialEndsAt, s.trialStartedAt || s.joinedAt);
                      const urgency = trialUrgency(s.trialEndsAt, s.trialStartedAt || s.joinedAt);
                      const textClass = urgency === 'danger' ? 'text-red-400' : urgency === 'warning' ? 'text-orange-400' : 'text-neutral-500';
                      const barClass = urgency === 'danger' ? 'bg-red-400' : urgency === 'warning' ? 'bg-orange-400' : 'bg-emerald-400';
                      return (
                        <div className="mt-2 max-w-[140px]">
                          <p className={`text-xs mb-1 ${textClass}`}>
                            {remaining <= 0 ? (s.trialStartedAt ? 'Accès gratuit terminé' : 'Essai terminé') : `${remaining} j restants`}
                          </p>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-5 text-neutral-400 text-sm">
                    {stationDueDate(s) ? new Date(stationDueDate(s)).toLocaleDateString('fr-FR') : '—'}
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
                            onClick={() => setFreeAccessFor(s)}
                            className="p-2 bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 text-neutral-400 rounded-lg transition-colors"
                            title="Offrir un accès gratuit (1 semaine, 10 jours, 1 mois)"
                            aria-label={`Offrir un accès gratuit à ${s.name}`}
                          >
                            <Gift className="w-4 h-4" />
                          </button>
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
      <AnimatePresence>
        {freeAccessFor && (
          <FreeAccessModal
            station={freeAccessFor}
            planLabel={PLANS[freeAccessFor.plan]?.label || freeAccessFor.plan}
            onClose={() => setFreeAccessFor(null)}
            onGrant={grantFreeAccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
