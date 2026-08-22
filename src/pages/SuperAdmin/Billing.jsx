import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle2, AlertTriangle, Bell, Clock, Infinity as InfinityIcon } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { trialDaysRemaining, trialProgressPercent } from '../../lib/stationTrial';

const SUB_STATUS = {
  a_jour: { label: 'À jour', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  en_retard: { label: 'Impayé', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  essai: { label: 'Essai gratuit', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  illimite: { label: 'Accès illimité', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

export default function Billing() {
  const { stations, PLANS, markSubscriptionPaid, markSubscriptionOverdue, sendBillingReminder, grantUnlimitedAccess, revokeUnlimitedAccess } = useSuperAdminState();
  const [reminded, setReminded] = useState({});

  // Les stations en accès illimité ne paient rien — exclues du revenu récurrent,
  // sinon le MRR affiché prétendrait facturer des stations gratuites à vie.
  const mrr = stations
    .filter(s => s.status === 'active' && s.subscriptionStatus !== 'illimite')
    .reduce((sum, s) => sum + (PLANS[s.plan]?.price || 0), 0);
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-purple-500/10 w-fit mb-4"><CreditCard className="w-6 h-6 text-purple-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Revenu Récurrent Mensuel</p>
          <h3 className="text-3xl font-bold text-white">{mrr.toLocaleString('fr-FR')} FCFA</h3>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-red-500/10 w-fit mb-4"><AlertTriangle className="w-6 h-6 text-red-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Stations en impayé</p>
          <h3 className="text-3xl font-bold text-white">{overdueCount}</h3>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-orange-500/10 w-fit mb-4"><Clock className="w-6 h-6 text-orange-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Montant en attente</p>
          <h3 className="text-3xl font-bold text-white">{overdueAmount.toLocaleString('fr-FR')} FCFA</h3>
        </div>
      </div>

      {stations.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <CreditCard className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Aucune station à facturer</h3>
          <p className="text-neutral-400">Ajoutez des stations partenaires depuis l'onglet Stations.</p>
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
              {stations.map((s, index) => (
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
                      const urgent = remaining <= 7;
                      return (
                        <div className="mt-2 max-w-[140px]">
                          <p className={`text-xs mb-1 ${urgent ? 'text-orange-400' : 'text-neutral-500'}`}>
                            {remaining <= 0 ? 'Essai terminé' : `${remaining} j restants`}
                          </p>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className={`h-full rounded-full ${urgent ? 'bg-orange-400' : 'bg-blue-400'}`} style={{ width: `${percent}%` }} />
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
        </div>
      )}
    </div>
  );
}
