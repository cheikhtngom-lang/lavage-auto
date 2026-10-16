import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu, X, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useShellMode } from '../../lib/useMediaQuery';

// Cadre commun des espaces connectés (station, automobiliste, Super Admin,
// chef d'entreprise) : sidebar « verre » + zone de contenu.
//
// La sidebar s'adapte à la largeur RÉELLE de l'écran (voir useShellMode) :
//   • drawer (< 1024 px : téléphone, tablette en portrait) — menu escamotable
//     derrière le bouton ☰, le contenu prend toute la largeur ;
//   • rail (1024–1279 px : tablette en paysage) — barre d'icônes de 80 px,
//     dépliable par-dessus le contenu (bouton »), au lieu du menu complet qui
//     écrasait les pages (tableau de pointage illisible sur iPad) ;
//   • full (≥ 1280 px) — menu complet, que l'utilisateur peut replier en
//     icônes (bouton «, choix mémorisé dans ce navigateur).
// La sidebar est `fixed` ; une cale invisible de même largeur la remplace
// dans le flux, ce qui permet au rail de se déplier sans décaler la page.
const RAIL_W = 80;
const FULL_W = 272;
const COLLAPSED_KEY = 'ccg_sidebar_collapsed';

const ACCENTS = {
  blue: {
    activeIcon: 'text-emerald-400',
    bar: 'from-blue-400 to-emerald-400',
    glow: 'shadow-[0_0_24px_-6px_rgba(59,130,246,0.45)]',
  },
  purple: {
    activeIcon: 'text-purple-300',
    bar: 'from-purple-400 to-fuchsia-400',
    glow: 'shadow-[0_0_24px_-6px_rgba(168,85,247,0.45)]',
  },
  emerald: {
    activeIcon: 'text-emerald-400',
    bar: 'from-emerald-400 to-teal-300',
    glow: 'shadow-[0_0_24px_-6px_rgba(16,185,129,0.4)]',
  },
};

const BADGE_TONES = {
  amber: 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30',
  red: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30',
  blue: 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30',
};
const DOT_TONES = { amber: 'bg-amber-400', red: 'bg-red-500', blue: 'bg-blue-400', emerald: 'bg-emerald-400' };

// Pastilles d'une entrée : `badges` [{ count, tone, label }] ou, forme courte
// historique, `badge` (nombre) en ambre. Seules les valeurs > 0 s'affichent.
const itemBadges = (item) => (item.badges || (item.badge ? [{ count: item.badge, tone: 'amber' }] : []))
  .filter((b) => b.count > 0);
const badgeText = (n) => (n > 99 ? '99+' : String(n));
// Mode icônes : un seul point, de la couleur la plus urgente.
const TONE_PRIORITY = ['red', 'amber', 'blue', 'emerald'];
const urgentTone = (badges) => TONE_PRIORITY.find((t) => badges.some((b) => (b.tone || 'amber') === t)) || 'amber';

// Regroupe les entrées consécutives qui partagent la même `section` (titre
// affiché au-dessus). Sans `section`, une seule liste sans titre.
function groupBySection(nav) {
  const groups = [];
  for (const item of nav) {
    const last = groups[groups.length - 1];
    if (last && last.title === (item.section || null)) last.items.push(item);
    else groups.push({ title: item.section || null, items: [item] });
  }
  return groups;
}

