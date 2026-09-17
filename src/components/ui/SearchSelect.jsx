import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';

const MAX_VISIBLE = 50;

// Sélecteur avec recherche — même idiome que VehicleDropdown
// (Admin/StationDashboard.jsx), généralisé à n'importe quelle liste
// {value, label}. Contrairement à un <select> natif (liste déroulante
// rendue par l'OS, non stylable, pénible à parcourir au clavier/à la
// souris au-delà d'une trentaine d'entrées), celui-ci reste rapide et
// lisible même avec des centaines d'options : la recherche filtre en direct
// et l'affichage est plafonné à MAX_VISIBLE lignes.
export default function SearchSelect({ value, onChange, options, placeholder = 'Rechercher...', className = '' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const term = search.trim().toLowerCase();
  const filtered = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  const visible = filtered.slice(0, MAX_VISIBLE);
  const selected = options.find((o) => o.value === value);

  const selectItem = (val) => { onChange(val); setSearch(''); setOpen(false); };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(''); }}
        className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 hover:border-white/20 transition-colors flex items-center justify-between gap-2"
      >
        <span className="truncate">{selected?.label || placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            style={{ minWidth: '240px' }}
          >
            <div className="p-2 border-b border-white/5 flex items-center gap-2">
              <Search className="w-4 h-4 text-neutral-500 flex-shrink-0 ml-1" />
              <input
                autoFocus
                type="text"
                placeholder={placeholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && visible[0]) { e.preventDefault(); selectItem(visible[0].value); } }}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-neutral-600 min-w-0"
              />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
              {visible.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => selectItem(o.value)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                    value === o.value ? 'bg-purple-600/20 text-purple-300' : 'text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  {value === o.value && <span className="text-purple-400 text-xs flex-shrink-0">✓</span>}
                  <span className="truncate">{o.label}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-neutral-600 text-sm py-4">Aucun résultat</p>
              )}
              {filtered.length > MAX_VISIBLE && (
                <p className="text-center text-neutral-600 text-xs py-2 border-t border-white/5">
                  {filtered.length - MAX_VISIBLE} de plus — affinez la recherche
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
