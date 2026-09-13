import React from 'react';
import { Send } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import AnnouncementForm from '../../components/announcements/AnnouncementForm';
import AnnouncementHistoryList from '../../components/announcements/AnnouncementHistoryList';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

export default function SuperAdminAnnouncements() {
  useDocumentTitle('Annonces');
  const { stations, platformAnnouncements, sendPlatformAnnouncement, retirePlatformAnnouncement } = useSuperAdminState();

  return (
    <div className="p-8 max-w-4xl mx-auto relative z-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight flex items-center gap-3">
          <Send className="w-8 h-8 text-purple-400" /> Annonces
        </h1>
        <p className="text-neutral-400 text-lg">Diffusez un message à toutes les stations partenaires, ou à une seule.</p>
      </div>

      <div className="glass-card rounded-2xl p-8 mb-8">
        <h2 className="text-xl font-bold text-white mb-6">Nouvelle annonce</h2>
        <AnnouncementForm
          onSend={sendPlatformAnnouncement}
          submitLabel="Envoyer à toutes les stations"
          targetStations={stations}
        />
      </div>

      <div className="glass-card rounded-2xl p-8">
        <h2 className="text-xl font-bold text-white mb-6">Annonces envoyées</h2>
        <AnnouncementHistoryList announcements={platformAnnouncements} onRetire={retirePlatformAnnouncement} />
      </div>
    </div>
  );
}
