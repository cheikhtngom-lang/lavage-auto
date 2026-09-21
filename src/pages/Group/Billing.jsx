import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useGroup } from '../../components/layout/GroupLayout';
import OrderPaymentPanel from '../../components/group/OrderPaymentPanel';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { fetchOrders, fetchGroupStations, createRenewal, ORDER_STATUS, GROUP_STATUS, fmtFcfa } from '../../lib/groups';
import { groupMonthly } from '../../lib/groupPricing';

const KIND_LABEL = { commande: 'Commande', renouvellement: 'Renouvellement mensuel' };

// Facturation du groupe : une seule échéance pour toutes les stations, un seul
// paiement mensuel. L'historique liste chaque commande / renouvellement ; ceux
// qui attendent encore un paiement peuvent être réglés d'ici.
export default function Billing() {
  useDocumentTitle('Facturation');
  const { org, plans, tiers, loaded, reload } = useGroup();
  const [orders, setOrders] = useState(null);
  const [monthly, setMonthly] = useState({ total: 0, subtotal: 0, discount: 0, pct: 0, next: null });
  const [activeCount, setActiveCount] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!org) return;
    try {
      const [o, s] = await Promise.all([fetchOrders(), fetchGroupStations(org.id)]);
      setOrders(o);
      const active = s.filter((x) => !x.archived && x.status === 'active');
      setActiveCount(active.length);
      // Même règle que le renouvellement (serveur) : remise selon le nombre de stations actives.
      setMonthly(groupMonthly(active.map((x) => plans.find((p) => p.key === x.plan)?.price || 0), tiers));
    } catch (err) {
      setError(err.message);
      setOrders([]);
    }
  }, [org, plans, tiers]);
  useEffect(() => { load(); }, [load]);

  const renew = async () => {
    setBusy(true);
    setError('');
    try {
      const order = await createRenewal();
      await load();
      setExpanded(order.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded || orders === null) return <div className="p-8 text-neutral-500">Chargement…</div>;

  const status = GROUP_STATUS[org?.status];
  const nextDate = org?.next_billing_date ? new Date(org.next_billing_date) : null;
  const overdue = nextDate && nextDate < new Date();

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold tracking-tight mb-2"><span className="text-emerald-400">Facturation</span></h1>
      <p className="text-neutral-400 mb-8">Un seul paiement mensuel pour toutes vos stations.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="glass-card rounded-2xl p-5 border border-white/10">
          <p className="text-sm text-neutral-400">Statut</p>
          {status && <span className={`inline-block mt-2 text-sm font-medium px-3 py-1 rounded-full border ${status.className}`}>{status.label}</span>}
        </div>
        <div className="glass-card rounded-2xl p-5 border border-white/10">
          <p className="text-sm text-neutral-400">Prochaine échéance</p>
          <p className={`text-xl font-bold mt-1 ${overdue ? 'text-red-400' : ''}`}>{nextDate ? nextDate.toLocaleDateString('fr-FR') : '—'}</p>
        </div>
        <div className="glass-card rounded-2xl p-5 border border-white/10">
          <p className="text-sm text-neutral-400">Renouvellement mensuel</p>
          <p className="text-xl font-bold mt-1">{fmtFcfa(monthly.total)}</p>
          <p className="text-xs text-neutral-500">{activeCount} station{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''}{monthly.pct > 0 && ` · remise de ${monthly.pct} % incluse (−${fmtFcfa(monthly.discount)})`}</p>
        </div>
      </div>

      {org?.next_billing_date ? (
        <div className="glass-card rounded-2xl p-5 border border-emerald-500/20 bg-emerald-500/[0.03] mb-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-300">
            {overdue || org.status === 'en_retard'
              ? 'Votre échéance est dépassée : renouvelez pour réactiver vos stations.'
              : 'Vous pouvez renouveler dès maintenant : 30 jours sont ajoutés à votre échéance actuelle.'}
          </p>
          <button onClick={renew} disabled={busy || monthly.total <= 0} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl transition-colors">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Renouveler ({fmtFcfa(monthly.total)})
          </button>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-5 border border-white/10 mb-8 text-sm text-neutral-400">
          Aucun paiement encore confirmé. <Link to="/groupe/commande" className="text-emerald-400 font-semibold underline">Passez votre première commande</Link> pour démarrer.
        </div>
      )}

      {error && <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}

      <h2 className="text-xl font-bold mb-3">Historique</h2>
      {orders.length === 0 ? (
        <p className="text-neutral-500 text-sm">Aucune commande pour l’instant.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const st = ORDER_STATUS[o.status] || ORDER_STATUS.CANCELLED;
            const isOpen = expanded === o.id;
            return (
              <div key={o.id} className="glass-card rounded-2xl border border-white/10">
                <button onClick={() => setExpanded(isOpen ? null : o.id)} className="w-full flex flex-wrap items-center gap-3 px-5 py-4 text-left">
                  <div className="flex-1 min-w-[150px]">
                    <p className="font-semibold">{KIND_LABEL[o.kind] || o.kind}</p>
                    <p className="text-xs text-neutral-500">{new Date(o.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <span className="font-bold">{fmtFcfa(o.amount)}</span>
                  <span className={`text-xs px-3 py-1 rounded-full border ${st.className}`}>{st.label}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-white/5 pt-4">
                    <div className="space-y-1.5 mb-4">
                      {(o.lines || []).map((l, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-neutral-300">{l.name} <span className="text-neutral-500">· {plans.find((p) => p.key === l.plan)?.label || l.plan}</span></span>
                          <span className="text-neutral-200">{fmtFcfa(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                    {o.status === 'PENDING' && <OrderPaymentPanel order={o} onChanged={load} />}
                    {o.status === 'CONFIRMED' && o.confirmed_at && (
                      <p className="text-xs text-emerald-400">Payée le {new Date(o.confirmed_at).toLocaleDateString('fr-FR')}.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
