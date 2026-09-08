import React, { useEffect, useState } from 'react';

// Compteur qui s'anime de 0 jusqu'à `value` — utilisé par les cartes KPI
// (Vue d'ensemble, Bilan) pour un rendu cohérent entre les rubriques.
export default function AnimatedCounter({ value, prefix = '', suffix = '' }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (value === 0) { setCount(0); return; }
    let start = 0;
    const duration = 1200;
    const increment = value / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <span className="font-bold">
      {prefix}{count.toLocaleString('fr-FR')}{suffix}
    </span>
  );
}
