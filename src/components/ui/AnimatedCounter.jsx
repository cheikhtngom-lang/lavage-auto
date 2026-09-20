import React, { useEffect, useState } from 'react';

// Compteur qui s'anime de 0 jusqu'à `value` — utilisé par les cartes KPI
// (Vue d'ensemble, Bilan, tableau de bord du groupe) pour un rendu cohérent
// entre les rubriques. `decimals` (0 par défaut) permet d'afficher une valeur
// non entière, par ex. une note 4,2 / 5.
export default function AnimatedCounter({ value, prefix = '', suffix = '', decimals = 0 }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (value === 0) { setCount(0); return; }
    let start = 0;
    const duration = 1200;
    const increment = value / (duration / 16);
    const factor = 10 ** decimals;

    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start * factor) / factor);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value, decimals]);

  return (
    <span className="font-bold">
      {prefix}{count.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}
