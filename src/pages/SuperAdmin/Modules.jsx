import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Boxes, Building2 } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { STATION_MODULES, hasModule } from '../../lib/stationModules';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

export default function SuperAdminModules() {
  useDocumentTitle('Modules');
  const { stations, PLANS, toggleStationModule } = useSuperAdminState();
  const [stationId, setStationId] = useState('');

  const station = stations.find((s) => s.id === stationId) || null;
  const sortedStations = [...stations].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight flex items-center gap-3">
          <Boxes className="w-8 h-8 text-purple-400" /> Modules & <span className="text-purple-400">Add-ons</span>
        </h1>
        <p className="text-neutral-400 text-lg">Attribuez des options indépendantes à une station, sans changer son plan de base.</p>
      </div>

      <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02] mb-8">
        <label className="text-sm font-medium text-neutral-400 block mb-3">Sélectionner une station à configurer</label>
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 appearance-none"
          >
            <option value="">{sortedStations.length === 0 ? 'Aucune station' : '-- Choisir une station --'}</option>
            {sortedStations.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>)}
          </select>
          {station && (
            <span className="px-4 py-2.5 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded-lg font-medium text-sm whitespace-nowrap">
              Abonnement de base : {PLANS[station.plan]?.label || station.plan}
            </span>
          )}
        </div>
      </div>

      <div className={`transition-opacity ${station ? '' : 'opacity-50 pointer-events-none'}`}>
        {!station && (
          <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10 mb-6">
            <Building2 className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
            <p className="text-neutral-400">Choisissez une station ci-dessus pour voir et modifier ses modules.</p>
          </div>
        )}

        {station && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">Catalogue des modules additionnels</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {STATION_MODULES.map((mod, i) => {
                const active = hasModule(station.activeModules, mod.id);
                return (
                  <motion.div
                    key={mod.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`relative overflow-hidden rounded-2xl p-6 border transition-colors flex flex-col gap-4 ${
                      active ? 'border-purple-500 bg-purple-500/[0.06]' : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                    }`}
                  >
                    {active && (
                      <span className="absolute top-3 -right-8 rotate-45 bg-purple-600 text-white text-[10px] font-bold px-8 py-0.5">ACTIF</span>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                        <mod.icon className="w-6 h-6 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-bold flex items-center gap-2 flex-wrap">
                          {mod.name}
                          {mod.comingSoon && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full">Bientôt disponible</span>
                          )}
                        </h3>
                      </div>
                    </div>
                    <p className="text-neutral-400 text-sm flex-1">{mod.desc}</p>
                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <span className="text-white font-bold">{mod.price}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        onClick={() => toggleStationModule(station.id, mod.id, !active)}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${active ? 'bg-purple-600' : 'bg-white/10'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${active ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
