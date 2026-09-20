import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, ShoppingCart, Info } from 'lucide-react';
import { useGroup } from '../../components/layout/GroupLayout';
import OrderPaymentPanel from '../../components/group/OrderPaymentPanel';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { fetchGroupStations, fetchJoinRequests, fetchOrders, quoteOrder, createOrder, fmtFcfa } from '../../lib/groups';

const emptyLine = (plan) => ({ key: Math.random().toString(36).slice(2), name: '', city: '', plan });

// Commande « Sur mesure » : le patron compose son offre station par station
// (nom, ville, plan), le total est calculé en direct PAR LE SERVEUR (prorata
// inclus), puis il valide et paie en une fois. Les stations ne sont créées
// qu'après confirmation du paiement.
export default function Order() {
  useDocumentTitle('Nouvelle commande');
  const { org, plans, loaded } = useGroup();
  const defaultPlan = plans[0]?.key || 'Starter';

  const [lines, setLines] = useState([]);
  const [extras, setExtras] = useState([]); // stations existantes proposées : {station_id, name, plan, checked}
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [order, setOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Première ligne vide dès que les plans sont chargés.
  useEffect(() => {
    if (plans.length && lines.length === 0 && !order) setLines([emptyLine(plans[0].key)]);
  }, [plans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stations existantes que le patron peut ajouter : demandes acceptées + stations archivées du groupe.
  const loadExtras = useCallback(async () => {
    if (!org) return;
    try {
      const [reqs, sts] = await Promise.all([fetchJoinRequests(), fetchGroupStations(org.id)]);
      const fromRequests = reqs.filter((r) => r.status === 'accepted').map((r) => ({
        station_id: r.station_id, name: r.stations?.name || 'Station', plan: r.plan, reason: 'a accepté de rejoindre votre groupe', checked: true,
      }));
      const archived = sts.filter((s) => s.archived).map((s) => ({
        station_id: s.id, name: s.name, plan: s.plan || defaultPlan, reason: 'archivée — réactivation', checked: false,
      }));
      setExtras([...fromRequests, ...archived]);
    } catch { /* la commande de nouvelles stations reste possible */ }
  }, [org, defaultPlan]);
  useEffect(() => { loadExtras(); }, [loadExtras]);

  const payloadLines = useMemo(() => [
    ...lines.filter((l) => l.name.trim()).map((l) => ({ type: 'new', name: l.name.trim(), city: l.city.trim(), plan: l.plan })),
    ...extras.filter((e) => e.checked).map((e) => ({ type: 'existing', station_id: e.station_id, plan: e.plan })),
  ], [lines, extras]);

  // Devis en direct (calculé côté serveur, avec un léger délai de frappe).
  useEffect(() => {
    if (order) return undefined;
    if (payloadLines.length === 0) { setQuote(null); setQuoteError(''); return undefined; }
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        setQuote(await quoteOrder(payloadLines));
        setQuoteError('');
      } catch (err) {
        setQuote(null);
        setQuoteError(err.message);
      } finally {
        setQuoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [payloadLines, order]);

  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const validate = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      setOrder(await createOrder(payloadLines));
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const planLabel = (key) => plans.find((p) => p.key === key)?.label || key;
  const inputCls = 'w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500';

  if (!loaded) return <div className="p-8 text-neutral-500">Chargement…</div>;

  // ─── Étape 2 : paiement ───────────────────────────────────────────────
  if (order) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Règlement de la commande</h1>
        <p className="text-neutral-400 mb-6">Vos stations sont créées et activées dès la confirmation du paiement.</p>
        <div className="glass-card rounded-2xl p-6 border border-white/10 mb-6">
          <div className="space-y-2 mb-4">
            {(order.lines || []).map((l, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-neutral-300">{l.name} <span className="text-neutral-500">· {planLabel(l.plan)}{l.type === 'existing' ? ' · station existante' : ''}</span></span>
                <span className="text-white font-medium">{fmtFcfa(l.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-white/10">
            <span className="text-neutral-400">Total à payer</span>
            <span className="text-2xl font-bold text-emerald-400">{fmtFcfa(order.amount)}</span>
          </div>
        </div>
        <OrderPaymentPanel
          order={order}
          onChanged={async () => {
            // Recharge la commande pour afficher « paiement déclaré ».
            const all = await fetchOrders();
            setOrder(all.find((o) => o.id === order.id) || order);
          }}
        />
        <p className="text-xs text-neutral-500 mt-4">Vous pouvez aussi régler plus tard depuis « Facturation ».</p>
      </div>
    );
  }

  // ─── Étape 1 : composition ────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-2 tracking-tight">Nouvelle <span className="text-emerald-400">commande</span></h1>
      <p className="text-neutral-400 mb-8">Ajoutez vos stations et choisissez l’abonnement de chacune. Le total est calculé pour vous.</p>

      <div className="glass-card rounded-2xl p-6 border border-white/10 mb-6">
        <h2 className="text-lg font-bold mb-4">Nouvelles stations</h2>
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-center">
              <input className={inputCls} placeholder="Nom de la station" maxLength={100} value={l.name} onChange={(e) => updateLine(l.key, { name: e.target.value })} />
              <input className={inputCls} placeholder="Ville" maxLength={80} value={l.city} onChange={(e) => updateLine(l.key, { city: e.target.value })} />
              <select className={inputCls} value={l.plan} onChange={(e) => updateLine(l.key, { plan: e.target.value })}>
                {plans.map((p) => <option key={p.key} value={p.key}>{p.label} — {fmtFcfa(p.price)}/mois</option>)}
              </select>
              <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="p-3 text-neutral-500 hover:text-red-400 rounded-xl hover:bg-red-500/10 transition-colors" title="Retirer cette ligne">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setLines((ls) => [...ls, emptyLine(defaultPlan)])} disabled={lines.length >= 50}
          className="mt-4 flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm font-semibold">
          <Plus className="w-4 h-4" /> Ajouter une station
        </button>
      </div>

      {extras.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-white/10 mb-6">
          <h2 className="text-lg font-bold mb-1">Stations existantes</h2>
          <p className="text-sm text-neutral-500 mb-4">Ces stations peuvent être ajoutées à votre commande.</p>
          <div className="space-y-2">
            {extras.map((e) => (
              <div key={e.station_id} className="flex flex-wrap items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                <input type="checkbox" checked={e.checked} onChange={(ev) => setExtras((xs) => xs.map((x) => (x.station_id === e.station_id ? { ...x, checked: ev.target.checked } : x)))} className="w-4 h-4 accent-emerald-500" />
                <div className="flex-1 min-w-[160px]">
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-xs text-neutral-500">{e.reason}</p>
                </div>
                <select value={e.plan} onChange={(ev) => setExtras((xs) => xs.map((x) => (x.station_id === e.station_id ? { ...x, plan: ev.target.value } : x)))}
                  className="bg-neutral-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  {plans.map((p) => <option key={p.key} value={p.key}>{p.label} — {fmtFcfa(p.price)}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl p-6 border border-emerald-500/20 bg-emerald-500/[0.03]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Récapitulatif</h2>
          {quoting && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
        </div>

        {payloadLines.length === 0 ? (
          <p className="text-neutral-500 text-sm">Donnez un nom à au moins une station pour voir le total.</p>
        ) : quoteError ? (
          <p className="text-sm text-red-400">{quoteError}</p>
        ) : quote ? (
          <>
            <div className="space-y-2 mb-4">
              {quote.lines.map((l, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-neutral-300">{l.name}{l.city ? `, ${l.city}` : ''} <span className="text-neutral-500">· {planLabel(l.plan)}</span></span>
                  <span className="text-white font-medium">{fmtFcfa(l.amount)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-white/10">
              <span className="text-neutral-400">Total</span>
              <span className="text-3xl font-bold text-emerald-400">{fmtFcfa(quote.total)}</span>
            </div>
            <p className="flex items-start gap-2 text-xs text-neutral-500 mt-3">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {quote.first_cycle
                ? 'Premier paiement : un mois complet. Toutes vos stations partagent ensuite une seule échéance mensuelle.'
                : `Vos stations partagent une échéance commune : les ajouts sont facturés au prorata des ${quote.days_left} jour${quote.days_left > 1 ? 's' : ''} restants du cycle en cours.`}
            </p>
            {submitError && <p className="text-sm text-red-400 mt-3">{submitError}</p>}
            <button onClick={validate} disabled={submitting}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
              Valider et passer au paiement
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
