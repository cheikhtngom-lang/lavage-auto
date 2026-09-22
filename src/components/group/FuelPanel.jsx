import React, { useEffect, useMemo, useState } from 'react';
import { Droplets, Banknote, Gauge as GaugeIcon, Users } from 'lucide-react';
import { AreaChart, Donut, Legend, Bars, compactNumber } from '../ui/charts';
import Pagination from '../ui/Pagination';
import { Section, KpiGrid, Delta } from './shared';
import { fcfa, fcfaCompact } from '../../lib/bilan';
import { bucketLabel } from '../../lib/groupDashboard';
import { fmtLiters } from '../../lib/pompistes';
import { FUEL_COLORS, computeFuelTotals, avgPrice } from '../../lib/fuelDashboard';

const num = (v) => (Number.isFinite(+v) ? +v : 0);

// Analytique CARBURANT : ce que les pompistes ont vendu (litres) et encaissé, par
// carburant, pistolet, pompe et pompiste. Données de group_fuel_dashboard /
// superadmin_fuel_overview (voir lib/fuelDashboard.js). Séparé du lavage.
export default function FuelPanel({ fuel, bucket }) {
  const [metric, setMetric] = useState('amount');
  const { cur, prev, deltas } = useMemo(() => computeFuelTotals(fuel?.per_station), [fuel]);

  const trend = (fuel?.trend || []).map((t) => ({ label: bucketLabel(t.label, bucket), amount: num(t.amount), liters: num(t.liters) }));
  const spark = { amount: trend.map((t) => t.amount), liters: trend.map((t) => t.liters) };

  const kpis = [
    { title: 'Litres vendus', value: Math.round(cur.liters * 10) / 10, decimals: 1, suffix: ' L', icon: Droplets, color: 'text-sky-400', bg: 'bg-sky-500/10', spark: spark.liters, sparkColor: '#0ea5e9', d: deltas.liters,
      sub: cur.essenceLiters || cur.gasoilLiters ? `Essence ${fmtLiters(cur.essenceLiters)} · Gasoil ${fmtLiters(cur.gasoilLiters)}` : null },
    { title: 'Argent encaissé', value: Math.round(cur.amount), suffix: ' FCFA', icon: Banknote, color: 'text-amber-400', bg: 'bg-amber-500/10', spark: spark.amount, sparkColor: '#f59e0b', d: deltas.amount,
      sub: `Période précédente : ${fcfa(prev.amount)}` },
    { title: 'Prix moyen / litre', value: cur.avgPrice != null ? Math.round(cur.avgPrice) : 0, suffix: cur.avgPrice != null ? ' FCFA' : '', icon: GaugeIcon, color: 'text-purple-400', bg: 'bg-purple-500/10', d: deltas.avgPrice,
      sub: 'encaissé ÷ litres : sert de contrôle' },
    { title: 'Pompistes', value: cur.pompistes, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10',
      sub: `${cur.daysWorked} jour${cur.daysWorked > 1 ? 's' : ''} travaillé${cur.daysWorked > 1 ? 's' : ''} · ${cur.readings} relevé${cur.readings > 1 ? 's' : ''}` },
  ];

  const fuelData = (fuel?.by_fuel || []).map((f) => ({ label: f.fuel === 'essence' ? 'Essence' : 'Gasoil', value: num(f.amount), liters: num(f.liters), color: FUEL_COLORS[f.fuel] }));
  const nozzles = (fuel?.by_nozzle || []).map((n) => ({ label: n.label, value: num(n.liters), amount: num(n.amount), color: FUEL_COLORS[n.fuel] }));
  const pumps = (fuel?.by_pump || []).map((p) => ({ label: p.label, value: num(p.amount), liters: num(p.liters) }));
  const pompistes = (fuel?.pompistes || []).slice(0, 10).map((p) => ({ label: `${p.name} · ${p.station}`, value: num(p.amount) }));
  const noReading = cur.readings === 0;

  return (
    <div className="space-y-6">
      <KpiGrid items={kpis} />

      {noReading && (
        <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          Aucun relevé de pompiste sur cette période : les litres et l’argent encaissé se remplissent à la descente de chaque pompiste.
        </div>
      )}

      <Section
        title="Évolution"
        subtitle={bucket === 'day' ? 'Par jour' : bucket === 'week' ? 'Par semaine' : 'Par mois'}
        right={(
          <div className="flex gap-1 bg-black/30 rounded-lg p-1">
            {[['amount', 'Argent encaissé'], ['liters', 'Litres']].map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)} className={`px-3 py-1 rounded-md text-xs font-semibold ${metric === k ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'}`}>{l}</button>
            ))}
          </div>
        )}
      >
        <AreaChart
          data={trend}
          series={metric === 'amount' ? [{ key: 'amount', label: 'Argent encaissé', color: '#f59e0b' }] : [{ key: 'liters', label: 'Litres vendus', color: '#0ea5e9' }]}
          height={260} formatValue={metric === 'amount' ? fcfa : fmtLiters} formatTick={metric === 'amount' ? fcfaCompact : compactNumber} emptyWhenZero
        />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Essence et gasoil" subtitle="Argent encaissé par carburant, d’après les relevés par pistolet">
          {fuelData.length === 0 ? <p className="text-sm text-neutral-500">Aucun relevé détaillé par pistolet sur la période.</p> : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Donut data={fuelData} centerLabel={fcfaCompact(fuelData.reduce((s, f) => s + f.value, 0))} centerSub="détaillé" />
              <div className="flex-1 w-full space-y-3">
                <Legend data={fuelData} formatValue={fcfa} />
                <div className="text-xs text-neutral-500 space-y-0.5">
                  {fuelData.map((f) => <p key={f.label}>{f.label} : {fmtLiters(f.liters)}</p>)}
                </div>
              </div>
            </div>
          )}
          {cur.undetailedAmount > 0 && (
            <p className="text-xs text-neutral-500 mt-4">Hors ventilation (relevés saisis en un seul total) : {fmtLiters(cur.undetailedLiters)} · {fcfa(cur.undetailedAmount)}</p>
          )}
        </Section>
        <Section title="Litres par pistolet" subtitle="Essence 1, Gasoil 1… toutes stations confondues">
          {nozzles.length === 0 ? <p className="text-sm text-neutral-500">Aucun relevé par pistolet sur la période.</p> : (
            <Bars data={nozzles} color="#0ea5e9" formatValue={fmtLiters} />
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Argent encaissé par pompe">
          {pumps.length === 0 ? <p className="text-sm text-neutral-500">Aucun relevé sur la période.</p> : <Bars data={pumps} color="#f59e0b" formatValue={fcfa} />}
        </Section>
        <Section title="Productivité des pompistes" subtitle="Les 10 pompistes qui ont le plus encaissé">
          {pompistes.length === 0 ? <p className="text-sm text-neutral-500">Aucun relevé sur la période.</p> : <Bars data={pompistes} color="#a855f7" formatValue={fcfa} />}
        </Section>
      </div>
    </div>
  );
}

