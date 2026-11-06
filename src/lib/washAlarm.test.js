// Tests des règles de l'alerte « temps de lavage écoulé » et de la mise à jour
// des onglets restés ouverts. Lancer : npm test (node --test, sans dépendance).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { washDurationMinutes, startedBeforeToday, findOverdueWashes, ringingWashes, sameOverdueList } from './washAlarm.js';
import { isNewerBuild, canReloadSilently } from './appVersion.js';

const cfg = { Particulier: { 'Lavage Simple': 15, 'Lavage Complet': 0 } };
const now = new Date(2026, 10, 6, 8, 41).getTime(); // 6 nov. 2026, 08 h 41
const minutesAgo = (m) => new Date(now - m * 60000).toISOString();
const yesterday1740 = new Date(2026, 10, 5, 17, 40).toISOString();

test('durée : celle de la station, sinon 30 min (comme le minuteur de la carte)', () => {
  assert.equal(washDurationMinutes(cfg, { category: 'Particulier', service: 'Lavage Simple' }), 15);
  assert.equal(washDurationMinutes(cfg, { category: 'Particulier', service: 'Lavage Complet' }), 30);
  assert.equal(washDurationMinutes(cfg, { category: 'Berline', service: 'Lavage Simple' }), 30);
  assert.equal(washDurationMinutes({}, {}), 30);
});

test('un lavage commencé hier est « oublié », pas un de ce matin', () => {
  assert.equal(startedBeforeToday(yesterday1740, now), true);
  assert.equal(startedBeforeToday(new Date(2026, 10, 6, 0, 5).toISOString(), now), false);
  assert.equal(startedBeforeToday(null, now), false);
});

test('la capture iPad de Bustane : Berline à 14:55 restantes ne bipe pas', () => {
  const berline = { id: 'b', vehicle: 'Berline (Sans plaque)', category: 'Particulier', service: 'Lavage Simple', startedAt: minutesAgo(0.1) };
  assert.deepEqual(findOverdueWashes([berline], cfg, now), []);
});

test('seuls les lavages du jour au temps écoulé, son non coupé, font biper', () => {
  const washes = [
    { id: 'oublie', vehicle: 'Toyota', category: 'Particulier', service: 'Lavage Simple', startedAt: yesterday1740 },
    { id: 'depasse', vehicle: 'Hyundai', category: 'Particulier', service: 'Lavage Simple', startedAt: minutesAgo(25), assignedTo: 'Ibrahima' },
    { id: 'encours', vehicle: 'Berline', category: 'Particulier', service: 'Lavage Simple', startedAt: minutesAgo(5) },
    { id: 'sansdepart', vehicle: 'Kia', category: 'Particulier', service: 'Lavage Simple', startedAt: null },
  ];
  const overdue = findOverdueWashes(washes, cfg, now);
  assert.deepEqual(overdue.map((w) => [w.id, w.stale]), [['oublie', true], ['depasse', false]]);
  assert.equal(overdue[1].washer, 'Ibrahima');
  assert.deepEqual(ringingWashes(overdue, []).map((w) => w.id), ['depasse']);
  assert.deepEqual(ringingWashes(overdue, ['depasse']), []); // « Couper le son » / « Voir »
});

test('liste inchangée = même liste (pas de rafraîchissement inutile)', () => {
  const a = [{ id: '1', stale: false, vehicle: 'V', washer: 'L' }];
  assert.equal(sameOverdueList(a, [{ ...a[0] }]), true);
  assert.equal(sameOverdueList(a, [{ ...a[0], stale: true }]), false);
  assert.equal(sameOverdueList(a, []), false);
});

test('nouvelle version : identifiant différent et non vide', () => {
  assert.equal(isNewerBuild('abc', 'abc'), false);
  assert.equal(isNewerBuild('def', 'abc'), true);
  assert.equal(isNewerBuild(null, 'abc'), false);
  assert.equal(isNewerBuild('', 'abc'), false);
});

test('rechargement automatique : jamais pendant un lavage, sinon seulement sans gêner', () => {
  const idle = 5 * 60 * 1000;
  assert.equal(canReloadSilently({ washInProgress: true, hidden: true, idleForMs: idle }), false);
  assert.equal(canReloadSilently({ washInProgress: false, hidden: true, idleForMs: 0 }), true);
  assert.equal(canReloadSilently({ washInProgress: false, hidden: false, idleForMs: idle }), true);
  assert.equal(canReloadSilently({ washInProgress: false, hidden: false, idleForMs: 60 * 1000 }), false);
  assert.equal(canReloadSilently({ washInProgress: false, hidden: false, idleForMs: idle, typing: true }), false);
  assert.equal(canReloadSilently({ washInProgress: false, hidden: false, idleForMs: idle, dialogOpen: true }), false);
});
