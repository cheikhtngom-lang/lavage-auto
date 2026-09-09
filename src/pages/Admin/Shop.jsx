import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, Plus, Pencil, Trash2, X, Loader2, ImagePlus, Eye, EyeOff, PackageSearch, Search } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useAppState } from '../../hooks/useAppState';
import { getCurrentStationId } from '../../lib/accounts';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import {
  SHOP_CATEGORIES, MAX_SHOP_IMAGE_SIZE, stationHasShop,
  loadStationProducts, saveProduct, setProductActive, deleteProduct,
} from '../../lib/shop';

const emptyForm = { id: null, name: '', description: '', category: 'Pneus', price: '', stock: '', imageUrl: null, active: true };

export default function Shop() {
  useDocumentTitle('Boutique');
  const { stationBilling } = useAppState();
  const stationId = getCurrentStationId();
  const canShop = stationHasShop(stationBilling);

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
      imageUrl: p.image_url || null, active: p.active,
    });
    setImageError(''); setError(''); setShowModal(true);
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
    setSaving(true); setError('');
    try {
      await saveProduct(stationId, form);
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
        <button onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2">
          <Plus className="w-5 h-5" /> Ajouter un produit
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

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
          {filtered.map((p) => (
            <Card key={p.id} className={`border-white/5 bg-white/[0.02] overflow-hidden ${!p.active ? 'opacity-60' : ''}`}>
              <div className="aspect-video bg-neutral-900 flex items-center justify-center overflow-hidden">
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  : <Store className="w-10 h-10 text-neutral-700" />}
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-bold text-white leading-tight">{p.name}</p>
                  <span className="text-emerald-400 font-bold whitespace-nowrap">{(p.price || 0).toLocaleString('fr-FR')} {p.currency || 'FCFA'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <Badge variant="outline" className="bg-white/5 text-neutral-300 border-white/10">{p.category}</Badge>
                  {!p.active && <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">Masqué</Badge>}
                  {p.stock != null && (
                    <Badge variant="outline" className={p.stock > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}>
                      {p.stock > 0 ? `Stock : ${p.stock}` : 'Rupture'}
                    </Badge>
                  )}
                </div>
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
          ))}
        </div>
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
