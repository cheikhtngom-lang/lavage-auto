// Chiffres de la boutique pour la Comptabilité et l'Analytique.
//
// Deux sources de ventes :
//  • ventes sur place (shop_sales validées, add_shop_stock_sales.sql) — leur
//    recette est DÉJÀ dans `transactions` (service « Boutique ») ;
//  • commandes payées en ligne (shop_orders, add_shop_orders.sql) — leur
//    recette n'est PAS dans `transactions` (elle passe par le grand livre des
//    reversements, paiements_lavage) : on l'ajoute ici, au format transaction,
//    pour que les revenus soient vraiment globaux.
// Une vente annulée sur place a vu sa transaction supprimée ; une commande
// en ligne annulée n'est pas comptée.
export const SHOP_SERVICE = 'Boutique';
export const isShopRevenue = (entry) => entry.service === SHOP_SERVICE;

const countedOnlineOrders = (orders) => (orders || []).filter((o) => o.paid !== false && o.status !== 'annulee');

// Recettes des commandes en ligne, au format des transactions de useAppState.
export function onlineOrderRevenue(orders) {
  return countedOnlineOrders(orders).map((o) => ({
    id: `commande-${o.id}`, createdAt: o.createdAt, amount: o.amount, method: 'PayDunya', service: SHOP_SERVICE, online: true,
  }));
}

// Une ligne par produit vendu (vente sur place ou commande en ligne).
export function soldLines(sales, orders) {
  const lines = [];
  for (const s of sales || []) {
    if (s.status !== 'validee') continue;
    for (const it of s.items || []) {
      lines.push({ createdAt: s.created_at, key: it.product_id || it.name, name: it.name, quantity: Number(it.quantity) || 0, amount: Number(it.amount) || 0, online: false });
    }
  }
  for (const o of countedOnlineOrders(orders)) {
    lines.push({ createdAt: o.createdAt, key: o.productId || o.productName, name: o.productName, quantity: Number(o.quantity) || 0, amount: Number(o.amount) || 0, online: true });
  }
  return lines;
}

// Produits les plus vendus : classés par quantité, puis par chiffre d'affaires.
export function topProducts(lines, limit = 5) {
  const byProduct = new Map();
  for (const l of lines) {
    const cur = byProduct.get(l.key) || { key: l.key, name: l.name, quantity: 0, amount: 0 };
    cur.quantity += l.quantity;
    cur.amount += l.amount;
    byProduct.set(l.key, cur);
  }
  return [...byProduct.values()].sort((a, b) => b.quantity - a.quantity || b.amount - a.amount).slice(0, limit);
}

// Tapis et moquettes (add_carpet_cleaning.sql) : service « Tapis » dans
// `transactions`, même valeur que CARPET_SERVICE (lib/carpets.js).
export const isCarpetRevenueEntry = (entry) => entry.service === 'Tapis';
// Chaussures (add_shoe_cleaning.sql) : service « Chaussures », même valeur que SHOE_SERVICE.
export const isShoeRevenueEntry = (entry) => entry.service === 'Chaussures';
// Activités à dépôt (lib/carpets.js) : clé → service inscrit dans `transactions`.
export const DEPOSIT_SERVICE_BY_KEY = { tapis: 'Tapis', chaussures: 'Chaussures', salon: 'Salon', pressing: 'Pressing' };
const DEPOSIT_KEY_BY_SERVICE = Object.fromEntries(Object.entries(DEPOSIT_SERVICE_BY_KEY).map(([k, v]) => [v, k]));
export const depositKeyOf = (entry) => DEPOSIT_KEY_BY_SERVICE[entry.service] || null;

// Lavage / boutique / tapis / chaussures / salon / pressing sur une liste de
// recettes déjà filtrée sur la période. Chaque activité : out[clé] et out[clé + 'Count'].
export function splitRevenue(entries) {
  const out = { total: 0, lavage: 0, lavageCount: 0, boutique: 0, boutiqueCount: 0, boutiqueOnline: 0 };
  for (const key of Object.keys(DEPOSIT_SERVICE_BY_KEY)) { out[key] = 0; out[`${key}Count`] = 0; }
  for (const e of entries) {
    const amount = parseInt(e.amount, 10) || 0;
    out.total += amount;
    const deposit = depositKeyOf(e);
    if (deposit) {
      out[deposit] += amount;
      out[`${deposit}Count`] += 1;
    } else if (isShopRevenue(e)) {
      out.boutique += amount;
      out.boutiqueCount += 1;
      if (e.online) out.boutiqueOnline += amount;
    } else {
      out.lavage += amount;
      out.lavageCount += 1;
    }
  }
  return out;
}
