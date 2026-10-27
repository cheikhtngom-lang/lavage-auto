import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Search, Plus, Minus, Trash2, Store, ShoppingCart, CheckCircle2, AlertTriangle, Printer, MessageCircle } from 'lucide-react';
import { productPricing, stockLevel, recordShopSale, SALE_PAYMENT_METHODS } from '../../lib/shop';
import { toReceipt, printReceipt, sendReceiptWhatsApp } from '../../lib/shopReceipt';
import { useAppState } from '../../hooks/useAppState';

// Saisie d'une vente sur place (le client est venu acheter en station) :
// produits + quantités + prix + moyen de paiement. Le serveur
// (shop_record_sale) baisse le stock, refuse une vente supérieure au stock et
// crée la recette dans la Comptabilité — l'écran ne fait que prévenir avant.

const fcfa = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;

function stockLabel(p) {
  const level = stockLevel(p);
  if (level === null) return { text: 'Sur commande', cls: 'text-neutral-500' };
  if (level === 'out') return { text: 'Épuisé', cls: 'text-red-400' };
  if (level === 'low') return { text: `Stock bas : ${p.stock}`, cls: 'text-amber-400' };
  return { text: `${p.stock} en stock`, cls: 'text-neutral-400' };
}

export default function ShopSaleModal({ products, initialProductId, onClose, onSaved }) {
  const { stationProfile } = useAppState();
  const lineFor = (p) => ({ productId: p.id, quantity: '1', unitPrice: String(productPricing(p).effective) });
  const initialLines = () => {
    const p = products.find((x) => x.id === initialProductId);
    return p && stockLevel(p) !== 'out' ? [lineFor(p)] : [];
  };

  const [lines, setLines] = useState(initialLines);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('Espèces');
  const [clientName, setClientName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // vente enregistrée (écran de confirmation)

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const q = search.trim().toLowerCase();
  const results = products
    .filter((p) => !q || (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.name || '').localeCompare(b.name || '', 'fr'));

  // Une seule ligne par produit : « Ajouter » sur un produit déjà présent fait +1.
  const addProduct = (p) => {
    setError('');
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: String((parseInt(l.quantity, 10) || 0) + 1) } : l));
      return [...prev, lineFor(p)];
    });
  };
  const updateLine = (productId, patch) => setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  const removeLine = (productId) => setLines((prev) => prev.filter((l) => l.productId !== productId));

  const checked = lines.map((l) => {
    const p = byId.get(l.productId);
    const qty = parseInt(l.quantity, 10);
    const price = parseInt(l.unitPrice, 10);
    let problem = '';
    if (!p) problem = "Ce produit n'existe plus.";
    else if (!(qty >= 1)) problem = 'Quantité : au moins 1.';
    else if (p.stock != null && qty > p.stock) problem = p.stock === 0 ? 'Épuisé : plus aucun article en stock.' : `Stock insuffisant : ${p.stock} disponible${p.stock > 1 ? 's' : ''}.`;
    else if (!(price >= 0)) problem = 'Indiquez un prix.';
    return { ...l, product: p, qty: qty || 0, price: price || 0, problem };
  });
  const total = checked.reduce((s, l) => s + l.qty * l.price, 0);
  const canSubmit = checked.length > 0 && checked.every((l) => !l.problem) && !saving;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true); setError('');
    try {
      const result = await recordShopSale({
        items: checked.map((l) => ({ productId: l.productId, quantity: l.qty, unitPrice: l.price })),
        paymentMethod: method, clientName, note,
      });
      setDone({ ...result, method });
      onSaved?.(result);
    } catch (err) {
      setError(err.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const startNewSale = () => {
    setDone(null); setLines([]); setSearch(''); setClientName(''); setNote(''); setMethod('Espèces'); setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="modal-close" aria-label="Fermer">
          <X className="w-6 h-6" />
        </button>

        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Vente enregistrée</h2>
            <p className="text-3xl font-bold text-emerald-400 mb-1">{fcfa(done.amount)}</p>
            <p className="text-neutral-400 mb-4">Payé en {done.method}</p>
            <ul className="text-sm text-neutral-300 mb-5 space-y-1">
              {(done.items || []).map((it) => (
                <li key={it.product_id}>{it.name} × {it.quantity} — {fcfa(it.amount)}</li>
              ))}
            </ul>
            <p className="text-neutral-500 text-sm mb-6">Le stock est mis à jour et la recette est ajoutée à la Comptabilité.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-3">
              <button type="button" onClick={() => printReceipt(toReceipt(done, { method: done.method, clientName, note }), stationProfile)}
                className="px-6 py-3 rounded-xl font-bold bg-white/5 text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                <Printer className="w-5 h-5" /> Imprimer le reçu
              </button>
              <button type="button" onClick={() => sendReceiptWhatsApp(toReceipt(done, { method: done.method, clientName, note }), stationProfile)}
                className="px-6 py-3 rounded-xl font-bold bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 transition-colors flex items-center justify-center gap-2">
                <MessageCircle className="w-5 h-5" /> Reçu WhatsApp
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={startNewSale}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
                <ShoppingCart className="w-5 h-5" /> Nouvelle vente
              </button>
              <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold bg-white/5 text-neutral-300 hover:bg-white/10 transition-colors">
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-white mb-1 pr-8">Enregistrer une vente</h2>
            <p className="text-neutral-400 text-sm mb-6">Un client achète sur place : choisissez les produits, la quantité et le moyen de paiement.</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Produits</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit (nom, catégorie)…"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                  {results.length === 0 ? (
                    <p className="text-neutral-500 text-sm text-center py-6">{products.length === 0 ? 'Aucun produit dans la boutique.' : 'Aucun produit ne correspond.'}</p>
                  ) : results.map((p) => {
                    const sl = stockLabel(p);
                    const inCart = lines.find((l) => l.productId === p.id);
                    const full = p.stock != null && (parseInt(inCart?.quantity, 10) || 0) >= p.stock;
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="w-10 h-10 rounded-lg bg-neutral-800 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <Store className="w-4 h-4 text-neutral-600" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">{p.name}{!p.active && <span className="text-amber-400 text-xs font-normal"> · masqué</span>}</p>
                          <p className="text-xs"><span className="text-emerald-400 font-bold">{fcfa(productPricing(p).effective)}</span> <span className={sl.cls}>· {sl.text}</span></p>
                        </div>
                        <button type="button" onClick={() => addProduct(p)} disabled={full}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold transition-colors flex-shrink-0">
                          <Plus className="w-3.5 h-3.5" /> {inCart ? '+1' : 'Ajouter'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-neutral-400 mb-2 flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Vente en cours</p>
                {checked.length === 0 ? (
                  <p className="text-neutral-500 text-sm rounded-xl border border-dashed border-white/10 py-5 text-center">Ajoutez un ou plusieurs produits ci-dessus.</p>
                ) : (
                  <div className="space-y-2">
                    {checked.map((l) => (
                      <div key={l.productId} className={`rounded-xl border p-3 ${l.problem ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-white font-medium text-sm truncate">{l.product?.name || 'Produit supprimé'}</p>
                            {l.product && <p className={`text-xs ${stockLabel(l.product).cls}`}>{stockLabel(l.product).text}</p>}
                          </div>
                          <button type="button" onClick={() => removeLine(l.productId)} title="Retirer"
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <span className="block text-[11px] text-neutral-500 mb-1">Quantité</span>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => updateLine(l.productId, { quantity: String(Math.max(1, l.qty - 1)) })}
                                className="p-2 rounded-lg bg-white/5 text-neutral-300 hover:bg-white/10" aria-label="Moins"><Minus className="w-3.5 h-3.5" /></button>
                              <input type="number" min="1" inputMode="numeric" value={l.quantity} onChange={(e) => updateLine(l.productId, { quantity: e.target.value })}
                                aria-label="Quantité" className="w-16 bg-neutral-950 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center focus:outline-none focus:border-blue-500" />
                              <button type="button" onClick={() => updateLine(l.productId, { quantity: String(l.qty + 1) })}
                                className="p-2 rounded-lg bg-white/5 text-neutral-300 hover:bg-white/10" aria-label="Plus"><Plus className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                          <div>
                            <span className="block text-[11px] text-neutral-500 mb-1">Prix unitaire (FCFA)</span>
                            <input type="number" min="0" step="50" inputMode="numeric" value={l.unitPrice} onChange={(e) => updateLine(l.productId, { unitPrice: e.target.value })}
                              aria-label="Prix unitaire" className="w-28 bg-neutral-950 border border-white/10 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500" />
                          </div>
                          <p className="ml-auto text-white font-bold">{fcfa(l.qty * l.price)}</p>
                        </div>
                        {l.problem && <p className="text-red-400 text-xs mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {l.problem}</p>}
                        {!l.problem && l.product && productPricing(l.product).kind === 'bogo' && (
                          <p className="text-neutral-500 text-xs mt-2">Offre en cours : {productPricing(l.product).label} — comptez les articles offerts dans la quantité, avec le prix total payé.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Moyen de paiement</label>
                <div role="radiogroup" aria-label="Moyen de paiement" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SALE_PAYMENT_METHODS.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
                      className={`py-2.5 rounded-xl border text-sm font-bold transition-colors ${method === m ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-950 border-white/10 text-neutral-400 hover:text-white'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Client <span className="text-neutral-600">(optionnel)</span></label>
                  <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client de passage" maxLength={80}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Note <span className="text-neutral-600">(optionnel)</span></label>
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : remise accordée" maxLength={200}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="pt-4 border-t border-white/10">
                <button type="submit" disabled={!canSubmit}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Valider la vente{checked.length > 0 ? ` — ${fcfa(total)}` : ''}
                </button>
              </div>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
