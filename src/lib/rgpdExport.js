// Export des données — droit d'accès prévu par la loi sénégalaise
// n° 2008-12 sur la protection des données à caractère personnel (CDP) — même principe que le module équivalent du projet GestionImmo
// de l'utilisateur (rgpd-export.js) : lecture directe des tables Supabase
// avec la session en cours (RLS applique le périmètre — une station n'obtient
// que SES lignes ; un compte super_admin obtient tout via les policies
// `app_role() = 'super_admin'` déjà en place, voir supabase/schema.sql).
// Aucune donnée n'est modifiée : ce module ne fait que lire et zipper.
//
// Cas d'usage couverts :
//   - Station : toutes ses données      -> exportStationData()
//   - Station : un seul client          -> exportStationClientData()
//   - Automobiliste : ses propres données -> exportClientOwnData()
//   - Super Admin : une station         -> exportStationData() (même fonction,
//     RLS laisse passer un compte super_admin quelle que soit la station)
import JSZip from 'jszip';
import { supabase } from './supabaseClient';
import { fetchMyGroup, fetchMyOwnerProfile, fetchGroupStations } from './groups';

const BOM = '﻿'; // pour Excel FR

// Tables opérationnelles d'une station (voir supabase/schema.sql). `disputes`
// est volontairement exclue de l'auto-export d'une station : la policy RLS
// `disputes_all` ne l'autorise pas à lire ses propres litiges (réservé au
// Super Admin), elle est ajoutée séparément quand l'export est déclenché par
// le Super Admin (voir exportStationData `includeDisputes`).
const STATION_TABLES = [
  'employees', 'expenses', 'shift_templates', 'shift_schedule', 'custom_vehicle_types',
  'attendance_records', 'wash_pricing', 'reservations', 'transactions', 'station_reviews',
  'station_ads', 'station_renewal_payments', 'station_members', 'station_roles',
];

// Comment chaque table se relie à UN client, pour l'export "un client de ma
// station" — toujours recoupé avec station_id pour rester au périmètre de
// CETTE station (les réservations du même client dans une autre station ne
// sont pas incluses, comme pour listStationClients ci-dessous).
const CLIENT_AT_STATION_TABLES = ['reservations', 'transactions', 'station_reviews'];

// Données propres au compte automobiliste lui-même (export self-service,
// toutes stations confondues — c'est SON historique complet sur la plateforme).
const CLIENT_OWN_TABLES = ['vehicles', 'super_user_subscriptions', 'reservations', 'transactions', 'station_reviews'];

function slugify(str) {
  return String(str || 'export')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'export';
}
function tsCompact(d) {
  d = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function toCSV(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = [];
  rows.forEach((r) => { if (r && typeof r === 'object') Object.keys(r).forEach((k) => { if (!headers.includes(k)) headers.push(k); }); });
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v).replace(/"/g, '""');
    return /[";\r\n]/.test(v) ? `"${v}"` : v;
  };
  let out = headers.join(';') + '\r\n';
  rows.forEach((r) => { out += headers.map((h) => cell(r ? r[h] : '')).join(';') + '\r\n'; });
  return out;
}

async function readTable(table, filters) {
  let q = supabase.from(table).select('*');
  Object.entries(filters).forEach(([col, val]) => { q = q.eq(col, val); });
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: data || [], error: null };
}

// ─── Collecte ────────────────────────────────────────────────────────────
async function collectStation(stationId, { includeDisputes = false, onProgress } = {}) {
  const notify = onProgress || (() => {});
  const ds = { stationId, generatedAt: new Date().toISOString(), station: null, billing: null, tables: {}, counts: {}, errors: [] };

  const { data: stationRow } = await supabase.from('stations').select('*, station_billing(*)').eq('id', stationId).maybeSingle();
  if (stationRow) {
    ds.billing = stationRow.station_billing || null;
    const { station_billing, ...rest } = stationRow;
    ds.station = rest;
  }

  const tables = includeDisputes ? [...STATION_TABLES, 'disputes'] : STATION_TABLES;
  for (let i = 0; i < tables.length; i++) {
    const name = tables[i];
    notify(Math.round((i / tables.length) * 80) + 5, `Lecture de « ${name} »…`);
    const { rows, error } = await readTable(name, { station_id: stationId });
    ds.tables[name] = rows;
    ds.counts[name] = rows.length;
    if (error) ds.errors.push({ scope: name, message: error });
  }
  return ds;
}

