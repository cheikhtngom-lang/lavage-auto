// Dernier état connu de la station, gardé dans le navigateur : la ligne
// `stations` avec son `station_billing` (nom, logo, horaires, offre, modules,
// rubriques masquées) et les permissions du collaborateur connecté.
//
// Pourquoi : le menu station filtre ses rubriques selon l'offre (Comptabilité,
// Boutique, Bilan, Vidange, Pompistes, Annonces). Sans cette copie, à chaque
// connexion le menu s'affichait amputé, puis ces rubriques apparaissaient
// 1 à 2 s plus tard, le temps que la base réponde (≈ 0,5 s par requête depuis
// Dakar, plus le chargement de la session). Désormais le menu part de la copie
// et la base, relue aussitôt, la corrige si besoin (useAppState.jsx).
//
// Rien de secret ici : le contrôle d'accès reste fait par la base (RLS).
import { supabase } from './supabaseClient';

const stationKey = (id) => `ccg_station_cache_${id}`;
export const hiddenMenuKey = (id) => `ccg_hidden_menu_${id}`;
const permsKey = (id) => `ccg_perms_${id}`;

const read = (key) => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage plein ou bloqué : sans effet */ }
};

// Ligne `stations` (+ station_billing) telle que la base l'a renvoyée.
export function readStationCache(stationId) {
  if (!stationId || stationId === 'default') return null;
  const row = read(stationKey(stationId));
  return row && row.id === stationId ? row : null;
}
export function writeStationCache(stationId, row) {
  if (!stationId || stationId === 'default' || !row) return;
  write(stationKey(stationId), row);
  if (Array.isArray(row.hidden_menu)) write(hiddenMenuKey(stationId), row.hidden_menu);
}

// Permissions d'un collaborateur (rôle « staff ») : { permissions, roleName }.
export function readPermsCache(stationId) {
  const v = read(permsKey(stationId));
  return v && Array.isArray(v.permissions) ? v : null;
}
export function writePermsCache(stationId, permissions, roleName) {
  if (!stationId) return;
  write(permsKey(stationId), { permissions: permissions || [], roleName: roleName || '' });
}
// À la déconnexion : un autre compte du même appareil ne doit pas hériter des droits.
export function clearPermsCache() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('ccg_perms_')).forEach((k) => localStorage.removeItem(k));
  } catch { /* idem */ }
}

// Appelé par login.html juste après la connexion d'une station : la copie est
// prête avant même l'ouverture du tableau de bord, donc le menu est complet
// dès la première connexion sur un appareil. Plafonné à `maxMs` pour ne
// jamais retarder la connexion.
export async function prefetchStationForLogin(profile, maxMs = 1500) {
  const stationId = profile?.station_id;
  if (!stationId || profile.is_group_owner || !['admin', 'staff'].includes(profile.role)) return;
  const work = (async () => {
    const tasks = [
      supabase.from('stations').select('*, station_billing(*)').eq('id', stationId).single()
        .then(({ data }) => { if (data) writeStationCache(stationId, data); }),
    ];
    if (profile.role === 'staff') {
      tasks.push(supabase.from('station_members').select('status, station_roles(name, permissions)').eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => {
          if (data?.status === 'active') writePermsCache(stationId, data.station_roles?.permissions, data.station_roles?.name);
        }));
    }
    await Promise.allSettled(tasks);
  })();
  await Promise.race([work, new Promise((r) => setTimeout(r, maxMs))]);
}
