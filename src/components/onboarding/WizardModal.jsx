import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

// Coquille commune des étapes de l'assistant de configuration (voir
// ClientOnboarding.jsx / StationOnboarding.jsx) — même fond opaque que les
// autres modales de l'app (bg-neutral-900 par-dessus le fond flouté), pas de
// verre translucide ici : une modale doit rester lisible. Pas d'AnimatePresence
// ici : le parent bascule entre plusieurs WizardModal (une par étape) plutôt
// que de monter/démonter le même, donc seule l'entrée peut réellement s'animer.
export default function WizardModal({ title, subtitle, stepIndex = 0, totalSteps = 1, onSkip, onClose, footer, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col"
      >
          {onClose && (
            <button onClick={onClose} className="absolute top-4 right-4 z-10 text-neutral-500 hover:text-white transition-colors" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Contenu défilant : sur un petit écran ou avec un menu déroulant
              ouvert (ex: BrandDropdown), seule cette zone scrolle — le titre
              et les boutons du footer restent toujours visibles et cliquables. */}
          <div className="p-8 pb-0 overflow-y-auto">
            {totalSteps > 1 && (
              <div className="flex items-center gap-1.5 mb-6">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all ${
                    i === stepIndex ? 'w-8 bg-blue-500' : i < stepIndex ? 'w-1.5 bg-emerald-500' : 'w-1.5 bg-white/10'
                  }`} />
                ))}
              </div>
            )}

            <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
            {subtitle && <p className="text-neutral-400 text-sm mb-6">{subtitle}</p>}

            <div className="pb-8">{children}</div>
          </div>

          <div className="flex items-center justify-between gap-3 p-8 pt-4">
            {onSkip ? (
              <button onClick={onSkip} className="text-sm text-neutral-500 hover:text-neutral-300 font-medium transition-colors">
                Passer cette étape
              </button>
            ) : <span />}
            {footer}
          </div>
      </motion.div>
    </div>
  );
}
