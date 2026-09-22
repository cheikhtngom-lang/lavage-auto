import React, { useMemo } from 'react';
import { Banknote, Wallet, PieChart, Fuel } from 'lucide-react';
import { AreaChart, BarChart, Donut, Legend } from '../ui/charts';
import { Section, KpiGrid } from './shared';
import { fcfa, fcfaCompact, pct } from '../../lib/bilan';
import { bucketLabel, computeTotals, enrichStations } from '../../lib/groupDashboard';
import { ACTIVITY_COLORS, computeFuelTotals, enrichFuelStations, combineTotals, combineStations, combineTrends } from '../../lib/fuelDashboard';

const shortName = (name) => { const n = String(name || ''); return n.length > 16 ? `${n.slice(0, 15)}…` : n; };

// Vue GLOBALE du patron : lavage et carburant côte à côte, jamais mélangés en une seule
// ligne — chaque montant garde son activité (le détail vit dans les onglets Lavage et Carburant).
export default function GlobalPanel({ data, fuel, bucket }) {
  const lav = useMemo(() => computeTotals(data?.per_station), [data]);
  const fu = useMemo(() => computeFuelTotals(fuel?.per_station), [fuel]);
  const { cur, prev, deltas } = useMemo(() => combineTotals(lav, fu), [lav, fu]);
  const stations = useMemo(() => combineStations(enrichStations(data?.per_station), enrichFuelStations(fuel?.per_station)), [data, fuel]);
  const trend = useMemo(() => combineTrends(data?.trend, fuel?.trend).map((t) => ({ ...t, label: bucketLabel(t.label, bucket) })), [data, fuel, bucket]);

  const fuelShare = cur.revenue > 0 ? cur.carburant / cur.revenue : 0;
  const kpis = [
    { title: "Chiffre d'affaires total", value: Math.round(cur.revenue), suffix: ' FCFA', icon: Banknote, color: 'text-emerald-400', bg: 'bg-emerald-500/10', d: deltas.revenue,
      sub: `Lavage ${fcfaCompact(cur.lavage)} · Carburant ${fcfaCompact(cur.carburant)}` },
    { title: 'Dépenses totales', value: Math.round(cur.expenses), suffix: ' FCFA', icon: Wallet, color: 'text-amber-400', bg: 'bg-amber-500/10', d: deltas.expenses, invert: true,
      sub: `Période précédente : ${fcfa(prev.expenses)}` },
    { title: 'Résultat net', value: Math.round(cur.net), suffix: ' FCFA', icon: PieChart, color: cur.net >= 0 ? 'text-teal-400' : 'text-red-400', bg: cur.net >= 0 ? 'bg-teal-500/10' : 'bg-red-500/10', d: deltas.net,
      sub: cur.margin != null ? `marge ${pct(cur.margin)}` : null },
    { title: 'Part du carburant', text: cur.revenue > 0 ? pct(fuelShare) : '—', icon: Fuel, color: 'text-sky-400', bg: 'bg-sky-500/10',
      sub: 'du chiffre d’affaires total' },
  ];

  const split = [
    { label: 'Lavage', value: cur.lavage, color: ACTIVITY_COLORS.lavage },
    { label: 'Carburant', value: cur.carburant, color: ACTIVITY_COLORS.carburant },
  ];

  return (
    <div className="space-y-6">
      <KpiGrid items={kpis} />

      <Section title="Évolution par activité" subtitle={bucket === 'day' ? 'Chiffre d’affaires par jour' : bucket === 'week' ? 'Chiffre d’affaires par semaine' : 'Chiffre d’affaires par mois'}>
        <AreaChart
          data={trend}
          series={[{ key: 'lavage', label: 'Lavage', color: ACTIVITY_COLORS.lavage }, { key: 'carburant', label: 'Carburant', color: ACTIVITY_COLORS.carburant }]}
          height={260} formatValue={fcfa} formatTick={fcfaCompact} emptyWhenZero
        />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Répartition du chiffre d’affaires" subtitle="Lavage et carburant">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Donut data={split} centerLabel={fcfaCompact(cur.revenue)} centerSub="CA total" />
            <div className="flex-1 w-full"><Legend data={split} formatValue={fcfa} /></div>
          </div>
        </Section>
        <Section title="Par station" subtitle="Lavage et carburant côte à côte">
          <BarChart
            groups={stations.map((s) => ({ label: shortName(s.name), values: { lavage: s.lavage, carburant: s.carburant } }))}
            series={[{ key: 'lavage', label: 'Lavage', color: ACTIVITY_COLORS.lavage }, { key: 'carburant', label: 'Carburant', color: ACTIVITY_COLORS.carburant }]}
            height={240} formatValue={fcfa} formatTick={fcfaCompact} minColWidth={72}
          />
        </Section>
      </div>

      <Section title="Stations" subtitle="Chiffre d’affaires et résultat par activité — le détail est dans les onglets Lavage et Carburant">
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-400 border-b border-white/10">
                {['Station', 'Lavage', 'Carburant', 'Total', 'Dépenses', 'Résultat', 'Marge'].map((c, i) => (
                  <th key={c} className={`px-2 py-3 font-medium whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...stations].sort((a, b) => b.revenue - a.revenue).map((s) => (
                <tr key={s.station_id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-2 py-3"><p className="font-semibold text-white">{s.name}</p><p className="text-xs text-neutral-500">{s.city || '—'}</p></td>
                  <td className="px-2 py-3 text-right text-emerald-300">{fcfa(s.lavage)}</td>
                  <td className="px-2 py-3 text-right text-amber-300">{s.hasFuel ? fcfa(s.carburant) : <span className="text-neutral-600">—</span>}</td>
                  <td className="px-2 py-3 text-right font-semibold text-white">{fcfa(s.revenue)}</td>
                  <td className="px-2 py-3 text-right text-neutral-200">{fcfa(s.expenses)}</td>
                  <td className={`px-2 py-3 text-right font-semibold ${s.net < 0 ? 'text-red-400' : 'text-teal-300'}`}>{fcfa(s.net)}</td>
                  <td className={`px-2 py-3 text-right ${s.margin != null && s.margin < 0 ? 'text-red-400' : 'text-neutral-200'}`}>{s.margin != null ? pct(s.margin) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// Léger rappel affiché sous les onglets Carburant/Global.
export function FuelNote() {
  return (
    <p className="text-xs text-neutral-600 text-center pb-4">
      Carburant : argent encaissé déclaré par les pompistes à la descente (chiffre brut). L’achat de carburant se saisit en dépense d’activité « Carburant » dans la Comptabilité de la station. Ces montants ne sont jamais mélangés aux transactions de lavage.
    </p>
  );
}
