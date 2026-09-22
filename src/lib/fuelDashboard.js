// Analytique et comptabilité CARBURANT (pompistes), séparées du lavage.
// L'agrégation est faite par la base (voir add_fuel_activity.sql) :
//   · group_fuel_dashboard     — le patron Sur mesure, son groupe seulement ;
//   · superadmin_fuel_overview — le Super Admin, toutes les stations.
// « Chiffre d'affaires carburant » = argent encaissé déclaré par les pompistes
// (relevé de fin de journée). C'est du brut : l'achat de carburant se saisit en
// dépense d'activité « carburant », ce qui donne un résultat par activité.
// Ces montants ne sont jamais mélangés aux transactions de lavage.
import { supabase } from './supabaseClient';
import { bucketFor } from './groupDashboard';

export const ACTIVITIES = [
  { key: 'global', label: 'Global' },
  { key: 'lavage', label: 'Lavage' },
  { key: 'carburant', label: 'Carburant' },
];

// Couleurs partagées : une par carburant, une par activité.
export const FUEL_COLORS = { essence: '#f59e0b', gasoil: '#0ea5e9' };
export const ACTIVITY_COLORS = { lavage: '#10b981', carburant: '#f59e0b' };

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const delta = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null);

function rangeArgs({ from, to }) {
  return { p_from: from.toISOString(), p_to: to.toISOString(), p_bucket: bucketFor(from, to) };
}

// Le patron : `null` si la fonction n'existe pas encore en base (migration pas
// jouée) — l'espace patron continue alors de fonctionner, sans carburant.
export async function fetchGroupFuel({ from, to, stationIds }) {
  const { data, error } = await supabase.rpc('group_fuel_dashboard', {
    ...rangeArgs({ from, to }),
    p_station_ids: stationIds && stationIds.length ? stationIds : null,
  });
  if (error) return null;
  return data;
}

export async function fetchSuperAdminFuel({ from, to }) {
  const { data, error } = await supabase.rpc('superadmin_fuel_overview', rangeArgs({ from, to }));
  if (error) throw new Error(error.message);
  return data;
}

// Une ligne par station qui fait du carburant, avec ses ratios.
export function enrichFuelStations(perStation) {
  return (perStation || []).filter((s) => s.has_fuel).map((s) => {
    const liters = num(s.liters);
    const amount = num(s.amount);
    const expenses = num(s.expenses);
    const net = amount - expenses;
    return {
      ...s,
      liters, amount, expenses, net,
      margin: amount > 0 ? net / amount : null,
      avgPrice: liters > 0 ? amount / liters : null,
      amountDelta: delta(amount, num(s.prev_amount)),
      litersDelta: delta(liters, num(s.prev_liters)),
      pompistes: num(s.pompistes),
      registered: num(s.registered),
      daysWorked: num(s.days_worked),
      readings: num(s.readings),
      essenceLiters: num(s.essence_liters), essenceAmount: num(s.essence_amount),
      gasoilLiters: num(s.gasoil_liters), gasoilAmount: num(s.gasoil_amount),
      undetailedLiters: num(s.undetailed_liters), undetailedAmount: num(s.undetailed_amount),
    };
  });
}

