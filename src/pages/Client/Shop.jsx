import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Search, Store, MessageCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { loadClientShop, productWhatsAppLink } from '../../lib/shop';

export default function Shop() {
  useDocumentTitle('Boutique');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Toutes');

  useEffect(() => {
    let cancelled = false;
    loadClientShop()
      .then((g) => { if (!cancelled) setGroups(g); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Chargement impossible.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
        if (!q) return true;
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
        );
      }),
    }))
    .filter((g) => g.products.length > 0);

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
                      const outOfStock = p.stock === 0;
                      return (
                        <div key={p.id} className="glass-card rounded-2xl overflow-hidden border border-white/5 flex flex-col">
                          <div className="aspect-video bg-neutral-900 flex items-center justify-center overflow-hidden">
                            {p.image_url
                              ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                              : <Store className="w-10 h-10 text-neutral-700" />}
                          </div>
                          <div className="p-4 flex flex-col flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-white leading-tight">{p.name}</p>
                              <span className="text-emerald-400 font-bold whitespace-nowrap">{(p.price || 0).toLocaleString('fr-FR')} {p.currency || 'FCFA'}</span>
                            </div>
                            <p className="text-neutral-500 text-xs mt-1">{p.category}{outOfStock ? ' · Rupture' : ''}</p>
                            {p.description && <p className="text-neutral-400 text-xs mt-2 line-clamp-3">{p.description}</p>}
                            <div className="mt-auto pt-3">
                              {wa ? (
                                <a href={wa} target="_blank" rel="noopener noreferrer"
                                  className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2.5 px-3 rounded-xl transition-colors">
                                  <MessageCircle className="w-4 h-4" /> Contacter la station
                                </a>
                              ) : (
                                <p className="text-neutral-600 text-xs text-center">Contactez la station à votre prochaine visite.</p>
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
    </div>
  );
}
