import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Megaphone, X, Loader2, CheckCircle2, Send } from 'lucide-react';

// Action rapide "Envoyer une annonce" — réutilisée par le Super Admin
// (-> toutes les stations, ou une seule via `targetStations`) et par la
// station (-> ses clients, tous ou une sélection via `loadTargetClients`).
// Voir add_announcements.sql / add_announcement_targeting.sql /
// lib/announcements.js. Modale calquée sur celle de GestionImmo
// (admin-agences-tickets.js, #announcementModal) : "Sujet" + "Message" + un
// bouton dont le libellé dit lui-même qui reçoit l'annonce. `noValidate` +
// erreur inline plutôt que la validation native du navigateur, dont
// l'infobulle se positionne mal à l'intérieur d'une modale animée par
// Framer Motion (transform: scale).
export default function AnnouncementComposer({
  label = 'Annonce', submitLabel = 'Envoyer', onSend, recent = [], variant = 'pill',
  targetStations, loadTargetClients,
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  // Ciblage Super Admin -> une station précise (vide = toutes).
  const [targetStationId, setTargetStationId] = useState('');

  // Ciblage station -> clients précis (sinon tous ceux qui la connaissent).
  const [clientMode, setClientMode] = useState('all');
  const [knownClients, setKnownClients] = useState(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    if (open && loadTargetClients) {
      setLoadingClients(true);
      loadTargetClients()
        .then((list) => setKnownClients(list || []))
        .catch(() => setKnownClients([]))
        .finally(() => setLoadingClients(false));
    }
  }, [open, loadTargetClients]);

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
      if (loadTargetClients) payload.targetClientIds = clientMode === 'custom' ? selectedClientIds : null;
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
      : submitLabel;

  return (
    <>
      {variant === 'block' ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-white text-sm font-semibold transition-colors"
        >
          <Megaphone className="w-4 h-4 text-neutral-400" /> {label}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 md:py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors shadow-lg shadow-blue-500/20"
          title={label}
        >
          <Megaphone className="w-4 h-4" /> <span className="hidden sm:inline">{label}</span>
        </button>
      )}

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl relative max-h-[90vh] w-full max-w-lg flex flex-col overflow-hidden"
            >
              {/* En-tête fixe : toujours visible, même quand le formulaire
                  (ciblage + message) dépasse la hauteur de l'écran et que le
                  corps ci-dessous défile. */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0 border-b border-white/5">
                <h2 className="text-xl font-bold text-white">Nouvelle Annonce</h2>
                <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="px-6 pt-4 pb-6 overflow-y-auto">
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
                    <label className="block text-sm font-medium text-neutral-400 mb-1.5">Destinataires</label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button" onClick={() => setClientMode('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${clientMode === 'all' ? 'bg-blue-600 text-white' : 'bg-white/5 text-neutral-400 hover:text-white'}`}
                      >
                        Tous mes clients
                      </button>
                      <button
                        type="button" onClick={() => setClientMode('custom')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${clientMode === 'custom' ? 'bg-blue-600 text-white' : 'bg-white/5 text-neutral-400 hover:text-white'}`}
                      >
                        Choisir des clients
                      </button>
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

              {recent.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <h3 className="text-sm font-bold text-neutral-400 mb-3">Envoyées récemment</h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {recent.map((a) => (
                      <div key={a.id} className="text-sm border-b border-white/5 pb-2 last:border-0">
                        <p className="text-white font-medium">{a.title}</p>
                        <p className="text-neutral-500 text-xs mt-0.5">
                          {new Date(a.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
