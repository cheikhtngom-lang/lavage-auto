// Agrégation du "Bilan" de la station (page Admin > Bilan, réservée au forfait
// Business). Ne lit rien de Supabase directement : reçoit les listes déjà
// chargées par useAppState (transactions, expenses, completedWashes, reviews)
// et les projette sur une période (mensuelle / trimestrielle / semestrielle /
// annuelle) + la période équivalente précédente, pour la comparaison.
//
// Toutes les valeurs sont RÉELLES (aucune donnée simulée). Une métrique sans
// donnée vaut 0 ou null — jamais un chiffre inventé.

export const PERIOD_TYPES = [
  { key: 'mensuel', label: 'Mensuel' },
  { key: 'trimestriel', label: 'Trimestriel' },
  { key: 'semestriel', label: 'Semestriel' },
  { key: 'annuel', label: 'Annuel' },
];

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DOW_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (v) => (Number.isFinite(+v) ? +v : 0);

// ─── Périodes ─────────────────────────────────────────────────────────
// Un `period` = { type, year, index }. index : mois 1-12 / trimestre 1-4 /
// semestre 1-2 / (ignoré pour l'annuel).

export function periodRange({ type, year, index }) {
  let startM = 0, months = 12, label = String(year);
  if (type === 'mensuel') { startM = index - 1; months = 1; label = `${cap(MONTHS_FR[startM])} ${year}`; }
  else if (type === 'trimestriel') { startM = (index - 1) * 3; months = 3; label = `T${index} ${year}`; }
  else if (type === 'semestriel') { startM = (index - 1) * 6; months = 6; label = `${index === 1 ? '1er' : '2e'} semestre ${year}`; }
  const start = new Date(year, startM, 1, 0, 0, 0, 0);
  const end = new Date(year, startM + months, 1, 0, 0, 0, 0);
  return { start, end, label, type };
}

export function previousPeriod({ type, year, index }) {
  if (type === 'annuel') return { type, year: year - 1, index: 1 };
  const per = type === 'mensuel' ? 12 : type === 'trimestriel' ? 4 : 2;
  let i = index - 1, y = year;
  if (i < 1) { i = per; y -= 1; }
  return { type, year: y, index: i };
}

// Libellé court "vs T2 2026", "vs mars 2026", "vs 2025"…
export function previousLabel(period) {
  return periodRange(previousPeriod(period)).label;
}

// Est-ce que la période contient aujourd'hui (donc partielle / "en cours") ?
export function isCurrentPeriod(period) {
  const { start, end } = periodRange(period);
  const now = new Date();
  return now >= start && now < end;
}

// Liste des périodes sélectionnables : de la 1re année d'activité (ou année
// courante - 2) jusqu'à la période en cours incluse, la plus récente d'abord.
export function availablePeriods(type, earliestDate) {
  const now = new Date();
  const firstYear = earliestDate ? new Date(earliestDate).getFullYear() : now.getFullYear() - 2;
  const out = [];
  for (let year = now.getFullYear(); year >= firstYear; year--) {
    if (type === 'annuel') { out.push({ type, year, index: 1 }); continue; }
    const per = type === 'mensuel' ? 12 : type === 'trimestriel' ? 4 : 2;
    for (let index = per; index >= 1; index--) {
      const { start } = periodRange({ type, year, index });
      if (start <= now) out.push({ type, year, index });
    }
  }
  return out.slice(0, type === 'mensuel' ? 24 : type === 'trimestriel' ? 12 : type === 'semestriel' ? 8 : 6);
}

export function periodKey(p) { return `${p.type}-${p.year}-${p.index}`; }

// ─── Filtres ─────────────────────────────────────────────────────────
const inRange = (dateVal, { start, end }) => {
  if (!dateVal) return false;
  const t = new Date(dateVal).getTime();
  return t >= start.getTime() && t < end.getTime();
};

