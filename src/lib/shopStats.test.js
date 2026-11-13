// Tests de la répartition des recettes en Comptabilité. Lancer : npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitRevenue, depositKeyOf } from './shopStats.js';

test('chaque activité à dépôt a sa part, le reste va au lavage', () => {
  const split = splitRevenue([
    { service: 'Lavage Complet', amount: 3000 },
    { service: 'Tapis', amount: 5000 },
    { service: 'Chaussures', amount: 2000 },
    { service: 'Salon', amount: 15000 },
    { service: 'Pressing', amount: 1200 },
    { service: 'Pressing', amount: 800 },
  ]);
  assert.equal(split.total, 27000);
  assert.equal(split.lavage, 3000);
  assert.equal(split.tapis, 5000);
  assert.equal(split.chaussures, 2000);
  assert.equal(split.salon, 15000);
  assert.equal(split.pressing, 2000);
  assert.equal(split.pressingCount, 2);
  assert.equal(split.salonCount, 1);
});

test('une avance de pressing compte comme recette Pressing', () => {
  assert.equal(depositKeyOf({ service: 'Pressing' }), 'pressing');
  assert.equal(depositKeyOf({ service: 'Lavage Simple' }), null);
});
