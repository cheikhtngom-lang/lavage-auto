import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { User, Phone, Lock, CheckCircle2, Camera, X, Crown, Smartphone, Loader2, Clock3 } from 'lucide-react';
import { useClientAccount } from '../../hooks/useClientAccount';
import { changePassword } from '../../lib/accounts';
import { MAX_FREE_VEHICLES, SUPER_USER_MONTHLY_PRICE, createSuperUserPayment } from '../../lib/superUser';

const MAX_PHOTO_SIZE = 1.5 * 1024 * 1024; // 1.5 Mo — même limite que le logo station
const ALLOWED_PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp'];

export default function Settings() {
  const { account, updateProfile, superUserStatus, superUserSub, refreshSuperUser } = useClientAccount();
  const location = useLocation();
  const subscriptionRef = useRef(null);

  const [name, setName] = useState(account?.name || '');
  const [phone, setPhone] = useState(account?.phone || '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentJustSubmitted, setPaymentJustSubmitted] = useState(false);

  // Lien direct depuis le modal d'upsell (Garage/Stations) : /dashboard/parametres#abonnement
  useEffect(() => {
    if (location.hash === '#abonnement' && subscriptionRef.current) {
      subscriptionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const handleSaveProfile = (e) => {
    e.preventDefault();
    updateProfile({ name: name.trim(), phone: phone.trim() });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  // Upload de la photo de profil — même pattern que le logo station
  // (Admin/Settings.jsx handleLogoUpload) : validation MIME + taille + extension,
  // conversion en Data URL, stockage direct dans profiles.photo_url (pas de
  // Supabase Storage utilisé ailleurs dans ce projet, voir supabase/schema.sql).
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    if (!file.type.startsWith('image/')) {
      setPhotoError('Veuillez choisir un fichier image (JPG, PNG, WEBP...).');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_PHOTO_EXT.includes(ext)) {
      setPhotoError('Extension non supportée. Utilisez JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError('Cette image est trop lourde (max 1,5 Mo). Choisissez une photo plus légère.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setPhotoError("Impossible de lire ce fichier, réessayez.");
    reader.onload = () => updateProfile({ photoUrl: reader.result });
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => updateProfile({ photoUrl: null });

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

  // Même logique que la réservation (Stations.jsx) : pré-rempli avec le
  // numéro du compte, modifiable pour payer depuis un autre numéro Wave/OM.
  const openPaymentModal = () => {
    setPaymentMethod(null);
    setPaymentPhone(account?.phone || '');
    setPaymentError('');
    setPaymentJustSubmitted(false);
    setShowPaymentModal(true);
  };
  const closePaymentModal = () => setShowPaymentModal(false);

  // Le clic "Payer" ne rend JAMAIS le compte Super User tout seul : il crée
  // une ligne PENDING, que seul le Super Admin peut confirmer une fois
  // l'argent réellement reçu (voir src/lib/superUser.js et la policy RLS
  // super_user_subscriptions_update). Pas de simulation instantanée ici,
  // contrairement au paiement d'une réservation.
  const handleSubmitPayment = async () => {
    if (!paymentMethod || paymentPhone.trim().length < 6 || !account) return;
    setPaymentSubmitting(true);
    setPaymentError('');
    try {
      await createSuperUserPayment(account.id, {
        method: paymentMethod === 'wave' ? 'Wave' : 'Orange Money',
        reference: paymentPhone.trim(),
      });
      refreshSuperUser();
      setPaymentJustSubmitted(true);
    } catch (err) {
      setPaymentError(err.message || "Impossible d'enregistrer le paiement, réessayez.");
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

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

        <div className="flex items-center gap-5 mb-6 pb-6 border-b border-white/10">
          <div className="w-20 h-20 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {account?.photoUrl ? (
              <img src={account.photoUrl} alt="Photo de profil" className="w-full h-full object-cover" />
            ) : (
              <User className="w-9 h-9 text-neutral-600" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center gap-2">
                <Camera className="w-4 h-4" /> {account?.photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              {account?.photoUrl && (
                <button onClick={handleRemovePhoto} type="button" className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-sm font-medium">
                  <X className="w-4 h-4" /> Supprimer
                </button>
              )}
            </div>
            <p className="text-neutral-500 text-xs mt-2">JPG, PNG ou WEBP — 1,5 Mo maximum.</p>
            {photoError && <p className="text-red-400 text-xs mt-1.5">{photoError}</p>}
          </div>
        </div>

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

      <div ref={subscriptionRef} className="glass-card rounded-2xl p-6 md:p-8 border border-white/5 bg-white/[0.02] mb-8 scroll-mt-6">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-400" /> Mon abonnement
        </h2>

        {superUserStatus === 'ACTIVE' ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">SUPER USER</span>
              <span className="text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md text-xs font-medium border border-emerald-500/20">Statut : Actif</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-neutral-500 text-xs mb-1">Prix</p>
                <p className="text-white font-bold">{SUPER_USER_MONTHLY_PRICE.toLocaleString('fr-FR')} FCFA/mois</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-neutral-500 text-xs mb-1">Véhicules</p>
                <p className="text-white font-bold">Illimités</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-neutral-500 text-xs mb-1">Début</p>
                <p className="text-white font-bold">{formatDate(superUserSub?.started_at)}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-neutral-500 text-xs mb-1">Expiration</p>
                <p className="text-white font-bold">{formatDate(superUserSub?.expires_at)}</p>
              </div>
            </div>
            <button onClick={openPaymentModal} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors">
              Renouveler l'abonnement
            </button>
          </div>
        ) : superUserStatus === 'PENDING' ? (
          <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3.5">
            <Clock3 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-200/90">
              Paiement enregistré, en attente de validation par notre équipe. Votre compte passera automatiquement en Super User dès confirmation.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-white/10 text-neutral-300 text-xs font-bold px-3 py-1 rounded-full">GRATUIT</span>
              {superUserStatus === 'EXPIRED' && (
                <span className="text-red-400 bg-red-500/10 px-3 py-1 rounded-md text-xs font-medium border border-red-500/20">Abonnement Super User expiré</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-6 text-sm max-w-sm">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-neutral-500 text-xs mb-1">Offre</p>
                <p className="text-white font-bold">Gratuit</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-neutral-500 text-xs mb-1">Véhicules autorisés</p>
                <p className="text-white font-bold">{MAX_FREE_VEHICLES} maximum</p>
              </div>
            </div>
            <button onClick={openPaymentModal}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold px-5 py-3 rounded-xl text-sm transition-all flex items-center gap-2">
              <Crown className="w-4 h-4" /> {superUserStatus === 'EXPIRED' ? 'Se réabonner' : 'Passer à Super User'} — {SUPER_USER_MONTHLY_PRICE.toLocaleString('fr-FR')} FCFA/mois
            </button>
          </div>
        )}
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

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={closePaymentModal} className="absolute top-4 right-4 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>

            {paymentJustSubmitted ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center mx-auto mb-4">
                  <Clock3 className="w-7 h-7 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Paiement enregistré</h2>
                <p className="text-neutral-400 text-sm mb-6">Votre demande est en attente de validation par notre équipe. Vous passerez automatiquement en Super User dès confirmation.</p>
                <button onClick={closePaymentModal} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">Fermer</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-amber-500/20 rounded-xl"><Crown className="w-5 h-5 text-amber-400" /></div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Abonnement Super User</h2>
                    <p className="text-neutral-400 text-sm">{SUPER_USER_MONTHLY_PRICE.toLocaleString('fr-FR')} FCFA / mois</p>
                  </div>
                </div>
                <p className="text-sm text-neutral-400 mb-5">Réservez avec autant de véhicules que vous le souhaitez.</p>

                {paymentSubmitting ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    <p className="text-neutral-300 text-sm">Enregistrement du paiement...</p>
                  </div>
                ) : paymentMethod ? (
                  <div className="space-y-4">
                    <button type="button" onClick={() => setPaymentMethod(null)} className="text-xs text-neutral-400 hover:text-white transition-colors">
                      ← Changer de mode de paiement
                    </button>
                    <div>
                      <label className="block text-sm font-medium text-neutral-400 mb-1.5">Numéro {paymentMethod === 'wave' ? 'Wave' : 'Orange Money'} <span className="text-red-400">*</span></label>
                      <input type="tel" placeholder="+221 77 000 00 00" value={paymentPhone}
                        onChange={(e) => setPaymentPhone(e.target.value)}
                        className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors" />
                      {account?.phone && paymentPhone === account.phone && (
                        <p className="text-neutral-500 text-xs mt-1.5">Numéro de votre compte — modifiez-le si vous payez depuis un autre numéro.</p>
                      )}
                    </div>
                    {paymentError && <p className="text-sm text-red-400">{paymentError}</p>}
                    <button type="button" onClick={handleSubmitPayment} disabled={paymentPhone.trim().length < 6}
                      className={`w-full font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-white disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed ${paymentMethod === 'wave' ? 'bg-[#1DC8E0] hover:bg-[#17aec3]' : 'bg-[#FF7900] hover:bg-[#e56b00]'}`}>
                      <Smartphone className="w-5 h-5" /> Payer {SUPER_USER_MONTHLY_PRICE.toLocaleString('fr-FR')} FCFA via {paymentMethod === 'wave' ? 'Wave' : 'Orange Money'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button type="button" onClick={() => setPaymentMethod('wave')}
                      className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#1DC8E0]/50 hover:bg-[#1DC8E0]/10 transition-colors text-left">
                      <div className="w-11 h-11 rounded-xl bg-[#1DC8E0]/20 flex items-center justify-center flex-shrink-0">
                        <Smartphone className="w-5 h-5 text-[#1DC8E0]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-bold">Wave</p>
                        <p className="text-neutral-500 text-xs">Payer en ligne</p>
                      </div>
                    </button>
                    <button type="button" onClick={() => setPaymentMethod('orange_money')}
                      className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#FF7900]/50 hover:bg-[#FF7900]/10 transition-colors text-left">
                      <div className="w-11 h-11 rounded-xl bg-[#FF7900]/20 flex items-center justify-center flex-shrink-0">
                        <Smartphone className="w-5 h-5 text-[#FF7900]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-bold">Orange Money</p>
                        <p className="text-neutral-500 text-xs">Payer en ligne</p>
                      </div>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
