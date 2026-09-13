// Catalogue des permissions station + helpers.
//
// v1 = contrôle "interface seulement" : ces clés pilotent l'affichage des
// entrées de menu et l'accès aux routes /admin/* (voir AdminLayout.jsx et
// App.jsx). Le RLS Supabase reste au niveau station — un membre connecté peut
// techniquement lire/écrire les données de SA station via l'API. À durcir plus
// tard (RLS par permission) si besoin.
//
// Le tableau `permissions` d'un rôle contient soit ['*'] (tous les droits),
// soit une liste de ces clés. Le propriétaire de la station (profiles.role =
// 'admin') a implicitement ['*'].

export const PERMISSIONS = [
  { key: 'dashboard',           label: "File d'attente / Vue d'ensemble", group: 'Exploitation' },
  { key: 'washers.manage',      label: 'Laveurs, planning & pointage',    group: 'Exploitation' },
  { key: 'vidange.manage',      label: 'Vidange (rendez-vous & tarifs)',  group: 'Exploitation' },
  { key: 'washer.self',         label: 'Accès laveur (ses lavages + son pointage)', group: 'Exploitation' },
  { key: 'transactions.view',   label: 'Transactions',                    group: 'Finances' },
  { key: 'accounting.manage',   label: 'Comptabilité & dépenses',         group: 'Finances' },
  { key: 'subscriptions.manage',label: 'Abonnements clients',             group: 'Finances' },
  { key: 'analytics.view',      label: 'Analytique',                      group: 'Finances' },
  { key: 'shop.manage',         label: 'Boutique (catalogue produits)',   group: 'Administration' },
  { key: 'team.manage',         label: "Équipe & rôles",                  group: 'Administration' },
  { key: 'settings.manage',     label: 'Paramètres de la station',        group: 'Administration' },
  { key: 'announcements.manage', label: 'Annonces aux clients',           group: 'Administration' },
];

export const PERMISSION_GROUPS = ['Exploitation', 'Finances', 'Administration'];

// Clés d'un rôle "catalogue" (is_builtin) — sert à afficher un libellé et à
// empêcher l'édition côté UI. La source de vérité reste la table station_roles.
export const BUILTIN_ROLE_KEYS = [
  'super_admin_station', 'gerant', 'caissier', 'superviseur', 'reception', 'laveur',
];

export function hasPerm(permissions, key) {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes('*') || permissions.includes(key);
}

// Permission requise pour chaque route /admin/* (null = accessible à tout
// membre de la station). Utilisé pour masquer le menu et garder les routes.
export const ROUTE_PERMISSION = {
  '/admin/queue': null,
  '/admin/washers': 'washers.manage',
  '/admin/vidange': 'vidange.manage',
  '/admin/transactions': 'transactions.view',
  '/admin/accounting': 'accounting.manage',
  '/admin/subscriptions': 'subscriptions.manage',
  '/admin/analytics': 'analytics.view',
  '/admin/shop': 'shop.manage',
  '/admin/team': 'team.manage',
  '/admin/settings': 'settings.manage',
};

export function permLabel(key) {
  return PERMISSIONS.find((p) => p.key === key)?.label || key;
}
