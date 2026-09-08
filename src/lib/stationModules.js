// Catalogue des modules & add-ons — options indépendantes qu'un Super Admin
// peut activer/désactiver pour UNE station sans changer son plan de base
// (Starter/Pro/Business), voir add_station_modules.sql (station_billing.
// active_modules) et Super Admin > Modules.
//
// `comingSoon: true` = la case à cocher se sauvegarde normalement (utile
// pour le suivi commercial/pré-inscriptions), mais la fonctionnalité
// elle-même n'existe pas encore côté station — le badge le signale pour ne
// pas laisser croire qu'activer le module a un effet immédiat (même
// convention que le module équivalent du projet GestionImmo).
import { FileBarChart, Star, Gift, MessageSquareText, Headset, Code2 } from 'lucide-react';

export const STATION_MODULES = [
  {
    id: 'mod_bilan',
    name: "Bilan d'activité",
    desc: 'Rapport comparatif de période + export PDF (normalement réservé au plan Business) — utilisable même en Starter ou Pro.',
    price: '8 000 FCFA/mois',
    icon: FileBarChart,
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
    desc: 'Plusieurs paliers de récompenses au lieu du seuil unique actuel (ex: 5/10/20 lavages).',
    price: '8 000 FCFA/mois',
    icon: Gift,
    comingSoon: true,
  },
  {
    id: 'mod_rappels',
    name: 'Rappels automatiques',
    desc: 'Relance SMS/WhatsApp automatique des clients inactifs depuis un moment.',
    price: '10 000 FCFA/mois',
    icon: MessageSquareText,
    comingSoon: true,
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

export function hasModule(activeModules, moduleId) {
  return Array.isArray(activeModules) && activeModules.includes(moduleId);
}
