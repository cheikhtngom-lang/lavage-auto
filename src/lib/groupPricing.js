// Tarif dégressif de l'offre « Sur mesure » — côté AFFICHAGE uniquement.
//
// Le montant réellement facturé est calculé par le serveur (add_group_volume_discount.sql :
// _group_price_lines et create_group_renewal) à partir de la table group_discount_tiers.
// Ces fonctions reprennent la même règle pour afficher le coût mensuel d'un
// groupe (Facturation, Mes stations, Super Admin, MRR) sans appel serveur ; les
// paliers sont lus depuis la même table (fetchDiscountTiers) : jamais codés en dur.
//
// Règle : la remise dépend du NOMBRE DE STATIONS ACTIVES du groupe (hors
// archivées) et s'applique à chacune d'elles, arrondie à l'unité par station.

// tiers : [{ min_stations, pct }] — le palier applicable est le plus haut atteint.
export function discountPctFor(count, tiers) {
  const n = Math.max(0, Number(count) || 0);
  let pct = 0;
  let best = -1;
  for (const t of tiers || []) {
    if (t.min_stations <= n && t.min_stations > best) { best = t.min_stations; pct = Number(t.pct) || 0; }
  }
  return pct;
}

// Prix mensuel d'une station après remise (arrondi comme le serveur : round half up).
export function discountedPrice(price, pct) {
  return Math.round((Number(price) || 0) * (100 - (Number(pct) || 0)) / 100);
}

// Coût mensuel d'un groupe : prices = prix catalogue de ses stations actives.
// Renvoie { count, pct, subtotal, total, discount, next } où next est le
// prochain palier à atteindre ({ min_stations, pct, missing }) ou null.
export function groupMonthly(prices, tiers) {
  const list = (prices || []).map((p) => Number(p) || 0);
  const count = list.length;
  const pct = discountPctFor(count, tiers);
  const subtotal = list.reduce((sum, p) => sum + p, 0);
  const total = list.reduce((sum, p) => sum + discountedPrice(p, pct), 0);
  const nextTier = [...(tiers || [])]
    .filter((t) => t.min_stations > count && Number(t.pct) > pct)
    .sort((a, b) => a.min_stations - b.min_stations)[0];
  return {
    count, pct, subtotal, total, discount: subtotal - total,
    next: nextTier ? { min_stations: nextTier.min_stations, pct: Number(nextTier.pct), missing: nextTier.min_stations - count } : null,
  };
}

// Super Admin : marque chaque station active d'un groupe de sa remise (groupDiscountPct)
// pour que le MRR (lib/platformRevenue.js) reflète ce que les groupes paient réellement.
export function applyGroupDiscount(stations, tiers) {
  const active = (s) => s.organizationId && s.status === 'active' && !s.groupArchivedAt;
  const counts = {};
  for (const s of stations || []) if (active(s)) counts[s.organizationId] = (counts[s.organizationId] || 0) + 1;
  return (stations || []).map((s) => (active(s) ? { ...s, groupDiscountPct: discountPctFor(counts[s.organizationId], tiers) } : s));
}
