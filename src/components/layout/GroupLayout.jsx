import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import PageSuspense from '../ui/PageSuspense';
import { Building2, ShoppingCart, CreditCard, Briefcase, LayoutDashboard, Sparkles, Calculator, Settings } from 'lucide-react';
import AppShell from './AppShell';
import { supabase } from '../../lib/supabaseClient';
import { clearSession, getCurrentRole, getIsGroupOwner } from '../../lib/accounts';
import ClosurePendingScreen, { useMyClosure } from '../account/ClosurePendingScreen';
import { exportMyGroupData } from '../../lib/rgpdExport';
import { closeStation, fetchMyGroup, fetchPlans, fetchDiscountTiers, GROUP_STATUS } from '../../lib/groups';

// Espace du chef d'entreprise (offre Sur mesure) — /groupe. Il ne dépend
// d'aucune station : le patron n'« entre » dans une station (bouton Ouvrir)
// que pour travailler dedans avec l'interface /admin habituelle.
const GroupContext = createContext(null);
export const useGroup = () => useContext(GroupContext);

const NAV = [
  { name: 'Tableau de bord', href: '/groupe', icon: LayoutDashboard, end: true },
  { name: 'Comptabilité', href: '/groupe/comptabilite', icon: Calculator },
  { name: 'Analyse IA', href: '/groupe/analyse', icon: Sparkles },
  { name: 'Mes stations', href: '/groupe/stations', icon: Building2 },
  { name: 'Nouvelle commande', href: '/groupe/commande', icon: ShoppingCart },
  { name: 'Facturation', href: '/groupe/facturation', icon: CreditCard },
  { name: 'Paramètres', href: '/groupe/parametres', icon: Settings },
];

export default function GroupLayout() {
  const [org, setOrg] = useState(null);
  const [plans, setPlans] = useState([]);
  const [tiers, setTiers] = useState([]); // paliers du tarif dégressif
  const [loaded, setLoaded] = useState(false);
  const closure = useMyClosure(); // fermeture de l'espace programmée (add_account_closure.sql)

  // Accès réservé au chef d'entreprise.
  const allowed = getCurrentRole() === 'admin' && getIsGroupOwner();
  useEffect(() => {
    if (!allowed) window.location.href = '/login.html';
  }, [allowed]);

  const reload = useCallback(async () => {
    const [o, p, t] = await Promise.all([fetchMyGroup().catch(() => null), fetchPlans().catch(() => []), fetchDiscountTiers().catch(() => [])]);
    setOrg(o);
    setPlans(p);
    setTiers(t);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    // Arriver ici = ne plus être dans aucune station (profiles.station_id vidé).
    closeStation().catch(() => {});
    reload();
  }, [allowed, reload]);

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    clearSession();
    window.location.replace('/login.html');
  };

  if (!allowed) return null;
  if (closure) return <ClosurePendingScreen closure={closure} onExport={() => exportMyGroupData()} exportLabel="Télécharger les données de l'entreprise (ZIP)" />;
  const status = org ? GROUP_STATUS[org.status] : null;

  return (
    <GroupContext.Provider value={{ org, plans, tiers, reload, loaded }}>
      <AppShell
        accent="emerald"
        activeLayoutId="activeGroupTab"
        nav={NAV}
        onLogout={logout}
        glows={['bg-emerald-600/10', 'bg-blue-600/10']}
        brandIcon={(
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-emerald-400" />
          </div>
        )}
        brandText={(
          <>
            <p className="font-bold text-base truncate">{org?.name || 'Mon groupe'}</p>
            <p className="text-[11px] text-emerald-400 uppercase tracking-wider font-semibold">Offre Sur mesure</p>
          </>
        )}
        mobileBrand={<span className="font-bold text-lg truncate">{org?.name || 'Mon groupe'}</span>}
        footerExtra={status && (
          <div className={`text-xs font-medium px-3 py-2 rounded-xl border mb-3 text-center ${status.className}`}>{status.label}</div>
        )}
      >
        <div className="relative z-10 min-h-full">
          <PageSuspense><Outlet /></PageSuspense>
        </div>
      </AppShell>
    </GroupContext.Provider>
  );
}
