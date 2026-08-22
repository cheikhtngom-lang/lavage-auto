// Calcul de progression fidélité — partagé entre le teaser du tableau de
// bord (Client/Dashboard.jsx) et la page dédiée (Client/Loyalty.jsx), pour
// ne jamais avoir deux implémentations qui divergent.
export const LOYALTY_DEFAULT_THRESHOLD = 5;

// `transactions` = myTransactions (useClientAccount), `stations` = la liste
// de stations actives où chercher `loyaltyThreshold` (useSuperAdminState).
export function buildLoyaltyEntries(transactions, stations) {
  const countByStation = {};
  (transactions || []).forEach((tx) => {
    countByStation[tx.stationId] = (countByStation[tx.stationId] || 0) + 1;
  });
  return Object.entries(countByStation).map(([stationId, count]) => {
    const station = (stations || []).find((s) => String(s.id) === String(stationId));
    if (!station) return null;
    const threshold = station.loyaltyThreshold || LOYALTY_DEFAULT_THRESHOLD;
    const inCycle = count % threshold === 0 ? threshold : count % threshold;
    const eligible = count > 0 && count % threshold === 0;
    return { station, count, threshold, inCycle, eligible };
  }).filter(Boolean).sort((a, b) => b.count - a.count);
}
