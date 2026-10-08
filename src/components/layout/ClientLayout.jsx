import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import PageSuspense from '../ui/PageSuspense';
import { LayoutDashboard, Car, MapPin, Building2, Settings as SettingsIcon, Droplets, Crown, Gift, ShoppingBag } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useClientAccount } from '../../hooks/useClientAccount';
import ClosurePendingScreen, { useMyClosure } from '../account/ClosurePendingScreen';
import { exportClientOwnData } from '../../lib/rgpdExport';
import { clearSession } from '../../lib/accounts';
import ClientOnboarding from '../onboarding/ClientOnboarding';
import SuperUserWelcomeOverlay from '../client/SuperUserWelcomeOverlay';
import AnnouncementBell from '../ui/AnnouncementBell';
import AnnouncementPopup from '../ui/AnnouncementPopup';
import AppShell from './AppShell';

export default function ClientLayout() {
  const { account, loading, superUserStatus, stationAnnouncements, dismissAnnouncement } = useClientAccount();
  const isSuperUser = superUserStatus === 'ACTIVE';
  const closure = useMyClosure(); // fermeture de compte programmée (add_account_closure.sql)

  // Pas de compte automobiliste connecté : direction la page de connexion
  // (login.html — page statique hors du routeur React). On attend la fin du
  // chargement Supabase avant de conclure à une absence de session, sinon
  // un rafraîchissement de page redirige à tort pendant la première requête.
  useEffect(() => {
    if (!loading && !account) {
      window.location.href = '/login.html';
    }
  }, [loading, account]);

  const navigation = [
    { name: "Vue d'ensemble", href: '/dashboard', icon: LayoutDashboard, tourId: 'client-nav-overview' },
    { name: 'Fidélité', href: '/dashboard/fidelite', icon: Gift },
    { name: 'Mes Stations', href: '/dashboard/mes-stations', icon: Building2 },
    { name: 'Boutique', href: '/dashboard/boutique', icon: ShoppingBag },
    { name: 'Trouver une station', href: '/dashboard/stations', icon: MapPin, tourId: 'client-nav-stations' },
    { name: 'Mon Parking', href: '/dashboard/garage', icon: Car, tourId: 'client-nav-garage' },
    { name: 'Paramètres', href: '/dashboard/parametres', icon: SettingsIcon, tourId: 'client-nav-settings' },
  ];

  const handleLogout = () => {
    clearSession();
    window.location.replace(window.location.origin + '/index.html');
  };

  if (!account) return null;
  if (closure) return <ClosurePendingScreen closure={closure} onExport={() => exportClientOwnData(account.id, account.name)} />;

  return (
    <AppShell
      accent="blue"
      activeLayoutId="activeClientTab"
      nav={navigation}
      onLogout={handleLogout}
      glows={['bg-blue-600/10', 'bg-emerald-600/10']}
      overlays={(
        <>
          <ClientOnboarding />
          <SuperUserWelcomeOverlay />
          <AnnouncementPopup
            announcements={stationAnnouncements}
            dismissedIds={account.dismissedAnnouncementIds || []}
            onDismiss={dismissAnnouncement}
          />
        </>
      )}
      actions={(
        <AnnouncementBell
          announcements={stationAnnouncements}
          dismissedIds={account.dismissedAnnouncementIds || []}
          onDismiss={dismissAnnouncement}
          label="Annonces de vos stations"
          emptyLabel="Aucune annonce de vos stations pour le moment."
        />
      )}
      brandIcon={(
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shadow-lg overflow-hidden',
          isSuperUser ? 'bg-gradient-to-tr from-amber-400 to-orange-500 shadow-amber-500/30 ring-2 ring-amber-400/60' : 'bg-gradient-to-tr from-blue-600 to-emerald-500 shadow-blue-500/20'
        )}>
          {account.photoUrl ? (
            <img src={account.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : isSuperUser ? (
            <Crown className="w-5 h-5 text-white" />
          ) : (
            <Droplets className="w-5 h-5 text-white" />
          )}
        </div>
      )}
      brandText={(
        <>
          <span className={cn(
            'font-bold text-lg tracking-wide truncate block text-transparent bg-clip-text',
            isSuperUser ? 'bg-gradient-to-r from-amber-300 to-orange-400' : 'bg-gradient-to-r from-white to-neutral-400'
          )}>
            {account.name}
          </span>
          {isSuperUser && (
            <span className="text-[10px] font-bold text-amber-400 tracking-wider flex items-center gap-1">
              <Crown className="w-3 h-3" /> SUPER USER
            </span>
          )}
        </>
      )}
      mobileBrand={(
        <>
          {account.photoUrl ? (
            <img src={account.photoUrl} alt="" className={cn('w-7 h-7 rounded-full object-cover mr-2 flex-shrink-0', isSuperUser && 'ring-2 ring-amber-400')} />
          ) : isSuperUser ? (
            <Crown className="w-6 h-6 text-amber-400 mr-2 flex-shrink-0" />
          ) : (
            <Droplets className="w-6 h-6 text-blue-400 mr-2 flex-shrink-0" />
          )}
          <span className={cn('font-bold text-lg truncate', isSuperUser && 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400')}>{account.name}</span>
        </>
      )}
    >
      <div className="relative z-10 min-h-full">
        <PageSuspense><Outlet /></PageSuspense>
      </div>
    </AppShell>
  );
}
