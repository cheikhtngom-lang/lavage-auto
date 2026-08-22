import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Building2, CreditCard, LifeBuoy, LogOut, Sparkles, Menu, X, BarChart3, Users, Settings as SettingsIcon, Crown, Megaphone } from 'lucide-react';
import { cn } from '../../lib/utils';
import { clearSession, getCurrentRole } from '../../lib/accounts';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import SuperUserNotifBell from '../superadmin/SuperUserNotifBell';

export default function SuperAdminLayout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { superUserSubscriptions, stationAds } = useSuperAdminState();
  const pendingSuperUserCount = superUserSubscriptions.filter((s) => s.status === 'PENDING').length;
  const pendingAdsCount = stationAds.filter((a) => a.status === 'PENDING').length;

  useEffect(() => {
    if (getCurrentRole() !== 'super_admin') {
      window.location.href = '/login.html';
    }
  }, []);

  const navigation = [
    { name: 'Vue d\'ensemble', href: '/superadmin', icon: LayoutDashboard },
    { name: 'Analytique', href: '/superadmin/analytics', icon: BarChart3 },
    { name: 'Stations', href: '/superadmin/stations', icon: Building2 },
    { name: 'Automobilistes', href: '/superadmin/automobilistes', icon: Users },
    { name: 'Abonnements Super User', href: '/superadmin/super-users', icon: Crown },
    { name: 'Publicités', href: '/superadmin/ads', icon: Megaphone },
    { name: 'Facturation', href: '/superadmin/billing', icon: CreditCard },
    { name: 'Support', href: '/superadmin/support', icon: LifeBuoy },
    { name: 'Paramètres', href: '/superadmin/settings', icon: SettingsIcon },
  ];

  const handleLogout = () => {
    clearSession();
    window.location.replace(window.location.origin + '/index.html');
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-white overflow-hidden font-sans">

      {/* Header Mobile */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10 z-30 flex items-center px-4">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 bg-white/5 rounded-lg text-neutral-300 hover:text-white mr-4"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="flex items-center">
          <Sparkles className="w-6 h-6 text-purple-400 mr-2" />
          <span className="font-bold text-lg">Super Admin</span>
        </div>
        <div className="ml-auto">
          <SuperUserNotifBell />
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
        <div className="hidden md:block absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
        <div className="hidden md:block absolute -top-24 left-1/2 -translate-x-1/2 w-40 h-40 bg-white/[0.04] rounded-full blur-3xl pointer-events-none" />

        <div className="h-20 flex items-center justify-between px-6 border-b border-white/5 relative z-10">
          <div className="flex items-center min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center mr-3 shadow-lg shadow-purple-500/20 flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-wide truncate text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400">
              Super Admin
            </span>
          </div>
          <div className="hidden md:block flex-shrink-0">
            <SuperUserNotifBell />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-2 relative z-10">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "relative flex items-center px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 overflow-hidden group",
                  isActive ? "text-white" : "text-neutral-400 hover:text-white"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeSuperAdminTab"
                    className="absolute inset-0 bg-white/10 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-1 ring-white/10"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                {!isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/0 to-purple-500/0 group-hover:from-purple-500/10 group-hover:via-transparent transition-all duration-500 rounded-2xl"></div>
                )}
                <item.icon className={cn("w-5 h-5 mr-3 relative z-10 transition-colors", isActive ? "text-purple-400" : "text-neutral-500 group-hover:text-purple-400")} />
                <span className="relative z-10 flex-1">{item.name}</span>
                {item.href === '/superadmin/super-users' && pendingSuperUserCount > 0 && (
                  <span className="relative z-10 ml-2 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-neutral-950 text-[11px] font-bold flex items-center justify-center">
                    {pendingSuperUserCount}
                  </span>
                )}
                {item.href === '/superadmin/ads' && pendingAdsCount > 0 && (
                  <span className="relative z-10 ml-2 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-neutral-950 text-[11px] font-bold flex items-center justify-center">
                    {pendingAdsCount}
                  </span>
                )}
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
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="relative z-10 min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
