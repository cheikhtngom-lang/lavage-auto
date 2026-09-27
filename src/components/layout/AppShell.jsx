import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu, X, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useShellMode } from '../../lib/useMediaQuery';

// Cadre commun des espaces connectés (station, automobiliste, Super Admin,
// chef d'entreprise) : sidebar « verre liquide » + zone de contenu.
//
// La sidebar s'adapte à la largeur RÉELLE de l'écran (voir useShellMode) :
//   • drawer (< 1024 px : téléphone, tablette en portrait) — menu escamotable
//     derrière le bouton ☰, le contenu prend toute la largeur ;
//   • rail (1024–1279 px : tablette en paysage) — barre d'icônes de 80 px,
//     dépliable par-dessus le contenu (bouton »), au lieu des 256 px du menu
//     complet qui écrasaient les pages (tableau de pointage illisible sur iPad) ;
//   • full (≥ 1280 px) — menu complet, comme avant.
// La sidebar est `fixed` ; une cale invisible de même largeur la remplace
// dans le flux, ce qui permet au rail de se déplier sans décaler la page.
const RAIL_W = 80;
const FULL_W = 256;

const ACCENTS = {
  blue: {
    activeIcon: 'text-emerald-400',
    hoverIcon: 'group-hover:text-blue-400',
    glow: 'shadow-[0_0_20px_rgba(59,130,246,0.25)]',
    hoverWash: 'from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:via-transparent',
  },
  purple: {
    activeIcon: 'text-purple-400',
    hoverIcon: 'group-hover:text-purple-400',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.25)]',
    hoverWash: 'from-purple-500/0 via-purple-500/0 to-purple-500/0 group-hover:from-purple-500/10 group-hover:via-transparent',
  },
  emerald: {
    activeIcon: 'text-emerald-400',
    hoverIcon: 'group-hover:text-emerald-400',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]',
    hoverWash: 'from-emerald-500/0 via-emerald-500/0 to-emerald-500/0 group-hover:from-emerald-500/10 group-hover:via-transparent',
  },
};

