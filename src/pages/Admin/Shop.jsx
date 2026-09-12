import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, Plus, Pencil, Trash2, X, Loader2, ImagePlus, Eye, EyeOff, PackageSearch, Search, Minus, Tag, ClipboardList, CheckCircle2, XCircle, Truck, MapPin } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useAppState } from '../../hooks/useAppState';
import { getCurrentStationId } from '../../lib/accounts';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import {
  SHOP_CATEGORIES, MAX_SHOP_IMAGE_SIZE, stationHasShop, productPricing, promoStatus,
  loadStationProducts, saveProduct, setProductActive, deleteProduct, adjustStock,
} from '../../lib/shop';

const emptyForm = {
  id: null, name: '', description: '', category: 'Pneus', price: '', stock: '',
  promoType: '', promoPercent: '', promoBuyQty: '2', promoFreeQty: '1',
  promoStartDate: '', promoStartTime: '', promoEndDate: '', promoEndTime: '',
  imageUrl: null, active: true,
};
const PERCENT_PRESETS = [10, 20, 30, 50];

// ISO -> { date: 'AAAA-MM-JJ', time: 'HH:MM' } en heure locale.
function splitLocal(iso) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
// date + heure (heure optionnelle) -> chaîne 'AAAA-MM-JJTHH:MM' ou '' si pas de date.
function combineLocal(date, time, fallbackTime) {
  if (!date) return '';
  return `${date}T${time || fallbackTime}`;
}

