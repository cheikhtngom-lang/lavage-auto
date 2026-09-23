import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Phone, Mail, Lock, CheckCircle2, Camera, X, Loader2, Briefcase, ShieldCheck, Clock3, MonitorSmartphone, Eye, EyeOff, FileDown, Download } from 'lucide-react';
import { useGroup } from '../../components/layout/GroupLayout';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { changePassword } from '../../lib/accounts';
import { supabase } from '../../lib/supabaseClient';
import { fetchMyOwnerProfile, updateMyOwnerProfile, renameMyGroup, GROUP_STATUS } from '../../lib/groups';
import { getIdleMinutes, setIdleMinutes, IDLE_MINUTES_DEFAULT } from '../../lib/idleTimeout';
import { exportMyGroupData } from '../../lib/rgpdExport';
import CloseAccountCard from '../../components/account/CloseAccountCard';

// Même limites que la photo de profil automobiliste (Client/Settings.jsx).
const MAX_PHOTO_SIZE = 1.5 * 1024 * 1024;
const ALLOWED_PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const IDLE_CHOICES = [15, 30, 60, 120, 240];

const inputCls = 'w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors';
const cardCls = 'glass-card rounded-2xl p-6 md:p-8 border border-white/10 bg-white/[0.02] mb-6';
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

function Saved({ children }) {
  return <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {children}</span>;
}