// Totaux (période courante + précédente) et évolutions.
export function computeFuelTotals(perStation) {
  const list = (perStation || []).filter((s) => s.has_fuel);
  const sum = (key) => list.reduce((t, s) => t + num(s[key]), 0);
  const cur = {
    liters: sum('liters'), amount: sum('amount'), expenses: sum('expenses'),
    pompistes: sum('pompistes'), registered: sum('registered'), daysWorked: sum('days_worked'), readings: sum('readings'),
    essenceLiters: sum('essence_liters'), essenceAmount: sum('essence_amount'),
    gasoilLiters: sum('gasoil_liters'), gasoilAmount: sum('gasoil_amount'),
    undetailedLiters: sum('undetailed_liters'), undetailedAmount: sum('undetailed_amount'),
  };
  const prev = { liters: sum('prev_liters'), amount: sum('prev_amount'), expenses: sum('prev_expenses') };
  cur.net = cur.amount - cur.expenses;
  prev.net = prev.amount - prev.expenses;
  cur.margin = cur.amount > 0 ? cur.net / cur.amount : null;
  cur.avgPrice = cur.liters > 0 ? cur.amount / cur.liters : null;
  prev.avgPrice = prev.liters > 0 ? prev.amount / prev.liters : null;
  const deltas = {
    liters: delta(cur.liters, prev.liters),
    amount: delta(cur.amount, prev.amount),
    expenses: delta(cur.expenses, prev.expenses),
    net: prev.net !== 0 ? (cur.net - prev.net) / Math.abs(prev.net) : null,
    avgPrice: cur.avgPrice != null && prev.avgPrice != null ? delta(cur.avgPrice, prev.avgPrice) : null,
  };
  return { cur, prev, deltas };
}

// Lavage + carburant : totaux du groupe. `lav` vient de computeTotals (lib/groupDashboard),
// `fuel` de computeFuelTotals. L'argent du carburant reste une ligne à part de celui du lavage.
export function combineTotals(lav, fuel) {
  const side = (l, f) => {
    const revenue = num(l.revenue) + num(f.amount);
    const expenses = num(l.expenses) + num(f.expenses);
    const net = revenue - expenses;
    return { revenue, expenses, net, margin: revenue > 0 ? net / revenue : null, lavage: num(l.revenue), carburant: num(f.amount) };
  };
  const cur = side(lav.cur, fuel.cur);
  const prev = side(lav.prev, fuel.prev);
  return {
    cur, prev,
    deltas: {
      revenue: delta(cur.revenue, prev.revenue),
      expenses: delta(cur.expenses, prev.expenses),
      net: prev.net !== 0 ? (cur.net - prev.net) / Math.abs(prev.net) : null,
    },
  };
}

// Une ligne par station (lavage + carburant) pour les tableaux « Global ». `lavStations` sort de
// enrichStations (lib/groupDashboard), `fuelStations` de enrichFuelStations.
export function combineStations(lavStations, fuelStations) {
  const fuelById = new Map((fuelStations || []).map((f) => [f.station_id, f]));
  return (lavStations || []).map((l) => {
    const f = fuelById.get(l.station_id);
    const lavage = num(l.revenue);
    const carburant = f ? f.amount : 0;
    const expLav = num(l.expenses);
    const expFuel = f ? f.expenses : 0;
    const revenue = lavage + carburant;
    const expenses = expLav + expFuel;
    const net = revenue - expenses;
    return {
      station_id: l.station_id, name: l.name, city: l.city,
      lavage, carburant, revenue, expLav, expFuel, expenses, net,
      margin: revenue > 0 ? net / revenue : null,
      netLav: lavage - expLav, netFuel: carburant - expFuel,
      hasFuel: !!f,
    };
  });
}

// Courbe combinée : mêmes seaux (labels AAAA-MM-JJ) dans les deux résultats.
export function combineTrends(lavTrend, fuelTrend) {
  const fuelByLabel = new Map((fuelTrend || []).map((t) => [t.label, t]));
  return (lavTrend || []).map((t) => {
    const f = fuelByLabel.get(t.label);
    const lavage = num(t.revenue);
    const carburant = f ? num(f.amount) : 0;
    const expenses = num(t.expenses) + (f ? num(f.expenses) : 0);
    return { label: t.label, lavage, carburant, revenue: lavage + carburant, expenses, net: lavage + carburant - expenses };
  });
}

// Prix moyen : montant ÷ litres, arrondi à l'unité.
export const avgPrice = (amount, liters) => (num(liters) > 0 ? Math.round(num(amount) / num(liters)) : null);