// nav : [{ name, href, icon, tourId?, badge?, end? }] — `end: false` rend
// l'entrée active aussi sur ses sous-pages (/groupe/stations/…).
export default function AppShell({
  accent = 'blue',
  activeLayoutId,
  brandIcon,
  brandText,
  mobileBrand,
  actions,
  nav,
  footerExtra,
  onLogout,
  overlays,
  glows,
  children,
}) {
  const mode = useShellMode();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const a = ACCENTS[accent] || ACCENTS.blue;

  // Rotation de la tablette / redimensionnement : on repart menu replié.
  useEffect(() => { setOpen(false); }, [mode]);
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // La visite guidée (GuidedTour) a besoin que les entrées du menu soient
  // visibles pour les surligner : hors-écran en drawer, sans libellé en rail.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('ccg:open-mobile-nav', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('ccg:open-mobile-nav', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const compact = mode === 'rail' && !open; // icônes seules
  const floating = mode !== 'full' && open; // panneau par-dessus le contenu
  const spacer = mode === 'full' ? FULL_W : mode === 'rail' ? RAIL_W : 0;
  const isActive = (item) => (item.end === false
    ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
    : location.pathname === item.href);

  return (
    <div className="app-shell flex bg-neutral-950 text-white overflow-hidden font-sans">
      {overlays}

      {mode === 'drawer' && (
        <div className="absolute top-0 left-0 right-0 h-16 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10 z-30 flex items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="p-2 bg-white/5 rounded-lg text-neutral-300 hover:text-white flex-shrink-0"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center min-w-0 flex-1">{mobileBrand}</div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}

      <AnimatePresence>
        {floating && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/60 z-40"
          />
        )}
      </AnimatePresence>

      <div aria-hidden="true" className="flex-shrink-0 transition-[width] duration-300" style={{ width: spacer }} />

      <aside
        style={{ width: compact ? RAIL_W : FULL_W }}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden backdrop-blur-3xl transition-[width,transform] duration-300 ease-out',
          mode === 'drawer'
            ? 'top-0 left-0 bottom-0 border-r border-white/5 bg-neutral-950/95'
            : 'top-4 left-4 bottom-4 rounded-[28px] border border-white/10 shadow-2xl shadow-black/40',
          mode !== 'drawer' && (floating ? 'bg-neutral-900/95' : 'bg-white/[0.06]'),
          mode === 'drawer' && !open ? '-translate-x-full' : 'translate-x-0',
        )}
      >
        {mode !== 'drawer' && (
          <>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-40 h-40 bg-white/[0.04] rounded-full blur-3xl pointer-events-none" />
          </>
        )}

        <div className={cn('h-20 flex items-center border-b border-white/5 relative z-10 flex-shrink-0', compact ? 'justify-center' : 'px-6')}>
          <div className="flex-shrink-0">{brandIcon}</div>
          {!compact && <div className="ml-3 min-w-0 flex-1">{brandText}</div>}
          {mode === 'rail' && open && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Replier le menu"
              title="Replier le menu"
              className="ml-2 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {compact && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Déplier le menu"
            title="Afficher les libellés du menu"
            className="mx-auto mt-3 p-2 rounded-xl text-neutral-500 hover:text-white hover:bg-white/10 transition-colors relative z-10 flex-shrink-0"
          >
            <ChevronsRight className="w-5 h-5" />
          </button>
        )}

        <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden relative z-10 space-y-2', compact ? 'py-3 px-3' : 'py-8 px-4')}>
          {nav.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                to={item.href}
                data-tour={item.tourId}
                title={compact ? item.name : undefined}
                aria-label={compact ? item.name : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  'relative flex items-center rounded-2xl text-sm font-medium transition-all duration-300 overflow-hidden group',
                  compact ? 'justify-center h-12' : 'px-4 py-3',
                  active ? 'text-white' : 'text-neutral-400 hover:text-white',
                )}
              >
                {active && (
                  <motion.div
                    layoutId={activeLayoutId}
                    className={cn('absolute inset-0 bg-white/10 rounded-2xl ring-1 ring-white/10', a.glow)}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                {!active && <div className={cn('absolute inset-0 bg-gradient-to-r transition-all duration-500 rounded-2xl', a.hoverWash)} />}

                <span className="relative z-10 flex-shrink-0">
                  <item.icon className={cn('w-5 h-5 transition-colors', active ? a.activeIcon : cn('text-neutral-500', a.hoverIcon))} />
                  {compact && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-neutral-950 text-[10px] font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </span>
                {!compact && <span className="relative z-10 flex-1 ml-3">{item.name}</span>}
                {!compact && item.badge > 0 && (
                  <span className="relative z-10 ml-2 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-neutral-950 text-[11px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn('border-t border-white/5 relative z-10 flex-shrink-0', compact ? 'p-3' : 'p-4')}>
          {!compact && footerExtra}
          <button
            type="button"
            onClick={onLogout}
            title={compact ? 'Déconnexion' : undefined}
            aria-label="Déconnexion"
            className={cn(
              'flex w-full items-center text-sm font-medium text-neutral-400 rounded-2xl hover:bg-red-500/10 hover:text-red-400 transition-colors group',
              compact ? 'justify-center h-12' : 'px-4 py-3',
            )}
          >
            <LogOut className={cn('w-5 h-5 group-hover:text-red-400 transition-colors', !compact && 'mr-3')} />
            {!compact && 'Déconnexion'}
          </button>
        </div>
      </aside>

      <main className={cn('flex-1 min-w-0 relative overflow-y-auto overflow-x-hidden', mode === 'drawer' && 'pt-16')}>
        {glows && (
          <>
            <div className={cn('absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] pointer-events-none', glows[0])} />
            <div className={cn('absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] pointer-events-none', glows[1])} />
          </>
        )}

        {/* Barre supérieure (grand écran), en flux normal : pousse le contenu
            au lieu de flotter par-dessus, la clochette ne recouvre jamais un
            bouton de page. Sur petit écran, `actions` va dans l'en-tête mobile. */}
        {mode !== 'drawer' && actions && (
          <div className="flex items-center justify-end gap-3 h-16 px-8 sticky top-0 z-20 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
            {actions}
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
