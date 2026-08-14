import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';

// Affichage seul (moyenne, demi-étoiles arrondies visuellement) — pour les cartes/fiches stations.
export function StarRatingDisplay({ average, count, size = 'w-4 h-4' }) {
  if (average == null) {
    return <span className="text-xs text-neutral-500">Aucun avis pour le moment</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={cn(size, i <= Math.round(average) ? 'fill-amber-400 text-amber-400' : 'text-neutral-700')}
          />
        ))}
      </div>
      <span className="text-sm font-medium text-white">{average.toFixed(1)}</span>
      <span className="text-xs text-neutral-500">({count})</span>
    </div>
  );
}

// Sélecteur interactif — pour laisser un avis.
export function StarRatingInput({ value, onChange, size = 'w-8 h-8' }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          className="p-0.5"
        >
          <Star className={cn(size, 'transition-colors', i <= (hovered || value) ? 'fill-amber-400 text-amber-400' : 'text-neutral-700')} />
        </button>
      ))}
    </div>
  );
}
