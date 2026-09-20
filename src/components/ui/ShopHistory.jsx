import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, History, PackageX, PackageCheck, Search, Store, EyeOff } from 'lucide-react';
import { Card, CardContent } from './Card';
import Pagination from './Pagination';
import { HISTORY_EVENTS, loadShopHistory } from '../../lib/shop';

// Onglet « Historique » de la boutique : ce qui a été mis en ligne, ce qui est
// tombé en rupture, réapprovisionné, retiré ou supprimé — avec les dates.
// `products` : le catalogue actuel (pour l'état des lieux en tête de page).

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  neutral: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
};

const FILTERS = [
  { id: 'tous', label: 'Tout' },
  { id: 'mis_en_ligne', label: 'Mis en ligne' },
  { id: 'fin_de_stock', label: 'Fin de stock' },
  { id: 'reapprovisionne', label: 'Réapprovisionnés' },
  { id: 'retires', label: 'Retirés / supprimés' },
];

const formatDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ShopHistory({ stationId, products }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('tous');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    let cancelled = false;
    loadShopHistory(stationId)
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Chargement impossible.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stationId]);

  useEffect(() => { setPage(1); }, [filter, search, pageSize]);

  // État des lieux : produits actuellement en rupture, avec la date de la
  // dernière fin de stock (l'événement le plus récent du produit).
  const outOfStock = useMemo(() => {
    const lastRupture = new Map();
    for (const e of events) if (e.event_type === 'fin_de_stock' && !lastRupture.has(e.product_id)) lastRupture.set(e.product_id, e.created_at);
    return products
      .filter((p) => p.stock === 0)
      .map((p) => ({ ...p, since: lastRupture.get(p.id) || p.updated_at }))
      .sort((a, b) => new Date(b.since) - new Date(a.since));
  }, [events, products]);

  const stats = {
    online: products.filter((p) => p.active).length,
    out: outOfStock.length,
    hidden: products.filter((p) => !p.active).length,
  };

  const q = search.trim().toLowerCase();
  const filtered = events.filter((e) => {
    if (filter === 'retires' ? !(e.event_type === 'retire' || e.event_type === 'supprime') : filter !== 'tous' && e.event_type !== filter) return false;
    return !q || (e.product_name || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q);
  });
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Produits en ligne', value: stats.online, icon: Store, color: 'text-emerald-400' },
          { label: 'En rupture de stock', value: stats.out, icon: PackageX, color: 'text-red-400' },
          { label: 'Masqués', value: stats.hidden, icon: EyeOff, color: 'text-amber-400' },
        ].map((s) => (
          <Card key={s.label} className="border-white/5 bg-white/[0.02]">
            <CardContent className="p-5 flex items-center gap-4">
              <s.icon className={`w-8 h-8 ${s.color}`} />
              <div>
                <p className="text-3xl font-bold text-white leading-none">{s.value}</p>
                <p className="text-neutral-500 text-sm mt-1">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {outOfStock.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-2"><PackageX className="w-4 h-4 text-red-400" /> Actuellement en rupture</h3>
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {outOfStock.map((p) => (
              <div key={p.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-lg bg-neutral-900 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <Store className="w-5 h-5 text-neutral-700" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{p.name}</p>
                    <p className="text-neutral-500 text-xs">{p.category}</p>
                  </div>
                </div>
                <p className="text-neutral-400 text-sm">Épuisé depuis le <span className="text-white">{formatDate(p.since)}</span></p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-2"><History className="w-4 h-4 text-blue-400" /> Journal des produits</h3>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filter === f.id ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' : 'bg-neutral-950 border-white/10 text-neutral-400 hover:text-white'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit…"
              className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {events.length === 0 ? (
          <Card className="border-white/5 bg-white/[0.02] border-dashed">
            <CardContent className="p-12 text-center">
              <PackageCheck className="w-10 h-10 text-neutral-500 mx-auto mb-4" />
              <p className="text-neutral-300 font-medium mb-1">Aucun événement pour l'instant</p>
              <p className="text-neutral-500 text-sm">Chaque mise en ligne, fin de stock et réapprovisionnement sera noté ici automatiquement.</p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="text-neutral-500 text-center py-10">Aucun événement ne correspond à ce filtre.</p>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {pageItems.map((e) => {
              const meta = HISTORY_EVENTS[e.event_type] || { label: e.event_type, tone: 'neutral' };
              return (
                <div key={e.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 last:border-0">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-bold text-white truncate">{e.product_name}</p>
                    <p className="text-neutral-500 text-xs">
                      {e.category}
                      {e.stock_after != null && e.event_type !== 'mis_en_ligne' && e.event_type !== 'retire' ? ` · stock : ${e.stock_after}` : ''}
                      {e.event_type === 'mis_en_ligne' && e.price != null ? ` · ${e.price.toLocaleString('fr-FR')} FCFA` : ''}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full border ${TONES[meta.tone]}`}>{meta.label}</span>
                  <p className="text-neutral-400 text-sm w-40 text-right">
                    {formatDate(e.created_at)}
                    {e.backfilled && <span className="block text-neutral-600 text-[11px]" title="Événement reconstitué à la création de l'historique : date approximative">date approximative</span>}
                  </p>
                </div>
              );
            })}
            <Pagination page={page} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[10, 20, 50, 100]} />
          </div>
        )}
      </div>
    </div>
  );
}
