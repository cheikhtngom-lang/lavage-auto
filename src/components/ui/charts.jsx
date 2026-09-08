import React from 'react';
import { motion } from 'framer-motion';

// Primitives de graphiques SVG "maison" (pas de librairie externe, cohérent
// avec Analytics.jsx). Utilisées par la page Bilan.

export const CHART_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

function smoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// ─── Donut (répartition) ─────────────────────────────────────────────
export function Donut({ data, centerLabel, centerSub, size = 176 }) {
  const items = (data || []).filter((d) => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyBox height={size} />;
  let cum = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90 drop-shadow-xl">
        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        {items.map((d, i) => {
          const p = (d.value / total) * 100;
          const off = -cum;
          cum += p;
          return (
            <motion.circle key={d.label + i} cx="21" cy="21" r="15.91549430918954" fill="transparent"
              stroke={d.color || CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="5" strokeLinecap="butt"
              initial={{ strokeDasharray: '0 100' }} animate={{ strokeDasharray: `${p} ${100 - p}` }}
              transition={{ duration: 0.9, delay: 0.1 + i * 0.12 }} strokeDashoffset={off} />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span className="text-lg font-bold text-white leading-none">{centerLabel}</span>
        {centerSub && <span className="text-[10px] text-neutral-400 mt-1">{centerSub}</span>}
      </div>
    </div>
  );
}

export function Legend({ data, formatValue = (v) => v.toLocaleString('fr-FR') }) {
  const items = (data || []).filter((d) => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="space-y-2.5">
      {items.map((d, i) => (
        <div key={d.label + i} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color || CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-neutral-300 truncate">{d.label}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-neutral-500 text-xs w-9 text-right">{Math.round((d.value / total) * 100)}%</span>
            <span className="font-semibold text-white w-24 text-right">{formatValue(d.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Barres horizontales (classement) ────────────────────────────────
export function Bars({ data, color = '#3b82f6', formatValue = (v) => String(v) }) {
  const items = data || [];
  const max = Math.max(1, ...items.map((d) => d.value));
  if (items.length === 0) return <EmptyBox />;
  return (
    <div className="space-y-4">
      {items.map((d, i) => (
        <div key={d.label + i}>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-neutral-300 font-medium truncate pr-2">{d.label}</span>
            <span className="text-neutral-400 flex-shrink-0">{formatValue(d.value)}</span>
          </div>
          <div className="h-2 bg-neutral-900 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.08 }}
              className="h-full rounded-full" style={{ background: d.color || color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Barres groupées (comparaison N vs N-1) ──────────────────────────
export function GroupedBars({ groups, labelA, labelB, colorA = '#3b82f6', colorB = '#6b7280', formatValue = (v) => v.toLocaleString('fr-FR') }) {
  const g = groups || [];
  const max = Math.max(...g.flatMap((x) => [Math.abs(x.a), Math.abs(x.b)]), 0);
  if (g.length === 0 || max === 0) return <EmptyBox height={200} />;
  const W = 520, H = 200, padB = 34, padT = 10;
  const groupW = W / g.length;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: g.length > 4 ? 520 : undefined }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={padT + (H - padT - padB) * (1 - f)} y2={padT + (H - padT - padB) * (1 - f)} stroke="rgba(255,255,255,0.05)" />
        ))}
        {g.map((x, i) => {
          const cx = i * groupW + groupW / 2;
          const bw = Math.min(26, groupW / 3.2);
          const hA = (Math.abs(x.a) / max) * (H - padT - padB);
          const hB = (Math.abs(x.b) / max) * (H - padT - padB);
          const baseY = H - padB;
          return (
            <g key={x.label + i}>
              <motion.rect x={cx - bw - 3} width={bw} rx="3" fill={colorB}
                initial={{ height: 0, y: baseY }} animate={{ height: hB, y: baseY - hB }} transition={{ duration: 0.7, delay: 0.1 + i * 0.06 }} />
              <motion.rect x={cx + 3} width={bw} rx="3" fill={colorA}
                initial={{ height: 0, y: baseY }} animate={{ height: hA, y: baseY - hA }} transition={{ duration: 0.7, delay: 0.15 + i * 0.06 }} />
              <text x={cx} y={H - padB + 14} textAnchor="middle" fill="#a3a3a3" fontSize="10">{x.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-5 mt-1 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorB }} /> <span className="text-neutral-400">{labelB}</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorA }} /> <span className="text-neutral-400">{labelA}</span></span>
      </div>
    </div>
  );
}

// ─── Courbe multi-séries (évolution CA / dépenses / résultat) ────────
export function AreaLine({ data, keys, formatValue = (v) => v.toLocaleString('fr-FR'), height = 220 }) {
  const rows = data || [];
  const allVals = rows.flatMap((r) => keys.map((k) => r[k.key] || 0));
  if (rows.length === 0 || allVals.every((v) => v === 0)) return <EmptyBox height={height} />;
  const W = 640, padX = 30, padY = 16;
  const maxV = Math.max(1, ...allVals);
  const minV = Math.min(0, ...allVals);
  const span = maxV - minV || 1;
  const stepX = rows.length > 1 ? (W - padX * 2) / (rows.length - 1) : 0;
  const yOf = (v) => padY + (height - padY * 2) * (1 - (v - minV) / span);
  const zeroY = yOf(0);

  return (
    <svg viewBox={`0 0 ${W} ${height + 20}`} className="w-full" style={{ height: height + 20 }}>
      <defs>
        {keys.map((k) => (
          <linearGradient key={k.key} id={`fill-${k.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={k.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={k.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={padX} x2={W - padX} y1={padY + (height - padY * 2) * f} y2={padY + (height - padY * 2) * f} stroke="rgba(255,255,255,0.05)" />
      ))}
      {minV < 0 && <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />}
      {keys.map((k, ki) => {
        const pts = rows.map((r, i) => ({ x: padX + i * stepX, y: yOf(r[k.key] || 0) }));
        const line = smoothPath(pts);
        const area = `${line} L ${pts[pts.length - 1].x} ${zeroY} L ${pts[0].x} ${zeroY} Z`;
        return (
          <g key={k.key}>
            {ki === 0 && <motion.path d={area} fill={`url(#fill-${k.key})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9 }} />}
            <motion.path d={line} fill="none" stroke={k.color} strokeWidth="2.5" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: 'easeOut' }} />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#0a0a0a" stroke={k.color} strokeWidth="1.6" />
            ))}
          </g>
        );
      })}
      {rows.map((r, i) => (
        <text key={i} x={padX + i * stepX} y={height + 12} textAnchor="middle" fill="#737373" fontSize="9">{r.label}</text>
      ))}
    </svg>
  );
}

// ─── Jauge demi-cercle ──────────────────────────────────────────────
export function Gauge({ value, max = 100, color = '#10b981', suffix = '' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="relative w-40 h-20 mx-auto overflow-hidden">
      <svg viewBox="0 0 100 50" className="w-full h-full drop-shadow-lg">
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" strokeLinecap="round" />
        <motion.path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          initial={{ strokeDasharray: '0 126' }} animate={{ strokeDasharray: `${ratio * 126} 126` }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 text-center">
        <span className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toFixed(value < 10 && !Number.isInteger(value) ? 1 : 0) : value}{suffix}</span>
      </div>
    </div>
  );
}

function EmptyBox({ height = 176 }) {
  return (
    <div className="flex items-center justify-center text-center text-neutral-600 text-sm" style={{ height }}>
      Pas de données sur cette période.
    </div>
  );
}
