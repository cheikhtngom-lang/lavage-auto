// Configuration des promotions d'une station — namespacée par station comme
// pricingConfig/durationConfig (voir washDefaults.js), persistée dans
// localStorage sous la clé `promoConfig_<stationId>`.
export const DEFAULT_PROMO = {
  // Message court affiché sur la fiche de la station côté client (recherche + détail).
  banner: { message: '', expiresAt: '' },
  // Réduction ciblée sur UNE catégorie de véhicule + UN type de lavage.
  discount: { active: false, category: 'Particulier', service: 'Lavage Simple', percent: 0, expiresAt: '' },
  // Code que le client saisit à la réservation pour obtenir un avantage.
  code: { code: '', type: 'percent', value: 0, active: false }, // type: 'percent' | 'free'
};

const todayStr = () => new Date().toISOString().split('T')[0];

export function isBannerActive(promo) {
  const banner = promo?.banner;
  if (!banner?.message) return false;
  if (banner.expiresAt && banner.expiresAt < todayStr()) return false;
  return true;
}

// Applique la réduction ciblée de la station à un prix de base, si elle est
// active, non expirée, et correspond exactement à la catégorie + service donnés.
export function applyDiscount(promo, category, service, basePrice) {
  const d = promo?.discount;
  if (!d?.active || d.category !== category || d.service !== service) return basePrice;
  if (d.expiresAt && d.expiresAt < todayStr()) return basePrice;
  const pct = Math.min(100, Math.max(0, Number(d.percent) || 0));
  return Math.round(basePrice * (1 - pct / 100));
}

// Vérifie un code saisi par le client contre le code promo configuré par la station.
export function matchPromoCode(promo, codeInput) {
  const c = promo?.code;
  if (!c?.active || !c.code || !codeInput?.trim()) return null;
  return c.code.trim().toLowerCase() === codeInput.trim().toLowerCase() ? c : null;
}

// Applique un code promo déjà validé (matchPromoCode) à un prix.
export function applyPromoCode(promoCode, price) {
  if (!promoCode) return price;
  if (promoCode.type === 'free') return 0;
  const pct = Math.min(100, Math.max(0, Number(promoCode.value) || 0));
  return Math.round(price * (1 - pct / 100));
}
