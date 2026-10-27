import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, ShoppingCart, Undo2, Receipt, CalendarDays, Package, Printer, MessageCircle } from 'lucide-react';
import { Card, CardContent } from './Card';
import Pagination from './Pagination';
import { loadShopSales, cancelShopSale, setSalePhone } from '../../lib/shop';
import { toReceipt, printReceipt, sendReceiptWhatsApp } from '../../lib/shopReceipt';
import { useAppState } from '../../hooks/useAppState';

// Onglet « Ventes sur place » : les ventes saisies par la station, avec les
// totaux du jour / du mois. Une vente annulée reste visible (barrée) : ses
// articles sont revenus en stock et sa recette a quitté la Comptabilité.
// `refreshKey` change à chaque nouvelle vente pour recharger la liste.
// Chaque vente a son reçu : à imprimer ou à envoyer au client sur WhatsApp.

const fcfa = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
const formatDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

export default function ShopSales({ stationId, refreshKey, onChanged }) {
  const { stationProfile } = useAppState();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [cancelling, setCancelling] = useState(null);

  const refresh = useCallback(async () => {
    try { setSales(await loadShopSales(stationId)); setError(''); }
    catch (err) { setError(err.message || 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [stationId]);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  useEffect(() => { setPage(1); }, [search, pageSize]);

  // Numéro saisi dans la fenêtre du reçu : enregistré sur la vente, puis la liste est relue
  const savePhone = (s) => (p) => setSalePhone(s.id, p).then(refresh).catch(() => {});

  const handleCancel = async (s) => {
    const reason = window.prompt(
      'Annuler cette vente ?\nLes articles reviendront en stock et la recette sera retirée de la Comptabilité.\n\nMotif (facultatif) :', '');
    if (reason === null) return;
    setCancelling(s.id);
    try { await cancelShopSale(s.id, reason); await refresh(); await onChanged?.(); }
    catch (err) { setError(err.message); }
    finally { setCancelling(null); }
  };

  const valid = sales.filter((s) => s.status === 'validee');
  const todayStart = startOfDay(new Date());
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const sumFrom = (start) => valid.filter((s) => new Date(s.created_at) >= start);
  const today = sumFrom(todayStart);
  const month = sumFrom(monthStart);
  const monthUnits = month.reduce((n, s) => n + (s.items || []).reduce((m, it) => m + (Number(it.quantity) || 0), 0), 0);

  const q = search.trim().toLowerCase();
  const filtered = sales.filter((s) => !q
    || (s.items || []).some((it) => (it.name || '').toLowerCase().includes(q))
    || (s.transactions?.client_name || '').toLowerCase().includes(q)
    || (s.payment_method || '').toLowerCase().includes(q));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;

  return (
    <div className="space-y-8">
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Ventes d'aujourd'hui", value: fcfa(today.reduce((s, x) => s + x.amount, 0)), sub: `${today.length} vente${today.length > 1 ? 's' : ''}`, icon: Receipt, color: 'text-emerald-400' },
          { label: 'Ventes du mois', value: fcfa(month.reduce((s, x) => s + x.amount, 0)), sub: `${month.length} vente${month.length > 1 ? 's' : ''}`, icon: CalendarDays, color: 'text-blue-400' },
          { label: 'Articles vendus ce mois', value: monthUnits.toLocaleString('fr-FR'), sub: 'sur place', icon: Package, color: 'text-amber-400' },
        ].map((c) => (
          <Card key={c.label} className="border-white/5 bg-white/[0.02]">
            <CardContent className="p-5 flex items-center gap-4">
              <c.icon className={`w-8 h-8 flex-shrink-0 ${c.color}`} />
              <div className="min-w-0">
                <p className="text-2xl font-bold text-white leading-none truncate">{c.value}</p>
                <p className="text-neutral-500 text-sm mt-1">{c.label} · {c.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-emerald-400" /> Ventes enregistrées</h3>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Produit, client, paiement…"
              className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {sales.length === 0 ? (
          <Card className="border-white/5 bg-white/[0.02] border-dashed">
            <CardContent className="p-12 text-center">
              <ShoppingCart className="w-10 h-10 text-neutral-500 mx-auto mb-4" />
              <p className="text-neutral-300 font-medium mb-1">Aucune vente sur place pour l'instant</p>
              <p className="text-neutral-500 text-sm">Quand un client achète en station, cliquez sur « Enregistrer une vente » : le stock baisse et la recette va en Comptabilité.</p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="text-neutral-500 text-center py-10">Aucune vente ne correspond à « {search.trim()} ».</p>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {pageItems.map((s) => {
              const cancelled = s.status === 'annulee';
              return (
                <div key={s.id} className={`px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 last:border-0 ${cancelled ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1 basis-60">
                    <p className={`font-bold text-white ${cancelled ? 'line-through' : ''}`}>
                      {(s.items || []).map((it) => `${it.name} × ${it.quantity}`).join(' · ')}
                    </p>
                    <p className="text-neutral-500 text-xs mt-1">
                      {formatDate(s.created_at)}
                      {s.transactions?.client_name ? ` · ${s.transactions.client_name}` : ''}
                      {s.note ? ` · ${s.note}` : ''}
                    </p>
                    {cancelled && (
                      <p className="text-red-400 text-xs mt-1">Annulée{s.cancelled_at ? ` le ${formatDate(s.cancelled_at)}` : ''}{s.cancel_reason ? ` — ${s.cancel_reason}` : ''}</p>
                    )}
                  </div>
                  <span className="text-xs font-medium px-3 py-1 rounded-full border bg-white/5 text-neutral-300 border-white/10">{s.payment_method}</span>
                  <p className={`text-white font-bold w-32 text-right ${cancelled ? 'line-through' : ''}`}>{fcfa(s.amount)}</p>
                  <button type="button" onClick={() => printReceipt(toReceipt(s), stationProfile, savePhone(s))} title="Imprimer le reçu"
                      className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors text-xs font-bold">
                      <Printer className="w-4 h-4" /> Reçu
                    </button>
                  <button type="button" onClick={() => sendReceiptWhatsApp(toReceipt(s), stationProfile, savePhone(s))} title="Envoyer le reçu sur WhatsApp"
                      className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors text-xs font-bold">
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </button>
                  {!cancelled && (
                    <button onClick={() => handleCancel(s)} disabled={cancelling === s.id} title="Annuler la vente"
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-60 text-red-400 rounded-lg transition-colors text-xs font-bold">
                      {cancelling === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Annuler
                    </button>
                  )}
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
