import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, X, Loader2, Send, Ban, RefreshCw, Copy } from 'lucide-react';
import {
  TRANSFER_STATUS, isTransferOpen,
  listTransferRequests, createTransferRequest, cancelTransferRequest, resendTransferLink,
} from '../../lib/stationTransfer';

// Cession de station (Super Admin) — voir add_station_transfer.sql. Le
// Super Admin lance la demande ici ; le propriétaire la valide depuis son
// tableau de bord (StationTransferBanner), puis l'acquéreur active son compte
// via le lien reçu par email.

// ─── Modal : lancer une cession ──────────────────────────────────────────
export function TransferModal({ station, onClose, onCreated }) {
  const [acquirerName, setAcquirerName] = useState('');
  const [acquirerEmail, setAcquirerEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createTransferRequest({ stationId: station.id, acquirerName, acquirerEmail, note });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Impossible de créer la demande.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-white mb-1 pr-8 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-purple-400" /> Céder « {station.name} »
        </h2>
        <p className="text-neutral-400 text-sm mb-5">
          Propriétaire actuel : {station.ownerName || '—'}{station.ownerEmail ? ` (${station.ownerEmail})` : ''}.
          Il devra valider la cession depuis son tableau de bord ; l’acquéreur recevra ensuite un lien
          pour choisir son email et son mot de passe. Les données de la station ne bougent pas.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Nom de l’acquéreur</label>
            <input type="text" required maxLength={100} value={acquirerName} onChange={(e) => setAcquirerName(e.target.value)}
              placeholder="Prénom et nom"
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Email de l’acquéreur</label>
            <input type="email" required maxLength={150} value={acquirerEmail} onChange={(e) => setAcquirerEmail(e.target.value)}
              placeholder="acquereur@exemple.com"
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
            <p className="text-xs text-neutral-500 mt-1">Une adresse jamais utilisée sur la plateforme (le lien d’activation lui est envoyé).</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Note interne (facultatif)</label>
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ex : contrat de vente signé le …"
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 resize-none" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Envoyer la demande au propriétaire
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Liste des cessions ──────────────────────────────────────────────────
export function TransfersPanel({ refreshKey = 0 }) {
  const [requests, setRequests] = useState(null); // null = chargement
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [manualLink, setManualLink] = useState(null); // { id, link } quand l'email a échoué

  const load = useCallback(async () => {
    try {
      setRequests(await listTransferRequests());
    } catch (err) {
      setError(err.message || 'Chargement impossible.');
      setRequests([]);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (requests === null || requests.length === 0) {
    return error ? <p className="mt-8 text-sm text-red-400">{error}</p> : null;
  }

  const handleCancel = async (t) => {
    const msg = t.status === 'ceded'
      ? `Annuler la cession de « ${t.station_name} » ? L’ancien propriétaire retrouvera sa station et le lien de ${t.acquirer_name} ne fonctionnera plus.`
      : `Annuler la demande de cession de « ${t.station_name} » ?`;
    if (!window.confirm(msg)) return;
    setBusyId(t.id);
    setError('');
    try {
      await cancelTransferRequest(t.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleResend = async (t) => {
    setBusyId(t.id);
    setError('');
    setManualLink(null);
    try {
      const res = await resendTransferLink(t.id);
      if (res.link) setManualLink({ id: t.id, link: res.link });
      else window.alert(`Nouveau lien envoyé à ${t.acquirer_email}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-purple-400" /> Cessions de stations
        </h2>
        <button onClick={load} className="p-2 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition-colors" title="Actualiser">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}
      {manualLink && (
        <div className="mb-4 text-sm text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
          <p className="mb-2">L’email n’a pas pu partir. Transmettez ce lien à l’acquéreur (valable 7 jours) :</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-xs bg-black/30 rounded-lg px-3 py-2 text-orange-200">{manualLink.link}</code>
            <button onClick={() => navigator.clipboard?.writeText(manualLink.link)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg" title="Copier">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-neutral-400 text-sm bg-black/20">
              <th className="p-4 font-medium">Station</th>
              <th className="p-4 font-medium">Cédant → Acquéreur</th>
              <th className="p-4 font-medium">Statut</th>
              <th className="p-4 font-medium">Demandée le</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((t) => {
              const st = TRANSFER_STATUS[t.status] || TRANSFER_STATUS.cancelled;
              const open = isTransferOpen(t);
              const expired = t.status === 'ceded' && t.expires_at && new Date(t.expires_at) < new Date();
              return (
                <tr key={t.id} className="border-b border-white/5">
                  <td className="p-4 font-bold text-white whitespace-nowrap">{t.station_name}</td>
                  <td className="p-4 text-sm">
                    <p className="text-neutral-300">{t.seller_name || t.seller_email || '—'} <span className="text-neutral-500">→</span> {t.acquirer_name}</p>
                    <p className="text-neutral-500 text-xs">{t.acquirer_email}</p>
                    {t.note && <p className="text-neutral-500 text-xs italic mt-0.5">{t.note}</p>}
                  </td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full border whitespace-nowrap ${st.className}`}>{st.label}</span>
                    {expired && <p className="text-xs text-red-400 mt-1">Lien expiré</p>}
                  </td>
                  <td className="p-4 text-neutral-400 text-sm whitespace-nowrap">
                    {new Date(t.requested_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      {t.status === 'ceded' && (
                        <button
                          onClick={() => handleResend(t)}
                          disabled={busyId === t.id}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 disabled:opacity-60 text-neutral-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Renvoyer le lien
                        </button>
                      )}
                      {open && (
                        <button
                          onClick={() => handleCancel(t)}
                          disabled={busyId === t.id}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-60 text-neutral-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" /> Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
