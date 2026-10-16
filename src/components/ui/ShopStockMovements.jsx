import React, { useEffect, useState } from 'react';
import { Loader2, Search, Boxes, PackageX, AlertTriangle, ArrowLeftRight, Store, Coins } from 'lucide-react';
import { Card, CardContent } from './Card';
import Pagination from './Pagination';
import { loadStockMovements, stockLevel, STOCK_MOVEMENTS, DEFAULT_LOW_STOCK_THRESHOLD } from '../../lib/shop';

// Onglet « Stock » de la boutique : état du stock de chaque produit suivi
// (épuisé / stock bas / en stock) puis le journal de tous les mouvements —
// entrées, ventes sur place et en ligne, corrections, annulations — écrit par
// un trigger Postgres (add_shop_stock_sales.sql). `onOpenStock(product)`
// ouvre la fenêtre de réapprovisionnement / correction du produit.

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  neutral: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
};
const LEVEL_ORDER = { out: 0, low: 1, ok: 2 };
const LEVEL_BADGE = {
  out: { label: 'Épuisé', cls: TONES.red },
  low: { label: 'Stock bas', cls: TONES.amber },
  ok: { label: 'En stock', cls: TONES.emerald },
};

const FILTERS = [
  { id: 'tous', label: 'Tout', types: null },
  { id: 'entrees', label: 'Entrées', types: ['stock_initial', 'entree', 'annulation_vente'] },
  { id: 'ventes', label: 'Ventes', types: ['vente_sur_place', 'vente_en_ligne'] },
  { id: 'corrections', label: 'Corrections', types: ['correction', 'suivi_arrete'] },
];

const formatDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ShopStockMovements({ stationId, products, refreshKey, onOpenStock }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('tous');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    let cancelled = false;
    loadStockMovements(stationId)
      .then((rows) => { if (!cancelled) { setMovements(rows); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Chargement impossible.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stationId, refreshKey]);
  useEffect(() => { setPage(1); }, [filter, search, pageSize]);

  const tracked = products
    .filter((p) => p.stock != null)
    .map((p) => ({ ...p, level: stockLevel(p) }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.stock - b.stock);
  const stats = {
    tracked: tracked.length,
    out: tracked.filter((p) => p.level === 'out').length,
    low: tracked.filter((p) => p.level === 'low').length,
    value: tracked.reduce((s, p) => s + p.stock * (p.price || 0), 0),
  };

  const types = FILTERS.find((f) => f.id === filter)?.types;
  const q = search.trim().toLowerCase();
  const filtered = movements.filter((m) => (!types || types.includes(m.movement_type))
    && (!q || (m.product_name || '').toLowerCase().includes(q) || (m.note || '').toLowerCase().includes(q)));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;

  return (
    <div className="space-y-8">
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Produits suivis', value: stats.tracked, icon: Boxes, color: 'text-blue-400' },
          { label: 'Stock bas', value: stats.low, icon: AlertTriangle, color: 'text-amber-400' },
          { label: 'Épuisés', value: stats.out, icon: PackageX, color: 'text-red-400' },
          { label: 'Valeur du stock (prix de vente)', value: `${stats.value.toLocaleString('fr-FR')} F`, icon: Coins, color: 'text-emerald-400' },
        ].map((s) => (
          <Card key={s.label} className="border-white/5 bg-white/[0.02]">
            <CardContent className="p-5 flex items-center gap-4">
              <s.icon className={`w-8 h-8 flex-shrink-0 ${s.color}`} />
              <div className="min-w-0">
                <p className="text-2xl font-bold text-white leading-none truncate">{s.value}</p>
                <p className="text-neutral-500 text-sm mt-1">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-2"><Boxes className="w-4 h-4 text-blue-400" /> État du stock</h3>
        {tracked.length === 0 ? (
          <p className="text-neutral-500 text-sm">Aucun produit n'a de stock suivi. Saisissez un stock initial à la création du produit, ou ouvrez « Stock » sur sa fiche.</p>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {tracked.map((p) => (
              <div key={p.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3 min-w-0 flex-1 basis-52">
                  <div className="w-10 h-10 rounded-lg bg-neutral-900 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <Store className="w-4 h-4 text-neutral-700" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{p.name}</p>
                    <p className="text-neutral-500 text-xs">{p.category} · alerte à {p.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-3 py-1 rounded-full border ${LEVEL_BADGE[p.level].cls}`}>{LEVEL_BADGE[p.level].label}</span>
                <p className="text-white font-bold w-16 text-right">{p.stock}</p>
                <button onClick={() => onOpenStock?.(p)}
                  className="px-3 py-2 rounded-lg bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-xs font-bold transition-colors">
                  {p.level === 'ok' ? 'Gérer' : 'Réapprovisionner'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-blue-400" /> Mouvements de stock</h3>
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
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit, une note…"
              className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {movements.length === 0 ? (
          <Card className="border-white/5 bg-white/[0.02] border-dashed">
            <CardContent className="p-12 text-center">
              <ArrowLeftRight className="w-10 h-10 text-neutral-500 mx-auto mb-4" />
              <p className="text-neutral-300 font-medium mb-1">Aucun mouvement pour l'instant</p>
              <p className="text-neutral-500 text-sm">Chaque entrée, vente et correction de stock sera notée ici automatiquement.</p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="text-neutral-500 text-center py-10">Aucun mouvement ne correspond à ce filtre.</p>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {pageItems.map((m) => {
              const meta = STOCK_MOVEMENTS[m.movement_type] || { label: m.movement_type, tone: 'neutral' };
              return (
                <div key={m.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 last:border-0">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-bold text-white truncate">{m.product_name}</p>
                    {m.note && <p className="text-neutral-500 text-xs truncate">{m.note}</p>}
                  </div>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full border ${TONES[meta.tone]}`}>{meta.label}</span>
                  <p className="w-28 text-right">
                    <span className={`font-bold ${m.quantity > 0 ? 'text-emerald-400' : m.quantity < 0 ? 'text-red-400' : 'text-neutral-400'}`}>
                      {m.movement_type === 'suivi_arrete' ? '—' : `${m.quantity > 0 ? '+' : ''}${m.quantity}`}
                    </span>
                    {m.stock_after != null && <span className="text-neutral-500 text-sm"> → {m.stock_after}</span>}
                  </p>
                  <p className="text-neutral-400 text-sm w-40 text-right">{formatDate(m.created_at)}</p>
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
