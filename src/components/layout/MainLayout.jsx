import React, { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, Menu, X } from 'lucide-react';

export default function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#030712] text-white flex flex-col font-sans relative overflow-hidden">
      {/* Background gradients for Client side */}
      <div className="absolute top-[-10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-[20%] -right-[10%] w-[30%] h-[50%] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      
      {/* Header */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className="sticky top-0 z-50 w-full border-b border-white/5 bg-white/[0.02] backdrop-blur-3xl shadow-sm"
      >
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-wide text-white">Clean Car <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-500 via-yellow-400 to-red-500">Galsen</span></span>
          </Link>
          
          <nav className="hidden md:flex gap-8 items-center">
            <Link to="/" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Accueil</Link>
            <Link to="/stations" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Stations</Link>
            <Link to="/dashboard" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Mon Suivi</Link>
          </nav>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(o => !o)}
              className="md:hidden text-neutral-400 hover:text-white transition-colors"
              aria-label="Ouvrir le menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <a href="/login.html" className="hidden md:flex relative inline-flex overflow-hidden rounded-xl p-[1px] focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-neutral-950 active:scale-95 transition-transform group">
              <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#3b82f6_0%,#10b981_50%,#3b82f6_100%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></span>
              <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-xl bg-neutral-950 px-6 py-2.5 text-sm font-bold text-white backdrop-blur-3xl border border-white/10 group-hover:border-transparent transition-all">
                Se Connecter
              </span>
            </a>
          </div>
        </div>

        {/* Menu mobile */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden overflow-hidden border-t border-white/5 bg-neutral-950/95 backdrop-blur-xl"
            >
              <nav className="container mx-auto px-4 py-4 flex flex-col gap-1">
                <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="px-3 py-3 rounded-xl text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition-colors">Accueil</Link>
                <Link to="/stations" onClick={() => setIsMobileMenuOpen(false)} className="px-3 py-3 rounded-xl text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition-colors">Stations</Link>
                <Link to="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="px-3 py-3 rounded-xl text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition-colors">Mon Suivi</Link>
                <a href="/login.html" className="mt-2 px-3 py-3 rounded-xl text-sm font-bold text-center text-white bg-blue-600 hover:bg-blue-500 transition-colors">Se Connecter</a>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Main content */}
      <main className="flex-1 relative z-10 w-full flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-black py-10 text-center text-neutral-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center flex-shrink-0">
            <Droplets className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">Clean Car Galsen</span>
        </div>
        <nav className="flex items-center justify-center gap-6 mb-4 text-neutral-400">
          <Link to="/" className="hover:text-white transition-colors">Accueil</Link>
          <Link to="/stations" className="hover:text-white transition-colors">Stations</Link>
          <Link to="/dashboard" className="hover:text-white transition-colors">Mon Suivi</Link>
        </nav>
        <p>&copy; {new Date().getFullYear()} Clean Car Galsen. Tous droits réservés.</p>
      </footer>
    </div>
  );
}
