import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, Send } from 'lucide-react';

// Formulaire d'envoi d'annonce, en ligne (pas de modale — voir
// add_announcements.sql / add_announcement_targeting.sql / lib/announcements.js).
// Réutilisé par les pages dédiées Super Admin (-> une station ou toutes) et
// station (-> des clients précis ou tous). Anciennement dans une modale
// (AnnouncementComposer) : sortie de là pour ne plus dépendre d'une hauteur
// de fenêtre fixe, la cause des soucis d'affichage récurrents.
export default function AnnouncementForm({ onSend, submitLabel = 'Envoyer', targetStations, loadTargetClients }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const [targetStationId, setTargetStationId] = useState('');

  const [clientMode, setClientMode] = useState('all');
  const [knownClients, setKnownClients] = useState(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    if (!loadTargetClients) return;
    setLoadingClients(true);
    loadTargetClients()
      .then((list) => setKnownClients(list || []))
      .catch(() => setKnownClients([]))
      .finally(() => setLoadingClients(false));
  }, [loadTargetClients]);

  const toggleClient = (id) => {
    setSelectedClientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const selectAllSubscribers = () => {
    setSelectedClientIds((knownClients || []).filter((c) => c.isSubscriber).map((c) => c.clientId));
  };
  const clientSearchLower = clientSearch.trim().toLowerCase();
  const filteredClients = (knownClients || []).filter((c) =>
    !clientSearchLower || (c.name || '').toLowerCase().includes(clientSearchLower) || (c.phone || '').includes(clientSearchLower)
  );

  // Nombre de clients (avec compte) que la station connaît — indicatif : un
  // client qui n'a qu'un favori, ou un abonné saisi par téléphone sans compte
  // relié, reçoit l'annonce sans figurer dans ce décompte.
  const audienceCounts = {
    all: (knownClients || []).length,
    subscribers: (knownClients || []).filter((c) => c.isSubscriber && c.subscriptionStatus === 'actif').length,
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError('Merci de renseigner un sujet et un message.');
      return;
    }
    if (loadTargetClients && clientMode === 'custom' && selectedClientIds.length === 0) {
      setError('Sélectionnez au moins un client, ou choisissez « Tous mes clients ».');
      return;
    }
    setSending(true);
    setError('');
    try {
      const payload = { title: title.trim(), message: message.trim() };
      if (targetStations) payload.targetStationId = targetStationId || null;
      if (loadTargetClients) {
        payload.targetClientIds = clientMode === 'custom' ? selectedClientIds : null;
        payload.audience = clientMode === 'subscribers' ? 'subscribers' : 'all';
      }
      await onSend(payload);
      setTitle('');
      setMessage('');
      setTargetStationId('');
      setClientMode('all');
      setSelectedClientIds([]);
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    } catch (err) {
      setError(err.message || "Envoi impossible. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  const selectedStationName = targetStations?.find((s) => s.id === targetStationId)?.name;
  const computedSubmitLabel = targetStations
    ? (targetStationId ? `Envoyer à ${selectedStationName || 'la station'}` : submitLabel)
    : (loadTargetClients && clientMode === 'custom')
      ? `Envoyer à ${selectedClientIds.length} client${selectedClientIds.length > 1 ? 's' : ''}`
      : (loadTargetClients && clientMode === 'subscribers')
        ? 'Envoyer à mes abonnés'
        : submitLabel;

  return (
    <form onSubmit={handleSend} noValidate className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-1.5">Sujet</label>
        <input
          type="text" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Mise à jour système..."
          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {targetStations && (
        <div>
          <label className="block text-sm font-medium text-neutral-400 mb-1.5">Destinataire</label>
          <select
            value={targetStationId} onChange={(e) => setTargetStationId(e.target.value)}
            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Toutes les stations</option>
            {targetStations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {loadTargetClients && (
        <div>
          <label className="block text-sm font-medium text-neutral-400 mb-1.5">Qui verra cette annonce ?</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            {[
              { id: 'all', label: 'Tous mes clients', hint: `Tous ceux qui ont déjà réservé chez vous, abonnés ou non${knownClients ? ` (${audienceCounts.all} avec un compte)` : ''}.` },
              { id: 'subscribers', label: 'Mes abonnés', hint: `Seulement les clients avec un abonnement mensuel actif${knownClients ? ` (${audienceCounts.subscribers})` : ''}.` },
              { id: 'custom', label: 'Choisir des clients', hint: 'Une sélection précise, un par un.' },
            ].map((opt) => (
              <button
                key={opt.id} type="button" onClick={() => setClientMode(opt.id)}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${clientMode === opt.id ? 'bg-blue-600/15 border-blue-500' : 'bg-neutral-950 border-white/10 hover:border-white/25'}`}
              >
                <span className={`block text-sm font-semibold ${clientMode === opt.id ? 'text-blue-300' : 'text-white'}`}>{opt.label}</span>
                <span className="block text-[11px] leading-snug text-neutral-500 mt-0.5">{opt.hint}</span>
              </button>
            ))}
          </div>

          {clientMode === 'custom' && (
            <div className="border border-white/10 rounded-xl p-3 bg-neutral-950/50">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Rechercher un client..."
                  className="flex-1 bg-neutral-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                />
                <button type="button" onClick={selectAllSubscribers} className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap flex-shrink-0">
                  Tous les abonnés
                </button>
              </div>
              {loadingClients ? (
                <p className="text-neutral-500 text-sm py-2">Chargement...</p>
              ) : filteredClients.length === 0 ? (
                <p className="text-neutral-500 text-sm py-2">Aucun client trouvé.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filteredClients.map((c) => (
                    <label key={c.clientId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                      <input
                        type="checkbox" checked={selectedClientIds.includes(c.clientId)} onChange={() => toggleClient(c.clientId)}
                        className="rounded border-white/20 bg-neutral-950 text-blue-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="text-sm text-white flex-1 truncate">{c.name}</span>
                      {c.isSubscriber && <span className="text-emerald-400 text-[11px] font-medium flex-shrink-0">Abonné</span>}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-neutral-600 text-xs mt-2">
                {selectedClientIds.length} client{selectedClientIds.length > 1 ? 's' : ''} sélectionné{selectedClientIds.length > 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-1.5">Message</label>
        <textarea
          required maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
          className="w-full min-h-[140px] bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 resize-y"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit" disabled={sending}
        className={`w-full font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
          sent ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white'
        }`}
      >
        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : sent ? <CheckCircle2 className="w-5 h-5" /> : <Send className="w-5 h-5" />}
        {sending ? 'Envoi...' : sent ? 'Envoyée !' : computedSubmitLabel}
      </button>
    </form>
  );
}
