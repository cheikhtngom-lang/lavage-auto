import React from 'react';
import { motion } from 'framer-motion';
import { Ban } from 'lucide-react';
import AnnouncementComposer from '../ui/AnnouncementComposer';

// « Actions rapides » du tableau de bord Super Admin — bouton d'envoi
// d'annonce aux stations + historique avec retrait (voir
// add_announcement_retire.sql). Inspiré de admin-dashboard.html côté
// GestionImmo, adapté au vocabulaire "stations" de Lavage Auto.
export default function PlatformAnnouncementsCard({ announcements, onSend, onRetire }) {
  const recent = announcements.slice(0, 10);

  const handleRetire = (a) => {
    if (!window.confirm(`Retirer l'annonce « ${a.title} » ? Elle ne s'affichera plus chez les stations qui ne l'ont pas encore fermée.`)) return;
    onRetire(a.id, a.title);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      className="glass-card rounded-2xl p-8"
    >
      <h2 className="text-xl font-bold text-white mb-4">Actions rapides</h2>

      <AnnouncementComposer
        label="Envoyer une annonce aux stations"
        recipientHint="Visible par toutes les stations partenaires, dans leur clochette de notifications."
        onSend={onSend}
        variant="block"
      />

      <h3 className="text-sm font-bold text-neutral-500 mt-8 mb-3">Annonces envoyées récemment</h3>
      {recent.length === 0 ? (
        <p className="text-neutral-500 text-sm">Aucune annonce envoyée pour l'instant.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {recent.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <p className="text-sm font-semibold text-white truncate">{a.title}</p>
                  <span className={`text-xs font-medium flex-shrink-0 ${a.active ? 'text-emerald-400' : 'text-neutral-500'}`}>
                    {a.active ? 'Active' : 'Retirée'}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {new Date(a.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              </div>
              {a.active && (
                <button
                  onClick={() => handleRetire(a)}
                  title="Retirer cette annonce"
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                >
                  <Ban className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
