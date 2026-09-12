import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ShoppingCart, Search, Store, MessageCircle, ArrowRight, Loader2, Tag, X, Plus, Minus, Smartphone, Truck, MapPin } from 'lucide-react';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { supabase } from '../../lib/supabaseClient';
import { loadClientShop, productWhatsAppLink, productPricing } from '../../lib/shop';
import { useClientAccount } from '../../hooks/useClientAccount';
import { payShopOnline } from '../../lib/paydunya';

export default function Shop() {
  useDocumentTitle('Boutique');
  const { account } = useClientAccount();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Toutes');
  const [promoOnly, setPromoOnly] = useState(false);

  const reload = useCallback(() => {
    loadClientShop()
      .then(setGroups)
      .catch((err) => setError(err.message || 'Chargement impossible.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Stock et prix promo mis à jour en direct : dès que la station modifie un
  // produit (vend une pièce, lance une promo…), la liste se rafraîchit.
  useEffect(() => {
    const ch = supabase
      .channel('client-shop')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_products' }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  // ─── Achat en ligne (add_shop_orders.sql) — un produit + une quantité,
  // retrait ou livraison, paiement PayDunya. Indisponible pour les promos
  // BOGO (voir create-shop-payment) : « Contacter la station » reste alors
  // le seul moyen, comme avant.
  const [buying, setBuying] = useState(null); // { station, product } | null
  const [quantity, setQuantity] = useState(1);
  const [fulfillmentType, setFulfillmentType] = useState('retrait');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [buySubmitting, setBuySubmitting] = useState(false);
  const [buyError, setBuyError] = useState('');

  const openBuy = (station, product) => {
    setBuying({ station, product });
    setQuantity(1);
    setFulfillmentType('retrait');
    setDeliveryAddress('');
    setDeliveryPhone(account?.phone || '');
    setBuyError('');
  };

  const buyingPricing = buying ? productPricing(buying.product) : null;
  const buyingUnitPrice = buyingPricing?.effective || 0;
  const buyingTotal = buyingUnitPrice * quantity;
  const buyingMaxQty = buying?.product.stock != null ? Math.max(1, buying.product.stock) : 20;

  const handleBuy = async (e) => {
    e.preventDefault();
    if (!buying || !account) return;
    if (fulfillmentType === 'livraison' && !deliveryAddress.trim()) {
      setBuyError('Adresse de livraison requise.');
      return;
    }
    setBuySubmitting(true);
    setBuyError('');
    try {
      await payShopOnline({
        stationId: buying.station.id, clientName: account.name, productId: buying.product.id, quantity,
        fulfillmentType, deliveryAddress: deliveryAddress.trim(), deliveryPhone: deliveryPhone.trim(),
      });
      // Redirection PayDunya en cours.
    } catch (err) {
      setBuySubmitting(false);
      setBuyError(err.message || "Le paiement n'a pas pu démarrer. Réessayez, ou contactez la station.");
    }
  };

  const categories = useMemo(() => {
    const set = new Set();
    groups.forEach((g) => g.products.forEach((p) => p.category && set.add(p.category)));
    return ['Toutes', ...Array.from(set).sort()];
  }, [groups]);

  const q = search.trim().toLowerCase();
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      products: g.products.filter((p) => {
        if (category !== 'Toutes' && p.category !== category) return false;
        if (promoOnly && !productPricing(p).onSale) return false;
        if (!q) return true;
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
        );
      }),
    }))
    .filter((g) => g.products.length > 0);

  const hasAnyPromo = groups.some((g) => g.products.some((p) => productPricing(p).onSale));

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl relative z-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 tracking-tight flex items-center gap-3">
          <ShoppingBag className="w-8 h-8 text-blue-400" /> La <span className="text-blue-400">Boutique</span>
        </h1>
        <p className="text-neutral-400 text-lg">Pièces et accessoires proposés par les stations où vous avez réservé.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : groups.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Store className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Aucune boutique pour l'instant</h3>
          <p className="text-neutral-400 mb-6">
            Réservez un lavage dans une station : si elle propose une boutique, ses produits apparaîtront ici.
          </p>
          <Link to="/dashboard/stations" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-colors">
            Trouver une station <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (pneu, huile moteur, pare-brise…)"
                className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {hasAnyPromo && (
              <button type="button" onClick={() => setPromoOnly((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors border ${promoOnly ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-neutral-900 border-white/10 text-neutral-300 hover:text-white'}`}>
                <Tag className="w-4 h-4" /> En promo
              </button>
            )}
          </div>

          {visibleGroups.length === 0 ? (
            <p className="text-neutral-500 text-center py-12">Aucun produit ne correspond à votre recherche.</p>
          ) : (
            <div className="space-y-10">
              {visibleGroups.map(({ station, products }) => (
                <div key={station.id}>
                  <div className="flex items-center gap-3 mb-4">
                    {station.logo_url
                      ? <img src={station.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/10" />
                      : <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><Store className="w-5 h-5 text-neutral-400" /></div>}
                    <div>
                      <h2 className="text-lg font-bold text-white">{station.name}</h2>
                      {(station.address || station.city) && (
                        <p className="text-neutral-500 text-xs">{[station.address, station.city].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {products.map((p) => {
                      const wa = productWhatsAppLink(station, p);
                      const pr = productPricing(p);
                      const outOfStock = p.stock === 0;
                      return (
                        <div key={p.id} className={`glass-card rounded-2xl overflow-hidden border border-white/5 flex flex-col ${outOfStock ? 'opacity-60' : ''}`}>
                          <div className="aspect-video bg-neutral-900 flex items-center justify-center overflow-hidden relative">
                            {p.image_url
                              ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                              : <Store className="w-10 h-10 text-neutral-700" />}
                            {pr.onSale && (
                              <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                                {pr.kind === 'percent' ? `-${pr.percent}%` : pr.label}
                              </span>
                            )}
                          </div>
                          <div className="p-4 flex flex-col flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-white leading-tight">{p.name}</p>
                              <span className="text-right whitespace-nowrap">
                                {pr.kind === 'percent' && (
                                  <span className="block text-neutral-500 text-xs line-through">{pr.original.toLocaleString('fr-FR')}</span>
                                )}
                                <span className={`font-bold ${pr.kind === 'percent' ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {pr.effective.toLocaleString('fr-FR')} {p.currency || 'FCFA'}
                                </span>
                              </span>
                            </div>
                            <p className="text-neutral-500 text-xs mt-1">
                              {p.category}
                              {p.stock != null && (outOfStock ? ' · Rupture de stock' : ` · ${p.stock} en stock`)}
                            </p>
                            {pr.kind === 'bogo' && (
                              <p className="text-red-400 text-xs font-bold mt-1">🎁 Offre : {pr.label}</p>
                            )}
                            {p.description && <p className="text-neutral-400 text-xs mt-2 line-clamp-3">{p.description}</p>}
                            <div className="mt-auto pt-3 space-y-2">
                              {outOfStock ? (
                                <p className="text-neutral-500 text-xs text-center font-medium">Bientôt de retour</p>
                              ) : (
                                <>
                                  {pr.kind !== 'bogo' && (
                                    <button type="button" onClick={() => openBuy(station, p)}
                                      className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2.5 px-3 rounded-xl transition-colors">
                                      <ShoppingCart className="w-4 h-4" /> Acheter — {pr.effective.toLocaleString('fr-FR')} FCFA
                                    </button>
                                  )}
                                  {wa ? (
                                    <a href={wa} target="_blank" rel="noopener noreferrer"
                                      className="w-full inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white text-sm font-bold py-2.5 px-3 rounded-xl transition-colors">
                                      <MessageCircle className="w-4 h-4" /> Contacter la station
                                    </a>
                                  ) : (
                                    <p className="text-neutral-600 text-xs text-center">Contactez la station à votre prochaine visite.</p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {buying && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button onClick={() => setBuying(null)} className="absolute top-4 right-4 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-blue-500/20 rounded-xl"><ShoppingCart className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <h2 className="text-xl font-bold text-white">Acheter</h2>
                  <p className="text-neutral-400 text-sm">{buying.product.name} · {buying.station.name}</p>
                </div>
              </div>
              <form onSubmit={handleBuy} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Quantité</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="p-2.5 rounded-xl bg-neutral-950 border border-white/10 text-white hover:border-white/20 transition-colors"><Minus className="w-4 h-4" /></button>
                    <span className="text-white font-bold text-lg w-8 text-center">{quantity}</span>
                    <button type="button" onClick={() => setQuantity((q) => Math.min(buyingMaxQty, q + 1))}
                      className="p-2.5 rounded-xl bg-neutral-950 border border-white/10 text-white hover:border-white/20 transition-colors"><Plus className="w-4 h-4" /></button>
                    {buying.product.stock != null && <span className="text-neutral-500 text-xs ml-2">{buying.product.stock} en stock</span>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Récupération</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setFulfillmentType('retrait')}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${fulfillmentType === 'retrait' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-950 border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'}`}>
                      <MapPin className="w-4 h-4" /> Retrait en station
                    </button>
                    <button type="button" onClick={() => setFulfillmentType('livraison')}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${fulfillmentType === 'livraison' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-950 border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'}`}>
                      <Truck className="w-4 h-4" /> Livraison
                    </button>
                  </div>
                </div>

                {fulfillmentType === 'livraison' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-400 mb-1.5">Adresse de livraison <span className="text-red-400">*</span></label>
                      <textarea rows={2} required value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Quartier, rue, repère..."
                        className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 resize-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-400 mb-1.5">Téléphone pour la livraison</label>
                      <input type="tel" value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)}
                        className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                  </>
                )}

                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-neutral-400 text-sm">Total à payer</span>
                  <span className="text-lg font-bold text-white">{buyingTotal.toLocaleString('fr-FR')} <span className="text-xs font-medium text-neutral-400">FCFA</span></span>
                </div>

                {buyError && <p className="text-red-400 text-sm">{buyError}</p>}

                <button type="submit" disabled={buySubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
                  {buySubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Smartphone className="w-5 h-5" /> Payer en ligne — {buyingTotal.toLocaleString('fr-FR')} FCFA</>}
                </button>
                <p className="text-neutral-600 text-xs text-center">Wave, Orange Money ou carte, via PayDunya.</p>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
