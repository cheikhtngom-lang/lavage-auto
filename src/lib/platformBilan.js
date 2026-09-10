// Agrégation du "Bilan" plateforme (Super Admin > Bilan) — même principe que
// lib/bilan.js (station), réutilise ses utilitaires de période génériques,
// mais calcule sur les données Super Admin (abonnements stations, publicités,
// Super User, renouvellements, lavages payés en ligne).
//
// DEUX natures de revenu, jamais mélangées :
//
//  • RÉEL / ENCAISSÉ — un événement de paiement daté par ligne :
//      - publicités confirmées        (station_ads.confirmed_at + amount)
//      - abonnements Super User        (super_user_subscriptions.confirmed_at + amount)
//      - renouvellements de station    (station_renewal_payments status=CONFIRMED)
//      - commission des lavages en ligne (paiements_lavage.part_plateforme)
//    => somme dans `realCollected`.
//
//  • ESTIMÉ / RÉCURRENT — la plateforme ne journalise PAS les abonnements
//    marqués "payé" à la main (markSubscriptionPaid, useSuperAdminState.jsx),
//    donc le revenu d'abonnement récurrent est estimé mois par mois :
//    prix du plan × stations à l'abonnement VALIDÉ (subscription_status =
//    'a_jour') à cette date, + modules add-on actifs. Toujours annoté
//    "estimation" dans l'UI.
import { PERIOD_TYPES, periodRange, previousPeriod, isCurrentPeriod, periodKey, availablePeriods, fcfa, fcfaCompact, pct } from './bilan';
import { PAID_SUBSCRIPTION_STATUS, MODULE_PRICE_BY_ID } from './platformRevenue';

export { PERIOD_TYPES, periodRange, previousPeriod, isCurrentPeriod, periodKey, availablePeriods, fcfa, fcfaCompact, pct };

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const inRange = (dateVal, { start, end }) => {
  if (!dateVal) return false;
  const t = new Date(dateVal).getTime();
  return t >= start.getTime() && t < end.getTime();
};

// Liste des mois calendaires couverts par une période (1 pour "mensuel", 3
// pour "trimestriel"...) — sert à sommer l'estimation récurrente mois par mois.
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

// Stations dont l'abonnement est validé aujourd'hui ET déjà inscrites avant
// `monthEnd` — projète le MRR validé actuel dans le passé, faute d'historique.
function validatedBefore(stations, monthEnd) {
  return (stations || []).filter(
    (s) => s.subscriptionStatus === PAID_SUBSCRIPTION_STATUS && new Date(s.joinedAt) < monthEnd,
  );
}

function subscriptionEstimateForMonth(stations, PLANS, monthEnd) {
  return validatedBefore(stations, monthEnd).reduce((sum, s) => sum + (PLANS[s.plan]?.price || 0), 0);
}

function moduleEstimateForMonth(stations, monthEnd) {
  return validatedBefore(stations, monthEnd).reduce(
    (sum, s) => sum + (s.activeModules || []).reduce((a, id) => a + (MODULE_PRICE_BY_ID[id] || 0), 0),
    0,
  );
}

function computeSlice(data, range) {
  const {
    stations = [], clientAccounts = [], stationAds = [], superUserSubscriptions = [],
    stationRenewalPayments = [], lavagePayments = [], PLANS = {},
  } = data;

  const months = monthsInRange(range);
  const subscriptionEstimate = months.reduce((sum, m) => sum + subscriptionEstimateForMonth(stations, PLANS, m.end), 0);
  const moduleRevenue = months.reduce((sum, m) => sum + moduleEstimateForMonth(stations, m.end), 0);

  // ─── Flux RÉELS (un paiement daté par ligne) ───────────────────────
  const adsRevenue = stationAds
    .filter((a) => inRange(a.confirmedAt, range))
    .reduce((s, a) => s + num(a.amount), 0);

  const suRevenue = superUserSubscriptions
    .filter((s) => inRange(s.confirmedAt, range))
    .reduce((s, x) => s + num(x.amount), 0);

  const renewalRevenue = stationRenewalPayments
    .filter((p) => p.status === 'CONFIRMED' && inRange(p.confirmedAt, range))
    .reduce((s, p) => s + num(p.amount), 0);

  const washInRange = lavagePayments.filter((p) => inRange(p.createdAt, range));
  const washCommissionRevenue = washInRange.reduce((s, p) => s + num(p.partPlateforme), 0);
  const washGrossVolume = washInRange.reduce((s, p) => s + num(p.montantTotal), 0);
  const washStationPayout = washInRange.reduce((s, p) => s + num(p.partStation), 0);
  const washCount = washInRange.length;

  const realCollected = adsRevenue + suRevenue + renewalRevenue + washCommissionRevenue;

  // Vue consolidée : estimation récurrente (abonnements + modules) + flux réels
  // NON récurrents. `renewalRevenue` n'est PAS ré-additionné : c'est la part
  // réellement encaissée de l'abonnement déjà comptée dans l'estimation.
  const totalRevenue = subscriptionEstimate + moduleRevenue + adsRevenue + suRevenue + washCommissionRevenue;

  const newStations = stations.filter((s) => inRange(s.joinedAt, range)).length;
  const newMotorists = clientAccounts.filter((c) => inRange(c.createdAt, range)).length;

  // Revenu récurrent estimé par plan (abonnements validés à date).
  const planRevenue = {};
  Object.keys(PLANS).forEach((key) => {
    planRevenue[key] = stations
      .filter((s) => s.plan === key && s.subscriptionStatus === PAID_SUBSCRIPTION_STATUS)
      .length * (PLANS[key]?.price || 0);
  });

  return {
    totalRevenue, realCollected,
    subscriptionEstimate, moduleRevenue,
    adsRevenue, suRevenue, renewalRevenue,
    washCommissionRevenue, washGrossVolume, washStationPayout, washCount,
    newStations, newMotorists, planRevenue,
    activeStations: stations.filter((s) => s.status === 'active').length,
    validatedStations: stations.filter((s) => s.subscriptionStatus === PAID_SUBSCRIPTION_STATUS).length,
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
    return {
      label: b.label,
      subscription: slice.subscriptionEstimate,
      modules: slice.moduleRevenue,
      ads: slice.adsRevenue,
      superUser: slice.suRevenue,
      washCommission: slice.washCommissionRevenue,
      real: slice.realCollected,
      total: slice.totalRevenue,
    };
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
    realCollected: pctDelta(current.realCollected, previous.realCollected),
    subscriptionEstimate: pctDelta(current.subscriptionEstimate, previous.subscriptionEstimate),
    moduleRevenue: pctDelta(current.moduleRevenue, previous.moduleRevenue),
    adsRevenue: pctDelta(current.adsRevenue, previous.adsRevenue),
    suRevenue: pctDelta(current.suRevenue, previous.suRevenue),
    renewalRevenue: pctDelta(current.renewalRevenue, previous.renewalRevenue),
    washCommissionRevenue: pctDelta(current.washCommissionRevenue, previous.washCommissionRevenue),
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
