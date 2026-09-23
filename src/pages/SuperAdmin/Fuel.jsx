import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Fuel as FuelIcon, Building2, Users, ClipboardCheck, RefreshCw, Loader2, Search } from 'lucide-react';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { Section, KpiGrid, PeriodBar } from '../../components/group/shared';
import FuelPanel, { FuelStationsTable } from '../../components/group/FuelPanel';
import { presetRange, bucketFor } from '../../lib/groupDashboard';
import { fetchSuperAdminFuel, enrichFuelStations, computeFuelTotals } from '../../lib/fuelDashboard';

// Super Admin > Carburant : les données des pompistes de TOUTES les stations — qui fait du
// carburant, ce qui est vendu et encaissé, essence contre gasoil, pompistes actifs.
// Lecture seule (fonction superadmin_fuel_overview, voir add_fuel_activity.sql). L'argent
// encaissé au carburant est déclaré par les pompistes : il n'entre ni dans le MRR ni dans
// les commissions de la plateforme (voir lib/platformRevenue.js).
export default function Fuel() {
  useDocumentTitle('Carburant');
  const [preset, setPreset] = useState('30d');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchSuperAdminFuel({ from: range.from, to: range.to }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const bucket = range ? bucketFor(range.from, range.to) : 'day';
  const stations = useMemo(() => enrichFuelStations(data?.per_station), [data]);
  const { cur } = useMemo(() => computeFuelTotals(data?.per_station), [data]);
  const active = stations.filter((s) => s.readings > 0).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? stations.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q)) : stations;
  }, [stations, search]);

  const kpis = [
    { title: 'Stations avec carburant', value: stations.length, icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10',
      sub: `${active} ont saisi des relevés sur la période` },
    { title: 'Pompistes enregistrés', value: cur.registered, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10',
      sub: `${cur.pompistes} ont travaillé sur la période` },
    { title: 'Relevés saisis', value: cur.readings, icon: ClipboardCheck, color: 'text-purple-400', bg: 'bg-purple-500/10',
      sub: `${cur.daysWorked} jour${cur.daysWorked > 1 ? 's' : ''} de présence` },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3"><FuelIcon className="w-9 h-9 text-amber-400" /> Carburant</h1>
          <p className="text-neutral-400 mt-1">{range ? `${range.label} · comparé à la période précédente de même durée` : 'Choisissez une période'}</p>
        </div>
        <button onClick={load} disabled={loading} className="self-start lg:self-auto p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-300 disabled:opacity-60" title="Actualiser">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      <PeriodBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />

      {error && <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}
      {!data && loading && <div className="flex items-center gap-3 text-neutral-400 p-8"><Loader2 className="w-5 h-5 animate-spin" /> Calcul…</div>}

      {data && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {stations.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
              <FuelIcon className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Aucune station ne fait de carburant pour l’instant</h3>
              <p className="text-neutral-400">Une station apparaît ici dès qu’elle déclare une pompe ou un pompiste (offre Station de service, rubrique Pompistes).</p>
            </div>
          ) : (
            <>
              <KpiGrid items={kpis} cols="md:grid-cols-3" />
              <FuelPanel fuel={data} bucket={bucket} />
              <Section
                title="Stations"
                subtitle="Cliquez sur un en-tête pour trier"
                right={(
                  <div className="relative">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une station…"
                      className="bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 w-64 max-w-full"
                    />
                  </div>
                )}
              >
                <FuelStationsTable
                  stations={filtered} totalAmount={cur.amount} paginate
                  extraLabel="Forfait" extraColumn={(s) => <span className="text-xs text-neutral-400">{s.plan || '—'}</span>}
                />
              </Section>
              <p className="text-xs text-neutral-600 text-center pb-4">
                Argent encaissé déclaré par les pompistes (chiffre brut) : il n’entre ni dans le MRR ni dans les commissions de la plateforme.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
