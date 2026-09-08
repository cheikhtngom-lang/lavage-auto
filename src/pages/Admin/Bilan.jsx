import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Download, TrendingUp, TrendingDown, Minus, Banknote, Receipt, Wallet, PieChart, Users, Star, Clock, CalendarDays, Loader2, FileBarChart } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { PRICING_CATEGORY_LABELS } from '../../lib/vehicleBrands';
import {
  PERIOD_TYPES, availablePeriods, periodRange, periodKey, isCurrentPeriod, buildBilan,
  fcfa, fcfaCompact, pct,
} from '../../lib/bilan';
import { downloadBilanPdf } from '../../lib/bilanPdf';
import { Donut, Legend, Bars, GroupedBars, AreaLine, Gauge, CHART_COLORS } from '../../components/ui/charts';

function Delta({ d, invert = false, className = '' }) {
  if (d == null) return <span className={`text-xs text-neutral-500 ${className}`}>—</span>;
  const flat = Math.abs(d) < 0.005;
  const good = invert ? d < 0 : d > 0;
  const color = flat ? 'text-neutral-400' : good ? 'text-emerald-400' : 'text-red-400';
  const Icon = flat ? Minus : d > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${color} ${className}`}>
      <Icon className="w-3.5 h-3.5" />{d >= 0 ? '+' : ''}{(d * 100).toFixed(0)} %
    </span>
  );
}

function Section({ title, subtitle, children, className = '' }) {
  return (
    <Card className={`border-white/5 bg-white/[0.02] ${className}`}>
      <CardContent className="p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function Bilan() {
  useDocumentTitle('Bilan');
  const { transactions, expenses, completedWashes, reviews, stationProfile } = useAppState();

  const data = useMemo(
    () => ({ transactions, expenses, completedWashes, reviews }),
    [transactions, expenses, completedWashes, reviews],
  );

  const earliest = useMemo(() => {
    const ds = (transactions || []).map((t) => t.createdAt).filter(Boolean).sort();
    return ds[0] || null;
  }, [transactions]);

  const [type, setType] = useState('mensuel');
  const periods = useMemo(() => availablePeriods(type, earliest), [type, earliest]);
  const [selKey, setSelKey] = useState(null);

  useEffect(() => {
    // À chaque changement de granularité, on repart sur la période la plus récente.
    setSelKey(periods[0] ? periodKey(periods[0]) : null);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const period = periods.find((p) => periodKey(p) === selKey) || periods[0];
  const bilan = useMemo(() => (period ? buildBilan(data, period) : null), [data, period]);

  const [pdfBusy, setPdfBusy] = useState(false);
  const handlePdf = async () => {
    if (!bilan) return;
    setPdfBusy(true);
    try {
      await downloadBilanPdf({
        station: {
          name: stationProfile?.name || 'Ma station',
          address: [stationProfile?.address, stationProfile?.quartier].filter(Boolean).join(', '),
          phone: stationProfile?.phone || '',
          logo: stationProfile?.logo || null,
          cachet: stationProfile?.cachet || null,
          slug: (stationProfile?.name || 'station').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        },
        bilan,
      });
    } catch (e) {
      alert('Export PDF impossible : ' + (e?.message || e));
    } finally {
      setPdfBusy(false);
    }
  };

  if (!bilan) {
    return (
      <div className="p-8 flex items-center gap-3 text-neutral-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Préparation du bilan…
      </div>
    );
  }

  const { current: cur, previous: prev, deltas, prevLabel, trend, partial } = bilan;

  const kpis = [
    { label: "Chiffre d'affaires", value: fcfa(cur.revenue), icon: Banknote, tint: 'text-emerald-400', bg: 'bg-emerald-500/10', d: deltas.revenue },
    { label: 'Dépenses', value: fcfa(cur.expenseTotal), icon: Wallet, tint: 'text-amber-400', bg: 'bg-amber-500/10', d: deltas.expenseTotal, invert: true },
    { label: 'Résultat net', value: fcfa(cur.netResult), icon: TrendingUp, tint: cur.netResult >= 0 ? 'text-blue-400' : 'text-red-400', bg: 'bg-blue-500/10', d: deltas.netResult },
    { label: 'Marge nette', value: pct(cur.margin), icon: PieChart, tint: 'text-purple-400', bg: 'bg-purple-500/10', d: null },
  ];

  const serviceData = Object.entries(cur.byService).map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const methodData = Object.entries(cur.byMethod).map(([label, value], i) => ({ label, value, color: CHART_COLORS[(i + 2) % CHART_COLORS.length] }));
  const vehicleData = Object.entries(cur.washByCategory).map(([label, value], i) => ({ label: PRICING_CATEGORY_LABELS[label] || label, value, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const expenseData = Object.entries(cur.expenseByCategory).map(([label, value], i) => ({ label, value, color: CHART_COLORS[(i + 3) % CHART_COLORS.length] }));

  const compareGroups = [
    { label: 'CA', a: cur.revenue, b: prev.revenue },
    { label: 'Dépenses', a: cur.expenseTotal, b: prev.expenseTotal },
    { label: 'Résultat', a: cur.netResult, b: prev.netResult },
    { label: 'Lavages', a: cur.washCount, b: prev.washCount },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto relative z-10">
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Bilan d'<span className="text-blue-400">activité</span></h1>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-1 rounded-md">Business</span>
          </div>
          <p className="text-neutral-400">Toutes vos données consolidées sur la période, avec comparaison à la période précédente.</p>
        </div>
        <button
          onClick={handlePdf}
          disabled={pdfBusy}
          className="cta-beam bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2 flex-shrink-0"
        >
          {pdfBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          Télécharger le PDF
        </button>
      </div>

      {/* Contrôles de période */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex overflow-x-auto gap-2 scrollbar-hide">
          {PERIOD_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                type === t.key ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={selKey || ''}
          onChange={(e) => setSelKey(e.target.value)}
          className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500 [color-scheme:dark] sm:w-64"
        >
          {periods.map((p) => {
            const k = periodKey(p);
            return <option key={k} value={k}>{periodRange(p).label}{isCurrentPeriod(p) ? ' — en cours' : ''}</option>;
          })}
        </select>
      </div>

      {partial && (
        <div className="mb-6 text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
          Période <strong>en cours</strong> : les chiffres évoluent jusqu'à la fin de la période.
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k, i) => (
          <Card key={i} className="border-white/5 bg-white/[0.02]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${k.bg}`}><k.icon className={`w-5 h-5 ${k.tint}`} /></div>
                <Delta d={k.d} invert={k.invert} />
              </div>
              <p className="text-xl font-bold text-white leading-tight">{k.value}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
              {k.d != null && <p className="text-[11px] text-neutral-600 mt-1">vs {prevLabel}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Évolution + Comparaison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Section title="Évolution sur la période" subtitle="Chiffre d'affaires, dépenses et résultat net" className="lg:col-span-2">
          <AreaLine
            data={trend}
            keys={[
              { key: 'revenue', color: '#10b981', label: 'CA' },
              { key: 'expenses', color: '#f59e0b', label: 'Dépenses' },
              { key: 'net', color: '#3b82f6', label: 'Résultat' },
            ]}
            formatValue={fcfaCompact}
          />
          <div className="flex flex-wrap gap-4 mt-3 text-xs">
            {[['CA', '#10b981'], ['Dépenses', '#f59e0b'], ['Résultat net', '#3b82f6']].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} /><span className="text-neutral-400">{l}</span></span>
            ))}
          </div>
        </Section>

        <Section title={`Période vs ${prevLabel}`} subtitle="Comparaison directe">
          <GroupedBars groups={compareGroups} labelA="Cette période" labelB={prevLabel} colorA="#3b82f6" colorB="#525252" formatValue={fcfaCompact} />
        </Section>
      </div>

      {/* Répartitions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Section title="Chiffre d'affaires par service">
          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <Donut data={serviceData} centerLabel={fcfaCompact(cur.revenue)} centerSub="CA total" />
            <Legend data={serviceData} formatValue={(v) => fcfa(v)} />
          </div>
        </Section>
        <Section title="Moyens de paiement">
          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <Donut data={methodData} centerLabel={String(cur.txCount)} centerSub="transactions" />
            <Legend data={methodData} formatValue={(v) => fcfa(v)} />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Section title="Types de véhicules lavés" subtitle={`${cur.washCount} lavage${cur.washCount > 1 ? 's' : ''} terminé${cur.washCount > 1 ? 's' : ''}`}>
          <Bars data={vehicleData} formatValue={(v) => `${v} (${cur.washCount > 0 ? Math.round((v / cur.washCount) * 100) : 0}%)`} />
        </Section>
        <Section title="Postes de dépenses" subtitle={fcfa(cur.expenseTotal) + ' au total'}>
          <Bars data={expenseData} color="#f59e0b" formatValue={(v) => fcfa(v)} />
        </Section>
      </div>

      {/* Laveurs */}
      <div className="mb-6">
        <Section title="Productivité des laveurs" subtitle="Lavages réalisés et valeur traitée sur la période">
          {cur.washers.length === 0 ? (
            <p className="text-neutral-600 text-sm py-6 text-center">Aucun lavage assigné à un laveur sur cette période.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">
              <Bars data={cur.washers.slice(0, 6).map((w) => ({ label: w.name, value: w.washes }))} color="#a855f7" formatValue={(v) => `${v} lavage${v > 1 ? 's' : ''}`} />
              <div className="space-y-3">
                {cur.washers.slice(0, 6).map((w, i) => (
                  <div key={w.name} className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0">
                    <span className="text-neutral-300">{i + 1}. {w.name}</span>
                    <span className="font-semibold text-white">{fcfa(w.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Clients / satisfaction / rythme */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Section title="Clients identifiés" subtitle="Comptes automobilistes liés sur la période">
          {cur.clients.total === 0 ? (
            <p className="text-neutral-600 text-sm py-6 text-center">Aucun client identifié sur cette période.</p>
          ) : (
            <>
              <Gauge value={cur.clients.total > 0 ? Math.round((cur.clients.returning / cur.clients.total) * 100) : 0} max={100} color="#10b981" suffix="%" />
              <p className="text-center text-xs text-neutral-500 mt-1 mb-4">de clients récurrents</p>
              <div className="flex justify-around text-center">
                <div><p className="text-lg font-bold text-blue-400">{cur.clients.new}</p><p className="text-xs text-neutral-500">Nouveaux</p></div>
                <div><p className="text-lg font-bold text-emerald-400">{cur.clients.returning}</p><p className="text-xs text-neutral-500">Récurrents</p></div>
                <div><p className="text-lg font-bold text-white">{cur.clients.total}</p><p className="text-xs text-neutral-500">Total</p></div>
              </div>
            </>
          )}
        </Section>

        <Section title="Satisfaction client" subtitle={`${cur.reviewCount} avis sur la période`}>
          <div className="flex flex-col items-center justify-center py-3">
            <div className="flex items-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`w-6 h-6 ${cur.avgRating != null && n <= Math.round(cur.avgRating) ? 'text-amber-400 fill-amber-400' : 'text-neutral-700'}`} />
              ))}
            </div>
            <p className="text-3xl font-bold text-white">{cur.avgRating != null ? cur.avgRating.toFixed(1) : '—'}<span className="text-base text-neutral-500 font-medium"> / 5</span></p>
            <Delta d={prev.avgRating != null && cur.avgRating != null ? (cur.avgRating - prev.avgRating) / prev.avgRating : null} className="mt-2" />
          </div>
        </Section>

        <Section title="Rythme d'activité">
          <div className="space-y-4">
            {[
              { icon: CalendarDays, label: 'Jour le plus actif', value: cur.busiestDow ? cur.busiestDow.charAt(0).toUpperCase() + cur.busiestDow.slice(1) : '—' },
              { icon: Clock, label: 'Heure de pointe', value: cur.busiestHour != null ? `${String(cur.busiestHour).padStart(2, '0')}h – ${String(cur.busiestHour + 1).padStart(2, '0')}h` : '—' },
              { icon: Receipt, label: 'Jours travaillés', value: `${cur.activeDays} jour${cur.activeDays > 1 ? 's' : ''}` },
              { icon: Banknote, label: 'Panier moyen', value: fcfa(cur.avgTicket) },
            ].map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5"><r.icon className="w-4 h-4 text-neutral-400" /></div>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm text-neutral-400">{r.label}</span>
                  <span className="text-sm font-bold text-white">{r.value}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
