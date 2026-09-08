// Export / portabilité RGPD (règlement UE 2016/679, art. 20 ; loi
// sénégalaise n° 2008-12 sur la protection des données à caractère
// personnel) — même principe que le module équivalent du projet GestionImmo
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
  L.push(`(RGPD art. 15 & 20 ; loi sénégalaise n° 2008-12 sur la protection`);
  L.push(`des données à caractère personnel).`);
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

async function buildZip({ title, subject, extraRows = {}, ds, onProgress }) {
  const notify = onProgress || (() => {});
  const zip = new JSZip();

  Object.entries(extraRows).forEach(([name, row]) => {
    if (row) {
      zip.file(`donnees/${name}.json`, JSON.stringify(row, null, 2));
      zip.file(`csv/${name}.csv`, BOM + toCSV([row]));
    }
  });

  Object.keys(ds.tables).sort().forEach((name) => {
    const rows = ds.tables[name] || [];
    zip.file(`donnees/${name}.json`, JSON.stringify(rows, null, 2));
    zip.file(`csv/${name}.csv`, BOM + (toCSV(rows) || ''));
  });

  const manifest = {
    format: 'lavage-auto-export-rgpd', version: 1,
    base_legale: "RGPD (UE 2016/679) art. 20 ; loi SN n° 2008-12",
    genere_le: ds.generatedAt,
    comptages: ds.counts || {},
    erreurs: ds.errors || [],
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('LISEZ-MOI.txt', readme({ title, subject, tables: ds.counts || {}, errors: ds.errors || [] }));

  notify(90, 'Compression du ZIP…');
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (m) => notify(90 + Math.round(m.percent * 0.1), `Compression… ${Math.round(m.percent)}%`),
  );
  notify(100, 'Terminé.');
  return blob;
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
    title: 'EXPORT RGPD DE VOS DONNÉES — Lavage Auto',
    subject: `Ce dossier contient l'intégralité des données rattachées à la station « ${stationName || stationId} », dans un format ouvert et réutilisable.`,
    extraRows: { station: ds.station, station_billing: ds.billing },
    ds, onProgress,
  });
  triggerDownload(blob, `export-rgpd-${slugify(stationName || stationId)}-${tsCompact()}.zip`);
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
