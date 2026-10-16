import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import PageSuspense from '../ui/PageSuspense';
import { useAppState } from '../../hooks/useAppState';
import { clearSession, getCurrentRole, getCurrentStationId, getIsGroupOwner, refreshStationFromProfile } from '../../lib/accounts';
import { visibleNav } from '../../lib/adminNav';
import AnnouncementBell from '../ui/AnnouncementBell';
import AppShell from './AppShell';
import { isSubscriptionEnded } from '../../lib/stationRenewal';
import { setSessionExpiredHandler } from '../../lib/idleTimeout';
import StationOnboarding from '../onboarding/StationOnboarding';
import SessionLockOverlay from '../SessionLockOverlay';
import TrialBanner from './TrialBanner';
import StationTransferBanner from './StationTransferBanner';
import GroupStationBanners from './GroupStationBanners';
import ClosurePendingScreen, { useMyClosure } from '../account/ClosurePendingScreen';
import { exportStationData } from '../../lib/rgpdExport';
import { supabase } from '../../lib/supabaseClient';
import { openStation } from '../../lib/groups';
import { SERVICE_STATION_LABEL, isServiceStationPlan } from '../../lib/offers';
import { stockLevel } from '../../lib/shop';

// Statut affiché sous le nom de la station (pastille + libellé).
const SUBSCRIPTION_STATUS = {
  a_jour: { label: 'Abonnement actif', dot: 'bg-emerald-400' },
  essai: { label: 'Essai gratuit', dot: 'bg-amber-400' },
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionLocked, setSessionLocked] = useState(false);
  const {
    stationProfile, stationProfileLoaded, stationBilling, myPermissions, myRoleName, hiddenMenu,
    receivedAnnouncements, dismissedAnnouncementIds, dismissAnnouncement,
    queue, shopOrders,
  } = useAppState();
  const [accountName, setAccountName] = useState('');
  const [stockAlerts, setStockAlerts] = useState(0);
  const closure = useMyClosure(); // station (ou compte) en cours de fermeture : accès suspendu

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

  // Menu = catalogue partagé (lib/adminNav.js) filtré par permission du compte,
  // forfait/module de la station, puis rubriques que la station a masquées
  // (Paramètres > Menu). Tant que les permissions ne sont pas chargées (staff),
  // on n'affiche que les entrées libres — le propriétaire a ['*'] dès le premier
  // rendu, donc aucun flash.
  const baseNav = visibleNav({ permissions: myPermissions, billing: stationBilling, hiddenMenu });
  const showsShop = baseNav.some((item) => item.key === 'shop');

  // Nom du compte connecté (carte en pied de menu).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle();
      if (!cancelled) setAccountName(data?.full_name?.trim() || data?.email || user.email || '');
    })();
    return () => { cancelled = true; };
  }, []);

  // Produits épuisés ou en stock bas (pastille « Boutique ») : relu à chaque
  // changement de page, ce qui suffit à suivre une vente ou un réassort.
  useEffect(() => {
    const stationId = getCurrentStationId();
    if (!showsShop || !stationId || stationId === 'default') { setStockAlerts(0); return undefined; }
    let cancelled = false;
    supabase.from('shop_products').select('stock, low_stock_threshold').eq('station_id', stationId).not('stock', 'is', null)
      .then(({ data, error }) => {
        if (!cancelled && !error) setStockAlerts((data || []).filter((p) => ['out', 'low'].includes(stockLevel(p))).length);
      });
    return () => { cancelled = true; };
  }, [showsShop, location.pathname]);

  // Pastilles : véhicules en attente, commandes boutique à traiter, alertes de stock.
  const waitingCount = (queue || []).length;
  const ordersToHandle = (shopOrders || []).filter((o) => o.status === 'confirmee').length;
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const navigation = baseNav.map((item) => {
    if (item.key === 'queue') return { ...item, badges: [{ count: waitingCount, tone: 'blue', label: plural(waitingCount, 'véhicule en attente', 'véhicules en attente') }] };
    if (item.key === 'shop') {
      return { ...item, badges: [
        { count: ordersToHandle, tone: 'blue', label: plural(ordersToHandle, 'commande à traiter', 'commandes à traiter') },
        { count: stockAlerts, tone: 'amber', label: plural(stockAlerts, 'alerte de stock', 'alertes de stock') },
      ] };
    }
    return item;
  });

  const planLabel = stationBilling ? (isServiceStationPlan(stationBilling.plan) ? SERVICE_STATION_LABEL : `Offre ${stationBilling.plan}`) : null;
  const status = stationBilling ? SUBSCRIPTION_STATUS[stationBilling.subscriptionStatus] : null;

  if (closure) {
    return <ClosurePendingScreen closure={closure} onExport={() => exportStationData(getCurrentStationId(), stationProfile?.name)} exportLabel="Télécharger les données de la station (ZIP)" />;
  }

  const handleLogout = () => {
    clearSession();
    // Redirection directe vers la page d'accueil (chemin absolu)
    window.location.replace(window.location.origin + '/index.html');
  };

  const bell = (
    <AnnouncementBell
      announcements={receivedAnnouncements}
      dismissedIds={dismissedAnnouncementIds}
      onDismiss={dismissAnnouncement}
      label="Annonces de la plateforme"
      emptyLabel="Aucune annonce de la plateforme pour le moment."
    />
  );

  return (
    <AppShell
      accent="blue"
      activeLayoutId="activeTab"
      nav={navigation}
      user={accountName ? { name: accountName, subtitle: myRoleName || 'Compte station' } : null}
      onLogout={handleLogout}
      actions={bell}
      glows={['bg-blue-600/10', 'bg-emerald-600/10']}
      overlays={(
        <>
          {sessionLocked && <SessionLockOverlay stationName={stationProfile?.name} />}
          {/* Onboarding station : uniquement pour le propriétaire (role='admin'),
              jamais pour un collaborateur 'staff'. */}
          {getCurrentRole() === 'admin' && <StationOnboarding />}
        </>
      )}
      brandIcon={(
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-blue-500/20 overflow-hidden">
          <img src={stationProfile?.logo || '/icons/icon-192.png'} alt="Logo" className="w-full h-full object-cover" />
        </div>
      )}
      brandText={stationName === null ? (
        <div className="h-5 w-28 rounded bg-white/10 animate-pulse" />
      ) : (
        <span className={`font-bold text-[15px] leading-tight tracking-tight truncate block ${
          isConfigured ? 'text-white' : 'text-orange-400'
        }`}>{stationName}</span>
      )}
      brandSub={planLabel && (
        <span className="flex items-center gap-1.5 text-[11.5px] text-neutral-400 min-w-0" title={status?.label}>
          {status && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.dot}`} />}
          <span className="truncate">{planLabel}</span>
        </span>
      )}
      mobileBrand={(
        <>
          <img
            src={stationProfile?.logo || '/icons/icon-192.png'}
            alt="Logo"
            className="w-6 h-6 rounded-md object-cover mr-2 flex-shrink-0"
          />
          {stationName === null ? (
            <div className="h-5 w-28 rounded bg-white/10 animate-pulse" />
          ) : (
            <span className={`font-bold text-lg truncate ${!isConfigured ? 'text-orange-400' : ''}`}>{stationName}</span>
          )}
        </>
      )}
    >
      <StationTransferBanner />
      <GroupStationBanners stationName={stationProfile?.name} />
      <TrialBanner billing={stationBilling} />

      <div className="relative z-10 min-h-full">
        <PageSuspense><Outlet /></PageSuspense>
      </div>
    </AppShell>
  );
}
