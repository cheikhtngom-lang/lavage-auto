import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Megaphone, X } from 'lucide-react';

// Clochette de notification générique pour les annonces (add_announcements.sql)
// — réutilisée côté station (annonces plateforme reçues) et côté automobiliste
// (annonces des stations connues). Lu/non-lu = présence dans dismissedIds
// (profiles.dismissed_announcement_ids), pas de table de statuts séparée.
export default function AnnouncementBell({ announcements, dismissedIds, onDismiss, label = 'Annonces', emptyLabel = 'Aucune annonce pour le moment.' }) {
  const [open, setOpen] = useState(false);
  const unread = announcements.filter((a) => !dismissedIds.includes(a.id));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 transition-colors shadow-lg"
        title={label}
      >
        <Bell className="w-5 h-5" />
        {unread.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-blue-500 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-neutral-950">
            {unread.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-3 w-96 max-w-[90vw] bg-neutral-950/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-blue-400" />
                  <h3 className="font-bold text-white text-sm">{label}</h3>
                </div>
                {unread.length > 0 && (
                  <button onClick={() => unread.forEach((a) => onDismiss(a.id))} className="text-xs text-neutral-500 hover:text-white transition-colors">
                    Tout marquer comme lu
                  </button>
                )}
              </div>
              {announcements.length === 0 ? (
                <div className="p-6 text-center text-neutral-500 text-sm">{emptyLabel}</div>
              ) : (
                <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
                  {announcements.map((a) => {
                    const isUnread = !dismissedIds.includes(a.id);
                    return (
                      <div key={a.id} className={`p-4 flex items-start gap-3 hover:bg-white/[0.03] transition-colors ${isUnread ? 'bg-blue-500/[0.03]' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
                            <p className="text-white font-bold text-sm truncate">{a.title}</p>
                          </div>
                          {a.stationName && <p className="text-blue-400 text-xs font-medium mt-0.5">{a.stationName}</p>}
                          <p className="text-neutral-400 text-xs mt-1 whitespace-pre-wrap break-words">{a.message}</p>
                          <p className="text-neutral-600 text-[11px] mt-1.5">
                            {new Date(a.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {isUnread && (
                          <button onClick={() => onDismiss(a.id)} title="Marquer comme lu"
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
