import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, Loader2, Trash2, X } from 'lucide-react';
import { requestClosure, CLOSURE_DELAY_DAYS } from '../../lib/accountClosure';

// Zone « Fermer mon compte », commune aux Paramètres automobiliste, station et
// patron (voir add_account_closure.sql). La confirmation se fait en retapant
// `confirmWord` (FERMER, le nom de la station ou celui de l'entreprise) ; le
// serveur refait toutes les vérifications (file vide, pas de cession, etc.).
export default function CloseAccountCard({ title, intro, consequences, confirmWord, confirmHint, onExport, exportLabel, buttonLabel }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const matches = typed.trim().toLowerCase() === String(confirmWord || '').trim().toLowerCase() && typed.trim() !== '';

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError('');
  };

  const submit = async () => {
    if (!matches) return;
    setBusy(true);
    setError('');
    try {
      await requestClosure(typed, reason);
      // Le layout affiche désormais l'écran « Fermeture programmée ».
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    setError('');
    try {
      await onExport();
    } catch (err) {
      setError(err.message || "Impossible de générer l'export.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 md:p-8 border border-red-500/20 bg-red-500/[0.03] mt-8">
      <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
        <Trash2 className="w-5 h-5 text-red-400" /> {title}
      </h2>
      <p className="text-neutral-400 text-sm mb-5">{intro}</p>
      <button onClick={() => setOpen(true)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-semibold px-5 py-3 rounded-xl text-sm transition-colors">
        {buttonLabel}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={close}>
          <div className="w-full max-w-lg bg-neutral-900 border border-white/10 rounded-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400" /> {title}</h3>
              <button onClick={close} className="text-neutral-500 hover:text-white" aria-label="Fermer"><X className="w-5 h-5" /></button>
            </div>

            <ul className="space-y-2 mb-5 text-sm text-neutral-300">
              {consequences.map((c) => (
                <li key={c} className="flex gap-2"><span className="text-red-400 mt-0.5">•</span><span>{c}</span></li>
              ))}
              <li className="flex gap-2"><span className="text-emerald-400 mt-0.5">•</span><span>Vous avez <strong className="text-white">{CLOSURE_DELAY_DAYS} jours</strong> pour changer d'avis : reconnectez-vous et choisissez « Réactiver ». Passé ce délai, c'est définitif.</span></li>
            </ul>

            {onExport && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-5">
                <p className="text-sm text-neutral-300 mb-3">Avant de partir, gardez une copie de vos données.</p>
                <button onClick={doExport} disabled={exporting} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-60 text-neutral-200 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {exportLabel || 'Télécharger mes données (ZIP)'}
                </button>
              </div>
            )}

            <label className="block text-sm font-medium text-neutral-400 mb-1.5">Pourquoi partez-vous ? <span className="text-neutral-600">(facultatif)</span></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={2}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 mb-4" />

            <label className="block text-sm font-medium text-neutral-400 mb-1.5">{confirmHint}</label>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmWord} autoComplete="off"
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 mb-4" />

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button onClick={close} disabled={busy} className="px-5 py-3 rounded-xl text-sm font-medium text-neutral-300 bg-white/5 hover:bg-white/10 border border-white/10">Garder mon compte</button>
              <button onClick={submit} disabled={!matches || busy} className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirmer la fermeture
              </button>
            </div>
          </div>
        </div>,
        // Portail : le flou (backdrop-filter) de la carte piégerait le « fixed » de la fenêtre.
        document.body,
      )}
    </div>
  );
}