const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// nav : [{ name, href, icon, tourId?, section?, badge? | badges?, end? }] —
// `end: false` rend l'entrée active aussi sur ses sous-pages (/groupe/stations/…).
// user : { name, subtitle } — carte du compte en pied de menu (sinon simple
// bouton Déconnexion). brandSub : ligne sous le nom (offre, statut…).
export default function AppShell({
  accent = 'blue',
  activeLayoutId,
  brandIcon,
  brandText,
  brandSub,
  mobileBrand,
  actions,
  nav,
  user,
  footerExtra,
  onLogout,
  overlays,
  glows,
  children,
}) {
  const mode = useShellMode();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [tip, setTip] = useState(null); // info-bulle du mode icônes : { label, top, left }
  const a = ACCENTS[accent] || ACCENTS.blue;

  // Rotation de la tablette / redimensionnement : on repart menu replié.
  useEffect(() => { setOpen(false); setTip(null); }, [mode]);
  useEffect(() => { setOpen(false); setTip(null); }, [location.pathname]);

  // La visite guidée (GuidedTour) a besoin que les entrées du menu soient
  // visibles pour les surligner : hors-écran en drawer, sans libellé en rail.
  useEffect(() => {
    const onOpen = () => { setOpen(true); setCollapsed(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('ccg:open-mobile-nav', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('ccg:open-mobile-nav', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const toggleCollapsed = () => {
    setTip(null);
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1'); } catch { /* navigation privée */ }
      return !c;
    });
  };

  // Icônes seules : rail fermé, ou menu complet replié par l'utilisateur.
  const compact = (mode === 'rail' && !open) || (mode === 'full' && collapsed);
  const floating = mode === 'drawer' ? open : mode === 'rail' && open; // panneau par-dessus le contenu
  const spacer = mode === 'full' ? (collapsed ? RAIL_W : FULL_W) : mode === 'rail' ? RAIL_W : 0;
  const isActive = (item) => (item.end === false
    ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
    : location.pathname === item.href);
  const groups = groupBySection(nav);

  const showTip = (e, label) => {
    if (!compact) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 14 });
  };
  const tipHandlers = (label) => ({
    onMouseEnter: (e) => showTip(e, label),
    onFocus: (e) => showTip(e, label),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });

  const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-0';

  return (
    <div className="app-shell flex bg-neutral-950 text-white overflow-hidden font-sans">
      {overlays}

      {mode === 'drawer' && (
        <div className="absolute top-0 left-0 right-0 h-16 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10 z-30 flex items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            className={cn('p-2 bg-white/5 rounded-lg text-neutral-300 hover:text-white flex-shrink-0', focusRing)}
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
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40"
          />
        )}
      </AnimatePresence>

      <div aria-hidden="true" className="flex-shrink-0 transition-[width] duration-300" style={{ width: spacer }} />

      <aside
        aria-label="Menu principal"
        style={{ width: compact ? RAIL_W : (mode === 'drawer' ? Math.min(FULL_W + 16, 320) : FULL_W) }}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden transition-[width,transform] duration-300 ease-out',
          mode === 'drawer'
            ? 'top-0 left-0 bottom-0 max-w-[85vw] border-r border-white/[0.08] bg-neutral-950 shadow-2xl shadow-black/60'
            : 'top-4 left-4 bottom-4 rounded-[24px] border border-white/[0.08] backdrop-blur-2xl shadow-2xl shadow-black/50',
          mode !== 'drawer' && (floating ? 'bg-neutral-900/95' : 'bg-neutral-900/60'),
          mode === 'drawer' && !open ? '-translate-x-full' : 'translate-x-0',
        )}
      >
        {/* Reflet du verre : liseré lumineux en haut + halo doux */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-blue-500/[0.07] rounded-full blur-3xl pointer-events-none" />

        {/* ── En-tête : logo, nom, offre ─────────────────────────────── */}
        <div className={cn('relative z-10 flex-shrink-0 flex items-center', compact ? 'h-20 justify-center' : 'h-[72px] px-5 gap-3')}>
          <div className="flex-shrink-0 rounded-xl ring-1 ring-white/10 shadow-lg shadow-black/30">{brandIcon}</div>
          {!compact && (
            <div className="min-w-0 flex-1">
              {brandText}
              {brandSub && <div className="mt-0.5">{brandSub}</div>}
            </div>
          )}
          {!compact && (mode === 'full' || (mode === 'rail' && open)) && (
            <button
              type="button"
              onClick={mode === 'full' ? toggleCollapsed : () => setOpen(false)}
              aria-label="Replier le menu"
              title="Replier le menu"
              className={cn('p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0', focusRing)}
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent flex-shrink-0" />

        {compact && (
          <button
            type="button"
            onClick={mode === 'full' ? toggleCollapsed : () => setOpen(true)}
            aria-label="Déplier le menu"
            {...tipHandlers('Afficher les libellés')}
            className={cn('mx-auto mt-3 p-2 rounded-xl text-neutral-500 hover:text-white hover:bg-white/10 transition-colors relative z-10 flex-shrink-0', focusRing)}
          >
            <ChevronsRight className="w-5 h-5" />
          </button>
        )}

        {/* ── Rubriques, par section ─────────────────────────────────── */}
        <nav
          onScroll={() => setTip(null)}
          className={cn(
            'nav-scroll flex-1 overflow-y-auto overflow-x-hidden relative z-10',
            '[mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-16px),transparent)]',
            'py-3 px-3',
          )}
        >
          {groups.map((group, gi) => (
            <div key={group.title || gi} className={cn(gi > 0 && (compact ? 'mt-2.5 pt-2.5 border-t border-white/[0.06]' : group.title ? 'mt-4' : 'mt-2.5'))}>
              {group.title && !compact && (
                <p className="px-3 mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-500 select-none">{group.title}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item);
                  const badges = itemBadges(item);
                  const tipLabel = badges.length ? `${item.name} · ${badges.map((b) => b.label || b.count).join(' · ')}` : item.name;
                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        data-tour={item.tourId}
                        aria-label={compact ? tipLabel : undefined}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setOpen(false)}
                        {...tipHandlers(tipLabel)}
                        className={cn(
                          'relative flex items-center rounded-xl text-[13.5px] font-medium transition-colors duration-200 group',
                          compact ? 'justify-center h-10' : 'h-9 px-3 gap-3',
                          active ? 'text-white' : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]',
                          focusRing,
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId={activeLayoutId}
                            className={cn('absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-inset ring-white/[0.08]', a.glow)}
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                          >
                            {/* Barre d'accent, dans la marge gauche de la liste */}
                            <span className={cn('absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-gradient-to-b', a.bar)} />
                          </motion.span>
                        )}

                        <span className="relative z-10 flex-shrink-0">
                          <item.icon className={cn('w-[18px] h-[18px] transition-colors', active ? a.activeIcon : 'text-neutral-500 group-hover:text-neutral-200')} strokeWidth={active ? 2.2 : 1.9} />
                          {compact && badges.length > 0 && (
                            <span className={cn('absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-neutral-900', DOT_TONES[urgentTone(badges)])} />
                          )}
                        </span>
                        {!compact && <span className="relative z-10 flex-1 min-w-0 truncate">{item.name}</span>}
                        {!compact && badges.length > 0 && (
                          <span className="relative z-10 flex items-center gap-1 flex-shrink-0">
                            {badges.map((b) => (
                              <span key={b.tone + b.count} title={b.label}
                                className={cn('min-w-[20px] h-5 px-1.5 rounded-md text-[11px] font-semibold tabular-nums flex items-center justify-center', BADGE_TONES[b.tone] || BADGE_TONES.amber)}>
                                {badgeText(b.count)}
                              </span>
                            ))}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* ── Pied : compte connecté + déconnexion ───────────────────── */}
        <div className={cn('relative z-10 flex-shrink-0 border-t border-white/[0.06]', compact ? 'p-3' : 'p-3')}>
          {!compact && footerExtra}
          {user ? (
            <div className={cn('flex items-center rounded-2xl', compact ? 'flex-col gap-2' : 'gap-3 p-2 bg-white/[0.03] ring-1 ring-inset ring-white/[0.05]')}>
              <div
                className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0 ring-2 ring-white/10"
                {...(compact ? tipHandlers(`${user.name}${user.subtitle ? ` · ${user.subtitle}` : ''}`) : {})}
              >
                {initials(user.name)}
              </div>
              {!compact && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate leading-tight">{user.name}</p>
                  {user.subtitle && <p className="text-xs text-neutral-500 truncate mt-0.5">{user.subtitle}</p>}
                </div>
              )}
              <button
                type="button"
                onClick={onLogout}
                aria-label="Déconnexion"
                {...(compact ? tipHandlers('Déconnexion') : { title: 'Déconnexion' })}
                className={cn('p-2 rounded-xl text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0', focusRing)}
              >
                <LogOut className="w-[18px] h-[18px]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Déconnexion"
              {...tipHandlers('Déconnexion')}
              className={cn(
                'flex w-full items-center text-[13.5px] font-medium text-neutral-400 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors group',
                compact ? 'justify-center h-11' : 'h-10 px-3 gap-3',
                focusRing,
              )}
            >
              <LogOut className="w-[18px] h-[18px] group-hover:text-red-400 transition-colors" />
              {!compact && 'Déconnexion'}
            </button>
          )}
        </div>
      </aside>

      {/* Info-bulle du mode icônes : hors de la sidebar (qui coupe ce qui dépasse). */}
      <AnimatePresence>
        {tip && compact && (
          <motion.div
            key={tip.label}
            role="tooltip"
            initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ top: tip.top, left: tip.left }}
            className="fixed z-[60] -translate-y-1/2 pointer-events-none whitespace-nowrap rounded-lg bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl shadow-black/40 ring-1 ring-white/10"
          >
            {tip.label}
          </motion.div>
        )}
      </AnimatePresence>

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
