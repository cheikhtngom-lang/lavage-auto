import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import PageSuspense from '../ui/PageSuspense';
import { LayoutDashboard, Building2, CreditCard, LifeBuoy, BarChart3, Users, Settings as SettingsIcon, Crown, Megaphone, Send, FileBarChart, Boxes, Briefcase, Fuel, Wallet } from 'lucide-react';
import { getCurrentRole, clearSession } from '../../lib/accounts';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import SuperUserNotifBell from '../superadmin/SuperUserNotifBell';
import AppShell from './AppShell';
import { groupPayoutsByStation } from '../../lib/payouts';

export default function SuperAdminLayout() {
  const { superUserSubscriptions, stationAds, lavagePayments } = useSuperAdminState();
  const stationsToPayCount = groupPayoutsByStation(lavagePayments || []).filter((g) => g.pendingTotal > 0).length;
  const pendingSuperUserCount = superUserSubscriptions.filter((s) => s.status === 'PENDING').length;
  const pendingAdsCount = stationAds.filter((a) => a.status === 'PENDING').length;

  useEffect(() => {
    if (getCurrentRole() !== 'super_admin') {
      window.location.href = '/login.html';
    }
  }, []);

  // `badge` : demandes en attente de validation, en pastille sur l'entrée.
  const navigation = [
    { name: 'Vue d\'ensemble', href: '/superadmin', icon: LayoutDashboard },
    { name: 'Analytique', href: '/superadmin/analytics', icon: BarChart3 },
    { name: 'Stations', href: '/superadmin/stations', icon: Building2 },
    { name: 'Groupes', href: '/superadmin/groupes', icon: Briefcase },
    { name: 'Modules', href: '/superadmin/modules', icon: Boxes },
    { name: 'Automobilistes', href: '/superadmin/automobilistes', icon: Users },
    { name: 'Abonnements Super User', href: '/superadmin/super-users', icon: Crown, badge: pendingSuperUserCount },
    { name: 'Publicités', href: '/superadmin/ads', icon: Megaphone, badge: pendingAdsCount },
    { name: 'Annonces', href: '/superadmin/annonces', icon: Send },
    { name: 'Facturation', href: '/superadmin/billing', icon: CreditCard },
    { name: 'Reversements', href: '/superadmin/reversements', icon: Wallet, badge: stationsToPayCount },
    { name: 'Carburant', href: '/superadmin/carburant', icon: Fuel },
    { name: 'Bilan', href: '/superadmin/bilan', icon: FileBarChart },
    { name: 'Support', href: '/superadmin/support', icon: LifeBuoy },
    { name: 'Paramètres', href: '/superadmin/settings', icon: SettingsIcon },
  ];

  const handleLogout = () => {
    clearSession();
    window.location.replace(window.location.origin + '/index.html');
  };

  return (
    <AppShell
      accent="purple"
      activeLayoutId="activeSuperAdminTab"
      nav={navigation}
      onLogout={handleLogout}
      actions={<SuperUserNotifBell />}
      glows={['bg-purple-600/10', 'bg-blue-600/10']}
      brandIcon={(
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-purple-500/20 overflow-hidden">
          <img src="/icons/icon-192.png" alt="Clean Car Galsen" className="w-full h-full object-cover" />
        </div>
      )}
      brandText={(
        <span className="font-bold text-lg tracking-wide truncate block text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400">
          Super Admin
        </span>
      )}
      mobileBrand={(
        <>
          <img src="/icons/icon-192.png" alt="Clean Car Galsen" className="w-6 h-6 rounded-md object-cover mr-2 flex-shrink-0" />
          <span className="font-bold text-lg truncate">Super Admin</span>
        </>
      )}
    >
      <div className="relative z-10 min-h-full">
        <PageSuspense><Outlet /></PageSuspense>
      </div>
    </AppShell>
  );
}
