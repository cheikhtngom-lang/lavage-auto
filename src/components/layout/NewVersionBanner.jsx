import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { canReloadSilently, fetchDeployedBuildId, isNewerBuild } from '../../lib/appVersion';

const CHECK_EVERY_MS = 10 * 60 * 1000;
const RELOAD_GUARD_KEY = 'ccg_reloaded_for_build';

// Nouvelle version en ligne alors que l'onglet tourne encore sur l'ancienne
// (tablette de station ouverte toute la journée) : rechargement automatique
// si personne n'utilise l'écran et qu'aucun lavage n'est en cours, sinon un
// petit bandeau « Mettre à jour ».
// Sans ça, un correctif mis en ligne n'arrivait chez une station qu'au
// prochain rechargement manuel (6/11/2026 : bip corrigé, iPad resté sur
// l'ancien code).
export default function NewVersionBanner() {
  const [available, setAvailable] = useState(false);
  const lastInteractionRef = useRef(Date.now());
  const { activeWashes } = useAppState();
  const washInProgressRef = useRef(false);
  washInProgressRef.current = (activeWashes || []).length > 0;

  useEffect(() => {
    const mark = () => { lastInteractionRef.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((evt) => window.addEventListener(evt, mark, { passive: true }));

    let cancelled = false;
    const check = async () => {
      const deployed = await fetchDeployedBuildId();
      if (cancelled || !isNewerBuild(deployed)) return;
      // Garde-fou : une seule tentative automatique par version (si le
      // serveur renvoyait encore l'ancienne page, on ne boucle pas).
      let alreadyTried = false;
      try { alreadyTried = sessionStorage.getItem(RELOAD_GUARD_KEY) === deployed; } catch { /* stockage indisponible */ }
      const active = document.activeElement;
      const silent = !alreadyTried && canReloadSilently({
        washInProgress: washInProgressRef.current,
        hidden: document.hidden,
        idleForMs: Date.now() - lastInteractionRef.current,
        typing: !!active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName),
        // Fenêtre ouverte (saisie, encaissement, écran « session expirée »…).
        dialogOpen: !!document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0'),
      });
      if (silent) {
        try { sessionStorage.setItem(RELOAD_GUARD_KEY, deployed); } catch { /* idem */ }
        window.location.reload();
        return;
      }
      setAvailable(true);
    };

    check();
    const interval = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      events.forEach((evt) => window.removeEventListener(evt, mark));
    };
  }, []);

  if (!available) return null;

  return (
    <div className="fixed z-[55] bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/95 px-4 py-3 shadow-2xl shadow-black/50">
        <p className="flex-1 min-w-0 text-sm text-neutral-200">Une nouvelle version de Galsen est disponible.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Mettre à jour
        </button>
      </div>
    </div>
  );
}
