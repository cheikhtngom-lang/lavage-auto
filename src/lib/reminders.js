// Rappels automatiques (module "mod_rappels", voir lib/stationModules.js) —
// une station ne peut PAS lire le téléphone d'un client qu'elle n'a pas
// elle-même enregistré (RLS profiles_select, voir supabase/schema.sql) :
// aucun envoi sortant (SMS/WhatsApp) n'est donc possible depuis l'espace
// station. À la place, la relance est un rappel qui apparaît automatiquement
// dans le TABLEAU DE BORD DU CLIENT lui-même quand une station qu'il a déjà
// fréquentée l'a activé et qu'il n'y est pas retourné depuis un moment — 100%
// dans le périmètre de ses propres données, sans nouvelle exposition.
import { hasModule } from './stationModules';

export const REMINDER_INACTIVE_DAYS = 21;

// `transactions` = myTransactions (useClientAccount), `stations` = la liste
// de stations actives (useSuperAdminState).
export function buildInactiveStationReminders(transactions, stations, inactiveDays = REMINDER_INACTIVE_DAYS) {
  const lastVisitByStation = {};
  (transactions || []).forEach((tx) => {
    const d = new Date(tx.createdAt);
    if (Number.isNaN(d.getTime())) return;
    if (!lastVisitByStation[tx.stationId] || d > lastVisitByStation[tx.stationId]) lastVisitByStation[tx.stationId] = d;
  });

  const now = new Date();
  return Object.entries(lastVisitByStation).map(([stationId, lastVisit]) => {
    const station = (stations || []).find((s) => String(s.id) === String(stationId));
    if (!station || !hasModule(station.activeModules, 'mod_rappels')) return null;
    const daysSince = Math.floor((now - lastVisit) / (24 * 3600 * 1000));
    if (daysSince < inactiveDays) return null;
    return { station, daysSince, lastVisit: lastVisit.toISOString() };
  }).filter(Boolean).sort((a, b) => b.daysSince - a.daysSince);
}