// Paramètres du chef d'entreprise (offre Sur mesure) : son profil, le nom de
// son entreprise et la sécurité de son compte. Les réglages propres à chaque
// station restent dans la station elle-même (Ouvrir -> Paramètres).
export default function GroupSettings() {
  useDocumentTitle('Paramètres');
  const { org, reload } = useGroup();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ ok: false, error: '' });
  const [photoError, setPhotoError] = useState('');

  const [orgName, setOrgName] = useState('');
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgMsg, setOrgMsg] = useState({ ok: false, error: '' });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ ok: false, error: '' });

  const [idleMinutes, setIdleMinutesState] = useState(getIdleMinutes());
  const [idleSaved, setIdleSaved] = useState(false);

  const [othersBusy, setOthersBusy] = useState(false);
  const [othersMsg, setOthersMsg] = useState({ ok: false, error: '' });

  const [exportProgress, setExportProgress] = useState(null); // null | { pct, label }
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    fetchMyOwnerProfile()
      .then((p) => {
        setProfile(p);
        setFullName(p?.full_name || '');
        setPhone(p?.phone || '');
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => { setOrgName(org?.name || ''); }, [org?.name]);

  const flash = (setter) => {
    setter({ ok: true, error: '' });
    setTimeout(() => setter((m) => ({ ...m, ok: false })), 2500);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) { setProfileMsg({ ok: false, error: 'Le nom est obligatoire.' }); return; }
    setProfileBusy(true);
    try {
      await updateMyOwnerProfile(profile.id, { fullName: fullName.trim(), phone: phone.trim() });
      setProfile((p) => ({ ...p, full_name: fullName.trim(), phone: phone.trim() }));
      flash(setProfileMsg);
    } catch (err) {
      setProfileMsg({ ok: false, error: err.message });
    } finally {
      setProfileBusy(false);
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;
    setPhotoError('');
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!file.type.startsWith('image/') || !ext || !ALLOWED_PHOTO_EXT.includes(ext)) {
      setPhotoError('Choisissez une image JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError('Cette image est trop lourde (1,5 Mo maximum).');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setPhotoError('Impossible de lire ce fichier, réessayez.');
    reader.onload = async () => {
      try {
        await updateMyOwnerProfile(profile.id, { photoUrl: reader.result });
        setProfile((p) => ({ ...p, photo_url: reader.result }));
      } catch (err) {
        setPhotoError(err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    try {
      await updateMyOwnerProfile(profile.id, { photoUrl: null });
      setProfile((p) => ({ ...p, photo_url: null }));
    } catch (err) {
      setPhotoError(err.message);
    }
  };

  const handleRenameOrg = async (e) => {
    e.preventDefault();
    if (!orgName.trim()) { setOrgMsg({ ok: false, error: "Le nom de l'entreprise est obligatoire." }); return; }
    setOrgBusy(true);
    try {
      await renameMyGroup(orgName.trim());
      await reload(); // le nom est aussi affiché dans le menu
      flash(setOrgMsg);
    } catch (err) {
      setOrgMsg({ ok: false, error: err.message });
    } finally {
      setOrgBusy(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { setPasswordMsg({ ok: false, error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' }); return; }
    if (newPassword !== newPasswordConfirm) { setPasswordMsg({ ok: false, error: 'Les nouveaux mots de passe ne correspondent pas.' }); return; }
    if (newPassword === currentPassword) { setPasswordMsg({ ok: false, error: "Le nouveau mot de passe doit être différent de l'actuel." }); return; }
    setPasswordBusy(true);
    try {
      await changePassword(profile?.email, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      flash(setPasswordMsg);
    } catch (err) {
      setPasswordMsg({ ok: false, error: err.message });
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleIdleChange = (value) => {
    const min = Number(value);
    setIdleMinutes(min);
    setIdleMinutesState(min);
    setIdleSaved(true);
    setTimeout(() => setIdleSaved(false), 2500);
  };

  // Coupe toutes les sessions ouvertes ailleurs (téléphone perdu, ordinateur
  // partagé…) en gardant celle-ci.
  const handleSignOutOthers = async () => {
    if (!window.confirm('Déconnecter votre compte de tous les autres appareils ? Cet appareil-ci reste connecté.')) return;
    setOthersBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      flash(setOthersMsg);
    } catch (err) {
      setOthersMsg({ ok: false, error: err.message || 'Impossible de déconnecter les autres appareils.' });
    } finally {
      setOthersBusy(false);
    }
  };

  // Portabilité : profil, entreprise et un dossier par station du groupe (lib/rgpdExport.js).
  const handleExport = async () => {
    setExportError('');
    setExportProgress({ pct: 0, label: 'Préparation…' });
    try {
      await exportMyGroupData({ onProgress: (pct, label) => setExportProgress({ pct, label }) });
    } catch (err) {
      setExportError(err.message || "Impossible de générer l'export.");
    } finally {
      setExportProgress(null);
    }
  };

  if (loadError) return <div className="p-8 text-red-400">{loadError}</div>;
  if (!profile) return <div className="p-8 text-neutral-500">Chargement…</div>;

  const status = GROUP_STATUS[org?.status];

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold tracking-tight mb-2"><span className="text-emerald-400">Paramètres</span></h1>
      <p className="text-neutral-400 mb-8">Votre profil, votre entreprise et la sécurité de votre compte.</p>

      {/* ─── Profil ─── */}
      <div className={cardCls}>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><User className="w-5 h-5 text-emerald-400" /> Mon profil</h2>

        <div className="flex items-center gap-5 mb-6 pb-6 border-b border-white/10">
          <div className="w-20 h-20 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {profile.photo_url ? <img src={profile.photo_url} alt="Photo de profil" className="w-full h-full object-cover" /> : <User className="w-9 h-9 text-neutral-600" />}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center gap-2">
                <Camera className="w-4 h-4" /> {profile.photo_url ? 'Changer la photo' : 'Ajouter une photo'}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              {profile.photo_url && (
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
            <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Téléphone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> E-mail de connexion</label>
            <input type="email" value={profile.email || ''} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
            <p className="text-neutral-500 text-xs mt-1.5">Pour changer d'adresse e-mail, contactez le support (lien Contact en bas du site).</p>
          </div>
          {profileMsg.error && <p className="text-sm text-red-400">{profileMsg.error}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" disabled={profileBusy} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center gap-2">
              {profileBusy && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
            </button>
            {profileMsg.ok && <Saved>Enregistré</Saved>}
          </div>
        </form>
      </div>

      {/* ─── Entreprise ─── */}
      <div className={cardCls}>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-400" /> Mon entreprise</h2>
        <form onSubmit={handleRenameOrg} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">Nom de l'entreprise</label>
            <input type="text" required maxLength={80} value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputCls} />
            <p className="text-neutral-500 text-xs mt-1.5">Affiché dans votre menu et auprès des stations que vous invitez à rejoindre le groupe.</p>
          </div>
          {orgMsg.error && <p className="text-sm text-red-400">{orgMsg.error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={orgBusy || orgName.trim() === (org?.name || '')} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center gap-2">
              {orgBusy && <Loader2 className="w-4 h-4 animate-spin" />} Renommer
            </button>
            {orgMsg.ok && <Saved>Nom mis à jour</Saved>}
          </div>
        </form>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <p className="text-neutral-500 text-xs mb-1.5">Statut</p>
            {status ? <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full border ${status.className}`}>{status.label}</span> : <p className="text-white">—</p>}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <p className="text-neutral-500 text-xs mb-1">Prochaine échéance</p>
            <p className="text-white font-bold">{fmtDate(org?.next_billing_date)}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <p className="text-neutral-500 text-xs mb-1">Client depuis le</p>
            <p className="text-white font-bold">{fmtDate(org?.created_at)}</p>
          </div>
        </div>
        <p className="text-neutral-500 text-xs mt-4">
          Paiements et historique : <Link to="/groupe/facturation" className="text-emerald-400 hover:underline">Facturation</Link>.
          Réglages d'une station (tarifs, horaires, équipe…) : ouvrez-la depuis <Link to="/groupe/stations" className="text-emerald-400 hover:underline">Mes stations</Link>, puis Paramètres.
        </p>
      </div>

      {/* ─── Sécurité ─── */}
      <div className={cardCls}>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Lock className="w-5 h-5 text-emerald-400" /> Changer le mot de passe</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">Mot de passe actuel</label>
            <input type={showPasswords ? 'text' : 'password'} required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1.5">Nouveau mot de passe</label>
              <input type={showPasswords ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1.5">Confirmer</label>
              <input type={showPasswords ? 'text' : 'password'} required autoComplete="new-password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} className={inputCls} />
            </div>
          </div>
          <button type="button" onClick={() => setShowPasswords((v) => !v)} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5">
            {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {showPasswords ? 'Masquer' : 'Afficher'} les mots de passe
          </button>
          <p className="text-neutral-500 text-xs">8 caractères minimum.</p>
          {passwordMsg.error && <p className="text-sm text-red-400">{passwordMsg.error}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="submit" disabled={passwordBusy} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center gap-2">
              {passwordBusy && <Loader2 className="w-4 h-4 animate-spin" />} Changer le mot de passe
            </button>
            {passwordMsg.ok && <Saved>Mot de passe mis à jour</Saved>}
          </div>
        </form>
      </div>

      <div className={cardCls}>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> Sessions</h2>

        <div className="mb-6 pb-6 border-b border-white/10">
          <label className="block text-sm font-medium text-white mb-1 flex items-center gap-1.5"><Clock3 className="w-4 h-4 text-neutral-400" /> Déconnexion automatique</label>
          <p className="text-neutral-500 text-xs mb-3">Après combien de temps sans activité votre compte se déconnecte sur <strong>cet appareil</strong>.</p>
          <div className="flex flex-wrap items-center gap-3">
            <select value={IDLE_CHOICES.includes(idleMinutes) ? idleMinutes : IDLE_MINUTES_DEFAULT} onChange={(e) => handleIdleChange(e.target.value)} className="bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500">
              {IDLE_CHOICES.map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} heure${m > 60 ? 's' : ''}`}{m === IDLE_MINUTES_DEFAULT ? ' (par défaut)' : ''}</option>
              ))}
            </select>
            {idleSaved && <Saved>Enregistré</Saved>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1 flex items-center gap-1.5"><MonitorSmartphone className="w-4 h-4 text-neutral-400" /> Autres appareils</label>
          <p className="text-neutral-500 text-xs mb-3">Téléphone perdu, ordinateur partagé ? Déconnectez votre compte partout ailleurs. Cet appareil reste connecté.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleSignOutOthers} disabled={othersBusy} className="bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/10 disabled:opacity-60 text-neutral-300 font-medium px-5 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2">
              {othersBusy && <Loader2 className="w-4 h-4 animate-spin" />} Déconnecter les autres appareils
            </button>
            {othersMsg.ok && <Saved>Autres appareils déconnectés</Saved>}
          </div>
          {othersMsg.error && <p className="text-sm text-red-400 mt-3">{othersMsg.error}</p>}
        </div>
      </div>

      {/* ─── Mes données ─── */}
      <div className={cardCls}>
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><FileDown className="w-5 h-5 text-emerald-400" /> Mes données</h2>
        <p className="text-neutral-400 text-sm mb-5">
          Droit à la portabilité (RGPD art. 20 ; loi sénégalaise n° 2008-12) : téléchargez à tout moment une copie complète, en JSON et CSV —
          votre profil, votre entreprise (commandes, analyses IA) et, pour chaque station du groupe, sa file, ses transactions, dépenses, équipe, pointage, abonnements clients, vidanges et boutique.
        </p>
        <button onClick={handleExport} disabled={!!exportProgress} className="flex items-center gap-2 bg-white/5 hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-60 text-neutral-300 border border-white/10 px-5 py-3 rounded-xl font-medium text-sm transition-colors">
          {exportProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exportProgress ? `${exportProgress.label} (${exportProgress.pct} %)` : "Exporter les données de l'entreprise (ZIP)"}
        </button>
        {exportError && <p className="text-sm text-red-400 mt-3">{exportError}</p>}
      </div>

      {/* ─── Fermeture (add_account_closure.sql) ─── */}
      {org?.name && (
        <CloseAccountCard
          title="Fermer mon espace entreprise"
          intro="Vous arrêtez l'offre Sur mesure ? Fermez votre espace : vous disposez ensuite de 30 jours pour changer d'avis."
          consequences={[
            "Tout de suite : votre espace et les stations que vous avez créées sont suspendus (retirés de l'annuaire, plus de réservations, équipes sans accès).",
            'Les stations rattachées à votre groupe continuent de fonctionner, puis redeviennent indépendantes au bout de 30 jours ; leurs propriétaires gardent leur compte.',
            "Au bout de 30 jours : votre compte et les comptes d'équipe de vos stations sont supprimés ; l'historique de vos stations est conservé sous forme anonyme.",
            "Les commandes en attente de paiement sont annulées ; le mois en cours n'est pas remboursé.",
            "Les files d'attente de vos stations doivent être vides, et aucune cession en cours.",
          ]}
          confirmWord={org.name}
          confirmHint={`Tapez le nom de l'entreprise (« ${org.name} ») pour confirmer`}
          onExport={() => exportMyGroupData()}
          exportLabel="Télécharger les données de l'entreprise (ZIP)"
          buttonLabel="Fermer mon espace…"
        />
      )}
    </div>
  );
}
