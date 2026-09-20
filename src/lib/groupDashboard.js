// Tableau de bord consolidé du chef d'entreprise (offre Sur mesure, phase 2).
// Toute l'agrégation est faite par la base (fonction group_dashboard, voir
// add_group_dashboard.sql) : ici on ne fait que choisir la période, lire le
// résultat, calculer les évolutions et repérer les points d'attention.
// Les définitions (CA, dépenses, lavages, laveurs, note) sont celles du Bilan
// d'une station (lib/bilan.js), donc les chiffres concordent partout.
import { supabase } from './supabaseClient';
import { fcfa } from './bilan';

const DAY = 86400000;
// Le Sénégal est en UTC : les jours et heures sont calculés en UTC (comme la base).
const utcDay = (y, m, d) => new Date(Date.UTC(y, m, d));
const startOfToday = () => { const n = new Date(); return utcDay(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fmtDay = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

export const PERIOD_PRESETS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'yesterday', label: 'Hier' },
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
  { key: 'month', label: 'Ce mois' },
  { key: 'lastMonth', label: 'Mois dernier' },
  { key: 'year', label: 'Cette année' },
  { key: 'custom', label: 'Personnalisé' },
];

// Renvoie { from, to (exclu), label } — `custom` = { start, end } au format AAAA-MM-JJ (fin incluse).
export function presetRange(key, custom) {
  const today = startOfToday();
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  switch (key) {
    case 'today': return { from: today, to: new Date(+today + DAY), label: "Aujourd'hui" };
    case 'yesterday': return { from: new Date(+today - DAY), to: today, label: 'Hier' };
    case '7d': return { from: new Date(+today - 6 * DAY), to: new Date(+today + DAY), label: '7 derniers jours' };
    case '30d': return { from: new Date(+today - 29 * DAY), to: new Date(+today + DAY), label: '30 derniers jours' };
    case 'month': return { from: utcDay(y, m, 1), to: utcDay(y, m + 1, 1), label: `${MONTHS[m]} ${y}`.replace(/^./, (c) => c.toUpperCase()) };
    case 'lastMonth': { const f = utcDay(y, m - 1, 1); return { from: f, to: utcDay(y, m, 1), label: `${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}`.replace(/^./, (c) => c.toUpperCase()) }; }
    case 'year': return { from: utcDay(y, 0, 1), to: utcDay(y + 1, 0, 1), label: String(y) };
    case 'custom': {
      const s = custom?.start && new Date(`${custom.start}T00:00:00Z`);
      const e = custom?.end && new Date(`${custom.end}T00:00:00Z`);
      if (!s || !e || Number.isNaN(+s) || Number.isNaN(+e) || e < s) return null;
      return { from: s, to: new Date(+e + DAY), label: `Du ${fmtDay(s)} au ${fmtDay(e)}` };
    }
    default: return null;
  }
}

// Granularité de la courbe selon la durée de la période.
export function bucketFor(from, to) {
  const days = (+to - +from) / DAY;
  return days <= 45 ? 'day' : days <= 190 ? 'week' : 'month';
}

// Libellé d'un point de courbe (label = AAAA-MM-JJ du début du seau).
export function bucketLabel(label, bucket) {
  const [y, mo, d] = label.split('-').map(Number);
  if (bucket === 'month') return `${MONTHS[mo - 1].slice(0, 3)} ${String(y).slice(2)}`;
  return `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}`;
}

// Lecture des données. stationIds : null = toutes les stations du groupe.
export async function fetchGroupDashboard({ from, to, stationIds }) {
  const { data, error } = await supabase.rpc('group_dashboard', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_station_ids: stationIds && stationIds.length ? stationIds : null,
    p_bucket: bucketFor(from, to),
  });
  if (error) throw new Error(error.message);
  return data;
}

// ─── Calculs ────────────────────────────────────────────────────────────
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const delta = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null);

// Une ligne par station avec ses ratios (résultat, marge, panier moyen…).
export function enrichStations(perStation) {
  return (perStation || []).map((s) => {
    const revenue = num(s.revenue);
    const expenses = num(s.expenses);
    const net = revenue - expenses;
    return {
      ...s,
      revenue, expenses, net,
      margin: revenue > 0 ? net / revenue : null,
      avgTicket: num(s.tx_count) > 0 ? revenue / num(s.tx_count) : 0,
      washes: num(s.washes),
      washesPerWasher: num(s.active_washers) > 0 ? num(s.washes) / num(s.active_washers) : null,
      revenueDelta: delta(revenue, num(s.prev_revenue)),
      rating: s.avg_rating == null ? null : num(s.avg_rating),
    };
  });
}

