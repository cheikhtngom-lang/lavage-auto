import React, { useState } from 'react';
import { Building2, ChevronDown, ChevronUp } from 'lucide-react';

// Filtre multi-stations (tableau de bord et analyse IA) : aucune case cochée
// = toutes les stations. `stations` = [{ id, name, city }].
export default function StationFilter({ stations, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const all = selected.length === 0 || selected.length === stations.length;
  const label = all
    ? `Toutes les stations (${stations.length})`
    : selected.length === 1 ? stations.find((s) => s.id === selected[0])?.name : `${selected.length} stations`;
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
