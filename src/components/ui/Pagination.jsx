import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Barre de pagination réutilisable — pied de tableau, avec taille de page
// réglable. `page` est 1-indexé. Se masque automatiquement si le résultat
// tient sur une seule page ET qu'aucune autre taille de page ne changerait ça,
// mais reste visible avec Précédent/Suivant désactivés (comme la maquette).
export default function Pagination({
  page, pageSize, totalItems, onPageChange, onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 80, 100],
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 bg-neutral-950/60 border-t border-white/5 text-sm">
      <p className="text-neutral-400">
        Affichage de <span className="text-white font-medium">{from}</span> à <span className="text-white font-medium">{to}</span> sur <span className="text-white font-medium">{totalItems}</span> résultat{totalItems > 1 ? 's' : ''}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-neutral-400">
          <span>Afficher :</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-blue-500 appearance-none cursor-pointer"
          >
            {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Précédent
          </button>
          <span className="min-w-[1.75rem] h-7 px-2 flex items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs">
            {page}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400 transition-colors"
          >
            Suivant <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
