import React, { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Graphiques SVG "maison" (aucune librairie de charts : ni visx ni recharts, le
// bundle reste léger). Le rendu s'inspire de Bklit UI — courbes lissées avec
// dégradé et halo, réticule vertical + infobulle animée au survol, barres à
// sommet arrondi, anneau interactif, jauge lumineuse — sans en reprendre le code.
//
// Les composants cartésiens (AreaChart, BarChart) mesurent la largeur réelle de
// leur conteneur et dessinent en pixels : textes et points restent nets (l'ancien
// LineChart étirait un viewBox). Les noms et paramètres historiques — Donut,
// Legend, Bars, GroupedBars, VerticalBars, AreaLine, Gauge — sont conservés :
// Bilan, Analytics et les tableaux de bord en profitent sans changement d'appel.

export const CHART_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

// ─── Utilitaires ─────────────────────────────────────────────────────
const compactFmt = (() => {
  try { return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }); } catch { return null; }
})();
export const compactNumber = (v) => (compactFmt ? compactFmt.format(v) : String(Math.round(v)));

const cleanId = (id) => id.replace(/[^a-zA-Z0-9_-]/g, '');

function useElementWidth(ref, fallback = 640) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth || fallback);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return width;
}

// Échelle « propre » (graduations rondes 1/2/5 × 10ⁿ) qui inclut toujours zéro.
function niceScale(minV, maxV, { integer = false, tickCount = 4 } = {}) {
  let lo = Math.min(0, minV);
  let hi = Math.max(0, maxV);
  if (hi === lo) hi = lo + 1;
  const rough = (hi - lo) / tickCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.ceil(step));
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}

