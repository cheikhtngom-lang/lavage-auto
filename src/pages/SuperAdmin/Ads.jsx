import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Clock, TrendingUp, Wallet, CheckCircle2, XCircle, Search } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { deriveAdStatus } from '../../lib/ads';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';

const STATUS_BADGE = {
  ACTIVE: { label: 'En diffusion', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  PENDING: { label: 'En attente', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  EXPIRED: { label: 'Terminée', className: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20' },
  REJECTED: { label: 'Rejetée', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  CANCELLED: { label: 'Annulée', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';

export default function SuperAdminAds() {
  useDocumentTitle('Publicités');
  const { stationAds, confirmAdPayment, rejectAdPayment } = useSuperAdminState();

  const activeCount = stationAds.filter((a) => deriveAdStatus(a) === 'ACTIVE').length;
  const pendingCount = stationAds.filter((a) => a.status === 'PENDING').length;

  const confirmedAds = stationAds.filter((a) => a.confirmedAt);
  const totalRevenue = confirmedAds.reduce((sum, a) => sum + (a.amount || 0), 0);
  const now = new Date();
  const monthRevenue = confirmedAds
    .filter((a) => { const d = new Date(a.confirmedAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
    .reduce((sum, a) => sum + (a.amount || 0), 0);

  const [search, setSearch] = useState('');
  const filteredAds = stationAds.filter((a) =>
    (a.stationName || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.message || '').toLowerCase().includes(search.toLowerCase())
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filteredAds.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedAds = filteredAds.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const kpis = [
    { title: 'Pubs en diffusion', value: activeCount, icon: Megaphone, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { title: 'Paiements en attente', value: pendingCount, icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { title: 'Revenus du mois', value: `${monthRevenue.toLocaleString('fr-FR')} FCFA`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { title: 'Revenus publicité cumulés', value: `${totalRevenue.toLocaleString('fr-FR')} FCFA`, icon: Wallet, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Publicités <span className="text-amber-400">des stations</span></h1>
        <p className="text-neutral-400 text-lg">Campagnes payantes diffusées sur le tableau de bord de tous les automobilistes — revenus plateforme distincts des abonnements stations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
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

      {stationAds.length > 0 && (
        <div className="relative w-full md:w-1/3 mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <input
            type="text"
            placeholder="Rechercher une station ou un message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
      )}

      {filteredAds.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Megaphone className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">{stationAds.length === 0 ? 'Aucune publicité pour le moment' : 'Aucun résultat'}</h3>
          <p className="text-neutral-400">{stationAds.length === 0 ? "Les demandes des stations (Paramètres > Passer une pub) apparaîtront ici." : 'Ajustez votre recherche.'}</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 text-sm bg-black/20">
                <th className="p-5 font-medium">Station</th>
                <th className="p-5 font-medium">Message</th>
                <th className="p-5 font-medium">Statut</th>
                <th className="p-5 font-medium">Diffusion</th>
                <th className="p-5 font-medium">Montant</th>
                <th className="p-5 font-medium">Méthode</th>
                <th className="p-5 font-medium">Référence</th>
                <th className="p-5 font-medium">Date paiement</th>
                <th className="p-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAds.map((a, index) => {
                const status = deriveAdStatus(a);
                const badge = STATUS_BADGE[status] || STATUS_BADGE.PENDING;
                return (
                  <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-5 font-bold text-white whitespace-nowrap">{a.stationName || 'Sans nom'}</td>
                    <td className="p-5 text-neutral-300 max-w-xs truncate" title={a.message}>{a.message}</td>
                    <td className="p-5"><span className={`text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap ${badge.className}`}>{badge.label}</span></td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">
                      {a.startsAt ? `${formatDate(a.startsAt)} → ${formatDate(a.expiresAt)}` : '—'}
                    </td>
                    <td className="p-5 text-neutral-300 whitespace-nowrap">{(a.amount || 0).toLocaleString('fr-FR')} FCFA</td>
                    <td className="p-5 text-neutral-300 whitespace-nowrap">{a.method || '—'}</td>
                    <td className="p-5 text-neutral-400 text-sm">{a.reference || '—'}</td>
                    <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">{formatDate(a.createdAt)}</td>
                    <td className="p-5">
                      {a.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => confirmAdPayment(a.id)}
                            className="p-2 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-neutral-400 rounded-lg transition-colors" title="Confirmer le paiement">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => rejectAdPayment(a.id)}
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
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={filteredAds.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
}