// Totaux du groupe (période courante + précédente) et évolutions.
export function computeTotals(perStation) {
  const sum = (key) => (perStation || []).reduce((t, s) => t + num(s[key]), 0);
  const cur = { revenue: sum('revenue'), expenses: sum('expenses'), washes: sum('washes'), txCount: sum('tx_count') };
  const prev = { revenue: sum('prev_revenue'), expenses: sum('prev_expenses'), washes: sum('prev_washes'), txCount: sum('prev_tx_count') };
  cur.net = cur.revenue - cur.expenses;
  prev.net = prev.revenue - prev.expenses;
  cur.margin = cur.revenue > 0 ? cur.net / cur.revenue : null;
  cur.avgTicket = cur.txCount > 0 ? cur.revenue / cur.txCount : 0;
  prev.avgTicket = prev.txCount > 0 ? prev.revenue / prev.txCount : 0;

  // Note moyenne pondérée par le nombre d'avis.
  const reviews = sum('review_count');
  cur.reviewCount = reviews;
  cur.rating = reviews > 0
    ? (perStation || []).reduce((t, s) => t + num(s.avg_rating) * num(s.review_count), 0) / reviews
    : null;

  const deltas = {
    revenue: delta(cur.revenue, prev.revenue),
    expenses: delta(cur.expenses, prev.expenses),
    net: prev.net !== 0 ? (cur.net - prev.net) / Math.abs(prev.net) : null,
    washes: delta(cur.washes, prev.washes),
    avgTicket: delta(cur.avgTicket, prev.avgTicket),
  };
  return { cur, prev, deltas };
}

// Points d'attention : règles simples et explicables (pas d'IA, voir phase 3).
// severity : 'danger' | 'warning' | 'success'.
export function buildInsights(stations) {
  const list = stations || [];
  const out = [];
  const active = list.filter((s) => s.revenue > 0 || s.expenses > 0 || s.washes > 0);

  list.forEach((s) => {
    if (s.revenue === 0 && s.washes === 0 && s.expenses === 0) {
      out.push({ severity: 'danger', station: s.name, text: `${s.name} : aucune activité enregistrée sur la période.` });
    } else if (s.net < 0) {
      out.push({ severity: 'danger', station: s.name, text: `${s.name} perd de l'argent sur la période : dépenses ${fcfa(s.expenses)} pour ${fcfa(s.revenue)} de chiffre d'affaires (résultat ${fcfa(s.net)}).` });
    }
    if (num(s.prev_revenue) > 0 && s.revenue < num(s.prev_revenue) * 0.7 && s.revenue > 0) {
      out.push({ severity: 'warning', station: s.name, text: `${s.name} : chiffre d'affaires en baisse de ${Math.round((1 - s.revenue / num(s.prev_revenue)) * 100)} % par rapport à la période précédente.` });
    }
    if (s.rating != null && s.rating < 3.5 && num(s.review_count) >= 3) {
      out.push({ severity: 'warning', station: s.name, text: `${s.name} : note client basse (${s.rating.toFixed(1)}/5 sur ${s.review_count} avis).` });
    }
  });

  // Productivité : lavages par laveur nettement sous la moyenne du groupe.
  const withWashers = active.filter((s) => s.washesPerWasher != null);
  if (withWashers.length >= 2) {
    const avg = withWashers.reduce((t, s) => t + s.washesPerWasher, 0) / withWashers.length;
    withWashers.forEach((s) => {
      if (avg > 0 && s.washesPerWasher < avg * 0.5) {
        out.push({ severity: 'warning', station: s.name, text: `${s.name} : ${s.washesPerWasher.toFixed(1)} lavages par laveur, moins de la moitié de la moyenne du groupe (${avg.toFixed(1)}).` });
      }
    });
  }

  // Meilleure station.
  if (active.length >= 2) {
    const best = [...active].sort((a, b) => b.revenue - a.revenue)[0];
    if (best.revenue > 0) out.push({ severity: 'success', station: best.name, text: `${best.name} est votre meilleure station : ${fcfa(best.revenue)} de chiffre d'affaires${best.margin != null ? `, marge ${Math.round(best.margin * 100)} %` : ''}.` });
  }

  const order = { danger: 0, warning: 1, success: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
