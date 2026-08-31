import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Save, RotateCcw, ScrollText, Crown, Shield, Lock, Mail, CheckCircle2, CreditCard } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { supabase } from '../../lib/supabaseClient';
import { changePassword } from '../../lib/accounts';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

const PLAN_ACCENTS = {
  Starter: { ring: 'border-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  Pro: { ring: 'border-purple-500/30', text: 'text-purple-400', bg: 'bg-purple-500/10' },
  Business: { ring: 'border-amber-500/30', text: 'text-amber-400', bg: 'bg-amber-500/10' },
};
const defaultAccent = { ring: 'border-white/10', text: 'text-neutral-300', bg: 'bg-white/5' };

const TABS = [
  { id: 'plans', label: 'Plans & Tarifs', icon: CreditCard },
  { id: 'compte', label: 'Compte & Sécurité', icon: Shield },
  { id: 'journal', label: "Journal d'activité", icon: ScrollText },
];

export default function SuperAdminSettings() {
  useDocumentTitle('Paramètres plateforme');
  const { PLANS, updatePlan, resetPlans, stations, auditLog } = useSuperAdminState();
  const [activeTab, setActiveTab] = useState('plans');
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

  // Ordre croissant par prix — plus lisible/professionnel qu'un ordre arbitraire
  // (celui de la table `plans`, qui dépend de l'ordre d'insertion en base).
  const sortedPlans = Object.entries(PLANS).sort(([, a], [, b]) => a.price - b.price);

  // Email de connexion du Super Admin — jamais stocké dans le cache de session
  // (voir lib/accounts.js : celui-ci ne garde que role/ids), donc lu directement
  // depuis la session Supabase Auth, seule source de vérité pour l'utilisateur connecté.
  const [accountEmail, setAccountEmail] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAccountEmail(data?.user?.email || ''));
  }, []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    if (newPassword.length < 8) { setPasswordError('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    if (newPassword !== newPasswordConfirm) { setPasswordError('Les nouveaux mots de passe ne correspondent pas.'); return; }
    try {
      await changePassword(accountEmail, currentPassword, newPassword);
    } catch (err) {
      setPasswordError(err.message);
      return;
    }
    setCurrentPassword(''); setNewPassword(''); setNewPasswordConfirm('');
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2500);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-purple-400" /> Paramètres <span className="text-purple-400">Plateforme</span>
        </h1>
        <p className="text-neutral-400 text-lg">Gérez les plans d'abonnement, votre compte et le suivi d'activité.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Tabs Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors text-left whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === 'plans' && (
            <div>
              <div className="flex justify-end mb-6">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Réinitialiser les tarifs
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {sortedPlans.map(([key, plan], index) => {
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
            </div>
          )}

          {activeTab === 'compte' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-8 max-w-xl">
              <h2 className="text-2xl font-bold text-white mb-2">Compte & Sécurité</h2>
              <p className="text-neutral-400 mb-6 pb-4 border-b border-white/10">Gérez les identifiants de connexion de votre compte Super Admin.</p>

              <label className="text-sm font-medium text-neutral-400 flex items-center gap-1.5 mb-1.5"><Mail className="w-3.5 h-3.5" /> Email de connexion</label>
              <p className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-neutral-300 mb-6">{accountEmail || '—'}</p>

              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-purple-400" /> Changer le mot de passe</h3>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Mot de passe actuel</label>
                  <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Nouveau mot de passe</label>
                    <input type="password" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Confirmer</label>
                    <input type="password" required value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
                  </div>
                </div>
                {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
                <div className="flex items-center gap-3 pt-2">
                  <button type="submit" className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
                    Changer le mot de passe
                  </button>
                  {passwordSaved && (
                    <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Mot de passe mis à jour</span>
                  )}
                </div>
              </form>
            </motion.div>
          )}

          {activeTab === 'journal' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <ScrollText className="w-5 h-5 text-neutral-400" />
                <h2 className="text-xl font-bold text-white">Dernières actions administrateur</h2>
              </div>
              {auditLog.length === 0 ? (
                <p className="text-neutral-500 text-sm">Aucune action enregistrée pour le moment.</p>
              ) : (
                <div className="space-y-1 divide-y divide-white/5">
                  {auditLog.slice(0, 20).map(entry => (
                    <div key={entry.id} className="py-3 flex items-center justify-between gap-4">
                      <p className="text-neutral-300 text-sm">{entry.action}</p>
                      <span className="text-xs text-neutral-500 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString('fr-FR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
