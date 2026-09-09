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

// La station a-t-elle droit à une boutique ? (plan Business ou module
// mod_boutique) — même logique que le Bilan. Le vrai contrôle est côté
// Postgres (station_has_shop + policies RLS) ; ceci sert à l'affichage.
export function stationHasShop(billing) {
  if (!billing) return false;
  return billing.plan === 'Business' || (billing.activeModules || []).includes('mod_boutique');
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

export async function saveProduct(stationId, product) {
  const row = {
    name: product.name.trim(),
    description: product.description?.trim() || null,
    category: product.category || 'Autre',
    price: parseInt(product.price, 10) || 0,
    stock: product.stock === '' || product.stock == null ? null : parseInt(product.stock, 10),
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

// Lien WhatsApp pré-rempli pour contacter la station à propos d'un produit.
export function productWhatsAppLink(station, product) {
  const phone = (station?.owner_phone || '').replace(/\D/g, '');
  const msg = `Bonjour, je suis intéressé(e) par « ${product.name} » (${(product.price || 0).toLocaleString('fr-FR')} ${product.currency || 'FCFA'}) vu dans votre boutique sur Clean Car Galsen.`;
  return phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    : null;
}
