// Boutique de station — catalogue de produits (pneus, huiles, pare-brise…)
// publié par les stations « Station de service » et consulté par leurs clients depuis le
// tableau de bord automobiliste. Voir add_station_shop.sql,
// src/pages/Admin/Shop.jsx et src/pages/Client/Shop.jsx.
import { supabase } from './supabaseClient';
import { isServiceStationPlan } from './offers';

// Catégories proposées dans le formulaire produit (dropdown + « Autre »).
export const SHOP_CATEGORIES = [
  'Pneus',
  'Huile moteur',
  'Huile boîte',
  'Pare-brise / Vitrage',
  'Batterie',
  'Filtres',
  'Freinage',
  'Accessoires',
  'Autre',
];

// La station a-t-elle droit à une boutique ? (offre Station de service, ou module
// mod_boutique) — le vrai contrôle est côté Postgres (station_has_shop +
// policies RLS) ; ceci sert à l'affichage.
export function stationHasShop(billing) {
  if (!billing) return false;
  return isServiceStationPlan(billing.plan) || (billing.activeModules || []).includes('mod_boutique');
}

// ─── Côté station (admin) ───────────────────────────────────────────--
export async function loadStationProducts(stationId) {
  const { data, error } = await supabase
    .from('shop_products')
    .select('*')
    .eq('station_id', stationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const toIntOrNull = (v) => (v === '' || v == null ? null : parseInt(v, 10));

// Le stock n'est envoyé qu'à la création (stock initial) : ensuite il ne
// change que par une vente, une entrée ou une correction (fonctions
// ci-dessous), pour qu'un formulaire resté ouvert n'écrase jamais une vente
// faite entre-temps — et que chaque mouvement soit journalisé avec son motif.
export async function saveProduct(stationId, product) {
  const price = parseInt(product.price, 10) || 0;
  const type = product.promoType || null; // '', 'percent', 'bogo'
  const threshold = parseInt(product.lowStockThreshold, 10);
  const row = {
    name: product.name.trim(),
    description: product.description?.trim() || null,
    category: product.category || 'Autre',
    price,
    low_stock_threshold: threshold >= 0 ? threshold : DEFAULT_LOW_STOCK_THRESHOLD,
    // Promo : on ne garde que les champs du type choisi, le reste à null.
    promo_type: type === 'percent' || type === 'bogo' ? type : null,
    promo_percent: type === 'percent' ? toIntOrNull(product.promoPercent) : null,
    promo_buy_qty: type === 'bogo' ? toIntOrNull(product.promoBuyQty) : null,
    promo_free_qty: type === 'bogo' ? toIntOrNull(product.promoFreeQty) : null,
    promo_starts_at: type ? toIso(product.promoStartsAt) : null,
    promo_ends_at: type ? toIso(product.promoEndsAt) : null,
    image_url: product.imageUrl || null,
    active: product.active !== false,
  };
  if (product.id) {
    const { error } = await supabase.from('shop_products').update(row).eq('id', product.id);
    if (error) throw new Error(friendlyShopError(error));
  } else {
    const { error } = await supabase.from('shop_products').insert({ station_id: stationId, ...row, stock: toIntOrNull(product.stock) });
    if (error) throw new Error(friendlyShopError(error));
  }
}

export async function setProductActive(id, active) {
  const { error } = await supabase.from('shop_products').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('shop_products').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Historique (add_shop_history.sql) ──────────────────────────────────
// Événements de vie des produits, écrits par un trigger Postgres (donc aussi
// pour les ruptures causées par un achat en ligne) : lecture seule ici.
export const HISTORY_EVENTS = {
  mis_en_ligne: { label: 'Mis en ligne', tone: 'emerald' },
  retire: { label: 'Retiré de la vente', tone: 'amber' },
  fin_de_stock: { label: 'Fin de stock', tone: 'red' },
  reapprovisionne: { label: 'Réapprovisionné', tone: 'blue' },
  supprime: { label: 'Supprimé', tone: 'neutral' },
};

export async function loadShopHistory(stationId, limit = 1000) {
  const { data, error } = await supabase
    .from('shop_product_events')
    .select('id, product_id, product_name, category, event_type, stock_after, price, backfilled, created_at')
    .eq('station_id', stationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

// ─── Stock et ventes sur place (add_shop_stock_sales.sql) ──────────────
// Tout passe par des fonctions Postgres qui verrouillent le produit : le
// stock ne descend jamais sous 0 et une vente supérieure au stock est
// refusée côté serveur, même si deux postes vendent en même temps. Chaque
// vente crée aussi sa recette dans `transactions` (service « Boutique »),
// donc dans la Comptabilité, les Transactions, l'Analytique et le Bilan.
export const DEFAULT_LOW_STOCK_THRESHOLD = 3;
export const SHOP_SALE_SERVICE = 'Boutique';
// Mêmes libellés que transactions.method (voir Accounting.jsx : Espèces à
// part, les autres comptés en « mobile money / en ligne »).
export const SALE_PAYMENT_METHODS = ['Espèces', 'Wave', 'Orange Money', 'Carte'];

// Niveau de stock d'un produit : null = non suivi (« sur commande »),
// 'out' = épuisé, 'low' = stock bas (≤ seuil), 'ok' sinon.
export function stockLevel(p) {
  if (p.stock == null) return null;
  if (p.stock <= 0) return 'out';
  return p.stock <= (p.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD) ? 'low' : 'ok';
}

export const STOCK_MOVEMENTS = {
  stock_initial: { label: 'Stock initial', tone: 'blue' },
  entree: { label: 'Entrée de stock', tone: 'emerald' },
  vente_sur_place: { label: 'Vente sur place', tone: 'amber' },
  vente_en_ligne: { label: 'Vente en ligne', tone: 'amber' },
  correction: { label: 'Correction', tone: 'neutral' },
  annulation_vente: { label: 'Vente annulée (retour)', tone: 'blue' },
  suivi_arrete: { label: 'Suivi arrêté', tone: 'neutral' },
};

// Fonction/table absente = migration pas encore exécutée : message clair
// plutôt que l'erreur technique de PostgREST.
function friendlyShopError(error) {
  const msg = error?.message || '';
  if (error?.code === 'PGRST202' || error?.code === 'PGRST205' || error?.code === '42P01' || /low_stock_threshold|schema cache/.test(msg)) {
    return "La gestion de stock n'est pas encore activée sur la base : le fichier add_shop_stock_sales.sql doit être exécuté dans Supabase.";
  }
  return msg || 'Opération impossible.';
}

// items : [{ productId, quantity, unitPrice }]. Renvoie { sale_id, transaction_id, amount, items }.
export async function recordShopSale({ items, paymentMethod, clientName, note }) {
  const { data, error } = await supabase.rpc('shop_record_sale', {
    p_items: items.map((it) => ({ product_id: it.productId, quantity: it.quantity, unit_price: it.unitPrice })),
    p_payment_method: paymentMethod,
    p_client_name: clientName?.trim() || null,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(friendlyShopError(error));
  return data;
}

export async function cancelShopSale(id, reason) {
  const { error } = await supabase.rpc('shop_cancel_sale', { p_sale_id: id, p_reason: reason?.trim() || null });
  if (error) throw new Error(friendlyShopError(error));
}

// Réapprovisionnement : ajoute `quantity` (démarre le suivi si le produit était « sur commande »).
export async function addStockEntry(productId, quantity, note) {
  const { data, error } = await supabase.rpc('shop_stock_entry', { p_product_id: productId, p_quantity: quantity, p_note: note?.trim() || null });
  if (error) throw new Error(friendlyShopError(error));
  return data;
}

// Correction / inventaire : fixe le stock à la quantité comptée (null = ne plus suivre).
export async function setProductStock(productId, stock, note) {
  const { data, error } = await supabase.rpc('shop_stock_set', { p_product_id: productId, p_stock: stock, p_note: note?.trim() || null });
  if (error) throw new Error(friendlyShopError(error));
  return data;
}

// Le nom du client vient de la recette liée (transactions) : il n'est stocké
// que là, et y est anonymisé à la fermeture d'un compte.
export async function loadShopSales(stationId, limit = 1000) {
  const { data, error } = await supabase
    .from('shop_sales')
    .select('id, items, amount, payment_method, note, status, cancel_reason, cancelled_at, created_at, transactions(client_name)')
    .eq('station_id', stationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(friendlyShopError(error));
  return data || [];
}

export async function loadStockMovements(stationId, { productId = null, limit = 1000 } = {}) {
  let query = supabase
    .from('shop_stock_movements')
    .select('id, product_id, product_name, movement_type, quantity, stock_before, stock_after, note, sale_id, backfilled, created_at')
    .eq('station_id', stationId);
  if (productId) query = query.eq('product_id', productId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(friendlyShopError(error));
  return data || [];
}

// ─── Côté client (automobiliste) ────────────────────────────────────--
// Une seule requête : le RLS ne renvoie que les produits actifs des
// stations que le client connaît (réservation passée / favori) ET qui ont
// une boutique. On regroupe ensuite par station côté app.
export async function loadClientShop() {
  const { data, error } = await supabase
    .from('shop_products')
    .select('*, stations(id, name, owner_phone, address, city, logo_url)')
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const byStation = new Map();
  for (const p of data || []) {
    const st = p.stations;
    if (!st) continue;
    if (!byStation.has(st.id)) byStation.set(st.id, { station: st, products: [] });
    byStation.get(st.id).products.push(p);
  }
  return Array.from(byStation.values());
}

// Statut de la campagne promo d'un produit à l'instant présent :
//   null       = pas de promo configurée
//   'scheduled' = configurée mais pas encore commencée
//   'active'    = en cours
//   'ended'     = date de fin dépassée
export function promoStatus(p) {
  if (!p.promo_type) return null;
  const now = Date.now();
  if (p.promo_starts_at && new Date(p.promo_starts_at).getTime() > now) return 'scheduled';
  if (p.promo_ends_at && new Date(p.promo_ends_at).getTime() <= now) return 'ended';
  return 'active';
}

// Prix / offre effectifs d'un produit compte tenu de sa promo.
//   kind 'percent' : prix barré + prix remisé + label "-X%"
//   kind 'bogo'    : prix inchangé + label "X achetés = Y offert(s)"
export function productPricing(p) {
  const price = p.price || 0;
  const active = promoStatus(p) === 'active';

  if (active && p.promo_type === 'percent' && p.promo_percent > 0 && p.promo_percent < 100) {
    const percent = p.promo_percent;
    const effective = Math.round(price * (1 - percent / 100));
    return { onSale: true, kind: 'percent', effective, original: price, percent, label: `-${percent}%`, endsAt: p.promo_ends_at || null };
  }

  if (active && p.promo_type === 'bogo' && p.promo_buy_qty >= 1 && p.promo_free_qty >= 1) {
    const b = p.promo_buy_qty, f = p.promo_free_qty;
    return {
      onSale: true, kind: 'bogo', effective: price, original: price, percent: 0,
      label: `${b} acheté${b > 1 ? 's' : ''} = ${f} offert${f > 1 ? 's' : ''}`,
      buyQty: b, freeQty: f, endsAt: p.promo_ends_at || null,
    };
  }

  return { onSale: false, kind: null, effective: price, original: price, percent: 0, label: null, endsAt: null };
}

// Lien WhatsApp pré-rempli pour contacter la station à propos d'un produit.
export function productWhatsAppLink(station, product) {
  const phone = (station?.owner_phone || '').replace(/\D/g, '');
  const pr = productPricing(product);
  const cur = product.currency || 'FCFA';
  const detail = pr.kind === 'bogo'
    ? `${(pr.original).toLocaleString('fr-FR')} ${cur} — offre ${pr.label}`
    : `${pr.effective.toLocaleString('fr-FR')} ${cur}${pr.onSale ? ` (${pr.label})` : ''}`;
  const msg = `Bonjour, je suis intéressé(e) par « ${product.name} » (${detail}) vu dans votre boutique sur Clean Car Galsen.`;
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : null;
}
