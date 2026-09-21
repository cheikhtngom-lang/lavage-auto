import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Building2, ShoppingCart, CreditCard, LogOut, Menu, X, Briefcase, LayoutDashboard, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { clearSession, getCurrentRole, getIsGroupOwner } from '../../lib/accounts';
import { closeStation, fetchMyGroup, fetchPlans, fetchDiscountTiers, GROUP_STATUS } from '../../lib/groups';

// Espace du chef d'entreprise (offre Sur mesure) — /groupe. Il ne dépend
// d'aucune station : le patron n'« entre » dans une station (bouton Ouvrir)
// que pour travailler dedans avec l'interface /admin habituelle.
const GroupContext = createContext(null);
export const useGroup = () => useContext(GroupContext);

const NAV = [
  { name: 'Tableau de bord', href: '/groupe', icon: LayoutDashboard, end: true },
  { name: 'Analyse IA', href: '/groupe/analyse', icon: Sparkles },
  { name: 'Mes stations', href: '/groupe/stations', icon: Building2 },
  { name: 'Nouvelle commande', href: '/groupe/commande', icon: ShoppingCart },
  { name: 'Facturation', href: '/groupe/facturation', icon: CreditCard },
];

export default function GroupLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [org, setOrg] = useState(null);
  const [plans, setPlans] = useState([]);
  const [tiers, setTiers] = useState([]); // paliers du tarif dégressif
  const [loaded, setLoaded] = useState(false);

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
  const status = org ? GROUP_STATUS[org.status] : null;

  return (
    <GroupContext.Provider value={{ org, plans, tiers, reload, loaded }}>
      <div className="flex h-screen bg-neutral-950 text-white overflow-hidden font-sans">
        {/* Header mobile */}
        <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10 z-30 flex items-center px-4">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 bg-white/5 rounded-lg text-neutral-300 hover:text-white mr-4">
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <span className="font-bold text-lg truncate">{org?.name || 'Mon groupe'}</span>
        </div>
        {menuOpen && <div onClick={() => setMenuOpen(false)} className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />}

        <aside
          className={cn(
            'fixed md:relative top-0 left-0 md:top-4 md:left-4 h-full md:h-[calc(100%-2rem)] w-64 md:rounded-[28px] border-r md:border border-white/5 md:border-white/10 bg-neutral-950/95 md:bg-white/[0.06] backdrop-blur-3xl flex flex-col z-50 md:shadow-2xl md:shadow-black/40 overflow-hidden transition-transform duration-300',
            menuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          )}
        >
          <div className="h-20 flex items-center px-6 border-b border-white/5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mr-3 flex-shrink-0">
              <Briefcase className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-base truncate">{org?.name || 'Mon groupe'}</p>
              <p className="text-[11px] text-emerald-400 uppercase tracking-wider font-semibold">Offre Sur mesure</p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
            {NAV.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center px-4 py-3 rounded-2xl text-sm font-medium transition-all',
                  isActive ? 'bg-white/10 text-white ring-1 ring-white/10' : 'text-neutral-400 hover:text-white hover:bg-white/5',
                )}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-white/5">
            {status && (
              <div className={`text-xs font-medium px-3 py-2 rounded-xl border mb-3 text-center ${status.className}`}>{status.label}</div>
            )}
            <button onClick={logout} className="flex w-full items-center px-4 py-3 text-sm font-medium text-neutral-400 rounded-2xl hover:bg-red-500/10 hover:text-red-400 transition-colors">
              <LogOut className="w-5 h-5 mr-3" /> Déconnexion
            </button>
          </div>
        </aside>

        <main className="flex-1 relative overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="relative z-10 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </GroupContext.Provider>
  );
}
