import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import PageSuspense from '../ui/PageSuspense';
import { LayoutDashboard, Building2, CreditCard, LifeBuoy, BarChart3, Users, Settings as SettingsIcon, Crown, Megaphone, Send, FileBarChart, Boxes, Briefcase, Fuel, Wallet, BellRing, Newspaper, Share2 } from 'lucide-react';
import { getCurrentRole, clearSession } from '../../lib/accounts';
import { supabase } from '../../lib/supabaseClient';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import SuperUserNotifBell from '../superadmin/SuperUserNotifBell';
import AppShell from './AppShell';
import { groupPayoutsByStation } from '../../lib/payouts';
import { stationDueDate, daysUntil, reminderState } from '../../lib/subscriptionReminders';

// Sections du menu (titres affichés par AppShell), sur le modèle de l'espace
// station (lib/adminNav.js) : les entrées d'une même section se suivent.
const PILOTAGE = 'Pilotage';
const RESEAU = 'Réseau';
const AUTOMOBILISTES = 'Automobilistes';
const MARKETING = 'Marketing';
const FINANCES = 'Finances';
const ADMINISTRATION = 'Administration';

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export default function SuperAdminLayout() {
  const location = useLocation();
  const { superUserSubscriptions, stationAds, lavagePayments, stations } = useSuperAdminState();
  const [accountName, setAccountName] = useState('');
  const [newMessages, setNewMessages] = useState(0);
  const stationsToRemindCount = (stations || []).filter((s) => { const d = stationDueDate(s); return d && reminderState(daysUntil(d)) === 'due'; }).length;
  const stationsToPayCount = groupPayoutsByStation(lavagePayments || []).filter((g) => g.pendingTotal > 0).length;
  const pendingSuperUserCount = superUserSubscriptions.filter((s) => s.status === 'PENDING').length;
  const pendingAdsCount = stationAds.filter((a) => a.status === 'PENDING').length;

  useEffect(() => {
    if (getCurrentRole() !== 'super_admin') {
      window.location.href = '/login.html';
    }
  }, []);

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

  // Messages du formulaire Contact pas encore traités (pastille « Affiliés ») :
  // relu à chaque changement de page et après un « Marquer traité » (Affiliates.jsx).
  useEffect(() => {
    let cancelled = false;
    const count = () => supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'nouveau')
      .then(({ count: n, error }) => { if (!cancelled && !error) setNewMessages(n || 0); });
    count();
    window.addEventListener('ccg:contact-messages-changed', count);
    return () => { cancelled = true; window.removeEventListener('ccg:contact-messages-changed', count); };
  }, [location.pathname]);

  const amber = (count, one, many) => [{ count, tone: 'amber', label: plural(count, one, many) }];
  const navigation = [
    // ─── Pilotage ───
    { name: 'Vue d\'ensemble', href: '/superadmin', icon: LayoutDashboard, section: PILOTAGE },
    { name: 'Analytique', href: '/superadmin/analytics', icon: BarChart3, section: PILOTAGE },
    { name: 'Carburant', href: '/superadmin/carburant', icon: Fuel, section: PILOTAGE },
    { name: 'Bilan', href: '/superadmin/bilan', icon: FileBarChart, section: PILOTAGE },
    // ─── Réseau ───
    { name: 'Stations', href: '/superadmin/stations', icon: Building2, section: RESEAU },
    { name: 'Groupes', href: '/superadmin/groupes', icon: Briefcase, section: RESEAU },
    { name: 'Modules', href: '/superadmin/modules', icon: Boxes, section: RESEAU },
    // ─── Automobilistes ───
    { name: 'Automobilistes', href: '/superadmin/automobilistes', icon: Users, section: AUTOMOBILISTES },
    { name: 'Abonnements Super User', href: '/superadmin/super-users', icon: Crown, badges: amber(pendingSuperUserCount, 'paiement à confirmer', 'paiements à confirmer'), section: AUTOMOBILISTES },
    // ─── Marketing ───
    // Affiliés : provenance des visiteurs et des messages (réseaux sociaux, liens d'affiliés).
    { name: 'Affiliés', href: '/superadmin/affilies', icon: Share2, badges: [{ count: newMessages, tone: 'blue', label: plural(newMessages, 'message à traiter', 'messages à traiter') }], section: MARKETING },
    { name: 'Publicités', href: '/superadmin/ads', icon: Megaphone, badges: amber(pendingAdsCount, 'publicité à valider', 'publicités à valider'), section: MARKETING },
    { name: 'Annonces', href: '/superadmin/annonces', icon: Send, section: MARKETING },
    { name: "Bandeau d'accueil", href: '/superadmin/bandeau', icon: Newspaper, section: MARKETING },
    // ─── Finances ───
    { name: 'Facturation', href: '/superadmin/billing', icon: CreditCard, section: FINANCES },
    { name: 'Reversements', href: '/superadmin/reversements', icon: Wallet, badges: amber(stationsToPayCount, 'station à payer', 'stations à payer'), section: FINANCES },
    { name: 'Relances', href: '/superadmin/relances', icon: BellRing, badges: amber(stationsToRemindCount, 'station à relancer', 'stations à relancer'), section: FINANCES },
    // ─── Administration ───
    { name: 'Support', href: '/superadmin/support', icon: LifeBuoy, section: ADMINISTRATION },
    { name: 'Paramètres', href: '/superadmin/settings', icon: SettingsIcon, section: ADMINISTRATION },
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
      user={accountName ? { name: accountName, subtitle: 'Super Admin' } : null}
      onLogout={handleLogout}
      actions={<SuperUserNotifBell />}
      glows={['bg-purple-600/10', 'bg-blue-600/10']}
      brandIcon={(
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-purple-500/20 overflow-hidden">
          <img src="/icons/icon-192.png" alt="Clean Car Galsen" className="w-full h-full object-cover" />
        </div>
      )}
      brandText={(
        <span className="font-bold text-[15px] leading-tight tracking-tight truncate block text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400">
          Super Admin
        </span>
      )}
      brandSub={(
        <span className="flex items-center gap-1.5 text-[11.5px] text-neutral-400 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-purple-400" />
          <span className="truncate">Plateforme · {plural((stations || []).length, 'station', 'stations')}</span>
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
