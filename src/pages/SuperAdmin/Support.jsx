import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, LifeBuoy, CheckCircle2, RotateCcw, ScrollText } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

const DISPUTE_STATUS = {
  ouvert: { label: 'Ouvert', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  resolu: { label: 'Résolu', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  rembourse: { label: 'Remboursé', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

const emptyForm = { stationName: '', subject: '', amount: '' };

export default function Support() {
  useDocumentTitle('Support');
  const { stations, disputes, addDispute, resolveDispute, refundDispute, auditLog } = useSuperAdminState();

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState('litiges');

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.stationName.trim()) return;
    const station = stations.find(s => s.name === form.stationName);
    addDispute({
      stationId: station?.id || null,
      stationName: form.stationName,
      subject: form.subject,
      amount: Number(form.amount) || 0,
    });
    setForm(emptyForm);
    setShowAddModal(false);
  };

  const openDisputes = disputes.filter(d => d.status === 'ouvert');

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Support & <span className="text-purple-400">Sécurité</span></h1>
          <p className="text-neutral-400 text-lg">Litiges, remboursements et journal des actions administrateur.</p>
        </div>
        {tab === 'litiges' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> Ouvrir un litige
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setTab('litiges')}
          className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-2 ${tab === 'litiges' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`}
        >
          <LifeBuoy className="w-4 h-4" /> Litiges {openDisputes.length > 0 && `(${openDisputes.length})`}
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-2 ${tab === 'audit' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`}
        >
          <ScrollText className="w-4 h-4" /> Journal d'audit
        </button>
      </div>

      {tab === 'litiges' && (
        disputes.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
            <LifeBuoy className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Aucun litige</h3>
            <p className="text-neutral-400">Tout va bien — rien à traiter pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {disputes.map((d, index) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-white">{d.subject}</h3>
                    <span className={`text-xs font-medium px-3 py-1 rounded-full border ${DISPUTE_STATUS[d.status].className}`}>
                      {DISPUTE_STATUS[d.status].label}
                    </span>
                  </div>
                  <p className="text-neutral-400 text-sm">{d.stationName} · {d.amount ? `${Number(d.amount).toLocaleString('fr-FR')} FCFA` : 'Montant non précisé'} · ouvert le {new Date(d.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
                {d.status === 'ouvert' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => resolveDispute(d.id)}
                      className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold px-4 py-2 rounded-xl transition-colors text-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Résoudre
                    </button>
                    <button
                      onClick={() => refundDispute(d.id)}
                      className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-bold px-4 py-2 rounded-xl transition-colors text-sm"
                    >
                      <RotateCcw className="w-4 h-4" /> Rembourser
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )
      )}

      {tab === 'audit' && (
        auditLog.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
            <ScrollText className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Aucune action enregistrée</h3>
            <p className="text-neutral-400">Toutes les actions du Super Admin apparaîtront ici.</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] divide-y divide-white/5">
            {auditLog.map(entry => (
              <div key={entry.id} className="p-4 flex items-center justify-between gap-4">
                <p className="text-neutral-300 text-sm">{entry.action}</p>
                <span className="text-xs text-neutral-500 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString('fr-FR')}</span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Modal Ouvrir Litige */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold text-white mb-6">Ouvrir un litige</h2>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Station concernée</label>
                  <input
                    type="text" required list="stations-list" placeholder="Nom de la station" value={form.stationName}
                    onChange={(e) => setForm({ ...form, stationName: e.target.value })}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  />
                  <datalist id="stations-list">
                    {stations.map(s => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Sujet du litige</label>
                  <input type="text" required placeholder="Ex: Client facturé deux fois" value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Montant concerné (FCFA)</label>
                  <input type="number" min="0" placeholder="0" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                </div>
                <div className="pt-4 mt-2 border-t border-white/10">
                  <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center">
                    <Plus className="w-5 h-5 mr-2" /> Créer le litige
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
