import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, PackagePlus, ClipboardCheck, Boxes } from 'lucide-react';
import { stockLevel, addStockEntry, setProductStock, loadStockMovements, STOCK_MOVEMENTS, DEFAULT_LOW_STOCK_THRESHOLD } from '../../lib/shop';

// Stock d'UN produit : réapprovisionnement (entrée), correction après
// inventaire (quantité comptée), début / arrêt du suivi, et ses derniers
// mouvements. `product` est la version à jour (le parent recharge le
// catalogue après chaque changement via onChanged).

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  neutral: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
};
const LEVELS = {
  out: { label: 'Épuisé', cls: 'text-red-400' },
  low: { label: 'Stock bas', cls: 'text-amber-400' },
  ok: { label: 'En stock', cls: 'text-emerald-400' },
};
const formatDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ShopStockModal({ product, stationId, onClose, onChanged }) {
  const tracked = product.stock != null;
  const [mode, setMode] = useState('entree'); // 'entree' | 'correction'
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [movements, setMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(true);

  const refreshMovements = useCallback(async () => {
    try { setMovements(await loadStockMovements(stationId, { productId: product.id, limit: 8 })); }
    catch (err) { setError(err.message); }
    finally { setMovementsLoading(false); }
  }, [stationId, product.id]);
  useEffect(() => { refreshMovements(); }, [refreshMovements]);

  const n = parseInt(qty, 10);
  const valid = tracked && mode === 'entree' ? n >= 1 : n >= 0;
  const preview = !valid ? null
    : !tracked ? `Le stock suivi démarrera à ${n}.`
    : mode === 'entree' ? `Nouveau stock : ${product.stock + n}`
    : `Écart : ${n - product.stock > 0 ? '+' : ''}${n - product.stock} (stock ${product.stock} → ${n})`;

  const run = async (fn, okMessage) => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const newStock = await fn();
      setQty(''); setNote('');
      setSuccess(okMessage(newStock));
      await onChanged?.();
      await refreshMovements();
    } catch (err) {
      setError(err.message || 'Opération impossible.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    if (!tracked) return run(() => setProductStock(product.id, n, note || 'Début du suivi du stock'), (s) => `Suivi du stock démarré : ${s}.`);
    if (mode === 'entree') return run(() => addStockEntry(product.id, n, note), (s) => `Entrée enregistrée. Stock : ${s}.`);
    return run(() => setProductStock(product.id, n, note), (s) => `Stock corrigé : ${s}.`);
  };

  const stopTracking = () => {
    if (!window.confirm(`Ne plus suivre le stock de « ${product.name} » ? Il sera vendu « sur commande », sans contrôle de quantité.`)) return;
    run(() => setProductStock(product.id, null, null), () => 'Le stock de ce produit n\'est plus suivi.');
  };

  const level = stockLevel(product);
  const threshold = product.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white" aria-label="Fermer">
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold text-white mb-1 pr-8 flex items-center gap-2"><Boxes className="w-6 h-6 text-blue-400" /> Stock</h2>
        <p className="text-neutral-400 mb-5 truncate">{product.name}</p>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-5 flex items-center justify-between gap-4">
          {tracked ? (
            <>
              <div>
                <p className="text-4xl font-bold text-white leading-none">{product.stock}</p>
                <p className={`text-sm font-bold mt-1 ${LEVELS[level].cls}`}>{LEVELS[level].label}</p>
              </div>
              <p className="text-neutral-500 text-xs text-right">Alerte « stock bas » à partir de {threshold} article{threshold > 1 ? 's' : ''}<br />(modifiable dans la fiche produit)</p>
            </>
          ) : (
            <p className="text-neutral-300 text-sm">Le stock de ce produit n'est pas suivi : il est vendu <span className="text-white font-bold">sur commande</span>, sans contrôle de quantité. Indiquez combien vous en avez pour commencer le suivi.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tracked && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'entree', label: 'Réapprovisionner', icon: PackagePlus },
                { id: 'correction', label: 'Corriger (inventaire)', icon: ClipboardCheck },
              ].map((m) => (
                <button key={m.id} type="button" onClick={() => { setMode(m.id); setQty(''); setError(''); setSuccess(''); }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-bold transition-colors ${mode === m.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-950 border-white/10 text-neutral-400 hover:text-white'}`}>
                  <m.icon className="w-4 h-4" /> {m.label}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">
              {!tracked ? 'Quantité en stock aujourd\'hui' : mode === 'entree' ? 'Quantité reçue' : 'Quantité comptée en stock'}
            </label>
            <input type="number" min={tracked && mode === 'entree' ? 1 : 0} inputMode="numeric" required value={qty} onChange={(e) => setQty(e.target.value)}
              placeholder={tracked && mode === 'entree' ? 'Ex : 10' : 'Ex : 8'}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
            {preview && <p className="text-neutral-400 text-xs mt-1.5">{preview}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">
              {tracked && mode === 'correction' ? 'Motif' : 'Note'} <span className="text-neutral-600">(optionnel)</span>
            </label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
              placeholder={tracked && mode === 'correction' ? 'Ex : inventaire, casse, perte' : 'Ex : fournisseur, bon de livraison'}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {success && <p className="text-emerald-400 text-sm">{success}</p>}

          <button type="submit" disabled={!valid || saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {!tracked ? 'Commencer le suivi du stock' : mode === 'entree' ? 'Enregistrer l\'entrée' : 'Corriger le stock'}
          </button>
        </form>

        <div className="mt-6">
          <p className="text-sm font-bold text-neutral-400 uppercase tracking-wide mb-2">Derniers mouvements</p>
          {movementsLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-blue-400 animate-spin" /></div>
          ) : movements.length === 0 ? (
            <p className="text-neutral-500 text-sm">Aucun mouvement pour ce produit.</p>
          ) : (
            <div className="rounded-xl border border-white/5 divide-y divide-white/5">
              {movements.map((m) => {
                const meta = STOCK_MOVEMENTS[m.movement_type] || { label: m.movement_type, tone: 'neutral' };
                return (
                  <div key={m.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${TONES[meta.tone]}`}>{meta.label}</span>
                      {m.note && <p className="text-neutral-500 text-xs mt-1 truncate">{m.note}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-bold ${m.quantity > 0 ? 'text-emerald-400' : m.quantity < 0 ? 'text-red-400' : 'text-neutral-400'}`}>
                        {m.movement_type === 'suivi_arrete' ? '—' : `${m.quantity > 0 ? '+' : ''}${m.quantity}`}
                        {m.stock_after != null && <span className="text-neutral-500 font-normal"> → {m.stock_after}</span>}
                      </p>
                      <p className="text-neutral-600 text-[11px]">{formatDate(m.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {tracked && (
          <button type="button" onClick={stopTracking} disabled={saving}
            className="mt-5 text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2">
            Ne plus suivre le stock de ce produit (vente sur commande)
          </button>
        )}
      </motion.div>
    </div>
  );
}
