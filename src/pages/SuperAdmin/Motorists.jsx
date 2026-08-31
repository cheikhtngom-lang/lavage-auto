import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Users, UserPlus, Car, Heart, X, Mail, Phone, Calendar, MapPin } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

export default function Motorists() {
  useDocumentTitle('Automobilistes');
  const { clientAccounts, stations } = useSuperAdminState();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const now = new Date();
  const days = (n) => n * 24 * 3600 * 1000;
  const newLast7 = clientAccounts.filter(c => now - new Date(c.createdAt) <= days(7)).length;
  const newLast30 = clientAccounts.filter(c => now - new Date(c.createdAt) <= days(30)).length;
  const totalVehicles = clientAccounts.reduce((sum, c) => sum + (c.vehicles?.length || 0), 0);
  const avgVehicles = clientAccounts.length > 0 ? (totalVehicles / clientAccounts.length).toFixed(1) : '0.0';

  const filtered = clientAccounts.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const stationName = (id) => stations.find(s => s.id === id)?.name || `Station #${id}`;

  const kpis = [
    { title: 'Automobilistes inscrits', value: clientAccounts.length, icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { title: 'Nouveaux (7 derniers jours)', value: newLast7, icon: UserPlus, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { title: 'Nouveaux (30 derniers jours)', value: newLast30, icon: UserPlus, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { title: 'Véhicules / automobiliste (moy.)', value: avgVehicles, icon: Car, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Automobilistes <span className="text-purple-400">Inscrits</span></h1>
          <p className="text-neutral-400 text-lg">Registre des comptes automobilistes de toute la plateforme.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {kpis.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="glass-card rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-colors"
          >
            <div className={`absolute top-0 right-0 w-32 h-32 ${stat.bg} blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
            <div className={`p-3 rounded-xl ${stat.bg} w-fit mb-6`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">{stat.title}</p>
            <h3 className="text-3xl font-bold text-white">{stat.value}</h3>
          </motion.div>
        ))}
      </div>

      <div className="relative w-full md:w-1/3 mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
        <input
          type="text"
          placeholder="Rechercher un automobiliste (nom, email, téléphone)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Users className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Aucun automobiliste trouvé</h3>
          <p className="text-neutral-400">{clientAccounts.length === 0 ? 'Aucun compte automobiliste n\'a encore été créé.' : 'Ajustez votre recherche.'}</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border-white/5">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 text-sm bg-black/20">
                <th className="p-5 font-medium">Automobiliste</th>
                <th className="p-5 font-medium">Contact</th>
                <th className="p-5 font-medium">Véhicules</th>
                <th className="p-5 font-medium">Favoris</th>
                <th className="p-5 font-medium">Inscrit le</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, index) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => setSelected(c)}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <td className="p-5 font-bold text-white">{c.name || 'Sans nom'}</td>
                  <td className="p-5 text-neutral-400 text-sm">{c.email || c.phone || '—'}</td>
                  <td className="p-5 text-neutral-300">{c.vehicles?.length || 0}</td>
                  <td className="p-5 text-neutral-300">{c.favoriteStationIds?.length || 0}</td>
                  <td className="p-5 text-neutral-400 text-sm">{c.createdAt ? new Date(c.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Détail automobiliste */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button onClick={() => setSelected(null)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-2xl font-bold text-white mb-1 pr-8">{selected.name || 'Sans nom'}</h2>
              <p className="text-neutral-500 flex items-center gap-1 mb-6"><Calendar className="w-3.5 h-3.5" /> Inscrit le {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('fr-FR') : '—'}</p>

              <div className="space-y-2 mb-6 text-sm">
                {selected.email && <p className="flex items-center gap-2 text-neutral-300"><Mail className="w-4 h-4 text-neutral-500" /> {selected.email}</p>}
                {selected.phone && <p className="flex items-center gap-2 text-neutral-300"><Phone className="w-4 h-4 text-neutral-500" /> {selected.phone}</p>}
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-2"><Car className="w-4 h-4" /> Véhicules ({selected.vehicles?.length || 0})</h3>
                {(selected.vehicles?.length || 0) === 0 ? (
                  <p className="text-neutral-500 text-sm">Aucun véhicule enregistré.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.vehicles.map(v => (
                      <div key={v.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-neutral-200">
                        {v.brand || v.marque || 'Véhicule'} {v.model || v.modele || ''} {v.plate ? `· ${v.plate}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-2"><Heart className="w-4 h-4" /> Stations favorites ({selected.favoriteStationIds?.length || 0})</h3>
                {(selected.favoriteStationIds?.length || 0) === 0 ? (
                  <p className="text-neutral-500 text-sm">Aucune station favorite.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.favoriteStationIds.map(id => (
                      <div key={id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-neutral-200">
                        <MapPin className="w-3.5 h-3.5 text-purple-400" /> {stationName(id)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
