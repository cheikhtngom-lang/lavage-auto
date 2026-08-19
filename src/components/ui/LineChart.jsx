import React from 'react';
import { motion } from 'framer-motion';

// Graphique en ligne minimal (SVG + overlay HTML pour les points/tooltips) —
// pas de librairie de charts dans ce projet (voir package.json), même esprit
// artisanal que les graphiques en barres/donut déjà présents dans
// SuperAdmin/Analytics.jsx et Dashboard.jsx. Une seule série par instance.
export default function LineChart({ points, color = '#a855f7', height = 240, formatValue = (v) => String(v) }) {
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const n = points.length;
  const xPct = (i) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const yPct = (v) => 100 - ((v - min) / range) * 100;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPct(i)} ${yPct(p.value)}`).join(' ');
  const areaPath = n > 0 ? `${linePath} L ${xPct(n - 1)} 100 L ${xPct(0)} 100 Z` : '';
  const gradientId = `lc-grad-${color.replace('#', '')}`;

  if (n === 0) return null;

  return (
    <div className="w-full" style={{ height }}>
      <div className="relative w-full" style={{ height: height - 24 }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d={areaPath} fill={`url(#${gradientId})`} stroke="none"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
          />
          <motion.path
            d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: 'easeInOut' }}
          />
        </svg>
        {points.map((p, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 group/point z-10"
            style={{ left: `${xPct(i)}%`, top: `${yPct(p.value)}%` }}
          >
            <div className="w-2 h-2 rounded-full ring-2 ring-neutral-950 group-hover/point:scale-125 transition-transform" style={{ backgroundColor: color }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-[11px] text-white whitespace-nowrap opacity-0 group-hover/point:opacity-100 transition-opacity shadow-xl z-20">
              <span className="block text-neutral-400 capitalize">{p.label}</span>
              <span className="font-bold">{formatValue(p.value)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 px-0.5 gap-1">
        {points.map((p, i) => (
          <span key={i} className="text-[10px] text-neutral-500 whitespace-nowrap capitalize truncate">{p.label}</span>
        ))}
      </div>
    </div>
  );
}
