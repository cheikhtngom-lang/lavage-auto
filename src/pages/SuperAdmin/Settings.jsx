import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Save, RotateCcw, ScrollText, Crown } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';

const PLAN_ACCENTS = {
  Starter: { ring: 'border-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  Pro: { ring: 'border-purple-500/30', text: 'text-purple-400', bg: 'bg-purple-500/10' },
  Business: { ring: 'border-amber-500/30', text: 'text-amber-400', bg: 'bg-amber-500/10' },
};
const defaultAccent = { ring: 'border-white/10', text: 'text-neutral-300', bg: 'bg-white/5' };

export default function SuperAdminSettings() {
  const { PLANS, updatePlan, resetPlans, stations, auditLog } = useSuperAdminState();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(Object.entries(PLANS).map(([key, p]) => [key, { label: p.label, price: String(p.price) }]))
  );
  const [saved, setSaved] = useState(null);

  const handleChange = (key, field, value) => {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSave = (key) => {
    const draft = drafts[key];
    updatePlan(key, { label: draft.label.trim() || PLANS[key].label, price: Number(draft.price) || 0 });
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  };

  const handleReset = () => {
    if (!window.confirm('Réinitialiser tous les plans aux tarifs par défaut ?')) return;
    resetPlans();
    setDrafts(Object.fromEntries(Object.entries(PLANS).map(([key, p]) => [key, { label: p.label, price: String(p.price) }])));
  };

  const usageCount = (key) => stations.filter(s => s.plan === key).length;

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-purple-400" /> Paramètres <span className="text-purple-400">Plateforme</span>
          </h1>
          <p className="text-neutral-400 text-lg">Gérez les plans d'abonnement proposés aux stations partenaires.</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Réinitialiser les tarifs
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {Object.entries(PLANS).map(([key, plan], index) => {
          const accent = PLAN_ACCENTS[key] || defaultAccent;
          const draft = drafts[key] || { label: plan.label, price: String(plan.price) };
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className={`glass-card rounded-2xl p-6 border ${accent.ring}`}
            >
              <div className="flex items-center justify-between mb-6">
                <div className={`p-3 rounded-xl ${accent.bg}`}>
                  <Crown className={`w-6 h-6 ${accent.text}`} />
                </div>
                <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-400">
                  {usageCount(key)} station{usageCount(key) > 1 ? 's' : ''}
                </span>
              </div>

              <h3 className={`text-lg font-bold mb-4 ${accent.text}`}>{key}</h3>

              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Nom du plan</label>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => handleChange(key, 'label', e.target.value)}
                className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold mb-4 focus:outline-none focus:border-purple-500 transition-colors"
              />

              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Prix mensuel (FCFA)</label>
              <input
                type="number"
                min="0"
                value={draft.price}
                onChange={(e) => handleChange(key, 'price', e.target.value)}
                className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold mb-5 focus:outline-none focus:border-purple-500 transition-colors"
              />

              <button
                onClick={() => handleSave(key)}
                className={`w-full flex items-center justify-center gap-2 font-bold py-2.5 rounded-xl transition-colors ${
                  saved === key ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                <Save className="w-4 h-4" /> {saved === key ? 'Enregistré ✓' : 'Enregistrer'}
              </button>
            </motion.div>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-2xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <ScrollText className="w-5 h-5 text-neutral-400" />
          <h2 className="text-xl font-bold text-white">Dernières actions administrateur</h2>
        </div>
        {auditLog.length === 0 ? (
          <p className="text-neutral-500 text-sm">Aucune action enregistrée pour le moment.</p>
        ) : (
          <div className="space-y-1 divide-y divide-white/5">
            {auditLog.slice(0, 8).map(entry => (
              <div key={entry.id} className="py-3 flex items-center justify-between gap-4">
                <p className="text-neutral-300 text-sm">{entry.action}</p>
                <span className="text-xs text-neutral-500 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString('fr-FR')}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
