import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote, Droplets, Receipt, Wallet, TrendingUp, TrendingDown, Minus, Star, RefreshCw, Download, Loader2,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Building2, DoorOpen, ShoppingCart, PieChart,
} from 'lucide-react';
import { useGroup } from '../../components/layout/GroupLayout';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AreaChart, Donut, Legend, Bars, VerticalBars, CHART_COLORS } from '../../components/ui/charts';
import { fcfa, fcfaCompact, pct, DOW_FR_SHORT } from '../../lib/bilan';
import { openStation } from '../../lib/groups';
import {
  PERIOD_PRESETS, presetRange, bucketFor, bucketLabel, fetchGroupDashboard, enrichStations, computeTotals, buildInsights,
} from '../../lib/groupDashboard';

function Delta({ d, invert = false }) {
  if (d == null) return <span className="text-xs text-neutral-500">—</span>;
  const flat = Math.abs(d) < 0.005;
  const good = invert ? d < 0 : d > 0;
  const color = flat ? 'text-neutral-400' : good ? 'text-emerald-400' : 'text-red-400';
  const Icon = flat ? Minus : d > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${color}`}>
      <Icon className="w-3.5 h-3.5" />{d >= 0 ? '+' : ''}{(d * 100).toFixed(0)} %
    </span>
  );
}

function Section({ title, subtitle, right, children, className = '' }) {
  return (
    <div className={`glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-6 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// Filtre multi-stations : aucune case cochée = toutes les stations.
function StationFilter({ stations, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const all = selected.length === 0 || selected.length === stations.length;
  const label = all ? `Toutes les stations (${stations.length})` : selected.length === 1 ? stations.find((s) => s.id === selected[0])?.name : `${selected.length} stations`;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-sm font-medium">
        <Building2 className="w-4 h-4 text-neutral-400" /> {label} {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto z-40 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl p-2">
            <button onClick={() => onChange([])} className="w-full text-left px-3 py-2 rounded-lg text-sm text-emerald-400 hover:bg-white/5 font-semibold">Toutes les stations</button>
            {stations.map((s) => (
              <label key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer text-sm text-neutral-200">
                <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} className="w-4 h-4 accent-emerald-500" />
                <span className="truncate">{s.name}</span>
                {s.city && <span className="text-xs text-neutral-500 ml-auto">{s.city}</span>}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const COLUMNS = [
  { key: 'name', label: 'Station', align: 'left' },
  { key: 'revenue', label: "Chiffre d'affaires", align: 'right' },
  { key: 'washes', label: 'Lavages', align: 'right' },
  { key: 'avgTicket', label: 'Panier moyen', align: 'right' },
  { key: 'expenses', label: 'Dépenses', align: 'right' },
  { key: 'net', label: 'Résultat', align: 'right' },
  { key: 'margin', label: 'Marge', align: 'right' },
  { key: 'rating', label: 'Note', align: 'right' },
  { key: 'washesPerWasher', label: 'Lav./laveur', align: 'right' },
];

export default function Dashboard() {
  useDocumentTitle('Tableau de bord');
  const { org, loaded } = useGroup();

  const [preset, setPreset] = useState('30d');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [stationIds, setStationIds] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('revenue');
  const [sort, setSort] = useState({ key: 'revenue', dir: 'desc' });
  const [pdfBusy, setPdfBusy] = useState(false);
  const [opening, setOpening] = useState(null);

  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const idsKey = stationIds.join(',');

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchGroupDashboard({ from: range.from, to: range.to, stationIds }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const bucket = range ? bucketFor(range.from, range.to) : 'day';
  const stations = useMemo(() => enrichStations(data?.per_station), [data]);
  const { cur, prev, deltas } = useMemo(() => computeTotals(data?.per_station), [data]);
  const insights = useMemo(() => buildInsights(stations), [stations]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...stations].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return typeof va === 'string' ? dir * va.localeCompare(vb) : dir * (va - vb);
    });
  }, [stations, sort]);

  const open = async (s) => {
    setOpening(s.station_id);
    try { await openStation(s.station_id); window.location.href = '/admin/queue'; } catch (err) { setError(err.message); setOpening(null); }
  };

  const handlePdf = async () => {
    setPdfBusy(true);
    try {
      const { downloadGroupReportPdf } = await import('../../lib/groupReportPdf');
      await downloadGroupReportPdf({
        orgName: org?.name || 'Mon groupe',
        periodLabel: range.label,
        filterLabel: stationIds.length && stationIds.length < (data?.stations?.length || 0) ? `${stationIds.length} station(s) sélectionnée(s)` : 'Toutes les stations',
        cur, prev, deltas, stations: sorted, insights,
        byService: data.by_service, byMethod: data.by_method, expenseByCategory: data.expense_by_category, washers: data.washers,
      });
    } catch (err) {
      alert('Export PDF impossible : ' + (err?.message || err));
    } finally {
      setPdfBusy(false);
    }
  };

  if (!loaded) return <div className="p-8 text-neutral-500">Chargement…</div>;

  const noStation = data && (data.stations || []).length === 0;
  const chips = 'px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors';

  const kpis = [
    { label: "Chiffre d'affaires", value: fcfa(cur.revenue), icon: Banknote, tint: 'text-emerald-400', bg: 'bg-emerald-500/10', d: deltas.revenue },
    { label: 'Lavages', value: String(cur.washes), icon: Droplets, tint: 'text-blue-400', bg: 'bg-blue-500/10', d: deltas.washes },
    { label: 'Panier moyen', value: fcfa(cur.avgTicket), icon: Receipt, tint: 'text-purple-400', bg: 'bg-purple-500/10', d: deltas.avgTicket },
    { label: 'Dépenses', value: fcfa(cur.expenses), icon: Wallet, tint: 'text-amber-400', bg: 'bg-amber-500/10', d: deltas.expenses, invert: true },
    { label: 'Résultat net', value: fcfa(cur.net), sub: cur.margin != null ? `marge ${pct(cur.margin)}` : null, icon: PieChart, tint: cur.net >= 0 ? 'text-teal-400' : 'text-red-400', bg: 'bg-teal-500/10', d: deltas.net },
    { label: 'Note moyenne', value: cur.rating != null ? `${cur.rating.toFixed(1)} / 5` : '—', sub: cur.reviewCount ? `${cur.reviewCount} avis` : null, icon: Star, tint: 'text-yellow-400', bg: 'bg-yellow-500/10', d: null },
  ];

  const trend = (data?.trend || []).map((t) => ({ ...t, label: bucketLabel(t.label, bucket), net: num(t.revenue) - num(t.expenses) }));
  const metricSeries = {
    revenue: [{ key: 'revenue', label: "Chiffre d'affaires", color: '#10b981' }, { key: 'expenses', label: 'Dépenses', color: '#f59e0b' }],
    washes: [{ key: 'washes', label: 'Lavages', color: '#3b82f6' }],
    net: [{ key: 'net', label: 'Résultat', color: '#14b8a6' }],
  }[metric];

  const toData = (arr, offset = 0) => (arr || []).map((x, i) => ({ label: x.label, value: num(x.value), color: CHART_COLORS[(i + offset) % CHART_COLORS.length] }));
  const stationShare = stations.filter((s) => s.revenue > 0).map((s, i) => ({ label: s.name, value: s.revenue, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const dowData = (data?.dow || []).map((v, i) => ({ label: DOW_FR_SHORT[i], value: v }));
  const hourData = (data?.hour || []).map((v, i) => ({ label: `${i}h`, value: v }));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Tableau de <span className="text-emerald-400">bord</span></h1>
          <p className="text-neutral-400 mt-1">{range ? `${range.label} · comparé à la période précédente de même durée` : 'Choisissez une période'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && !noStation && <StationFilter stations={data.stations} selected={stationIds} onChange={setStationIds} />}
          <button onClick={load} disabled={loading} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 disabled:opacity-60" title="Actualiser">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button onClick={handlePdf} disabled={!data || noStation || pdfBusy} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-sm">
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Rapport PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-8">
        {PERIOD_PRESETS.map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} className={`${chips} ${preset === p.key ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`}>{p.label}</button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" />
            <span className="text-neutral-500 text-sm">au</span>
            <input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" />
          </div>
        )}
      </div>

      {error && <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}

      {!data && loading && <div className="flex items-center gap-3 text-neutral-400 p-8"><Loader2 className="w-5 h-5 animate-spin" /> Calcul du tableau de bord…</div>}

      {noStation && (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Building2 className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Aucune station dans votre groupe</h3>
          <p className="text-neutral-400 mb-5">Le tableau de bord se remplit dès que vos stations sont créées.</p>
          <Link to="/groupe/commande" className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold"><ShoppingCart className="w-4 h-4" /> Passer ma première commande</Link>
        </div>
      )}

      {data && !noStation && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {kpis.map((k) => (
              <div key={k.label} className="glass-card rounded-2xl p-5 border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${k.bg}`}><k.icon className={`w-4.5 h-4.5 ${k.tint}`} /></div>
                  <p className="text-sm text-neutral-400">{k.label}</p>
                </div>
                <p className="text-2xl font-bold text-white">{k.value}</p>
                <div className="flex items-center gap-2 mt-1 min-h-[20px]">
                  {k.d !== undefined && <Delta d={k.d} invert={k.invert} />}
                  {k.sub && <span className="text-xs text-neutral-500">{k.sub}</span>}
                </div>
              </div>
            ))}
          </div>

          {insights.length > 0 && (
            <Section title="Points d’attention" subtitle="Repérés automatiquement à partir des chiffres de la période">
              <div className="space-y-2">
                {insights.map((it, i) => {
                  const st = { danger: ['bg-red-500/10 border-red-500/25 text-red-200', AlertTriangle, 'text-red-400'], warning: ['bg-orange-500/10 border-orange-500/25 text-orange-200', AlertTriangle, 'text-orange-400'], success: ['bg-emerald-500/10 border-emerald-500/25 text-emerald-200', CheckCircle2, 'text-emerald-400'] }[it.severity];
                  const Icon = st[1];
                  return (
                    <div key={i} className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-sm ${st[0]}`}>
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${st[2]}`} /> <span>{it.text}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section
            title="Évolution"
            subtitle={bucket === 'day' ? 'Par jour' : bucket === 'week' ? 'Par semaine' : 'Par mois'}
            right={(
              <div className="flex gap-1 bg-black/30 rounded-lg p-1">
                {[['revenue', "CA & dépenses"], ['washes', 'Lavages'], ['net', 'Résultat']].map(([k, l]) => (
                  <button key={k} onClick={() => setMetric(k)} className={`px-3 py-1 rounded-md text-xs font-semibold ${metric === k ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'}`}>{l}</button>
                ))}
              </div>
            )}
          >
            <AreaChart data={trend} series={metricSeries} height={260} formatValue={metric === 'washes' ? (v) => `${v} lavage${v > 1 ? 's' : ''}` : fcfa} formatTick={metric === 'washes' ? undefined : fcfaCompact} integer={metric === 'washes'} emptyWhenZero />
          </Section>

          <Section title="Classement des stations" subtitle="Cliquez sur un en-tête pour trier — la station la moins rentable se repère en un coup d’œil">
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-neutral-400 border-b border-white/10">
                    {COLUMNS.map((c) => (
                      <th key={c.key} onClick={() => setSort({ key: c.key, dir: sort.key === c.key && sort.dir === 'desc' ? 'asc' : 'desc' })}
                        className={`px-2 py-3 font-medium cursor-pointer select-none hover:text-white whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                        {c.label}{sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                      </th>
                    ))}
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => {
                    const share = cur.revenue > 0 ? s.revenue / cur.revenue : 0;
                    return (
                      <tr key={s.station_id} className="border-b border-white/5 hover:bg-white/[0.03]">
                        <td className="px-2 py-3">
                          <p className="font-semibold text-white">{s.name}</p>
                          <p className="text-xs text-neutral-500">{s.city || '—'}</p>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <p className="font-semibold text-white">{fcfa(s.revenue)}</p>
                          <div className="flex items-center justify-end gap-2 mt-1">
                            <Delta d={s.revenueDelta} />
                            <span className="text-[11px] text-neutral-500">{Math.round(share * 100)} %</span>
                          </div>
                          <div className="h-1 rounded-full bg-white/10 mt-1 ml-auto w-24 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.round(share * 100)}%` }} /></div>
                        </td>
                        <td className="px-2 py-3 text-right text-neutral-200">{s.washes}</td>
                        <td className="px-2 py-3 text-right text-neutral-200">{s.avgTicket ? fcfa(s.avgTicket) : '—'}</td>
                        <td className="px-2 py-3 text-right text-amber-300">{fcfa(s.expenses)}</td>
                        <td className={`px-2 py-3 text-right font-semibold ${s.net < 0 ? 'text-red-400' : 'text-teal-300'}`}>{fcfa(s.net)}</td>
                        <td className={`px-2 py-3 text-right ${s.margin != null && s.margin < 0 ? 'text-red-400' : 'text-neutral-200'}`}>{s.margin != null ? pct(s.margin) : '—'}</td>
                        <td className="px-2 py-3 text-right text-neutral-200">{s.rating != null ? `${s.rating.toFixed(1)} ★` : '—'}</td>
                        <td className="px-2 py-3 text-right text-neutral-200">{s.washesPerWasher != null ? s.washesPerWasher.toFixed(1) : '—'}</td>
                        <td className="px-2 py-3 text-right">
                          <button onClick={() => open(s)} disabled={opening !== null} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-emerald-600/20 hover:text-emerald-400 text-neutral-300 text-xs font-semibold disabled:opacity-50">
                            {opening === s.station_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DoorOpen className="w-3.5 h-3.5" />} Ouvrir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Chiffre d’affaires par station">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <Donut data={stationShare} centerLabel={fcfaCompact(cur.revenue)} centerSub="CA total" />
                <div className="flex-1 w-full"><Legend data={stationShare} formatValue={fcfa} /></div>
              </div>
            </Section>
            <Section title="Répartition par service">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <Donut data={toData(data.by_service)} centerLabel={fcfaCompact(cur.revenue)} centerSub="CA total" />
                <div className="flex-1 w-full"><Legend data={toData(data.by_service)} formatValue={fcfa} /></div>
              </div>
            </Section>
            <Section title="Modes de paiement">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <Donut data={toData(data.by_method, 2)} centerLabel={String(cur.txCount)} centerSub="transactions" />
                <div className="flex-1 w-full"><Legend data={toData(data.by_method, 2)} formatValue={fcfa} /></div>
              </div>
            </Section>
            <Section title="Dépenses par catégorie">
              <Bars data={toData(data.expense_by_category, 3)} color="#f59e0b" formatValue={fcfa} />
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Lavages par jour de la semaine" subtitle="Toutes stations confondues">
              <Bars data={dowData} color="#06b6d4" formatValue={(v) => `${v} lavage${v > 1 ? 's' : ''}`} />
            </Section>
            <Section title="Heures d’affluence" subtitle="Démarrages de lavage, par heure">
              <VerticalBars data={hourData} color="#06b6d4" formatValue={(v) => `${v} lavage${v > 1 ? 's' : ''}`} />
            </Section>
          </div>

          <Section title="Productivité des laveurs" subtitle="Les 10 laveurs les plus productifs du groupe — un lavage à plusieurs crédite chacun">
            {(data.washers || []).length === 0 ? <p className="text-sm text-neutral-500">Aucun lavage attribué à un laveur sur la période.</p> : (
              <Bars data={data.washers.slice(0, 10).map((w) => ({ label: `${w.name} · ${w.station}`, value: num(w.washes) }))} color="#a855f7" formatValue={(v) => `${v} lavage${v > 1 ? 's' : ''}`} />
            )}
          </Section>

          <p className="text-xs text-neutral-600 text-center pb-4">
            Chiffres calculés en direct, avec les mêmes définitions que le Bilan de chaque station. Les stations archivées ne sont pas incluses.
          </p>
        </div>
      )}
    </div>
  );
}

function num(v) { return Number.isFinite(+v) ? +v : 0; }