// Courbe monotone (Fritsch–Carlson) : lisse comme une spline mais sans dépassement,
// donc jamais de creux sous zéro entre deux points positifs.
function monotonePath(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / (dx[i] || 1);
  }
  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    d += ` C ${pts[i].x + dx[i] / 3} ${pts[i].y + (t[i] * dx[i]) / 3}, ${pts[i + 1].x - dx[i] / 3} ${pts[i + 1].y - (t[i + 1] * dx[i]) / 3}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

function roundedTop(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

// ─── Infobulle animée (commune à tous les graphiques cartésiens) ─────
function ChartTooltip({ x, y = 6, containerWidth, title, rows }) {
  const flip = x > containerWidth * 0.58;
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: x, top: y, transform: `translateX(${flip ? 'calc(-100% - 14px)' : '14px'})` }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.12 }}
        className="min-w-[8.5rem] rounded-xl border border-white/10 bg-neutral-900/95 px-3 py-2 shadow-2xl shadow-black/50 backdrop-blur-md"
      >
        {title && <p className="mb-1 text-[11px] font-medium capitalize text-neutral-400">{title}</p>}
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-4 text-xs">
              {r.label ? (
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
                  {r.label}
                </span>
              ) : (
                <span className="h-2 w-2 rounded-full" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
              )}
              <span className="font-semibold tabular-nums text-white">{r.value}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Courbe / aire (une ou plusieurs séries) ─────────────────────────
// data : [{ label, [key]: nombre }]   series : [{ key, label, color, area? }]
// La première série est remplie (dégradé) ; les suivantes ne sont que des lignes
// sauf `area: true`.
export function AreaChart({
  data, series, height = 240, formatValue = (v) => v.toLocaleString('fr-FR'), formatTick = compactNumber,
  integer = false, emptyWhenZero = false, ariaLabel = 'Graphique en courbe',
}) {
  const wrapRef = useRef(null);
  const width = useElementWidth(wrapRef);
  const uid = cleanId(useId());
  const [active, setActive] = useState(null);

  const rows = data || [];
  const n = rows.length;
  if (n === 0) return null;
  const values = rows.flatMap((r) => series.map((s) => Number(r[s.key]) || 0));
  if (emptyWhenZero && values.every((v) => v === 0)) return <EmptyBox height={height} />;

  const pad = { l: 48, r: 14, t: 14, b: 26 };
  const plotW = Math.max(10, width - pad.l - pad.r);
  const plotH = Math.max(10, height - pad.t - pad.b);
  const scale = niceScale(Math.min(...values), Math.max(...values), { integer });
  const span = scale.max - scale.min || 1;
  const xOf = (i) => pad.l + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const yOf = (v) => pad.t + plotH * (1 - (v - scale.min) / span);
  const baseY = yOf(Math.min(Math.max(0, scale.min), scale.max));

  const onMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const px = e.clientX - el.getBoundingClientRect().left;
    const idx = n > 1 ? Math.round(((px - pad.l) / plotW) * (n - 1)) : 0;
    setActive(Math.max(0, Math.min(n - 1, idx)));
  };

  const maxLabels = Math.max(2, Math.floor(plotW / 64));
  const labelStep = Math.ceil(n / maxLabels);

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      style={{ height, touchAction: 'pan-y' }}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setActive(null)}
    >
      {/* svg en absolu : sa largeur ne compte pas dans le calcul de la colonne (sinon, dans une grille,
          la carte ne pourrait plus rétrécir sous la largeur mesurée au premier rendu) */}
      <svg width={width} height={height} className="absolute left-0 top-0 block overflow-visible" role="img" aria-label={ariaLabel}>
        <defs>
          {series.map((s, si) => (
            <linearGradient key={s.key} id={`${uid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.34" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
          <filter id={`${uid}-glow`} x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {scale.ticks.map((t) => {
          const y = yOf(t);
          return (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={t === 0 && scale.min < 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'} strokeDasharray="3 5" />
              <text x={pad.l - 8} y={y + 3} textAnchor="end" fill="#737373" fontSize="10">{formatTick(t)}</text>
            </g>
          );
        })}

        {rows.map((r, i) => (i % labelStep === 0 ? (
          <text key={i} x={xOf(i)} y={height - 8} textAnchor="middle" fill="#737373" fontSize="10" className="capitalize">{r.label}</text>
        ) : null))}

        {series.map((s, si) => {
          const pts = rows.map((r, i) => ({ x: xOf(i), y: yOf(Number(r[s.key]) || 0) }));
          const line = monotonePath(pts);
          const area = `${line} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;
          return (
            <g key={s.key}>
              {(si === 0 || s.area) && n > 1 && (
                <motion.path d={area} fill={`url(#${uid}-g${si})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
              )}
              <motion.path
                d={line} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
                filter={`url(#${uid}-glow)`}
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: 'easeOut' }}
              />
              {(n <= 14 || n === 1) && pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="2.6" fill="#0a0a0a" stroke={s.color} strokeWidth="1.6" />
              ))}
            </g>
          );
        })}

        {active != null && (
          <g pointerEvents="none">
            <line x1={xOf(active)} x2={xOf(active)} y1={pad.t} y2={pad.t + plotH} stroke="rgba(255,255,255,0.28)" strokeDasharray="3 4" />
            {series.map((s) => {
              const y = yOf(Number(rows[active][s.key]) || 0);
              return (
                <g key={s.key}>
                  <circle cx={xOf(active)} cy={y} r="9" fill={s.color} opacity="0.2" />
                  <circle cx={xOf(active)} cy={y} r="4.5" fill="#0a0a0a" stroke={s.color} strokeWidth="2.25" />
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {active != null && (
        <ChartTooltip
          x={xOf(active)}
          containerWidth={width}
          title={rows[active].label}
          rows={series.map((s) => ({ key: s.key, label: s.label, color: s.color, value: formatValue(Number(rows[active][s.key]) || 0, s.key) }))}
        />
      )}
    </div>
  );
}

// ─── Barres verticales / groupées (cœur) ─────────────────────────────
// groups : [{ label, color?, values: { [seriesKey]: nombre } }]
// series : [{ key, label, color }]
export function BarChart({
  groups, series, height = 220, formatValue = (v) => v.toLocaleString('fr-FR'), formatTick = compactNumber,
  integer = false, minColWidth = 0, ariaLabel = 'Graphique en barres',
}) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const containerW = useElementWidth(outerRef, 520);
  const uid = cleanId(useId());
  const [active, setActive] = useState(null);

  const list = groups || [];
  const n = list.length;
  if (n === 0) return null;

  const pad = { l: 44, r: 8, t: 14, b: 26 };
  const totalW = Math.max(containerW, n * minColWidth + pad.l + pad.r);
  const plotW = totalW - pad.l - pad.r;
  const plotH = Math.max(10, height - pad.t - pad.b);
  const values = list.flatMap((g) => series.map((s) => Math.abs(Number(g.values?.[s.key]) || 0)));
  const scale = niceScale(0, Math.max(0, ...values), { integer });
  const groupW = plotW / n;
  const k = series.length;
  const gap = 4;
  const bw = Math.max(3, Math.min(k > 1 ? 26 : 36, (groupW * 0.72 - gap * (k - 1)) / k));
  const yOf = (v) => pad.t + plotH * (1 - v / (scale.max || 1));

  const onMove = (e) => {
    const el = innerRef.current;
    if (!el) return;
    const px = e.clientX - el.getBoundingClientRect().left - pad.l;
    setActive(px < 0 || px > plotW ? null : Math.max(0, Math.min(n - 1, Math.floor(px / groupW))));
  };

  const maxLabels = Math.max(2, Math.floor(plotW / 34));
  const labelStep = Math.ceil(n / maxLabels);

  return (
    <div ref={outerRef} className="relative w-full overflow-x-auto overflow-y-hidden" style={{ height: height + (totalW > containerW + 1 ? 12 : 0) }}>
      <div
        ref={innerRef}
        className="absolute left-0 top-0 select-none"
        style={{ width: totalW, height, touchAction: 'pan-y' }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <svg width={totalW} height={height} className="block overflow-visible" role="img" aria-label={ariaLabel}>
          <defs>
            {series.map((s, j) => (
              <linearGradient key={s.key} id={`${uid}-b${j}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="1" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.55" />
              </linearGradient>
            ))}
          </defs>

          {scale.ticks.map((t) => {
            const y = yOf(t);
            return (
              <g key={t}>
                <line x1={pad.l} x2={totalW - pad.r} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 5" />
                <text x={pad.l - 8} y={y + 3} textAnchor="end" fill="#737373" fontSize="10">{formatTick(t)}</text>
              </g>
            );
          })}

          {active != null && (
            <rect x={pad.l + active * groupW + 2} y={pad.t} width={Math.max(0, groupW - 4)} height={plotH} rx="8" fill="rgba(255,255,255,0.045)" />
          )}

          {list.map((g, i) => {
            const cxg = pad.l + i * groupW + groupW / 2;
            const startX = cxg - (k * bw + (k - 1) * gap) / 2;
            return (
              <g key={`${g.label}-${i}`} opacity={active == null || active === i ? 1 : 0.5} style={{ transition: 'opacity 0.15s' }}>
                {series.map((s, j) => {
                  const v = Math.abs(Number(g.values?.[s.key]) || 0);
                  const h = (v / (scale.max || 1)) * plotH;
                  if (h < 0.5) return null;
                  const useSolid = k === 1 && g.color;
                  return (
                    <motion.path
                      key={s.key}
                      d={roundedTop(startX + j * (bw + gap), pad.t + plotH - h, bw, h, 6)}
                      fill={useSolid ? g.color : `url(#${uid}-b${j})`}
                      initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                      transition={{ duration: 0.6, delay: 0.05 + i * 0.025, ease: 'easeOut' }}
                      style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                    />
                  );
                })}
                {i % labelStep === 0 && (
                  <text x={cxg} y={height - 8} textAnchor="middle" fill="#737373" fontSize="10" className="capitalize">{g.label}</text>
                )}
              </g>
            );
          })}
        </svg>

        {active != null && (
          <ChartTooltip
            x={pad.l + active * groupW + groupW / 2}
            containerWidth={totalW}
            title={list[active].label}
            rows={series.map((s) => ({ key: s.key, label: s.label, color: (k === 1 && list[active].color) || s.color, value: formatValue(Math.abs(Number(list[active].values?.[s.key]) || 0), s.key) }))}
          />
        )}
      </div>
    </div>
  );
}

// Colonnes simples pour une série de points { label, value } (ex. « nouvelles stations »).
export function ColumnChart({ points, color = '#a855f7', height = 240, formatValue = (v) => String(v), integer }) {
  const pts = points || [];
  const groups = pts.map((p) => ({ label: p.label, values: { value: p.value } }));
  return (
    <BarChart
      groups={groups} series={[{ key: 'value', label: '', color }]} height={height}
      formatValue={formatValue} integer={integer ?? pts.every((p) => Number.isInteger(p.value))} minColWidth={26}
    />
  );
}

// ─── Anneau (répartition) ────────────────────────────────────────────
// Survol d'un segment : il grossit, les autres s'estompent et le centre affiche
// son pourcentage et son libellé.
export function Donut({ data, centerLabel, centerSub, size = 176 }) {
  const [active, setActive] = useState(null);
  const items = (data || []).filter((d) => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyBox height={size} />;

  const R = 38;
  const C = 2 * Math.PI * R;
  const gap = items.length > 1 ? 3.2 : 0;
  let cum = 0;
  const activeItem = active != null ? items[active] : null;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label="Répartition">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        {items.map((d, i) => {
          const len = (d.value / total) * C;
          const vis = Math.max(0, len - gap);
          const offset = -(cum + gap / 2);
          cum += len;
          const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
          const isActive = active === i;
          return (
            <motion.circle
              key={d.label + i} cx="50" cy="50" r={R} fill="none" stroke={color} strokeLinecap="butt" strokeDashoffset={offset}
              initial={{ strokeDasharray: `0 ${C}`, strokeWidth: 10, opacity: 1 }}
              animate={{ strokeDasharray: `${vis} ${C - vis}`, strokeWidth: isActive ? 12.5 : 10, opacity: active == null || isActive ? 1 : 0.35 }}
              transition={{ strokeDasharray: { duration: 0.9, delay: 0.1 + i * 0.1 }, default: { duration: 0.18 } }}
              style={{ cursor: 'pointer', filter: isActive ? `drop-shadow(0 0 5px ${color})` : undefined }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onTouchStart={() => setActive(i)}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        {activeItem ? (
          <>
            <span className="text-lg font-bold leading-none text-white">{Math.round((activeItem.value / total) * 100)} %</span>
            <span className="mt-1 max-w-full truncate text-[10px] text-neutral-400">{activeItem.label}</span>
          </>
        ) : (
          <>
            <span className="text-lg font-bold leading-none text-white">{centerLabel}</span>
            {centerSub && <span className="mt-1 text-[10px] text-neutral-400">{centerSub}</span>}
          </>
        )}
      </div>
    </div>
  );
}

export function Legend({ data, formatValue = (v) => v.toLocaleString('fr-FR') }) {
  const items = (data || []).filter((d) => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="space-y-2.5">
      {items.map((d, i) => {
        const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
        return (
          <div key={d.label + i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} />
              <span className="text-neutral-300 truncate">{d.label}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-neutral-500 text-xs w-9 text-right">{Math.round((d.value / total) * 100)}%</span>
              <span className="font-semibold text-white w-24 text-right">{formatValue(d.value)}</span>
            </div>
          </div>
        );
      })}
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
      {items.map((d, i) => {
        const c = d.color || color;
        const fill = /^#[0-9a-fA-F]{6}$/.test(c) ? `linear-gradient(90deg, ${c}, ${c}b3)` : c;
        return (
          <div key={d.label + i} className="group">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-neutral-300 font-medium truncate pr-2 group-hover:text-white transition-colors">{d.label}</span>
              <span className="text-neutral-400 flex-shrink-0 tabular-nums">{formatValue(d.value)}</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${(d.value / max) * 100}%` }}
                transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: 'easeOut' }}
                className="h-full rounded-full" style={{ background: fill, boxShadow: `0 0 12px ${c}55` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Barres groupées (comparaison N vs N-1) ──────────────────────────
export function GroupedBars({ groups, labelA, labelB, colorA = '#3b82f6', colorB = '#6b7280', formatValue = (v) => v.toLocaleString('fr-FR') }) {
  const g = groups || [];
  const max = Math.max(...g.flatMap((x) => [Math.abs(x.a), Math.abs(x.b)]), 0);
  if (g.length === 0 || max === 0) return <EmptyBox height={200} />;
  return (
    <div>
      <BarChart
        groups={g.map((x) => ({ label: x.label, values: { b: x.b, a: x.a } }))}
        series={[{ key: 'b', label: labelB, color: colorB }, { key: 'a', label: labelA, color: colorA }]}
        height={220} formatValue={formatValue} minColWidth={g.length > 4 ? 64 : 0}
      />
      <div className="flex items-center justify-center gap-5 mt-1 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorB }} /> <span className="text-neutral-400">{labelB}</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorA }} /> <span className="text-neutral-400">{labelA}</span></span>
      </div>
    </div>
  );
}

// ─── Barres verticales (une série, beaucoup de catégories — ex. 24h) ──
export function VerticalBars({ data, color = '#3b82f6', height = 150, formatValue = (v) => String(v) }) {
  const items = data || [];
  if (items.length === 0 || items.every((d) => d.value === 0)) return <EmptyBox height={height} />;
  return (
    <BarChart
      groups={items.map((d) => ({ label: d.label, color: d.color, values: { value: d.value } }))}
      series={[{ key: 'value', label: '', color }]}
      height={Math.max(height, 170)} formatValue={formatValue} integer={items.every((d) => Number.isInteger(d.value))} minColWidth={24}
    />
  );
}

// ─── Courbe multi-séries (évolution CA / dépenses / résultat) ────────
export function AreaLine({ data, keys, formatValue = (v) => v.toLocaleString('fr-FR'), height = 220 }) {
  return (
    <AreaChart
      data={data} series={keys.map((k) => ({ key: k.key, label: k.label, color: k.color }))}
      height={height + 20} formatValue={formatValue} emptyWhenZero
    />
  );
}

// ─── Jauge demi-cercle ──────────────────────────────────────────────
export function Gauge({ value, max = 100, color = '#10b981', suffix = '' }) {
  const uid = cleanId(useId());
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="relative w-40 h-20 mx-auto overflow-hidden">
      <svg viewBox="0 0 100 50" className="w-full h-full">
        <defs>
          <linearGradient id={`${uid}-gg`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
          <filter id={`${uid}-gl`} x="-20%" y="-20%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" strokeLinecap="round" />
        <motion.path
          d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={`url(#${uid}-gg)`} strokeWidth="11" strokeLinecap="round" filter={`url(#${uid}-gl)`}
          initial={{ strokeDasharray: '0 126' }} animate={{ strokeDasharray: `${ratio * 126} 126` }} transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 text-center">
        <span className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toFixed(value < 10 && !Number.isInteger(value) ? 1 : 0) : value}{suffix}</span>
      </div>
    </div>
  );
}

// ─── Mini-courbe (cartes KPI) ────────────────────────────────────────
export function Sparkline({ values, color = '#10b981', width = 96, height = 32 }) {
  const uid = cleanId(useId());
  const vs = (values || []).map((v) => Number(v) || 0);
  if (vs.length < 2) return null;
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const p = 3;
  const pts = vs.map((v, i) => ({ x: p + (i * (width - p * 2)) / (vs.length - 1), y: p + (height - p * 2) * (1 - (v - min) / span) }));
  const line = monotonePath(pts);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={`${uid}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${last.x} ${height} L ${pts[0].x} ${height} Z`} fill={`url(#${uid}-s)`} />
      <motion.path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      <circle cx={last.x} cy={last.y} r="4.5" fill={color} opacity="0.22" />
      <circle cx={last.x} cy={last.y} r="2.2" fill={color} />
    </svg>
  );
}

function EmptyBox({ height = 176 }) {
  return (
    <div className="flex items-center justify-center text-center text-neutral-600 text-sm" style={{ height }}>
      Pas de données sur cette période.
    </div>
  );
}
