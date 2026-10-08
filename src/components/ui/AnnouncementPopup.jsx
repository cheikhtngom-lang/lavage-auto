import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Megaphone, X } from 'lucide-react';

// Annonce d'une station affichée d'office à l'automobiliste (en plus de la
// clochette, où elle restait sinon inaperçue). Une à la fois, la plus récente
// d'abord ; « J'ai lu » la marque comme lue (même dismissedIds que la
// clochette) et fait apparaître la suivante. Seules les annonces de moins de
// 7 jours s'imposent : une vieille annonce (« fermé tôt ce soir »…) induirait
// en erreur — elle reste consultable dans la clochette.
const POPUP_MAX_AGE_MS = 7 * 86400000;

export default function AnnouncementPopup({ announcements, dismissedIds, onDismiss }) {
  const unread = announcements.filter((a) => !dismissedIds.includes(a.id)
    && Date.now() - new Date(a.createdAt).getTime() < POPUP_MAX_AGE_MS);
  const current = unread[0];

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          role="alert"
          className="fixed z-50 top-20 inset-x-4 sm:left-auto sm:right-6 sm:w-96 bg-neutral-900 border border-blue-500/30 rounded-2xl shadow-2xl shadow-blue-500/10 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
              <Megaphone className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-blue-400 text-xs font-medium">
                {current.stationName || 'Votre station'}
                {current.audience === 'subscribers' && <span className="ml-2 text-amber-400 font-semibold">· Réservé aux abonnés</span>}
              </p>
              <p className="text-white font-bold text-sm mt-0.5 break-words">{current.title}</p>
              <p className="text-neutral-300 text-sm mt-1 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{current.message}</p>
            </div>
            <button onClick={() => onDismiss(current.id)} title="Fermer"
              className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-neutral-500 text-xs">
              {unread.length > 1 ? `${unread.length - 1} autre${unread.length > 2 ? 's' : ''} annonce${unread.length > 2 ? 's' : ''}` : ''}
            </span>
            <button onClick={() => onDismiss(current.id)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
              J'ai lu
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
