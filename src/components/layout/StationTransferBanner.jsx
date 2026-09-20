import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, X, Download, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { clearSession, getCurrentRole } from '../../lib/accounts';
import { getPendingTransferForMyStation, cedeStation, rejectTransfer } from '../../lib/stationTransfer';

// Bandeau "cession de votre station" — visible uniquement par le propriétaire
// (compte 'admin', jamais un collaborateur) quand le Super Admin a lancé une
// cession (voir add_station_transfer.sql). Le propriétaire peut refuser, ou
// céder : sa session est alors fermée (son compte redevient un compte
// automobiliste et n'a plus aucun accès à la station).
export default function StationTransferBanner() {
  const isOwner = getCurrentRole() === 'admin';
  const [transfer, setTransfer] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    getPendingTransferForMyStation().then((t) => { if (!cancelled) setTransfer(t); });
    return () => { cancelled = true; };
  }, [isOwner]);

  if (!isOwner || !transfer) return null;

  const nameMatches = typedName.trim().toLowerCase() === transfer.station_name.trim().toLowerCase();

  const handleReject = async () => {
    if (!window.confirm(`Refuser la cession de « ${transfer.station_name} » ? La station reste à vous.`)) return;
    setBusy(true);
    setError('');
    try {
      await rejectTransfer(transfer.id);
      setTransfer(null);
    } catch (err) {
      setError(err.message || 'Impossible d’enregistrer votre refus.');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const { exportStationData } = await import('../../lib/rgpdExport');
      await exportStationData(transfer.station_id, transfer.station_name);
    } catch (err) {
      setError(err.message || 'Impossible de générer l’export.');
    } finally {
      setExporting(false);
    }
  };

  const handleCede = async () => {
    if (!nameMatches) return;
    setBusy(true);
    setError('');
    try {
      await cedeStation(transfer.id);
      setDone(true);
      // Le compte n'a plus accès à la station : on ferme la session pour de
      // bon (signOut, pas seulement les drapeaux locaux).
      setTimeout(async () => {
        await supabase.auth.signOut().catch(() => {});
        clearSession();
        window.location.replace('/login.html');
      }, 3500);
    } catch (err) {
      setError(err.message || 'La cession a échoué. Rien n’a été modifié.');
      setBusy(false);
    }
  };

  return (
    <>
      <div className="relative z-20 flex flex-col sm:flex-row sm:items-center gap-3 border-b px-6 py-3 text-sm bg-orange-500/15 border-orange-500/30">
        <span className="flex items-start gap-2 text-orange-300 flex-1">
          <ArrowRightLeft className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Demande de cession :</strong> l’administration souhaite céder <strong>{transfer.station_name}</strong> à{' '}
            <strong>{transfer.acquirer_name}</strong>.
          </span>
        </span>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleReject}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-60 font-medium"
          >
            Refuser
          </button>
          <button
            onClick={() => { setShowModal(true); setError(''); }}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-black font-bold disabled:opacity-60"
          >
            Céder
          </button>
        </div>
      </div>
      {error && !showModal && <p className="relative z-20 px-6 py-2 text-sm text-red-400 bg-red-500/10">{error}</p>}

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {!done && (
              <button onClick={() => setShowModal(false)} disabled={busy} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            )}

            {done ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-white mb-2">Cession effectuée</h2>
                <p className="text-neutral-400 text-sm">
                  {transfer.acquirer_name} va recevoir un email pour activer son compte.
                  Vous allez être déconnecté.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white mb-1 pr-8">Céder {transfer.station_name}</h2>
                <p className="text-neutral-400 text-sm mb-4">à {transfer.acquirer_name} ({transfer.acquirer_email})</p>

                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4 text-sm text-red-200 space-y-2">
                  <p className="flex items-start gap-2 font-semibold text-red-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> Cette action est définitive.
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-red-200/90">
                    <li>Vous n’aurez <strong>plus aucun accès</strong> à la station, immédiatement.</li>
                    <li>Toutes les données (clients, historique, équipe, abonnement) <strong>restent avec la station</strong> et passent au nouveau propriétaire.</li>
                    <li>Votre compte devient un compte automobiliste simple, avec le même email et le même mot de passe.</li>
                  </ul>
                </div>

                <button
                  onClick={handleExport}
                  disabled={exporting || busy}
                  className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 disabled:opacity-60 text-neutral-300 border border-white/10 font-medium py-2.5 rounded-xl transition-colors mb-4 text-sm"
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Télécharger une copie de mes données avant de céder
                </button>

                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  Pour confirmer, tapez le nom de la station : <span className="text-white">{transfer.station_name}</span>
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder={transfer.station_name}
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 mb-4"
                />

                {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

                <button
                  onClick={handleCede}
                  disabled={!nameMatches || busy}
                  className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Céder définitivement ma station
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
