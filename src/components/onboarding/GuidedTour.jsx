import React, { useState, useEffect, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';

// Visite guidée interactive, déclenchée une fois l'assistant de configuration
// terminé (voir ClientOnboarding.jsx / StationOnboarding.jsx) — met en évidence
// les rubriques essentielles du tableau de bord une à une, en repérant chaque
// cible par un attribut data-tour posé sur l'élément réel (pas une maquette :
// le highlight suit le vrai layout, donc reste correct si le design change).
// `steps`: [{ selector, title, text }]
export default function GuidedTour({ steps, onFinish }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[index];

  // Les cibles de la visite (nav de la sidebar) sont hors-écran sur mobile tant
  // que le menu hamburger n'est pas ouvert — ClientLayout/AdminLayout écoutent
  // cet évènement pour l'ouvrir. Dispatché à chaque montage, avant la toute
  // première mesure ; la nouvelle position réelle n'arrive qu'après le rendu
  // (asynchrone, autre composant) donc c'est la re-mesure différée plus bas
  // qui la capte correctement, pas cette mesure immédiate.
  useEffect(() => {
    window.dispatchEvent(new Event('ccg:open-mobile-nav'));
  }, []);

  useLayoutEffect(() => {
    if (!step) { onFinish(); return; }
    const el = document.querySelector(step.selector);
    if (!el) {
      // Cible absente de cette page (route différente, écran plus étroit...) —
      // on ne bloque jamais la visite dessus, on passe simplement à la suite.
      if (index < steps.length - 1) setIndex((i) => i + 1); else onFinish();
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    // 450ms : laisse le temps au scroll fluide ET, sur mobile, à la sidebar
    // (ouverte via ccg:open-mobile-nav ci-dessus) de terminer son animation.
    const t = setTimeout(measure, 450);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step?.selector]);

  if (!step || !rect) return null;

  const pad = 8;
  const highlightStyle = {
    position: 'fixed', top: rect.top - pad, left: rect.left - pad,
    width: rect.width + pad * 2, height: rect.height + pad * 2,
    borderRadius: 16, boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
    border: '2px solid #3b82f6', pointerEvents: 'none', zIndex: 200, transition: 'all 0.3s ease',
  };

  const spaceBelow = window.innerHeight - rect.bottom;
  const placeBelow = spaceBelow > 190;
  const tooltipWidth = 320;
  const tooltipStyle = {
    position: 'fixed', zIndex: 201,
    top: placeBelow ? rect.bottom + pad + 12 : undefined,
    bottom: placeBelow ? undefined : Math.max(16, window.innerHeight - rect.top + pad + 12),
    left: Math.min(Math.max(rect.left, 16), window.innerWidth - tooltipWidth - 16),
    width: tooltipWidth,
  };

  const next = () => { if (index < steps.length - 1) setIndex((i) => i + 1); else onFinish(); };

  return (
    <>
      <div style={highlightStyle} />
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        style={tooltipStyle}
        className="bg-neutral-900 border border-white/10 rounded-2xl p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-bold text-white text-base">{step.title}</h3>
          <button onClick={onFinish} className="text-neutral-500 hover:text-white flex-shrink-0 transition-colors" aria-label="Terminer la visite">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-neutral-400 mb-5">{step.text}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-600">{index + 1} / {steps.length}</span>
          <button onClick={next} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
            {index === steps.length - 1 ? 'Terminer' : 'Suivant'} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </>
  );
}
