import React, { useState } from 'react';
import { CreditCard, Loader2, CheckCircle2, Smartphone } from 'lucide-react';
import { payPlatformOnline } from '../../lib/paydunya';
import { setOrderPaymentInfo, fmtFcfa } from '../../lib/groups';

// Règlement d'une commande de groupe (déjà créée en PENDING côté serveur, avec
// son montant définitif) : paiement en ligne PayDunya, ou déclaration d'un
// paiement Wave / Orange Money que le Super Admin confirme ensuite à la main.
export default function OrderPaymentPanel({ order, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [method, setMethod] = useState('Wave');
  const [reference, setReference] = useState('');

  const declared = order.method || order.reference;

  const payOnline = async () => {
    setBusy(true);
    setError('');
    try {
      await payPlatformOnline({ kind: 'group', rowId: order.id }); // redirige vers PayDunya
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const declare = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await setOrderPaymentInfo(order.id, method, reference);
      setShowManual(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={payOnline}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
        Payer {fmtFcfa(order.amount)} en ligne
      </button>

      {declared ? (
        <div className="flex items-start gap-2 text-sm text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Paiement déclaré ({order.method || '—'}{order.reference ? ` · réf. ${order.reference}` : ''}). Il sera activé dès que l’administration l’aura confirmé.</span>
        </div>
      ) : showManual ? (
        <form onSubmit={declare} className="space-y-3 bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-neutral-400">
            Envoyez {fmtFcfa(order.amount)} par Wave ou Orange Money, puis indiquez la référence de la transaction. Votre offre est activée après confirmation par l’administration.
          </p>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500">
            <option>Wave</option>
            <option>Orange Money</option>
            <option>Autre</option>
          </select>
          <input required maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence de la transaction"
            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowManual(false)} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-sm">Annuler</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-sm">
              J’ai payé — envoyer la référence
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowManual(true)} className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 font-medium py-3 rounded-xl transition-colors text-sm">
          <Smartphone className="w-4 h-4" /> Payer par Wave / Orange Money
        </button>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
