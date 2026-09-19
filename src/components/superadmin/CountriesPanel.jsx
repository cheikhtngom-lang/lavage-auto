import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { COUNTRIES } from '../../lib/countries';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';

// Interrupteur « pays ouvert aux clients » (table platform_countries, voir
// add_country_support.sql). Une station peut s'inscrire dans n'importe quel pays de
// la liste, ouvert ou non : on recrute d'abord des stations pilotes, puis on ouvre le
// pays ici. Tant qu'il est fermé, un client qui s'y trouve voit « pas encore
// disponible dans votre pays ».
export default function CountriesPanel() {
  const { stations } = useSuperAdminState();
  const [openByCode, setOpenByCode] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await supabase.from('platform_countries').select('code, open');
    if (err) setError(err.message);
    setOpenByCode(Object.fromEntries((data || []).map((row) => [row.code, !!row.open])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeStationsIn = (code) => stations.filter((s) => (s.country || 'SN') === code && s.status === 'active').length;

  const toggle = async (code, name) => {
    const next = !openByCode[code];
    if (next && activeStationsIn(code) === 0) {
      const ok = window.confirm(`${name} n'a encore aucune station active : les clients y verront « Aucune station ». Ouvrir quand même ?`);
      if (!ok) return;
    }
    setBusyCode(code);
    setError('');
    const { error: err } = await supabase.from('platform_countries').upsert({ code, open: next, updated_at: new Date().toISOString() });
    setBusyCode(null);
    if (err) { setError(err.message); return; }
    setOpenByCode((prev) => ({ ...prev, [code]: next }));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Globe className="w-5 h-5 text-purple-400" /> Pays</h2>
      <p className="text-neutral-400 mb-6 pb-4 border-b border-white/10">
        Une station peut s&apos;inscrire dans n&apos;importe quel pays de la liste. Un pays n&apos;est visible des clients que lorsque vous l&apos;ouvrez ici :
        avant cela, un visiteur qui s&apos;y trouve voit « pas encore disponible dans votre pays ».
      </p>

      {error && <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}

      {loading ? (
        <p className="text-neutral-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {COUNTRIES.map((c) => {
            const isOpen = !!openByCode[c.code];
            const count = activeStationsIn(c.code);
            return (
              <li key={c.code} className="py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">{c.name} <span className="text-xs text-neutral-500 font-normal">({c.code})</span></p>
                  <p className="text-sm text-neutral-500">{count} station{count > 1 ? 's' : ''} active{count > 1 ? 's' : ''} · {c.regions.length} {c.regionWord.toLowerCase()}s</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOpen}
                  aria-label={`${isOpen ? 'Fermer' : 'Ouvrir'} ${c.name}`}
                  disabled={busyCode === c.code}
                  onClick={() => toggle(c.code, c.name)}
                  className={`flex items-center gap-3 px-4 py-2 rounded-full text-sm font-medium border transition-colors disabled:opacity-60 ${isOpen ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'}`}
                >
                  {busyCode === c.code ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className={`w-2.5 h-2.5 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-neutral-600'}`} />}
                  {isOpen ? 'Ouvert aux clients' : 'Pas encore ouvert'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
