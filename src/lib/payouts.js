// Reversements des paiements en ligne aux stations (table paiements_lavage,
// voir add_paydunya_per.sql + add_manual_disbursement.sql) — vocabulaire
// commun aux rubriques « Reversements » côté station (Admin/Payouts.jsx) et
// côté Super Admin (SuperAdmin/Payouts.jsx).
//
// 'echec' est un ancien statut conservé pour compatibilité, plus jamais écrit
// par le code applicatif, mais traité comme 'manuel' à l'affichage.
export const PAYOUT_STATUS = {
  en_attente: { label: 'Redistribution en cours', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  manuel: { label: 'À reverser par la plateforme', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  echec: { label: 'À reverser par la plateforme', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  reussi: { label: 'Reversé', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

export const payoutStatus = (p) => PAYOUT_STATUS[p.statutRedistribution] || PAYOUT_STATUS.manuel;

// Part station pas encore arrivée sur son compte : la plateforme doit la reverser à la main.
export const isPendingPayout = (p) => p.statutRedistribution === 'manuel' || p.statutRedistribution === 'echec';
export const isSettledPayout = (p) => p.statutRedistribution === 'reussi';
export const isInProgressPayout = (p) => p.statutRedistribution === 'en_attente';

export const serviceTypeLabel = (t) => (t === 'vidange' ? 'Vidange' : t === 'boutique' ? 'Boutique' : 'Lavage');

// Filtres de l'historique (même clé côté station et Super Admin).
export const PAYOUT_FILTERS = [
  { key: 'all', label: 'Tous', match: () => true },
  { key: 'pending', label: 'À reverser', match: isPendingPayout },
  { key: 'settled', label: 'Reversés', match: isSettledPayout },
  { key: 'progress', label: 'En cours', match: isInProgressPayout },
];

export const sumPart = (list) => list.reduce((sum, p) => sum + (p.partStation || 0), 0);

// Une ligne par station : montant à reverser (et ids à marquer réglés),
// déjà reversé, nombre de paiements, dernier paiement. Les stations qui ont
// encore quelque chose à recevoir d'abord, du plus gros montant au plus petit.
export function groupPayoutsByStation(payments) {
  const groups = Object.values(payments.reduce((acc, p) => {
    const key = p.stationId || p.stationName;
    if (!acc[key]) acc[key] = { stationId: p.stationId, stationName: p.stationName, pendingTotal: 0, pendingIds: [], settledTotal: 0, count: 0, lastAt: null };
    const g = acc[key];
    g.count += 1;
    if (isPendingPayout(p)) { g.pendingTotal += p.partStation || 0; g.pendingIds.push(p.id); }
    if (isSettledPayout(p)) g.settledTotal += p.partStation || 0;
    if (!g.lastAt || new Date(p.createdAt) > new Date(g.lastAt)) g.lastAt = p.createdAt;
    return acc;
  }, {}));
  return groups.sort((a, b) => b.pendingTotal - a.pendingTotal || new Date(b.lastAt) - new Date(a.lastAt));
}

export const formatPayoutDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
