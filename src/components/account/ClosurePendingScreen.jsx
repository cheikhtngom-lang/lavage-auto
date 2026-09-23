import React, { useEffect, useState } from 'react';
import { CalendarClock, Download, Loader2, LogOut, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { clearSession } from '../../lib/accounts';
import { getMyClosure, cancelClosure, fmtClosureDate } from '../../lib/accountClosure';

// Fermeture programmée (voir add_account_closure.sql) : tant que la demande
// court, le compte n'a plus accès à son espace — seulement annuler (titulaire),
// télécharger ses données, ou se déconnecter. Vérifié au montage de chaque
// layout ; null = rien en cours (cas normal, aucun écran ajouté).
export function useMyClosure() {
  const [closure, setClosure] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getMyClosure().then((c) => { if (!cancelled) setClosure(c); }).catch(() => { /* hors ligne : on n'empêche pas l'accès */ });
    return () => { cancelled = true; };
  }, []);
  return closure;
}

const WHAT = {
  automobiliste: 'votre compte',
  station: 'la station',
  groupe: 'votre espace entreprise et les stations que vous avez créées',
};

export default function ClosurePendingScreen({ closure, onExport, exportLabel }) {
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    clearSession();
    window.location.replace(window.location.origin + '/index.html');
  };

  const reactivate = async () => {
    setBusy(true);
    setError('');
    try {
      await cancelClosure();
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

  const what = closure.kind === 'station' && closure.label ? `la station « ${closure.label} »` : (WHAT[closure.kind] || 'votre compte');

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg glass-card rounded-3xl border border-red-500/20 bg-white/[0.03] p-6 md:p-8">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
          <CalendarClock className="w-6 h-6 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Fermeture programmée</h1>
        {closure.can_cancel ? (
          <p className="text-neutral-300 mb-4">
            Vous avez demandé la fermeture de {what}. Elle sera définitive le <strong className="text-white">{fmtClosureDate(closure.scheduled_for)}</strong> :
            les comptes seront supprimés et l'historique rendu anonyme.
          </p>
        ) : (
          <p className="text-neutral-300 mb-4">
            {closure.label ? `La station « ${closure.label} »` : 'Cette station'} ferme : son propriétaire a demandé la fermeture, effective le{' '}
            <strong className="text-white">{fmtClosureDate(closure.scheduled_for)}</strong>. Votre accès est suspendu, et votre compte sera supprimé à cette date.
          </p>
        )}
        {closure.can_cancel && (
          <p className="text-neutral-400 text-sm mb-6">Vous avez changé d'avis ? Réactivez votre compte : tout redevient comme avant, rien n'a encore été supprimé.</p>
        )}

        <div className="flex flex-col gap-3">
          {closure.can_cancel && (
            <button onClick={reactivate} disabled={busy} className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 px-5 rounded-xl transition-colors">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Annuler la fermeture et réactiver
            </button>
          )}
          {closure.can_cancel && onExport && (
            <button onClick={doExport} disabled={exporting} className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-60 text-neutral-200 font-medium py-3 px-5 rounded-xl transition-colors">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {exportLabel || 'Télécharger mes données (ZIP)'}
            </button>
          )}
          <button onClick={logout} className="flex items-center justify-center gap-2 text-neutral-400 hover:text-white py-2.5 text-sm transition-colors">
            <LogOut className="w-4 h-4" /> Se déconnecter
          </button>
        </div>
        {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
      </div>
    </div>
  );
}
