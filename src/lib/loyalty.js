// Calcul de progression fidélité — partagé entre le teaser du tableau de
// bord (Client/Dashboard.jsx) et la page dédiée (Client/Loyalty.jsx), pour
// ne jamais avoir deux implémentations qui divergent.
export const LOYALTY_DEFAULT_THRESHOLD = 5;

// `transactions` = myTransactions (useClientAccount), `stations` = la liste
// de stations actives où chercher `loyaltyThreshold`/`loyaltyTiers`
// (useSuperAdminState). Une station avec `loyaltyTiers` configurés (module
// "Fidélité Avancée", voir lib/stationModules.js) a plusieurs paliers de
// récompense dans un même cycle ; sinon, comportement historique à seuil
// unique (cycle qui se réinitialise après chaque lavage gratuit).
export function buildLoyaltyEntries(transactions, stations) {
  const countByStation = {};
  (transactions || []).forEach((tx) => {
    countByStation[tx.stationId] = (countByStation[tx.stationId] || 0) + 1;
  });
  return Object.entries(countByStation).map(([stationId, count]) => {
    const station = (stations || []).find((s) => String(s.id) === String(stationId));
    if (!station) return null;

    const rawTiers = Array.isArray(station.loyaltyTiers) ? station.loyaltyTiers.filter((t) => t && t.threshold > 0) : [];
    if (rawTiers.length > 0) {
      const tiers = [...rawTiers].sort((a, b) => a.threshold - b.threshold);
      const cycleLength = tiers[tiers.length - 1].threshold;
      const inCycle = count > 0 && count % cycleLength === 0 ? cycleLength : count % cycleLength;
      const tierStates = tiers.map((t) => ({ ...t, reached: inCycle >= t.threshold }));
      const eligible = tierStates.some((t) => t.reached);
      return { station, count, tiers: tierStates, inCycle, cycleLength, eligible, isAdvanced: true };
    }

    const threshold = station.loyaltyThreshold || LOYALTY_DEFAULT_THRESHOLD;
    const inCycle = count % threshold === 0 ? threshold : count % threshold;
    const eligible = count > 0 && count % threshold === 0;
    return { station, count, threshold, inCycle, eligible, isAdvanced: false };
  }).filter(Boolean).sort((a, b) => b.count - a.count);
}
