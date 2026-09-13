import React from 'react';
import { Ban } from 'lucide-react';

// Historique des annonces envoyées (Super Admin -> stations ou station ->
// clients), avec retrait — voir add_announcement_retire.sql. `announcements`
// vient de useSuperAdminState (platformAnnouncements) ou useAppState
// (sentAnnouncements) ; les deux partagent la même forme (lib/announcements.js).
export default function AnnouncementHistoryList({ announcements, onRetire }) {
  const handleRetire = (a) => {
    if (!window.confirm(`Retirer l'annonce « ${a.title} » ? Elle ne s'affichera plus chez les destinataires qui ne l'ont pas encore fermée.`)) return;
    onRetire(a.id, a.title);
  };

  if (announcements.length === 0) {
    return <p className="text-neutral-500 text-sm">Aucune annonce envoyée pour l'instant.</p>;
  }

  return (
    <div className="divide-y divide-white/5">
      {announcements.map((a) => (
        <div key={a.id} className="flex items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-white truncate">{a.title}</p>
              <span className={`text-xs font-medium flex-shrink-0 ${a.active ? 'text-emerald-400' : 'text-neutral-500'}`}>
                {a.active ? 'Active' : 'Retirée'}
              </span>
            </div>
            <p className="text-sm text-neutral-400 mt-1 line-clamp-2">{a.message}</p>
            <p className="text-xs text-neutral-500 mt-1.5">
              {new Date(a.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {a.targetStationId && <span className="text-blue-400"> · {a.targetStationName || 'station ciblée'}</span>}
              {a.targetClientIds?.length > 0 && <span className="text-blue-400"> · {a.targetClientIds.length} client{a.targetClientIds.length > 1 ? 's' : ''} ciblé{a.targetClientIds.length > 1 ? 's' : ''}</span>}
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
  );
}
