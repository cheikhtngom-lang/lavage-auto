import React, { useState } from 'react';
import { User, Phone, Lock, CheckCircle2 } from 'lucide-react';
import { useClientAccount } from '../../hooks/useClientAccount';
import { changePassword } from '../../lib/accounts';

export default function Settings() {
  const { account, updateProfile } = useClientAccount();

  const [name, setName] = useState(account?.name || '');
  const [phone, setPhone] = useState(account?.phone || '');
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  const handleSaveProfile = (e) => {
    e.preventDefault();
    updateProfile({ name: name.trim(), phone: phone.trim() });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('Les nouveaux mots de passe ne correspondent pas.');
      return;
    }

    try {
      await changePassword(account?.email, currentPassword, newPassword);
    } catch (err) {
      setPasswordError(err.message);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2500);
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl relative z-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold mb-2 tracking-tight">Mes <span className="text-blue-400">Paramètres</span></h1>
        <p className="text-neutral-400 text-lg">Gérez vos informations personnelles et votre sécurité.</p>
      </div>

      <div className="glass-card rounded-2xl p-6 md:p-8 border border-white/5 bg-white/[0.02] mb-8">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-400" /> Informations personnelles
        </h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">Nom complet</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Téléphone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-colors">
              Enregistrer
            </button>
            {profileSaved && (
              <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Enregistré</span>
            )}
          </div>
        </form>
      </div>

      <div className="glass-card rounded-2xl p-6 md:p-8 border border-white/5 bg-white/[0.02]">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Lock className="w-5 h-5 text-blue-400" /> Changer le mot de passe
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">Mot de passe actuel</label>
            <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1.5">Nouveau mot de passe</label>
              <input type="password" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1.5">Confirmer</label>
              <input type="password" required value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>
          {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-colors">
              Changer le mot de passe
            </button>
            {passwordSaved && (
              <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Mot de passe mis à jour</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