async function collectStationClient(stationId, clientId, clientName, { onProgress } = {}) {
  const notify = onProgress || (() => {});
  const ds = {
    stationId, generatedAt: new Date().toISOString(),
    client: { id: clientId, name: clientName || null },
    tables: {}, counts: {}, errors: [],
  };
  for (let i = 0; i < CLIENT_AT_STATION_TABLES.length; i++) {
    const name = CLIENT_AT_STATION_TABLES[i];
    notify(Math.round((i / CLIENT_AT_STATION_TABLES.length) * 80) + 5, `Lecture de « ${name} »…`);
    const { rows, error } = await readTable(name, { station_id: stationId, client_id: clientId });
    ds.tables[name] = rows;
    ds.counts[name] = rows.length;
    if (error) ds.errors.push({ scope: name, message: error });
  }
  return ds;
}

async function collectClientSelf(clientId, { onProgress } = {}) {
  const notify = onProgress || (() => {});
  const ds = { clientId, generatedAt: new Date().toISOString(), profile: null, tables: {}, counts: {}, errors: [] };

  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', clientId).maybeSingle();
  ds.profile = profileRow || null;

  for (let i = 0; i < CLIENT_OWN_TABLES.length; i++) {
    const name = CLIENT_OWN_TABLES[i];
    notify(Math.round((i / CLIENT_OWN_TABLES.length) * 80) + 5, `Lecture de « ${name} »…`);
    const col = name === 'vehicles' ? 'owner_id' : 'client_id';
    const { rows, error } = await readTable(name, { [col]: clientId });
    ds.tables[name] = rows;
    ds.counts[name] = rows.length;
    if (error) ds.errors.push({ scope: name, message: error });
  }
  return ds;
}

// ─── Clients d'une station (pour le sélecteur) ────────────────────────────
export async function listStationClients(stationId) {
  const { data, error } = await supabase.from('reservations').select('client_id, client_name').eq('station_id', stationId).not('client_id', 'is', null);
  if (error) throw new Error(error.message);
  const seen = new Map();
  (data || []).forEach((r) => { if (r.client_id && !seen.has(r.client_id)) seen.set(r.client_id, r.client_name || 'Client'); });
  return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// ─── Écriture ZIP ──────────────────────────────────────────────────────
function readme({ title, subject, tables, errors }) {
  const L = [];
  L.push(title);
  L.push('='.repeat(title.length));
  L.push('');
  L.push(subject);
  L.push('');
  L.push(`Fourni au titre du droit d'accès / de portabilité des données`);
  L.push(`(loi sénégalaise n° 2008-12 sur la protection des données à caractère`);
  L.push(`personnel, sous le contrôle de la CDP).`);
  L.push('');
  L.push('STRUCTURE');
  L.push('  manifest.json .......... résumé technique (comptages, erreurs)');
  L.push('  donnees/<table>.json ... données brutes, une table par fichier');
  L.push('  csv/<table>.csv ........ même contenu en CSV (séparateur ; , Excel)');
  L.push('');
  L.push('CONTENU (lignes par table)');
  Object.keys(tables).sort().forEach((k) => L.push(`  ${k} : ${tables[k]}`));
  if (errors && errors.length) {
    L.push('');
    L.push(`AVERTISSEMENTS : ${errors.length} table(s) lues partiellement — voir manifest.json.`);
  }
  L.push('');
  L.push('Aucune donnée n\'a été modifiée lors de cet export.');
  return L.join('\r\n');
}

// Écrit un dataset (tables + éventuelles lignes hors-tables comme le profil
// station/client) sous un préfixe de dossier — vide ('') pour un export
// simple, "stations/<slug>/" pour un dossier dans un export groupé.
function writeDatasetIntoZip(zip, { extraRows = {}, ds, prefix = '' }) {
  Object.entries(extraRows).forEach(([name, row]) => {
    if (row) {
      zip.file(`${prefix}donnees/${name}.json`, JSON.stringify(row, null, 2));
      zip.file(`${prefix}csv/${name}.csv`, BOM + toCSV([row]));
    }
  });

  Object.keys(ds.tables).sort().forEach((name) => {
    const rows = ds.tables[name] || [];
    zip.file(`${prefix}donnees/${name}.json`, JSON.stringify(rows, null, 2));
    zip.file(`${prefix}csv/${name}.csv`, BOM + (toCSV(rows) || ''));
  });

  const manifest = {
    format: 'lavage-auto-export-donnees', version: 1,
    base_legale: "Loi sénégalaise n° 2008-12 sur la protection des données à caractère personnel (CDP)",
    genere_le: ds.generatedAt,
    comptages: ds.counts || {},
    erreurs: ds.errors || [],
  };
  zip.file(`${prefix}manifest.json`, JSON.stringify(manifest, null, 2));
  return manifest;
}

async function finalizeZip(zip, onProgress, base = 90) {
  const notify = onProgress || (() => {});
  notify(base, 'Compression du ZIP…');
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (m) => notify(base + Math.round(m.percent * ((100 - base) / 100)), `Compression… ${Math.round(m.percent)}%`),
  );
  notify(100, 'Terminé.');
  return blob;
}

