// Tests des chiffres de la rubrique Super Admin > Tapis. Lancer : npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCarpetStats, partnerFlows, kindCounts, emptyTrend, matchesSearch, ORDER_FILTERS } from './carpetStats.js';

const DAY = 86400000;
const now = new Date(Date.UTC(2026, 10, 11, 12)); // 11 nov. 2026, 12 h UTC
const from = new Date(Date.UTC(2026, 10, 5)); // 7 derniers jours : 5 → 12 nov. (exclu)
const to = new Date(Date.UTC(2026, 10, 12));
const at = (d, h = 10) => new Date(Date.UTC(2026, 10, d, h)).toISOString();

const order = (o) => ({ station_id: 's-1', piece_count: 1, amount: 0, paid: false, status: 'depose', items: [], promised_at: at(20), ...o });

const orders = [
  // Reçu sur la période, rendu à l'heure, payé.
  order({ id: 'a', created_at: at(6), ready_at: at(7), picked_up_at: at(8), promised_at: at(8), status: 'recupere', piece_count: 3, amount: 9000, paid: true, transaction_id: 't-a',
    items: [{ kind: 'Tapis de salon', qty: 1 }, { kind: 'Tapis de salon', qty: 1 }, { kind: 'Moquette', qty: 1 }] }),
  // En cours et en retard (promis le 10).
  order({ id: 'b', created_at: at(9), promised_at: at(10), status: 'lavage', piece_count: 2, amount: 4000, items: [{ kind: 'Tapis de prière', qty: 2 }] }),
  // Prêt, pas payé.
  order({ id: 'c', station_id: 's-2', created_at: at(10), ready_at: at(11, 9), promised_at: at(11, 8), status: 'pret', amount: 5000 }),
  // Période précédente.
  order({ id: 'd', created_at: at(1), ready_at: at(2), picked_up_at: at(2), status: 'recupere', piece_count: 2, amount: 3000, paid: true }),
  // Annulé : compté nulle part.
  order({ id: 'e', created_at: at(7), status: 'annule', piece_count: 5, amount: 10000 }),
  // Apporté par la station s-1 chez s-2, encaissé.
  order({ id: 'f', station_id: 's-2', from_station_id: 's-1', created_at: at(8), status: 'lavage', piece_count: 2, amount: 6000, paid: true, transaction_id: 't-f' }),
];
const payments = [
  { id: 't-a', station_id: 's-1', amount: 9000, created_at: at(8) },
  { id: 't-f', station_id: 's-2', amount: 6000, created_at: at(8, 15) },
  { id: 't-old', station_id: 's-1', amount: 3000, created_at: at(2) },
];

test('totaux : reçus, en cours, retards, rendus, chiffre d\'affaires', () => {
  const { totals, deltas } = computeCarpetStats({ orders, payments, from, to, bucket: 'day', now });
  assert.equal(totals.receivedOrders, 4); // a, b, c, f (pas l'annulé)
  assert.equal(totals.receivedPieces, 8);
  assert.equal(totals.receivedFromPartners, 1);
  assert.equal(totals.openPieces, 4); // b + f
  assert.equal(totals.lateOrders, 1); // b
  assert.equal(totals.readyOrders, 1);
  assert.equal(totals.returnedPieces, 3);
  assert.equal(totals.revenue, 15000);
  assert.equal(totals.revenuePrev, 3000);
  assert.equal(totals.partnerRevenue, 6000);
  assert.equal(totals.toCollect, 9000); // b 4 000 + c 5 000
  assert.equal(totals.cancelledOrders, 1);
  assert.equal(deltas.revenue, 4); // +400 %
  assert.equal(deltas.receivedPieces, 3); // 8 contre 2
  assert.equal(totals.onTimeRate, 0.5); // a à l'heure, c en retard d'une heure
  assert.equal(Math.round(totals.avgReadyHours), 24);
});

test('courbe : un point par jour jusqu\'à aujourd\'hui, rien après', () => {
  const { trend } = computeCarpetStats({ orders, payments, from, to, bucket: 'day', now });
  assert.equal(trend.length, 7); // 5 → 11 nov.
  assert.equal(trend.at(-1).label, '2026-11-11');
  assert.equal(trend.find((p) => p.label === '2026-11-08').revenue, 15000);
  assert.equal(trend.find((p) => p.label === '2026-11-06').pieces, 3);
});

test('courbe par semaine : semaines du lundi', () => {
  const t = emptyTrend(new Date(Date.UTC(2026, 8, 1)), to, 'week', now);
  assert.equal(t[0].label, '2026-08-31'); // le 1er sept. 2026 est un mardi
  assert.equal(new Date(t[1].label).getUTCDay(), 1);
});

test('par station et types de pièces', () => {
  const { perStation, byKind } = computeCarpetStats({ orders, payments, from, to, bucket: 'day', now });
  const s1 = perStation.find((s) => s.station_id === 's-1');
  const s2 = perStation.find((s) => s.station_id === 's-2');
  assert.equal(s1.revenue, 9000);
  assert.equal(s1.lateOrders, 1);
  assert.equal(s2.revenue, 6000);
  assert.equal(s2.receivedPieces, 3);
  assert.deepEqual(byKind.map((k) => [k.label, k.value]), [['Non précisé', 3], ['Tapis de salon', 2], ['Tapis de prière', 2], ['Moquette', 1]]);
});

test('anciens dépôts { kind, qty } et dépôt sans détail', () => {
  assert.deepEqual([...kindCounts({ items: [{ kind: 'Moquette', qty: 3 }] })], [['Moquette', 3]]);
  assert.deepEqual([...kindCounts({ items: [], piece_count: 2 })], [['Non précisé', 2]]);
});

test('stations partenaires : une ligne par couple, annulés exclus', () => {
  const flows = partnerFlows([...orders, order({ id: 'g', station_id: 's-2', from_station_id: 's-1', status: 'annule', created_at: at(9) })]);
  assert.equal(flows.length, 1);
  assert.deepEqual({ ...flows[0], key: undefined, lastAt: undefined }, { key: undefined, fromId: 's-1', toId: 's-2', orders: 1, pieces: 2, billed: 6000, collected: 6000, open: 1, ready: 0, lastAt: undefined });
});

test('filtres et recherche de la liste', () => {
  const late = ORDER_FILTERS.find((f) => f.key === 'retard');
  assert.deepEqual(orders.filter((o) => late.test(o, now)).map((o) => o.id), ['b']);
  const cash = ORDER_FILTERS.find((f) => f.key === 'a_encaisser');
  assert.deepEqual(orders.filter((o) => cash.test(o, now)).map((o) => o.id), ['b', 'c']);
  assert.ok(matchesSearch({ ticket_no: 12, client_name: 'Awa Diop' }, 'n° 12'));
  assert.ok(matchesSearch({ ticket_no: 3, client_name: 'Awa Diop' }, 'awa'));
  assert.ok(matchesSearch({ ticket_no: 3, client_name: 'X', client_phone: '77 123 45 67' }, '771234'));
  assert.ok(matchesSearch({ ticket_no: 3, client_name: 'X' }, 'saly', 'Lavage Saly'));
  assert.ok(!matchesSearch({ ticket_no: 3, client_name: 'X' }, '12'));
});
