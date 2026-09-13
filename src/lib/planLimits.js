// Nombre de comptes ("supports") pouvant se connecter à une station selon
// son forfait — le propriétaire compris. Ex: Starter = 3 -> le propriétaire
// + jusqu'à 2 collaborateurs (station_members). Business n'a pas de vraie
// limite technique (9999), affiché "+10" côté marketing (voir index.html).
//
// Dupliqué côté serveur dans supabase/functions/invite-station-member/index.ts
// (un Edge Function TypeScript ne peut pas importer ce fichier JS front) —
// toute modification ici doit être répercutée là-bas.
export const TEAM_SEAT_LIMITS = {
  Starter: 3,
  Pro: 5,
  Business: 9999,
};

export function maxTeamSeats(plan) {
  return TEAM_SEAT_LIMITS[plan] ?? TEAM_SEAT_LIMITS.Starter;
}

// Sièges déjà occupés : le propriétaire (toujours 1) + les collaborateurs
// invités ou actifs (un compte suspendu libère son siège).
export function usedTeamSeats(members) {
  return 1 + (members || []).filter((m) => m.status === 'invited' || m.status === 'active').length;
}
