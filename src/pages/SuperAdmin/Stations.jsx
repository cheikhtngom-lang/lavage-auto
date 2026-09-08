import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, X, MapPin, Phone, Mail, CheckCircle2, Ban, RotateCcw,
  Trash2, Building2, Eye, CircleCheck, Hourglass, Infinity as InfinityIcon
} from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { trialDaysRemaining, trialProgressPercent, trialUrgency } from '../../lib/stationTrial';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';

const STATUS_LABELS = {
  active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  en_attente: { label: 'En attente', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  suspendue: { label: 'Suspendue', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

// Ligne "Plan & Abonnement" compacte dans le tableau — même info que
// TrialMiniBar/SUB_STATUS (Billing.jsx) mais condensée pour tenir sur une
// seule ligne de tableau (voir admin-agences.html de GestionImmo, colonne
// "Abonnement" : badge plan + puce statut).
function SubscriptionInline({ station }) {
  if (station.subscriptionStatus === 'illimite') {
    return <span className="flex items-center gap-1 text-purple-400"><InfinityIcon className="w-3.5 h-3.5" /> Illimité</span>;
  }
  if (station.subscriptionStatus === 'a_jour') {
    return <span className="flex items-center gap-1 text-emerald-400"><CircleCheck className="w-3.5 h-3.5" /> À jour</span>;
  }
  if (station.subscriptionStatus === 'en_retard') {
    return <span className="flex items-center gap-1 text-red-400"><Hourglass className="w-3.5 h-3.5" /> Impayé</span>;
  }
  const remaining = trialDaysRemaining(station.trialEndsAt);
  const urgent = remaining !== null && remaining <= 5;
  return (
    <span className={`flex items-center gap-1 ${urgent ? 'text-orange-400' : 'text-neutral-400'}`}>
      <Hourglass className="w-3.5 h-3.5" /> {remaining === null ? 'Essai' : remaining <= 0 ? 'Essai terminé' : `Essai — ${remaining}j`}
    </span>
  );
}

const emptyForm = { name: '', ownerName: '', ownerEmail: '', ownerPhone: '', address: '', city: '', clientsCount: 0 };

// Même barre d'essai que Billing.jsx (voir lib/stationTrial.js pour le calcul
// partagé) — affichée ici aussi pour repérer une station en essai directement
// depuis la fiche/le registre, sans avoir à aller sur Facturation.
function TrialMiniBar({ station }) {
  if (station.subscriptionStatus !== 'essai' || !station.trialEndsAt) return null;
  const remaining = trialDaysRemaining(station.trialEndsAt);
  const percent = trialProgressPercent(station.trialEndsAt);
  const urgency = trialUrgency(station.trialEndsAt);
  const textClass = urgency === 'danger' ? 'text-red-400' : urgency === 'warning' ? 'text-orange-400' : 'text-emerald-400';
  const barClass = urgency === 'danger' ? 'bg-red-400' : urgency === 'warning' ? 'bg-orange-400' : 'bg-emerald-400';
  return (
    <div className="mt-1">
      <p className={`text-xs mb-1 ${textClass}`}>
        {remaining <= 0 ? 'Essai terminé' : `Essai — ${remaining} j restants`}
      </p>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function Stations() {
  useDocumentTitle('Stations');
  const { stations, addStation, setStationStatus, deleteStation, setStationPlan, updateStation, PLANS } = useSuperAdminState();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('tous');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState(null);

  const filtered = stations.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || (s.city || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'tous' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    addStation({ ...form, clientsCount: Number(form.clientsCount) || 0 });
    setForm(emptyForm);
    setShowAddModal(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Stations <span className="text-purple-400">Partenaires</span></h1>
          <p className="text-neutral-400 text-lg">Validez, suspendez et gérez le réseau de stations.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Ajouter une station
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="relative w-full md:w-1/3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <input
            type="text"
            placeholder="Rechercher une station ou une ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[['tous', 'Toutes'], ['en_attente', 'En attente'], ['active', 'Actives'], ['suspendue', 'Suspendues']].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${statusFilter === value ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Building2 className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Aucune station trouvée</h3>
          <p className="text-neutral-400">Ajustez vos filtres ou ajoutez une nouvelle station partenaire.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 text-sm bg-black/20">
                <th className="p-5 font-medium">Station</th>
                <th className="p-5 font-medium">Propriétaire</th>
                <th className="p-5 font-medium">Plan &amp; Abonnement</th>
                <th className="p-5 font-medium">Statut</th>
                <th className="p-5 font-medium">Inscription</th>
                <th className="p-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((station, index) => (
                <motion.tr
                  key={station.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => setSelected(station)}
                >
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-purple-600 to-fuchsia-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                        {station.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-white whitespace-nowrap">{station.name}</p>
                        <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {station.city || station.address || 'Ville non renseignée'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-5 text-sm">
                    <p className="text-neutral-300">{station.ownerName || '—'}</p>
                    <p className="text-neutral-500 text-xs">{station.ownerPhone || station.ownerEmail || ''}</p>
                  </td>
                  <td className="p-5 text-sm">
                    <span className="bg-white/5 px-2.5 py-1 rounded-md border border-white/10 text-neutral-300 text-xs whitespace-nowrap">{PLANS[station.plan]?.label || station.plan}</span>
                    <div className="mt-1.5 text-xs"><SubscriptionInline station={station} /></div>
                  </td>
                  <td className="p-5">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap ${STATUS_LABELS[station.status].className}`}>
                      {STATUS_LABELS[station.status].label}
                    </span>
                  </td>
                  <td className="p-5 text-neutral-400 text-sm whitespace-nowrap">
                    {station.joinedAt ? new Date(station.joinedAt).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="p-5">
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelected(station)}
                        className="p-2 bg-white/5 hover:bg-purple-500/20 hover:text-purple-400 text-neutral-400 rounded-lg transition-colors" title="Voir détails"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {station.status === 'active' ? (
                        <button
                          onClick={() => setStationStatus(station.id, 'suspendue')}
                          className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors" title="Suspendre"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setStationStatus(station.id, 'active')}
                          className="p-2 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-neutral-400 rounded-lg transition-colors" title={station.status === 'en_attente' ? 'Valider / Activer' : 'Réactiver'}
                        >
                          {station.status === 'en_attente' ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
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
            totalItems={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      )}

      {/* Modal Ajout Station */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold text-white mb-6">Ajouter une station partenaire</h2>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Nom de la station</label>
                  <input type="text" required placeholder="Ex: Sen Lavage Plus" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Ville</label>
                    <input type="text" placeholder="Dakar" value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Adresse</label>
                    <input type="text" placeholder="Mermoz" value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Nom du propriétaire</label>
                  <input type="text" placeholder="Ex: Ibrahima Ndiaye" value={form.ownerName}
                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Téléphone</label>
                    <input type="text" placeholder="+221 77 000 00 00" value={form.ownerPhone}
                      onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Email</label>
                    <input type="email" placeholder="contact@station.sn" value={form.ownerEmail}
                      onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Clients déclarés (estimation)</label>
                  <input type="number" min="0" value={form.clientsCount}
                    onChange={(e) => setForm({ ...form, clientsCount: e.target.value })}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                </div>
                <div className="pt-4 mt-2 border-t border-white/10">
                  <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center">
                    <Plus className="w-5 h-5 mr-2" /> Enregistrer la station
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Détail Station */}
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

              <div className="flex items-start justify-between mb-6 pr-8">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selected.name}</h2>
                  <p className="text-neutral-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" /> {selected.city}{selected.address ? `, ${selected.address}` : ''}</p>
                </div>
                <span className={`text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap ${STATUS_LABELS[selected.status].className}`}>
                  {STATUS_LABELS[selected.status].label}
                </span>
              </div>

              <div className="space-y-2 mb-6 text-sm">
                <p className="flex items-center gap-2 text-neutral-300"><Building2 className="w-4 h-4 text-neutral-500" /> {selected.ownerName || 'Propriétaire non renseigné'}</p>
                {selected.ownerPhone && <p className="flex items-center gap-2 text-neutral-300"><Phone className="w-4 h-4 text-neutral-500" /> {selected.ownerPhone}</p>}
                {selected.ownerEmail && <p className="flex items-center gap-2 text-neutral-300"><Mail className="w-4 h-4 text-neutral-500" /> {selected.ownerEmail}</p>}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">Plan d'abonnement</label>
                <select
                  value={selected.plan}
                  onChange={(e) => { setStationPlan(selected.id, e.target.value); setSelected({ ...selected, plan: e.target.value }); }}
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                >
                  {Object.entries(PLANS).sort(([, a], [, b]) => a.price - b.price).map(([key, p]) => (
                    <option key={key} value={key}>{p.label} — {p.price.toLocaleString('fr-FR')} FCFA/mois</option>
                  ))}
                </select>
                <TrialMiniBar station={selected} />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {selected.status !== 'active' && (
                  <button
                    onClick={() => { setStationStatus(selected.id, 'active'); setSelected({ ...selected, status: 'active' }); }}
                    className="flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold py-3 rounded-xl transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Valider / Activer
                  </button>
                )}
                {selected.status === 'active' && (
                  <button
                    onClick={() => { setStationStatus(selected.id, 'suspendue'); setSelected({ ...selected, status: 'suspendue' }); }}
                    className="flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold py-3 rounded-xl transition-colors"
                  >
                    <Ban className="w-4 h-4" /> Suspendre
                  </button>
                )}
                {selected.status === 'suspendue' && (
                  <button
                    onClick={() => { setStationStatus(selected.id, 'active'); setSelected({ ...selected, status: 'active' }); }}
                    className="flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-bold py-3 rounded-xl transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" /> Réactiver
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  if (window.confirm(`Supprimer définitivement "${selected.name}" du registre ?`)) {
                    deleteStation(selected.id);
                    setSelected(null);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-red-400 text-sm font-medium py-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Supprimer du registre
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
