# Boutique de station

Les stations au forfait **Business** (ou avec le module `mod_boutique`)
publient un catalogue de produits — pneus, huile moteur, huile boîte,
pare-brise, batterie, filtres… Les automobilistes qui ont **déjà réservé**
chez une station (ou l'ont mise en favori) voient sa boutique depuis leur
tableau de bord et contactent la station par WhatsApp pour un produit.

**v1 : catalogue + consultation + contact.** Pas de panier / paiement en
ligne des produits — extension possible plus tard via PayDunya.

**Promotions** (campagne datée par produit — colonnes `promo_*`) :
- `promo_type = 'percent'` : remise en % (`promo_percent`, 1–99). Client :
  prix barré + prix remisé + badge « -X% ».
- `promo_type = 'bogo'` : offre « X achetés = Y offert(s) » (`promo_buy_qty` /
  `promo_free_qty`). Client : prix inchangé + badge « X achetés = Y offert(s) ».
- `promo_starts_at` / `promo_ends_at` (jour + heure, optionnels) : la promo
  s'active/se désactive toute seule. `promoStatus()` = null / 'scheduled' /
  'active' / 'ended' (badges côté station). `productPricing()` calcule le
  prix/offre effectifs. Filtre « En promo » côté client.

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

## Historique des produits (onglet « Historique »)

Journal, par station, de la vie de chaque produit : **mis en ligne**, **retiré de
la vente**, **fin de stock**, **réapprovisionné**, **supprimé** — plus l'état des
lieux (en ligne / en rupture / masqués) et la liste des produits actuellement
en rupture avec la date d'épuisement.

- Table `shop_product_events` (`add_shop_history.sql`), alimentée par un
  **trigger Postgres** sur `shop_products` — pas par le navigateur : un achat en
  ligne réduit le stock depuis l'Edge Function (`service_role`), la rupture qui
  en résulte doit apparaître aussi. Le nom du produit est copié dans l'événement
  (le produit peut être supprimé, l'historique reste lisible).
- Lecture seule pour la station (RLS `current_station_id()`) et le Super Admin ;
  aucune policy d'écriture, l'historique n'est pas modifiable.
- Au premier lancement, le point de départ des produits existants est
  reconstitué (`backfilled = true`, dates approximatives : création / dernière
  modification). Les événements suivants sont exacts.

## Photo studio (caméra + détourage)

Dans le formulaire produit : **Prendre une photo** (caméra intégrée, cadre de
visée carré) ou **Choisir une image**, puis passage automatique par le studio :
le produit est détouré et posé sur un fond propre (Blanc studio, Gris doux, Noir
premium, Bleu Clean Car) avec ombre de contact et léger reflet ; lumière,
couleurs et netteté sont retouchées. Le studio est aussi proposé sur une photo
déjà enregistrée (« Passer en style studio »). On peut toujours garder la photo
d'origine (compressée). Format final : JPEG carré 1000×1000.

- **Aperçu avant publication** : l'écran studio montre le résultat (avec « maintenir :
  voir l'original ») avant de l'utiliser, puis le formulaire produit affiche une
  carte « Aperçu — tel que vos clients le verront » (photo, nom, prix, promo,
  stock), mise à jour en direct, identique à la carte de la boutique client.
- **Tout se passe dans le navigateur** : aucun service payant, aucune clé d'API,
  la photo ne quitte pas l'appareil. Réseau IS-Net (DIS, Apache-2.0), export
  ONNX quantifié « poids seulement » de 42 Mo (`xrds/isnet-general-onnx-int8`,
  MIT, révision figée dans `src/lib/studioWorker.js`) exécuté par
  `onnxruntime-web` (MIT) dans un Web Worker.
- Le modèle est téléchargé **une seule fois** (Cache Storage du navigateur) depuis
  Hugging Face. Pour ne plus dépendre d'un tiers : l'héberger chez soi et
  changer `MODEL_URL`. Le moteur WASM (14 Mo) est servi par l'app elle-même et
  chargé uniquement à l'ouverture du studio.
- **Vitesse** : 1 seul thread (le multi-thread exige l'isolation cross-origin
  COOP/COEP, incompatible avec Google Analytics/cartes) — de l'ordre de 5 à
  15 s sur un ordinateur, davantage sur un téléphone d'entrée de gamme. Pistes :
  WebGPU (Chrome récent, non livré car non testable ici) ou une API de détourage
  serveur (PhotoRoom / remove.bg : payantes, à brancher via une Edge Function).
- `vercel.json` : `Permissions-Policy: camera=(self)` (la caméra était bloquée).
- Fichiers : `lib/studioPhoto.js` (détourage, retouche, mise en scène),
  `lib/studioWorker.js`, `components/ui/CameraCapture.jsx`,
  `components/ui/StudioPhotoModal.jsx`, `components/ui/ShopHistory.jsx`.

## Mise en place

1. Exécuter `add_station_shop.sql` dans l'éditeur SQL Supabase, puis
   `add_shop_history.sql` (historique — idempotent).
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
