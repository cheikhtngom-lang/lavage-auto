import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppState } from '../../hooks/useAppState';
import { clearSession, getCurrentRole, getCurrentStationId, getIsGroupOwner, refreshStationFromProfile } from '../../lib/accounts';
import { visibleNav } from '../../lib/adminNav';
import AnnouncementBell from '../ui/AnnouncementBell';
import { isSubscriptionEnded } from '../../lib/stationRenewal';
import { setSessionExpiredHandler } from '../../lib/idleTimeout';
import StationOnboarding from '../onboarding/StationOnboarding';
import SessionLockOverlay from '../SessionLockOverlay';
import TrialBanner from './TrialBanner';
import StationTransferBanner from './StationTransferBanner';
import GroupStationBanners from './GroupStationBanners';
import { supabase } from '../../lib/supabaseClient';
import { openStation } from '../../lib/groups';

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);
  const {
    stationProfile, stationProfileLoaded, stationBilling, myPermissions, hiddenMenu,
    receivedAnnouncements, dismissedAnnouncementIds, dismissAnnouncement,
  } = useAppState();

  // La session station qui expire pour inactivité n'éjecte plus vers la page
  // de connexion : on affiche un écran verrouillé qui continue de surveiller
  // la file et de biper (voir SessionLockOverlay + lib/idleTimeout.js).
  useEffect(() => {
    setSessionExpiredHandler(() => setSessionLocked(true));
    return () => setSessionExpiredHandler(null);
  }, []);
  const isConfigured = stationProfile?.name && stationProfile.name.trim() !== '';
  // Tant que le profil n'a pas fini de charger, ne JAMAIS afficher "⚙️
  // Configurer" — le nom vide par défaut ne veut pas dire "non configurée",
  // juste "pas encore reçue" (voir stationProfileLoaded, useAppState.jsx).
  const stationName = !stationProfileLoaded ? null : (isConfigured ? stationProfile.name : '⚙️ Configurer');

  // Accès réservé à un compte station connecté (propriétaire ou collaborateur).
  useEffect(() => {
    const role = getCurrentRole();
    if (role !== 'admin' && role !== 'staff') {
      window.location.href = '/login.html';
      return;
    }
    // Chef d'entreprise (Sur mesure) sans station ouverte : son espace est /groupe.
    if (getIsGroupOwner() && (!getCurrentStationId() || getCurrentStationId() === 'default')) {
      window.location.href = '/groupe';
    }
  }, []);

  // Un collaborateur (ex. Super Admin de station) peut avoir été déplacé vers une
  // autre station par le chef d'entreprise pendant qu'il est connecté : la base
  // le sait déjà, pas le cache local — on le recale et on recharge l'interface.
  useEffect(() => {
    if (getCurrentRole() !== 'staff') return;
    refreshStationFromProfile().then((changed) => { if (changed) window.location.reload(); });
  }, []);

  // Chef d'entreprise (Sur mesure) : l'accès aux données de la station passe
  // par profiles.station_id (current_station_id(), RLS). Or passer par /groupe
  // (autre onglet, bouton Retour du téléphone…) le remet à null, et ouvrir une
  // autre station dans un autre onglet le déplace : cet onglet continuait alors
  // d'afficher sa station, mais chaque ajout/encaissement était refusé ou
  // restait sans effet. À chaque retour sur l'onglet, on ré-ouvre donc la
  // station affichée ici ; si la base n'était plus dessus, on recharge.
  useEffect(() => {
    if (!getIsGroupOwner()) return undefined;
    const stationId = getCurrentStationId();
    if (!stationId || stationId === 'default') return undefined;
    let busy = false;
    const resync = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { data, error } = await supabase.from('profiles').select('station_id').eq('id', user.id).maybeSingle();
        if (error || String(data?.station_id || '') === stationId) return;
        try {
          await openStation(stationId);
          window.location.reload();
        } catch {
          // Station retirée/archivée du groupe entre-temps : retour à l'espace du groupe.
          window.location.href = '/groupe';
        }
      } finally {
        busy = false;
      }
    };
    resync();
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('pageshow', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('pageshow', resync);
    };
  }, []);

  // Abonnement terminé (impayé, ou essai gratuit écoulé) : plus aucun accès
  // au tableau de bord tant qu'elle n'a pas renouvelé (voir SubscriptionEnded.jsx
  // et isSubscriptionEnded, lib/stationRenewal.js). `stationBilling` démarre à
  // null le temps du chargement — on attend qu'il soit chargé avant de juger.
  useEffect(() => {
    if (stationBilling && isSubscriptionEnded(stationBilling)) {
      navigate('/admin/renouveler', { replace: true });
    }
  }, [stationBilling, navigate]);

  // La visite guidée (GuidedTour) a besoin que la sidebar soit visible pour
  // pouvoir surligner ses éléments — sur mobile elle est hors-écran tant que
  // ce menu n'est pas ouvert.
  useEffect(() => {
    const open = () => setIsMobileMenuOpen(true);
    window.addEventListener('ccg:open-mobile-nav', open);
    return () => window.removeEventListener('ccg:open-mobile-nav', open);
  }, []);

  // Menu = catalogue partagé (lib/adminNav.js) filtré par permission du compte,
  // forfait/module de la station, puis rubriques que la station a masquées
  // (Paramètres > Menu). Tant que les permissions ne sont pas chargées (staff),
  // on n'affiche que les entrées libres — le propriétaire a ['*'] dès le premier
  // rendu, donc aucun flash.
  const navigation = visibleNav({ permissions: myPermissions, billing: stationBilling, hiddenMenu });

  const handleLogout = () => {
    clearSession();
    // Redirection directe vers la page d'accueil (chemin absolu)
    window.location.replace(window.location.origin + '/index.html');
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-white overflow-hidden font-sans">
      {sessionLocked && <SessionLockOverlay stationName={stationProfile?.name} />}

      {/* Onboarding station : uniquement pour le propriétaire (role='admin'),
          jamais pour un collaborateur 'staff'. */}
      {getCurrentRole() === 'admin' && <StationOnboarding />}

      {/* Header Mobile */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10 z-30 flex items-center px-4">
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 bg-white/5 rounded-lg text-neutral-300 hover:text-white mr-4"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="flex items-center">
          <img
            src={stationProfile?.logo || '/icons/icon-192.png'}
            alt="Logo"
            className="w-6 h-6 rounded-md object-cover mr-2 flex-shrink-0"
          />
          {stationName === null ? (
            <div className="h-5 w-28 rounded bg-white/10 animate-pulse" />
          ) : (
            <span className={`font-bold text-lg truncate max-w-[160px] ${!isConfigured ? 'text-orange-400' : ''}`}>{stationName}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AnnouncementBell
            announcements={receivedAnnouncements}
            dismissedIds={dismissedAnnouncementIds}
            onDismiss={dismissAnnouncement}
            label="Annonces de la plateforme"
            emptyLabel="Aucune annonce de la plateforme pour le moment."
          />
        </div>
      </div>

      {/* Overlay Mobile */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar liquide flottante */}
      <motion.aside
        initial={false}
        animate={{ x: isMobileMenuOpen ? 0 : (window.innerWidth < 768 ? -300 : 0) }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`fixed md:relative top-0 left-0 md:top-4 md:left-4 h-full md:h-[calc(100%-2rem)] w-64 md:rounded-[28px] border-r md:border border-white/5 md:border-white/10 bg-neutral-950/95 md:bg-white/[0.06] backdrop-blur-3xl flex flex-col z-50 transform md:transform-none transition-transform duration-300 md:shadow-2xl md:shadow-black/40 overflow-hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Reflet lumineux du verre */}
        <div className="hidden md:block absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
        <div className="hidden md:block absolute -top-24 left-1/2 -translate-x-1/2 w-40 h-40 bg-white/[0.04] rounded-full blur-3xl pointer-events-none" />

        <div className="h-20 flex items-center px-6 border-b border-white/5 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mr-3 shadow-lg shadow-blue-500/20 overflow-hidden flex-shrink-0">
            <img src={stationProfile?.logo || '/icons/icon-192.png'} alt="Logo" className="w-full h-full object-cover" />
          </div>
          {stationName === null ? (
            <div className="h-5 w-28 rounded bg-white/10 animate-pulse" />
          ) : (
            <span className={`font-bold text-lg tracking-wide truncate max-w-[140px] ${
              isConfigured
                ? 'text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400'
                : 'text-orange-400'
            }`}>{stationName}</span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-2 relative z-10">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                data-tour={item.tourId}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative flex items-center px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 overflow-hidden group",
                  isActive
                    ? "text-white"
                    : "text-neutral-400 hover:text-white"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-white/10 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.25)] ring-1 ring-white/10"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}

                {/* Glow effect on hover for inactive items */}
                {!isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:via-transparent transition-all duration-500 rounded-2xl"></div>
                )}

                <item.icon className={cn("w-5 h-5 mr-3 relative z-10 transition-colors", isActive ? "text-emerald-400" : "text-neutral-500 group-hover:text-blue-400")} />
                <span className="relative z-10">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 relative z-10">
          <button
            onClick={handleLogout}
            className="flex w-full items-center px-4 py-3 text-sm font-medium text-neutral-400 rounded-2xl hover:bg-red-500/10 hover:text-red-400 transition-colors group"
          >
            <LogOut className="w-5 h-5 mr-3 group-hover:text-red-400 transition-colors" />
            Déconnexion
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
        {/* Animated Background Gradients */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="hidden md:flex items-center justify-end gap-3 h-16 px-8 sticky top-0 z-20 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
          <AnnouncementBell
            announcements={receivedAnnouncements}
            dismissedIds={dismissedAnnouncementIds}
            onDismiss={dismissAnnouncement}
            label="Annonces de la plateforme"
            emptyLabel="Aucune annonce de la plateforme pour le moment."
          />
        </div>

        <StationTransferBanner />
        <GroupStationBanners stationName={stationProfile?.name} />
        <TrialBanner billing={stationBilling} />

        <div className="relative z-10 min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
