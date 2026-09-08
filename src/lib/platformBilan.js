// Agrégation du "Bilan" plateforme (Super Admin > Bilan) — même principe que
// lib/bilan.js (station), réutilise ses utilitaires de période génériques,
// mais calcule sur les données Super Admin (stations, publicités, Super
// User) plutôt que sur les transactions d'une station.
//
// Le revenu des abonnements stations n'a PAS de vrai registre de paiement
// (markSubscriptionPaid ne journalise rien, voir useSuperAdminState.jsx) :
// il est donc estimé mois par mois (plan x stations déjà inscrites à cette
// date, comme le fait déjà SuperAdmin/Analytics.jsx) — toujours annoté
// "estimation" dans l'UI. Les revenus publicités et Super User, eux, sont
// RÉELS (confirmedAt + amount, un événement de paiement par ligne).
import { PERIOD_TYPES, periodRange, previousPeriod, isCurrentPeriod, periodKey, availablePeriods, fcfa, fcfaCompact, pct } from './bilan';

export { PERIOD_TYPES, periodRange, previousPeriod, isCurrentPeriod, periodKey, availablePeriods, fcfa, fcfaCompact, pct };

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const inRange = (dateVal, { start, end }) => {
  if (!dateVal) return false;
  const t = new Date(dateVal).getTime();
  return t >= start.getTime() && t < end.getTime();
};

// Liste des mois calendaires couverts par une période (1 pour "mensuel", 3
// pour "trimestriel"...) — sert à sommer l'estimation MRR mois par mois.
function monthsInRange({ start, end }) {
  const out = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur < end) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    out.push({ start: cur, end: monthEnd });
    cur = monthEnd;
  }
  return out;
}

function stationRevenueForMonth(stations, PLANS, monthEnd) {
  return stations
    .filter((s) => new Date(s.joinedAt) < monthEnd && s.status !== 'suspendue' && s.subscriptionStatus !== 'illimite')
    .reduce((sum, s) => sum + (PLANS[s.plan]?.price || 0), 0);
}

function computeSlice({ stations, clientAccounts, stationAds, superUserSubscriptions, PLANS }, range) {
  const months = monthsInRange(range);
  const stationRevenue = months.reduce((sum, m) => sum + stationRevenueForMonth(stations || [], PLANS, m.end), 0);

  const adsInRange = (stationAds || []).filter((a) => inRange(a.confirmedAt, range));
  const adsRevenue = adsInRange.reduce((s, a) => s + num(a.amount), 0);

  const suInRange = (superUserSubscriptions || []).filter((s) => inRange(s.confirmedAt, range));
  const suRevenue = suInRange.reduce((s, x) => s + num(x.amount), 0);

  const totalRevenue = stationRevenue + adsRevenue + suRevenue;

  const newStations = (stations || []).filter((s) => inRange(s.joinedAt, range)).length;
  const newMotorists = (clientAccounts || []).filter((c) => inRange(c.createdAt, range)).length;

  const planRevenue = {};
  Object.keys(PLANS).forEach((key) => {
    planRevenue[key] = (stations || [])
      .filter((s) => s.plan === key && s.status !== 'suspendue' && s.subscriptionStatus !== 'illimite')
      .length * (PLANS[key]?.price || 0);
  });

  return {
    totalRevenue, stationRevenue, adsRevenue, suRevenue,
    newStations, newMotorists, planRevenue,
    activeStations: (stations || []).filter((s) => s.status === 'active').length,
  };
}

// Sous-périodes pour la courbe d'évolution : mensuel -> semaines ; sinon -> mois
// (même découpage que subBuckets dans lib/bilan.js).
const MONTHS_FR = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function subBuckets(data, range, type) {
  const buckets = [];
  if (type === 'mensuel') {
    const y = range.start.getFullYear(), m = range.start.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d += 7) {
      const s = new Date(y, m, d, 0, 0, 0, 0);
      const e = new Date(y, m, Math.min(d + 7, daysInMonth + 1), 0, 0, 0, 0);
      buckets.push({ label: `${d}–${Math.min(d + 6, daysInMonth)}`, start: s, end: e });
    }
  } else {
    let cur = new Date(range.start);
    while (cur < range.end) {
      const e = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 0, 0, 0, 0);
      buckets.push({ label: MONTHS_FR[cur.getMonth()], start: new Date(cur), end: e });
      cur = e;
    }
  }
  return buckets.map((b) => {
    const slice = computeSlice(data, b);
    return { label: b.label, stations: slice.stationRevenue, ads: slice.adsRevenue, superUser: slice.suRevenue, total: slice.totalRevenue };
  });
}

export function buildPlatformBilan(data, period) {
  const range = periodRange(period);
  const prevRange = periodRange(previousPeriod(period));
  const current = computeSlice(data, range);
  const previous = computeSlice(data, prevRange);

  const pctDelta = (a, b) => {
    if (b === 0 || b == null) return null;
    return (a - b) / Math.abs(b);
  };
  const deltas = {
    totalRevenue: pctDelta(current.totalRevenue, previous.totalRevenue),
    stationRevenue: pctDelta(current.stationRevenue, previous.stationRevenue),
    adsRevenue: pctDelta(current.adsRevenue, previous.adsRevenue),
    suRevenue: pctDelta(current.suRevenue, previous.suRevenue),
    newStations: pctDelta(current.newStations, previous.newStations),
    newMotorists: pctDelta(current.newMotorists, previous.newMotorists),
  };

  return {
    period, range, prevRange,
    prevLabel: prevRange.label,
    partial: isCurrentPeriod(period),
    current, previous, deltas,
    trend: subBuckets(data, range, period.type),
  };
}
