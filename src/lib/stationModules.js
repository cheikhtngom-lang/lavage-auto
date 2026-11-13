// Catalogue des modules & add-ons — options indépendantes qu'un Super Admin
// peut activer/désactiver pour UNE station sans changer son plan de base
// (Starter/Pro/Station de service — clé Business), voir add_station_modules.sql (station_billing.
// active_modules) et Super Admin > Modules.
//
// `comingSoon: true` = la case à cocher se sauvegarde normalement (utile
// pour le suivi commercial/pré-inscriptions), mais la fonctionnalité
// elle-même n'existe pas encore côté station — le badge le signale pour ne
// pas laisser croire qu'activer le module a un effet immédiat (même
// convention que le module équivalent du projet GestionImmo).
import { FileBarChart, Star, Gift, MessageSquareText, Headset, Code2, Store, Wrench, Layers, Footprints, Sofa, Shirt } from 'lucide-react';

// Deux familles : `group: 'activite'` = un autre métier que le lavage auto,
// avec sa rubrique dans le menu station (Activités) ; le reste = options.
// Les activités ne sont incluses dans aucune offre : chacune est un
// abonnement à part, activé ici par le Super Admin quand la station le
// demande (Administration > Modules côté station, add_salon_pressing.sql).
export const MODULE_GROUPS = [
  { id: 'activite', title: 'Activités en plus', sub: 'Un autre métier dans la même appli : chaque activité a sa rubrique, ses tickets, son lien de suivi et sa part en comptabilité.' },
  { id: 'option', title: 'Options', sub: 'Des fonctions en plus pour le lavage auto, sans changer d’offre.' },
];

export const STATION_MODULES = [
  {
    id: 'mod_tapis',
    group: 'activite',
    name: 'Tapis et moquettes',
    desc: 'Tapis de salon, moquettes et tapis de prière déposés : ticket, étapes de lavage, lien de suivi WhatsApp et stations partenaires.',
    price: '5 000 FCFA/mois',
    icon: Layers,
  },
  {
    id: 'mod_chaussures',
    group: 'activite',
    name: 'Chaussures',
    desc: 'Baskets, cuir, daim : dépôt à la paire, ticket, lien de suivi et encaissement à part.',
    price: '3 000 FCFA/mois',
    icon: Footprints,
  },
  {
    id: 'mod_salon',
    group: 'activite',
    name: 'Salon',
    desc: 'Canapés, fauteuils, matelas : à la station ou à domicile (adresse, frais de déplacement), ticket et lien de suivi.',
    price: '5 000 FCFA/mois',
    icon: Sofa,
  },
  {
    id: 'mod_pressing',
    group: 'activite',
    name: 'Pressing',
    desc: 'Vêtements et linge : traitement par article, tarifs, express, avance, étiquettes, emplacement, collecte et livraison.',
    price: '10 000 FCFA/mois',
    icon: Shirt,
  },
  {
    id: 'mod_vidange',
    name: 'Vidange',
    desc: 'Rendez-vous de vidange payables en ligne par les clients (normalement réservé à l’offre Station de service) — utilisable même en Starter ou Pro.',
    price: '8 000 FCFA/mois',
    icon: Wrench,
  },
  {
    id: 'mod_bilan',
    name: "Bilan d'activité",
    desc: 'Rapport comparatif de période + export PDF (normalement réservé à l’offre Station de service) — utilisable même en Starter ou Pro.',
    price: '8 000 FCFA/mois',
    icon: FileBarChart,
  },
  {
    id: 'mod_boutique',
    name: 'Boutique',
    desc: 'Catalogue de produits (pneus, huiles, pare-brise…) visible par les clients de la station (normalement réservé à l’offre Station de service) — utilisable même en Starter ou Pro.',
    price: '10 000 FCFA/mois',
    icon: Store,
  },
  {
    id: 'mod_vedette',
    name: 'Station en Vedette',
    desc: "Badge « Partenaire Vedette » sur la fiche de la station dans l'annuaire public.",
    price: '5 000 FCFA/mois',
    icon: Star,
  },
  {
    id: 'mod_fidelite_plus',
    name: 'Fidélité Avancée',
    desc: 'Plusieurs paliers de récompenses au lieu du seuil unique actuel (ex: 5/10/20 lavages) — configurable dans Paramètres > Profil Station.',
    price: '8 000 FCFA/mois',
    icon: Gift,
  },
  {
    id: 'mod_rappels',
    name: 'Rappels automatiques',
    desc: "Rappel automatique dans le tableau de bord du client s'il n'est pas revenu depuis 3 semaines (pas d'envoi SMS/WhatsApp : la plateforme ne peut pas accéder au téléphone d'un client pour le compte d'une station).",
    price: '10 000 FCFA/mois',
    icon: MessageSquareText,
  },
  {
    id: 'mod_support',
    name: 'Support Prioritaire',
    desc: 'Ligne WhatsApp directe avec la plateforme, réponse sous 1h.',
    price: '15 000 FCFA/mois',
    icon: Headset,
    comingSoon: true,
  },
  {
    id: 'mod_api',
    name: 'Accès API externe',
    desc: 'Connecte le logiciel de caisse ou de comptabilité propre à la station.',
    price: '25 000 FCFA/mois',
    icon: Code2,
    comingSoon: true,
  },
];

// Activité à dépôt (lib/carpets.js) → module qui l'ouvre. Ici plutôt que dans
// carpets.js pour que le menu et les routes ne chargent pas toute la logique.
export const ACTIVITY_MODULES = { tapis: 'mod_tapis', chaussures: 'mod_chaussures', salon: 'mod_salon', pressing: 'mod_pressing' };
export const ACTIVITY_KEYS = Object.keys(ACTIVITY_MODULES);
export const stationHasActivity = (billing, activity) => (billing?.activeModules || []).includes(ACTIVITY_MODULES[activity]);

export const modulesOfGroup = (group) => STATION_MODULES.filter((m) => (m.group || 'option') === group);

export function hasModule(activeModules, moduleId) {
  return Array.isArray(activeModules) && activeModules.includes(moduleId);
}