async function buildZip({ title, subject, extraRows = {}, ds, onProgress }) {
  const zip = new JSZip();
  const manifest = writeDatasetIntoZip(zip, { extraRows, ds });
  zip.file('LISEZ-MOI.txt', readme({ title, subject, tables: manifest.comptages, errors: manifest.erreurs }));
  return finalizeZip(zip, onProgress, 90);
}

function readmeAll(index) {
  const L = [];
  L.push('EXPORT DES DONNÉES — TOUTES LES STATIONS — Lavage Auto');
  L.push('=======================================================');
  L.push('');
  L.push(`Généré le : ${index.genere_le}`);
  L.push(`Stations  : ${index.stations.length}`);
  L.push('');
  L.push("Un dossier par station sous stations/<nom-station>/, chacun avec sa");
  L.push('propre structure (donnees/, csv/, manifest.json). index.json liste');
  L.push('toutes les stations et leurs comptages.');
  L.push('');
  index.stations.forEach((s) => {
    L.push(`  - ${s.nom || s.id}  →  ${s.dossier}${s.erreurs ? `  (${s.erreurs} avert.)` : ''}`);
  });
  return L.join('\r\n');
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.zip';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── Orchestrations (appelées depuis l'UI) ───────────────────────────────
export async function exportStationData(stationId, stationName, { includeDisputes = false, onProgress } = {}) {
  const ds = await collectStation(stationId, { includeDisputes, onProgress });
  const blob = await buildZip({
    title: 'EXPORT DE VOS DONNÉES — Lavage Auto',
    subject: `Ce dossier contient l'intégralité des données rattachées à la station « ${stationName || stationId} », dans un format ouvert et réutilisable.`,
    extraRows: { station: ds.station, station_billing: ds.billing },
    ds, onProgress,
  });
  triggerDownload(blob, `export-donnees-${slugify(stationName || stationId)}-${tsCompact()}.zip`);
}

export async function exportStationClientData(stationId, stationName, clientId, clientName, { onProgress } = {}) {
  const ds = await collectStationClient(stationId, clientId, clientName, { onProgress });
  const blob = await buildZip({
    title: 'EXPORT DES DONNÉES D\'UN CLIENT — Lavage Auto',
    subject: `Ce dossier contient les données du client « ${clientName || clientId} » détenues par la station « ${stationName || stationId} » : réservations, transactions et avis.`,
    ds, onProgress,
  });
  triggerDownload(blob, `export-client-${slugify(clientName || clientId)}-${tsCompact()}.zip`);
}

// Toutes les stations en un seul ZIP (un dossier par station) — pour le
// Super Admin, voir Super Admin > Paramètres > Export des données.
export async function exportAllStationsData(stations, { onProgress } = {}) {
  const notify = onProgress || (() => {});
  const zip = new JSZip();
  const index = { format: 'lavage-auto-export-donnees-multi', genere_le: new Date().toISOString(), stations: [] };

  const list = stations || [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const base = Math.round((i / Math.max(1, list.length)) * 85);
    notify(base, `Station ${i + 1}/${list.length} : ${s.name || s.id}`);
    const ds = await collectStation(s.id, { includeDisputes: true });
    const slug = slugify(s.name || s.id);
    const manifest = writeDatasetIntoZip(zip, {
      extraRows: { station: ds.station, station_billing: ds.billing },
      ds, prefix: `stations/${slug}/`,
    });
    index.stations.push({ id: s.id, nom: s.name || null, dossier: `stations/${slug}`, comptages: manifest.comptages, erreurs: (manifest.erreurs || []).length });
  }

  zip.file('index.json', JSON.stringify(index, null, 2));
  zip.file('LISEZ-MOI.txt', readmeAll(index));
  const blob = await finalizeZip(zip, onProgress, 90);
  triggerDownload(blob, `export-donnees-TOUTES-STATIONS-${tsCompact()}.zip`);
}

