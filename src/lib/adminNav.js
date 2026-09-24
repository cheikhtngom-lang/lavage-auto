// Catalogue du menu latéral station (AdminLayout) — une seule source de
// vérité, partagée avec Paramètres > Menu (cocher / décocher les rubriques).
//
// Trois filtres indépendants s'appliquent, dans cet ordre :
//  1. la permission du compte connecté (lib/permissions.js) ;
//  2. le forfait de la station, ou le module qui le débloque (Super Admin >
//     Modules, lib/stationModules.js) ;
//  3. les rubriques que la station a elle-même masquées (stations.hidden_menu,
//     voir add_station_menu_prefs.sql) — pur désencombrement, pas un contrôle
//     d'accès : la route reste joignable.
import {
  LayoutDashboard, Users, Settings, Droplets, Activity, Calculator, LineChart, Sparkles,
  FileBarChart, Store, Wrench, Send, Fuel,
} from 'lucide-react';
import { hasPerm } from './permissions';
import { SERVICE_STATION_PLAN, isServiceStationPlan, MARKETING_PLANS } from './offers';

// `locked` : jamais masquable (sans « Vue d'ensemble » il n'y aurait plus de
// page d'accueil, sans « Paramètres » on ne pourrait plus rien réactiver).
export const ADMIN_NAV = [
  { key: 'queue', name: "Vue d'ensemble", href: '/admin/queue', icon: LayoutDashboard, tourId: 'admin-nav-overview', perm: null, locked: true },
  { key: 'washers', name: 'Laveurs', href: '/admin/washers', icon: Droplets, tourId: 'admin-nav-washers', perm: 'washers.manage' },
  // Pompistes : offre Station de service (clé 'Business', voir lib/offers.js) — voir
  // RequirePompistesAccess (App.jsx).
  { key: 'pompistes', name: 'Pompistes', href: '/admin/pompistes', icon: Fuel, perm: 'pompistes.manage', plans: [SERVICE_STATION_PLAN], hint: 'Pointage des pompistes, pompe affectée, litres vendus et montant encaissé.' },
  // Vidange : offre Station de service, ou module "mod_vidange" — voir RequireVidangeAccess (App.jsx).
  { key: 'vidange', name: 'Vidange', href: '/admin/vidange', icon: Wrench, perm: 'vidange.manage', plans: [SERVICE_STATION_PLAN], module: 'mod_vidange' },
  { key: 'transactions', name: 'Transactions', href: '/admin/transactions', icon: Activity, tourId: 'admin-nav-transactions', perm: 'transactions.view' },
  // Comptabilité : Pro et Station de service — voir RequireAccountingAccess (App.jsx).
  { key: 'accounting', name: 'Comptabilité', href: '/admin/accounting', icon: Calculator, perm: 'accounting.manage', plans: ['Pro', SERVICE_STATION_PLAN] },
  { key: 'subscriptions', name: 'Abonnements', href: '/admin/subscriptions', icon: Sparkles, perm: 'subscriptions.manage' },
  { key: 'analytics', name: 'Analytique', href: '/admin/analytics', icon: LineChart, tourId: 'admin-nav-analytics', perm: 'analytics.view' },
  // Bilan : offre Station de service, ou module "mod_bilan" — voir RequireBusinessPlan (App.jsx).
  { key: 'bilan', name: 'Bilan', href: '/admin/bilan', icon: FileBarChart, perm: 'accounting.manage', plans: [SERVICE_STATION_PLAN], module: 'mod_bilan' },
  // Boutique : offre Station de service, ou module "mod_boutique" — voir RequireShopAccess (App.jsx).
  { key: 'shop', name: 'Boutique', href: '/admin/shop', icon: Store, perm: 'shop.manage', plans: [SERVICE_STATION_PLAN], module: 'mod_boutique' },
  { key: 'team', name: 'Équipe', href: '/admin/team', icon: Users, tourId: 'admin-nav-team', perm: 'team.manage' },
  // Annonces aux clients : à partir de Pro (lib/offers.js) — voir RequireMarketingAccess (App.jsx).
  { key: 'annonces', name: 'Annonces', href: '/admin/annonces', icon: Send, perm: 'announcements.manage', plans: MARKETING_PLANS },
  { key: 'settings', name: 'Paramètres', href: '/admin/settings', icon: Settings, tourId: 'admin-nav-settings', perm: 'settings.manage', locked: true },
];

// Rubriques masquées tant que la station n'a rien choisi : Pompistes n'a de
// sens que pour une station qui vend aussi du carburant — donc visible d'office
// pour l'offre Station de service, masqué sinon (module seul, ancien forfait…).
export const DEFAULT_HIDDEN_MENU = ['pompistes'];
export const defaultHiddenMenu = (billing) => (isServiceStationPlan(billing?.plan) ? [] : DEFAULT_HIDDEN_MENU);

// Rubriques auxquelles le compte connecté a droit (permission + forfait),
// masquées ou non. Tant que les permissions ne sont pas chargées (staff), seules
// les entrées libres apparaissent — le propriétaire a ['*'] dès le premier rendu.
export function navAvailableTo({ permissions, billing }) {
  return ADMIN_NAV.filter((item) => {
    if (item.perm && !hasPerm(permissions || [], item.perm)) return false;
    if (item.plans && !item.plans.includes(billing?.plan) && !(item.module && (billing?.activeModules || []).includes(item.module))) return false;
    return true;
  });
}

// Ce qui s'affiche réellement dans le menu.
export function visibleNav({ permissions, billing, hiddenMenu }) {
  const hidden = hiddenMenu || defaultHiddenMenu(billing);
  return navAvailableTo({ permissions, billing }).filter((item) => item.locked || !hidden.includes(item.key));
}
