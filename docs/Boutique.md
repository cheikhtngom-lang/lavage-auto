# Boutique de station

Les stations au forfait **Business** (ou avec le module `mod_boutique`)
publient un catalogue de produits — pneus, huile moteur, huile boîte,
pare-brise, batterie, filtres… Les automobilistes qui ont **déjà réservé**
chez une station (ou l'ont mise en favori) voient sa boutique depuis leur
tableau de bord et contactent la station par WhatsApp pour un produit.

**v1 : catalogue + consultation + contact.** Pas de panier / paiement en
ligne des produits — extension possible plus tard via PayDunya.

**Promotions** : chaque produit accepte un `sale_price` (prix remisé) et un
`sale_ends_at` optionnel. Le prix effectif est calculé côté app
(`productPricing` dans `src/lib/shop.js`) : prix promo s'il est renseigné,
valide (`0 ≤ sale_price < price`) et non expiré, sinon prix normal. Le
client voit le prix barré + un badge « -X% » + un filtre « En promo ».

**Stock** : `stock` (nullable = non suivi). La station décrémente d'un clic
(« −1 vendu ») / réassortit (« +1 ») via la RPC atomique
`shop_adjust_stock(p_id, p_delta)`. À 0 le produit passe « Rupture » et le
bouton de contact est masqué côté client. La page client est abonnée en
Realtime à `shop_products` : stock et promos se mettent à jour en direct.

## Fichiers

| Fichier | Rôle |
|---|---|
| `add_station_shop.sql` | table `shop_products`, fonctions `station_has_shop` / `client_knows_station`, RLS, index |
| `src/lib/shop.js` | catégories, limite image, CRUD station, requête client, lien WhatsApp |
| `src/pages/Admin/Shop.jsx` | gestion du catalogue (route `/admin/shop`, garde `RequireShopAccess`) |
| `src/pages/Client/Shop.jsx` | consultation groupée par station (route `/dashboard/boutique`) |
| `AdminLayout.jsx` / `ClientLayout.jsx` | entrées de menu « Boutique » |
| `lib/stationModules.js` | module `mod_boutique` (Super Admin > Modules) |
| `lib/permissions.js` | permission `shop.manage` (déléguée à un collaborateur via Équipe) |

## Accès (double contrôle : UI + RLS Postgres)

- **Station** : `station_billing.plan = 'Business'` **OU** `'mod_boutique'` dans
  `station_billing.active_modules`. Côté app : `RequireShopAccess` + gating du
  menu. Côté base : `station_has_shop(sid)` dans les policies INSERT/SELECT.
- **Client** : au moins une ligne dans `reservations` pour cette station, ou
  station en favori (`profiles.favorite_station_ids`). Côté base :
  `client_knows_station(sid)` dans la policy SELECT. Seuls les produits
  `active = true` d'une station qui a une boutique sont visibles.

## Mise en place

1. Exécuter `add_station_shop.sql` dans l'éditeur SQL Supabase.
2. (Optionnel) Pour ouvrir la boutique à une station non-Business : Super
   Admin → Modules → activer « Boutique » pour cette station.
3. Rien à déployer côté serveur (pas d'Edge Function). Le front suffit.

## Extensions possibles (phase 2)

- Commande + paiement en ligne des produits via PayDunya (même mécanique
  que `create-lavage-payment` : `create-shop-order` + callback, avec
  redistribution PER de la part station).
- Décrément automatique du stock à la commande.
- Galerie multi-photos (`image_urls text[]` + trigger de validation).
- Table `shop_enquiries` pour tracer les demandes clients côté station.
