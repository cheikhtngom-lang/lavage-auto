import React from 'react';
import { Send } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import AnnouncementForm from '../../components/announcements/AnnouncementForm';
import AnnouncementHistoryList from '../../components/announcements/AnnouncementHistoryList';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

export default function Announcements() {
  useDocumentTitle('Annonces');
  const { sentAnnouncements, sendStationAnnouncement, retireStationAnnouncement, loadStationKnownClients } = useAppState();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Send className="w-8 h-8 text-blue-400" /> Annonces
        </h1>
        <p className="text-neutral-400 mt-2">Diffusez un message à vos clients — tous ceux qui ont réservé chez vous, vos abonnés seulement, ou une sélection précise.</p>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-6">Nouvelle annonce</h2>
        <AnnouncementForm
          onSend={sendStationAnnouncement}
          submitLabel="Envoyer à vos clients"
          loadTargetClients={loadStationKnownClients}
        />
      </div>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-6">Annonces envoyées</h2>
        <AnnouncementHistoryList announcements={sentAnnouncements} onRetire={retireStationAnnouncement} />
      </div>
    </div>
  );
}