// ─── Calcul d'une période ────────────────────────────────────────────
function computeSlice({ transactions, expenses, completedWashes, reviews }, range) {
  const tx = (transactions || []).filter((t) => inRange(t.createdAt, range));
  const exp = (expenses || []).filter((e) => inRange(e.createdAt, range));
  const washes = (completedWashes || []).filter((w) => inRange(w.completedAtISO, range));
  const revs = (reviews || []).filter((r) => inRange(r.createdAt, range));

  const revenue = tx.reduce((s, t) => s + num(t.amount), 0);
  const expenseTotal = exp.reduce((s, e) => s + num(e.amount), 0);
  const txCount = tx.length;
  const washCount = washes.length;

  const groupSum = (arr, keyFn, valFn) => {
    const m = {};
    arr.forEach((x) => { const k = keyFn(x) || 'Autre'; m[k] = (m[k] || 0) + valFn(x); });
    return m;
  };

  const byService = groupSum(tx, (t) => t.service, (t) => num(t.amount));
  const byMethod = groupSum(tx, (t) => t.method, (t) => num(t.amount));
  const expenseByCategory = groupSum(exp, (e) => e.category, (e) => num(e.amount));
  const washByCategory = groupSum(washes, (w) => w.category, () => 1);

  // Productivité laveurs : un lavage à plusieurs crédite chacun (cf. Analytics).
  const washerCount = {}; const washerValue = {};
  washes.forEach((w) => {
    const names = (w.assignedWasherNames && w.assignedWasherNames.length) ? w.assignedWasherNames : (w.assignedTo ? [w.assignedTo] : []);
    names.forEach((n) => { washerCount[n] = (washerCount[n] || 0) + 1; washerValue[n] = (washerValue[n] || 0) + num(w.amount); });
  });
  const washers = Object.keys(washerCount)
    .map((name) => ({ name, washes: washerCount[name], value: washerValue[name] }))
    .sort((a, b) => b.washes - a.washes);

  // Clients identifiés (compte lié) — nouveaux vs récurrents sur la période.
  const idClients = [...new Set(washes.filter((w) => w.clientId).map((w) => w.clientId))];
  const historyCount = {};
  (completedWashes || []).forEach((w) => {
    if (w.clientId && new Date(w.completedAtISO || 0) < range.end) {
      historyCount[w.clientId] = (historyCount[w.clientId] || 0) + 1;
    }
  });
  const returning = idClients.filter((id) => (historyCount[id] || 0) > (washes.filter((w) => w.clientId === id).length)).length;
  const newClients = idClients.length - returning;

  // Rythme : jour de semaine et heure les plus actifs (démarrages de lavage).
  const dow = new Array(7).fill(0);
  const hour = new Array(24).fill(0);
  washes.forEach((w) => {
    const d = w.startedAt ? new Date(w.startedAt) : new Date(w.completedAtISO);
    dow[d.getDay()] += 1; hour[d.getHours()] += 1;
  });
  const activeDays = new Set(tx.map((t) => new Date(t.createdAt).toISOString().slice(0, 10))).size;

  const avgRating = revs.length ? revs.reduce((s, r) => s + num(r.rating), 0) / revs.length : null;

  return {
    revenue, expenseTotal, netResult: revenue - expenseTotal,
    margin: revenue > 0 ? (revenue - expenseTotal) / revenue : null,
    txCount, washCount,
    avgTicket: txCount > 0 ? revenue / txCount : 0,
    avgWashValue: washCount > 0 ? washes.reduce((s, w) => s + num(w.amount), 0) / washCount : 0,
    byService, byMethod, expenseByCategory, washByCategory,
    washers,
    clients: { total: idClients.length, new: newClients, returning },
    avgRating, reviewCount: revs.length,
    busiestDow: dow.some((n) => n > 0) ? DOW_FR[dow.indexOf(Math.max(...dow))] : null,
    busiestHour: hour.some((n) => n > 0) ? hour.indexOf(Math.max(...hour)) : null,
    activeDays,
  };
}

// Sous-périodes pour la courbe d'évolution : mensuel -> semaines ; sinon -> mois.
function subBuckets({ transactions, expenses, completedWashes }, range, type) {
  const buckets = [];
  if (type === 'mensuel') {
    const y = range.start.getFullYear(), m = range.start.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    // Semaines calendaires du mois (1-7, 8-14, 15-21, 22-28, 29-fin).
    for (let d = 1; d <= daysInMonth; d += 7) {
      const s = new Date(y, m, d, 0, 0, 0, 0);
      const e = new Date(y, m, Math.min(d + 7, daysInMonth + 1), 0, 0, 0, 0);
      buckets.push({ label: `${d}–${Math.min(d + 6, daysInMonth)}`, start: s, end: e });
    }
  } else {
    let cur = new Date(range.start);
    while (cur < range.end) {
      const e = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 0, 0, 0, 0);
      buckets.push({ label: cap(MONTHS_FR[cur.getMonth()]).slice(0, 3), start: new Date(cur), end: e });
      cur = e;
    }
  }
  return buckets.map((b) => {
    const rev = (transactions || []).filter((t) => inRange(t.createdAt, b)).reduce((s, t) => s + num(t.amount), 0);
    const exp = (expenses || []).filter((x) => inRange(x.createdAt, b)).reduce((s, x) => s + num(x.amount), 0);
    const washes = (completedWashes || []).filter((w) => inRange(w.completedAtISO, b)).length;
    return { label: b.label, revenue: rev, expenses: exp, net: rev - exp, washes };
  });
}

// ─── Point d'entrée ──────────────────────────────────────────────────
export function buildBilan(data, period) {
  const range = periodRange(period);
  const prevRange = periodRange(previousPeriod(period));
  const current = computeSlice(data, range);
  const previous = computeSlice(data, prevRange);

  const pctDelta = (a, b) => {
    if (b === 0 || b == null) return null;
    return (a - b) / Math.abs(b);
  };
  const deltas = {
    revenue: pctDelta(current.revenue, previous.revenue),
    expenseTotal: pctDelta(current.expenseTotal, previous.expenseTotal),
    netResult: pctDelta(current.netResult, previous.netResult),
    washCount: pctDelta(current.washCount, previous.washCount),
    avgTicket: pctDelta(current.avgTicket, previous.avgTicket),
  };

  return {
    period,
    range, prevRange,
    prevLabel: prevRange.label,
    partial: isCurrentPeriod(period),
    current, previous, deltas,
    trend: subBuckets(data, range, period.type),
  };
}

// ─── Formatage ───────────────────────────────────────────────────────
export function fcfa(n) {
  return `${Math.round(num(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}
export function fcfaCompact(n) {
  const v = Math.round(num(n));
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.0', '')} M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 100) / 10} k`;
  return String(v);
}
export function pct(n, digits = 0) {
  if (n == null) return '—';
  return `${(n * 100).toFixed(digits)} %`;
}
export function hourLabel(h) {
  return h == null ? '—' : `${String(h).padStart(2, '0')}h–${String(h + 1).padStart(2, '0')}h`;
}
