// Boutique de station — catalogue de produits (pneus, huiles, pare-brise…)
// publié par les stations Business et consulté par leurs clients depuis le
// tableau de bord automobiliste. Voir add_station_shop.sql,
// src/pages/Admin/Shop.jsx et src/pages/Client/Shop.jsx.
import { supabase } from './supabaseClient';

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

// Même limite que le logo station / l'image de pub (voir lib/ads.js).
export const MAX_SHOP_IMAGE_SIZE = 1.5 * 1024 * 1024; // 1,5 Mo

// La station a-t-elle droit à une boutique ? (plan Pro ou Business, ou module
// mod_boutique) — le vrai contrôle est côté Postgres (station_has_shop +
// policies RLS) ; ceci sert à l'affichage.
export function stationHasShop(billing) {
  if (!billing) return false;
  return billing.plan === 'Pro' || billing.plan === 'Business' || (billing.activeModules || []).includes('mod_boutique');
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

export async function saveProduct(stationId, product) {
  const price = parseInt(product.price, 10) || 0;
  const type = product.promoType || null; // '', 'percent', 'bogo'
  const row = {
    name: product.name.trim(),
    description: product.description?.trim() || null,
    category: product.category || 'Autre',
    price,
    stock: toIntOrNull(product.stock),
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
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('shop_products').insert({ station_id: stationId, ...row });
    if (error) throw new Error(error.message);
  }
}

export async function setProductActive(id, active) {
  const { error } = await supabase.from('shop_products').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Décrémente (« −1 vendu ») ou incrémente le stock d'un produit de façon
// atomique côté Postgres (voir shop_adjust_stock dans add_station_shop.sql).
// Renvoie le nouveau stock, ou null si le produit n'a pas de stock suivi.
export async function adjustStock(id, delta) {
  const { data, error } = await supabase.rpc('shop_adjust_stock', { p_id: id, p_delta: delta });
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('shop_products').delete().eq('id', id);
  if (error) throw new Error(error.message);
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
