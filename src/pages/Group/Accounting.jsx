import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Wallet, PieChart, Percent, RefreshCw, Loader2, Building2, ShoppingCart } from 'lucide-react';
import { useGroup } from '../../components/layout/GroupLayout';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AreaChart, Donut, Legend, Bars, CHART_COLORS } from '../../components/ui/charts';
import StationFilter from '../../components/group/StationFilter';
import { Section, KpiGrid, ActivityTabs, PeriodBar } from '../../components/group/shared';
import { FuelNote } from '../../components/group/GlobalPanel';
import { fcfa, fcfaCompact, pct } from '../../lib/bilan';
import {
  presetRange, bucketFor, bucketLabel, fetchGroupDashboard, enrichStations, computeTotals,
} from '../../lib/groupDashboard';
import {
  ACTIVITY_COLORS, FUEL_COLORS, fetchGroupFuel, enrichFuelStations, computeFuelTotals, combineTotals, combineStations, combineTrends,
} from '../../lib/fuelDashboard';

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const toData = (arr, offset = 0) => (arr || []).map((x, i) => ({ label: x.label, value: num(x.value), color: CHART_COLORS[(i + offset) % CHART_COLORS.length] }));

// Espace patron > Comptabilité : encaissements, dépenses et résultat du groupe, séparés
// par activité — Lavage, Carburant, et Global (les deux côte à côte). Mêmes définitions
// que le tableau de bord : lavage = transactions, carburant = argent encaissé déclaré par
// les pompistes ; chaque dépense est classée dans UNE activité (voir add_fuel_activity.sql).
export default function GroupAccounting() {
  useDocumentTitle('Comptabilité');
  const { loaded } = useGroup();

  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [stationIds, setStationIds] = useState([]);
  const [data, setData] = useState(null);
  const [fuel, setFuel] = useState(null);
  const [tab, setTab] = useState('global');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const idsKey = stationIds.join(',');
  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError('');
    try {
      const [lavage, fuelData] = await Promise.all([
        fetchGroupDashboard({ from: range.from, to: range.to, stationIds }),
        fetchGroupFuel({ from: range.from, to: range.to, stationIds }),
      ]);
      setData(lavage);
      setFuel(fuelData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const bucket = range ? bucketFor(range.from, range.to) : 'day';
  const hasFuel = !!fuel?.has_fuel;
  const activeTab = hasFuel ? tab : 'lavage';

  const lav = useMemo(() => computeTotals(data?.per_station), [data]);
  const lavStations = useMemo(() => enrichStations(data?.per_station), [data]);
  const fu = useMemo(() => computeFuelTotals(fuel?.per_station), [fuel]);
  const fuStations = useMemo(() => enrichFuelStations(fuel?.per_station), [fuel]);
  const both = useMemo(() => combineTotals(lav, fu), [lav, fu]);
  const bothStations = useMemo(() => combineStations(lavStations, fuStations), [lavStations, fuStations]);

  // Une vue par onglet : mêmes cartes, mêmes graphiques, autres chiffres.
  const view = useMemo(() => {
    if (activeTab === 'carburant') {
      return {
        cur: { revenue: fu.cur.amount, expenses: fu.cur.expenses, net: fu.cur.net, margin: fu.cur.margin },
        prev: { revenue: fu.prev.amount, expenses: fu.prev.expenses },
        deltas: { revenue: fu.deltas.amount, expenses: fu.deltas.expenses, net: fu.deltas.net },
        trend: (fuel?.trend || []).map((t) => ({ label: t.label, revenue: num(t.amount), expenses: num(t.expenses) })),
        revenueLabel: 'Argent encaissé', color: ACTIVITY_COLORS.carburant,
      };
    }
    if (activeTab === 'lavage') {
      return {
        cur: { revenue: lav.cur.revenue, expenses: lav.cur.expenses, net: lav.cur.net, margin: lav.cur.margin },
        prev: { revenue: lav.prev.revenue, expenses: lav.prev.expenses },
        deltas: { revenue: lav.deltas.revenue, expenses: lav.deltas.expenses, net: lav.deltas.net },
        trend: (data?.trend || []).map((t) => ({ label: t.label, revenue: num(t.revenue), expenses: num(t.expenses) })),
        revenueLabel: 'Encaissements', color: ACTIVITY_COLORS.lavage,
      };
    }
    return {
      cur: both.cur, prev: both.prev, deltas: both.deltas,
      trend: combineTrends(data?.trend, fuel?.trend).map((t) => ({ label: t.label, revenue: t.revenue, expenses: t.expenses })),
      revenueLabel: 'Encaissements', color: '#3b82f6',
    };
  }, [activeTab, lav, fu, both, data, fuel]);

  const kpis = [
    { title: view.revenueLabel, value: Math.round(view.cur.revenue), suffix: ' FCFA', icon: Banknote, color: 'text-emerald-400', bg: 'bg-emerald-500/10', d: view.deltas.revenue,
      sub: activeTab === 'global' ? `Lavage ${fcfaCompact(both.cur.lavage)} · Carburant ${fcfaCompact(both.cur.carburant)}` : `Période précédente : ${fcfa(view.prev.revenue)}` },
    { title: 'Dépenses', value: Math.round(view.cur.expenses), suffix: ' FCFA', icon: Wallet, color: 'text-amber-400', bg: 'bg-amber-500/10', d: view.deltas.expenses, invert: true,
      sub: `Période précédente : ${fcfa(view.prev.expenses)}` },
    { title: 'Résultat net', value: Math.round(view.cur.net), suffix: ' FCFA', icon: PieChart, color: view.cur.net >= 0 ? 'text-teal-400' : 'text-red-400', bg: view.cur.net >= 0 ? 'bg-teal-500/10' : 'bg-red-500/10', d: view.deltas.net,
      sub: 'encaissements moins dépenses' },
    { title: 'Marge nette', text: view.cur.margin != null ? pct(view.cur.margin) : '—', icon: Percent, color: 'text-purple-400', bg: 'bg-purple-500/10',
      sub: 'résultat ÷ encaissements' },
  ];
  const trend = view.trend.map((t) => ({ ...t, label: bucketLabel(t.label, bucket) }));

  if (!loaded) return <div className="p-8 text-neutral-500">Chargement…</div>;
  const noStation = data && (data.stations || []).length === 0;

  // Tableau par station : lavage / carburant / global.
  const rows = activeTab === 'carburant'
    ? fuStations.map((s) => ({ id: s.station_id, name: s.name, city: s.city, revenue: s.amount, expenses: s.expenses, net: s.net, margin: s.margin }))
    : activeTab === 'lavage'
      ? lavStations.map((s) => ({ id: s.station_id, name: s.name, city: s.city, revenue: s.revenue, expenses: s.expenses, net: s.net, margin: s.margin }))
      : bothStations.map((s) => ({ id: s.station_id, name: s.name, city: s.city, revenue: s.revenue, expenses: s.expenses, net: s.net, margin: s.margin, lavage: s.lavage, carburant: s.carburant, expLav: s.expLav, expFuel: s.expFuel, hasFuel: s.hasFuel }));
  rows.sort((a, b) => b.revenue - a.revenue);
  const total = rows.reduce((t, r) => ({ revenue: t.revenue + r.revenue, expenses: t.expenses + r.expenses, net: t.net + r.net }), { revenue: 0, expenses: 0, net: 0 });
  const isGlobal = activeTab === 'global';

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Comptabilité <span className="text-emerald-400">du groupe</span></h1>
          <p className="text-neutral-400 mt-1">{range ? `${range.label} · comparé à la période précédente de même durée` : 'Choisissez une période'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && !noStation && <StationFilter stations={data.stations} selected={stationIds} onChange={setStationIds} />}
          <button onClick={load} disabled={loading} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 disabled:opacity-60" title="Actualiser">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <PeriodBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />

      {error && <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}
      {!data && loading && <div className="flex items-center gap-3 text-neutral-400 p-8"><Loader2 className="w-5 h-5 animate-spin" /> Calcul de la comptabilité…</div>}

      {noStation && (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Building2 className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Aucune station dans votre groupe</h3>
          <p className="text-neutral-400 mb-5">La comptabilité se remplit dès que vos stations sont créées.</p>
          <Link to="/groupe/commande" className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold"><ShoppingCart className="w-4 h-4" /> Passer ma première commande</Link>
        </div>
      )}

      {data && !noStation && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {hasFuel && <ActivityTabs value={activeTab} onChange={setTab} />}

          <KpiGrid items={kpis} />

          <Section title="Encaissements et dépenses" subtitle={`${bucket === 'day' ? 'Par jour' : bucket === 'week' ? 'Par semaine' : 'Par mois'}${isGlobal ? ' — lavage et carburant confondus' : ''}`}>
            <AreaChart
              data={trend}
              series={[{ key: 'revenue', label: view.revenueLabel, color: view.color }, { key: 'expenses', label: 'Dépenses', color: '#ef4444' }]}
              height={260} formatValue={fcfa} formatTick={fcfaCompact} emptyWhenZero
            />
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activeTab === 'lavage' && (
              <Section title="Encaissements par mode de paiement" subtitle="Lavage">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <Donut data={toData(data.by_method, 2)} centerLabel={fcfaCompact(lav.cur.revenue)} centerSub="encaissé" />
                  <div className="flex-1 w-full"><Legend data={toData(data.by_method, 2)} formatValue={fcfa} /></div>
                </div>
              </Section>
            )}
            {activeTab === 'carburant' && (
              <Section title="Encaissements par carburant" subtitle="D’après les relevés par pistolet">
                {(fuel?.by_fuel || []).length === 0 ? <p className="text-sm text-neutral-500">Aucun relevé détaillé par pistolet sur la période.</p> : (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <Donut data={fuel.by_fuel.map((f) => ({ label: f.fuel === 'essence' ? 'Essence' : 'Gasoil', value: num(f.amount), color: FUEL_COLORS[f.fuel] }))} centerLabel={fcfaCompact(fu.cur.essenceAmount + fu.cur.gasoilAmount)} centerSub="détaillé" />
                    <div className="flex-1 w-full"><Legend data={fuel.by_fuel.map((f) => ({ label: f.fuel === 'essence' ? 'Essence' : 'Gasoil', value: num(f.amount), color: FUEL_COLORS[f.fuel] }))} formatValue={fcfa} /></div>
                  </div>
                )}
                {fu.cur.undetailedAmount > 0 && <p className="text-xs text-neutral-500 mt-4">Hors ventilation (relevés en un seul total) : {fcfa(fu.cur.undetailedAmount)}</p>}
              </Section>
            )}
            {isGlobal && (
              <Section title="Répartition des encaissements" subtitle="Lavage et carburant">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <Donut data={[{ label: 'Lavage', value: both.cur.lavage, color: ACTIVITY_COLORS.lavage }, { label: 'Carburant', value: both.cur.carburant, color: ACTIVITY_COLORS.carburant }]} centerLabel={fcfaCompact(both.cur.revenue)} centerSub="total" />
                  <div className="flex-1 w-full"><Legend data={[{ label: 'Lavage', value: both.cur.lavage, color: ACTIVITY_COLORS.lavage }, { label: 'Carburant', value: both.cur.carburant, color: ACTIVITY_COLORS.carburant }]} formatValue={fcfa} /></div>
                </div>
              </Section>
            )}

            {activeTab === 'lavage' && (
              <Section title="Dépenses par catégorie" subtitle="Dépenses de lavage">
                <Bars data={toData(data.expense_by_category, 3)} color="#f59e0b" formatValue={fcfa} />
              </Section>
            )}
            {activeTab === 'carburant' && (
              <Section title="Dépenses par catégorie" subtitle="Dépenses classées « Carburant »">
                <Bars data={toData(fuel?.expense_by_category, 3)} color="#f59e0b" formatValue={fcfa} />
              </Section>
            )}
            {isGlobal && (
              <Section title="Dépenses par activité" subtitle="Lavage et carburant">
                <Bars
                  data={[{ label: 'Lavage', value: lav.cur.expenses }, { label: 'Carburant', value: fu.cur.expenses }]}
                  color="#f59e0b" formatValue={fcfa}
                />
              </Section>
            )}
          </div>

          {isGlobal && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Dépenses de lavage par catégorie"><Bars data={toData(data.expense_by_category, 3)} color="#10b981" formatValue={fcfa} /></Section>
              <Section title="Dépenses de carburant par catégorie"><Bars data={toData(fuel?.expense_by_category, 3)} color="#f59e0b" formatValue={fcfa} /></Section>
            </div>
          )}

          <Section title="Détail par station" subtitle={isGlobal ? 'Lavage et carburant côte à côte, dépenses et résultat de chaque station' : 'Encaissements, dépenses et résultat de chaque station'}>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-neutral-400 border-b border-white/10">
                    <th className="px-2 py-3 font-medium text-left">Station</th>
                    {isGlobal ? (
                      <>
                        <th className="px-2 py-3 font-medium text-right">Lavage</th>
                        <th className="px-2 py-3 font-medium text-right">Carburant</th>
                        <th className="px-2 py-3 font-medium text-right">Encaissements</th>
                        <th className="px-2 py-3 font-medium text-right">Dép. lavage</th>
                        <th className="px-2 py-3 font-medium text-right">Dép. carburant</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-3 font-medium text-right">Encaissements</th>
                        <th className="px-2 py-3 font-medium text-right">Dépenses</th>
                      </>
                    )}
                    <th className="px-2 py-3 font-medium text-right">Résultat</th>
                    <th className="px-2 py-3 font-medium text-right">Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-2 py-3"><p className="font-semibold text-white">{r.name}</p><p className="text-xs text-neutral-500">{r.city || '—'}</p></td>
                      {isGlobal ? (
                        <>
                          <td className="px-2 py-3 text-right text-emerald-300">{fcfa(r.lavage)}</td>
                          <td className="px-2 py-3 text-right text-amber-300">{r.hasFuel ? fcfa(r.carburant) : <span className="text-neutral-600">—</span>}</td>
                          <td className="px-2 py-3 text-right font-semibold text-white">{fcfa(r.revenue)}</td>
                          <td className="px-2 py-3 text-right text-neutral-200">{fcfa(r.expLav)}</td>
                          <td className="px-2 py-3 text-right text-neutral-200">{r.hasFuel ? fcfa(r.expFuel) : <span className="text-neutral-600">—</span>}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-3 text-right font-semibold text-white">{fcfa(r.revenue)}</td>
                          <td className="px-2 py-3 text-right text-amber-300">{fcfa(r.expenses)}</td>
                        </>
                      )}
                      <td className={`px-2 py-3 text-right font-semibold ${r.net < 0 ? 'text-red-400' : 'text-teal-300'}`}>{fcfa(r.net)}</td>
                      <td className={`px-2 py-3 text-right ${r.margin != null && r.margin < 0 ? 'text-red-400' : 'text-neutral-200'}`}>{r.margin != null ? pct(r.margin) : '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={isGlobal ? 8 : 5} className="px-2 py-8 text-center text-neutral-500">Aucune station avec du carburant.</td></tr>}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-white/10 text-white font-bold">
                      <td className="px-2 py-3">Total</td>
                      {isGlobal && (<><td className="px-2 py-3 text-right text-emerald-300">{fcfa(both.cur.lavage)}</td><td className="px-2 py-3 text-right text-amber-300">{fcfa(both.cur.carburant)}</td></>)}
                      <td className="px-2 py-3 text-right">{fcfa(total.revenue)}</td>
                      {isGlobal ? (<><td className="px-2 py-3 text-right">{fcfa(lav.cur.expenses)}</td><td className="px-2 py-3 text-right">{fcfa(fu.cur.expenses)}</td></>) : <td className="px-2 py-3 text-right">{fcfa(total.expenses)}</td>}
                      <td className={`px-2 py-3 text-right ${total.net < 0 ? 'text-red-400' : 'text-teal-300'}`}>{fcfa(total.net)}</td>
                      <td className="px-2 py-3 text-right">{total.revenue > 0 ? pct(total.net / total.revenue) : '—'}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Section>

          {hasFuel ? <FuelNote /> : <p className="text-xs text-neutral-600 text-center pb-4">Chiffres calculés en direct, avec les mêmes définitions que la Comptabilité et le Bilan de chaque station. Les stations archivées ne sont pas incluses.</p>}
        </div>
      )}
    </div>
  );
}
