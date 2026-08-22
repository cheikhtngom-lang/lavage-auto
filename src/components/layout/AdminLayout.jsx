import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Settings, LogOut, Droplets, ListOrdered, Activity, Calculator, LineChart, Menu, X, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppState } from '../../hooks/useAppState';
import { clearSession, getCurrentRole } from '../../lib/accounts';
import StationOnboarding from '../onboarding/StationOnboarding';
import TrialBanner from './TrialBanner';

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { stationProfile, stationBilling } = useAppState();
  const isConfigured = stationProfile?.name && stationProfile.name.trim() !== '';
  const stationName = isConfigured ? stationProfile.name : '⚙️ Configurer';
  const impersonatingStation = sessionStorage.getItem('impersonatingStation');

  // Accès réservé à un compte station connecté, ou à un Super Admin en train
  // d'impersonner une station (voir impersonateStation dans useSuperAdminState).
  useEffect(() => {
    const role = getCurrentRole();
    if (role !== 'admin' && !(role === 'super_admin' && impersonatingStation)) {
      window.location.href = '/login.html';
    }
  }, [impersonatingStation]);

  // La visite guidée (GuidedTour) a besoin que la sidebar soit visible pour
  // pouvoir surligner ses éléments — sur mobile elle est hors-écran tant que
  // ce menu n'est pas ouvert.
  useEffect(() => {
    const open = () => setIsMobileMenuOpen(true);
    window.addEventListener('ccg:open-mobile-nav', open);
    return () => window.removeEventListener('ccg:open-mobile-nav', open);
  }, []);

  const exitImpersonation = () => {
    sessionStorage.removeItem('impersonatingStation');
    sessionStorage.removeItem('currentStationId');
    window.dispatchEvent(new Event('station-session-changed'));
    navigate('/superadmin/stations');
  };

  const navigation = [
    { name: 'Vue d\'ensemble', href: '/admin/queue', icon: LayoutDashboard, tourId: 'admin-nav-overview' },
    { name: 'Laveurs', href: '/admin/washers', icon: Droplets, tourId: 'admin-nav-washers' },
    { name: 'Transactions', href: '/admin/transactions', icon: Activity, tourId: 'admin-nav-transactions' },
    { name: 'Comptabilité', href: '/admin/accounting', icon: Calculator },
    { name: 'Abonnements', href: '/admin/subscriptions', icon: Sparkles },
    { name: 'Analytique', href: '/admin/analytics', icon: LineChart, tourId: 'admin-nav-analytics' },
    { name: 'Équipe', href: '/admin/team', icon: Users, tourId: 'admin-nav-team' },
    { name: 'Paramètres', href: '/admin/settings', icon: Settings, tourId: 'admin-nav-settings' },
  ];

  const handleLogout = () => {
    clearSession();
    // Redirection directe vers la page d'accueil (chemin absolu)
    window.location.replace(window.location.origin + '/index.html');
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-white overflow-hidden font-sans">
      {/* Jamais pendant une impersonation Super Admin : la station ne doit pas
          voir son propre onboarding se déclencher/se compléter à son insu
          pendant qu'un tiers consulte son espace. */}
      {!impersonatingStation && <StationOnboarding />}

      {/* Header Mobile */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10 z-30 flex items-center px-4">
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 bg-white/5 rounded-lg text-neutral-300 hover:text-white mr-4"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="flex items-center">
          {stationProfile?.logo ? (
            <img src={stationProfile.logo} alt="Logo" className="w-6 h-6 rounded-md object-cover mr-2 flex-shrink-0" />
          ) : (
            <Droplets className="w-6 h-6 text-emerald-400 mr-2" />
          )}
          <span className={`font-bold text-lg truncate max-w-[160px] ${!isConfigured ? 'text-orange-400' : ''}`}>{stationName}</span>
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center mr-3 shadow-lg shadow-blue-500/20 overflow-hidden flex-shrink-0">
            {stationProfile?.logo ? (
              <img src={stationProfile.logo} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <Droplets className="w-5 h-5 text-white" />
            )}
          </div>
          <span className={`font-bold text-lg tracking-wide truncate max-w-[140px] ${
            isConfigured
              ? 'text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400'
              : 'text-orange-400'
          }`}>{stationName}</span>
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

        {!impersonatingStation && <TrialBanner billing={stationBilling} />}

        {impersonatingStation && (
          <div className="relative z-20 flex items-center justify-between gap-3 bg-amber-500/15 border-b border-amber-500/30 px-6 py-3 text-sm">
            <span className="flex items-center gap-2 text-amber-300 font-medium">
              <Sparkles className="w-4 h-4" /> Vue Super Admin sur la station « {impersonatingStation} »
            </span>
            <button
              onClick={exitImpersonation}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold px-4 py-1.5 rounded-lg transition-colors"
            >
              Quitter cette vue
            </button>
          </div>
        )}

        <div className="relative z-10 min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
