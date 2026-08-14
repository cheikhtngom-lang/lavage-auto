import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown, Search } from 'lucide-react';
import { VEHICLE_CATEGORIES, getBrandsForCategory, addCustomBrand } from '../../lib/vehicleBrands';

// Champs réutilisés partout où un automobiliste doit décrire un véhicule
// (Mon Garage, et le flux de réservation quand son garage est vide).

export function categoryIcon(category) {
  return VEHICLE_CATEGORIES.find((c) => c.value === category)?.label.split(' ')[0] || '🚗';
}

export function CategoryPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {VEHICLE_CATEGORIES.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={`text-left px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            value === c.value
              ? 'bg-blue-600/20 border-blue-500 text-blue-300'
              : 'bg-neutral-950 border-white/10 text-neutral-300 hover:border-white/20'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function BrandDropdown({ category, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [brands, setBrands] = useState(() => getBrandsForCategory(category));
  const ref = React.useRef(null);

  React.useEffect(() => {
    setBrands(getBrandsForCategory(category));
    setSearch('');
  }, [category]);

  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = brands.filter((b) => b.toLowerCase().includes(query));
  const exactMatch = brands.some((b) => b.toLowerCase() === query);
  const canAddNew = query.length > 0 && !exactMatch;

  const select = (brand) => { onChange(brand); setSearch(''); setOpen(false); };

  const handleAddNew = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    const updated = addCustomBrand(category, trimmed);
    setBrands(updated);
    select(trimmed);
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white text-left flex items-center justify-between gap-2 hover:border-white/20 transition-colors focus:outline-none focus:border-blue-500">
        <span className={value ? 'text-white' : 'text-neutral-500'}>{value || 'Sélectionnez une marque...'}</span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute z-50 left-0 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden" style={{ maxHeight: 300 }}>
            <div className="p-2 border-b border-white/5 flex items-center gap-2">
              <Search className="w-4 h-4 text-neutral-500 ml-1 flex-shrink-0" />
              <input autoFocus type="text" placeholder="Rechercher ou ajouter une marque..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-neutral-600" />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
              {filtered.map((b) => (
                <button key={b} type="button" onClick={() => select(b)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${value === b ? 'bg-blue-600/20 text-blue-300' : 'text-neutral-300 hover:bg-white/5'}`}>
                  {b}
                </button>
              ))}
              {filtered.length === 0 && !canAddNew && (
                <p className="text-center text-neutral-600 py-4 text-sm">Aucun résultat</p>
              )}
              {canAddNew && (
                <button type="button" onClick={handleAddNew}
                  className="w-full text-left px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-2 border-t border-white/5">
                  <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                  Ajouter « {search.trim()} » comme nouvelle marque
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
