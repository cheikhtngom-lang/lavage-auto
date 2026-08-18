import React from 'react';
import { motion } from 'framer-motion';
import { Crown, Users, Clock, TrendingUp, Wallet, CheckCircle2, XCircle } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';

const STATUS_BADGE = {
  ACTIVE: { label: 'Actif', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  PENDING: { label: 'En attente', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  EXPIRED: { label: 'Expiré', className: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20' },
  FAILED: { label: 'Rejeté', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  CANCELLED: { label: 'Annulé', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

// Statut affiché : une ligne ACTIVE en base dont expires_at est dépassée
// s'affiche EXPIRED sans écriture (pas de cron sur ce projet) — même logique
// que deriveSuperUserStatus dans src/lib/superUser.js, adaptée aux champs
// camelCase déjà mappés par useSuperAdminState.
function displayStatus(sub) {
  if (sub.status === 'ACTIVE') {
    return sub.expiresAt && new Date(sub.expiresAt) > new Date() ? 'ACTIVE' : 'EXPIRED';
  }
  return sub.status;
}

const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';

export default function SuperUsers() {
  const { superUserSubscriptions, clientAccounts, confirmSuperUserPayment, rejectSuperUserPayment } = useSuperAdminState();

  const vehicleCount = (clientId) => clientAccounts.find((c) => c.id === clientId)?.vehicles?.length || 0;

  // Un client peut avoir plusieurs lignes (renouvellements successifs) — les
  // stats "actifs/expirés" comptent des CLIENTS distincts (leur ligne la plus
  // récente), pas des lignes brutes. "En attente" et les revenus, eux, portent
  // sur les lignes elles-mêmes (chaque paiement compte une fois).
  const latestByClient = {};
  superUserSubscriptions.forEach((s) => {
    const current = latestByClient[s.clientId];
    if (!current || new Date(s.createdAt) > new Date(current.createdAt)) latestByClient[s.clientId] = s;
  });
  const latestSubs = Object.values(latestByClient);

  const activeCount = latestSubs.filter((s) => displayStatus(s) === 'ACTIVE').length;
  const expiredCount = latestSubs.filter((s) => displayStatus(s) === 'EXPIRED').length;
  const pendingCount = superUserSubscriptions.filter((s) => s.status === 'PENDING').length;

  const confirmedSubs = superUserSubscriptions.filter((s) => s.confirmedAt);
  const totalRevenue = confirmedSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
  const now = new Date();
  const monthRevenue = confirmedSubs
    .filter((s) => { const d = new Date(s.confirmedAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  const kpis = [
    { title: 'Super Users actifs', value: activeCount, icon: Crown, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { title: 'Abonnements expirés', value: expiredCount, icon: Clock, color: 'text-neutral-400', bg: 'bg-neutral-500/10' },
    { title: 'Paiements en attente', value: pendingCount, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { title: 'Revenus du mois', value: `${monthRevenue.toLocaleString('fr-FR')} FCFA`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { title: 'Revenus Super User cumulés', value: `${totalRevenue.toLocaleString('fr-FR')} FCFA`, icon: Wallet, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Abonnements <span className="text-amber-400">Super User</span></h1>
        <p className="text-neutral-400 text-lg">Revenus plateforme (5 000 FCFA/mois) — distincts des revenus des stations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-10">
        {kpis.map((stat, index) => (
          <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
            className="glass-card rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
            <div className={`absolute top-0 right-0 w-32 h-32 ${stat.bg} blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
            <div className={`p-3 rounded-xl ${stat.bg} w-fit mb-6`}><stat.icon className={`w-6 h-6 ${stat.color}`} /></div>
            <p className="text-neutral-400 text-sm font-medium mb-1">{stat.title}</p>
            <h3 className="text-2xl font-bold text-white">{stat.value}</h3>
          </motion.div>
        ))}
      </div>

      {superUserSubscriptions.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Crown className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Aucun abonnement Super User pour le moment</h3>
          <p className="text-neutral-400">Les demandes de paiement des automobilistes apparaîtront ici.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 text-sm bg-black/20">
                <th className="p-5 font-medium">Automobiliste</th>
                <th className="p-5 font-medium">Contact</th>
                <th className="p-5 font-medium">Véhicules</th>
                <th className="p-5 font-medium">Statut</th>
                <th className="p-5 font-medium">Début</th>
                <th className="p-5 font-medium">Expiration</th>
                <th className="p-5 font-medium">Montant</th>
                <th className="p-5 font-medium">Méthode</th>
                <th className="p-5 font-medium">Référence</th>
                <th className="p-5 font-medium">Date paiement</th>
                <th className="p-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {superUserSubscriptions.map((s, index) => {
                const status = displayStatus(s);
                const badge = STATUS_BADGE[status] || STATUS_BADGE.PENDING;
                return (
                  <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-5 font-bold text-white whitespace-nowrap">{s.clientName || 'Sans nom'}</td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{s.clientEmail || s.clientPhone || '—'}</td>
                    <td className="p-5 text-neutral-300">{vehicleCount(s.clientId)}</td>
                    <td className="p-5"><span className={`text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap ${badge.className}`}>{badge.label}</span></td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{formatDate(s.startedAt)}</td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{formatDate(s.expiresAt)}</td>
                    <td className="p-5 text-neutral-300 whitespace-nowrap">{(s.amount || 0).toLocaleString('fr-FR')} FCFA</td>
                    <td className="p-5 text-neutral-300 whitespace-nowrap">{s.method || '—'}</td>
                    <td className="p-5 text-neutral-400 text-sm">{s.reference || '—'}</td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{formatDate(s.createdAt)}</td>
                    <td className="p-5">
                      {s.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => confirmSuperUserPayment(s.id)}
                            className="p-2 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-neutral-400 rounded-lg transition-colors" title="Confirmer le paiement">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => rejectSuperUserPayment(s.id)}
                            className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors" title="Rejeter le paiement">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
