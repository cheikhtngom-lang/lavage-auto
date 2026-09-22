import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import AnimatedCounter from '../ui/AnimatedCounter';
import { Sparkline } from '../ui/charts';
import { PERIOD_PRESETS } from '../../lib/groupDashboard';
import { ACTIVITIES } from '../../lib/fuelDashboard';

// Pièces communes de l'espace patron : tableau de bord, comptabilité et leurs
// onglets Global / Lavage / Carburant.

// Évolution en %, vert = mieux (ou l'inverse pour les dépenses, avec `invert`).
export function Delta({ d, invert = false }) {
  if (d == null) return <span className="text-xs text-neutral-500">—</span>;
  const flat = Math.abs(d) < 0.005;
  const good = invert ? d < 0 : d > 0;
  const color = flat ? 'text-neutral-400' : good ? 'text-emerald-400' : 'text-red-400';
  const Icon = flat ? Minus : d > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${color}`}>
      <Icon className="w-3.5 h-3.5" />{d >= 0 ? '+' : ''}{(d * 100).toFixed(0)} %
    </span>
  );
}

export function Section({ title, subtitle, right, children, className = '' }) {
  return (
    <div className={`glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-6 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// Grille de cartes chiffrées. Chaque carte : { title, value, suffix, icon, color, bg, d, invert, sub, spark, sparkColor, decimals }.
export function KpiGrid({ items, cols = 'md:grid-cols-2 xl:grid-cols-4' }) {
  return (
    <div className={`grid grid-cols-1 ${cols} gap-6`}>
      {items.map((stat, index) => (
        <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08, type: 'spring', stiffness: 100 }}>
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden hover:bg-white/[0.04] transition-colors h-full">
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              {stat.spark && stat.spark.some((v) => v !== 0) && <Sparkline values={stat.spark} color={stat.sparkColor} />}
            </div>
            <p className="text-neutral-400 text-sm font-medium mb-1">{stat.title}</p>
            <h3 className="text-2xl xl:text-3xl text-white">
              {stat.text != null ? stat.text : <AnimatedCounter value={stat.value} suffix={stat.suffix} decimals={stat.decimals || 0} />}
            </h3>
            <div className="flex items-center gap-2 mt-2 min-h-[20px] flex-wrap">
              {stat.d !== null && stat.d !== undefined && <Delta d={stat.d} invert={stat.invert} />}
              {stat.sub && <span className="text-xs text-neutral-500">{stat.sub}</span>}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// Onglets Global / Lavage / Carburant.
export function ActivityTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Activité" className="inline-flex gap-1 bg-black/30 border border-white/10 rounded-xl p-1 mb-6">
      {ACTIVITIES.map((a) => (
        <button
          key={a.key} role="tab" aria-selected={value === a.key} onClick={() => onChange(a.key)}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${value === a.key ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-neutral-400 hover:text-white'}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// Choix de la période : raccourcis + dates personnalisées.
export function PeriodBar({ preset, onPreset, custom, onCustom }) {
  const chips = 'px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors';
  return (
    <div className="flex flex-wrap items-center gap-2 mb-8">
      {PERIOD_PRESETS.map((p) => (
        <button key={p.key} onClick={() => onPreset(p.key)} className={`${chips} ${preset === p.key ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`}>{p.label}</button>
      ))}
      {preset === 'custom' && (
        <div className="flex items-center gap-2 ml-1">
          <input type="date" value={custom.start} onChange={(e) => onCustom({ ...custom, start: e.target.value })} className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" />
          <span className="text-neutral-500 text-sm">au</span>
          <input type="date" value={custom.end} onChange={(e) => onCustom({ ...custom, end: e.target.value })} className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" />
        </div>
      )}
    </div>
  );
}