// Classement des stations, carburant : trié par un clic sur l'en-tête.
// `paginate` : pagination du Super Admin (10 par page par défaut). `extraLabel` : titre de la colonne `extraColumn`.
export function FuelStationsTable({ stations, totalAmount, extraColumn, extraLabel = '', paginate = false }) {
  const [sort, setSort] = useState({ key: 'amount', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [stations.length, sort.key, sort.dir]);
  const cols = [
    { key: 'name', label: 'Station', align: 'left' },
    { key: 'amount', label: 'Argent encaissé', align: 'right' },
    { key: 'liters', label: 'Litres', align: 'right' },
    { key: 'avgPrice', label: 'Prix moyen / L', align: 'right' },
    { key: 'essenceLiters', label: 'Essence', align: 'right' },
    { key: 'gasoilLiters', label: 'Gasoil', align: 'right' },
    { key: 'pompistes', label: 'Pompistes', align: 'right' },
  ];
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
  const visible = paginate ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;

  return (
    <div>
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-neutral-400 border-b border-white/10">
            {cols.map((c) => (
              <th key={c.key} onClick={() => setSort({ key: c.key, dir: sort.key === c.key && sort.dir === 'desc' ? 'asc' : 'desc' })}
                className={`px-2 py-3 font-medium cursor-pointer select-none hover:text-white whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                {c.label}{sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
            {extraColumn && <th className="px-2 py-3 font-medium text-right whitespace-nowrap">{extraLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((s) => {
            const share = totalAmount > 0 ? s.amount / totalAmount : 0;
            return (
              <tr key={s.station_id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="px-2 py-3">
                  <p className="font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-neutral-500">{s.city || '—'}</p>
                </td>
                <td className="px-2 py-3 text-right">
                  <p className="font-semibold text-white">{fcfa(s.amount)}</p>
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <Delta d={s.amountDelta} />
                    <span className="text-[11px] text-neutral-500">{Math.round(share * 100)} %</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/10 mt-1 ml-auto w-24 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${Math.round(share * 100)}%` }} /></div>
                </td>
                <td className="px-2 py-3 text-right text-neutral-200">{fmtLiters(s.liters)}</td>
                <td className="px-2 py-3 text-right text-neutral-200">{avgPrice(s.amount, s.liters) != null ? fcfa(avgPrice(s.amount, s.liters)) : '—'}</td>
                <td className="px-2 py-3 text-right text-amber-300">{fmtLiters(s.essenceLiters)}</td>
                <td className="px-2 py-3 text-right text-sky-300">{fmtLiters(s.gasoilLiters)}</td>
                <td className="px-2 py-3 text-right text-neutral-200">
                  {s.pompistes}<span className="text-xs text-neutral-500"> · {s.daysWorked} j</span>
                </td>
                {extraColumn && <td className="px-2 py-3 text-right">{extraColumn(s)}</td>}
              </tr>
            );
          })}
          {sorted.length === 0 && <tr><td colSpan={cols.length + (extraColumn ? 1 : 0)} className="px-2 py-8 text-center text-neutral-500">Aucune station avec du carburant.</td></tr>}
        </tbody>
      </table>
    </div>
    {paginate && (
      <Pagination page={page} pageSize={pageSize} totalItems={sorted.length} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
    )}
    </div>
  );
}