export default function Shop() {
  useDocumentTitle('Boutique');
  const { stationBilling, shopOrders, updateShopOrderStatus } = useAppState();
  const stationId = getCurrentStationId();
  const canShop = stationHasShop(stationBilling);

  const [view, setView] = useState('produits'); // 'produits' | 'commandes'
  const [orderUpdating, setOrderUpdating] = useState({});
  const handleOrderStatus = async (id, status) => {
    setOrderUpdating((prev) => ({ ...prev, [id]: true }));
    await updateShopOrderStatus(id, status);
    setOrderUpdating((prev) => ({ ...prev, [id]: false }));
  };

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [imageError, setImageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!stationId || stationId === 'default') { setLoading(false); return; }
    try {
      setProducts(await loadStationProducts(stationId));
    } catch (err) {
      setError(err.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const openAdd = () => { setForm(emptyForm); setImageError(''); setError(''); setShowModal(true); };
  const openEdit = (p) => {
    setForm({
      id: p.id, name: p.name, description: p.description || '', category: p.category || 'Autre',
      price: String(p.price ?? ''), stock: p.stock == null ? '' : String(p.stock),
      promoType: p.promo_type || '',
      promoPercent: p.promo_percent == null ? '' : String(p.promo_percent),
      promoBuyQty: p.promo_buy_qty == null ? '2' : String(p.promo_buy_qty),
      promoFreeQty: p.promo_free_qty == null ? '1' : String(p.promo_free_qty),
      promoStartDate: splitLocal(p.promo_starts_at).date,
      promoStartTime: splitLocal(p.promo_starts_at).time,
      promoEndDate: splitLocal(p.promo_ends_at).date,
      promoEndTime: splitLocal(p.promo_ends_at).time,
      imageUrl: p.image_url || null, active: p.active,
    });
    setImageError(''); setError(''); setShowModal(true);
  };

  const handleStock = async (p, delta) => {
    try { await adjustStock(p.id, delta); await refresh(); }
    catch (err) { setError(err.message); }
  };

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageError('');
    if (!file.type.startsWith('image/')) { setImageError('Choisissez un fichier image (PNG, JPG…).'); return; }
    if (file.size > MAX_SHOP_IMAGE_SIZE) { setImageError('Image trop lourde (max 1,5 Mo).'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, imageUrl: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.price === '') return;
    if (form.promoType === 'percent') {
      const n = Number(form.promoPercent);
      if (!(n >= 1 && n <= 99)) { setError('La remise doit être comprise entre 1 % et 99 %.'); return; }
    }
    if (form.promoType === 'bogo') {
      if (!(Number(form.promoBuyQty) >= 1 && Number(form.promoFreeQty) >= 1)) {
        setError('Renseignez « X achetés » et « Y offerts » (au moins 1 chacun).'); return;
      }
    }
    const promoStartsAt = combineLocal(form.promoStartDate, form.promoStartTime, '00:00');
    const promoEndsAt = combineLocal(form.promoEndDate, form.promoEndTime, '23:59');
    if (form.promoType && promoStartsAt && promoEndsAt &&
        new Date(promoEndsAt) <= new Date(promoStartsAt)) {
      setError('La fin de la promo doit être après son début.'); return;
    }
    setSaving(true); setError('');
    try {
      await saveProduct(stationId, { ...form, promoStartsAt, promoEndsAt });
      setShowModal(false);
      await refresh();
    } catch (err) {
      setError(err.message || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    try { await setProductActive(p.id, !p.active); await refresh(); }
    catch (err) { setError(err.message); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Supprimer définitivement « ${p.name} » de la boutique ?`)) return;
    try { await deleteProduct(p.id); await refresh(); }
    catch (err) { setError(err.message); }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q))
    : products;

  // Garde-fou d'affichage : la route est déjà protégée (RequireShopAccess),
  // mais si la facturation change en cours de session on reste cohérent.
  if (stationBilling && !canShop) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-8 text-center">
            <Store className="w-10 h-10 text-neutral-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Boutique réservée au forfait Business</h1>
            <p className="text-neutral-400">
              Passez au forfait Business (ou demandez le module « Boutique » au support)
              pour vendre vos produits — pneus, huiles, pare-brise… — à vos clients.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight flex items-center gap-3">
            <Store className="w-8 h-8 text-emerald-400" /> Ma <span className="text-blue-400">Boutique</span>
          </h1>
          <p className="text-neutral-400 text-lg">Vendez vos produits (pneus, huiles, pare-brise…) à vos clients.</p>
        </div>
        {view === 'produits' && (
          <button onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2">
            <Plus className="w-5 h-5" /> Ajouter un produit
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-8 border-b border-white/10">
        {[
          { id: 'produits', label: 'Produits', icon: Store },
          { id: 'commandes', label: `Commandes${shopOrders.filter((o) => o.status === 'confirmee').length > 0 ? ` (${shopOrders.filter((o) => o.status === 'confirmee').length})` : ''}`, icon: ClipboardList },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setView(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${view === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {view === 'commandes' ? (
        shopOrders.length === 0 ? (
          <Card className="border-white/5 bg-white/[0.02] border-dashed">
            <CardContent className="p-12 text-center">
              <ClipboardList className="w-10 h-10 text-neutral-500 mx-auto mb-4" />
              <p className="text-neutral-300 font-medium mb-1">Aucune commande pour l'instant</p>
              <p className="text-neutral-500 text-sm">Les achats payés en ligne par vos clients apparaîtront ici.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {shopOrders.map((o) => (
              <div key={o.id} className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 last:border-0">
                <div className="min-w-[200px]">
                  <p className="font-bold text-white">{o.productName} <span className="text-neutral-500 font-normal">x{o.quantity}</span></p>
                  <p className="text-neutral-500 text-xs mt-1">{o.clientName} · {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="min-w-[160px]">
                  {o.fulfillmentType === 'livraison' ? (
                    <p className="text-sm text-neutral-300 flex items-start gap-1.5"><Truck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" /> <span>Livraison<br /><span className="text-neutral-500 text-xs">{o.deliveryAddress}{o.deliveryPhone ? ` · ${o.deliveryPhone}` : ''}</span></span></p>
                  ) : (
                    <p className="text-sm text-neutral-300 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-emerald-400" /> Retrait en station</p>
                  )}
                </div>
                <div className="text-right min-w-[100px]">
                  <p className="text-white font-bold">{(o.amount || 0).toLocaleString('fr-FR')} FCFA</p>
                  <p className="text-neutral-500 text-xs mt-1">Payé ({o.paymentMethod || 'en ligne'})</p>
                </div>
                <span className={`text-xs font-medium px-3 py-1 rounded-full border ${
                  o.status === 'terminee' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  o.status === 'annulee' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                  'bg-blue-500/10 text-blue-400 border-blue-500/20'
                }`}>{o.status === 'terminee' ? (o.fulfillmentType === 'livraison' ? 'Livrée' : 'Remise') : o.status === 'annulee' ? 'Annulée' : 'À traiter'}</span>
                {o.status === 'confirmee' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleOrderStatus(o.id, 'terminee')} disabled={orderUpdating[o.id]}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 rounded-lg transition-colors text-xs font-bold">
                      <CheckCircle2 className="w-4 h-4" /> {o.fulfillmentType === 'livraison' ? 'Livrée' : 'Remise'}
                    </button>
                    <button onClick={() => { if (window.confirm('Annuler cette commande ?')) handleOrderStatus(o.id, 'annulee'); }} disabled={orderUpdating[o.id]}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-60 text-red-400 rounded-lg transition-colors text-xs font-bold">
                      <XCircle className="w-4 h-4" /> Annuler
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
      <>
      {products.length > 0 && (
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit (nom, catégorie)…"
            className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
      ) : products.length === 0 ? (
        <Card className="border-white/5 bg-white/[0.02] border-dashed">
          <CardContent className="p-12 text-center">
            <PackageSearch className="w-10 h-10 text-neutral-500 mx-auto mb-4" />
            <p className="text-neutral-300 font-medium mb-1">Votre boutique est vide</p>
            <p className="text-neutral-500 text-sm">Ajoutez votre premier produit pour qu'il apparaisse chez vos clients.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500 text-center py-12">Aucun produit ne correspond à « {search.trim()} ».</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((p) => {
            const pr = productPricing(p);
            const ps = promoStatus(p);
            return (
            <Card key={p.id} className={`border-white/5 bg-white/[0.02] overflow-hidden ${!p.active ? 'opacity-60' : ''}`}>
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
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
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
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <Badge variant="outline" className="bg-white/5 text-neutral-300 border-white/10">{p.category}</Badge>
                  {!p.active && <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">Masqué</Badge>}
                  {pr.onSale && <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">{pr.kind === 'bogo' ? pr.label : 'En promo'}</Badge>}
                  {ps === 'scheduled' && <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">Promo programmée</Badge>}
                  {ps === 'ended' && <Badge variant="outline" className="bg-neutral-500/10 text-neutral-400 border-neutral-500/20">Promo terminée</Badge>}
                </div>
                {p.stock != null && (
                  <div className="flex items-center gap-2 mb-2">
                    <button type="button" onClick={() => handleStock(p, -1)} disabled={p.stock <= 0} title="−1 vendu"
                      className="p-1.5 rounded-lg bg-white/5 text-neutral-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className={`text-sm font-bold ${p.stock > 0 ? 'text-white' : 'text-red-400'}`}>
                      {p.stock > 0 ? `Stock : ${p.stock}` : 'Rupture'}
                    </span>
                    <button type="button" onClick={() => handleStock(p, 1)} title="+1 (réassort)"
                      className="p-1.5 rounded-lg bg-white/5 text-neutral-300 hover:bg-white/10 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {p.description && <p className="text-neutral-500 text-xs line-clamp-2 mb-3">{p.description}</p>}
                <div className="flex gap-2">
                  <button onClick={() => toggleActive(p)} title={p.active ? 'Masquer' : 'Publier'}
                    className="p-2 rounded-lg bg-white/5 text-neutral-300 hover:bg-white/10 transition-colors">
                    {p.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(p)} title="Modifier"
                    className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(p)} title="Supprimer"
                    className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
      </>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold text-white mb-6">{form.id ? 'Modifier le produit' : 'Ajouter un produit'}</h2>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Nom <span className="text-red-400">*</span></label>
                  <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Pneu Michelin 195/65 R15"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Catégorie</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
                      {SHOP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Prix (FCFA) <span className="text-red-400">*</span></label>
                    <input type="number" required min="0" step="100" value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Ex: 35000"
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Stock <span className="text-neutral-600">(laisser vide = sur commande)</span></label>
                  <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    placeholder="Ex: 8"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <p className="text-sm font-medium text-neutral-300 flex items-center gap-2"><Tag className="w-4 h-4 text-red-400" /> Promotion <span className="text-neutral-600 font-normal">(optionnel)</span></p>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { v: '', label: 'Aucune' },
                      { v: 'percent', label: 'Remise en %' },
                      { v: 'bogo', label: 'X achetés = Y offert(s)' },
                    ].map((opt) => (
                      <button key={opt.v} type="button" onClick={() => setForm({ ...form, promoType: opt.v })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${form.promoType === opt.v ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-neutral-950 border-white/10 text-neutral-400 hover:text-white'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {form.promoType === 'percent' && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 mb-1">Taux de remise (%)</label>
                      <div className="flex items-center gap-2">
                        {PERCENT_PRESETS.map((n) => (
                          <button key={n} type="button" onClick={() => setForm({ ...form, promoPercent: String(n) })}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${String(n) === form.promoPercent ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-neutral-950 border-white/10 text-neutral-400 hover:text-white'}`}>
                            -{n}%
                          </button>
                        ))}
                        <input type="number" min="1" max="99" value={form.promoPercent}
                          onChange={(e) => setForm({ ...form, promoPercent: e.target.value })} placeholder="autre"
                          className="w-20 bg-neutral-950 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      {form.price && form.promoPercent && (
                        <p className="text-neutral-500 text-xs mt-1.5">
                          Prix affiché : <span className="text-white font-bold">{Math.round(Number(form.price) * (1 - Number(form.promoPercent) / 100)).toLocaleString('fr-FR')} FCFA</span>
                          <span className="line-through ml-2 text-neutral-600">{Number(form.price).toLocaleString('fr-FR')}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {form.promoType === 'bogo' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Quantité achetée</label>
                        <input type="number" min="1" value={form.promoBuyQty}
                          onChange={(e) => setForm({ ...form, promoBuyQty: e.target.value })}
                          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Quantité offerte</label>
                        <input type="number" min="1" value={form.promoFreeQty}
                          onChange={(e) => setForm({ ...form, promoFreeQty: e.target.value })}
                          className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                  )}

                  {form.promoType && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Début <span className="text-neutral-600">(date vide = démarre maintenant)</span></label>
                        <div className="grid grid-cols-2 gap-3">
                          <input type="date" value={form.promoStartDate}
                            onChange={(e) => setForm({ ...form, promoStartDate: e.target.value })}
                            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                          <input type="time" value={form.promoStartTime}
                            onChange={(e) => setForm({ ...form, promoStartTime: e.target.value })}
                            disabled={!form.promoStartDate} title="Heure (optionnel — 00:00 par défaut)"
                            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 disabled:opacity-40" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1">Fin <span className="text-neutral-600">(date vide = sans fin)</span></label>
                        <div className="grid grid-cols-2 gap-3">
                          <input type="date" value={form.promoEndDate} min={form.promoStartDate || undefined}
                            onChange={(e) => setForm({ ...form, promoEndDate: e.target.value })}
                            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                          <input type="time" value={form.promoEndTime}
                            onChange={(e) => setForm({ ...form, promoEndTime: e.target.value })}
                            disabled={!form.promoEndDate} title="Heure (optionnel — 23:59 par défaut)"
                            className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 disabled:opacity-40" />
                        </div>
                      </div>
                      <p className="text-neutral-600 text-xs">L'heure est facultative (début à 00:00, fin à 23:59 par défaut). La promo s'active et s'arrête toute seule.</p>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Description <span className="text-neutral-600">(optionnel)</span></label>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Marque, référence, garantie…"
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 resize-none" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Photo</label>
                  {form.imageUrl ? (
                    <div className="flex items-center gap-3">
                      <img src={form.imageUrl} alt="" className="max-h-28 rounded-xl border border-white/10" />
                      <button type="button" onClick={() => setForm({ ...form, imageUrl: null })}
                        className="text-xs text-red-400 hover:text-red-300">Retirer</button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/15 text-neutral-400 hover:text-white hover:border-white/30 cursor-pointer transition-colors w-fit">
                      <ImagePlus className="w-4 h-4" /> Choisir une image
                      <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
                    </label>
                  )}
                  {imageError && <p className="text-red-400 text-xs mt-1">{imageError}</p>}
                </div>

                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-4 h-4 rounded border-white/20 bg-neutral-950" />
                  Visible par les clients
                </label>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="pt-4 mt-2 border-t border-white/10">
                  <button type="submit" disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {form.id ? 'Enregistrer' : 'Ajouter à la boutique'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
