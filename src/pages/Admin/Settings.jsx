import React, { useState, useEffect } from 'react';
import { Save, Store, Clock, CreditCard, Shield, Users, UserPlus, CheckCircle2, Loader2, AlertTriangle, Trash2, RefreshCw, Image, X, MapPin, Lock, Mail, Stamp, Megaphone, Percent, Ticket, Smartphone, Clock3, XCircle, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../hooks/useAppState';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { getCurrentStationId } from '../../lib/accounts';
import { supabase } from '../../lib/supabaseClient';
import { SENEGAL_REGIONS } from '../../lib/regions';
import { geocodeQuartierRegion } from '../../lib/geocoding';
import { Card, CardContent } from '../../components/ui/Card';
import { AD_CAMPAIGN_PRICE, AD_CAMPAIGN_DAYS, MAX_AD_IMAGE_SIZE, deriveAdStatus, createAdPayment } from '../../lib/ads';

// Une grille tarifaire = une catégorie de pricingConfig + ses 3 prestations.
// Trois grilles distinctes, dans l'ordre où l'admin pense ses véhicules :
// voitures particulières, bus/minibus, puis camions et bus grande capacité.
const PRICING_GRIDS = [
  { category: 'Particulier', title: 'Voitures Particulières', icon: '🚗', hint: 'Berlines, citadines, SUV / 4x4...' },
  { category: 'Transport', title: 'Bus et Minibus', icon: '🚐', hint: 'Minibus (6 places), car rapide, bus standard...' },
  { category: 'Camion', title: 'Camion et Bus +50 places', icon: '🚛', hint: 'Camions légers/lourds et bus grande capacité (+50 places)' },
];
const PRICING_SERVICES = ['Lavage Simple', 'Lavage Complet', 'Lavage Moteur'];

// Mêmes catégories que la grille tarifaire — chacune a ses 3 durées propres,
// car un lavage complet ou moteur prend plus de temps qu'un lavage simple.
// La moto est traitée à part : un seul type de lavage existe pour les deux-roues.
const DURATION_GRIDS = [
  { category: 'Particulier', title: 'Voitures Particulières', icon: '🚗' },
  { category: 'Transport', title: 'Bus et Minibus', icon: '🚐' },
  { category: 'Camion', title: 'Camion et Bus +50 places', icon: '🚛' },
];

const MAX_LOGO_SIZE = 1.5 * 1024 * 1024; // 1.5 Mo — au-delà, ça alourdit trop le stockage local

// Catégories disponibles pour la réduction ciblée — la moto n'a que "Lavage Simple"
// (voir DURATION_GRIDS/moto plus haut), donc ses services proposés sont limités.
const PROMO_CATEGORIES = ['Moto', 'Particulier', 'Transport', 'Camion'];
const promoServicesFor = (category) => (category === 'Moto' ? ['Lavage Simple'] : PRICING_SERVICES);

export default function Settings() {
  const { stationProfile, pricingConfig, durationConfig, promoConfig, updateStationProfile, updatePricing, updateDuration, updatePromo, addEmployee, cleanDemoData, resetOperationalData, resetStationCompletely, stationAds, loadStationAds } = useAppState();
  const { stations, updateStation } = useSuperAdminState();
  const navigate = useNavigate();
  const isNewStation = !stationProfile?.name || stationProfile.name.trim() === '';
  const stationId = getCurrentStationId();
  const registryEntry = stations.find(s => s.id === stationId);
  const hasLocation = registryEntry?.lat != null && registryEntry?.lng != null;

  const [activeTab, setActiveTab] = useState('profil');
  const [geoStatus, setGeoStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [geoMessage, setGeoMessage] = useState('');

  // Local states for forms
  const [profile, setProfile] = useState(stationProfile);
  const [pricing, setPricing] = useState(pricingConfig);
  const [duration, setDuration] = useState(durationConfig);
  const [loyaltyThreshold, setLoyaltyThreshold] = useState(registryEntry?.loyaltyThreshold || 5);
  const [newEmp, setNewEmp] = useState({ name: '', phone: '', role: 'laveur', salary: '' });

  // stationProfile/registryEntry se chargent désormais depuis Supabase (async) —
  // ils sont vides au tout premier rendu, donc on resynchronise les formulaires
  // locaux dès que les vraies données arrivent (une fois par station chargée).
  useEffect(() => { setProfile(stationProfile); }, [stationProfile]);
  useEffect(() => {
    if (!registryEntry) return;
    setLoyaltyThreshold(registryEntry.loyaltyThreshold || 5);
    setLoginEmail(registryEntry.ownerEmail || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryEntry?.id]);
  
  // States for CTAs
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const [isCreatingEmp, setIsCreatingEmp] = useState(false);
  const [empSuccess, setEmpSuccess] = useState(false);

  // État pour le rapport de nettoyage
  const [cleanReport, setCleanReport] = useState(null); // null | [] | ['msg1', 'msg2']

  // États pour le changement d'identifiants (email de connexion + mot de passe)
  const [loginEmail, setLoginEmail] = useState(registryEntry?.ownerEmail || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [credentialsError, setCredentialsError] = useState('');
  const [credentialsSaved, setCredentialsSaved] = useState(false);

  // État pour le sous-onglet dédié "Changer nom de profil"
  const [nameSaved, setNameSaved] = useState(false);

  // État pour la rubrique Promotions
  const [promo, setPromo] = useState(promoConfig);
  const [promoSaved, setPromoSaved] = useState(false);

  // État pour la rubrique Publicité (campagne payante, diffusée à tous les
  // automobilistes de la plateforme — voir src/lib/ads.js / station_ads).
  const [adMessage, setAdMessage] = useState('');
  const [adImage, setAdImage] = useState(null);
  const [adImageError, setAdImageError] = useState('');
  const [adPaymentMethod, setAdPaymentMethod] = useState(null); // null | 'wave' | 'orange_money'
  const [adPaymentPhone, setAdPaymentPhone] = useState('');
  const [adSubmitting, setAdSubmitting] = useState(false);
  const [adError, setAdError] = useState('');
  const [adJustSubmitted, setAdJustSubmitted] = useState(false);
  useEffect(() => { setAdPaymentPhone(stationProfile?.phone || ''); }, [stationProfile?.phone]);

  const handleSave = () => {
    setIsSaving(true);

    updateStationProfile(profile);
    updatePricing(pricing);
    updateDuration(duration);

    // Synchronise les infos publiques (nom, adresse, quartier, région) vers le
    // registre Super Admin, pour que la recherche/landing page les reflètent.
    if (registryEntry) {
      updateStation(stationId, {
        name: profile?.name || registryEntry.name,
        address: profile?.address || '',
        quartier: profile?.quartier || '',
        region: profile?.region || '',
        loyaltyThreshold: Number(loyaltyThreshold) || 5,
      });
    }

    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 1000);
  };

  const handleCreateEmp = () => {
    if (!newEmp.name) return;
    setIsCreatingEmp(true);
    
    addEmployee({
        name: newEmp.name,
        role: newEmp.role === 'laveur' ? 'Laveur' : newEmp.role === 'caisse' ? 'Caisse' : 'Superviseur',
        access: newEmp.role === 'laveur' ? 'Aucun' : newEmp.role === 'caisse' ? 'Limité' : 'Complet',
    });
    
    setTimeout(() => {
      setIsCreatingEmp(false);
      setEmpSuccess(true);
      setNewEmp({ name: '', phone: '', role: 'laveur', salary: '' });
      setTimeout(() => setEmpSuccess(false), 3000);
    }, 1000);
  };

  // Nettoyage ciblé — supprime uniquement les données fictives
  const handleCleanDemo = () => {
    const report = cleanDemoData();
    setCleanReport(report);
    if (report.length === 0) {
      setCleanReport(['Aucune donnée fictive trouvée — vos données sont déjà propres !']);
    }
    // Aller automatiquement dans l'onglet Sécurité pour voir le rapport
    setActiveTab('securite');
  };

  // Vide la file, l'historique et les transactions de VOTRE station (profil et tarifs conservés)
  const handleReset = () => {
    if (!window.confirm('Êtes-vous sûr ? La file, l\'historique et les transactions de votre station seront supprimés. Le profil et les tarifs seront conservés.')) return;
    resetOperationalData();
  };

  // Réinitialise TOUT pour VOTRE station uniquement (les autres stations ne sont pas affectées)
  const handleFullReset = () => {
    if (!window.confirm('ATTENTION : Cela effacera TOUTES les données de VOTRE station (profil, tarifs, employés, historique). Continuer ?')) return;
    resetStationCompletely();
  };

  // Localise la station (GPS réel) pour le tri par proximité côté landing page
  const handleLocateStation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      setGeoMessage("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setGeoStatus('loading');
    setGeoMessage('Localisation en cours...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateStation(stationId, { lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus('success');
        setGeoMessage(`Position enregistrée ✓ (précision ~${Math.round(pos.coords.accuracy)} m)`);
      },
      (err) => {
        const messages = {
          1: 'Permission refusée — activez la localisation dans votre navigateur.',
          2: 'Position indisponible pour le moment.',
          3: 'Délai dépassé, réessayez.',
        };
        setGeoStatus('error');
        setGeoMessage(messages[err.code] || 'Impossible de récupérer votre position.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Alternative au GPS : localise la station à partir du quartier/région saisis —
  // utile si vous configurez la station depuis un autre endroit que la station elle-même.
  const handleLocateFromQuartier = async () => {
    if (!profile?.quartier || !profile?.region) {
      setGeoStatus('error');
      setGeoMessage("Renseignez d'abord le quartier et la région ci-dessus.");
      return;
    }
    setGeoStatus('loading');
    setGeoMessage('Recherche du quartier...');
    try {
      const result = await geocodeQuartierRegion(profile.quartier, profile.region);
      updateStation(stationId, { lat: result.lat, lng: result.lng });
      setGeoStatus('success');
      setGeoMessage(result.precision === 'quartier'
        ? 'Quartier localisé ✓ (position approximative)'
        : 'Quartier introuvable — position centrée sur la région ✓ (approximative)');
    } catch (err) {
      setGeoStatus('error');
      setGeoMessage(err.message || 'Impossible de localiser ce quartier.');
    }
  };

  // Upload du logo (converti en Data URL, stocké dans le profil de la station)
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Veuillez choisir un fichier image (PNG, JPG, SVG...).');
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      alert('Cette image est trop lourde (max 1,5 Mo). Choisissez une image plus légère.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfile(p => ({ ...p, logo: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => setProfile(p => ({ ...p, logo: null }));

  // Upload du cachet officiel (même pattern que le logo) — apposé sur les reçus clients
  const handleStampUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Veuillez choisir un fichier image (PNG, JPG, SVG...).');
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      alert('Cette image est trop lourde (max 1,5 Mo). Choisissez une image plus légère.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfile(p => ({ ...p, cachet: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleRemoveStamp = () => setProfile(p => ({ ...p, cachet: null }));

  // Changement d'email de connexion et/ou de mot de passe — vérifie le mot de
  // passe actuel avant toute modification, comme côté espace automobiliste.
  // Le mot de passe actuel n'est jamais accessible côté client (Supabase Auth) —
  // on le revérifie via une tentative de connexion avant tout changement.
  const handleChangeCredentials = async (e) => {
    e.preventDefault();
    setCredentialsError('');

    const trimmedEmail = loginEmail.trim();
    if (!trimmedEmail) {
      setCredentialsError("L'email de connexion ne peut pas être vide.");
      return;
    }
    if (newPassword || newPasswordConfirm) {
      if (newPassword.length < 8) {
        setCredentialsError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        setCredentialsError('Les nouveaux mots de passe ne correspondent pas.');
        return;
      }
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: registryEntry?.ownerEmail, password: currentPassword });
    if (verifyError) {
      setCredentialsError('Mot de passe actuel incorrect.');
      return;
    }

    if (newPassword) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { setCredentialsError(error.message); return; }
    }
    if (trimmedEmail.toLowerCase() !== registryEntry?.ownerEmail?.toLowerCase()) {
      const { error } = await supabase.auth.updateUser({ email: trimmedEmail });
      if (error) { setCredentialsError(error.message); return; }
      updateStation(stationId, { ownerEmail: trimmedEmail });
    }

    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setCredentialsSaved(true);
    setTimeout(() => setCredentialsSaved(false), 2500);
  };

  // Sous-onglet dédié : ne touche que le nom (contrairement au bouton global
  // "Enregistrer les modifications" qui persiste tout le profil d'un coup).
  const handleSaveProfileName = (e) => {
    e.preventDefault();
    updateStationProfile(profile);
    if (registryEntry) updateStation(stationId, { name: profile?.name || registryEntry.name });
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2500);
  };

  const handleSavePromo = (e) => {
    e.preventDefault();
    updatePromo(promo);
    setPromoSaved(true);
    setTimeout(() => setPromoSaved(false), 2500);
  };

  // Même pattern que le logo/cachet (handleLogoUpload ci-dessus) : Data URL,
  // pas de Supabase Storage sur ce projet.
  const handleAdImageUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAdImageError('');
    if (!file.type.startsWith('image/')) { setAdImageError('Veuillez choisir un fichier image (PNG, JPG...).'); return; }
    if (file.size > MAX_AD_IMAGE_SIZE) { setAdImageError('Cette image est trop lourde (max 1,5 Mo).'); return; }
    const reader = new FileReader();
    reader.onload = () => setAdImage(reader.result);
    reader.readAsDataURL(file);
  };
  const handleRemoveAdImage = () => setAdImage(null);

  const resetAdForm = () => {
    setAdMessage(''); setAdImage(null); setAdImageError('');
    setAdPaymentMethod(null); setAdPaymentPhone(stationProfile?.phone || '');
    setAdError(''); setAdJustSubmitted(false);
  };

  // Le clic "Payer" ne diffuse JAMAIS la pub tout seul : il crée une ligne
  // PENDING, que seul le Super Admin confirme une fois l'argent reçu (même
  // logique que l'abonnement Super User côté client, voir src/lib/ads.js).
  const handleSubmitAd = async () => {
    if (!adPaymentMethod || adPaymentPhone.trim().length < 6 || !adMessage.trim() || !stationId) return;
    setAdSubmitting(true);
    setAdError('');
    try {
      await createAdPayment(stationId, {
        message: adMessage, imageUrl: adImage,
        method: adPaymentMethod === 'wave' ? 'Wave' : 'Orange Money',
        reference: adPaymentPhone.trim(),
      });
      await loadStationAds();
      setAdJustSubmitted(true);
    } catch (err) {
      setAdError(err.message || "Impossible d'enregistrer le paiement, réessayez.");
    } finally {
      setAdSubmitting(false);
    }
  };

  const adStatusBadge = { PENDING: { label: 'En attente de confirmation', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' }, ACTIVE: { label: 'En cours de diffusion', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }, REJECTED: { label: 'Paiement rejeté', className: 'bg-red-500/10 text-red-400 border-red-500/20' }, EXPIRED: { label: 'Terminée', className: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20' }, CANCELLED: { label: 'Annulée', className: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20' } };
  const latestAd = stationAds[0] || null;
  const latestAdStatus = latestAd ? deriveAdStatus(latestAd) : null;
  const adFormLocked = latestAdStatus === 'PENDING' || latestAdStatus === 'ACTIVE';
  const adFormatDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      {/* Banner d'onboarding si la station n'est pas encore configurée */}
      {isNewStation && (
        <div className="mb-6 bg-orange-950/40 border border-orange-500/30 rounded-2xl p-5 flex items-start gap-4">
          <div className="p-2.5 bg-orange-500/20 rounded-xl flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-orange-300 font-bold mb-1">Configurez d'abord votre station</h3>
            <p className="text-orange-200/70 text-sm">Votre station n'a pas encore de nom. Remplissez le champ "Nom de la station" ci-dessous et cliquez sur <strong>Enregistrer</strong>. Ce nom s'affichera partout dans l'interface.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Paramètres de la <span className="text-blue-400">Station</span></h1>
          <p className="text-neutral-400 text-lg">Configurez vos informations, tarifs et algorithmes.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving || saveSuccess}
          className={`px-6 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 ${
            saveSuccess ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 
            'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
          }`}
        >
          {isSaving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          {isSaving ? 'Enregistrement...' : saveSuccess ? 'Modifications enregistrées !' : 'Enregistrer les modifications'}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Settings Sidebar */}
        <div className="w-full lg:w-64 flex flex-col gap-2">
          {[
            { id: 'profil', label: 'Profil Station', icon: Store },
            { id: 'nomprofil', label: 'Changer nom de profil', icon: Store },
            { id: 'employes', label: 'Gestion Employés', icon: Users },
            { id: 'temps', label: 'Temps Estimés', icon: Clock },
            { id: 'tarifs', label: 'Grille Tarifaire', icon: CreditCard },
            { id: 'promotions', label: 'Promotions', icon: Megaphone },
            { id: 'publicite', label: 'Passer une pub', icon: Camera },
            { id: 'securite', label: 'Sécurité & Accès', icon: Shield },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors text-left ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                  : 'bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Settings Content */}
        <div className="flex-1">
          {activeTab === 'profil' && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold text-white mb-6 border-b border-white/10 pb-4">Informations Générales</h2>

                <div className="mb-8">
                  <label className="text-sm font-medium text-neutral-400 block mb-3">Logo de la station</label>
                  <div className="flex items-center gap-5">
                    <div className="w-20 h-20 rounded-2xl bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {profile?.logo ? (
                        <img src={profile.logo} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <Image className="w-8 h-8 text-neutral-600" />
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors">
                        {profile?.logo ? 'Changer le logo' : 'Ajouter un logo'}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      {profile?.logo && (
                        <button onClick={handleRemoveLogo} type="button" className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-sm font-medium px-3 py-2.5">
                          <X className="w-4 h-4" /> Retirer
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-neutral-500 text-xs mt-2">PNG, JPG ou SVG — 1,5 Mo maximum. Affiché dans votre espace admin.</p>
                </div>

                <div className="mb-8">
                  <label className="text-sm font-medium text-neutral-400 block mb-3 flex items-center gap-1.5"><Stamp className="w-4 h-4" /> Cachet de l'entreprise</label>
                  <div className="flex items-center gap-5">
                    <div className="w-20 h-20 rounded-2xl bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {profile?.cachet ? (
                        <img src={profile.cachet} alt="Cachet" className="w-full h-full object-contain" />
                      ) : (
                        <Stamp className="w-8 h-8 text-neutral-600" />
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors">
                        {profile?.cachet ? 'Changer le cachet' : 'Ajouter un cachet'}
                        <input type="file" accept="image/*" onChange={handleStampUpload} className="hidden" />
                      </label>
                      {profile?.cachet && (
                        <button onClick={handleRemoveStamp} type="button" className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-sm font-medium px-3 py-2.5">
                          <X className="w-4 h-4" /> Retirer
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-neutral-500 text-xs mt-2">PNG avec fond transparent recommandé — 1,5 Mo maximum. Apposé automatiquement sur les reçus de paiement.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Nom de la station</label>
                    <input type="text" value={profile?.name || ''} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Téléphone de contact</label>
                    <input type="text" value={profile?.phone || ''} onChange={e => setProfile({...profile, phone: e.target.value})} className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-neutral-400">Adresse complète</label>
                    <input type="text" value={profile?.address || ''} onChange={e => setProfile({...profile, address: e.target.value})} className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Quartier</label>
                    <input type="text" value={profile?.quartier || ''} onChange={e => setProfile({...profile, quartier: e.target.value})} placeholder="Ex: Plateau" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Région</label>
                    <select value={profile?.region || ''} onChange={e => setProfile({...profile, region: e.target.value})} className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 appearance-none">
                      <option value="">Sélectionner...</option>
                      {SENEGAL_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <p className="text-neutral-500 text-xs -mt-1">Le quartier et la région permettent aux automobilistes de vous trouver par la recherche. Enregistrez pour les rendre visibles.</p>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-neutral-400">Position GPS <span className="text-neutral-600">(optionnel, affine la distance affichée)</span></label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button type="button" onClick={handleLocateStation} disabled={geoStatus === 'loading'}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50">
                        <MapPin className="w-4 h-4" />
                        {geoStatus === 'loading' ? 'Localisation...' : hasLocation ? 'Mettre à jour ma position' : 'Localiser ma station'}
                      </button>
                      <button type="button" onClick={handleLocateFromQuartier} disabled={geoStatus === 'loading'}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50">
                        🗺️ Localiser depuis le quartier
                      </button>
                      {hasLocation && !geoMessage && (
                        <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Position définie</span>
                      )}
                      {geoMessage && (
                        <span className={`text-sm ${geoStatus === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{geoMessage}</span>
                      )}
                    </div>
                    <p className="text-neutral-500 text-xs">Permet aux automobilistes de vous trouver via "Ma position" depuis la page d'accueil. Pas sur place ? Utilisez "Localiser depuis le quartier" — renseignez d'abord le quartier et la région ci-dessus.</p>
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-white mt-10 mb-6 border-b border-white/10 pb-4">Programme de fidélité</h2>
                <div className="space-y-2 max-w-xs">
                  <label className="text-sm font-medium text-neutral-400">Lavages avant un lavage gratuit</label>
                  <input type="number" min="2" max="20" value={loyaltyThreshold} onChange={e => setLoyaltyThreshold(e.target.value)}
                    className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  <p className="text-neutral-500 text-xs">Ex: 5 → au 5ème lavage payé, le client voit "Lavage gratuit disponible" dans son suivi.</p>
                </div>

                <h2 className="text-2xl font-bold text-white mt-10 mb-6 border-b border-white/10 pb-4">Horaires d'ouverture</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Heure d'ouverture</label>
                    <input type="time" value={profile?.openTime || ''} onChange={e => setProfile({...profile, openTime: e.target.value})} className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Heure de fermeture</label>
                    <input type="time" value={profile?.closeTime || ''} onChange={e => setProfile({...profile, closeTime: e.target.value})} className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-white mt-10 mb-6 border-b border-white/10 pb-4">Objectif de revenus</h2>
                <div className="space-y-2 max-w-sm">
                  <label className="text-sm font-medium text-neutral-400">Objectif journalier (FCFA)</label>
                  <input type="number" min="0" step="1000" value={profile?.dailyRevenueTarget ?? 50000}
                    onChange={e => setProfile({ ...profile, dailyRevenueTarget: e.target.value === '' ? '' : Number(e.target.value) })}
                    className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  <p className="text-neutral-500 text-xs">Affiché dans Comptabilité, sous "Objectif du Jour".</p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'nomprofil' && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-8 max-w-xl">
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Store className="w-5 h-5 text-blue-400" /> Nom de profil</h2>
                <p className="text-neutral-400 mb-8 pb-4 border-b border-white/10">C'est le nom affiché aux clients partout dans l'application (recherche, réservation, reçus).</p>
                <form onSubmit={handleSaveProfileName} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Nom de la station</label>
                    <input type="text" required value={profile?.name || ''} onChange={e => setProfile({...profile, name: e.target.value})}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
                      Enregistrer le nom
                    </button>
                    {nameSaved && (
                      <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Enregistré</span>
                    )}
                  </div>
                </form>

                <h2 className="text-2xl font-bold text-white mt-10 mb-2 flex items-center gap-2"><Lock className="w-5 h-5 text-blue-400" /> Changer mot de passe</h2>
                <p className="text-neutral-400 mb-8 pb-4 border-b border-white/10">Le mot de passe actuel est requis pour confirmer le changement.</p>
                <form onSubmit={handleChangeCredentials} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Ancien mot de passe</label>
                    <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Nouveau mot de passe</label>
                    <input type="password" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Confirmer mot de passe</label>
                    <input type="password" required value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  {credentialsError && <p className="text-sm text-red-400">{credentialsError}</p>}
                  <div className="flex items-center gap-3 pt-2">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
                      Changer le mot de passe
                    </button>
                    {credentialsSaved && (
                      <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Mot de passe mis à jour</span>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === 'employes' && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-8">
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                  <h2 className="text-2xl font-bold text-white">Création d'un Profil Employé</h2>
                  <button 
                    onClick={handleCreateEmp}
                    disabled={isCreatingEmp || empSuccess}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors ${
                      empSuccess ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {isCreatingEmp ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : empSuccess ? (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    ) : (
                      <UserPlus className="w-4 h-4 mr-2" />
                    )}
                    {isCreatingEmp ? 'Création...' : empSuccess ? 'Employé créé !' : "Créer l'employé"}
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Prénom & Nom</label>
                    <input type="text" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} placeholder="Ex: Moussa Diop" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Numéro de Téléphone</label>
                    <input type="text" value={newEmp.phone} onChange={e => setNewEmp({...newEmp, phone: e.target.value})} placeholder="Ex: 77 000 00 00" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Rôle au sein de la station</label>
                    <select value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})} className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 appearance-none">
                      <option value="laveur">Laveur</option>
                      <option value="caisse">Caisse / Accueil</option>
                      <option value="superviseur">Superviseur</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Salaire / Base de paie</label>
                    <input type="text" value={newEmp.salary} onChange={e => setNewEmp({...newEmp, salary: e.target.value})} placeholder="Ex: 5000 FCFA / jour ou %" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div className="mt-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <p className="text-sm text-emerald-200/70">
                    <strong className="text-emerald-400 block mb-1">Système de Pointage activé</strong>
                    Une fois créé, cet employé apparaîtra automatiquement dans la page "Équipe" pour le pointage de ses heures d'arrivée et de départ.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'temps' && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Algorithme d'Estimation</h2>
                <p className="text-neutral-400 mb-8 pb-4 border-b border-white/10">Ajustez les durées de référence (en minutes) pour chaque type de lavage. Un lavage complet ou moteur prend logiquement plus de temps qu'un lavage simple.</p>

                <div className="space-y-10">
                  {/* Moto — un seul type de lavage existe pour les deux-roues */}
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-2xl">🏍️</span>
                      <h3 className="text-lg font-bold text-white">Moto / Scooter</h3>
                    </div>
                    <p className="text-neutral-500 text-xs mb-4">Un seul type de lavage est proposé pour les deux-roues.</p>
                    <div className="max-w-xs">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-400">Lavage Simple</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={duration?.Moto?.["Lavage Simple"] ?? ''}
                            onChange={e => setDuration({
                              ...duration,
                              Moto: { ...(duration?.Moto || {}), "Lavage Simple": parseInt(e.target.value) || 0 },
                            })}
                            className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 pr-14 text-white focus:outline-none focus:border-blue-500"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-medium">min</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {DURATION_GRIDS.map(grid => (
                    <div key={grid.category}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-2xl">{grid.icon}</span>
                        <h3 className="text-lg font-bold text-white">{grid.title}</h3>
                      </div>
                      <p className="text-neutral-500 text-xs mb-4">Durée estimée par type de lavage.</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {PRICING_SERVICES.map(service => (
                          <div className="space-y-2" key={service}>
                            <label className="text-sm font-medium text-neutral-400">{service}</label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                value={duration?.[grid.category]?.[service] ?? ''}
                                onChange={e => setDuration({
                                  ...duration,
                                  [grid.category]: { ...(duration?.[grid.category] || {}), [service]: parseInt(e.target.value) || 0 },
                                })}
                                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 pr-14 text-white focus:outline-none focus:border-blue-500"
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-medium">min</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'tarifs' && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Grille Tarifaire</h2>
                <p className="text-neutral-400 mb-8 pb-4 border-b border-white/10">Configurez le prix de vos prestations en FCFA, par catégorie de véhicule.</p>

                <div className="space-y-10">
                  {PRICING_GRIDS.map(grid => (
                    <div key={grid.category}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-2xl">{grid.icon}</span>
                        <h3 className="text-lg font-bold text-white">Grille tarifaire — {grid.title}</h3>
                      </div>
                      <p className="text-neutral-500 text-xs mb-4">{grid.hint}</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {PRICING_SERVICES.map(service => (
                          <div className="space-y-2" key={service}>
                            <label className="text-sm font-medium text-neutral-400">{service}</label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                value={pricing?.[grid.category]?.[service] ?? ''}
                                onChange={e => setPricing({
                                  ...pricing,
                                  [grid.category]: { ...(pricing?.[grid.category] || {}), [service]: parseInt(e.target.value) || 0 },
                                })}
                                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 pr-16 text-white focus:outline-none focus:border-blue-500"
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-medium">FCFA</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'promotions' && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Megaphone className="w-5 h-5 text-blue-400" /> Promotions</h2>
                <p className="text-neutral-400 mb-8 pb-4 border-b border-white/10">Attirez plus de clients avec un bandeau promo, une réduction ciblée ou un code promo.</p>

                <form onSubmit={handleSavePromo} className="space-y-10">
                  {/* Bandeau promo */}
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2"><Megaphone className="w-4 h-4 text-blue-400" /> Bandeau promo</h3>
                    <p className="text-neutral-500 text-xs mb-4">Message affiché aux clients sur la fiche de votre station (ex: "-20% ce week-end").</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-neutral-400">Message</label>
                        <input type="text" maxLength={80} placeholder="Ex: Lavage complet à -20% ce week-end !"
                          value={promo?.banner?.message || ''}
                          onChange={e => setPromo({ ...promo, banner: { ...(promo?.banner || {}), message: e.target.value } })}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-400">Expire le</label>
                        <input type="date"
                          value={promo?.banner?.expiresAt || ''}
                          onChange={e => setPromo({ ...promo, banner: { ...(promo?.banner || {}), expiresAt: e.target.value } })}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                    <p className="text-neutral-500 text-xs mt-2">Laissez le message vide pour ne rien afficher. Laissez la date vide pour un bandeau sans expiration.</p>
                  </div>

                  {/* Réduction ciblée */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2"><Percent className="w-4 h-4 text-blue-400" /> Réduction sur un type de lavage</h3>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={!!promo?.discount?.active}
                          onChange={e => setPromo({ ...promo, discount: { ...(promo?.discount || {}), active: e.target.checked } })}
                          className="w-4 h-4 rounded border-white/20 bg-neutral-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900" />
                        <span className="text-sm text-neutral-400">Active</span>
                      </label>
                    </div>
                    <p className="text-neutral-500 text-xs mb-4">Le prix affiché et facturé sera automatiquement réduit pour cette catégorie + ce service, tant que la promo est active.</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-400">Catégorie</label>
                        <select
                          value={promo?.discount?.category || 'Particulier'}
                          onChange={e => {
                            const category = e.target.value;
                            const services = promoServicesFor(category);
                            const service = services.includes(promo?.discount?.service) ? promo.discount.service : services[0];
                            setPromo({ ...promo, discount: { ...(promo?.discount || {}), category, service } });
                          }}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 appearance-none">
                          {PROMO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-400">Service</label>
                        <select
                          value={promo?.discount?.service || 'Lavage Simple'}
                          onChange={e => setPromo({ ...promo, discount: { ...(promo?.discount || {}), service: e.target.value } })}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 appearance-none">
                          {promoServicesFor(promo?.discount?.category || 'Particulier').map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-400">Réduction</label>
                        <div className="relative">
                          <input type="number" min="0" max="100"
                            value={promo?.discount?.percent ?? ''}
                            onChange={e => setPromo({ ...promo, discount: { ...(promo?.discount || {}), percent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) } })}
                            className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 pr-9 text-white focus:outline-none focus:border-blue-500" />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-medium">%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-400">Expire le</label>
                        <input type="date"
                          value={promo?.discount?.expiresAt || ''}
                          onChange={e => setPromo({ ...promo, discount: { ...(promo?.discount || {}), expiresAt: e.target.value } })}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                  </div>

                  {/* Code promo */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2"><Ticket className="w-4 h-4 text-blue-400" /> Code promo / parrainage</h3>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={!!promo?.code?.active}
                          onChange={e => setPromo({ ...promo, code: { ...(promo?.code || {}), active: e.target.checked } })}
                          className="w-4 h-4 rounded border-white/20 bg-neutral-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900" />
                        <span className="text-sm text-neutral-400">Active</span>
                      </label>
                    </div>
                    <p className="text-neutral-500 text-xs mb-4">Un code que vos clients saisissent à la réservation pour obtenir un avantage — utile pour le parrainage ou une campagne ponctuelle.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-400">Code</label>
                        <input type="text" placeholder="Ex: BIENVENUE10"
                          value={promo?.code?.code || ''}
                          onChange={e => setPromo({ ...promo, code: { ...(promo?.code || {}), code: e.target.value.toUpperCase() } })}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-neutral-400">Avantage</label>
                        <select
                          value={promo?.code?.type || 'percent'}
                          onChange={e => setPromo({ ...promo, code: { ...(promo?.code || {}), type: e.target.value } })}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 appearance-none">
                          <option value="percent">Réduction en %</option>
                          <option value="free">Lavage offert (100%)</option>
                        </select>
                      </div>
                      {promo?.code?.type !== 'free' && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-neutral-400">Pourcentage</label>
                          <div className="relative">
                            <input type="number" min="0" max="100"
                              value={promo?.code?.value ?? ''}
                              onChange={e => setPromo({ ...promo, code: { ...(promo?.code || {}), value: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) } })}
                              className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 pr-9 text-white focus:outline-none focus:border-blue-500" />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-xs font-medium">%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors mt-6">
                      Enregistrer les promotions
                    </button>
                    {promoSaved && (
                      <span className="text-sm text-emerald-400 flex items-center gap-1.5 mt-6"><CheckCircle2 className="w-4 h-4" /> Enregistré</span>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === 'publicite' && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-8 max-w-2xl">
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Camera className="w-5 h-5 text-blue-400" /> Passer une pub</h2>
                <p className="text-neutral-400 mb-8 pb-4 border-b border-white/10">
                  Diffusez un message sur le tableau de bord de <strong className="text-white">tous les automobilistes de la plateforme</strong> — {AD_CAMPAIGN_PRICE.toLocaleString('fr-FR')} FCFA pour {AD_CAMPAIGN_DAYS} jours.
                  Contrairement aux Promotions (visibles uniquement sur votre fiche station), une pub touche même les clients qui n'ont jamais réservé chez vous.
                </p>

                {adJustSubmitted ? (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center mx-auto mb-4">
                      <Clock3 className="w-7 h-7 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Paiement enregistré</h3>
                    <p className="text-neutral-400 text-sm mb-6">Votre demande est en attente de validation par notre équipe. La diffusion démarrera automatiquement dès confirmation.</p>
                    <button onClick={resetAdForm} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">Fermer</button>
                  </div>
                ) : adFormLocked ? (
                  <div>
                    <div className="flex items-center gap-2 mb-5">
                      <span className={`text-xs font-medium px-3 py-1 rounded-full border ${adStatusBadge[latestAdStatus]?.className}`}>{adStatusBadge[latestAdStatus]?.label}</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                      {latestAd.imageUrl && <img src={latestAd.imageUrl} alt="" className="w-full max-h-48 object-cover rounded-lg mb-3" />}
                      <p className="text-white">{latestAd.message}</p>
                      {latestAdStatus === 'ACTIVE' && (
                        <p className="text-neutral-500 text-xs mt-3">Diffusée jusqu'au {adFormatDate(latestAd.expiresAt)}.</p>
                      )}
                      {latestAdStatus === 'PENDING' && (
                        <p className="text-neutral-500 text-xs mt-3">Paiement en attente de confirmation par notre équipe — la diffusion démarrera automatiquement dès validation.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {latestAd && (latestAdStatus === 'REJECTED' || latestAdStatus === 'EXPIRED' || latestAdStatus === 'CANCELLED') && (
                      <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3.5">
                        <span className={`text-xs font-medium px-3 py-1 rounded-full border flex-shrink-0 ${adStatusBadge[latestAdStatus]?.className}`}>{adStatusBadge[latestAdStatus]?.label}</span>
                        <p className="text-sm text-neutral-400">Dernière campagne : "{latestAd.message}" — vous pouvez en lancer une nouvelle ci-dessous.</p>
                      </div>
                    )}

                    {!adPaymentMethod ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-neutral-400">Message de la publicité</label>
                          <textarea maxLength={150} rows={3} placeholder="Ex: Nouvelle station Clean Car Galsen à Sacré-Cœur, -15% pour toute réservation cette semaine !"
                            value={adMessage} onChange={e => setAdMessage(e.target.value)}
                            className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 resize-none" />
                          <p className="text-neutral-500 text-xs text-right">{adMessage.length}/150</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-neutral-400">Image <span className="text-neutral-600">(optionnel)</span></label>
                          {adImage ? (
                            <div className="relative w-fit">
                              <img src={adImage} alt="" className="max-h-40 rounded-xl border border-white/10" />
                              <button type="button" onClick={handleRemoveAdImage} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-400 text-white rounded-full p-1"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ) : (
                            <label className="cursor-pointer inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors">
                              <Camera className="w-4 h-4" /> Ajouter une image
                              <input type="file" accept="image/*" onChange={handleAdImageUpload} className="hidden" />
                            </label>
                          )}
                          {adImageError && <p className="text-red-400 text-xs">{adImageError}</p>}
                        </div>
                        <button type="button" disabled={!adMessage.trim()} onClick={() => setAdPaymentMethod('choose')}
                          className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-xl transition-colors">
                          Continuer vers le paiement — {AD_CAMPAIGN_PRICE.toLocaleString('fr-FR')} FCFA
                        </button>
                      </>
                    ) : adPaymentMethod === 'choose' ? (
                      <div className="space-y-3">
                        <button type="button" onClick={() => setAdPaymentMethod(null)} className="text-xs text-neutral-400 hover:text-white transition-colors mb-2">← Revenir au message</button>
                        <button type="button" onClick={() => setAdPaymentMethod('wave')}
                          className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#1DC8E0]/50 hover:bg-[#1DC8E0]/10 transition-colors text-left">
                          <div className="w-11 h-11 rounded-xl bg-[#1DC8E0]/20 flex items-center justify-center flex-shrink-0"><Smartphone className="w-5 h-5 text-[#1DC8E0]" /></div>
                          <div className="flex-1"><p className="text-white font-bold">Wave</p><p className="text-neutral-500 text-xs">Payer {AD_CAMPAIGN_PRICE.toLocaleString('fr-FR')} FCFA</p></div>
                        </button>
                        <button type="button" onClick={() => setAdPaymentMethod('orange_money')}
                          className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#FF7900]/50 hover:bg-[#FF7900]/10 transition-colors text-left">
                          <div className="w-11 h-11 rounded-xl bg-[#FF7900]/20 flex items-center justify-center flex-shrink-0"><Smartphone className="w-5 h-5 text-[#FF7900]" /></div>
                          <div className="flex-1"><p className="text-white font-bold">Orange Money</p><p className="text-neutral-500 text-xs">Payer {AD_CAMPAIGN_PRICE.toLocaleString('fr-FR')} FCFA</p></div>
                        </button>
                      </div>
                    ) : adSubmitting ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                        <p className="text-neutral-300 text-sm">Enregistrement du paiement...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <button type="button" onClick={() => setAdPaymentMethod('choose')} className="text-xs text-neutral-400 hover:text-white transition-colors">← Changer de mode de paiement</button>
                        <div>
                          <label className="block text-sm font-medium text-neutral-400 mb-1.5">Numéro {adPaymentMethod === 'wave' ? 'Wave' : 'Orange Money'} <span className="text-red-400">*</span></label>
                          <input type="tel" placeholder="+221 77 000 00 00" value={adPaymentPhone}
                            onChange={(e) => setAdPaymentPhone(e.target.value)}
                            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors" />
                        </div>
                        {adError && <p className="text-sm text-red-400">{adError}</p>}
                        <button type="button" onClick={handleSubmitAd} disabled={adPaymentPhone.trim().length < 6}
                          className={`w-full font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-white disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed ${adPaymentMethod === 'wave' ? 'bg-[#1DC8E0] hover:bg-[#17aec3]' : 'bg-[#FF7900] hover:bg-[#e56b00]'}`}>
                          <Smartphone className="w-5 h-5" /> Payer {AD_CAMPAIGN_PRICE.toLocaleString('fr-FR')} FCFA via {adPaymentMethod === 'wave' ? 'Wave' : 'Orange Money'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {stationAds.length > 0 && (
                  <div className="mt-10 pt-6 border-t border-white/10">
                    <h3 className="text-sm font-bold text-neutral-400 mb-4">Historique des campagnes</h3>
                    <div className="space-y-2">
                      {stationAds.map((ad) => {
                        const status = deriveAdStatus(ad);
                        const badge = adStatusBadge[status] || adStatusBadge.PENDING;
                        return (
                          <div key={ad.id} className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-white text-sm truncate">{ad.message}</p>
                              <p className="text-neutral-500 text-xs">{adFormatDate(ad.createdAt)}</p>
                            </div>
                            <span className={`text-xs font-medium px-3 py-1 rounded-full border flex-shrink-0 ${badge.className}`}>{badge.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'securite' && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Sécurité du compte</h2>
                <p className="text-neutral-400 mb-6 pb-4 border-b border-white/10">Gérez l'accès et réinitialisez les données de votre station.</p>

                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-blue-400" /> Identifiants de connexion</h3>
                <form onSubmit={handleChangeCredentials} className="space-y-4 mb-10 max-w-xl">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email de connexion</label>
                    <input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Mot de passe actuel</label>
                    <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Requis pour confirmer tout changement"
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-neutral-400">Nouveau mot de passe</label>
                      <input type="password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        placeholder="Laisser vide pour ne pas changer"
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-neutral-400">Confirmer le nouveau mot de passe</label>
                      <input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  {credentialsError && <p className="text-sm text-red-400">{credentialsError}</p>}
                  <div className="flex items-center gap-3 pt-1">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
                      Mettre à jour les identifiants
                    </button>
                    {credentialsSaved && (
                      <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Identifiants mis à jour</span>
                    )}
                  </div>
                </form>

                {/* Section réinitialisation */}
                <h3 className="text-xl font-bold text-white mb-2 border-t border-white/10 pt-6">Gestion des données</h3>
                <p className="text-neutral-400 text-sm mb-6">Choisissez le niveau de nettoyage adapté à votre situation.</p>

                {/* Rapport de nettoyage */}
                {cleanReport !== null && (
                  <div className={`mb-6 rounded-xl p-4 border ${cleanReport.length === 1 && cleanReport[0].includes('propres') ? 'bg-emerald-950/30 border-emerald-500/20' : 'bg-blue-950/30 border-blue-500/20'}`}>
                    <p className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Rapport de nettoyage
                    </p>
                    <ul className="space-y-1">
                      {cleanReport.map((msg, i) => (
                        <li key={i} className="text-sm text-neutral-300 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                          {msg}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-4">
                  {/* ✅ NETTOYAGE CIBLÉ — RECOMMANDÉ */}
                  <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-bold mb-1 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 
                        Effacer uniquement les données fictives
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">Recommandé</span>
                      </h4>
                      <p className="text-neutral-400 text-sm">Supprime <strong className="text-white">uniquement</strong> : Amadou D., Fatou S., Oumar N., Moussa Diop, Alioune Fall et le profil "Auto Clean VIP". Vos vraies données sont préservées.</p>
                    </div>
                    <button
                      onClick={handleCleanDemo}
                      className="ml-4 flex-shrink-0 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-500/30 text-emerald-300 hover:text-white rounded-xl transition-all font-bold text-sm whitespace-nowrap"
                    >
                      Nettoyer
                    </button>
                  </div>

                  {/* ⚠️ Reset données opérationnelles */}
                  <div className="bg-orange-950/30 border border-orange-500/20 rounded-xl p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-bold mb-1 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-orange-400" /> Vider l'historique opérationnel
                      </h4>
                      <p className="text-neutral-400 text-sm">Supprime <strong className="text-white">toute</strong> la file, l'historique et les transactions (réelles et fictives). Profil et tarifs conservés.</p>
                    </div>
                    <button
                      onClick={handleReset}
                      className="ml-4 flex-shrink-0 px-4 py-2 bg-orange-500/20 hover:bg-orange-500 border border-orange-500/30 text-orange-300 hover:text-white rounded-xl transition-all font-medium text-sm whitespace-nowrap"
                    >
                      Vider tout
                    </button>
                  </div>

                  {/* 🔴 Reset complet */}
                  <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-bold mb-1 flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-red-400" /> Réinitialisation complète
                      </h4>
                      <p className="text-neutral-400 text-sm">Efface <strong className="text-white">TOUT</strong> — profil, tarifs, employés, historique. Repart entièrement de zéro.</p>
                    </div>
                    <button
                      onClick={handleFullReset}
                      className="ml-4 flex-shrink-0 px-4 py-2 bg-red-500/20 hover:bg-red-600 border border-red-500/30 text-red-300 hover:text-white rounded-xl transition-all font-medium text-sm whitespace-nowrap"
                    >
                      Tout effacer
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