// Chef d'entreprise (offre Sur mesure) : son profil, son entreprise (commandes,
// demandes de rattachement, analyses IA) et un dossier par station du groupe.
// Il ne lit pas les tables des stations en direct (RLS = station ouverte) :
// chaque station passe par la fonction SQL group_export_station, qui vérifie
// qu'elle appartient bien à son groupe (voir add_account_closure.sql).
export async function exportGroupData({ org, profile, stations }, { onProgress } = {}) {
  const notify = onProgress || (() => {});
  const zip = new JSZip();
  const generatedAt = new Date().toISOString();

  notify(3, 'Lecture de votre entreprise…');
  const groupDs = { generatedAt, tables: {}, counts: {}, errors: [] };
  for (const name of ['organization_orders', 'group_join_requests', 'group_ai_reports']) {
    const { rows, error } = await readTable(name, { organization_id: org.id });
    groupDs.tables[name] = rows;
    groupDs.counts[name] = rows.length;
    if (error) groupDs.errors.push({ scope: name, message: error });
  }
  const groupManifest = writeDatasetIntoZip(zip, { extraRows: { profil: profile, entreprise: org }, ds: groupDs, prefix: 'entreprise/' });

  const index = { format: 'lavage-auto-export-donnees-groupe', genere_le: generatedAt, entreprise: org.name, comptages_entreprise: groupManifest.comptages, stations: [] };
  const list = stations || [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    notify(8 + Math.round((i / Math.max(1, list.length)) * 80), `Station ${i + 1}/${list.length} : ${s.name}`);
    const ds = { generatedAt, tables: {}, counts: {}, errors: [] };
    let station = null;
    let billing = null;
    const { data, error } = await supabase.rpc('group_export_station', { p_station_id: s.id });
    if (error) {
      ds.errors.push({ scope: 'station', message: error.message });
    } else {
      station = data?.station || null;
      billing = data?.station_billing || null;
      Object.entries(data?.tables || {}).forEach(([name, rows]) => {
        ds.tables[name] = rows || [];
        ds.counts[name] = (rows || []).length;
      });
    }
    const slug = `${slugify(s.name || s.id)}-${String(s.id).slice(0, 6)}`;
    const manifest = writeDatasetIntoZip(zip, { extraRows: { station, station_billing: billing }, ds, prefix: `stations/${slug}/` });
    index.stations.push({ id: s.id, nom: s.name || null, dossier: `stations/${slug}`, comptages: manifest.comptages, erreurs: (manifest.erreurs || []).length });
  }

  zip.file('index.json', JSON.stringify(index, null, 2));
  const L = [
    `EXPORT DES DONNÉES DE L'ENTREPRISE « ${org.name} » — Lavage Auto`,
    '',
    `Généré le : ${generatedAt}`,
    "Fourni au titre du droit d'accès aux données (loi sénégalaise n° 2008-12,",
    'sous le contrôle de la CDP).',
    '',
    'entreprise/ ............ votre profil, l\'entreprise, commandes, demandes de',
    '                         rattachement et analyses IA',
    'stations/<nom>/ ........ un dossier par station (donnees/*.json, csv/*.csv,',
    '                         manifest.json) : file, transactions, dépenses, équipe,',
    '                         pointage, abonnements clients, vidange, boutique…',
    '',
    ...index.stations.map((s) => `  - ${s.nom || s.id}  →  ${s.dossier}${s.erreurs ? `  (${s.erreurs} avert.)` : ''}`),
    '',
    "Aucune donnée n'a été modifiée lors de cet export.",
  ];
  zip.file('LISEZ-MOI.txt', L.join('\r\n'));
  const blob = await finalizeZip(zip, onProgress, 90);
  triggerDownload(blob, `export-entreprise-${slugify(org.name)}-${tsCompact()}.zip`);
}

// Même export, en allant chercher soi-même l'entreprise, le profil et les stations.
export async function exportMyGroupData({ onProgress } = {}) {
  const [org, profile] = await Promise.all([fetchMyGroup(), fetchMyOwnerProfile()]);
  if (!org) throw new Error('Aucune entreprise rattachée à ce compte.');
  const stations = await fetchGroupStations(org.id);
  return exportGroupData({ org, profile, stations }, { onProgress });
}

export async function exportClientOwnData(clientId, clientName, { onProgress } = {}) {
  const ds = await collectClientSelf(clientId, { onProgress });
  const blob = await buildZip({
    title: 'EXPORT DE VOS DONNÉES — Lavage Auto',
    subject: `Ce dossier contient l'intégralité de vos données personnelles sur la plateforme : profil, véhicules, abonnement Super User, réservations, transactions et avis, toutes stations confondues.`,
    extraRows: { profil: ds.profile },
    ds, onProgress,
  });
  triggerDownload(blob, `export-mes-donnees-${slugify(clientName || 'automobiliste')}-${tsCompact()}.zip`);
}
