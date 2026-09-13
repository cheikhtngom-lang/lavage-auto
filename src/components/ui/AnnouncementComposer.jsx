import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Megaphone, X, Loader2, CheckCircle2, Send } from 'lucide-react';

// Action rapide "Envoyer une annonce" — réutilisée par le Super Admin
// (-> toutes les stations) et par la station (-> ses clients). Voir
// add_announcements.sql / lib/announcements.js.
export default function AnnouncementComposer({ label = 'Annonce', recipientHint, onSend, recent = [], variant = 'pill' }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      await onSend({ title: title.trim(), message: message.trim() });
      setTitle('');
      setMessage('');
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    } catch (err) {
      setError(err.message || "Envoi impossible. Réessayez.");
    } finally {
      setSending(false);
    }
  };

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
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2"><Megaphone className="w-5 h-5 text-blue-400" /> {label}</h2>
              {recipientHint && <p className="text-neutral-500 text-sm mb-6">{recipientHint}</p>}

              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Titre</label>
                  <input
                    type="text" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex : Fermeture exceptionnelle demain"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Message</label>
                  <textarea
                    required rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder="Votre message..."
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 resize-none"
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
                  {sending ? 'Envoi...' : sent ? 'Envoyée !' : 'Envoyer'}
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
